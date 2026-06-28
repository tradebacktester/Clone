// ─── Pattern Analyzer ─────────────────────────────────────────────────────────
// Core engine: takes ExtractedFeature[] → PatternRecord[] for every dimension.
// Dimensions: pair, session, regime, zone_quality, liquidity, amd, confirmation,
//             volatility, risk_profile, pair×session, pair×regime, session×regime.
// Advisory only — never modifies trading behavior.

import type { ExtractedFeature } from "../learning-core/types.js";
import type {
  PatternRecord,
  PatternCategory,
  PatternFilter,
  PatternStats,
} from "./types.js";
import { MIN_EVIDENCE_SAMPLE } from "./types.js";
import { validateEvidence } from "./evidence-validator.js";
import { analyzeTrend } from "./trend-analyzer.js";

export const PATTERN_ENGINE_VERSION = "1.0.0" as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeDiv(a: number, b: number, fallback = 0): number {
  return b === 0 ? fallback : a / b;
}

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function computeMaxDrawdown(sorted: ExtractedFeature[]): number {
  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  for (const f of sorted) {
    equity += f.pnl;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd * 100;
}

// ─── Quality Tier ─────────────────────────────────────────────────────────────

export function qualityTier(score: number): "low" | "medium" | "high" {
  if (score < 40) return "low";
  if (score <= 70) return "medium";
  return "high";
}

// ─── Risk Profile ─────────────────────────────────────────────────────────────

export function riskProfile(feature: ExtractedFeature): "conservative" | "balanced" | "aggressive" {
  const rr = feature.rrPlanned;
  const risk = feature.riskPct;
  if (risk > 1.5 || rr < 1.5) return "aggressive";
  if (risk <= 0.5 || rr >= 3) return "conservative";
  return "balanced";
}

// ─── Core Stats ───────────────────────────────────────────────────────────────

export function computePatternStats(features: ExtractedFeature[]): PatternStats {
  const n = features.length;
  const wins = features.filter(f => f.outcome === "win");
  const losses = features.filter(f => f.outcome === "loss");
  const bes = features.filter(f => f.outcome === "break_even");

  const winRate = safeDiv(wins.length, n);
  const lossRate = safeDiv(losses.length, n);

  const rrVals = features.map(f => f.rrActual);
  const avgRR = mean(rrVals);

  const avgProfit = mean(wins.map(f => f.pnl));
  const avgLoss = mean(losses.map(f => Math.abs(f.pnl)));

  const grossProfit = wins.reduce((s, f) => s + f.pnl, 0);
  const grossLoss = losses.reduce((s, f) => s + Math.abs(f.pnl), 0);
  const totalPnl = features.reduce((s, f) => s + f.pnl, 0);

  const expectancy = winRate * avgProfit - lossRate * avgLoss;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

  const sortedByDate = [...features].sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
  const maxDd = computeMaxDrawdown(sortedByDate);
  const recoveryFactor = maxDd > 0 ? safeDiv(totalPnl, maxDd) : totalPnl > 0 ? 99 : 0;

  const sd = stdDev(rrVals);
  const z95 = 1.96;
  const margin = n > 0 ? z95 * Math.sqrt(winRate * (1 - winRate) / Math.max(n, 1)) : 0;

  return {
    totalTrades: n,
    sampleSize: n,
    wins: wins.length,
    losses: losses.length,
    breakEvens: bes.length,
    winRate,
    lossRate,
    avgRR,
    avgProfit,
    avgLoss,
    expectancy,
    profitFactor,
    avgDurationMins: mean(features.map(f => f.tradeDurationMins)),
    maxDrawdownPct: maxDd,
    recoveryFactor,
    stdDevRR: sd,
    confidenceInterval95: {
      lower: Math.max(0, winRate - margin),
      upper: Math.min(1, winRate + margin),
    },
  };
}

// ─── Pattern Builder ──────────────────────────────────────────────────────────

function buildPattern(
  category: PatternCategory,
  key: string,
  description: string,
  conditions: Record<string, string>,
  features: ExtractedFeature[],
  dataQuality: number,
  version: string,
): PatternRecord {
  const stats = computePatternStats(features);
  const evidence = validateEvidence(stats, dataQuality, version);
  const trend = analyzeTrend(features);

  const supportingTradeIds = features.filter(f => f.outcome === "win").map(f => f.tradeId);
  const contradictingTradeIds = features.filter(f => f.outcome === "loss").map(f => f.tradeId);

  return {
    id: `${category}::${key}`,
    category,
    key,
    description,
    conditions,
    stats,
    evidence,
    trend,
    supportingTradeIds,
    contradictingTradeIds,
    lastValidationDate: new Date(),
    version,
  };
}

// ─── Pattern Analysis ─────────────────────────────────────────────────────────

export function analyzePatterns(
  features: ExtractedFeature[],
  dataQuality: number,
  version: string = PATTERN_ENGINE_VERSION,
): PatternRecord[] {
  if (features.length === 0) return [];

  const patterns: PatternRecord[] = [];

  // ── 1. By Trading Pair ────────────────────────────────────────────────────
  for (const pair of ["EURUSD", "GBPUSD", "USDJPY"] as const) {
    const group = features.filter(f => f.pair === pair);
    if (group.length === 0) continue;
    patterns.push(buildPattern(
      "pair", pair, `${pair} trading performance`,
      { pair }, group, dataQuality, version,
    ));
  }

  // ── 2. By Session ─────────────────────────────────────────────────────────
  const seenSessions = new Set(features.map(f => f.session));
  for (const session of seenSessions) {
    const group = features.filter(f => f.session === session);
    const label = session.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    patterns.push(buildPattern(
      "session", session, `${label} session performance`,
      { session }, group, dataQuality, version,
    ));
  }

  // ── 3. By Market Regime ───────────────────────────────────────────────────
  const seenRegimes = new Set(features.map(f => f.marketRegime));
  for (const regime of seenRegimes) {
    const group = features.filter(f => f.marketRegime === regime);
    const label = regime.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    patterns.push(buildPattern(
      "regime", regime, `${label} market regime`,
      { marketRegime: regime }, group, dataQuality, version,
    ));
  }

  // ── 4. By Zone Quality (Supply & Demand strength tier) ───────────────────
  for (const tier of ["low", "medium", "high"] as const) {
    const group = features.filter(f => qualityTier(Math.max(f.supplyQuality, f.demandQuality)) === tier);
    if (group.length === 0) continue;
    patterns.push(buildPattern(
      "zone_quality", tier, `${tier.charAt(0).toUpperCase() + tier.slice(1)} zone quality setups`,
      { zoneQuality: tier }, group, dataQuality, version,
    ));
  }

  // ── 5. By Liquidity Score ─────────────────────────────────────────────────
  for (const tier of ["low", "medium", "high"] as const) {
    const group = features.filter(f => qualityTier(f.liquidityScore) === tier);
    if (group.length === 0) continue;
    patterns.push(buildPattern(
      "liquidity", tier, `${tier.charAt(0).toUpperCase() + tier.slice(1)} liquidity score setups`,
      { liquidityTier: tier }, group, dataQuality, version,
    ));
  }

  // ── 6. By AMD Score ───────────────────────────────────────────────────────
  for (const tier of ["low", "medium", "high"] as const) {
    const group = features.filter(f => qualityTier(f.amdScore) === tier);
    if (group.length === 0) continue;
    patterns.push(buildPattern(
      "amd", tier, `${tier.charAt(0).toUpperCase() + tier.slice(1)} AMD quality setups`,
      { amdTier: tier }, group, dataQuality, version,
    ));
  }

  // ── 7. By Confirmation Quality ────────────────────────────────────────────
  for (const tier of ["low", "medium", "high"] as const) {
    const group = features.filter(f => qualityTier(f.confirmationQuality) === tier);
    if (group.length === 0) continue;
    patterns.push(buildPattern(
      "confirmation", tier, `${tier.charAt(0).toUpperCase() + tier.slice(1)} confirmation quality setups`,
      { confirmationTier: tier }, group, dataQuality, version,
    ));
  }

  // ── 8. By Volatility Level ────────────────────────────────────────────────
  const seenVols = new Set(features.map(f => f.volatility));
  for (const vol of seenVols) {
    const group = features.filter(f => f.volatility === vol);
    const label = vol.charAt(0).toUpperCase() + vol.slice(1);
    patterns.push(buildPattern(
      "volatility", vol, `${label} volatility environment`,
      { volatility: vol }, group, dataQuality, version,
    ));
  }

  // ── 9. By Risk Profile ────────────────────────────────────────────────────
  for (const profile of ["conservative", "balanced", "aggressive"] as const) {
    const group = features.filter(f => riskProfile(f) === profile);
    if (group.length === 0) continue;
    const label = profile.charAt(0).toUpperCase() + profile.slice(1);
    patterns.push(buildPattern(
      "risk_profile", profile, `${label} risk profile trades`,
      { riskProfile: profile }, group, dataQuality, version,
    ));
  }

  // ── 10. Pair × Session ────────────────────────────────────────────────────
  const pairSessionKeys = new Set<string>();
  for (const f of features) {
    pairSessionKeys.add(`${f.pair}|${f.session}`);
  }
  for (const key of pairSessionKeys) {
    const [pair, session] = key.split("|");
    const group = features.filter(f => f.pair === pair && f.session === session);
    if (group.length < MIN_EVIDENCE_SAMPLE) continue;
    const sessionLabel = session.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    patterns.push(buildPattern(
      "pair_session", key, `${pair} during ${sessionLabel}`,
      { pair, session }, group, dataQuality, version,
    ));
  }

  // ── 11. Pair × Regime ─────────────────────────────────────────────────────
  const pairRegimeKeys = new Set<string>();
  for (const f of features) {
    pairRegimeKeys.add(`${f.pair}|${f.marketRegime}`);
  }
  for (const key of pairRegimeKeys) {
    const [pair, regime] = key.split("|");
    const group = features.filter(f => f.pair === pair && f.marketRegime === regime);
    if (group.length < MIN_EVIDENCE_SAMPLE) continue;
    const regimeLabel = regime.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    patterns.push(buildPattern(
      "pair_regime", key, `${pair} in ${regimeLabel} regime`,
      { pair, regime }, group, dataQuality, version,
    ));
  }

  // ── 12. Session × Regime ──────────────────────────────────────────────────
  const sessionRegimeKeys = new Set<string>();
  for (const f of features) {
    sessionRegimeKeys.add(`${f.session}|${f.marketRegime}`);
  }
  for (const key of sessionRegimeKeys) {
    const [session, regime] = key.split("|");
    const group = features.filter(f => f.session === session && f.marketRegime === regime);
    if (group.length < MIN_EVIDENCE_SAMPLE) continue;
    const sLabel = session.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const rLabel = regime.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    patterns.push(buildPattern(
      "session_regime", key, `${sLabel} session in ${rLabel} regime`,
      { session, regime }, group, dataQuality, version,
    ));
  }

  return patterns;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function filterPatterns(patterns: PatternRecord[], filter: PatternFilter): PatternRecord[] {
  let out = patterns;
  if (filter.category !== undefined) out = out.filter(p => p.category === filter.category);
  if (filter.sufficientOnly) out = out.filter(p => !p.evidence.isInsufficient);
  if (filter.minSampleSize !== undefined) out = out.filter(p => p.stats.sampleSize >= filter.minSampleSize!);
  if (filter.minConfidence !== undefined) out = out.filter(p => p.evidence.statisticalConfidence >= filter.minConfidence!);
  if (filter.minWinRate !== undefined) out = out.filter(p => p.stats.winRate >= filter.minWinRate!);
  if (filter.maxWinRate !== undefined) out = out.filter(p => p.stats.winRate <= filter.maxWinRate!);
  return out;
}

export function rankPatterns(
  patterns: PatternRecord[],
  by: "win_rate" | "confidence" | "expectancy" | "sample_size",
): PatternRecord[] {
  return [...patterns].sort((a, b) => {
    switch (by) {
      case "win_rate": return b.stats.winRate - a.stats.winRate;
      case "confidence": return b.evidence.statisticalConfidence - a.evidence.statisticalConfidence;
      case "expectancy": return b.stats.expectancy - a.stats.expectancy;
      case "sample_size": return b.stats.sampleSize - a.stats.sampleSize;
    }
  });
}
