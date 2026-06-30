// ─── Executive Strategy Brain — DB Schema ─────────────────────────────────────
// Unified Strategy Intelligence Object storage.
// Advisory only. NEVER modifies production strategy or bypasses approval flow.

import {
  pgTable, serial, text, integer, numeric,
  timestamp, jsonb, index, boolean,
} from "drizzle-orm/pg-core";

// ─── ESB Reports ──────────────────────────────────────────────────────────────
// One row per Unified Strategy Intelligence Object generated.

export const esbReportsTable = pgTable("esb_reports", {
  id:       serial("id").primaryKey(),
  reportId: text("report_id").notNull().unique(),

  // Versions of each subsystem used
  engineVersion:      text("engine_version").notNull().default("1.0.0"),
  srVersion:          text("sr_version"),
  sqiVersion:         text("sqi_version"),
  tiVersion:          text("ti_version"),
  researchVersion:    text("research_version"),
  marketVersion:      text("market_version"),

  // Setup snapshot
  pair:       text("pair").notNull().default("EURUSD"),
  session:    text("session").notNull().default("unknown"),
  regime:     text("regime").notNull().default("unknown"),
  trend:      text("trend").notNull().default("unknown"),
  volatility: text("volatility").notNull().default("medium"),

  // ── Rule Engine ─────────────────────────────────────────────────
  rulePassRate:       numeric("rule_pass_rate",      { precision: 5, scale: 2 }),
  ruleIntegrity:      numeric("rule_integrity",      { precision: 5, scale: 2 }),
  ruleConfidence:     numeric("rule_confidence",     { precision: 5, scale: 2 }),
  ruleQualityScore:   numeric("rule_quality_score",  { precision: 5, scale: 2 }),

  // ── Strategy Reasoning ──────────────────────────────────────────
  strategyStrength:   numeric("strategy_strength",  { precision: 5, scale: 2 }),
  reasoningConfidence: numeric("reasoning_confidence", { precision: 5, scale: 2 }),
  strongestReasons:   jsonb("strongest_reasons").$type<string[]>(),
  weakestReasons:     jsonb("weakest_reasons").$type<string[]>(),
  reasoningEvidence:  integer("reasoning_evidence"),
  reasoningReportId:  text("reasoning_report_id"),

  // ── Strategy Quality ─────────────────────────────────────────────
  overallQualityScore:  numeric("overall_quality_score", { precision: 5, scale: 2 }),
  structuralQuality:    numeric("structural_quality",    { precision: 5, scale: 2 }),
  liquidityQuality:     numeric("liquidity_quality",     { precision: 5, scale: 2 }),
  amdQuality:           numeric("amd_quality",           { precision: 5, scale: 2 }),
  confirmationQuality:  numeric("confirmation_quality",  { precision: 5, scale: 2 }),
  historicalQuality:    numeric("historical_quality",    { precision: 5, scale: 2 }),
  sqiReportId:          text("sqi_report_id"),

  // ── Trader Identity ──────────────────────────────────────────────
  identitySimilarity:      numeric("identity_similarity",     { precision: 5, scale: 2 }),
  preferenceAlignment:     numeric("preference_alignment",    { precision: 5, scale: 2 }),
  historicalConsistency:   numeric("historical_consistency",  { precision: 5, scale: 2 }),
  driftStatus:             text("drift_status"),
  tiReportId:              text("ti_report_id"),

  // ── Historical Intelligence ──────────────────────────────────────
  histSimilarTradeCount:  integer("hist_similar_trade_count").default(0),
  histWinRate:            numeric("hist_win_rate",      { precision: 6, scale: 4 }),
  histProfitFactor:       numeric("hist_profit_factor", { precision: 8, scale: 4 }),
  histAvgRR:              numeric("hist_avg_rr",        { precision: 6, scale: 2 }),
  histExpectancy:         numeric("hist_expectancy",    { precision: 8, scale: 4 }),
  histSampleSize:         integer("hist_sample_size").default(0),

  // ── Market Intelligence ──────────────────────────────────────────
  marketHealth:           numeric("market_health",      { precision: 5, scale: 2 }),
  opportunityScore:       numeric("opportunity_score",  { precision: 5, scale: 2 }),
  marketRegime:           text("market_regime"),
  marketTrend:            text("market_trend"),
  marketVolatility:       numeric("market_volatility",  { precision: 5, scale: 2 }),
  marketLiquidity:        numeric("market_liquidity",   { precision: 5, scale: 2 }),
  marketCorrelation:      numeric("market_correlation", { precision: 5, scale: 2 }),
  marketStability:        numeric("market_stability",   { precision: 5, scale: 2 }),

  // ── Research Intelligence ────────────────────────────────────────
  activeHypotheses:           integer("active_hypotheses").default(0),
  candidateImprovements:      integer("candidate_improvements").default(0),
  experimentalStrategyStatus: text("experimental_strategy_status"),
  researchConfidence:         numeric("research_confidence", { precision: 5, scale: 2 }),
  pendingDeployments:         integer("pending_deployments").default(0),

  // ── Executive Score & Recommendation ────────────────────────────
  executiveScore:       numeric("executive_score",       { precision: 5, scale: 2 }).notNull(),
  recommendation:       text("recommendation").notNull(),    // elite | very_strong | strong | acceptable | borderline | weak | reject
  recommendationLabel:  text("recommendation_label").notNull(),
  recommendationRationale: text("recommendation_rationale").notNull().default(""),

  // Explainability
  confidenceInterval:   jsonb("confidence_interval").$type<{ lower: number; upper: number }>(),
  reliabilityRating:    text("reliability_rating"),
  explainabilityScore:  numeric("explainability_score", { precision: 5, scale: 2 }),

  // Weight breakdown (transparent)
  scoreWeights:         jsonb("score_weights").$type<Record<string, number>>(),
  scoreBreakdown:       jsonb("score_breakdown").$type<Record<string, number>>(),

  // Full payloads
  supportingRules:          jsonb("supporting_rules").$type<string[]>(),
  supportingHistoricalEvidence: jsonb("supporting_hist_evidence").$type<string[]>(),
  supportingMarketEvidence: jsonb("supporting_market_evidence").$type<string[]>(),
  supportingStats:          jsonb("supporting_stats").$type<string[]>(),
  historicalReferences:     jsonb("historical_references").$type<unknown[]>(),
  fullPayload:              jsonb("full_payload").$type<unknown>(),

  // Outcome (populated post-trade for replay)
  tradeOutcome:   text("trade_outcome"),
  tradeRR:        numeric("trade_rr", { precision: 6, scale: 2 }),
  tradePnl:       numeric("trade_pnl", { precision: 10, scale: 2 }),

  isAdvisoryOnly: boolean("is_advisory_only").notNull().default(true),
  evaluatedAt:    timestamp("evaluated_at").notNull().defaultNow(),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
}, t => [
  index("esb_reports_pair_idx").on(t.pair),
  index("esb_reports_session_idx").on(t.session),
  index("esb_reports_score_idx").on(t.executiveScore),
  index("esb_reports_rec_idx").on(t.recommendation),
  index("esb_reports_evaluated_idx").on(t.evaluatedAt),
]);

// ─── ESB Timeline ─────────────────────────────────────────────────────────────
// Lightweight append-only timeline for replay and trend analysis.

export const esbTimelineTable = pgTable("esb_timeline", {
  id:                serial("id").primaryKey(),
  reportId:          text("report_id").notNull(),
  pair:              text("pair").notNull(),
  session:           text("session").notNull(),
  regime:            text("regime").notNull(),
  executiveScore:    numeric("executive_score",  { precision: 5, scale: 2 }).notNull(),
  recommendation:    text("recommendation").notNull(),
  strategyStrength:  numeric("strategy_strength", { precision: 5, scale: 2 }),
  ruleQualityScore:  numeric("rule_quality_score", { precision: 5, scale: 2 }),
  qualityScore:      numeric("quality_score",   { precision: 5, scale: 2 }),
  identityScore:     numeric("identity_score",  { precision: 5, scale: 2 }),
  marketScore:       numeric("market_score",    { precision: 5, scale: 2 }),
  // Versions
  engineVersion:     text("engine_version"),
  srVersion:         text("sr_version"),
  sqiVersion:        text("sqi_version"),
  tiVersion:         text("ti_version"),
  // Outcome
  tradeOutcome:      text("trade_outcome"),
  tradeRR:           numeric("trade_rr", { precision: 6, scale: 2 }),
  evaluatedAt:       timestamp("evaluated_at").notNull().defaultNow(),
  createdAt:         timestamp("created_at").notNull().defaultNow(),
}, t => [
  index("esb_timeline_pair_idx").on(t.pair),
  index("esb_timeline_evaluated_idx").on(t.evaluatedAt),
  index("esb_timeline_score_idx").on(t.executiveScore),
]);

// ─── ESB Certification ────────────────────────────────────────────────────────
// Institutional audit results per certification run.

export const esbCertificationTable = pgTable("esb_certification", {
  id:              serial("id").primaryKey(),
  certId:          text("cert_id").notNull().unique(),
  engineVersion:   text("engine_version").notNull().default("1.0.0"),

  // Overall
  overallScore:        numeric("overall_score",      { precision: 5, scale: 2 }).notNull(),
  certificationStatus: text("certification_status").notNull(), // certified | conditional | failed
  grade:               text("grade").notNull(),

  // Subsystem scores
  ruleConsistency:          numeric("rule_consistency",         { precision: 5, scale: 2 }),
  statisticalValidity:      numeric("statistical_validity",     { precision: 5, scale: 2 }),
  explainabilityScore:      numeric("explainability_score",     { precision: 5, scale: 2 }),
  historicalReproducibility: numeric("hist_reproducibility",   { precision: 5, scale: 2 }),
  identityIntegrity:        numeric("identity_integrity",       { precision: 5, scale: 2 }),
  learningIntegrity:        numeric("learning_integrity",       { precision: 5, scale: 2 }),
  researchIsolation:        numeric("research_isolation",       { precision: 5, scale: 2 }),
  apiStability:             numeric("api_stability",            { precision: 5, scale: 2 }),
  dashboardFunctionality:   numeric("dashboard_functionality",  { precision: 5, scale: 2 }),
  performanceScore:         numeric("performance_score",        { precision: 5, scale: 2 }),
  scalabilityScore:         numeric("scalability_score",        { precision: 5, scale: 2 }),

  // Detail
  subsystemReadiness: jsonb("subsystem_readiness").$type<Record<string, number>>(),
  criticalIssues:     jsonb("critical_issues").$type<string[]>(),
  warnings:           jsonb("warnings").$type<string[]>(),
  recommendations:    jsonb("recommendations").$type<string[]>(),
  technicalDebt:      jsonb("technical_debt").$type<string[]>(),
  fullReport:         jsonb("full_report").$type<unknown>(),

  certifiedAt:  timestamp("certified_at").notNull().defaultNow(),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
}, t => [
  index("esb_cert_status_idx").on(t.certificationStatus),
  index("esb_cert_score_idx").on(t.overallScore),
  index("esb_cert_certified_idx").on(t.certifiedAt),
]);

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type EsbReport          = typeof esbReportsTable.$inferSelect;
export type NewEsbReport       = typeof esbReportsTable.$inferInsert;
export type EsbTimeline        = typeof esbTimelineTable.$inferSelect;
export type NewEsbTimeline     = typeof esbTimelineTable.$inferInsert;
export type EsbCertification   = typeof esbCertificationTable.$inferSelect;
export type NewEsbCertification = typeof esbCertificationTable.$inferInsert;
