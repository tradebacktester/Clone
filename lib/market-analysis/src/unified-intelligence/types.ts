// ─── Unified Market Intelligence Types ────────────────────────────────────────
// Advisory only. No trade execution. No strategy modification.

export type RiskLevel = "Low" | "Moderate" | "Elevated" | "High" | "Extreme";
export type OpportunityLabel = "Very Low" | "Low" | "Moderate" | "Good" | "High" | "Excellent";
export type HealthGrade = "A" | "B" | "C" | "D" | "F";

// ─── Market Summary ────────────────────────────────────────────────────────────

export interface MarketSummary {
  regime: string;
  trendDirection: string;
  trendStrength: number;       // 0-100
  trendAge: number;            // bars
  volatilityLevel: string;
  liquidityQuality: string;
  correlationState: string;
  newsContext: string;
  session: string;
  spread: string;
  marketStability: number;     // 0-100
}

// ─── Historical Context ────────────────────────────────────────────────────────

export interface HistoricalContext {
  similarityScore: number;     // 0-100
  similarMarketsCount: number;
  winRate: number;             // 0-1
  profitFactor: number;
  expectancy: number;          // in R
  drawdown: number;            // %
  confidence: number;          // 0-100
  sampleSize: number;
  matches: HistoricalMatch[];
}

export interface HistoricalMatch {
  regime: string;
  trendDirection: string;
  volatilityLevel: string;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  sampleSize: number;
  similarityScore: number;
}

// ─── Market Health Score ───────────────────────────────────────────────────────

export interface HealthScoreBreakdown {
  overall: number;          // 0-100
  grade: HealthGrade;
  interpretation: string;
  components: {
    stability: { score: number; weight: number; label: string };
    liquidity: { score: number; weight: number; label: string };
    volatility: { score: number; weight: number; label: string };
    correlation: { score: number; weight: number; label: string };
    newsRisk: { score: number; weight: number; label: string };
    trendQuality: { score: number; weight: number; label: string };
    historicalReliability: { score: number; weight: number; label: string };
    dataQuality: { score: number; weight: number; label: string };
  };
}

// ─── Risk Assessment ───────────────────────────────────────────────────────────

export interface RiskDimension {
  level: RiskLevel;
  score: number;        // 0-100 (higher = more risk)
  evidence: string;
  metric: number | string;
}

export interface RiskAssessment {
  overall: RiskLevel;
  overallScore: number;    // 0-100
  dimensions: {
    volatility: RiskDimension;
    liquidity: RiskDimension;
    correlation: RiskDimension;
    news: RiskDimension;
    session: RiskDimension;
    spread: RiskDimension;
  };
  evidence: string[];
}

// ─── Opportunity Score ─────────────────────────────────────────────────────────

export interface OpportunityScoreBreakdown {
  overall: number;         // 0-100
  label: OpportunityLabel;
  reasoning: string;
  factors: {
    regime: { score: number; weight: number; description: string };
    trend: { score: number; weight: number; description: string };
    liquidity: { score: number; weight: number; description: string };
    volatility: { score: number; weight: number; description: string };
    historical: { score: number; weight: number; description: string };
    stability: { score: number; weight: number; description: string };
    confidence: { score: number; weight: number; description: string };
  };
  note: string; // "Does not indicate buy/sell direction"
}

// ─── Market Outlook ────────────────────────────────────────────────────────────

export interface OutlookScenario {
  description: string;
  probability: number;    // 0-1
  historicalBasis: string;
  confidence: number;
  triggerConditions: string[];
}

export interface MarketOutlook {
  primary: OutlookScenario;
  alternative: OutlookScenario;
  transitionProbability: number;   // probability of regime change
  expectedDurationBars: number;
  confidence: number;
  supportingEvidence: string[];
  historicalBasis: string;
  allScenarios: OutlookScenario[];
}

// ─── Unified Market State Object ───────────────────────────────────────────────

export interface UnifiedMarketState {
  timestamp: string;
  version: string;
  pair: string;

  // Market intelligence layers
  marketSummary: MarketSummary;
  historicalContext: HistoricalContext;
  healthScore: HealthScoreBreakdown;
  opportunityScore: OpportunityScoreBreakdown;
  riskAssessment: RiskAssessment;
  outlook: MarketOutlook;

  // Cross-layer metadata
  overallConfidence: number;     // 0-100
  dataPoints: number;
  evidenceReferences: string[];
  computedAt: string;
}

// ─── Full Intelligence Report ──────────────────────────────────────────────────

export interface MarketIntelligenceReport {
  id: string;
  generatedAt: string;
  pair: string;
  engineVersion: string;

  // All layers
  unifiedState: UnifiedMarketState;

  // Convenience top-level accessors
  regime: string;
  healthScore: number;
  opportunityScore: number;
  riskLevel: RiskLevel;
  confidence: number;

  // Report metadata
  reportSummary: string;
  keyFindings: string[];
  dataQuality: "Excellent" | "Good" | "Fair" | "Poor" | "Insufficient";
  readinessForPhase5: boolean;
}

// ─── Input feature row ────────────────────────────────────────────────────────

export interface FeatureRow {
  tradeId?: number;
  pair: string;
  session: string;
  marketRegime: string;
  trend: string;
  supplyQuality: number;
  demandQuality: number;
  liquidityScore: number;
  amdScore: number;
  confirmationQuality: number;
  setupScore: number;
  tqi: number;
  spreadPips: number;
  volatility: "low" | "medium" | "high";
  outcome: string | null;
  pnl: number;
  confidence: number;
  patternType: string;
  entryTime: Date;
}
