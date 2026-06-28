// ─── Market Regime Transition Detector ───────────────────────────────────────
// Phase 4 Enhancement: Detects regime transitions using objective statistical methods.
// ADVISORY ONLY — generates transition alerts, never modifies strategy.
//
// Statistical techniques used (no machine learning):
//   1. Rolling volatility comparison (std dev of returns)
//   2. ATR change analysis (average true range)
//   3. Hurst exponent approximation (R/S analysis)
//   4. ADX-style trend strength proxy (directional movement proxy)
//   5. Trend persistence (autocorrelation of direction)
//   6. CUSUM change-point detection
//   7. Structural break detection (Chow-style variance comparison)

import { randomUUID } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RegimeLabel =
  | "trending"
  | "ranging"
  | "volatile"
  | "low_volatility"
  | "expansion"
  | "compression";

export type TransitionType =
  | "trend_reversal"
  | "expansion"
  | "compression"
  | "volatility_spike"
  | "volatility_drop"
  | "structural_break"
  | "regime_shift";

export interface RegimeTransitionEvent {
  transitionId: string;
  pair: string;
  fromRegime: RegimeLabel;
  toRegime: RegimeLabel;
  transitionType: TransitionType;
  transitionConfidence: number;  // 0–100
  regimeConfidence: number;      // confidence in new regime, 0–100

  // Statistical evidence
  rollingVolatilityBefore: number;
  rollingVolatilityAfter: number;
  atrBefore: number;
  atrAfter: number;
  atrChangePct: number;
  hurstBefore: number;
  hurstAfter: number;
  adxBefore: number;
  adxAfter: number;
  cusumScore: number;

  previousRegimeDurationDays: number;
  evidence: string[];
  description: string;
  recommendation: string;
  detectedAt: Date;
  confirmed: boolean;
}

export interface RegimeState {
  currentRegime: RegimeLabel;
  regimeConfidence: number;       // 0–100
  rollingVolatility: number;
  atr: number;
  hurstExponent: number;
  trendStrength: number;          // ADX proxy
  trendPersistence: number;       // autocorrelation
  cusumPositive: number;
  cusumNegative: number;
  regimeStartDate: Date;
  regimeDurationDays: number;
}

export interface RegimeTimeline {
  pair: string;
  detectedAt: Date;
  state: RegimeState;
  transitions: RegimeTransitionEvent[];
  history: RegimeHistoryEntry[];
}

export interface RegimeHistoryEntry {
  regime: RegimeLabel;
  startDate: Date;
  endDate: Date | null;
  durationDays: number;
  regimeConfidence: number;
}

// Minimal candle representation for regime analysis
export interface RegimeCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  timestamp: Date;
}

// ─── Math Helpers ──────────────────────────────────────────────────────────────

function mean(vals: number[]): number {
  if (!vals.length) return 0;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function stdDev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  return Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - m, 2), 0) / vals.length);
}

// ─── ATR (Average True Range) ─────────────────────────────────────────────────

function computeATR(candles: RegimeCandle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    trs.push(Math.max(
      c.high - c.low,
      Math.abs(c.high - p.close),
      Math.abs(c.low - p.close),
    ));
  }
  const slice = trs.slice(-period);
  return mean(slice);
}

// ─── Rolling Volatility ────────────────────────────────────────────────────────
// Annualized std dev of log returns over a rolling window.

function computeRollingVolatility(candles: RegimeCandle[], period = 20): number {
  if (candles.length < period + 1) return 0;
  const slice = candles.slice(-period - 1);
  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const r = Math.log(slice[i].close / slice[i - 1].close);
    returns.push(r);
  }
  return stdDev(returns) * Math.sqrt(252); // annualized
}

// ─── Hurst Exponent (R/S Analysis) ───────────────────────────────────────────
// H < 0.5: mean-reverting (ranging)
// H ≈ 0.5: random walk
// H > 0.5: trending (persistent)

function computeHurstExponent(prices: number[]): number {
  if (prices.length < 20) return 0.5;

  const lags = [4, 8, 16, Math.min(prices.length / 2, 32)].map(Math.floor);
  const rsValues: Array<{ lag: number; rs: number }> = [];

  for (const lag of lags) {
    const series = prices.slice(-lag * 2).slice(0, lag);
    if (series.length < 4) continue;

    // R/S statistic
    const m = mean(series);
    const deviations = series.map((v, i) => {
      const cumsum = series.slice(0, i + 1).reduce((s, x) => s + (x - m), 0);
      return cumsum;
    });
    const R = Math.max(...deviations) - Math.min(...deviations);
    const S = stdDev(series);
    if (S > 0 && R > 0) {
      rsValues.push({ lag, rs: R / S });
    }
  }

  if (rsValues.length < 2) return 0.5;

  // Linear regression of log(R/S) vs log(lag) → slope = Hurst
  const logLags = rsValues.map(p => Math.log(p.lag));
  const logRS   = rsValues.map(p => Math.log(p.rs));
  const mL = mean(logLags);
  const mR = mean(logRS);
  const num = logLags.reduce((s, l, i) => s + (l - mL) * (logRS[i] - mR), 0);
  const den = logLags.reduce((s, l) => s + Math.pow(l - mL, 2), 0);
  const hurst = den > 0 ? num / den : 0.5;

  return Math.min(1, Math.max(0, hurst));
}

// ─── ADX Proxy (Trend Strength) ───────────────────────────────────────────────
// True ADX requires ±DI computation over candles. We use a simplified proxy:
// ratio of net price move to total path length over N candles.

function computeADXProxy(candles: RegimeCandle[], period = 14): number {
  if (candles.length < period) return 0;
  const slice = candles.slice(-period);
  const netMove = Math.abs(slice[slice.length - 1].close - slice[0].close);
  const totalPath = slice.slice(1).reduce((s, c, i) => s + Math.abs(c.close - slice[i].close), 0);
  return totalPath > 0 ? Math.min(100, (netMove / totalPath) * 100) : 0;
}

// ─── Trend Persistence (Autocorrelation of Returns) ──────────────────────────
// AC > 0: trending (same direction likely)
// AC < 0: mean-reverting (reversal likely)

function computeTrendPersistence(candles: RegimeCandle[], lag = 1): number {
  if (candles.length < lag + 5) return 0;
  const returns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    returns.push(candles[i].close - candles[i - 1].close);
  }
  const n = returns.length - lag;
  if (n < 4) return 0;
  const m = mean(returns);
  const num = returns.slice(0, n).reduce((s, r, i) => s + (r - m) * (returns[i + lag] - m), 0);
  const den = returns.reduce((s, r) => s + Math.pow(r - m, 2), 0);
  return den > 0 ? num / den : 0;
}

// ─── CUSUM Change-Point Detection ────────────────────────────────────────────
// Cumulative sum of deviations from mean; high |CUSUM| signals a regime break.

function computeCUSUM(prices: number[]): { cusumPos: number; cusumNeg: number; score: number } {
  if (prices.length < 10) return { cusumPos: 0, cusumNeg: 0, score: 0 };

  const m = mean(prices);
  const s = stdDev(prices);
  if (s === 0) return { cusumPos: 0, cusumNeg: 0, score: 0 };

  const k = 0.5; // slack parameter
  let cusumPos = 0;
  let cusumNeg = 0;
  let maxPos = 0;
  let maxNeg = 0;

  for (const p of prices) {
    const z = (p - m) / s;
    cusumPos = Math.max(0, cusumPos + z - k);
    cusumNeg = Math.max(0, cusumNeg - z - k);
    maxPos = Math.max(maxPos, cusumPos);
    maxNeg = Math.max(maxNeg, cusumNeg);
  }

  // Normalize score: threshold typically at 4–5 for detection
  const score = Math.min(100, (Math.max(maxPos, maxNeg) / 5) * 100);
  return { cusumPos, cusumNeg, score };
}

// ─── Regime Classifier ────────────────────────────────────────────────────────
// Combines Hurst, volatility, ADX proxy, and trend persistence to classify regime.

function classifyRegime(
  hurst: number,
  rollingVol: number,
  adx: number,
  persistence: number,
  avgVol: number, // long-term average volatility (for expansion/compression)
): { regime: RegimeLabel; confidence: number } {
  const HIGH_VOL_THRESHOLD = avgVol * 1.5;
  const LOW_VOL_THRESHOLD  = avgVol * 0.6;

  let regime: RegimeLabel;
  let confidence: number;

  if (rollingVol > HIGH_VOL_THRESHOLD) {
    regime = "volatile";
    confidence = Math.min(100, Math.round(((rollingVol - HIGH_VOL_THRESHOLD) / avgVol) * 200 + 60));
  } else if (rollingVol < LOW_VOL_THRESHOLD) {
    regime = "low_volatility";
    confidence = Math.min(100, Math.round(((LOW_VOL_THRESHOLD - rollingVol) / avgVol) * 200 + 60));
  } else if (hurst > 0.55 && adx > 35 && persistence > 0.1) {
    regime = "trending";
    confidence = Math.min(100, Math.round((hurst - 0.5) * 200 + adx + 20));
  } else if (hurst < 0.45 && adx < 25) {
    regime = "ranging";
    confidence = Math.min(100, Math.round((0.5 - hurst) * 200 + (25 - adx) + 20));
  } else if (rollingVol > avgVol) {
    regime = "expansion";
    confidence = Math.round(60 + (rollingVol / avgVol - 1) * 50);
  } else {
    regime = "compression";
    confidence = Math.round(60 + (1 - rollingVol / avgVol) * 50);
  }

  return { regime, confidence: Math.min(100, Math.max(0, confidence)) };
}

// ─── Transition Type Classifier ───────────────────────────────────────────────

function classifyTransitionType(
  from: RegimeLabel,
  to: RegimeLabel,
  volChange: number,
  cusumScore: number,
): TransitionType {
  if (cusumScore > 70) return "structural_break";
  if ((from === "trending" && to === "ranging") || (from === "ranging" && to === "trending")) return "trend_reversal";
  if (to === "volatile" || to === "expansion") return volChange > 0 ? "volatility_spike" : "expansion";
  if (to === "low_volatility" || to === "compression") return volChange < 0 ? "volatility_drop" : "compression";
  return "regime_shift";
}

// ─── Main Regime Analysis ──────────────────────────────────────────────────────

export function analyzeRegimeState(
  candles: RegimeCandle[],
  pair = "SYSTEM",
): RegimeState {
  if (candles.length < 20) {
    return {
      currentRegime: "ranging",
      regimeConfidence: 30,
      rollingVolatility: 0,
      atr: 0,
      hurstExponent: 0.5,
      trendStrength: 0,
      trendPersistence: 0,
      cusumPositive: 0,
      cusumNegative: 0,
      regimeStartDate: new Date(),
      regimeDurationDays: 0,
    };
  }

  const prices = candles.map(c => c.close);
  const rollingVol = computeRollingVolatility(candles, 20);
  const atr = computeATR(candles, 14);
  const hurst = computeHurstExponent(prices);
  const adx = computeADXProxy(candles, 14);
  const persistence = computeTrendPersistence(candles, 1);
  const { cusumPos, cusumNeg, score: cusumScore } = computeCUSUM(prices);

  // Use long-term (full window) volatility as baseline
  const allPrices = candles.map(c => c.close);
  const allReturns: number[] = [];
  for (let i = 1; i < allPrices.length; i++) {
    allReturns.push(Math.log(allPrices[i] / allPrices[i - 1]));
  }
  const avgVol = stdDev(allReturns) * Math.sqrt(252);

  const { regime, confidence } = classifyRegime(hurst, rollingVol, adx, persistence, avgVol || rollingVol);

  return {
    currentRegime: regime,
    regimeConfidence: confidence,
    rollingVolatility: rollingVol,
    atr,
    hurstExponent: hurst,
    trendStrength: adx,
    trendPersistence: persistence,
    cusumPositive: cusumPos,
    cusumNegative: cusumNeg,
    regimeStartDate: new Date(),
    regimeDurationDays: 0,
  };
}

// ─── Transition Detector ──────────────────────────────────────────────────────

export function detectRegimeTransition(
  prevCandles: RegimeCandle[],
  currCandles: RegimeCandle[],
  pair = "SYSTEM",
  previousRegimeStart?: Date,
): RegimeTransitionEvent | null {
  if (prevCandles.length < 20 || currCandles.length < 20) return null;

  const prevState = analyzeRegimeState(prevCandles, pair);
  const currState = analyzeRegimeState(currCandles, pair);

  // No transition if regime is the same
  if (prevState.currentRegime === currState.currentRegime) return null;

  const atrBefore = computeATR(prevCandles);
  const atrAfter  = computeATR(currCandles);
  const atrChangePct = atrBefore > 0 ? ((atrAfter - atrBefore) / atrBefore) * 100 : 0;

  const prices = currCandles.map(c => c.close);
  const { score: cusumScore } = computeCUSUM(prices);

  const volChange = currState.rollingVolatility - prevState.rollingVolatility;
  const transitionType = classifyTransitionType(
    prevState.currentRegime,
    currState.currentRegime,
    volChange,
    cusumScore,
  );

  const now = new Date();
  const prevDurationMs = previousRegimeStart ? now.getTime() - previousRegimeStart.getTime() : 0;
  const previousRegimeDurationDays = prevDurationMs / (1000 * 86400);

  // Transition confidence: higher if both regimes have high confidence and CUSUM is elevated
  const transitionConfidence = Math.round(
    (prevState.regimeConfidence * 0.3 + currState.regimeConfidence * 0.5 + Math.min(50, cusumScore) * 0.4) / 1.2,
  );

  const evidence: string[] = [];
  evidence.push(`Hurst exponent: ${prevState.hurstExponent.toFixed(3)} → ${currState.hurstExponent.toFixed(3)}`);
  evidence.push(`Rolling volatility: ${(prevState.rollingVolatility * 100).toFixed(2)}% → ${(currState.rollingVolatility * 100).toFixed(2)}%`);
  evidence.push(`ATR change: ${atrChangePct > 0 ? "+" : ""}${atrChangePct.toFixed(1)}%`);
  evidence.push(`ADX proxy: ${prevState.trendStrength.toFixed(0)} → ${currState.trendStrength.toFixed(0)}`);
  evidence.push(`Trend persistence (autocorr): ${prevState.trendPersistence.toFixed(3)} → ${currState.trendPersistence.toFixed(3)}`);
  if (cusumScore > 30) {
    evidence.push(`CUSUM change-point score: ${cusumScore.toFixed(0)}/100 (${cusumScore > 60 ? "strong" : "moderate"} structural break)`);
  }

  const description = `Regime transition detected on ${pair}: ${prevState.currentRegime} → ${currState.currentRegime} (${transitionType.replace("_", " ")}). Confidence: ${transitionConfidence}%.`;
  const recommendation = `Advisory only. The previous regime lasted ${previousRegimeDurationDays.toFixed(0)} days. Monitor for ${Math.max(5, Math.round(previousRegimeDurationDays * 0.2))} more candles to confirm transition. Do not modify strategy — update regime weights in advisory outputs only.`;

  return {
    transitionId: randomUUID(),
    pair,
    fromRegime: prevState.currentRegime,
    toRegime: currState.currentRegime,
    transitionType,
    transitionConfidence: Math.min(100, Math.max(0, transitionConfidence)),
    regimeConfidence: currState.regimeConfidence,
    rollingVolatilityBefore: prevState.rollingVolatility,
    rollingVolatilityAfter: currState.rollingVolatility,
    atrBefore,
    atrAfter,
    atrChangePct,
    hurstBefore: prevState.hurstExponent,
    hurstAfter: currState.hurstExponent,
    adxBefore: prevState.trendStrength,
    adxAfter: currState.trendStrength,
    cusumScore,
    previousRegimeDurationDays,
    evidence,
    description,
    recommendation,
    detectedAt: now,
    confirmed: transitionConfidence >= 70, // auto-confirm if high confidence
  };
}

// ─── Regime History Builder ───────────────────────────────────────────────────

export function buildRegimeHistory(
  transitions: RegimeTransitionEvent[],
): RegimeHistoryEntry[] {
  if (transitions.length === 0) return [];

  const sorted = [...transitions].sort((a, b) => a.detectedAt.getTime() - b.detectedAt.getTime());
  const history: RegimeHistoryEntry[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const endDate = i + 1 < sorted.length ? sorted[i + 1].detectedAt : null;
    const durationMs = endDate ? endDate.getTime() - t.detectedAt.getTime() : 0;

    history.push({
      regime: t.toRegime,
      startDate: t.detectedAt,
      endDate,
      durationDays: durationMs / (1000 * 86400),
      regimeConfidence: t.regimeConfidence,
    });
  }

  return history;
}

// ─── Synthetic candle generator from features ─────────────────────────────────
// Converts ExtractedFeature data into minimal candles for regime analysis.

export function featuresToCandles(
  features: { openedAt: Date; confidence: number; tqi: number; rrActual: number; pnl: number }[],
): RegimeCandle[] {
  if (!features.length) return [];

  const sorted = [...features].sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());

  // Use a running price simulation: start at 100, move based on pnl sign
  let price = 100;
  return sorted.map(f => {
    const move = f.pnl > 0 ? 0.1 : -0.1;
    const open = price;
    price = Math.max(1, price + move + (f.tqi / 1000));
    const high = Math.max(open, price) + Math.abs(move) * 0.5;
    const low  = Math.min(open, price) - Math.abs(move) * 0.5;
    return {
      open,
      high,
      low,
      close: price,
      timestamp: f.openedAt,
    };
  });
}
