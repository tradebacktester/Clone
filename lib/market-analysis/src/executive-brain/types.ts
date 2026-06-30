// ─── Executive Strategy Brain — Types ─────────────────────────────────────────
// All types for the Unified Strategy Intelligence Object and related structures.
// Advisory only. NEVER modifies production strategy.

export const ESB_ENGINE_VERSION = "1.0.0";

// ─── Score Weights (transparent + configurable) ───────────────────────────────

export interface EsbScoreWeights {
  ruleQuality:        number; // 0.20
  strategyStrength:   number; // 0.20
  historicalEvidence: number; // 0.18
  marketIntelligence: number; // 0.15
  traderIdentity:     number; // 0.12
  confidence:         number; // 0.10
  dataQuality:        number; // 0.05
}

export const DEFAULT_SCORE_WEIGHTS: EsbScoreWeights = {
  ruleQuality:        0.20,
  strategyStrength:   0.20,
  historicalEvidence: 0.18,
  marketIntelligence: 0.15,
  traderIdentity:     0.12,
  confidence:         0.10,
  dataQuality:        0.05,
};

// ─── Recommendation Levels ────────────────────────────────────────────────────

export type EsbRecommendation =
  | "elite"
  | "very_strong"
  | "strong"
  | "acceptable"
  | "borderline"
  | "weak"
  | "reject";

export const RECOMMENDATION_THRESHOLDS: Record<EsbRecommendation, number> = {
  elite:       90,
  very_strong: 80,
  strong:      70,
  acceptable:  60,
  borderline:  50,
  weak:        35,
  reject:       0,
};

export const RECOMMENDATION_LABELS: Record<EsbRecommendation, string> = {
  elite:       "Elite Trade",
  very_strong: "Very Strong",
  strong:      "Strong",
  acceptable:  "Acceptable",
  borderline:  "Borderline",
  weak:        "Weak",
  reject:      "Reject",
};

// ─── Reliability Ratings ──────────────────────────────────────────────────────

export type ReliabilityRating = "high" | "moderate" | "low" | "insufficient";

// ─── Rule Engine Summary ──────────────────────────────────────────────────────

export interface RuleEngineSummary {
  rulePassRate:     number;
  ruleIntegrity:    number;
  ruleConfidence:   number;
  passingRules:     number;
  totalRules:       number;
  failedRules:      number;
  exceptionalRules: number;
}

// ─── Strategy Reasoning Summary ───────────────────────────────────────────────

export interface StrategyReasoningSummary {
  strategyStrength:   number;
  strongestReasons:   string[];
  weakestReasons:     string[];
  confidence:         number;
  evidence:           number;
  reportId:           string | null;
  strengthTier:       string;
}

// ─── Strategy Quality Summary ─────────────────────────────────────────────────

export interface StrategyQualitySummary {
  overallQualityScore:  number;
  structuralQuality:    number;
  liquidityQuality:     number;
  amdQuality:           number;
  confirmationQuality:  number;
  historicalQuality:    number;
  classification:       string;
  reportId:             string | null;
}

// ─── Trader Identity Summary ──────────────────────────────────────────────────

export interface TraderIdentitySummary {
  identitySimilarity:    number;
  preferenceAlignment:   number;
  historicalConsistency: number;
  driftStatus:           string;
  reportId:              string | null;
}

// ─── Historical Intelligence ──────────────────────────────────────────────────

export interface HistoricalIntelligence {
  similarTrades:       SimilarTradeRef[];
  historicalWinRate:   number;
  profitFactor:        number;
  averageRR:           number;
  historicalExpectancy: number;
  sampleSize:          number;
}

export interface SimilarTradeRef {
  tradeId:    string;
  pair:       string;
  session:    string;
  regime:     string;
  outcome:    string;
  rrActual:   number;
  similarity: number;
  openedAt:   Date | null;
}

// ─── Market Intelligence Summary ──────────────────────────────────────────────

export interface MarketIntelligenceSummary {
  marketHealth:      number;
  opportunityScore:  number;
  marketRegime:      string;
  trend:             string;
  volatility:        number;
  liquidity:         number;
  correlation:       number;
  stability:         number;
}

// ─── Research Intelligence Summary ───────────────────────────────────────────

export interface ResearchIntelligenceSummary {
  activeHypotheses:           number;
  candidateImprovements:      number;
  experimentalStrategyStatus: string;
  latestResearchConfidence:   number;
  pendingDeploymentRequests:  number;
}

// ─── Explainability Bundle ────────────────────────────────────────────────────

export interface ExplainabilityBundle {
  supportingRules:          string[];
  supportingHistoricalEvidence: string[];
  supportingMarketEvidence: string[];
  supportingStatisticalEvidence: string[];
  confidenceInterval:       { lower: number; upper: number };
  reliabilityRating:        ReliabilityRating;
  sampleSize:               number;
  historicalReferences:     SimilarTradeRef[];
}

// ─── Score Breakdown ──────────────────────────────────────────────────────────

export interface EsbScoreBreakdown {
  ruleQuality:        { raw: number; weighted: number; weight: number };
  strategyStrength:   { raw: number; weighted: number; weight: number };
  historicalEvidence: { raw: number; weighted: number; weight: number };
  marketIntelligence: { raw: number; weighted: number; weight: number };
  traderIdentity:     { raw: number; weighted: number; weight: number };
  confidence:         { raw: number; weighted: number; weight: number };
  dataQuality:        { raw: number; weighted: number; weight: number };
  total:              number;
}

// ─── Unified Strategy Intelligence Object ─────────────────────────────────────
// The canonical output of the Executive Strategy Brain.

export interface UnifiedStrategyIntelligenceObject {
  reportId:      string;
  engineVersion: string;
  evaluatedAt:   Date;
  isAdvisoryOnly: true;

  // Subsystem versions
  versions: {
    sr:       string;
    sqi:      string;
    ti:       string;
    research: string;
    market:   string;
  };

  // Setup context
  setup: {
    pair:       string;
    session:    string;
    regime:     string;
    trend:      string;
    volatility: string;
  };

  // ── Component intelligence ──────────────────────────────────────
  ruleEngine:           RuleEngineSummary;
  strategyReasoning:    StrategyReasoningSummary;
  strategyQuality:      StrategyQualitySummary;
  traderIdentity:       TraderIdentitySummary;
  historicalIntelligence: HistoricalIntelligence;
  marketIntelligence:   MarketIntelligenceSummary;
  researchIntelligence: ResearchIntelligenceSummary;

  // ── Executive output ────────────────────────────────────────────
  executiveScore:          number;
  scoreWeights:            EsbScoreWeights;
  scoreBreakdown:          EsbScoreBreakdown;
  recommendation:          EsbRecommendation;
  recommendationLabel:     string;
  recommendationRationale: string;
  explainability:          ExplainabilityBundle;
}

// ─── Certification types ──────────────────────────────────────────────────────

export type CertificationStatus = "certified" | "conditional" | "failed";
export type CertificationGrade  = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C" | "D" | "F";

export interface SubsystemCertification {
  name:          string;
  score:         number;
  status:        "pass" | "conditional" | "fail";
  findings:      string[];
  recommendations: string[];
}

export interface CertificationReport {
  certId:          string;
  engineVersion:   string;
  certifiedAt:     Date;

  overallScore:        number;
  certificationStatus: CertificationStatus;
  grade:               CertificationGrade;

  subsystems: {
    ruleConsistency:           SubsystemCertification;
    statisticalValidity:       SubsystemCertification;
    explainability:            SubsystemCertification;
    historicalReproducibility: SubsystemCertification;
    identityIntegrity:         SubsystemCertification;
    learningIntegrity:         SubsystemCertification;
    researchIsolation:         SubsystemCertification;
    apiStability:              SubsystemCertification;
    dashboardFunctionality:    SubsystemCertification;
    performance:               SubsystemCertification;
    scalability:               SubsystemCertification;
  };

  subsystemReadiness: Record<string, number>;
  criticalIssues:     string[];
  warnings:           string[];
  recommendations:    string[];
  technicalDebt:      string[];

  phase6Readiness:    number;
  phase6ReadinessLabel: string;
}

// ─── Input ────────────────────────────────────────────────────────────────────

export interface EsbSetupInput {
  setupId?:            string;
  pair:                string;
  session:             string;
  regime:              string;
  trend:               string;
  volatility:          string;
  supplyQuality?:      number;
  demandQuality?:      number;
  liquidityScore?:     number;
  amdScore?:           number;
  confirmationQuality?: number;
  setupScore?:         number;
  tqi?:                number;
  rrPlanned?:          number;
  spreadPips?:         number;
  direction?:          "buy" | "sell";
}
