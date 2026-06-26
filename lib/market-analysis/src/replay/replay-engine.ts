import type { Candle, Pair, Timeframe } from "../types.js";
import { detectSwings, calcATR } from "../analysis/swings.js";
import { calcFibForCandles } from "../analysis/fibonacci.js";
import { detectZones } from "../analysis/zones.js";
import { detectLiquidityLevels, detectLiquidityGrabs, detectSweeps } from "../analysis/liquidity.js";
import { detectAMD } from "../analysis/amd.js";
import { detectRegime } from "../analysis/regime.js";
import { evaluateRules, type DecisionTrace, type TraceTradeInfo } from "./rule-evaluator.js";
import { detectBias, type BiasSummary } from "./bias-detector.js";
import { computeStats, generateValidationReport, type ReplayConfig, type ReplayStats } from "./report-generator.js";

export type { ReplayConfig };
export type { BiasSummary };
export type { ReplayStats };
export type { DecisionTrace };

export interface ReplayResult {
  config: ReplayConfig;
  candles: Candle[];
  traces: DecisionTrace[];
  bias: BiasSummary;
  stats: ReplayStats;
  reportText: string;
  durationMs: number;
}

const BASE_PRICES: Record<string, number> = { EURUSD: 1.085, GBPUSD: 1.27, USDJPY: 149.5 };
const DAILY_VOLS: Record<string, number> = { EURUSD: 0.006, GBPUSD: 0.008, USDJPY: 0.008 };
const BAR_MS: Record<string, number> = {
  "15m": 15 * 60 * 1000, "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000, "1d": 24 * 60 * 60 * 1000,
};
const BARS_PER_DAY: Record<string, number> = { "15m": 96, "1h": 24, "4h": 6, "1d": 1 };

/**
 * Generates synthetic candles with explicit trend/impulse/consolidation phases
 * so that supply/demand zones reliably form (detectZones needs body ≥ 1.5×ATR).
 *
 * Phase model (cycles of ~30–60 bars):
 *   • Accumulation (15 bars): tight, low-vol consolidation
 *   • Impulse (8 bars): strong directional move — body ≥ 2×ATR, creates BOS
 *   • Retracement (10 bars): 38–50% pullback toward the impulse origin
 *   • Distribution (10 bars): tight consolidation at the retracement level
 *   • Continuation or reversal — repeat with alternating direction occasionally
 */
function generateReplayCandles(
  pair: Pair,
  timeframe: Timeframe,
  startDate: string,
  endDate: string,
): Candle[] {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const ms = BAR_MS[timeframe] ?? BAR_MS["1h"]!;
  const numCandles = Math.min(Math.floor((end - start) / ms), 1200);

  const basePrice = BASE_PRICES[pair] ?? 1.0;
  const dailyVol = DAILY_VOLS[pair] ?? 0.006;
  const bpd = BARS_PER_DAY[timeframe] ?? 24;
  const barVol = dailyVol / Math.sqrt(bpd);

  const candles: Candle[] = [];
  let price = basePrice;
  let trendDir = 1; // +1 bullish, -1 bearish

  // Mini phase machine
  type Phase = "accumulation" | "impulse" | "retracement" | "distribution";
  let phase: Phase = "accumulation";
  let phaseBar = 0;
  let phaseLengths: Record<Phase, number> = { accumulation: 18, impulse: 8, retracement: 12, distribution: 10 };
  let impulseStart = price;

  for (let i = 0; i < numCandles; i++) {
    phaseBar++;

    let drift: number;
    let wickMult: number;

    if (phase === "accumulation") {
      // Tight range — small random moves, no strong direction
      drift = (Math.random() - 0.5) * barVol * 0.4;
      wickMult = 0.3;
      if (phaseBar >= phaseLengths.accumulation) {
        phase = "impulse";
        phaseBar = 0;
        impulseStart = price;
        // Randomly flip trend direction occasionally (~30% chance)
        if (Math.random() < 0.3) trendDir = -trendDir;
      }
    } else if (phase === "impulse") {
      // Strong directional move — body designed to exceed 2×ATR
      drift = trendDir * barVol * 2.2 + (Math.random() - 0.5) * barVol * 0.3;
      wickMult = 0.25;
      if (phaseBar >= phaseLengths.impulse) {
        phase = "retracement";
        phaseBar = 0;
      }
    } else if (phase === "retracement") {
      // 40–55% pullback toward impulseStart
      const retracementTarget = impulseStart + (price - impulseStart) * 0.5;
      const retDrift = (retracementTarget - price) / (phaseLengths.retracement - phaseBar + 1);
      drift = retDrift / price + (Math.random() - 0.5) * barVol * 0.2;
      wickMult = 0.4;
      if (phaseBar >= phaseLengths.retracement) {
        phase = "distribution";
        phaseBar = 0;
      }
    } else {
      // Distribution — tight, directionless
      drift = (Math.random() - 0.5) * barVol * 0.35;
      wickMult = 0.3;
      // Mean-revert gently toward base price so we stay in range
      drift += 0.008 * (basePrice - price) / basePrice;
      if (phaseBar >= phaseLengths.distribution) {
        phase = "accumulation";
        phaseBar = 0;
        // Vary phase lengths slightly each cycle
        phaseLengths = {
          accumulation: 14 + Math.floor(Math.random() * 10),
          impulse: 6 + Math.floor(Math.random() * 5),
          retracement: 8 + Math.floor(Math.random() * 8),
          distribution: 8 + Math.floor(Math.random() * 6),
        };
      }
    }

    const open = price;
    price = price * (1 + drift);
    const body = Math.abs(price - open);
    const wickH = body * wickMult * Math.random();
    const wickL = body * wickMult * Math.random();
    const high = Math.max(open, price) + wickH;
    const low = Math.min(open, price) - wickL;

    candles.push({
      time: new Date(start + i * ms),
      open,
      high,
      low,
      close: price,
      volume: 8000 + Math.random() * 60000,
    });
  }

  return candles;
}

// Resolve trade outcome by scanning future candles for TP/SL hit (no look-ahead at decision time)
function resolveOutcome(
  trade: TraceTradeInfo,
  allCandles: Candle[],
  entryIndex: number,
): void {
  const MAX_HOLD = 40;
  const pipSize = trade.direction === "buy" && trade.entryPrice > 50 ? 0.01 : 0.0001;

  for (let j = entryIndex + 1; j < Math.min(allCandles.length, entryIndex + MAX_HOLD + 1); j++) {
    const c = allCandles[j]!;

    if (trade.direction === "buy") {
      if (c.low <= trade.stopLoss) {
        trade.outcome = "loss";
        trade.closedAtIndex = j;
        trade.closedAtTime = c.time.toISOString();
        trade.closedPrice = trade.stopLoss;
        trade.pnlPips = -Math.abs(trade.entryPrice - trade.stopLoss) / pipSize;
        return;
      }
      if (c.high >= trade.takeProfit) {
        trade.outcome = "win";
        trade.closedAtIndex = j;
        trade.closedAtTime = c.time.toISOString();
        trade.closedPrice = trade.takeProfit;
        trade.pnlPips = Math.abs(trade.takeProfit - trade.entryPrice) / pipSize;
        return;
      }
    } else {
      if (c.high >= trade.stopLoss) {
        trade.outcome = "loss";
        trade.closedAtIndex = j;
        trade.closedAtTime = c.time.toISOString();
        trade.closedPrice = trade.stopLoss;
        trade.pnlPips = -Math.abs(trade.stopLoss - trade.entryPrice) / pipSize;
        return;
      }
      if (c.low <= trade.takeProfit) {
        trade.outcome = "win";
        trade.closedAtIndex = j;
        trade.closedAtTime = c.time.toISOString();
        trade.closedPrice = trade.takeProfit;
        trade.pnlPips = Math.abs(trade.entryPrice - trade.takeProfit) / pipSize;
        return;
      }
    }
  }
  // Max hold expired — close at current price
  const lastCandle = allCandles[Math.min(allCandles.length - 1, entryIndex + MAX_HOLD)]!;
  trade.closedAtIndex = Math.min(allCandles.length - 1, entryIndex + MAX_HOLD);
  trade.closedAtTime = lastCandle.time.toISOString();
  trade.closedPrice = lastCandle.close;
  trade.outcome = trade.direction === "buy"
    ? lastCandle.close > trade.entryPrice ? "win" : "loss"
    : lastCandle.close < trade.entryPrice ? "win" : "loss";
  const pips = trade.direction === "buy"
    ? (lastCandle.close - trade.entryPrice) / pipSize
    : (trade.entryPrice - lastCandle.close) / pipSize;
  trade.pnlPips = pips;
}

const MIN_LOOKBACK = 50;

// The core replay loop — iterates one candle at a time with ZERO look-ahead
export function runReplay(config: ReplayConfig): ReplayResult {
  const started = Date.now();
  const candles = generateReplayCandles(
    config.pair,
    config.timeframe,
    config.startDate,
    config.endDate,
  );

  const traces: DecisionTrace[] = [];
  // Track which candle indices have an open trade to avoid stacking
  const openTradeUntil: { [key: number]: number } = {};
  let lastTradeEndIndex = -1;

  for (let i = MIN_LOOKBACK; i < candles.length; i++) {
    // ── STRICT LOOK-AHEAD PREVENTION ──────────────────────────────────────
    // ONLY candles[0..i] are visible at step i. candles[i+1..n] do NOT exist.
    const visible = candles.slice(0, i + 1);

    // Full analysis on visible-only slice
    const swings = detectSwings(visible, 3);
    const fib = calcFibForCandles(visible, swings);
    const zones = detectZones(config.pair, config.timeframe, visible, fib, 10);
    const liquidity = detectLiquidityLevels(visible, swings);
    const grabs = detectLiquidityGrabs(visible, liquidity);
    const sweeps = detectSweeps(visible, swings);
    const amd = detectAMD(visible, grabs);
    const regime = detectRegime(config.pair, visible, swings);

    // Evaluate rules (only NO_ZONE if no zones nearby — skip full eval for speed)
    const activeZones = zones.filter(z => z.active && z.strength >= 55);
    const current = visible[visible.length - 1]!;
    const atr = calcATR(visible);
    const currentPrice = current.close;

    // Check zone proximity — same generous buffer as isPriceInZone (atr*0.5) + wider approach window (atr*6)
    const hasNearbyZone = activeZones.some(z => {
      const buffer = atr * 0.5;
      const inZone = currentPrice >= z.priceBottom - buffer && currentPrice <= z.priceTop + buffer;
      const approachWindow = atr * 6;
      const approaching = z.zoneType === "demand"
        ? currentPrice > z.priceTop && currentPrice <= z.priceTop + approachWindow
        : currentPrice < z.priceBottom && currentPrice >= z.priceBottom - approachWindow;
      return inZone || approaching;
    });

    if (!hasNearbyZone) {
      // Fast path — no zone activity, record minimal trace
      traces.push({
        candleIndex: i,
        candleTime: current.time.toISOString(),
        open: current.open,
        high: current.high,
        low: current.low,
        close: current.close,
        atr,
        currentPrice,
        regime: regime.regime,
        regimeConfidence: regime.regimeConfidence,
        amdPhase: amd.phase,
        amdScore: amd.amdScore,
        fibBias: fib?.currentPriceBias ?? "unknown",
        swingTrend: "neutral",
        zoneEvaluations: [],
        activeZonesNearby: 0,
        finalDecision: "NO_ZONE",
        decisionReason: "No active supply/demand zones near current price",
        tradeTaken: false,
      });
      continue;
    }

    const trace = evaluateRules({
      pair: config.pair,
      candleIndex: i,
      visibleCandles: visible,
      swings,
      fib,
      zones,
      sweeps,
      grabs,
      amd,
      regime,
    });

    // Skip entry if there's already an open trade running
    if (trace.tradeTaken && trace.trade && i <= lastTradeEndIndex) {
      trace.tradeTaken = false;
      trace.finalDecision = "NO_TRADE";
      trace.decisionReason = "Open trade in progress — new signal suppressed (position management)";
      trace.trade = undefined;
    }

    // Resolve outcome (uses future candles — this is after the decision is already recorded)
    if (trace.tradeTaken && trace.trade) {
      resolveOutcome(trace.trade, candles, i);
      if (trace.trade.closedAtIndex !== undefined) {
        lastTradeEndIndex = trace.trade.closedAtIndex;
      }
    }

    traces.push(trace);
  }

  const bias = detectBias(traces, candles);
  const stats = computeStats(traces);
  const reportText = generateValidationReport(config, traces, bias, stats);

  return {
    config,
    candles,
    traces,
    bias,
    stats,
    reportText,
    durationMs: Date.now() - started,
  };
}
