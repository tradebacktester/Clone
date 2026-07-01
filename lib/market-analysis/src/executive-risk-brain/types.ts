// ─── Executive Risk Brain — Types ─────────────────────────────────────────────
// Complete type definitions for the Executive Risk Intelligence Object.
// Advisory only. NEVER modifies strategy, positions, or safety limits.

export const ERB_ENGINE_VERSION = "1.0.0";
export const ERB_RISK_VERSION   = "1.0.0";

// ─── 7-Level Risk Recommendation ──────────────────────────────────────────────

export type ErbRecommendation =
  | "trade_normally"
  | "reduced_risk"
  | "restrict_exposure"
  | "observation_mode"
  | "defensive_mode"
  | "survival_mode"
  | "emergency_stop";

export const ERB_RECOMMENDATION_THRESHOLDS: Record<ErbRecommendation, number> = {
  trade_normally:    0,   // overallRiskScore < 20
  reduced_risk:      20,  // 20-39
  restrict_exposure: 40,  // 40-54
  observation_mode:  55,  // 55-64
  defensive_mode:    65,  // 65-74
  survival_mode:     75,  // 75-84
  emergency_stop:    85,  // 85+
};

export const ERB_RECOMMENDATION_LABELS: Record<ErbRecommendation, string> = {
  trade_normally:    "Trade Normally",
  reduced_risk:      "Trade with Reduced Risk",
  restrict_exposure: "Restrict Exposure",
  observation_mode:  "Observation Mode",
  defensive_mode:    "Defensive Mode",
  survival_mode:     "Survival Mode",
  emergency_stop:    "Emergency Stop",
};

export const ERB_RECOMMENDATION_DESCRIPTIONS: Record<ErbRecommendation, string> = {
  trade_normally:    "All risk dimensions within acceptable parameters. Normal trading operations permitted.",
  reduced_risk:      "Elevated risk detected in one or more dimensions. Reduce position sizes by 25-50%.",
  restrict_exposure: "Multiple risk dimensions elevated. Limit new trades, monitor closely.",
  observation_mode:  "Risk conditions warrant pausing new trade entry. Manage existing positions only.",
  defensive_mode:    "High risk detected. Close marginal positions, tighten stops, no new entries.",
  survival_mode:     "Critical risk conditions. Emergency position reduction in progress. Capital preservation priority.",
  emergency_stop:    "Extreme risk. All trading halted. Immediate human review required.",
};

// ─── Account Intelligence ──────────────────────────────────────────────────────

export interface ErbAccountIntelligence {
  balance:            number;
  equity:             number;
  freeMargin:         number;
  marginLevel:        number;
  dailyPnl:           number;
  weeklyPnl:          number;
  monthlyPnl:         number;
  drawdownPct:        number;
  accountHealthScore: number;
}

// ─── Position Intelligence ─────────────────────────────────────────────────────

export interface ErbPositionIntelligence {
  positionSize:      number;
  riskPct:           number;
  stopDistance:      number;
  expectedRR:        number;
  positionExposure:  number;
  positionRiskScore: number;
}

// ─── Portfolio Intelligence ────────────────────────────────────────────────────

export interface ErbPortfolioIntelligence {
  openTrades:          number;
  currencyExposure:    Record<string, number>;
  pairExposure:        Record<string, number>;
  correlationExposure: number;
  directionalBias:     number;
  portfolioRiskScore:  number;
}

// ─── Market Risk Intelligence ──────────────────────────────────────────────────

export interface ErbMarketIntelligence {
  marketHealth:    number;
  marketRegime:    string;
  volatility:      number;
  liquidity:       number;
  correlation:     number;
  opportunityScore: number;
  marketRiskScore: number;
}

// ─── Broker Intelligence ───────────────────────────────────────────────────────

export interface ErbBrokerIntelligence {
  spread:               number;
  slippage:             number;
  latency:              number;
  executionTime:        number;
  connectionStability:  number;
  brokerReliabilityScore: number;
}

// ─── Infrastructure Intelligence ──────────────────────────────────────────────

export interface ErbInfrastructureIntelligence {
  cpuUsage:       number;
  memoryUsage:    number;
  dbHealth:       number;
  networkLatency: number;
  apiStatus:      number;
  dataFeedHealth: number;
  systemHealthScore: number;
}

// ─── Adaptive Risk Intelligence ────────────────────────────────────────────────

export interface ErbAdaptiveIntelligence {
  currentRiskProfile:     string;
  recommendedRiskProfile: string;
  confidence:             number;
  historicalPerformance:  Record<string, number>;
  adaptationConfidence:   number;
}

// ─── Crisis Intelligence ───────────────────────────────────────────────────────

export interface ErbCrisisIntelligence {
  crisisStatus:     string;
  crisisSeverity:   string;
  survivalModeActive: boolean;
  recoveryStage:    string;
  recoveryProgress: number;
}

// ─── Executive Risk Score Breakdown ───────────────────────────────────────────

export interface ErbScoreDimension {
  raw:        number;
  weighted:   number;
  weight:     number;
  label:      string;
  calculation: string;
}

export interface ErbScoreBreakdown {
  accountHealth:      ErbScoreDimension;
  positionRisk:       ErbScoreDimension;
  portfolioStability: ErbScoreDimension;
  marketRisk:         ErbScoreDimension;
  brokerReliability:  ErbScoreDimension;
  systemHealth:       ErbScoreDimension;
  crisisScore:        ErbScoreDimension;
  adaptiveRisk:       ErbScoreDimension;
  total:              number;
}

export interface ErbScoreWeights {
  accountHealth:      number; // 0.25
  positionRisk:       number; // 0.15
  portfolioStability: number; // 0.15
  marketRisk:         number; // 0.15
  brokerReliability:  number; // 0.10
  systemHealth:       number; // 0.08
  crisisScore:        number; // 0.07
  adaptiveRisk:       number; // 0.05
}

export const DEFAULT_ERB_WEIGHTS: ErbScoreWeights = {
  accountHealth:      0.25,
  positionRisk:       0.15,
  portfolioStability: 0.15,
  marketRisk:         0.15,
  brokerReliability:  0.10,
  systemHealth:       0.08,
  crisisScore:        0.07,
  adaptiveRisk:       0.05,
};

// ─── Recommendation with Full Evidence ────────────────────────────────────────

export interface ErbRecommendationDetail {
  recommendation:      ErbRecommendation;
  label:               string;
  description:         string;
  confidence:          number;
  evidence:            string[];
  supportingMetrics:   Record<string, number | string>;
  historicalComparison: ErbHistoricalComparison | null;
  expectedBenefit:     string;
  expectedRisk:        string;
}

export interface ErbHistoricalComparison {
  period:           "24h" | "7d" | "30d";
  avgOverallRisk:   number;
  avgSurvivalScore: number;
  prevRecommendation: string;
  trend:            "improving" | "stable" | "deteriorating";
  changeFromPrev:   number;
}

// ─── Explainability ───────────────────────────────────────────────────────────

export interface ErbExplainability {
  whyThisRecommendation:    string;
  topContributingSubsystem: string;
  topContributionWeight:    number;
  triggeringMetrics:        string[];
  activeProtections:        string[];
  historicalContext:        string;
  confidenceInterval:       { lower: number; upper: number };
  reliabilityRating:        "high" | "moderate" | "low" | "insufficient";
  subsystemContributions:   Array<{ subsystem: string; score: number; weight: number; impact: string }>;
}

// ─── Executive Risk Intelligence Object ───────────────────────────────────────

export interface ExecutiveRiskObject {
  reportId:       string;
  engineVersion:  string;
  riskVersion:    string;
  evaluatedAt:    Date;
  isAdvisoryOnly: true;

  // Context
  pair?:    string;
  session?: string;
  regime?:  string;

  // Intelligence components
  account:        ErbAccountIntelligence;
  position:       ErbPositionIntelligence | null;
  portfolio:      ErbPortfolioIntelligence;
  market:         ErbMarketIntelligence;
  broker:         ErbBrokerIntelligence;
  infrastructure: ErbInfrastructureIntelligence;
  adaptive:       ErbAdaptiveIntelligence;
  crisis:         ErbCrisisIntelligence;

  // Executive Scores (all 0-100; overallRiskScore: higher = worse; rest: higher = better)
  overallRiskScore:        number;
  survivalScore:           number;
  capitalHealthScore:      number;
  infrastructureScore:     number;
  brokerReliabilityScore:  number;
  portfolioStabilityScore: number;
  recoveryConfidenceScore: number;

  // Score detail
  scoreWeights:   ErbScoreWeights;
  scoreBreakdown: ErbScoreBreakdown;

  // Recommendation
  recommendationDetail: ErbRecommendationDetail;

  // Explainability
  explainability: ErbExplainability;
}

// ─── Engine Input ──────────────────────────────────────────────────────────────

export interface RunErbInput {
  // Inject pre-computed subsystem results (or let engine use defaults)
  riResult?:   Record<string, unknown> | null;
  cpResult?:   Record<string, unknown> | null;
  ariResult?:  Record<string, unknown> | null;
  crisisResult?: Record<string, unknown> | null;

  // Context
  pair?:    string;
  session?: string;
  regime?:  string;

  // Optional weight override
  weights?: Partial<ErbScoreWeights>;
}

// ─── Certification Types ───────────────────────────────────────────────────────

export type ErbCertificationStatus = "certified" | "conditional" | "failed";
export type ErbCertificationGrade  = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C" | "D" | "F";

export interface ErbSubsystemCert {
  name:            string;
  score:           number;
  status:          "pass" | "conditional" | "fail";
  findings:        string[];
  recommendations: string[];
}

export interface ErbCertificationReport {
  certId:       string;
  engineVersion: string;
  certifiedAt:  Date;

  overallScore:        number;
  certificationStatus: ErbCertificationStatus;
  grade:               ErbCertificationGrade;
  phase7Readiness:     number;
  phase7ReadinessLabel: string;

  subsystems: {
    accountProtection:    ErbSubsystemCert;
    exposureControl:      ErbSubsystemCert;
    portfolioStability:   ErbSubsystemCert;
    marketRiskMonitoring: ErbSubsystemCert;
    adaptiveRiskLogic:    ErbSubsystemCert;
    crisisDetection:      ErbSubsystemCert;
    recoveryLogic:        ErbSubsystemCert;
    explainability:       ErbSubsystemCert;
    auditLogging:         ErbSubsystemCert;
    versioning:           ErbSubsystemCert;
    apiStability:         ErbSubsystemCert;
    dashboardFunctionality: ErbSubsystemCert;
    scalability:          ErbSubsystemCert;
  };

  subsystemReadiness: Record<string, number>;
  criticalIssues:     string[];
  warnings:           string[];
  recommendations:    string[];
  technicalDebt:      string[];
  remainingDebt:      string[];
  futureImprovements: string[];
}

export interface ErbAuditContext {
  totalErbReports:     number;
  recentErbReports:    number;
  riReports:           number;
  cpReports:           number;
  ariReports:          number;
  crisisReports:       number;
  erbDecisions:        number;
  avgExplainability:   number;
  avgOverallRisk:      number;
  avgSurvivalScore:    number;
  apiRoutesVerified:   number;
  totalApiRoutes:      number;
  dashboardVerified:   number;
  totalDashboardPages: number;
  avgLatencyMs:        number;
  totalTests:          number;
  passingTests:        number;
  certificationHistory: number;
  crisisIsolationVerified: boolean;
}
