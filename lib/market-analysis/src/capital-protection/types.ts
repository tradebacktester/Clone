// ─── Capital Protection & Survival Engine — Types ─────────────────────────────
// Advisory only. MAY adjust risk management. NEVER modifies strategy logic.

export const CP_ENGINE_VERSION = "1.0.0";

// ─── Severity & Level Types ───────────────────────────────────────────────────

export type MonitorSeverity = "normal" | "caution" | "warning" | "critical" | "emergency";

export const MONITOR_SEVERITY_SCORE: Record<MonitorSeverity, number> = {
  normal: 0, caution: 1, warning: 2, critical: 3, emergency: 4,
};

export type ProtectionLevel =
  | "normal"
  | "caution"
  | "restricted"
  | "observation_mode"
  | "protected_mode"
  | "emergency_mode"
  | "trading_halt";

export const PROTECTION_LEVEL_SCORE: Record<ProtectionLevel, number> = {
  normal: 0, caution: 1, restricted: 2, observation_mode: 3,
  protected_mode: 4, emergency_mode: 5, trading_halt: 6,
};

export const PROTECTION_LEVEL_LABELS: Record<ProtectionLevel, string> = {
  normal:           "Normal",
  caution:          "Caution",
  restricted:       "Restricted",
  observation_mode: "Observation Mode",
  protected_mode:   "Protected Mode",
  emergency_mode:   "Emergency Mode",
  trading_halt:     "Trading Halt",
};

export const PROTECTION_LEVEL_COLOR: Record<ProtectionLevel, string> = {
  normal:           "green",
  caution:          "yellow",
  restricted:       "orange",
  observation_mode: "orange",
  protected_mode:   "red",
  emergency_mode:   "red",
  trading_halt:     "crimson",
};

// ─── Protection Actions (risk-management ONLY — never strategy) ───────────────

export type ProtectionActionType =
  | "reduce_position_size"
  | "reduce_max_trades"
  | "pause_new_trades"
  | "block_all_entries"
  | "increase_confirmation_requirements"
  | "enter_observation_mode"
  | "generate_emergency_alert"
  | "suspend_broker_entries"
  | "trading_halt";

export const PROTECTION_ACTION_LABELS: Record<ProtectionActionType, string> = {
  reduce_position_size:              "Reduce Position Size",
  reduce_max_trades:                 "Reduce Max Simultaneous Trades",
  pause_new_trades:                  "Pause New Trade Entries",
  block_all_entries:                 "Block All New Entries",
  increase_confirmation_requirements:"Increase Confirmation Requirements",
  enter_observation_mode:            "Enter Observation Mode",
  generate_emergency_alert:          "Generate Emergency Alert",
  suspend_broker_entries:            "Suspend Entries (Broker Issue)",
  trading_halt:                      "Full Trading Halt",
};

// ─── Configuration ────────────────────────────────────────────────────────────

export interface ProtectionConfig {
  // Account loss limits (% of balance)
  maxDailyLossPercent:    number;    // default 2.0
  maxWeeklyLossPercent:   number;    // default 5.0
  maxMonthlyLossPercent:  number;    // default 10.0

  // Drawdown thresholds (% of peak balance)
  drawdownWarningPercent:   number;  // default 5.0
  drawdownElevatedPercent:  number;  // default 8.0
  drawdownCriticalPercent:  number;  // default 12.0
  drawdownEmergencyPercent: number;  // default 15.0

  // Consecutive losses
  consecutiveLossCaution:   number;  // default 3
  consecutiveLossWarning:   number;  // default 5
  consecutiveLossCritical:  number;  // default 7
  consecutiveLossEmergency: number;  // default 10

  // Exposure limits
  maxOpenRiskPercent:       number;  // default 6.0 (total open risk)
  maxPairExposurePercent:   number;  // default 3.0
  maxCorrelation:           number;  // default 0.7 (0–1)
  maxDirectionalBias:       number;  // default 70 (%)

  // Margin thresholds (%)
  marginWarningLevel:   number;      // default 300
  marginCriticalLevel:  number;      // default 200
  marginEmergencyLevel: number;      // default 150
  maxLeverage:          number;      // default 10

  // Broker limits
  maxSpreadPips:          number;    // default 3.0
  maxSlippagePips:        number;    // default 1.0
  maxExecutionMs:         number;    // default 500
  maxRejectionRatePct:    number;    // default 10 (%)
  minConnectionQuality:   number;    // default 90 (%)

  // System thresholds
  minDbAvailability:    number;      // default 99.0
  minApiAvailability:   number;      // default 99.0
  maxCpuUsage:          number;      // default 85
  maxMemoryUsage:       number;      // default 85

  // Recovery
  recoveryGracePeriodHours: number;  // default 4
  recoveryStepsRequired:    number;  // default 3
}

export const DEFAULT_PROTECTION_CONFIG: ProtectionConfig = {
  maxDailyLossPercent:    2.0,
  maxWeeklyLossPercent:   5.0,
  maxMonthlyLossPercent:  10.0,

  drawdownWarningPercent:   5.0,
  drawdownElevatedPercent:  8.0,
  drawdownCriticalPercent:  12.0,
  drawdownEmergencyPercent: 15.0,

  consecutiveLossCaution:   3,
  consecutiveLossWarning:   5,
  consecutiveLossCritical:  7,
  consecutiveLossEmergency: 10,

  maxOpenRiskPercent:       6.0,
  maxPairExposurePercent:   3.0,
  maxCorrelation:           0.7,
  maxDirectionalBias:       70,

  marginWarningLevel:   300,
  marginCriticalLevel:  200,
  marginEmergencyLevel: 150,
  maxLeverage:          10,

  maxSpreadPips:          3.0,
  maxSlippagePips:        1.0,
  maxExecutionMs:         500,
  maxRejectionRatePct:    10,
  minConnectionQuality:   90,

  minDbAvailability:    99.0,
  minApiAvailability:   99.0,
  maxCpuUsage:          85,
  maxMemoryUsage:       85,

  recoveryGracePeriodHours: 4,
  recoveryStepsRequired:    3,
};

// ─── Monitor Result Types ─────────────────────────────────────────────────────

export interface AccountProtectionResult {
  severity:          MonitorSeverity;
  healthScore:       number;           // 0–100 (100 = fully healthy)
  dailyLossPct:      number;
  weeklyLossPct:     number;
  monthlyLossPct:    number;
  equityDrawdownPct: number;
  triggeredLimits:   string[];
  evidence:          string[];
  actions:           ProtectionActionType[];
}

export interface ConsecutiveLossResult {
  severity:          MonitorSeverity;
  healthScore:       number;
  consecutiveLosses: number;
  consecutiveWins:   number;
  avgLossSize:       number;           // absolute
  recoveryProgress:  number;           // 0–100
  triggeredLimits:   string[];
  evidence:          string[];
  actions:           ProtectionActionType[];
}

export interface DrawdownProtectionResult {
  severity:           MonitorSeverity;
  healthScore:        number;
  currentDrawdownPct: number;
  maxDrawdownPct:     number;
  drawdownVelocity:   number;          // % per hour
  recoveryRate:       number;          // % per hour (positive = recovering)
  thresholdCrossed:   string;
  evidence:           string[];
  actions:            ProtectionActionType[];
}

export interface ExposureProtectionResult {
  severity:            MonitorSeverity;
  healthScore:         number;
  totalOpenRiskPct:    number;
  maxPairExposurePct:  number;
  correlationScore:    number;         // 0–1
  directionalBias:     number;         // 0–100 (50 = balanced)
  concentrationRisk:   number;         // 0–100
  triggeredLimits:     string[];
  evidence:            string[];
  actions:             ProtectionActionType[];
}

export interface MarginProtectionResult {
  severity:             MonitorSeverity;
  healthScore:          number;
  marginLevel:          number;        // %
  freeMarginPct:        number;        // free margin / equity %
  marginCallRisk:       number;        // 0–100 (100 = imminent)
  leverageUtilization:  number;        // 0–100
  evidence:             string[];
  actions:              ProtectionActionType[];
}

export interface BrokerProtectionResult {
  severity:          MonitorSeverity;
  healthScore:       number;
  spreadRatio:       number;           // current / baseline
  slippagePips:      number;
  executionMs:       number;
  rejectionRatePct:  number;
  connectionQuality: number;           // 0–100
  triggeredChecks:   string[];
  evidence:          string[];
  actions:           ProtectionActionType[];
}

export interface SystemProtectionResult {
  severity:         MonitorSeverity;
  healthScore:      number;
  cpuUsage:         number;
  memoryUsage:      number;
  dbAvailability:   number;
  apiAvailability:  number;
  dataFeedHealth:   number;
  criticalFailures: string[];
  evidence:         string[];
  actions:          ProtectionActionType[];
}

// ─── Active Protection Action ─────────────────────────────────────────────────

export interface RecoveryRequirements {
  hoursRequired:     number;
  criteriaRequired:  string[];
  stepwiseRestore:   boolean;
  currentStep:       number;
  totalSteps:        number;
}

export interface ActiveProtectionAction {
  actionId:            string;
  actionType:          ProtectionActionType;
  label:               string;
  trigger:             string;
  thresholdCrossed:    string;
  evidence:            string[];
  appliedAt:           string;
  expectedBenefit:     string;
  severity:            MonitorSeverity;
  recoveryRequirements: RecoveryRequirements;
  parameterChange?: {
    parameter: string;
    from:      number | string;
    to:        number | string;
  };
  isReversible: boolean;
}

// ─── Recovery Status ──────────────────────────────────────────────────────────

export interface RecoveryStatus {
  isInRecovery:              boolean;
  currentLevel:              ProtectionLevel;
  targetLevel:               ProtectionLevel;
  hoursAtCurrentLevel:       number;
  hoursRequiredForRecovery:  number;
  progressPercent:           number;
  sustainedCriteriaCount:    number;
  sustainedCriteriaRequired: number;
  canStepDown:               boolean;
  stepDownBlockReason:       string | null;
}

// ─── Explainability ───────────────────────────────────────────────────────────

export interface ProtectionExplainability {
  summary:              string;
  primaryTrigger:       string;
  levelJustification:   string;
  actionJustifications: Array<{
    action:          ProtectionActionType;
    reason:          string;
    evidence:        string[];
    expectedOutcome: string;
  }>;
  historicalComparison: string;
  recoveryPath:         string;
}

// ─── Main I/O ─────────────────────────────────────────────────────────────────

export interface CapitalProtectionInput {
  // Account state
  balance:    number;
  equity:     number;
  peakBalance: number;
  peakEquity:  number;
  dailyPnl:   number;
  weeklyPnl:  number;
  monthlyPnl: number;
  freeMargin: number;
  marginLevel: number;
  usedMargin: number;
  leverage:   number;

  // Trades
  recentTrades: Array<{ pnl: number; closedAt: string; pair: string }>;
  openPositions: Array<{ pair: string; direction: "buy" | "sell"; riskPercent: number; lots: number }>;

  // Drawdown history (last 30 data points)
  drawdownHistory: Array<{ dd: number; ts: string }>;

  // Broker metrics
  spread:           number;
  spreadBaseline:   number;
  slippage:         number;
  executionTime:    number;
  orderRejections:  number;
  totalOrders:      number;
  connectionQuality: number;
  pair:             string;

  // System metrics
  cpuUsage:        number;
  memoryUsage:     number;
  dbAvailability:  number;
  apiAvailability: number;
  dataFeedHealth:  number;
  networkLatency:  number;
  errorRate:       number;

  // Optional overrides
  config?:                   Partial<ProtectionConfig>;
  hoursAtCurrentLevel?:      number;
  currentProtectionLevel?:   ProtectionLevel;
}

export interface CapitalProtectionObject {
  protectionId:         string;
  engineVersion:        string;
  evaluatedAt:          string;
  isAdvisoryOnly:       true;

  protectionLevel:      ProtectionLevel;
  protectionLevelLabel: string;
  protectionLevelScore: number;

  activeActions: ActiveProtectionAction[];

  monitors: {
    account:        AccountProtectionResult;
    consecutiveLoss: ConsecutiveLossResult;
    drawdown:       DrawdownProtectionResult;
    exposure:       ExposureProtectionResult;
    margin:         MarginProtectionResult;
    broker:         BrokerProtectionResult;
    system:         SystemProtectionResult;
  };

  recovery:        RecoveryStatus;
  explainability:  ProtectionExplainability;
  config:          ProtectionConfig;
}
