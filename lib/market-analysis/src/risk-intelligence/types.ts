// ─── Risk Intelligence Engine — Types ─────────────────────────────────────────
// All types for the Unified Risk Intelligence Object.
// Advisory only. NEVER modifies production strategy.

export const RI_ENGINE_VERSION = "1.0.0";
export const RI_RISK_VERSION   = "1.0.0";

// ─── Risk Classifications ─────────────────────────────────────────────────────

export type RiskClassification =
  | "very_low"
  | "low"
  | "moderate"
  | "elevated"
  | "high"
  | "critical";

export const RISK_CLASSIFICATION_THRESHOLDS: Record<RiskClassification, number> = {
  very_low: 0,
  low:      20,
  moderate: 40,
  elevated: 60,
  high:     75,
  critical: 88,
};

export const RISK_CLASSIFICATION_LABELS: Record<RiskClassification, string> = {
  very_low: "Very Low",
  low:      "Low",
  moderate: "Moderate",
  elevated: "Elevated",
  high:     "High",
  critical: "Critical",
};

// ─── Account Risk ─────────────────────────────────────────────────────────────

export interface AccountState {
  balance:     number;
  equity:      number;
  freeMargin:  number;
  marginLevel: number; // %, 100+ = normal
  dailyPnl:    number; // absolute
  weeklyPnl:   number;
  monthlyPnl:  number;
  openRisk:    number; // % of balance at risk on open positions
  closedRisk:  number; // realised daily drawdown %
}

export interface AccountRiskResult {
  accountHealthScore: number;       // 0 = worst, 100 = healthiest
  riskClassification: RiskClassification;
  metrics: {
    balanceDrawdownPct:  number;
    equityDrawdownPct:   number;
    marginLevelScore:    number;
    dailyLossScore:      number;
    weeklyLossScore:     number;
    openRiskScore:       number;
  };
  evidence: string[];
  alerts:   RiskAlert[];
}

// ─── Position Risk ────────────────────────────────────────────────────────────

export interface PositionInput {
  positionSize:     number; // lots
  stopLossDistance: number; // pips
  accountBalance:   number;
  riskPercentage:   number; // % of account
  expectedRR:       number;
  maxLoss:          number; // absolute $
  tradeExposure:    number; // notional $
  positionDuration: number; // seconds open
  pair:             string;
  direction:        "buy" | "sell";
  currentPnl:       number;
}

export interface PositionRiskResult {
  positionRiskScore:  number;
  riskClassification: RiskClassification;
  metrics: {
    sizeScore:      number;
    rrScore:        number;
    exposureScore:  number;
    durationScore:  number;
    riskPctScore:   number;
  };
  evidence: string[];
  alerts:   RiskAlert[];
}

// ─── Portfolio Risk ───────────────────────────────────────────────────────────

export interface OpenPosition {
  tradeId:    string;
  pair:       string;
  direction:  "buy" | "sell";
  sizeUsd:    number;
  riskUsd:    number;
  pnl:        number;
  openedAt:   Date;
}

export interface PortfolioInput {
  openPositions:   OpenPosition[];
  accountBalance:  number;
  maxOpenTrades:   number;
  correlationMatrix?: Record<string, Record<string, number>>;
}

export interface PortfolioRiskResult {
  portfolioRiskScore:  number;
  riskClassification:  RiskClassification;
  openTrades:          number;
  pairExposure:        Record<string, number>;
  currencyExposure:    Record<string, number>;
  correlationExposure: number;
  directionalBias:     number; // -100 (all sell) to 100 (all buy)
  aggregateRisk:       number; // total open risk % of balance
  metrics: {
    concentrationScore: number;
    correlationScore:   number;
    directionScore:     number;
    capacityScore:      number;
  };
  evidence: string[];
  alerts:   RiskAlert[];
}

// ─── Market Risk ──────────────────────────────────────────────────────────────

export interface MarketRiskInput {
  volatility:       number; // 0-100
  liquidity:        number; // 0-100
  trendStability:   number; // 0-100
  correlation:      number; // 0-100 (higher = more correlated = more risk)
  marketHealth:     number; // 0-100 (from Market Intelligence)
  opportunityScore: number; // 0-100
  newsRisk:         number; // 0-100 (0 = no risk, 100 = extreme news risk)
  pair:             string;
  session:          string;
  regime:           string;
}

export interface MarketRiskResult {
  marketRiskScore:    number;
  riskClassification: RiskClassification;
  metrics: {
    volatilityRisk:    number;
    liquidityRisk:     number;
    stabilityRisk:     number;
    correlationRisk:   number;
    newsRiskScore:     number;
  };
  evidence: string[];
  alerts:   RiskAlert[];
}

// ─── Broker Risk ──────────────────────────────────────────────────────────────

export interface BrokerMetrics {
  spread:               number; // pips (current)
  spreadBaseline:       number; // pips (normal)
  slippage:             number; // pips average last 10 trades
  executionTime:        number; // ms average
  orderRejections:      number; // count last 24h
  totalOrders:          number; // count last 24h
  connectionQuality:    number; // 0-100 (uptime %)
  priceFeedConsistency: number; // 0-100
  latency:              number; // ms
  pair:                 string;
}

export interface BrokerRiskResult {
  brokerReliabilityScore: number;
  riskClassification:     RiskClassification;
  metrics: {
    spreadScore:     number;
    slippageScore:   number;
    executionScore:  number;
    rejectionScore:  number;
    connectScore:    number;
    feedScore:       number;
    latencyScore:    number;
  };
  evidence: string[];
  alerts:   RiskAlert[];
}

// ─── System Risk ──────────────────────────────────────────────────────────────

export interface SystemMetrics {
  cpuUsage:            number; // 0-100%
  memoryUsage:         number; // 0-100%
  dbHealth:            number; // 0-100 (query latency based)
  apiHealth:           number; // 0-100 (error rate based)
  networkLatency:      number; // ms
  dataFeedHealth:      number; // 0-100
  backgroundServices:  number; // count of healthy services
  totalServices:       number; // count of total services
  storageAvailability: number; // 0-100%
  dbQueryMs:           number; // average DB query time ms
  apiErrorRate:        number; // 0-1
}

export interface SystemRiskResult {
  systemHealthScore:  number;
  riskClassification: RiskClassification;
  metrics: {
    cpuScore:      number;
    memoryScore:   number;
    dbScore:       number;
    apiScore:      number;
    networkScore:  number;
    feedScore:     number;
    servicesScore: number;
    storageScore:  number;
  };
  evidence: string[];
  alerts:   RiskAlert[];
}

// ─── Risk Alert ───────────────────────────────────────────────────────────────

export interface RiskAlert {
  alertId:  string;
  category: "account" | "position" | "portfolio" | "market" | "broker" | "system" | "overall";
  severity: "info" | "warning" | "critical";
  title:    string;
  message:  string;
  evidence: string[];
  metrics:  Record<string, number | string>;
}

// ─── Overall Scorer Input ─────────────────────────────────────────────────────

export interface RiScoreWeights {
  accountHealth:     number; // 0.25
  positionRisk:      number; // 0.20
  portfolioRisk:     number; // 0.20
  marketRisk:        number; // 0.15
  brokerReliability: number; // 0.12
  systemHealth:      number; // 0.08
}

export const DEFAULT_RI_WEIGHTS: RiScoreWeights = {
  accountHealth:     0.25,
  positionRisk:      0.20,
  portfolioRisk:     0.20,
  marketRisk:        0.15,
  brokerReliability: 0.12,
  systemHealth:      0.08,
};

// ─── Unified Risk Intelligence Object ─────────────────────────────────────────

export interface UnifiedRiskIntelligenceObject {
  reportId:      string;
  engineVersion: string;
  riskVersion:   string;
  evaluatedAt:   Date;
  isAdvisoryOnly: true;

  // Context
  tradeId?:         string;
  pair?:            string;
  session?:         string;
  regime?:          string;
  strategyVersion?: string;

  // Component results
  accountRisk:   AccountRiskResult;
  positionRisk:  PositionRiskResult | null;
  portfolioRisk: PortfolioRiskResult;
  marketRisk:    MarketRiskResult;
  brokerRisk:    BrokerRiskResult;
  systemRisk:    SystemRiskResult;

  // Overall
  overallRiskScore:   number;
  riskClassification: RiskClassification;
  riskLabel:          string;
  confidence:         number;

  // Explainability
  scoreWeights:       RiScoreWeights;
  scoreBreakdown: {
    accountHealth:     { raw: number; inverted: number; weighted: number; weight: number };
    positionRisk:      { raw: number; inverted: number; weighted: number; weight: number };
    portfolioRisk:     { raw: number; inverted: number; weighted: number; weight: number };
    marketRisk:        { raw: number; inverted: number; weighted: number; weight: number };
    brokerReliability: { raw: number; inverted: number; weighted: number; weight: number };
    systemHealth:      { raw: number; inverted: number; weighted: number; weight: number };
    total:             number;
  };
  confidenceInterval: { lower: number; upper: number };
  reliabilityRating:  "high" | "moderate" | "low" | "insufficient";
  supportingEvidence: {
    accountEvidence:   string[];
    positionEvidence:  string[];
    portfolioEvidence: string[];
    marketEvidence:    string[];
    brokerEvidence:    string[];
    systemEvidence:    string[];
    alertCount:        number;
    criticalAlerts:    RiskAlert[];
    warningAlerts:     RiskAlert[];
  };
  allAlerts: RiskAlert[];
}

// ─── Engine input ─────────────────────────────────────────────────────────────

export interface RunRiInput {
  account:   AccountState;
  position?: PositionInput | null;
  portfolio: PortfolioInput;
  market:    MarketRiskInput;
  broker:    BrokerMetrics;
  system:    SystemMetrics;
  context?: {
    tradeId?:         string;
    pair?:            string;
    session?:         string;
    regime?:          string;
    strategyVersion?: string;
  };
  weights?: Partial<RiScoreWeights>;
}

// ─── Report types ─────────────────────────────────────────────────────────────

export interface RiHistoricalComparison {
  period:           "24h" | "7d" | "30d";
  avgRiskScore:     number;
  minRiskScore:     number;
  maxRiskScore:     number;
  classification:   RiskClassification;
  trend:            "improving" | "stable" | "deteriorating";
  changeFromPrev:   number;
}
