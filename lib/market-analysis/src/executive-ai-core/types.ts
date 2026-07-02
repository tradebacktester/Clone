// ─── Executive AI Core — Types ────────────────────────────────────────────────
// Phase 7 · Decision Orchestrator

export const EAI_ENGINE_VERSION = "1.0.0";
export const EAI_DECISION_VERSION = "1.0.0";

// ─── Decision Types ───────────────────────────────────────────────────────────

export type EaiDecisionType =
  | "trade"
  | "wait"
  | "observe"
  | "reduce_risk"
  | "pause_trading"
  | "emergency_halt";

export const DECISION_LABELS: Record<EaiDecisionType, string> = {
  trade:          "Execute Trade",
  wait:           "Wait for Better Conditions",
  observe:        "Observe Only",
  reduce_risk:    "Reduce Risk Exposure",
  pause_trading:  "Pause Trading",
  emergency_halt: "Emergency Halt",
};

export const DECISION_DESCRIPTIONS: Record<EaiDecisionType, string> = {
  trade:          "All subsystems aligned — conditions meet institutional-grade entry criteria",
  wait:           "Strategy quality is acceptable but market conditions or risk factors are not yet optimal",
  observe:        "Mixed signals across subsystems — monitor for clearer alignment before entry",
  reduce_risk:    "Risk intelligence is elevated — reduce exposure and tighten risk parameters",
  pause_trading:  "Multiple subsystems are flagging significant concern — pause all new entries",
  emergency_halt: "Critical risk threshold breached — immediate halt of all trading activity required",
};

export const DECISION_THRESHOLD: Record<EaiDecisionType, number> = {
  trade:          80,
  wait:           65,
  observe:        45,
  reduce_risk:    30,
  pause_trading:  15,
  emergency_halt: 0,
};

// ─── Intelligence Inputs ──────────────────────────────────────────────────────

export interface StrategyIntelligence {
  executiveScore: number;       // 0-100
  rulePassRate: number;         // 0-100
  strategyStrength: number;     // 0-100
  ruleQualityScore: number;     // 0-100
  overallQualityScore: number;  // 0-100
  identitySimilarity: number;   // 0-100
  marketHealth: number;         // 0-100
  researchConfidence: number;   // 0-100
  recommendation: string;
  pair: string;
  session: string;
  regime: string;
}

export interface MarketIntelligence {
  regime: string;            // trending|ranging|volatile|low_volatility
  volatility: number;        // 0-100
  liquidity: number;         // 0-100
  correlation: number;       // 0-100 (higher = more correlated risk)
  opportunityScore: number;  // 0-100
  marketStability: number;   // 0-100
  trendStrength: number;     // 0-100
  healthScore: number;       // 0-100
  pair: string;
}

export interface RiskIntelligence {
  overallRiskScore: number;       // 0-100 (higher = worse)
  survivalScore: number;          // 0-100 (higher = better)
  capitalHealthScore: number;     // 0-100
  portfolioStabilityScore: number; // 0-100
  brokerReliabilityScore: number; // 0-100
  infrastructureScore: number;    // 0-100
  crisisStatus: string;           // none|caution|emergency|etc
  crisisSeverity: string;
  recommendation: string;
  survivalModeActive: boolean;
}

export interface MemoryIntelligence {
  similarTradeCount: number;
  historicalWinRate: number;      // 0-100
  averageRR: number;
  patternFrequency: number;       // 0-100
  historicalConfidence: number;   // 0-100
  lessonCount: number;
  positiveOutcomeRate: number;    // 0-100
}

export interface LearningIntelligence {
  overallConfidence: number;      // 0-100
  patternPerformanceScore: number; // 0-100
  predictionReliability: number;  // 0-100
  performanceDrift: number;       // -100 to 100 (positive = improving)
  validationStatus: string;
  cycleCount: number;
  sampleSize: number;
}

export interface IdentityIntelligence {
  identitySimilarityScore: number;    // 0-100
  preferenceAlignmentScore: number;   // 0-100
  historicalConsistency: number;      // 0-100
  identityConfidence: number;         // 0-100
  consistencyLevel: string;           // High|Moderate|Low
  stage: string;                      // rule_identity|adaptive_identity
  sampleSize: number;
}

export interface ResearchIntelligence {
  activeProjects: number;
  researchConfidence: number;     // 0-100
  candidateImprovements: number;
  experimentalResults: string;    // positive|neutral|negative|insufficient
  isAdvisoryOnly: true;
}

export interface EaiIntelligenceInput {
  pair: string;
  timeframe: string;
  strategy: StrategyIntelligence | null;
  market: MarketIntelligence | null;
  risk: RiskIntelligence | null;
  memory: MemoryIntelligence | null;
  learning: LearningIntelligence | null;
  identity: IdentityIntelligence | null;
  research: ResearchIntelligence | null;
}

// ─── Weighting System ─────────────────────────────────────────────────────────

export interface EaiWeights {
  strategy: number;  // 0.30
  market: number;    // 0.20
  risk: number;      // 0.25 (applied as safety: 100-riskScore)
  memory: number;    // 0.10
  learning: number;  // 0.08
  identity: number;  // 0.05
  research: number;  // 0.02
}

export const DEFAULT_EAI_WEIGHTS: EaiWeights = {
  strategy: 0.30,
  market:   0.20,
  risk:     0.25,
  memory:   0.10,
  learning: 0.08,
  identity: 0.05,
  research: 0.02,
};

// ─── Score Breakdown ──────────────────────────────────────────────────────────

export interface EaiDimensionScore {
  label: string;
  raw: number;        // pre-weighting score
  weight: number;
  weighted: number;
  dataQuality: "strong" | "moderate" | "weak" | "missing";
  trend: "improving" | "stable" | "degrading" | "unknown";
  calculation: string;
}

export interface EaiScoreBreakdown {
  strategy: EaiDimensionScore;
  market: EaiDimensionScore;
  risk: EaiDimensionScore;
  memory: EaiDimensionScore;
  learning: EaiDimensionScore;
  identity: EaiDimensionScore;
  research: EaiDimensionScore;
  composite: number;
  vetoApplied: boolean;
  vetoReason: string | null;
}

// ─── Confidence ───────────────────────────────────────────────────────────────

export interface EaiConfidence {
  overall: number;               // 0-100
  statistical: number;           // 0-100
  dataQuality: number;           // 0-100
  historicalReliability: number; // 0-100
  marketReliability: number;     // 0-100
  systemReliability: number;     // 0-100
  reliabilityRating: "high" | "moderate" | "low" | "insufficient";
  confidenceInterval: { lower: number; upper: number };
}

// ─── Conflict Resolution ──────────────────────────────────────────────────────

export type EaiConflictType =
  | "risk_vs_strategy"
  | "market_vs_strategy"
  | "memory_vs_learning"
  | "identity_vs_market"
  | "research_advisory"
  | "multi_system";

export type EaiConflictSeverity = "low" | "moderate" | "high" | "critical";

export interface EaiConflict {
  conflictId: string;
  type: EaiConflictType;
  severity: EaiConflictSeverity;
  systemA: string;
  systemB: string;
  scoreA: number;
  scoreB: number;
  divergence: number;
  winnerSystem: string;
  resolution: string;
  winningEvidence: string[];
  rejectedEvidence: string[];
  finalJustification: string;
}

// ─── Contribution ─────────────────────────────────────────────────────────────

export interface EaiContribution {
  system: string;
  score: number;
  weight: number;
  weightedContribution: number;
  position: "supporting" | "opposing" | "neutral";
  keyFinding: string;
  dataQuality: string;
}

// ─── Explainability ───────────────────────────────────────────────────────────

export interface EaiExplainability {
  whyThisDecision: string;
  agreedSystems: string[];
  disagreedSystems: string[];
  mostInfluentialSystem: string;
  topEvidence: string[];
  contraEvidence: string[];
  confidence: number;
  reliability: string;
  historicalReferences: string[];
  executiveSummary: string;
}

// ─── Version Info ─────────────────────────────────────────────────────────────

export interface EaiVersionInfo {
  engineVersion: string;
  decisionVersion: string;
  strategyVersion: string;
  riskVersion: string;
  marketVersion: string;
  weightsVersion: string;
}

// ─── Executive Decision Object ────────────────────────────────────────────────

export interface ExecutiveDecision {
  decisionId: string;
  timestamp: string;
  pair: string;
  timeframe: string;

  // Core
  decision: EaiDecisionType;
  decisionLabel: string;
  decisionDescription: string;
  executiveScore: number;
  executiveConfidence: EaiConfidence;

  // Breakdown
  scoreBreakdown: EaiScoreBreakdown;
  contributingSystems: EaiContribution[];

  // Conflicts
  conflicts: EaiConflict[];
  hasConflicts: boolean;

  // Explainability
  explainability: EaiExplainability;

  // Context
  marketRegime: string;
  riskState: string;
  crisisStatus: string;

  // Version
  versionInfo: EaiVersionInfo;

  // Advisory
  isAdvisoryOnly: true;
}

// ─── Run Input ────────────────────────────────────────────────────────────────

export interface RunEaiInput {
  pair?: string;
  timeframe?: string;
  weights?: Partial<EaiWeights>;
  // Injected intelligence (from DB queries in route)
  strategyResult?: Record<string, unknown> | null;
  riResult?: Record<string, unknown> | null;
  erbResult?: Record<string, unknown> | null;
  learningResult?: Record<string, unknown> | null;
  identityResult?: Record<string, unknown> | null;
  memoryResult?: Record<string, unknown> | null;
  researchResult?: Record<string, unknown> | null;
  marketResult?: Record<string, unknown> | null;
}
