// ─── Unified Market Intelligence DB Schema ─────────────────────────────────────
// Advisory only. No trade execution. No strategy modification.
// Stores unified intelligence reports, health scores, opportunity scores,
// risk assessments, and market outlooks.

import {
  pgTable, serial, text, integer, numeric,
  timestamp, jsonb, index, uuid,
} from "drizzle-orm/pg-core";

// ─── Unified Intelligence Reports ─────────────────────────────────────────────
// One row per intelligence report generation. Append-only.

export const marketIntelligenceReportsTable = pgTable("market_intelligence_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  pair: text("pair").notNull().default("EURUSD"),
  engineVersion: text("engine_version").notNull().default("1.0.0"),

  // Market Summary
  regime: text("regime").notNull().default("unknown"),
  trendDirection: text("trend_direction").notNull().default("unknown"),
  trendStrength: numeric("trend_strength", { precision: 5, scale: 2 }).notNull().default("0"),
  trendAge: integer("trend_age").notNull().default(0),
  volatilityLevel: text("volatility_level").notNull().default("medium"),
  liquidityQuality: text("liquidity_quality").notNull().default("moderate"),
  correlationState: text("correlation_state").notNull().default("low"),
  newsContext: text("news_context").notNull().default("clear"),
  session: text("session").notNull().default("unknown"),
  spread: text("spread").notNull().default("normal"),
  marketStability: numeric("market_stability", { precision: 5, scale: 2 }).notNull().default("50"),

  // Scores
  healthScore: integer("health_score").notNull().default(50),
  opportunityScore: integer("opportunity_score").notNull().default(50),
  riskLevel: text("risk_level").notNull().default("Moderate"),      // Low | Moderate | Elevated | High | Extreme
  overallConfidence: integer("overall_confidence").notNull().default(50),

  // Historical context
  historicalSimilarityScore: numeric("historical_similarity_score", { precision: 5, scale: 2 }).notNull().default("0"),
  similarMarketsCount: integer("similar_markets_count").notNull().default(0),
  historicalWinRate: numeric("historical_win_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  historicalProfitFactor: numeric("historical_profit_factor", { precision: 6, scale: 3 }).notNull().default("0"),
  historicalExpectancy: numeric("historical_expectancy", { precision: 8, scale: 4 }).notNull().default("0"),
  historicalDrawdown: numeric("historical_drawdown", { precision: 5, scale: 2 }).notNull().default("0"),

  // Full report payload
  fullReport: jsonb("full_report"),
  generatedAt: timestamp("generated_at").defaultNow(),
}, (t) => [
  index("mir_pair_generated_idx").on(t.pair, t.generatedAt),
  index("mir_regime_idx").on(t.regime),
  index("mir_health_idx").on(t.healthScore),
  index("mir_generated_at_idx").on(t.generatedAt),
]);

// ─── Market Health Scores ──────────────────────────────────────────────────────
// One row per health score computation. Stores component breakdown.

export const marketHealthScoresTable = pgTable("market_health_scores", {
  id: serial("id").primaryKey(),
  pair: text("pair").notNull().default("EURUSD"),
  overallScore: integer("overall_score").notNull().default(50),

  // Component scores (0-100)
  stabilityScore: integer("stability_score").notNull().default(50),
  liquidityScore: integer("liquidity_score").notNull().default(50),
  volatilityScore: integer("volatility_score").notNull().default(50),
  correlationScore: integer("correlation_score").notNull().default(50),
  newsRiskScore: integer("news_risk_score").notNull().default(50),
  trendQualityScore: integer("trend_quality_score").notNull().default(50),
  historicalReliabilityScore: integer("historical_reliability_score").notNull().default(50),
  dataQualityScore: integer("data_quality_score").notNull().default(50),

  // Component weights (sum to 1.0)
  componentWeights: jsonb("component_weights"),

  // Grade: A | B | C | D | F
  grade: text("grade").notNull().default("C"),
  interpretation: text("interpretation").notNull().default(""),
  computedAt: timestamp("computed_at").defaultNow(),
}, (t) => [
  index("mhs_pair_computed_idx").on(t.pair, t.computedAt),
  index("mhs_score_idx").on(t.overallScore),
]);

// ─── Market Opportunity Scores ─────────────────────────────────────────────────
// One row per opportunity score computation. Not directional.

export const marketOpportunityScoresTable = pgTable("market_opportunity_scores", {
  id: serial("id").primaryKey(),
  pair: text("pair").notNull().default("EURUSD"),
  overallScore: integer("overall_score").notNull().default(50),

  // Factor scores (0-100)
  regimeScore: integer("regime_score").notNull().default(50),
  trendScore: integer("trend_score").notNull().default(50),
  liquidityScore: integer("liquidity_score").notNull().default(50),
  volatilityScore: integer("volatility_score").notNull().default(50),
  historicalScore: integer("historical_score").notNull().default(50),
  stabilityScore: integer("stability_score").notNull().default(50),
  confidenceScore: integer("confidence_score").notNull().default(50),

  // Label: Very Low | Low | Moderate | Good | High | Excellent
  label: text("label").notNull().default("Moderate"),
  reasoning: text("reasoning").notNull().default(""),
  factorWeights: jsonb("factor_weights"),
  computedAt: timestamp("computed_at").defaultNow(),
}, (t) => [
  index("mos_pair_computed_idx").on(t.pair, t.computedAt),
  index("mos_score_idx").on(t.overallScore),
]);

// ─── Market Risk Assessments ───────────────────────────────────────────────────
// One row per risk assessment. Stores dimension breakdown with evidence.

export const marketRiskAssessmentsTable = pgTable("market_risk_assessments", {
  id: serial("id").primaryKey(),
  pair: text("pair").notNull().default("EURUSD"),

  // Overall risk level
  overallRisk: text("overall_risk").notNull().default("Moderate"), // Low | Moderate | Elevated | High | Extreme

  // Dimension risks
  volatilityRisk: text("volatility_risk").notNull().default("Low"),
  liquidityRisk: text("liquidity_risk").notNull().default("Low"),
  correlationRisk: text("correlation_risk").notNull().default("Low"),
  newsRisk: text("news_risk").notNull().default("Low"),
  sessionRisk: text("session_risk").notNull().default("Low"),
  spreadRisk: text("spread_risk").notNull().default("Low"),

  // Numeric scores for each dimension (0-100, higher = more risk)
  volatilityRiskScore: integer("volatility_risk_score").notNull().default(0),
  liquidityRiskScore: integer("liquidity_risk_score").notNull().default(0),
  correlationRiskScore: integer("correlation_risk_score").notNull().default(0),
  newsRiskScore: integer("news_risk_score").notNull().default(0),
  sessionRiskScore: integer("session_risk_score").notNull().default(0),
  spreadRiskScore: integer("spread_risk_score").notNull().default(0),

  // Evidence references
  evidence: jsonb("evidence"),
  assessedAt: timestamp("assessed_at").defaultNow(),
}, (t) => [
  index("mra_pair_assessed_idx").on(t.pair, t.assessedAt),
  index("mra_overall_risk_idx").on(t.overallRisk),
]);

// ─── Market Outlook Records ────────────────────────────────────────────────────
// One row per outlook computation.

export const marketOutlookTable = pgTable("market_outlook", {
  id: serial("id").primaryKey(),
  pair: text("pair").notNull().default("EURUSD"),

  // Primary outlook
  primaryOutlook: text("primary_outlook").notNull().default(""),      // e.g., "Continuation of trending regime"
  primaryProbability: numeric("primary_probability", { precision: 5, scale: 2 }).notNull().default("0"),

  // Alternative scenario
  alternativeOutlook: text("alternative_outlook").notNull().default(""),
  alternativeProbability: numeric("alternative_probability", { precision: 5, scale: 2 }).notNull().default("0"),

  // Transition outlook
  transitionProbability: numeric("transition_probability", { precision: 5, scale: 2 }).notNull().default("0"),
  expectedDurationBars: integer("expected_duration_bars").notNull().default(0),

  // Confidence and evidence
  confidence: integer("confidence").notNull().default(50),
  supportingEvidence: jsonb("supporting_evidence"),
  historicalBasis: text("historical_basis").notNull().default(""),

  // Scenario list
  scenarios: jsonb("scenarios"),
  computedAt: timestamp("computed_at").defaultNow(),
}, (t) => [
  index("mo_pair_computed_idx").on(t.pair, t.computedAt),
  index("mo_confidence_idx").on(t.confidence),
]);

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type MarketIntelligenceReport = typeof marketIntelligenceReportsTable.$inferSelect;
export type NewMarketIntelligenceReport = typeof marketIntelligenceReportsTable.$inferInsert;

export type MarketHealthScore = typeof marketHealthScoresTable.$inferSelect;
export type NewMarketHealthScore = typeof marketHealthScoresTable.$inferInsert;

export type MarketOpportunityScore = typeof marketOpportunityScoresTable.$inferSelect;
export type NewMarketOpportunityScore = typeof marketOpportunityScoresTable.$inferInsert;

export type MarketRiskAssessment = typeof marketRiskAssessmentsTable.$inferSelect;
export type NewMarketRiskAssessment = typeof marketRiskAssessmentsTable.$inferInsert;

export type MarketOutlook = typeof marketOutlookTable.$inferSelect;
export type NewMarketOutlook = typeof marketOutlookTable.$inferInsert;
