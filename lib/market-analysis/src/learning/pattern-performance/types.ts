// ─── Pattern Performance Types ───────────────────────────────────────────────
// Advisory only — never modifies trading behavior.
// Every stat always carries an explicit sampleSize.

export type PatternCategory =
  | "pair"
  | "session"
  | "regime"
  | "zone_quality"
  | "liquidity"
  | "amd"
  | "confirmation"
  | "volatility"
  | "risk_profile"
  | "pair_session"
  | "pair_regime"
  | "session_regime";

export type TrendStatus =
  | "improving"
  | "stable"
  | "declining"
  | "insufficient_data";

// ─── Evidence Thresholds ─────────────────────────────────────────────────────

export const MIN_EVIDENCE_SAMPLE = 5;        // below: show "Insufficient historical evidence."
export const MIN_RELIABLE_SAMPLE = 10;       // for basic statistical confidence
export const MIN_HIGH_CONFIDENCE_SAMPLE = 30;// for high confidence tier

// ─── Pattern Statistics ───────────────────────────────────────────────────────
// ALL fields always shown alongside sampleSize.

export interface PatternStats {
  totalTrades: number;
  sampleSize: number;                           // = totalTrades, explicit per requirement
  wins: number;
  losses: number;
  breakEvens: number;
  winRate: number;                              // 0–1
  lossRate: number;                             // 0–1
  avgRR: number;
  avgProfit: number;                            // avg pnl of winning trades
  avgLoss: number;                              // avg |pnl| of losing trades (positive)
  expectancy: number;                           // winRate*avgProfit − lossRate*avgLoss
  profitFactor: number;                         // grossProfit / |grossLoss|
  avgDurationMins: number;
  maxDrawdownPct: number;
  recoveryFactor: number;
  stdDevRR: number;
  confidenceInterval95: { lower: number; upper: number };
}

// ─── Pattern Evidence ─────────────────────────────────────────────────────────

export interface PatternEvidence {
  evidenceCount: number;
  statisticalConfidence: number;                // 0–100 (Wilson lower bound composite)
  dataQualityScore: number;                     // 0–100
  lastUpdated: Date;
  learningVersion: string;
  isInsufficient: boolean;
  insufficientReason?: string;
}

// ─── Pattern Trend ────────────────────────────────────────────────────────────

export interface PatternTrend {
  last30: PatternStats | null;
  last100: PatternStats | null;
  last500: PatternStats | null;
  direction: TrendStatus;
  directionConfidence: number;                  // 0–100
  explanation: string;
}

// ─── Pattern Record ───────────────────────────────────────────────────────────

export interface PatternRecord {
  id: string;                                   // deterministic: "category::key"
  category: PatternCategory;
  key: string;
  description: string;
  conditions: Record<string, string>;
  stats: PatternStats;
  evidence: PatternEvidence;
  trend: PatternTrend;
  supportingTradeIds: string[];
  contradictingTradeIds: string[];
  lastValidationDate: Date;
  version: string;
}

// ─── Pattern Filter ───────────────────────────────────────────────────────────

export interface PatternFilter {
  category?: PatternCategory;
  minSampleSize?: number;
  minConfidence?: number;
  minWinRate?: number;
  maxWinRate?: number;
  sufficientOnly?: boolean;
}

// ─── Pattern Report ───────────────────────────────────────────────────────────

export interface PatternReport {
  generatedAt: Date;
  version: string;
  totalPatterns: number;
  sufficientPatterns: number;
  bestByWinRate: PatternRecord[];
  worstByWinRate: PatternRecord[];
  bestSessions: PatternRecord[];
  worstSessions: PatternRecord[];
  bestRegimes: PatternRecord[];
  worstRegimes: PatternRecord[];
  highestConfidence: PatternRecord[];
  lowestConfidence: PatternRecord[];
  significantPatterns: PatternRecord[];
  recommendations: string[];
  markdownContent: string;
}
