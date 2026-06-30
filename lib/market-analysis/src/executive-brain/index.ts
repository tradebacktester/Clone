// ─── Executive Strategy Brain — Main Engine ───────────────────────────────────
// Unifies all Phase 5 Strategy Intelligence components into one canonical
// Unified Strategy Intelligence Object.
// Advisory only. NEVER modifies production strategy or bypasses approval.

import { randomUUID } from "crypto";
import type {
  EsbSetupInput,
  UnifiedStrategyIntelligenceObject,
  RuleEngineSummary,
  StrategyReasoningSummary,
  StrategyQualitySummary,
  TraderIdentitySummary,
  HistoricalIntelligence,
  MarketIntelligenceSummary,
  ResearchIntelligenceSummary,
  EsbScoreWeights,
} from "./types.js";
import { ESB_ENGINE_VERSION, DEFAULT_SCORE_WEIGHTS } from "./types.js";
import { computeExecutiveScore } from "./scorer.js";
import { scoreToRecommendation, recommendationLabel, buildRationale } from "./recommender.js";
import { buildExplainability } from "./explainer.js";
import { runCertification } from "./certification.js";
import type { AuditContext } from "./certification.js";

export { ESB_ENGINE_VERSION } from "./types.js";
export { DEFAULT_SCORE_WEIGHTS } from "./types.js";
export { runCertification } from "./certification.js";
export type { UnifiedStrategyIntelligenceObject, EsbSetupInput, EsbScoreWeights } from "./types.js";
export type { CertificationReport, AuditContext } from "./certification.js";

// ─── Default/fallback constructors ────────────────────────────────────────────

function defaultRuleEngine(): RuleEngineSummary {
  return { rulePassRate: 0, ruleIntegrity: 0, ruleConfidence: 0, passingRules: 0, totalRules: 0, failedRules: 0, exceptionalRules: 0 };
}
function defaultReasoning(): StrategyReasoningSummary {
  return { strategyStrength: 0, strongestReasons: [], weakestReasons: [], confidence: 0, evidence: 0, reportId: null, strengthTier: "insufficient" };
}
function defaultQuality(): StrategyQualitySummary {
  return { overallQualityScore: 0, structuralQuality: 0, liquidityQuality: 0, amdQuality: 0, confirmationQuality: 0, historicalQuality: 0, classification: "unknown", reportId: null };
}
function defaultIdentity(): TraderIdentitySummary {
  return { identitySimilarity: 50, preferenceAlignment: 50, historicalConsistency: 50, driftStatus: "stable", reportId: null };
}
function defaultHist(): HistoricalIntelligence {
  return { similarTrades: [], historicalWinRate: 0, profitFactor: 0, averageRR: 0, historicalExpectancy: 0, sampleSize: 0 };
}
function defaultMarket(): MarketIntelligenceSummary {
  return { marketHealth: 50, opportunityScore: 50, marketRegime: "unknown", trend: "unknown", volatility: 50, liquidity: 50, correlation: 50, stability: 50 };
}
function defaultResearch(): ResearchIntelligenceSummary {
  return { activeHypotheses: 0, candidateImprovements: 0, experimentalStrategyStatus: "idle", latestResearchConfidence: 0, pendingDeploymentRequests: 0 };
}

// ─── Input builders from raw Phase 5 data ────────────────────────────────────

export function buildRuleEngineSummary(srReport: {
  passingRules?: number | string | null;
  totalRules?: number | string | null;
  failedRules?: number | string | null;
  barelyPassed?: number | string | null;
  exceptionalRules?: number | string | null;
  ruleQualityScore?: number | string | null;
  confidenceScore?: number | string | null;
} | null): RuleEngineSummary {
  if (!srReport) return defaultRuleEngine();
  const passing    = Number(srReport.passingRules ?? 0);
  const total      = Number(srReport.totalRules ?? 0);
  const failed     = Number(srReport.failedRules ?? 0);
  const exceptional = Number(srReport.exceptionalRules ?? 0);
  const integrity  = Number(srReport.ruleQualityScore ?? 0);
  const confidence = Number(srReport.confidenceScore ?? 0);
  const passRate   = total > 0 ? (passing / total) * 100 : 0;
  return { rulePassRate: passRate, ruleIntegrity: integrity, ruleConfidence: confidence, passingRules: passing, totalRules: total, failedRules: failed, exceptionalRules: exceptional };
}

export function buildReasoningSummary(srReport: {
  strategyStrengthScore?: number | string | null;
  confidenceScore?: number | string | null;
  evidenceCount?: number | null;
  strongestFactors?: unknown;
  weakestFactors?: unknown;
  reportId?: string | null;
  strengthTier?: string | null;
  historicalWinRate?: number | string | null;
  averageRR?: number | string | null;
  profitFactor?: number | string | null;
  statisticalExpectancy?: number | string | null;
} | null): StrategyReasoningSummary {
  if (!srReport) return defaultReasoning();
  const strongest = Array.isArray(srReport.strongestFactors) ? srReport.strongestFactors.slice(0, 3).map((f: unknown) => typeof f === "object" && f !== null && "name" in f ? String((f as { name: unknown }).name) : String(f)) : [];
  const weakest   = Array.isArray(srReport.weakestFactors)   ? srReport.weakestFactors.slice(0, 3).map((f: unknown)   => typeof f === "object" && f !== null && "name" in f ? String((f as { name: unknown }).name) : String(f)) : [];
  return {
    strategyStrength: Number(srReport.strategyStrengthScore ?? 0),
    strongestReasons: strongest,
    weakestReasons:   weakest,
    confidence:       Number(srReport.confidenceScore ?? 0),
    evidence:         Number(srReport.evidenceCount ?? 0),
    reportId:         srReport.reportId ?? null,
    strengthTier:     srReport.strengthTier ?? "insufficient",
  };
}

export function buildQualitySummary(sqiReport: {
  strategyQualityScore?: number | string | null;
  structuralQualityScore?: number | string | null;
  liquidityIntelligenceScore?: number | string | null;
  amdIntelligenceScore?: number | string | null;
  confirmationIntelligenceScore?: number | string | null;
  historicalIntelligenceScore?: number | string | null;
  classification?: string | null;
  reportId?: string | null;
} | null): StrategyQualitySummary {
  if (!sqiReport) return defaultQuality();
  return {
    overallQualityScore:  Number(sqiReport.strategyQualityScore ?? 0),
    structuralQuality:    Number(sqiReport.structuralQualityScore ?? 0),
    liquidityQuality:     Number(sqiReport.liquidityIntelligenceScore ?? 0),
    amdQuality:           Number(sqiReport.amdIntelligenceScore ?? 0),
    confirmationQuality:  Number(sqiReport.confirmationIntelligenceScore ?? 0),
    historicalQuality:    Number(sqiReport.historicalIntelligenceScore ?? 0),
    classification:       sqiReport.classification ?? "unknown",
    reportId:             sqiReport.reportId ?? null,
  };
}

export function buildIdentitySummary(tiReport: {
  overallSimilarity?: number | string | null;
  preferenceAlignment?: number | string | null;
  historicalConsistency?: number | string | null;
  driftStatus?: string | null;
  reportId?: string | null;
} | null): TraderIdentitySummary {
  if (!tiReport) return defaultIdentity();
  return {
    identitySimilarity:    Number(tiReport.overallSimilarity   ?? 50),
    preferenceAlignment:   Number(tiReport.preferenceAlignment ?? 50),
    historicalConsistency: Number(tiReport.historicalConsistency ?? 50),
    driftStatus:           tiReport.driftStatus ?? "stable",
    reportId:              tiReport.reportId ?? null,
  };
}

export function buildHistoricalIntelligence(srReport: {
  evidenceCount?: number | null;
  winCount?: number | null;
  historicalWinRate?: number | string | null;
  profitFactor?: number | string | null;
  averageRR?: number | string | null;
  statisticalExpectancy?: number | string | null;
  similarTrades?: unknown;
} | null): HistoricalIntelligence {
  if (!srReport) return defaultHist();
  const rawTrades = Array.isArray(srReport.similarTrades) ? srReport.similarTrades : [];
  const trades = rawTrades.map((t: unknown) => {
    if (typeof t !== "object" || t === null) return null;
    const tr = t as Record<string, unknown>;
    return {
      tradeId:    String(tr.tradeId ?? tr.trade_id ?? ""),
      pair:       String(tr.pair ?? ""),
      session:    String(tr.session ?? ""),
      regime:     String(tr.regime ?? ""),
      outcome:    String(tr.outcome ?? ""),
      rrActual:   Number(tr.rrActual ?? tr.rr_actual ?? 0),
      similarity: Number(tr.similarity ?? 0),
      openedAt:   tr.openedAt ? new Date(String(tr.openedAt)) : null,
    };
  }).filter((t): t is NonNullable<typeof t> => t !== null);

  return {
    similarTrades:        trades,
    historicalWinRate:    Number(srReport.historicalWinRate ?? 0),
    profitFactor:         Number(srReport.profitFactor ?? 0),
    averageRR:            Number(srReport.averageRR ?? 0),
    historicalExpectancy: Number(srReport.statisticalExpectancy ?? 0),
    sampleSize:           Number(srReport.evidenceCount ?? 0),
  };
}

export function buildMarketSummary(mktReport: {
  healthScore?: number | string | null;
  opportunityScore?: number | string | null;
  regime?: string | null;
  trend?: string | null;
  volatility?: number | string | null;
  liquidity?: number | string | null;
  correlation?: number | string | null;
  stability?: number | string | null;
} | null): MarketIntelligenceSummary {
  if (!mktReport) return defaultMarket();
  return {
    marketHealth:      Number(mktReport.healthScore     ?? 50),
    opportunityScore:  Number(mktReport.opportunityScore ?? 50),
    marketRegime:      mktReport.regime    ?? "unknown",
    trend:             mktReport.trend     ?? "unknown",
    volatility:        Number(mktReport.volatility  ?? 50),
    liquidity:         Number(mktReport.liquidity   ?? 50),
    correlation:       Number(mktReport.correlation ?? 50),
    stability:         Number(mktReport.stability   ?? 50),
  };
}

export function buildResearchSummary(researchStats: {
  activeHypotheses?: number | null;
  candidateImprovements?: number | null;
  experimentStatus?: string | null;
  researchConfidence?: number | string | null;
  pendingDeployments?: number | null;
} | null): ResearchIntelligenceSummary {
  if (!researchStats) return defaultResearch();
  return {
    activeHypotheses:           Number(researchStats.activeHypotheses    ?? 0),
    candidateImprovements:      Number(researchStats.candidateImprovements ?? 0),
    experimentalStrategyStatus: researchStats.experimentStatus ?? "idle",
    latestResearchConfidence:   Number(researchStats.researchConfidence   ?? 0),
    pendingDeploymentRequests:  Number(researchStats.pendingDeployments   ?? 0),
  };
}

// ─── Main engine ──────────────────────────────────────────────────────────────

export interface RunEsbInput {
  setup:    EsbSetupInput;
  srReport?: Record<string, unknown> | null;
  sqiReport?: Record<string, unknown> | null;
  tiReport?: Record<string, unknown> | null;
  mktReport?: Record<string, unknown> | null;
  researchStats?: Record<string, unknown> | null;
  weights?: Partial<EsbScoreWeights>;
  // Subsystem version strings
  srVersion?:       string;
  sqiVersion?:      string;
  tiVersion?:       string;
  researchVersion?: string;
  marketVersion?:   string;
}

export async function runExecutiveBrain(
  input: RunEsbInput,
): Promise<UnifiedStrategyIntelligenceObject> {
  const reportId = randomUUID();
  const evaluatedAt = new Date();

  // ── Build component summaries ───────────────────────────────────
  const ruleEngine   = buildRuleEngineSummary(input.srReport ?? null);
  const reasoning    = buildReasoningSummary(input.srReport ?? null);
  const quality      = buildQualitySummary(input.sqiReport ?? null);
  const identity     = buildIdentitySummary(input.tiReport ?? null);
  const hist         = buildHistoricalIntelligence(input.srReport ?? null);
  const mkt          = buildMarketSummary(input.mktReport ?? null);
  const research     = buildResearchSummary(input.researchStats ?? null);

  // ── Scoring ─────────────────────────────────────────────────────
  const { executiveScore, weights, breakdown } = computeExecutiveScore({
    rule: ruleEngine, reasoning, quality, ti: identity, hist, mkt, weights: input.weights,
  });

  // ── Recommendation ───────────────────────────────────────────────
  const rec   = scoreToRecommendation(executiveScore);
  const label = recommendationLabel(rec);
  const rationale = buildRationale(
    executiveScore, rec, breakdown, ruleEngine, reasoning, quality, identity, hist, mkt, research,
  );

  // ── Explainability ───────────────────────────────────────────────
  const explainability = buildExplainability(
    breakdown, ruleEngine, reasoning, quality, identity, hist, mkt, research,
  );

  return {
    reportId,
    engineVersion: ESB_ENGINE_VERSION,
    evaluatedAt,
    isAdvisoryOnly: true,

    versions: {
      sr:       input.srVersion       ?? "unknown",
      sqi:      input.sqiVersion      ?? "unknown",
      ti:       input.tiVersion       ?? "unknown",
      research: input.researchVersion ?? "unknown",
      market:   input.marketVersion   ?? "unknown",
    },

    setup: {
      pair:       input.setup.pair,
      session:    input.setup.session,
      regime:     input.setup.regime,
      trend:      input.setup.trend,
      volatility: input.setup.volatility,
    },

    ruleEngine,
    strategyReasoning:    reasoning,
    strategyQuality:      quality,
    traderIdentity:       identity,
    historicalIntelligence: hist,
    marketIntelligence:   mkt,
    researchIntelligence: research,

    executiveScore,
    scoreWeights:            weights,
    scoreBreakdown:          breakdown,
    recommendation:          rec,
    recommendationLabel:     label,
    recommendationRationale: rationale,
    explainability,
  };
}
