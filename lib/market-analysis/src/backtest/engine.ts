import type {
  Candle,
  BacktestTrade,
  BacktestResult,
  Pair,
  Timeframe,
} from "../types.js";
import { fetchCandles, generateSyntheticCandlesForDateRange } from "../data/fetcher.js";
import { detectSwings, calcATR } from "../analysis/swings.js";
import { calcFibonacci } from "../analysis/fibonacci.js";
import { detectZones, isPriceInZone } from "../analysis/zones.js";
import { detectLiquidityLevels, detectLiquidityGrabs, detectSweeps } from "../analysis/liquidity.js";
import { detectAMD } from "../analysis/amd.js";
import { generateSignals } from "../signals/generator.js";
import { detectRegimeDetailed } from "../market_regime/regime_detector.js";
import { calcFullStats } from "./stats.js";

interface BacktestConfig {
  pair: Pair;
  startDate: string;
  endDate: string;
  initialBalance: number;
  riskPerTrade: number;
  sessions?: string[];
  enableNewsFilter?: boolean;
  enableRL?: boolean;
  timeframe?: Timeframe;
  contextTimeframe?: Timeframe;
}

const PIP_VALUES: Record<Pair, number> = {
  EURUSD: 10,
  GBPUSD: 10,
  USDJPY: 6.7,
};

const PIP_SIZES: Record<Pair, number> = {
  EURUSD: 0.0001,
  GBPUSD: 0.0001,
  USDJPY: 0.01,
};

function calcLotSize(
  balance: number,
  riskPct: number,
  entryPrice: number,
  stopLoss: number,
  pair: Pair,
): number {
  const riskAmount = balance * (riskPct / 100);
  const pipSize = PIP_SIZES[pair];
  const pipValue = PIP_VALUES[pair];
  const slPips = Math.abs(entryPrice - stopLoss) / pipSize;
  if (slPips <= 0) return 0.01;
  const lotSize = riskAmount / (slPips * pipValue);
  return Math.max(0.01, Math.min(10, Math.round(lotSize * 100) / 100));
}

function calcPnl(
  direction: "buy" | "sell",
  entryPrice: number,
  closedPrice: number,
  lotSize: number,
  pair: Pair,
): number {
  const pipSize = PIP_SIZES[pair];
  const pipValue = PIP_VALUES[pair];
  const pips =
    direction === "buy"
      ? (closedPrice - entryPrice) / pipSize
      : (entryPrice - closedPrice) / pipSize;
  return pips * pipValue * (lotSize / 0.1);
}

function calcMaxDrawdown(equityCurve: number[]): number {
  let peak = equityCurve[0] ?? 0;
  let maxDD = 0;
  for (const val of equityCurve) {
    if (val > peak) peak = val;
    const dd = peak > 0 ? ((peak - val) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function calcSharpeRatio(returns: number[]): number {
  if (returns.length < 2) return 0;
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - avg, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return (avg / stdDev) * Math.sqrt(252);
}

function downsampleCandles(candles: Candle[], factor: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i += factor) {
    const slice = candles.slice(i, i + factor);
    if (slice.length === 0) continue;
    out.push({
      time: slice[0]!.time,
      open: slice[0]!.open,
      high: Math.max(...slice.map(c => c.high)),
      low: Math.min(...slice.map(c => c.low)),
      close: slice[slice.length - 1]!.close,
      volume: slice.reduce((s, c) => s + c.volume, 0),
    });
  }
  return out;
}

export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  const pair = config.pair as Pair;
  const execTf: Timeframe = config.timeframe ?? "4h";
  const ctxTf: Timeframe = config.contextTimeframe ?? "4h";

  const ctxFactor: Record<string, number> = {
    "15m->4h": 16, "15m->1d": 96,
    "1h->4h": 4,  "1h->1d": 24,
    "4h->1d": 6,  "4h->4h": 1,
    "1d->1d": 1,
  };

  let execCandles: Candle[];
  try {
    const fetched = await fetchCandles(pair, execTf);
    const start = new Date(config.startDate).getTime();
    const end = new Date(config.endDate).getTime();
    execCandles = fetched.filter(c => c.time.getTime() >= start && c.time.getTime() <= end);
    if (execCandles.length < 50) throw new Error("Insufficient candles in range");
  } catch {
    execCandles = generateSyntheticCandlesForDateRange(pair, config.startDate, config.endDate, execTf);
  }

  if (execCandles.length < 50) {
    execCandles = generateSyntheticCandlesForDateRange(pair, config.startDate, config.endDate, execTf);
  }

  const downsampleFactor = ctxFactor[`${execTf}->${ctxTf}`] ?? 1;
  const ctxCandles = downsampleFactor > 1 ? downsampleCandles(execCandles, downsampleFactor) : execCandles;

  const trades: BacktestTrade[] = [];
  let balance = config.initialBalance;
  const equityCurve: number[] = [balance];
  const returns: number[] = [];
  let tradeId = 1;
  let openTrade: {
    entryIndex: number;
    direction: "buy" | "sell";
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    lotSize: number;
    zoneType: "demand" | "supply";
    zoneStrength: number;
    fibLevel: number;
    amdPhase: "accumulation" | "manipulation" | "distribution";
    session: string;
    setupScore: number;
    liquiditySweep: boolean;
    regime: "trending" | "ranging" | "volatile" | "low_volatility" | "unknown";
  } | null = null;

  const warmup = Math.min(60, Math.floor(execCandles.length * 0.05));
  const analysisInterval = downsampleFactor > 1 ? downsampleFactor : 4;

  for (let i = warmup; i < execCandles.length - 1; i++) {
    const currentCandle = execCandles[i]!;

    if (openTrade) {
      const c = currentCandle;
      const { direction, entryPrice, stopLoss, takeProfit, lotSize,
        zoneType, zoneStrength, fibLevel, amdPhase, session, setupScore, liquiditySweep, entryIndex, regime } = openTrade;

      let closed = false;
      let closedPrice = c.close;
      let closeReason: "tp_hit" | "sl_hit" = "sl_hit";
      let currentSL = stopLoss;

      const halfTarget = (entryPrice + takeProfit) / 2;
      if (direction === "buy" && c.high >= halfTarget) currentSL = Math.max(currentSL, entryPrice);
      else if (direction === "sell" && c.low <= halfTarget) currentSL = Math.min(currentSL, entryPrice);

      if (direction === "buy") {
        if (c.low <= currentSL) { closedPrice = currentSL; closeReason = "sl_hit"; closed = true; }
        else if (c.high >= takeProfit) { closedPrice = takeProfit; closeReason = "tp_hit"; closed = true; }
      } else {
        if (c.high >= currentSL) { closedPrice = currentSL; closeReason = "sl_hit"; closed = true; }
        else if (c.low <= takeProfit) { closedPrice = takeProfit; closeReason = "tp_hit"; closed = true; }
      }

      if (closed || i === execCandles.length - 2) {
        const pnl = calcPnl(direction, entryPrice, closedPrice, lotSize, pair);
        balance += pnl;
        const pnlPct = (pnl / config.initialBalance) * 100;
        returns.push(pnlPct);
        equityCurve.push(balance);

        trades.push({
          id: tradeId++,
          pair,
          direction,
          entryPrice,
          stopLoss: openTrade.stopLoss,
          takeProfit: openTrade.takeProfit,
          closedPrice,
          lotSize,
          status: "closed",
          pnl: Math.round(pnl * 100) / 100,
          pnlPercent: Math.round(pnlPct * 100) / 100,
          session,
          setupScore,
          amdPattern: amdPhase,
          zoneType,
          zoneStrength,
          liquiditySweep,
          fibLevel,
          riskRewardRatio: Math.abs(takeProfit - entryPrice) / Math.abs(entryPrice - stopLoss),
          breakEvenMoved: closeReason === "tp_hit",
          closeReason,
          openedAt: execCandles[entryIndex]!.time.toISOString(),
          closedAt: c.time.toISOString(),
          regime,
        });

        openTrade = null;
      }
      continue;
    }

    if (i % analysisInterval !== 0) continue;

    const ctxIndex = Math.floor(i / downsampleFactor);
    const historicalCtx = ctxCandles.slice(0, Math.min(ctxIndex + 1, ctxCandles.length));
    const historicalExec = execCandles.slice(0, i + 1);

    if (historicalCtx.length < 20) continue;

    const swings = detectSwings(historicalCtx, 3);
    if (swings.length < 4) continue;

    const atr = calcATR(historicalCtx);
    const currentPrice = currentCandle.close;
    const fib = calcFibonacci(swings, currentPrice);
    const zones = detectZones(pair, ctxTf, historicalCtx, fib, 6);
    const liquidityLevels = detectLiquidityLevels(historicalCtx, swings);
    const grabs = detectLiquidityGrabs(historicalCtx, liquidityLevels);
    const sweeps = detectSweeps(historicalCtx, swings);
    const amd = detectAMD(historicalCtx, grabs);

    const detailedRegime = detectRegimeDetailed(historicalCtx, swings);
    const regime = detailedRegime.regime;

    const signals = generateSignals(pair, historicalExec, zones, fib, amd, {
      pair,
      regime,
      trend: detailedRegime.trend,
      volatility: detailedRegime.volatility,
      atr,
      adxEquivalent: detailedRegime.adxEquivalent,
      regimeConfidence: detailedRegime.regimeConfidence,
      volatilityPercentile: detailedRegime.volatilityPercentile,
      rangeCompression: detailedRegime.rangeCompression,
    }, grabs, undefined, sweeps);

    if (signals.length === 0) continue;

    const signal = signals[0]!;

    if (config.sessions && config.sessions.length > 0) {
      if (!config.sessions.includes(signal.session)) continue;
    }

    const lotSize = calcLotSize(balance, config.riskPerTrade, signal.entryPrice, signal.stopLoss, pair);
    const touchingZone = zones.find(z => z.active && isPriceInZone(currentPrice, z, atr) && z.zoneType === signal.zoneType);
    const liquiditySweep = grabs.slice(-3).some(g => g.confirmed);

    openTrade = {
      entryIndex: i,
      direction: signal.direction,
      entryPrice: currentPrice,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      lotSize,
      zoneType: signal.zoneType,
      zoneStrength: touchingZone?.strength ?? signal.zoneStrength,
      fibLevel: signal.fibLevel,
      amdPhase: signal.amdPhase,
      session: signal.session,
      setupScore: Math.round(signal.confidence),
      liquiditySweep,
      regime,
    };
  }

  const winners = trades.filter(t => t.pnl > 0);
  const losers = trades.filter(t => t.pnl < 0);
  const winRate = trades.length > 0 ? (winners.length / trades.length) * 100 : 0;
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const grossWin = winners.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 9.99 : 0;
  const maxDrawdown = calcMaxDrawdown(equityCurve);
  const sharpeRatio = calcSharpeRatio(returns);

  const equityCurveFormatted = equityCurve.map((bal, i) => ({
    time: i === 0 ? config.startDate : (trades[i - 1]?.closedAt ?? config.endDate),
    balance: Math.round(bal * 100) / 100,
  }));

  const stats = calcFullStats(trades, config.initialBalance);

  return {
    trades,
    totalTrades: trades.length,
    winners: winners.length,
    losers: losers.length,
    winRate: Math.round(winRate * 100) / 100,
    totalPnl: Math.round(totalPnl * 100) / 100,
    finalBalance: Math.round(balance * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    profitFactor: Math.round(profitFactor * 1000) / 1000,
    sharpeRatio: Math.round(sharpeRatio * 1000) / 1000,
    equityCurve: equityCurveFormatted,
    expectancy: stats.expectancy,
    avgRR: stats.avgRR,
    avgWin: stats.avgWin,
    avgLoss: stats.avgLoss,
    maxConsecWins: stats.maxConsecWins,
    maxConsecLosses: stats.maxConsecLosses,
    sessionStats: stats.sessionStats,
    pairStats: stats.pairStats,
    zoneStats: stats.zoneStats,
    monthlyReturns: stats.monthlyReturns,
    yearlyReturns: stats.yearlyReturns,
    regimeStats: stats.regimeStats,
  };
}
