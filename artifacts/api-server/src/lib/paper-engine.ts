import { db, tradesTable, botConfigTable, botStateTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { TradeSignal, Pair, AnalysisResult } from "@workspace/market-analysis";
import { getCurrentPrice } from "./price-feed.js";
import { logger } from "./logger.js";
import {
  recordTradeMemory,
  closeTradeMemory,
  recordMissedOpportunity,
  updateMissedOpportunityAftermath,
} from "./memory-engine.js";
import {
  logTradeOpened,
  logTradeClosed,
  logDailyHalt,
  logWeeklyHalt,
} from "./broker-engine.js";
import { getMtfAlignment } from "./mtf-engine.js";
import { computeTqi } from "./tqi-engine.js";
import { calcDynamicSize } from "./dynamic-sizing.js";
import { checkCorrelation } from "./correlation-engine.js";
import { generateExplanation } from "./explanation-engine.js";

let monitorInterval: ReturnType<typeof setInterval> | null = null;

const INITIAL_PAPER_BALANCE = 10_000;
const MAX_OPEN_TRADES = 3;
const MIN_SIGNAL_CONFIDENCE = 65;

function getPipSize(pair: string): number {
  return pair.includes("JPY") ? 0.01 : 0.0001;
}

function calcPnl(
  pair: string,
  direction: string,
  entryPrice: number,
  currentPrice: number,
  lotSize: number,
): number {
  const pipSize = getPipSize(pair);
  const priceDiff =
    direction === "buy" ? currentPrice - entryPrice : entryPrice - currentPrice;
  const pips = priceDiff / pipSize;
  return Math.round(pips * lotSize * 10 * 100) / 100;
}

function calcUnrealizedPips(
  pair: string,
  direction: string,
  entryPrice: number,
  currentPrice: number,
): number {
  const pipSize = getPipSize(pair);
  const priceDiff =
    direction === "buy" ? currentPrice - entryPrice : entryPrice - currentPrice;
  return Math.round((priceDiff / pipSize) * 10) / 10;
}

function calcLotSize(
  pair: string,
  entryPrice: number,
  stopLoss: number,
  balance: number,
  riskPct: number,
): number {
  const pipSize = getPipSize(pair);
  const slPips = Math.abs(entryPrice - stopLoss) / pipSize;
  if (slPips < 1) return 0.01;
  const riskAmount = balance * (riskPct / 100);
  const pipValuePerLot = 10;
  const lots = riskAmount / (slPips * pipValuePerLot);
  return Math.min(Math.max(Math.round(lots * 100) / 100, 0.01), 2.0);
}

function calcSession(): "london" | "newyork" | "asian" {
  const hour = new Date().getUTCHours();
  if (hour >= 7 && hour < 16) return "london";
  if (hour >= 12 && hour < 21) return "newyork";
  return "asian";
}

function applySlippage(
  pair: string,
  direction: string,
  price: number,
  isEntry: boolean,
): { price: number; pips: number } {
  const pipSize = getPipSize(pair);
  const maxSlippagePips = isEntry ? 2.0 : 1.0;
  const minSlippagePips = 0.3;
  const slippagePips =
    minSlippagePips + Math.random() * (maxSlippagePips - minSlippagePips);
  const slippagePrice = slippagePips * pipSize;

  const adjustedPrice =
    direction === "buy"
      ? price + slippagePrice
      : price - slippagePrice;

  return {
    price: Math.round(adjustedPrice * 1_000_000) / 1_000_000,
    pips: Math.round(slippagePips * 10) / 10,
  };
}

async function getPaperBalance(): Promise<number> {
  const closed = await db
    .select({ pnl: tradesTable.pnl })
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"));
  const realizedPnl = closed.reduce(
    (sum, t) => sum + parseFloat(t.pnl ?? "0"),
    0,
  );
  return INITIAL_PAPER_BALANCE + realizedPnl;
}

export async function executePaperSignals(
  signals: TradeSignal[],
  pair: Pair,
  analysisResult?: AnalysisResult,
): Promise<void> {
  if (signals.length === 0) return;

  const [state] = await db.select().from(botStateTable).limit(1);
  if (!state?.running || state.mode !== "paper") return;

  const [config] = await db.select().from(botConfigTable).limit(1);
  const riskPct = parseFloat(config?.riskPerTrade ?? "0.75");
  const maxDailyLossPct = parseFloat(config?.maxDailyLoss ?? "3");
  const maxWeeklyLossPct = parseFloat(config?.maxWeeklyLoss ?? "6");

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const weekStart = new Date();
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
  weekStart.setUTCHours(0, 0, 0, 0);

  const closedTrades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"));

  const todayPnl = closedTrades
    .filter(t => t.closedAt && new Date(t.closedAt) >= todayStart)
    .reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0);

  const weeklyPnl = closedTrades
    .filter(t => t.closedAt && new Date(t.closedAt) >= weekStart)
    .reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0);

  const paperBalance = INITIAL_PAPER_BALANCE + closedTrades.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0);

  if (todayPnl <= -(paperBalance * maxDailyLossPct) / 100) {
    logger.warn({ pair, todayPnl, maxDailyLossPct }, "Daily loss limit reached — skipping signal");
    await db.update(botStateTable).set({ haltedDueToRisk: true });
    logDailyHalt(pair, todayPnl, "paper").catch(() => {});
    return;
  }

  if (weeklyPnl <= -(paperBalance * maxWeeklyLossPct) / 100) {
    logger.warn({ pair, weeklyPnl, maxWeeklyLossPct }, "Weekly loss limit reached — skipping signal");
    await db.update(botStateTable).set({ haltedDueToRisk: true });
    logWeeklyHalt(pair, weeklyPnl, "paper").catch(() => {});
    return;
  }

  const openTrades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "open"));

  // Select best signal early so we can record missed opportunities at each rejection
  const signal = signals.reduce(
    (best, s) => (s.confidence > best.confidence ? s : best),
    signals[0]!,
  );
  const session = calcSession();

  if (openTrades.length >= MAX_OPEN_TRADES) {
    recordMissedOpportunity(signal, "max_open_trades", session, null).catch(() => {});
    return;
  }

  const pairAlreadyOpen = openTrades.some(t => t.pair === pair);
  if (pairAlreadyOpen) {
    recordMissedOpportunity(signal, "pair_already_open", session, null).catch(() => {});
    return;
  }

  if (signal.confidence < MIN_SIGNAL_CONFIDENCE) {
    recordMissedOpportunity(signal, "below_confidence", session, null).catch(() => {});
    return;
  }

  // ── V2 Gate 1: Multi-Timeframe Alignment ──────────────────────────────────
  const mtfAlignment = getMtfAlignment(pair, signal.direction);
  if (mtfAlignment.alignedCount < 2) {
    logger.info({ pair, mtfScore: mtfAlignment.score, alignedCount: mtfAlignment.alignedCount }, "V2 MTF gate: insufficient alignment — skipping signal");
    recordMissedOpportunity(signal, "mtf_insufficient", session, null).catch(() => {});
    return;
  }

  // ── V2 Gate 2: Trade Quality Index ────────────────────────────────────────
  const analysis = analysisResult;
  let tqiResult = null;
  if (analysis) {
    tqiResult = computeTqi(signal, analysis, mtfAlignment.score);
    if (!tqiResult.tradeable) {
      logger.info({ pair, tqi: tqiResult.tqi, grade: tqiResult.grade }, "V2 TQI gate: quality below threshold — skipping signal");
      recordMissedOpportunity(signal, "tqi_below_threshold", session, null).catch(() => {});
      return;
    }
  }

  // ── V2 Gate 3: Correlation Check ──────────────────────────────────────────
  const corrCheck = checkCorrelation(
    pair,
    signal.direction,
    openTrades.map(t => ({ pair: t.pair, direction: t.direction as "buy" | "sell" })),
  );
  if (!corrCheck.allowed) {
    logger.info({ pair, reason: corrCheck.reason }, "V2 correlation gate: overexposure — skipping signal");
    recordMissedOpportunity(signal, "correlation_blocked", session, null).catch(() => {});
    return;
  }

  const priceEntry = getCurrentPrice(pair);
  const entryMid = priceEntry?.mid ?? signal.entryPrice;

  const { price: actualEntry, pips: entrySlippagePips } = applySlippage(
    pair,
    signal.direction,
    entryMid,
    true,
  );

  // ── V2: Dynamic Position Sizing ───────────────────────────────────────────
  const closedForDD = closedTrades;
  const peakBalance = closedForDD.reduce((max, t) => {
    const bal = INITIAL_PAPER_BALANCE + closedForDD
      .filter(x => x.closedAt != null && x.closedAt <= t.closedAt!)
      .reduce((s, x) => s + parseFloat(x.pnl ?? "0"), 0);
    return Math.max(max, bal);
  }, INITIAL_PAPER_BALANCE);
  const currentDrawdownPct = peakBalance > 0 ? Math.max(0, ((peakBalance - paperBalance) / peakBalance) * 100) : 0;

  const sizingResult = analysis
    ? calcDynamicSize({
        signal,
        analysis,
        balance: paperBalance,
        baseRiskPct: riskPct,
        maxRiskPct: riskPct * 2,
        currentDrawdownPct,
      })
    : null;

  const lotSize = sizingResult
    ? sizingResult.lotSize
    : calcLotSize(pair, actualEntry, signal.stopLoss, paperBalance, riskPct);

  const dynamicRiskPct = sizingResult?.adjustedRiskPct ?? riskPct;

  // ── Generate trade explanation ─────────────────────────────────────────────
  let explanation = null;
  if (analysis && tqiResult && sizingResult) {
    try {
      explanation = generateExplanation(signal, analysis, mtfAlignment, tqiResult, sizingResult);
    } catch (err) {
      logger.warn({ err }, "Failed to generate trade explanation");
    }
  }

  const [inserted] = await db.insert(tradesTable).values({
    pair,
    direction: signal.direction,
    entryPrice: String(actualEntry),
    stopLoss: String(signal.stopLoss),
    takeProfit: String(signal.takeProfit),
    currentPrice: String(entryMid),
    lotSize: String(lotSize),
    status: "open",
    session,
    setupScore: String(signal.confidence),
    amdPattern: signal.amdPhase,
    zoneType: signal.zoneType,
    zoneStrength: String(signal.zoneStrength),
    liquiditySweep: false,
    fibLevel: String(signal.fibLevel),
    riskRewardRatio: String(Math.round(signal.riskReward * 100) / 100),
    slippagePips: String(entrySlippagePips),
    regime: analysis?.regime.regime ?? null,
    tqi: tqiResult ? String(tqiResult.tqi) : null,
    tqiGrade: tqiResult?.grade ?? null,
    mtfAligned: mtfAlignment.aligned,
    mtfScore: String(mtfAlignment.score),
    dynamicRiskPct: String(dynamicRiskPct),
    explanation: explanation ?? null,
  }).returning({ id: tradesTable.id });

  if (inserted?.id) {
    recordTradeMemory(inserted.id, signal, null, null, session).catch(() => {});
    logTradeOpened({
      tradeId: inserted.id,
      pair,
      direction: signal.direction,
      price: actualEntry,
      slippagePips: entrySlippagePips,
      mode: "paper",
    }).catch(() => {});
  }

  logger.info(
    {
      pair,
      direction: signal.direction,
      entry: actualEntry,
      sl: signal.stopLoss,
      tp: signal.takeProfit,
      lots: lotSize,
      slippage: entrySlippagePips,
      confidence: signal.confidence,
    },
    "Paper trade opened",
  );
}

export async function monitorOpenTrades(): Promise<void> {
  const openTrades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "open"));

  if (openTrades.length === 0) return;

  for (const trade of openTrades) {
    const pair = trade.pair as Pair;
    const priceEntry = getCurrentPrice(pair);
    if (!priceEntry) continue;

    const entryPrice = parseFloat(trade.entryPrice);
    const stopLoss = parseFloat(trade.stopLoss);
    const takeProfit = parseFloat(trade.takeProfit);
    const lotSize = parseFloat(trade.lotSize);

    const executionPrice =
      trade.direction === "buy" ? priceEntry.bid : priceEntry.ask;
    const midPrice = priceEntry.mid;

    const slHit =
      trade.direction === "buy"
        ? executionPrice <= stopLoss
        : executionPrice >= stopLoss;
    const tpHit =
      trade.direction === "buy"
        ? executionPrice >= takeProfit
        : executionPrice <= takeProfit;

    if (slHit || tpHit) {
      const targetPrice = slHit ? stopLoss : takeProfit;
      const { price: closePrice, pips: exitSlippagePips } = applySlippage(
        pair,
        trade.direction,
        targetPrice,
        false,
      );

      const closedPnl = calcPnl(
        trade.pair,
        trade.direction,
        entryPrice,
        closePrice,
        lotSize,
      );
      const pnlPercent = (closedPnl / INITIAL_PAPER_BALANCE) * 100;

      await db
        .update(tradesTable)
        .set({
          status: "closed",
          closedPrice: String(closePrice),
          currentPrice: String(closePrice),
          pnl: String(Math.round(closedPnl * 100) / 100),
          pnlPercent: String(Math.round(pnlPercent * 1000) / 1000),
          closedAt: new Date(),
          closeReason: slHit ? "sl_hit" : "tp_hit",
          exitSlippagePips: String(exitSlippagePips),
        })
        .where(eq(tradesTable.id, trade.id));

      const closeReason = slHit ? "sl_hit" : "tp_hit";
      const outcome: "win" | "loss" = closedPnl > 0 ? "win" : "loss";
      const rrActual = Math.abs(closePrice - entryPrice) / Math.abs(entryPrice - stopLoss);
      closeTradeMemory(
        trade.id,
        outcome,
        Math.round(closedPnl * 100) / 100,
        Math.round(pnlPercent * 1000) / 1000,
        closeReason,
        Math.round(rrActual * 100) / 100,
        exitSlippagePips,
        trade.openedAt ?? new Date(),
        parseFloat(trade.slippagePips ?? "0"),
      ).catch(() => {});

      logTradeClosed({
        tradeId: trade.id,
        pair: trade.pair,
        direction: trade.direction,
        price: closePrice,
        slippagePips: exitSlippagePips,
        pnl: Math.round(closedPnl * 100) / 100,
        reason: closeReason,
        mode: "paper",
      }).catch(() => {});

      logger.info(
        {
          id: trade.id,
          pair: trade.pair,
          direction: trade.direction,
          reason: closeReason,
          pnl: closedPnl,
          exitSlippage: exitSlippagePips,
        },
        "Paper trade closed",
      );
    } else {
      const unrealizedPnl = calcPnl(
        trade.pair,
        trade.direction,
        entryPrice,
        midPrice,
        lotSize,
      );

      await db
        .update(tradesTable)
        .set({
          currentPrice: String(midPrice),
          pnl: String(Math.round(unrealizedPnl * 100) / 100),
        })
        .where(eq(tradesTable.id, trade.id));
    }
  }
}

export async function getOpenPositions(): Promise<
  Array<{
    id: number;
    pair: string;
    direction: string;
    entryPrice: number;
    currentPrice: number | null;
    stopLoss: number;
    takeProfit: number;
    lotSize: number;
    unrealizedPnl: number;
    unrealizedPips: number;
    distanceToSL: number;
    distanceToTP: number;
    slippagePips: number | null;
    riskRewardRatio: number;
    amdPattern: string;
    setupScore: number;
    session: string;
    openedAt: string;
    priceSource: "live" | "fallback" | "stale";
  }>
> {
  const openTrades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "open"));

  return openTrades.map(trade => {
    const pair = trade.pair as Pair;
    const priceEntry = getCurrentPrice(pair);
    const entryPrice = parseFloat(trade.entryPrice);
    const stopLoss = parseFloat(trade.stopLoss);
    const takeProfit = parseFloat(trade.takeProfit);
    const lotSize = parseFloat(trade.lotSize);
    const pipSize = getPipSize(pair);

    const currentPrice = priceEntry?.mid ?? (trade.currentPrice ? parseFloat(trade.currentPrice) : entryPrice);
    const unrealizedPnl = calcPnl(pair, trade.direction, entryPrice, currentPrice, lotSize);
    const unrealizedPips = calcUnrealizedPips(pair, trade.direction, entryPrice, currentPrice);

    const distanceToSL = Math.abs(currentPrice - stopLoss) / pipSize;
    const distanceToTP = Math.abs(currentPrice - takeProfit) / pipSize;

    return {
      id: trade.id,
      pair: trade.pair,
      direction: trade.direction,
      entryPrice,
      currentPrice,
      stopLoss,
      takeProfit,
      lotSize,
      unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
      unrealizedPips: Math.round(unrealizedPips * 10) / 10,
      distanceToSL: Math.round(distanceToSL * 10) / 10,
      distanceToTP: Math.round(distanceToTP * 10) / 10,
      slippagePips: trade.slippagePips ? parseFloat(trade.slippagePips) : null,
      riskRewardRatio: parseFloat(trade.riskRewardRatio ?? "0"),
      amdPattern: trade.amdPattern ?? "unknown",
      setupScore: parseFloat(trade.setupScore ?? "0"),
      session: trade.session,
      openedAt: trade.openedAt?.toISOString() ?? new Date().toISOString(),
      priceSource: priceEntry ? priceEntry.source : "stale",
    };
  });
}

export async function getPaperPerformance() {
  const allTrades = await db.select().from(tradesTable);
  const closed = allTrades.filter(t => t.status === "closed");
  const open = allTrades.filter(t => t.status === "open");

  const realizedPnl = closed.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0);
  const paperBalance = INITIAL_PAPER_BALANCE + realizedPnl;

  const winners = closed.filter(t => parseFloat(t.pnl ?? "0") > 0);
  const losers = closed.filter(t => parseFloat(t.pnl ?? "0") <= 0);

  const winRate = closed.length > 0 ? (winners.length / closed.length) * 100 : 0;
  const avgWin = winners.length > 0
    ? winners.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0) / winners.length
    : 0;
  const avgLoss = losers.length > 0
    ? losers.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0) / losers.length
    : 0;

  const grossProfit = winners.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

  const allSlippages = [
    ...allTrades.filter(t => t.slippagePips).map(t => parseFloat(t.slippagePips!)),
    ...allTrades.filter(t => t.exitSlippagePips).map(t => parseFloat(t.exitSlippagePips!)),
  ];
  const avgSlippage = allSlippages.length > 0
    ? allSlippages.reduce((s, v) => s + v, 0) / allSlippages.length
    : 0;

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const dailyPnl = closed
    .filter(t => t.closedAt && new Date(t.closedAt) >= todayStart)
    .reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0);

  let unrealizedPnl = 0;
  for (const trade of open) {
    const pair = trade.pair as Pair;
    const priceEntry = getCurrentPrice(pair);
    if (priceEntry) {
      unrealizedPnl += calcPnl(
        trade.pair,
        trade.direction,
        parseFloat(trade.entryPrice),
        priceEntry.mid,
        parseFloat(trade.lotSize),
      );
    }
  }

  return {
    balance: Math.round(paperBalance * 100) / 100,
    startBalance: INITIAL_PAPER_BALANCE,
    totalReturn: Math.round(((paperBalance - INITIAL_PAPER_BALANCE) / INITIAL_PAPER_BALANCE) * 10000) / 100,
    totalTrades: closed.length,
    openTrades: open.length,
    winningTrades: winners.length,
    losingTrades: losers.length,
    winRate: Math.round(winRate * 10) / 10,
    totalPnl: Math.round(realizedPnl * 100) / 100,
    unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
    dailyPnl: Math.round(dailyPnl * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    avgSlippagePips: Math.round(avgSlippage * 10) / 10,
  };
}

export function startPaperMonitor(intervalSeconds = 30): void {
  if (monitorInterval) return;
  monitorOpenTrades().catch(err =>
    logger.error({ err }, "Initial paper monitor run failed"),
  );
  monitorInterval = setInterval(() => {
    monitorOpenTrades().catch(err =>
      logger.error({ err }, "Paper monitor tick failed"),
    );
  }, intervalSeconds * 1000);
  logger.info({ intervalSeconds }, "Paper trade monitor started");
}

export function stopPaperMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    logger.info("Paper trade monitor stopped");
  }
}
