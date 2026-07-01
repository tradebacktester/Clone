// ─── Crisis Intelligence & Survival Engine — Types ────────────────────────────

export const CRISIS_ENGINE_VERSION = "1.0.0";

// ─── Severity Levels ──────────────────────────────────────────────────────────

export type CrisisSeverity =
  | "normal"
  | "minor"
  | "moderate"
  | "major"
  | "critical"
  | "catastrophic";

export const SEVERITY_SCORES: Record<CrisisSeverity, number> = {
  normal:       0,
  minor:        20,
  moderate:     40,
  major:        60,
  critical:     80,
  catastrophic: 100,
};

export function scoreToCrisisSeverity(score: number): CrisisSeverity {
  if (score >= 90) return "catastrophic";
  if (score >= 70) return "critical";
  if (score >= 50) return "major";
  if (score >= 30) return "moderate";
  if (score >= 10) return "minor";
  return "normal";
}

// ─── Survival Modes ───────────────────────────────────────────────────────────

export type SurvivalMode =
  | "normal"
  | "caution"
  | "defensive"
  | "observation"
  | "survival"
  | "emergency";

export const SURVIVAL_MODE_ORDER: SurvivalMode[] = [
  "normal", "caution", "defensive", "observation", "survival", "emergency",
];

export const MODE_DESCRIPTIONS: Record<SurvivalMode, string> = {
  normal:      "Standard operation — full trading capabilities active.",
  caution:     "Increased monitoring. No restrictions. Alerts active.",
  defensive:   "Reduced exposure. Limited new positions. Higher confirmation required.",
  observation: "No new entries. Open trades continue. Market monitoring active.",
  survival:    "No new trades. Open positions protected. Continuous diagnostics.",
  emergency:   "Automated trading halted. Markets/broker/infrastructure monitored.",
};

export const MODE_RESTRICTIONS: Record<SurvivalMode, {
  allowNewTrades: boolean;
  maxExposureMultiplier: number;
  monitoringFrequencyMinutes: number;
  requiresExtraConfirmation: boolean;
  protectOpenPositions: boolean;
}> = {
  normal:      { allowNewTrades: true,  maxExposureMultiplier: 1.0, monitoringFrequencyMinutes: 10, requiresExtraConfirmation: false, protectOpenPositions: false },
  caution:     { allowNewTrades: true,  maxExposureMultiplier: 1.0, monitoringFrequencyMinutes: 5,  requiresExtraConfirmation: false, protectOpenPositions: false },
  defensive:   { allowNewTrades: true,  maxExposureMultiplier: 0.5, monitoringFrequencyMinutes: 3,  requiresExtraConfirmation: true,  protectOpenPositions: false },
  observation: { allowNewTrades: false, maxExposureMultiplier: 0.0, monitoringFrequencyMinutes: 2,  requiresExtraConfirmation: true,  protectOpenPositions: true  },
  survival:    { allowNewTrades: false, maxExposureMultiplier: 0.0, monitoringFrequencyMinutes: 1,  requiresExtraConfirmation: true,  protectOpenPositions: true  },
  emergency:   { allowNewTrades: false, maxExposureMultiplier: 0.0, monitoringFrequencyMinutes: 1,  requiresExtraConfirmation: true,  protectOpenPositions: true  },
};

// ─── Crisis Types ─────────────────────────────────────────────────────────────

export type CrisisType =
  | "market"
  | "broker"
  | "infrastructure"
  | "data_integrity"
  | "strategy_performance"
  | "composite";

// ─── Market Crisis ────────────────────────────────────────────────────────────

export interface MarketCrisisSignal {
  flashCrash:           boolean;
  extremeVolatility:    boolean;
  liquidityCollapse:    boolean;
  priceGap:             boolean;
  spreadExpansion:      boolean;
  tradingHalt:          boolean;
  exchangeInstability:  boolean;
  unexpectedBehavior:   boolean;
  crisisScore:          number;    // 0-100
  severity:             CrisisSeverity;
  evidence:             string[];
  volatilityZScore:     number;
  spreadMultiplier:     number;
  liquidityScore:       number;
}

// ─── Broker Crisis ────────────────────────────────────────────────────────────

export interface BrokerCrisisSignal {
  orderRejections:         boolean;
  delayedExecution:        boolean;
  highSlippage:            boolean;
  connectionLoss:          boolean;
  apiFailures:             boolean;
  incorrectOrderResponse:  boolean;
  priceFeedInconsistency:  boolean;
  serverDowntime:          boolean;
  crisisScore:             number;    // 0-100
  severity:                CrisisSeverity;
  evidence:                string[];
  reliabilityScore:        number;    // 0-100
  executionQuality:        number;    // 0-100
}

// ─── Infrastructure Crisis ────────────────────────────────────────────────────

export interface InfrastructureCrisisSignal {
  internetConnectivity:  boolean;
  vpsAvailability:       boolean;
  cpuOverload:           boolean;
  memoryExhaustion:      boolean;
  databaseFailure:       boolean;
  diskSpace:             boolean;
  networkLatency:        boolean;
  serviceCrash:          boolean;
  crisisScore:           number;    // 0-100
  severity:              CrisisSeverity;
  evidence:              string[];
  healthScore:           number;    // 0-100
  latencyMs:             number;
}

// ─── Data Integrity Crisis ────────────────────────────────────────────────────

export interface DataIntegrityCrisisSignal {
  missingCandles:        boolean;
  duplicateCandles:      boolean;
  corruptedOHLC:         boolean;
  incorrectTimestamps:   boolean;
  feedDesynchronization: boolean;
  indicatorErrors:       boolean;
  incompleteMarketData:  boolean;
  crisisScore:           number;    // 0-100
  severity:              CrisisSeverity;
  evidence:              string[];
  integrityScore:        number;    // 0-100
  gapCount:              number;
}

// ─── Strategy Stability Crisis ────────────────────────────────────────────────

export interface StrategyStabilityCrisisSignal {
  winRateDecline:        boolean;
  drawdownAcceleration:  boolean;
  unexpectedLossClusters: boolean;
  performanceDrift:      boolean;
  confidenceCollapse:    boolean;
  strategyDegradation:   boolean;
  crisisScore:           number;    // 0-100
  severity:              CrisisSeverity;
  evidence:              string[];
  stabilityScore:        number;    // 0-100
  currentWinRate:        number;
  baselineWinRate:       number;
  drawdownPercent:       number;
}

// ─── Crisis Classification ────────────────────────────────────────────────────

export interface CrisisClassification {
  overallSeverity:        CrisisSeverity;
  overallScore:           number;          // 0-100
  confidence:             number;          // 0-100
  dominantCrisisType:     CrisisType | null;
  marketSignal:           MarketCrisisSignal;
  brokerSignal:           BrokerCrisisSignal;
  infrastructureSignal:   InfrastructureCrisisSignal;
  dataIntegritySignal:    DataIntegrityCrisisSignal;
  strategySignal:         StrategyStabilityCrisisSignal;
  supportingEvidence:     string[];
  expectedImpact:         string;
  recommendedResponse:    string;
  timestamp:              string;
}

// ─── Survival Mode State ──────────────────────────────────────────────────────

export interface SurvivalModeState {
  currentMode:            SurvivalMode;
  previousMode:           SurvivalMode | null;
  modeChangedAt:          string | null;
  modeChangedReason:      string | null;
  modeChangeType:         "escalation" | "de-escalation" | "maintenance" | "initial";
  restrictions:           typeof MODE_RESTRICTIONS[SurvivalMode];
  description:            string;
  activeAlerts:           string[];
}

// ─── Emergency Event ──────────────────────────────────────────────────────────

export interface EmergencyEvent {
  eventId:               string;
  occurredAt:            string;
  crisisType:            CrisisType;
  severity:              CrisisSeverity;
  trigger:               string;
  evidence:              string[];
  recommendedAction:     string;
  recoveryConditions:    string[];
  historicalComparison:  string;
  survivalModeTriggered: SurvivalMode;
  isAdvisoryOnly:        true;
}

// ─── Recovery Stage ───────────────────────────────────────────────────────────

export type RecoveryStage = SurvivalMode;

export interface RecoveryState {
  currentStage:            RecoveryStage;
  targetStage:             RecoveryStage;
  stagesCompleted:         RecoveryStage[];
  stagesRemaining:         RecoveryStage[];
  readyForNextStage:       boolean;
  nextStageRequirements:   string[];
  stableInfrastructure:    boolean;
  stableBroker:            boolean;
  stableMarket:            boolean;
  sufficientConfirmation:  boolean;
  estimatedRecoveryMinutes: number;
}

// ─── System Health ────────────────────────────────────────────────────────────

export interface SystemHealth {
  overallHealth:          "healthy" | "degraded" | "critical" | "offline";
  healthScore:            number;   // 0-100
  marketHealth:           number;   // 0-100
  brokerHealth:           number;   // 0-100
  infrastructureHealth:   number;   // 0-100
  dataIntegrityHealth:    number;   // 0-100
  strategyHealth:         number;   // 0-100
  checkedAt:              string;
}

// ─── Crisis Report Summary ────────────────────────────────────────────────────

export interface CrisisReportSummary {
  currentSeverity:        CrisisSeverity;
  currentMode:            SurvivalMode;
  systemHealth:           SystemHealth;
  activeAlerts:           number;
  safeToTrade:            boolean;
  requiresAttention:      boolean;
  topReason:              string;
}

// ─── Main Engine Input ────────────────────────────────────────────────────────

export interface MarketContext {
  pair:            string;
  volatilityScore: number;   // 0-100
  liquidityScore:  number;   // 0-100
  spreadMultiplier: number;  // 1.0 = normal, 3.0 = 3× wider
  regime:          string;
  hasNewsFeed:     boolean;
}

export interface BrokerContext {
  isConnected:           boolean;
  recentRejections:      number;   // last hour
  avgExecutionMs:        number;
  slippagePips:          number;
  lastHeartbeatSecondsAgo: number;
  apiErrorRate:          number;   // 0-1
}

export interface InfrastructureContext {
  dbResponseMs:    number;
  cpuPercent:      number;
  memPercent:      number;
  diskPercent:     number;
  networkLatencyMs: number;
  uptimeHours:     number;
}

export interface DataContext {
  recentGapCount:  number;
  duplicateCount:  number;
  lastCandle:      string | null;
  expectedInterval: number;     // minutes
  feedDelaySeconds: number;
}

export interface StrategyContext {
  recentWinRate:   number;   // last 20 trades
  baselineWinRate: number;   // all-time
  currentDrawdown: number;   // %
  lossStreak:      number;
  recentPnL:       number;   // last 10 trades
}

export interface RunCrisisEngineInput {
  market:       MarketContext;
  broker:       BrokerContext;
  infrastructure: InfrastructureContext;
  data:         DataContext;
  strategy:     StrategyContext;
  currentMode:  SurvivalMode | null;
}

// ─── Full Engine Report ───────────────────────────────────────────────────────

export interface CrisisEngineReport {
  reportId:       string;
  engineVersion:  string;
  generatedAt:    string;
  isAdvisoryOnly: true;
  classification: CrisisClassification;
  survivalMode:   SurvivalModeState;
  recovery:       RecoveryState;
  systemHealth:   SystemHealth;
  emergencyEvent: EmergencyEvent | null;
  explainability: CrisisExplainability;
  summary:        CrisisReportSummary;
}

// ─── Explainability ───────────────────────────────────────────────────────────

export interface CrisisExplainability {
  whatHappened:       string;
  whyDetected:        string;
  supportingEvidence: string[];
  protectiveActions:  string[];
  expectedBenefits:   string[];
  risksIfIgnored:     string[];
  recoveryRequirements: string[];
  narrative:          string;
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

export const THRESHOLDS = {
  // Market
  VOLATILITY_HIGH:              70,
  VOLATILITY_EXTREME:           85,
  SPREAD_HIGH_MULTIPLIER:       2.0,
  SPREAD_EXTREME_MULTIPLIER:    4.0,
  LIQUIDITY_LOW:                30,
  LIQUIDITY_CRITICAL:           15,

  // Broker
  REJECTION_HIGH:               3,
  REJECTION_CRITICAL:           8,
  EXECUTION_SLOW_MS:            2000,
  EXECUTION_CRITICAL_MS:        5000,
  SLIPPAGE_HIGH_PIPS:           3,
  SLIPPAGE_CRITICAL_PIPS:       8,
  HEARTBEAT_STALE_SECONDS:      60,
  HEARTBEAT_DEAD_SECONDS:       300,
  API_ERROR_RATE_HIGH:          0.1,
  API_ERROR_RATE_CRITICAL:      0.3,

  // Infrastructure
  DB_SLOW_MS:                   500,
  DB_CRITICAL_MS:               2000,
  CPU_HIGH:                     80,
  CPU_CRITICAL:                 95,
  MEM_HIGH:                     85,
  MEM_CRITICAL:                 95,
  DISK_HIGH:                    85,
  DISK_CRITICAL:                95,
  LATENCY_HIGH_MS:              200,
  LATENCY_CRITICAL_MS:          1000,

  // Data
  GAPS_HIGH:                    3,
  GAPS_CRITICAL:                8,
  FEED_DELAY_HIGH_SECONDS:      120,
  FEED_DELAY_CRITICAL_SECONDS:  300,

  // Strategy
  WIN_RATE_DECLINE_MODERATE:    0.15,
  WIN_RATE_DECLINE_SEVERE:      0.25,
  DRAWDOWN_MODERATE:            5,
  DRAWDOWN_SEVERE:              10,
  LOSS_STREAK_HIGH:             4,
  LOSS_STREAK_CRITICAL:         7,
} as const;
