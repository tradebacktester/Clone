// ─── Core simulation types ──────────────────────────────────────────────────

export interface SimTrade {
  id: number;
  direction: "buy" | "sell";
  pnl: number;
  pnlPct: number;
  rr: number;
  won: boolean;
  balance: number;
  regime: string;
  session: string;
}

export interface SimStats {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  expectancy: number;
  sharpeRatio: number;
  totalPnl: number;
  finalBalance: number;
  avgWin: number;
  avgLoss: number;
  maxConsecLosses: number;
  maxConsecWins: number;
  calmarRatio: number;
}

// ─── Parameter Sensitivity ──────────────────────────────────────────────────

export type SensitivityLevel = -20 | -10 | -5 | 0 | 5 | 10 | 20;

export interface ParameterVariation {
  level: SensitivityLevel;
  paramValue: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  expectancy: number;
  deltaWinRate: number;       // vs baseline
  deltaProfitFactor: number;
  deltaDrawdown: number;
  deltaExpectancy: number;
}

export interface ParameterSensitivityResult {
  parameter: string;
  description: string;
  baseline: number;
  unit: string;
  variations: ParameterVariation[];
  sensitivityScore: number;     // 0-100: higher = more sensitive (worse)
  overlySensitive: boolean;     // true if >15% metric change for 10% param change
  recommendation: string;
}

export interface SensitivityAnalysisResult {
  parameters: ParameterSensitivityResult[];
  overallSensitivityScore: number;  // 0-100: higher = less stable
  stableParameters: string[];
  sensitiveParameters: string[];
  findings: string[];
  durationMs: number;
}

// ─── Market Stress Testing ──────────────────────────────────────────────────

export type MarketCondition =
  | "high_volatility"
  | "low_volatility"
  | "flash_crash"
  | "major_news_event"
  | "strong_trend"
  | "choppy_ranging";

export interface MarketStressScenario {
  condition: MarketCondition;
  label: string;
  description: string;
  stats: SimStats;
  baselineComparison: {
    winRateDelta: number;
    profitFactorDelta: number;
    drawdownDelta: number;
    expectancyDelta: number;
  };
  verdict: "robust" | "degraded" | "critical";
}

export interface MarketStressResult {
  baseline: SimStats;
  scenarios: MarketStressScenario[];
  overallRobustScore: number;  // 0-100
  worstCondition: MarketCondition;
  findings: string[];
  durationMs: number;
}

// ─── Execution Stress Testing ───────────────────────────────────────────────

export type ExecutionImperfection =
  | "higher_spread"
  | "slippage"
  | "delayed_execution"
  | "partial_fills"
  | "missed_ticks"
  | "data_interruption";

export interface ExecutionStressScenario {
  imperfection: ExecutionImperfection;
  label: string;
  description: string;
  params: Record<string, number>;
  stats: SimStats;
  pnlImpact: number;        // % PnL degradation vs baseline
  winRateImpact: number;    // absolute change
  verdict: "acceptable" | "degraded" | "critical";
}

export interface ExecutionStressResult {
  baseline: SimStats;
  scenarios: ExecutionStressScenario[];
  overallResilienceScore: number;  // 0-100
  worstImperfection: ExecutionImperfection;
  totalWorstCasePnlImpact: number;
  findings: string[];
  durationMs: number;
}

// ─── Risk Stress Testing ────────────────────────────────────────────────────

export interface LosingStreakAnalysis {
  maxConsecutiveLosses: number;
  maxDrawdownFromStreak: number;
  recoveryTradesNeeded: number;
  occurrenceCount: number;
  streakDegradationPct: number;
}

export interface DrawdownRecovery {
  drawdownDepthPct: number;
  recoveryTrades: number;
  recoveryDays: number;       // estimated at 2 trades/day
  probabilityOfRecovery: number;  // 0-100
}

export interface RiskStressResult {
  losingStreak: LosingStreakAnalysis;
  drawdownRecovery: DrawdownRecovery[];
  positionSizingResilience: {
    at50pctEquity: SimStats;
    at75pctEquity: SimStats;
    at125pctEquity: SimStats;
  };
  dailyLimitBreaches: number;
  weeklyLimitBreaches: number;
  overallResilienceScore: number;   // 0-100
  findings: string[];
  durationMs: number;
}

// ─── Walk-Forward Robustness ────────────────────────────────────────────────

export interface WFRobustnessResult {
  windows: number;
  passedWindows: number;
  avgEfficiencyRatio: number;
  parameterStability: number;       // 0-100
  overfitScore: number;             // 0-100: lower is better
  regimeSensitivity: number;        // 0-100: lower is better
  consistencyScore: number;         // 0-100
  overallScore: number;             // 0-100
  recommendation: "Pass" | "Marginal" | "Overfit";
  findings: string[];
  durationMs: number;
}

// ─── Out-of-Sample Validation ───────────────────────────────────────────────

export interface OOSSplit {
  trainPct: number;
  testPct: number;
  trainStats: SimStats;
  testStats: SimStats;
  efficiencyRatio: number;    // testPF / trainPF
  degradationPct: number;     // % PF drop from train→test
  passed: boolean;
}

export interface OOSResult {
  splits: OOSSplit[];
  avgEfficiencyRatio: number;
  avgDegradationPct: number;
  passed: boolean;
  overallScore: number;   // 0-100
  findings: string[];
  durationMs: number;
}

// ─── Confidence Stability ───────────────────────────────────────────────────

export interface ConfidenceStabilityResult {
  runs: number;
  avgConfidence: number;
  confidenceStdDev: number;
  coefficientOfVariation: number;   // stdDev / mean
  maxConfidenceSwing: number;       // max - min across runs
  overreactionEvents: number;       // >20% change for <5% input change
  stable: boolean;
  overallScore: number;   // 0-100
  findings: string[];
  durationMs: number;
}

// ─── Robustness Score ────────────────────────────────────────────────────────

export interface RobustnessScoreBreakdown {
  stability: number;          // parameter sensitivity + WF consistency
  generalization: number;     // OOS + WF efficiency
  riskResilience: number;     // risk stress score
  executionResilience: number; // execution stress score
  dataQuality: number;        // data coverage + quality proxy
}

export interface RobustnessScore {
  overall: number;            // 0-100
  breakdown: RobustnessScoreBreakdown;
  grade: "A" | "B" | "C" | "D" | "F";
  verdict: "robust" | "acceptable" | "needs_work" | "fragile";
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

export interface RobustnessPipelineConfig {
  pair?: string;
  initialBalance?: number;
  numSimTrades?: number;
  baseWinRate?: number;     // override from paper trading data
  baseRR?: number;          // override from paper trading data
  riskPerTrade?: number;
  skipWalkForward?: boolean;
}

export interface RobustnessPipelineResult {
  id: string;
  runAt: string;
  pair: string;
  config: RobustnessPipelineConfig;
  sensitivity: SensitivityAnalysisResult;
  marketStress: MarketStressResult;
  executionStress: ExecutionStressResult;
  riskStress: RiskStressResult;
  walkForward: WFRobustnessResult;
  oos: OOSResult;
  confidenceStability: ConfidenceStabilityResult;
  score: RobustnessScore;
  findings: string[];
  recommendations: string[];
  durationMs: number;
}

export interface PipelineStatus {
  status: "idle" | "running" | "complete" | "failed";
  stage: string;
  progress: number;   // 0-100
  startedAt?: string;
  completedAt?: string;
  error?: string;
}
