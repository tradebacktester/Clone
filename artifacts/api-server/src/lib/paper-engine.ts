import { db, tradesTable, botConfigTable, botStateTable, signalLogTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
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
  captureSetupDetected,
  captureSkippedSetup,
  captureTradeOpened,
  captureTradeClose,
  updateExcursionTracker,
  updateSkippedSetupAftermath,
  type SkipContext,
} from "./memory-capture-engine.js";
import { autoPopulateContextFromTrade } from "./context-memory.js";
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

interface PnlSnapshot {
  totalPnl: number;
  todayPnl: number;
  weeklyPnl: number;
  balance: number;
  peakBalance: number;
}

async function getPaperBalance(): Promise<number> {
  const result = await db
    .select({ totalPnl: sql<string>`COALESCE(SUM(pnl), 0)` })
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"));
  const totalPnl = parseFloat(result[0]?.totalPnl ?? "0");
  return INITIAL_PAPER_BALANCE + totalPnl;
}

async function getPnlSnapshot(): Promise<PnlSnapshot> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const weekStart = new Date();
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
  weekStart.setUTCHours(0, 0, 0, 0);

  const [agg] = await db
    .select({
      totalPnl:  sql<string>`COALESCE(SUM(pnl), 0)`,
      todayPnl:  sql<string>`COALESCE(SUM(pnl) FILTER (WHERE closed_at >= ${todayStart.toISOString()}), 0)`,
      weeklyPnl: sql<string>`COALESCE(SUM(pnl) FILTER (WHERE closed_at >= ${weekStart.toISOString()}), 0)`,
    })
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"));

  const totalPnl  = parseFloat(agg?.totalPnl  ?? "0");
  const todayPnl  = parseFloat(agg?.todayPnl  ?? "0");
  const weeklyPnl = parseFloat(agg?.weeklyPnl ?? "0");
  const balance   = INITIAL_PAPER_BALANCE + totalPnl;

  const peakBalance = await computePeakBalance();

  return { totalPnl, todayPnl, weeklyPnl, balance, peakBalance };
}

async function computePeakBalance(): Promise<number> {
  const rows = await db
    .select({ pnl: tradesTable.pnl, closedAt: tradesTable.closedAt })
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"))
    .orderBy(tradesTable.closedAt);

  let running = INITIAL_PAPER_BALANCE;
  let peak = INITIAL_PAPER_BALANCE;

  for (const row of rows) {
    running += parseFloat(row.pnl ?? "0");
    if (running > peak) peak = running;
  }

  return peak;
}

async function logSignal(
  signal: TradeSignal,
  pair: Pair,
  session: string,
  executed: boolean,
  tradeId: number | null,
  skipReason: string | null,
  regime: string | null,
  newsStatus: string,
): Promise<void> {
  try {
    await db.insert(signalLogTable).values({
      pair,
      direction: signal.direction,
      confidence: String(signal.confidence),
      amdPhase: signal.amdPhase,
      zoneType: signal.zoneType,
      zoneStrength: String(signal.zoneStrength),
      regime: regime ?? null,
      newsStatus,
      session,
      executed,
      tradeId: tradeId != null ? String(tradeId) : null,
      skipReason,
      entryPrice: String(signal.entryPrice),
      stopLoss: String(signal.stopLoss),
      takeProfit: String(signal.takeProfit),
      riskReward: String(Math.round(signal.riskReward * 100) / 100),
    });
  } catch (err) {
    logger.warn({ err }, "Signal log insert failed");
  }
}

export async function executePaperSignals(
  signals: TradeSignal[],
  pair: Pair,
  analysisResult?: AnalysisResult,
  newsStatus = "clear",
  snapshotId: string | null = null,
): Promise<void> {
  if (signals.length === 0) return;

  const [state] = await db.select().from(botStateTable).limit(1);
  if (!state?.running || state.mode !== "paper") return;

  const [config] = await db.select().from(botConfigTable).limit(1);
  const riskPct = parseFloat(config?.riskPerTrade ?? "0.75");
  const maxDailyLossPct = parseFloat(config?.maxDailyLoss ?? "3");
  const maxWeeklyLossPct = parseFloat(config?.maxWeeklyLoss ?? "6");

  const { totalPnl, todayPnl, weeklyPnl, balance: paperBalance, peakBalance } = await getPnlSnapshot();

  // Select the highest-confidence signal as the candidate
  const signal = signals.reduce(
    (best, s) => (s.confidence > best.confidence ? s : best),
    signals[0]!,
  );
  const session = calcSession();
  const regime  = analysisResult?.regime.regime ?? null;

  // ── Pre-gate: capture setup detection in episodic memory ──────────────────
  // This creates the setup record before any gates run; it will be marked
  // accepted if a trade opens, or skipped if any gate rejects.
  const setupId = analysisResult
    ? await captureSetupDetected(signal, analysisResult, session, snapshotId, newsStatus)
    : null;

  const skipCtx: SkipContext = {
    priceAtSkip: analysisResult ? undefined : undefined,
    additionalMeta: { newsStatus, regime },
  };

  if (todayPnl <= -(paperBalance * maxDailyLossPct) / 100) {
    logger.warn({ pair, todayPnl, maxDailyLossPct }, "Daily loss limit reached — skipping signal");
    await db.update(botStateTable).set({ haltedDueToRisk: true });
    logDailyHalt(pair, todayPnl, "paper").catch(() => {});
    recordMissedOpportunity(signal, "daily_loss_limit", session, null).catch(() => {});
    captureSkippedSetup(signal, "daily_loss_limit", "daily_loss_limit", session, regime, snapshotId, setupId, skipCtx).catch(() => {});
    logSignal(signal, pair, session, false, null, "daily_loss_limit", regime, newsStatus).catch(() => {});
    return;
  }

  if (weeklyPnl <= -(paperBalance * maxWeeklyLossPct) / 100) {
    logger.warn({ pair, weeklyPnl, maxWeeklyLossPct }, "Weekly loss limit reached — skipping signal");
    await db.update(botStateTable).set({ haltedDueToRisk: true });
    logWeeklyHalt(pair, weeklyPnl, "paper").catch(() => {});
    recordMissedOpportunity(signal, "weekly_loss_limit", session, null).catch(() => {});
    captureSkippedSetup(signal, "weekly_loss_limit", "weekly_loss_limit", session, regime, snapshotId, setupId, skipCtx).catch(() => {});
    logSignal(signal, pair, session, false, null, "weekly_loss_limit", regime, newsStatus).catch(() => {});
    return;
  }

  const openTrades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "open"));

  if (openTrades.length >= MAX_OPEN_TRADES) {
    recordMissedOpportunity(signal, "max_open_trades", session, null).catch(() => {});
    captureSkippedSetup(signal, "max_open_trades", "max_open_trades", session, regime, snapshotId, setupId, skipCtx).catch(() => {});
    logSignal(signal, pair, session, false, null, "max_open_trades", regime, newsStatus).catch(() => {});
    return;
  }

  const pairAlreadyOpen = openTrades.some(t => t.pair === pair);
  if (pairAlreadyOpen) {
    recordMissedOpportunity(signal, "pair_already_open", session, null).catch(() => {});
    captureSkippedSetup(signal, "pair_already_open", "pair_already_open", session, regime, snapshotId, setupId, skipCtx).catch(() => {});
    logSignal(signal, pair, session, false, null, "pair_already_open", regime, newsStatus).catch(() => {});
    return;
  }

  if (signal.confidence < MIN_SIGNAL_CONFIDENCE) {
    recordMissedOpportunity(signal, "below_confidence", session, null).catch(() => {});
    captureSkippedSetup(signal, "below_confidence", "confidence_gate", session, regime, snapshotId, setupId, skipCtx).catch(() => {});
    logSignal(signal, pair, session, false, null, "below_confidence", regime, newsStatus).catch(() => {});
    return;
  }

  const priceEntry = getCurrentPrice(pair);

  if (priceEntry?.source === "fallback") {
    logger.warn({ pair }, "Price source is fallback — refusing to open new position");
    recordMissedOpportunity(signal, "stale_price", session, null).catch(() => {});
    captureSkippedSetup(signal, "stale_price", "price_feed_gate", session, regime, snapshotId, setupId, skipCtx).catch(() => {});
    logSignal(signal, pair, session, false, null, "stale_price", regime, newsStatus).catch(() => {});
    return;
  }

  // ── V2 Gate 1: Multi-Timeframe Alignment ──────────────────────────────────
  const mtfAlignment = getMtfAlignment(pair, signal.direction);
  if (mtfAlignment.alignedCount < 2) {
    logger.info({ pair, mtfScore: mtfAlignment.score, alignedCount: mtfAlignment.alignedCount }, "V2 MTF gate: insufficient alignment — skipping signal");
    recordMissedOpportunity(signal, "mtf_insufficient", session, null).catch(() => {});
    captureSkippedSetup(signal, "mtf_insufficient", "mtf_gate", session, regime, snapshotId, setupId, {
      ...skipCtx,
      additionalMeta: { ...skipCtx.additionalMeta, mtfScore: mtfAlignment.score, alignedCount: mtfAlignment.alignedCount },
    }).catch(() => {});
    logSignal(signal, pair, session, false, null, "mtf_insufficient", regime, newsStatus).catch(() => {});
    return;
  }

  // ── V2 Gate 2: Trade Quality Index — MANDATORY ────────────────────────────
  const analysis = analysisResult;
  if (!analysis) {
    logger.info({ pair }, "V2 TQI gate: no analysis result available — hard rejection");
    recordMissedOpportunity(signal, "tqi_below_threshold", session, null).catch(() => {});
    captureSkippedSetup(signal, "no_analysis_result", "tqi_gate", session, regime, snapshotId, setupId, skipCtx).catch(() => {});
    logSignal(signal, pair, session, false, null, "no_analysis", regime, newsStatus).catch(() => {});
    return;
  }

  const tqiResult = computeTqi(signal, analysis, mtfAlignment.score);
  if (!tqiResult.tradeable) {
    logger.info({ pair, tqi: tqiResult.tqi, grade: tqiResult.grade }, "V2 TQI gate: quality below threshold — skipping signal");
    recordMissedOpportunity(signal, "tqi_below_threshold", session, null).catch(() => {});
    captureSkippedSetup(signal, "tqi_below_threshold", "tqi_gate", session, regime, snapshotId, setupId, {
      ...skipCtx,
      additionalMeta: { ...skipCtx.additionalMeta, tqi: tqiResult.tqi, grade: tqiResult.grade },
    }).catch(() => {});
    logSignal(signal, pair, session, false, null, "tqi_below_threshold", regime, newsStatus).catch(() => {});
    return;
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
    captureSkippedSetup(signal, "correlation_blocked", "correlation_gate", session, regime, snapshotId, setupId, {
      ...skipCtx,
      additionalMeta: { ...skipCtx.additionalMeta, correlationReason: corrCheck.reason },
    }).catch(() => {});
    logSignal(signal, pair, session, false, null, "correlation_blocked", regime, newsStatus).catch(() => {});
    return;
  }

  const entryMid = priceEntry?.mid ?? signal.entryPrice;

  const { price: actualEntry, pips: entrySlippagePips } = applySlippage(
    pair,
    signal.direction,
    entryMid,
    true,
  );

  // ── V2: Dynamic Position Sizing — O(n log n) peak balance ─────────────────
  const currentDrawdownPct = peakBalance > 0
    ? Math.max(0, ((peakBalance - paperBalance) / peakBalance) * 100)
    : 0;

  const sizingResult = calcDynamicSize({
    signal,
    analysis,
    balance: paperBalance,
    baseRiskPct: riskPct,
    maxRiskPct: riskPct * 2,
    currentDrawdownPct,
  });

  const lotSize = sizingResult.lotSize;
  const dynamicRiskPct = sizingResult.adjustedRiskPct;

  // ── Generate trade explanation ─────────────────────────────────────────────
  let explanation = null;
  if (tqiResult && sizingResult) {
    try {
      explanation = generateExplanation(signal, analysis, mtfAlignment, tqiResult, sizingResult);
    } catch (err) {
      logger.warn({ err }, "Failed to generate trade explanation");
    }
  }

  const spreadPips = getPipSize(pair) > 0.001 ? 1.0 : 1.2;

  const ruleEvaluation = {
    confidenceGate: { passed: signal.confidence >= MIN_SIGNAL_CONFIDENCE, value: signal.confidence, threshold: MIN_SIGNAL_CONFIDENCE },
    mtfGate: { passed: mtfAlignment.aligned, score: mtfAlignment.score, alignedCount: mtfAlignment.alignedCount },
    tqiGate: { passed: tqiResult.tradeable, tqi: tqiResult.tqi, grade: tqiResult.grade },
    correlationGate: { passed: corrCheck.allowed, reason: corrCheck.reason },
    newsSafe: { passed: newsStatus === "clear" || newsStatus === "low", status: newsStatus },
  };

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
    spreadPips: String(spreadPips),
    newsStatus,
    regime: analysis?.regime.regime ?? null,
    tqi: tqiResult ? String(tqiResult.tqi) : null,
    tqiGrade: tqiResult?.grade ?? null,
    mtfAligned: mtfAlignment.aligned,
    mtfScore: String(mtfAlignment.score),
    dynamicRiskPct: String(dynamicRiskPct),
    explanation: explanation ?? null,
    ruleEvaluation,
    screenshots: [],
  }).returning({ id: tradesTable.id });

  if (inserted?.id) {
    // Legacy memory engine record
    recordTradeMemory(inserted.id, signal, null, null, session).catch(() => {});

    // V2 episodic memory — trade opened event + link to setup
    captureTradeOpened(
      {
        tradeId:       inserted.id,
        pair,
        direction:     signal.direction,
        entryPrice:    actualEntry,
        stopLoss:      signal.stopLoss,
        takeProfit:    signal.takeProfit,
        lotSize,
        riskPct:       dynamicRiskPct,
        slippagePips:  entrySlippagePips,
        spreadPips,
        session,
        regime,
        newsStatus,
        ruleEvaluation,
      },
      snapshotId,
      setupId,
    ).catch(() => {});

    // Context memory — auto-populate market + strategy context for this trade
    autoPopulateContextFromTrade(
      inserted.id,
      setupId,
      snapshotId,
      {
        pair,
        direction:      signal.direction,
        session,
        regime,
        newsStatus,
        spreadPips,
        ruleEvaluation: ruleEvaluation as Record<string, unknown>,
        tqi:            tqiResult?.tqi,
        mtfAligned:     mtfAlignment.aligned,
        mtfScore:       mtfAlignment.score,
      },
    ).catch(() => {});

    logTradeOpened({
      tradeId: inserted.id,
      pair,
      direction: signal.direction,
      price: actualEntry,
      slippagePips: entrySlippagePips,
      mode: "paper",
    }).catch(() => {});
    logSignal(signal, pair, session, true, inserted.id, null, regime, newsStatus).catch(() => {});
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
      setupId,
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

      // Legacy memory engine
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

      // V2 episodic memory — trade close event with MFE/MAE
      captureTradeClose({
        tradeId:      trade.id,
        pair:         trade.pair,
        direction:    trade.direction,
        entryPrice,
        closePrice,
        stopLoss,
        takeProfit,
        lotSize,
        pnl:          Math.round(closedPnl * 100) / 100,
        pnlPercent:   Math.round(pnlPercent * 1000) / 1000,
        closeReason,
        exitSlippage: exitSlippagePips,
        openedAt:     trade.openedAt ?? new Date(),
      }).catch(() => {});

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

      // Update excursion tracker for MFE/MAE calculation (non-blocking, in-memory)
      updateExcursionTracker(trade.id, midPrice, entryPrice, trade.direction, trade.pair);

      await db
        .update(tradesTable)
        .set({
          currentPrice: String(midPrice),
          pnl: String(Math.round(unrealizedPnl * 100) / 100),
        })
        .where(eq(tradesTable.id, trade.id));
    }
  }

  // Periodically update aftermath data for skipped setups (non-blocking)
  updateSkippedSetupAftermath(
    (p) => { const price = getCurrentPrice(p as Pair); return price ? { mid: price.mid } : null; },
  ).catch(() => {});
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
  const [agg] = await db
    .select({
      totalPnl:    sql<string>`COALESCE(SUM(pnl) FILTER (WHERE status = 'closed'), 0)`,
      closedCount: sql<string>`COUNT(*) FILTER (WHERE status = 'closed')`,
      openCount:   sql<string>`COUNT(*) FILTER (WHERE status = 'open')`,
      winCount:    sql<string>`COUNT(*) FILTER (WHERE status = 'closed' AND pnl > 0)`,
      lossCount:   sql<string>`COUNT(*) FILTER (WHERE status = 'closed' AND pnl <= 0)`,
      grossProfit: sql<string>`COALESCE(SUM(pnl) FILTER (WHERE status = 'closed' AND pnl > 0), 0)`,
      grossLoss:   sql<string>`COALESCE(ABS(SUM(pnl) FILTER (WHERE status = 'closed' AND pnl < 0)), 0)`,
      avgWin:      sql<string>`COALESCE(AVG(pnl) FILTER (WHERE status = 'closed' AND pnl > 0), 0)`,
      avgLoss:     sql<string>`COALESCE(AVG(pnl) FILTER (WHERE status = 'closed' AND pnl < 0), 0)`,
      avgEntrySlippage: sql<string>`COALESCE(AVG(slippage_pips), 0)`,
      avgExitSlippage:  sql<string>`COALESCE(AVG(exit_slippage_pips), 0)`,
      todayPnl: sql<string>`COALESCE(SUM(pnl) FILTER (WHERE status = 'closed' AND closed_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')), 0)`,
    })
    .from(tradesTable);

  const totalPnl    = parseFloat(agg?.totalPnl    ?? "0");
  const closedCount = parseInt(agg?.closedCount   ?? "0", 10);
  const openCount   = parseInt(agg?.openCount     ?? "0", 10);
  const winCount    = parseInt(agg?.winCount      ?? "0", 10);
  const lossCount   = parseInt(agg?.lossCount     ?? "0", 10);
  const grossProfit = parseFloat(agg?.grossProfit ?? "0");
  const grossLoss   = parseFloat(agg?.grossLoss   ?? "0");
  const avgWin      = parseFloat(agg?.avgWin      ?? "0");
  const avgLoss     = parseFloat(agg?.avgLoss     ?? "0");
  const todayPnl    = parseFloat(agg?.todayPnl    ?? "0");
  const avgEntrySlip = parseFloat(agg?.avgEntrySlippage ?? "0");
  const avgExitSlip  = parseFloat(agg?.avgExitSlippage  ?? "0");

  const paperBalance  = INITIAL_PAPER_BALANCE + totalPnl;
  const winRate       = closedCount > 0 ? (winCount / closedCount) * 100 : 0;
  const profitFactor  = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
  const avgSlippage   = (avgEntrySlip + avgExitSlip) / 2;

  const open = await db
    .select({ pair: tradesTable.pair, direction: tradesTable.direction, entryPrice: tradesTable.entryPrice, lotSize: tradesTable.lotSize })
    .from(tradesTable)
    .where(eq(tradesTable.status, "open"));

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
    totalTrades: closedCount,
    openTrades: openCount,
    winningTrades: winCount,
    losingTrades: lossCount,
    winRate: Math.round(winRate * 10) / 10,
    totalPnl: Math.round(totalPnl * 100) / 100,
    unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
    dailyPnl: Math.round(todayPnl * 100) / 100,
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
