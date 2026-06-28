// ─── Feature Extractor ──────────────────────────────────────────────────────
// Converts RawTradeRecords into normalised ExtractedFeature objects.
// All features are numeric and reproducible from the same inputs.
// Stored separately for future ML pipelines.

import type {
  RawTradeRecord,
  ExtractedFeature,
  Pair,
  Session,
  MarketRegime,
  TrendDirection,
  VolatilityLevel,
  TradeOutcome,
} from "../learning-core/types.js";
import { toNumber, clamp } from "../learning-validation/data-validator.js";

// ─── Normalisation constants ────────────────────────────────────────────────

const PAIR_MAP: Record<string, Pair> = {
  EURUSD: "EURUSD",
  GBPUSD: "GBPUSD",
  USDJPY: "USDJPY",
};

const SESSION_MAP: Record<string, Session> = {
  london: "london",
  new_york: "new_york",
  newyork: "new_york",
  ny: "new_york",
  asian: "asian",
};

const REGIME_MAP: Record<string, MarketRegime> = {
  trending: "trending",
  ranging: "ranging",
  volatile: "volatile",
  low_volatility: "low_volatility",
};

const OUTCOME_MAP: Record<string, TradeOutcome> = {
  win: "win",
  loss: "loss",
  break_even: "break_even",
  breakeven: "break_even",
};

// ─── Feature Extraction ──────────────────────────────────────────────────────

export function extractFeatures(records: RawTradeRecord[]): ExtractedFeature[] {
  return records
    .filter(r => r.outcome && OUTCOME_MAP[r.outcome.toLowerCase()])
    .map(r => extractSingleFeature(r))
    .filter((f): f is ExtractedFeature => f !== null);
}

function extractSingleFeature(rec: RawTradeRecord): ExtractedFeature | null {
  const outcome = OUTCOME_MAP[(rec.outcome || "").toLowerCase()];
  if (!outcome) return null;

  const pair = normalisePair(rec.pair);
  const session = normaliseSession(rec.session);
  const regime = normaliseRegime(rec.regime);

  const direction = (rec.direction || "").toLowerCase();
  const zoneScore = clamp(toNumber(rec.zoneScore) ?? 50, 0, 100);
  const liquidityScore = clamp(toNumber(rec.liquidityScore) ?? 50, 0, 100);
  const amdScore = clamp(toNumber(rec.amdScore) ?? 50, 0, 100);
  const confirmationScore = clamp(toNumber(rec.confirmationScore) ?? 50, 0, 100);
  const setupScore = clamp(toNumber(rec.finalScore) ?? toNumber(rec.setupScore) ?? 50, 0, 100);
  const confidence = clamp(toNumber(rec.confidence) ?? 50, 0, 100);
  const tqi = clamp(toNumber(rec.tqi) ?? 50, 0, 100);
  const rrPlanned = clamp(toNumber(rec.riskRewardPlanned) ?? 1, 0, 20);
  const rrActual = clamp(toNumber(rec.riskRewardActual) ?? deriveRRFromOutcome(outcome, rrPlanned), -5, 20);
  const pnl = toNumber(rec.pnl) ?? 0;
  const pnlPercent = toNumber(rec.pnlPercent) ?? 0;
  const spread = clamp(toNumber(rec.spreadPips) ?? 0, 0, 20);
  const durationMins = clamp(typeof rec.timeInTradeMins === "number" ? rec.timeInTradeMins : 0, 0, 10000);

  // Supply = zone quality when selling; Demand = zone quality when buying
  const supplyQuality = direction === "sell" || direction === "short" ? zoneScore : 0;
  const demandQuality = direction === "buy" || direction === "long" ? zoneScore : 0;

  const volatility = deriveVolatility(regime, toNumber(rec.regimeConfidence));
  const trend = deriveTrend(regime, direction);

  const openedAt = toDate(rec.openedAt) ?? new Date(0);
  const closedAt = toDate(rec.closedAt) ?? null;

  return {
    tradeId: String(rec.id),
    pair,
    session,
    trend,
    marketRegime: regime,
    supplyQuality,
    demandQuality,
    liquidityScore,
    amdScore,
    confirmationQuality: confirmationScore,
    tradeDurationMins: durationMins,
    spreadPips: spread,
    volatility,
    riskPct: 0,              // not stored in trade_memory directly; default 0
    rrPlanned,
    rrActual,
    outcome,
    pnl,
    pnlPercent,
    setupScore,
    confidence,
    tqi,
    openedAt,
    closedAt,
  };
}

// ─── Feature Summary ─────────────────────────────────────────────────────────
// Returns a JSON-serialisable summary row per feature set — stored for future ML.

export interface FeatureSummary {
  extractedAt: Date;
  count: number;
  pairCounts: Record<string, number>;
  sessionCounts: Record<string, number>;
  regimeCounts: Record<string, number>;
  outcomeCounts: Record<string, number>;
  avgSetupScore: number;
  avgLiquidityScore: number;
  avgAmdScore: number;
  avgConfirmationScore: number;
  avgConfidence: number;
  avgTqi: number;
  avgRrPlanned: number;
  avgRrActual: number;
  avgDurationMins: number;
}

export function buildFeatureSummary(features: ExtractedFeature[]): FeatureSummary {
  if (features.length === 0) {
    return {
      extractedAt: new Date(),
      count: 0,
      pairCounts: {},
      sessionCounts: {},
      regimeCounts: {},
      outcomeCounts: {},
      avgSetupScore: 0,
      avgLiquidityScore: 0,
      avgAmdScore: 0,
      avgConfirmationScore: 0,
      avgConfidence: 0,
      avgTqi: 0,
      avgRrPlanned: 0,
      avgRrActual: 0,
      avgDurationMins: 0,
    };
  }

  const n = features.length;
  const avg = (vals: number[]) => vals.reduce((s, v) => s + v, 0) / vals.length;
  const countBy = <K extends string>(vals: K[]): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const v of vals) counts[v] = (counts[v] ?? 0) + 1;
    return counts;
  };

  return {
    extractedAt: new Date(),
    count: n,
    pairCounts: countBy(features.map(f => f.pair)),
    sessionCounts: countBy(features.map(f => f.session)),
    regimeCounts: countBy(features.map(f => f.marketRegime)),
    outcomeCounts: countBy(features.map(f => f.outcome)),
    avgSetupScore: avg(features.map(f => f.setupScore)),
    avgLiquidityScore: avg(features.map(f => f.liquidityScore)),
    avgAmdScore: avg(features.map(f => f.amdScore)),
    avgConfirmationScore: avg(features.map(f => f.confirmationQuality)),
    avgConfidence: avg(features.map(f => f.confidence)),
    avgTqi: avg(features.map(f => f.tqi)),
    avgRrPlanned: avg(features.map(f => f.rrPlanned)),
    avgRrActual: avg(features.map(f => f.rrActual)),
    avgDurationMins: avg(features.map(f => f.tradeDurationMins)),
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function normalisePair(raw: string | undefined | null): Pair {
  if (!raw) return "EURUSD";
  return PAIR_MAP[raw.toUpperCase().replace("/", "")] ?? "EURUSD";
}

function normaliseSession(raw: string | undefined | null): Session {
  if (!raw) return "unknown";
  return SESSION_MAP[raw.toLowerCase().replace(/\s+/g, "_")] ?? "unknown";
}

function normaliseRegime(raw: string | undefined | null): MarketRegime {
  if (!raw) return "unknown";
  return REGIME_MAP[raw.toLowerCase()] ?? "unknown";
}

function deriveVolatility(regime: MarketRegime, regimeConf: number | null): VolatilityLevel {
  if (regime === "volatile") return "high";
  if (regime === "low_volatility") return "low";
  // For trending/ranging, use confidence as proxy
  const conf = regimeConf ?? 50;
  if (conf >= 75) return "low";
  if (conf >= 40) return "medium";
  return "high";
}

function deriveTrend(regime: MarketRegime, direction: string): TrendDirection {
  if (regime === "trending") {
    if (direction === "buy" || direction === "long") return "bullish";
    if (direction === "sell" || direction === "short") return "bearish";
  }
  if (regime === "ranging") return "ranging";
  // Default: infer from direction
  if (direction === "buy" || direction === "long") return "bullish";
  if (direction === "sell" || direction === "short") return "bearish";
  return "ranging";
}

function deriveRRFromOutcome(outcome: TradeOutcome, rrPlanned: number): number {
  switch (outcome) {
    case "win": return rrPlanned * 0.8;    // conservative estimate
    case "loss": return -1;
    case "break_even": return 0;
  }
}

function toDate(val: Date | string | null | undefined): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}
