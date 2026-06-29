// ─── Unified Market Intelligence Engine ───────────────────────────────────────
// Advisory only. No trade execution. No strategy modification.
// Single source of truth for all future intelligence modules.

export { generateIntelligenceReport, UNIFIED_INTELLIGENCE_VERSION } from "./intelligence-report.js";
export { computeHealthScore } from "./health-scorer.js";
export { computeOpportunityScore } from "./opportunity-scorer.js";
export { assessRisk } from "./risk-assessor.js";
export { compareHistorical } from "./historical-comparator.js";
export { generateOutlook } from "./outlook-generator.js";

export type {
  FeatureRow,
  MarketSummary,
  HistoricalContext,
  HistoricalMatch,
  HealthScoreBreakdown,
  HealthGrade,
  RiskDimension,
  RiskAssessment,
  RiskLevel,
  OpportunityScoreBreakdown,
  OpportunityLabel,
  OutlookScenario,
  MarketOutlook,
  UnifiedMarketState,
  MarketIntelligenceReport,
} from "./types.js";
