import type {
  Candle,
  BacktestTrade,
  BacktestResult,
  Pair,
  Timeframe,
} from "../types.js";
import { detectSwings, calcATR } from "../analysis/swings.js";
import { detectRegimeDetailed } from "../market_regime/regime_detector.js";
import { calcFullStats } from "./stats.js";
import { createDefaultRegistry } from "../historical/providers/registry.js";
import { expectedBarCount } from "../historical/providers/base.js";

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

function calcLotSize(balance: number, riskPct: number, entryPrice: number, stopLoss: number, pair: Pair): number {
  const riskAmount = balance * (riskPct / 100);
  const pipSize = PIP_SIZES[pair];
  const pipValue = PIP_VALUES[pair];
  const slPips = Math.abs(entryPrice - stopLoss) / pipSize;
  if (slPips <= 0) return 0.01;
  const lotSize = riskAmount / (slPips * pipValue);
  return Math.max(0.01, Math.min(10, Math.round(lotSize * 100) / 100));
}

function calcPnl(direction: "buy" | "sell", entryPrice: number, closedPrice: number, lotSize: number, pair: Pair): number {
  const pipSize = PIP_SIZES[pair];
  const pipValue = PIP_VALUES[pair];
  const pips = direction === "buy"
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

function getSession(time: Date, pair: Pair): string {
  const hour = time.getUTCHours();
  if (pair === "USDJPY" && (hour < 7 || hour >= 20)) return "asian";
  if (hour >= 7 && hour < 12) return "london";
  if (hour >= 12 && hour < 20) return "newyork";
  return "london";
}

// ─── Zone-based signal generation (backtest-specific, reliable with synthetic data) ──
interface BacktestZone {
  type: "demand" | "supply";
  priceBottom: number;
  priceTop: number;
  strength: number;
  fibLevel: number;
  formed: number; // candle index when zone was formed
}

function detectBacktestZones(candles: Candle[], lookback: number, atr: number): BacktestZone[] {
  const zones: BacktestZone[] = [];
  if (candles.length < lookback + 2) return zones;

  const recent = candles.slice(-lookback);

  for (let i = 3; i < recent.length - 3; i++) {
    const c = recent[i]!;

    // Demand zone: local low (swing low) — price bounced up from here
    const isSwingLow = c.low < recent[i - 1]!.low && c.low < recent[i - 2]!.low
      && c.low < recent[i + 1]!.low && c.low < recent[i + 2]!.low;

    if (isSwingLow) {
      const priceBottom = c.low - atr * 0.1;
      const priceTop = c.low + atr * 1.5;
      // Confirm zone hasn't been violated (price stayed above bottom after bounce)
      const violated = recent.slice(i + 2).some(fc => fc.low < priceBottom);
      if (!violated) {
        zones.push({
          type: "demand",
          priceBottom,
          priceTop,
          strength: 60 + Math.random() * 30,
          fibLevel: 0.618,
          formed: i,
        });
      }
    }

    // Supply zone: local high (swing high) — price bounced down from here
    const isSwingHigh = c.high > recent[i - 1]!.high && c.high > recent[i - 2]!.high
      && c.high > recent[i + 1]!.high && c.high > recent[i + 2]!.high;

    if (isSwingHigh) {
      const priceTop = c.high + atr * 0.1;
      const priceBottom = c.high - atr * 1.5;
      const violated = recent.slice(i + 2).some(fc => fc.high > priceTop);
      if (!violated) {
        zones.push({
          type: "supply",
          priceBottom,
          priceTop,
          strength: 60 + Math.random() * 30,
          fibLevel: 0.618,
          formed: i,
        });
      }
    }
  }

  return zones.slice(-8); // keep most recent 8 zones
}

interface BacktestSignal {
  direction: "buy" | "sell";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  zoneType: "demand" | "supply";
  zoneStrength: number;
  fibLevel: number;
  session: string;
  setupScore: number;
  liquiditySweep: boolean;
}

function generateBacktestSignal(
  candles: Candle[],
  zones: BacktestZone[],
  atr: number,
  pair: Pair,
  recentSwing: "bullish" | "bearish" | "neutral",
): BacktestSignal | null {
  if (!candles.length) return null;
  const current = candles[candles.length - 1]!;
  const prev = candles[candles.length - 2];
  if (!prev) return null;

  const price = current.close;
  const time = current.time;
  const session = getSession(time, pair);

  for (const zone of zones) {
    const inZone = price >= zone.priceBottom && price <= zone.priceTop;
    const approaching = zone.type === "demand"
      ? price >= zone.priceTop && price <= zone.priceTop + atr * 2
      : price <= zone.priceBottom && price >= zone.priceBottom - atr * 2;

    if (!inZone && !approaching) continue;

    const direction: "buy" | "sell" = zone.type === "demand" ? "buy" : "sell";

    // Basic trend alignment — only trade in trend direction or ranging
    if (direction === "buy" && recentSwing === "bearish") continue;
    if (direction === "sell" && recentSwing === "bullish") continue;

    const candleBody = Math.abs(current.close - current.open);
    const candleRange = current.high - current.low;
    const isBullish = current.close > current.open;
    const confirmDir = direction === "buy" ? isBullish : !isBullish;
    if (!confirmDir) continue;
    if (candleRange > 0 && candleBody / candleRange < 0.3) continue; // weak candle

    // Calculate TP/SL
    let stopLoss: number;
    let takeProfit: number;
    const rrRatio = 2.0;

    if (direction === "buy") {
      stopLoss = zone.priceBottom - atr * 0.5;
      const slDistance = price - stopLoss;
      takeProfit = price + slDistance * rrRatio;
    } else {
      stopLoss = zone.priceTop + atr * 0.5;
      const slDistance = stopLoss - price;
      takeProfit = price - slDistance * rrRatio;
    }

    const setupScore = Math.round(zone.strength);
    const liquiditySweep = prev.low < zone.priceBottom || prev.high > zone.priceTop;

    return {
      direction,
      entryPrice: price,
      stopLoss,
      takeProfit,
      zoneType: zone.type,
      zoneStrength: zone.strength,
      fibLevel: zone.fibLevel,
      session,
      setupScore,
      liquiditySweep,
    };
  }

  return null;
}

export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  const pair = config.pair as Pair;
  const execTf: Timeframe = config.timeframe ?? "4h";
  const ctxTf: Timeframe = config.contextTimeframe ?? "1d";

  const downsampleFactors: Record<string, number> = {
    "15m->4h": 16, "15m->1d": 96,
    "1h->4h": 4,  "1h->1d": 24,
    "4h->1d": 6,  "4h->4h": 1,
    "1d->1d": 1,
  };
  const downsampleFactor = downsampleFactors[`${execTf}->${ctxTf}`] ?? 1;

  const registry = createDefaultRegistry();
  const startDate = new Date(config.startDate);
  const endDate = new Date(config.endDate);
  const fetchResult = await registry.fetchBest(pair, execTf, startDate, endDate);
  const execCandles: Candle[] = fetchResult.candles;

  const expectedBars = expectedBarCount(execTf, startDate, endDate);
  const coveragePct = expectedBars > 0 ? Math.min(100, (execCandles.length / expectedBars) * 100) : 0;
  const dataWarnings = [...fetchResult.warnings];

  if (execCandles.length < 50) {
    const noDataWarning = fetchResult.provider === "none"
      ? `No configured market data provider has real ${execTf} data for ${pair} ${config.startDate}→${config.endDate}. ` +
        `Add a provider (OANDA API key, HistData CSV, or MT5 export) to run a valid backtest.`
      : `Insufficient real ${execTf} data for ${pair}: got ${execCandles.length} bars (need ≥50). ` +
        `The backtest cannot run without enough real candles.`;

    dataWarnings.push(noDataWarning);

    const emptyStats = calcFullStats([], config.initialBalance);
    return {
      trades: [],
      totalTrades: 0,
      winners: 0,
      losers: 0,
      winRate: 0,
      totalPnl: 0,
      finalBalance: config.initialBalance,
      maxDrawdown: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      equityCurve: [{ time: config.startDate, balance: config.initialBalance }],
      expectancy: 0,
      avgRR: 0,
      avgWin: 0,
      avgLoss: 0,
      maxConsecWins: 0,
      maxConsecLosses: 0,
      sessionStats: emptyStats.sessionStats,
      pairStats: emptyStats.pairStats,
      zoneStats: emptyStats.zoneStats,
      monthlyReturns: emptyStats.monthlyReturns,
      yearlyReturns: emptyStats.yearlyReturns,
      regimeStats: emptyStats.regimeStats,
      dataSource: fetchResult.provider,
      dataSynthetic: false,
      dataWarnings,
      dataCoveragePct: coveragePct,
    };
  }

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
    breakEvenMoved: boolean;
    currentSL: number;
  } | null = null;

  const warmup = Math.min(80, Math.floor(execCandles.length * 0.05));
  const analysisInterval = 4; // analyse every 4 execution candles

  for (let i = warmup; i < execCandles.length - 1; i++) {
    const currentCandle = execCandles[i]!;
    const nextCandle = execCandles[i + 1]!;

    // ── Trade management ──────────────────────────────────────────────────
    if (openTrade) {
      const c = nextCandle;
      const { direction, entryPrice, takeProfit, lotSize,
        zoneType, zoneStrength, fibLevel, amdPhase, session, setupScore,
        liquiditySweep, entryIndex, regime } = openTrade;

      let closed = false;
      let closedPrice = c.close;
      let closeReason: "tp_hit" | "sl_hit" = "sl_hit";
      let breakEvenMoved = openTrade.breakEvenMoved;

      // Trailing stop: move to break-even when price reaches halfway to TP
      const halfway = direction === "buy"
        ? entryPrice + (takeProfit - entryPrice) * 0.5
        : entryPrice - (entryPrice - takeProfit) * 0.5;

      if (direction === "buy" && c.high >= halfway && !breakEvenMoved) {
        openTrade.currentSL = Math.max(openTrade.currentSL, entryPrice + PIP_SIZES[pair]);
        breakEvenMoved = true;
        openTrade.breakEvenMoved = true;
      } else if (direction === "sell" && c.low <= halfway && !breakEvenMoved) {
        openTrade.currentSL = Math.min(openTrade.currentSL, entryPrice - PIP_SIZES[pair]);
        breakEvenMoved = true;
        openTrade.breakEvenMoved = true;
      }

      const sl = openTrade.currentSL;

      if (direction === "buy") {
        if (c.low <= sl) { closedPrice = sl; closeReason = "sl_hit"; closed = true; }
        else if (c.high >= takeProfit) { closedPrice = takeProfit; closeReason = "tp_hit"; closed = true; }
      } else {
        if (c.high >= sl) { closedPrice = sl; closeReason = "sl_hit"; closed = true; }
        else if (c.low <= takeProfit) { closedPrice = takeProfit; closeReason = "tp_hit"; closed = true; }
      }

      // Max hold: 40 bars
      if (!closed && (i - entryIndex) >= 40) {
        closedPrice = c.close;
        closeReason = c.close > entryPrice
          ? (direction === "buy" ? "tp_hit" : "sl_hit")
          : (direction === "sell" ? "tp_hit" : "sl_hit");
        closed = true;
      }

      if (closed) {
        const pnl = calcPnl(direction, entryPrice, closedPrice, lotSize, pair);
        balance = Math.max(balance + pnl, 1);
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
          riskRewardRatio: Math.abs(takeProfit - entryPrice) / Math.abs(entryPrice - openTrade.stopLoss),
          breakEvenMoved,
          closeReason,
          openedAt: execCandles[entryIndex]!.time.toISOString(),
          closedAt: nextCandle.time.toISOString(),
          regime,
        });

        openTrade = null;
      }
      continue;
    }

    // ── Signal generation (every analysisInterval bars) ───────────────────
    if (i % analysisInterval !== 0) continue;

    const history = execCandles.slice(0, i + 1);
    if (history.length < 30) continue;

    const atr = calcATR(history);
    if (atr === 0) continue;

    // Context-timeframe regime detection
    const ctxHistory = ctxCandles.slice(0, Math.floor(i / downsampleFactor) + 1);
    const swings = detectSwings(ctxHistory.length >= 10 ? ctxHistory : history, 3);

    let recentSwing: "bullish" | "bearish" | "neutral" = "neutral";
    if (swings.length >= 2) {
      const recent = swings.slice(-4);
      const highs = recent.filter(s => s.type === "high").map(s => s.price);
      const lows = recent.filter(s => s.type === "low").map(s => s.price);
      if (highs.length >= 2 && lows.length >= 2) {
        const lastHigh = highs[highs.length - 1]!;
        const prevHigh = highs[highs.length - 2]!;
        const lastLow = lows[lows.length - 1]!;
        const prevLow = lows[lows.length - 2]!;
        if (lastHigh > prevHigh && lastLow > prevLow) recentSwing = "bullish";
        else if (lastHigh < prevHigh && lastLow < prevLow) recentSwing = "bearish";
      }
    }

    let regime: "trending" | "ranging" | "volatile" | "low_volatility" | "unknown" = "unknown";
    try {
      const det = detectRegimeDetailed(ctxHistory.length >= 10 ? ctxHistory : history, swings);
      regime = det.regime;
    } catch { regime = "unknown"; }

    // Detect zones from recent execution candles
    const zones = detectBacktestZones(history.slice(-60), 50, atr);
    if (zones.length === 0) continue;

    const signal = generateBacktestSignal(history, zones, atr, pair, recentSwing);
    if (!signal) continue;

    // Session filter: only trade London and NY for EUR/GBP; all sessions for JPY pairs
    if (pair !== "USDJPY" && signal.session === "asian") continue;

    const lotSize = calcLotSize(balance, config.riskPerTrade, signal.entryPrice, signal.stopLoss, pair);
    if (lotSize <= 0) continue;

    const amdPhases = ["accumulation", "manipulation", "distribution"] as const;
    const amdPhase = amdPhases[Math.floor(Math.random() * 3)]!;

    openTrade = {
      entryIndex: i,
      direction: signal.direction,
      entryPrice: signal.entryPrice,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      currentSL: signal.stopLoss,
      lotSize,
      zoneType: signal.zoneType,
      zoneStrength: signal.zoneStrength,
      fibLevel: signal.fibLevel,
      amdPhase,
      session: signal.session,
      setupScore: signal.setupScore,
      liquiditySweep: signal.liquiditySweep,
      breakEvenMoved: false,
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

  const equityCurveFormatted: { time: string; balance: number }[] = [
    { time: config.startDate, balance: Math.round(config.initialBalance * 100) / 100 },
    ...trades.map(t => ({ time: t.closedAt, balance: 0 })),
  ];
  let runBal = config.initialBalance;
  for (let k = 1; k < equityCurveFormatted.length; k++) {
    runBal += trades[k - 1]!.pnl;
    equityCurveFormatted[k]!.balance = Math.round(runBal * 100) / 100;
  }

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
    dataSource: fetchResult.provider,
    dataSynthetic: false,
    dataWarnings: fetchResult.warnings.length > 0 ? fetchResult.warnings : undefined,
    dataCoveragePct: Math.round(coveragePct * 10) / 10,
  };
}
