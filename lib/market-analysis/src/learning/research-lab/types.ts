// ─── Autonomous Research Lab — Types & Constants ──────────────────────────────
// Advisory only. Research environment is completely isolated from production.

export const RL_ENGINE_VERSION = "1.0.0";

export const MIN_SAMPLE_FOR_COMPARISON  = 20;
export const MIN_STAT_SIGNIFICANCE_PVAL = 0.05;
export const MIN_SUPERIORITY_SCORE      = 65;
export const VALIDATION_STAGES = [
  "historical_backtest",
  "walk_forward",
  "monte_carlo",
  "out_of_sample",
  "cross_pair",
  "regime_validation",
  "drawdown_analysis",
  "robustness",
  "stress_test",
  "paper_simulation",
] as const;

export type ValidationStage = typeof VALIDATION_STAGES[number];

export type ProjectStatus  = "active" | "paused" | "completed" | "archived";
export type Priority       = "critical" | "high" | "medium" | "low";
export type HypothesisType = "rule_change" | "threshold_change" | "feature_addition" | "model_change" | "filter_change";
export type HypothesisStatus = "pending" | "testing" | "validated" | "rejected" | "archived";
export type ExperimentStatus = "building" | "running" | "validating" | "completed" | "failed" | "rejected";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "archived";
export type DeploymentStatus = "not_deployed" | "deploying" | "deployed" | "rolled_back";
export type OverallVerdict = "superior" | "equivalent" | "inferior";
export type RecommendationType = "deploy" | "continue_testing" | "archive" | "rollback";
export type RecommendationStatus = "pending_approval" | "approved" | "rejected" | "archived";
export type ApprovalDecision = "approved" | "rejected" | "more_testing" | "continue_paper" | "archived";
export type ApprovalQueueStatus = "pending" | "decided" | "expired";

export type ChangeType = "refactor" | "new_algorithm" | "filter" | "scoring" | "feature" | "optimization";

// ─── Weakness ─────────────────────────────────────────────────────────────────

export interface Weakness {
  id:          string;
  category:    string;
  title:       string;
  description: string;
  severity:    "critical" | "high" | "medium" | "low";
  metric:      string;
  currentValue:number;
  targetValue: number;
  evidence:    string[];
  detectedAt:  Date;
}

// ─── Hypothesis ───────────────────────────────────────────────────────────────

export interface Hypothesis {
  hypothesisId:        string;
  projectId:           string;
  title:               string;
  description:         string;
  rationale:           string;
  weaknessId?:         string;
  hypothesisType:      HypothesisType;
  targetComponent:     string;
  proposedChange:      Record<string, unknown>;
  expectedImprovement: number;
  confidenceScore:     number;
  supportingEvidence:  string[];
  status:              HypothesisStatus;
}

// ─── Config Change ────────────────────────────────────────────────────────────

export interface ConfigChange {
  parameter: string;
  before:    unknown;
  after:     unknown;
  rationale: string;
}

// ─── Validation Stage Result ──────────────────────────────────────────────────

export interface ValidationStageResult {
  stage:      ValidationStage;
  passed:     boolean;
  score:      number;
  sampleSize: number;
  metrics:    Record<string, number>;
  summary:    string;
  duration:   number;
}

// ─── Validation Pipeline Result ───────────────────────────────────────────────

export interface ValidationPipelineResult {
  stages:         ValidationStageResult[];
  passed:         boolean;
  failedStage?:   ValidationStage;
  overallScore:   number;
  confidence:     number;
  sampleSize:     number;
  testPeriodDays: number;
  summary:        string;
}

// ─── Performance Metrics ──────────────────────────────────────────────────────

export interface PerformanceMetrics {
  winRate:      number;
  avgRr:        number;
  profitFactor: number;
  maxDrawdown:  number;
  sharpe:       number;
  totalReturn:  number;
  tradeCount:   number;
  avgHoldMins:  number;
}

// ─── Comparison Result ────────────────────────────────────────────────────────

export interface ComparisonResult {
  productionMetrics:   PerformanceMetrics;
  experimentMetrics:   PerformanceMetrics;
  improvements:        Array<{ metric: string; prod: number; exp: number; delta: number; pct: number }>;
  regressions:         Array<{ metric: string; prod: number; exp: number; delta: number; pct: number }>;
  winRatePValue:       number;
  sharpeImprovement:   number;
  isStatSignificant:   boolean;
  overallVerdict:      OverallVerdict;
  verdictScore:        number;
  summary:             string;
}

// ─── Code Change Artifact ─────────────────────────────────────────────────────

export interface CodeChangeArtifact {
  changeId:      string;
  changeType:    ChangeType;
  targetModule:  string;
  changeTitle:   string;
  description:   string;
  rationale:     string;
  pseudoCode?:   string;
  configBefore?: Record<string, unknown>;
  configAfter?:  Record<string, unknown>;
  linesAdded:    number;
  linesRemoved:  number;
  testsPassed:   boolean;
  staticAnalysis:boolean;
  securityCheck: boolean;
  perfBenchmark: boolean;
  affectsProduction: boolean;
  isResearchOnly: boolean;
}

// ─── Research Experiment ──────────────────────────────────────────────────────

export interface ResearchExperiment {
  experimentId:         string;
  projectId:            string;
  hypothesisId?:        string;
  name:                 string;
  description:          string;
  parentVersion:        string;
  strategyVersion:      string;
  researchObjective:    string;
  configChanges:        Record<string, unknown>;
  status:               ExperimentStatus;
  validationStage?:     ValidationStage;
  validationResults?:   ValidationPipelineResult;
  performanceMetrics?:  PerformanceMetrics;
  statisticalConfidence?:number;
  approvalStatus:       ApprovalStatus;
  deploymentStatus:     DeploymentStatus;
  isSandboxed:          boolean;
  isAdvisoryOnly:       boolean;
  startedAt:            Date;
  completedAt?:         Date;
}

// ─── Deployment Recommendation ────────────────────────────────────────────────

export interface DeploymentRecommendation {
  recommendationId:       string;
  experimentId:           string;
  projectId:              string;
  title:                  string;
  summary:                string;
  codeChangeSummary:      string;
  performanceSummary:     string;
  riskAssessment:         string;
  statisticalSignificance:number;
  confidenceScore:        number;
  validationEvidence:     string[];
  potentialDrawbacks:     string[];
  rollbackPlan:           string;
  recommendationType:     RecommendationType;
  status:                 RecommendationStatus;
}

// ─── Research Project ─────────────────────────────────────────────────────────

export interface ResearchProject {
  projectId:       string;
  title:           string;
  description:     string;
  objective:       string;
  weaknessTarget:  string;
  status:          ProjectStatus;
  priority:        Priority;
  hypothesisCount: number;
  experimentCount: number;
  isAdvisoryOnly:  boolean;
  startedAt:       Date;
  completedAt?:    Date;
}

// ─── Research Lab Report ──────────────────────────────────────────────────────

export interface ResearchLabReport {
  version:             string;
  generatedAt:         Date;
  activeProjects:      number;
  totalHypotheses:     number;
  totalExperiments:    number;
  pendingApprovals:    number;
  completedExperiments:number;
  deployedVersions:    number;
  weaknesses:          Weakness[];
  isAdvisoryOnly:      boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

export function pctDelta(prod: number, exp: number): number {
  if (prod === 0) return 0;
  return ((exp - prod) / Math.abs(prod)) * 100;
}

export function priorityFromScore(score: number): Priority {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}
