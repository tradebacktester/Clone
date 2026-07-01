// ─── Executive Risk Brain — DB Schema ─────────────────────────────────────────
// Unified Risk Intelligence Object storage.
// Advisory only. NEVER modifies strategy, positions, or safety limits.

import {
  pgTable, serial, text, integer, numeric,
  timestamp, jsonb, index, boolean,
} from "drizzle-orm/pg-core";

// ─── ERB Reports ──────────────────────────────────────────────────────────────
// One row per full Executive Risk Intelligence Object generated.

export const erbReportsTable = pgTable("erb_reports", {
  id:       serial("id").primaryKey(),
  reportId: text("report_id").notNull().unique(),

  engineVersion: text("engine_version").notNull().default("1.0.0"),
  riskVersion:   text("risk_version").notNull().default("1.0.0"),
  isAdvisoryOnly: boolean("is_advisory_only").notNull().default(true),

  // Context
  pair:    text("pair"),
  session: text("session"),
  regime:  text("regime"),

  // ── Account Intelligence ─────────────────────────────────────────────────
  balance:            numeric("balance",              { precision: 12, scale: 2 }),
  equity:             numeric("equity",               { precision: 12, scale: 2 }),
  freeMargin:         numeric("free_margin",          { precision: 12, scale: 2 }),
  marginLevel:        numeric("margin_level",         { precision: 8, scale: 2 }),
  dailyPnl:           numeric("daily_pnl",            { precision: 12, scale: 2 }),
  weeklyPnl:          numeric("weekly_pnl",           { precision: 12, scale: 2 }),
  monthlyPnl:         numeric("monthly_pnl",          { precision: 12, scale: 2 }),
  drawdownPct:        numeric("drawdown_pct",         { precision: 6, scale: 3 }),
  accountHealthScore: numeric("account_health_score", { precision: 5, scale: 2 }),

  // ── Position Intelligence ─────────────────────────────────────────────────
  positionSize:      numeric("position_size",       { precision: 10, scale: 4 }),
  riskPct:           numeric("risk_pct",            { precision: 6, scale: 3 }),
  stopDistance:      numeric("stop_distance",       { precision: 8, scale: 2 }),
  expectedRR:        numeric("expected_rr",         { precision: 6, scale: 2 }),
  positionExposure:  numeric("position_exposure",   { precision: 12, scale: 2 }),
  positionRiskScore: numeric("position_risk_score", { precision: 5, scale: 2 }),

  // ── Portfolio Intelligence ────────────────────────────────────────────────
  openTrades:          integer("open_trades").default(0),
  currencyExposure:    jsonb("currency_exposure").$type<Record<string, number>>(),
  pairExposure:        jsonb("pair_exposure").$type<Record<string, number>>(),
  correlationExposure: numeric("correlation_exposure", { precision: 5, scale: 2 }),
  directionalBias:     numeric("directional_bias",     { precision: 6, scale: 2 }),
  portfolioRiskScore:  numeric("portfolio_risk_score", { precision: 5, scale: 2 }),

  // ── Market Risk Intelligence ──────────────────────────────────────────────
  marketHealth:    numeric("market_health",    { precision: 5, scale: 2 }),
  marketRegime:    text("market_regime"),
  volatility:      numeric("volatility",       { precision: 5, scale: 2 }),
  liquidity:       numeric("liquidity",        { precision: 5, scale: 2 }),
  correlation:     numeric("correlation",      { precision: 5, scale: 2 }),
  opportunityScore: numeric("opportunity_score", { precision: 5, scale: 2 }),
  marketRiskScore: numeric("market_risk_score", { precision: 5, scale: 2 }),

  // ── Broker Intelligence ───────────────────────────────────────────────────
  spread:               numeric("spread",                { precision: 6, scale: 3 }),
  slippage:             numeric("slippage",              { precision: 6, scale: 3 }),
  latency:              numeric("latency",               { precision: 8, scale: 2 }),
  executionTime:        numeric("execution_time",        { precision: 8, scale: 2 }),
  connectionStability:  numeric("connection_stability",  { precision: 5, scale: 2 }),
  brokerReliabilityScore: numeric("broker_reliability_score", { precision: 5, scale: 2 }),

  // ── Infrastructure Intelligence ───────────────────────────────────────────
  cpuUsage:       numeric("cpu_usage",        { precision: 5, scale: 2 }),
  memoryUsage:    numeric("memory_usage",     { precision: 5, scale: 2 }),
  dbHealth:       numeric("db_health",        { precision: 5, scale: 2 }),
  networkLatency: numeric("network_latency",  { precision: 8, scale: 2 }),
  apiStatus:      numeric("api_status",       { precision: 5, scale: 2 }),
  dataFeedHealth: numeric("data_feed_health", { precision: 5, scale: 2 }),
  systemHealthScore: numeric("system_health_score", { precision: 5, scale: 2 }),

  // ── Adaptive Risk Intelligence ────────────────────────────────────────────
  currentRiskProfile:     text("current_risk_profile"),
  recommendedRiskProfile: text("recommended_risk_profile"),
  ariConfidence:          numeric("ari_confidence",         { precision: 5, scale: 2 }),
  ariHistPerformance:     jsonb("ari_hist_performance").$type<Record<string, number>>(),
  adaptationConfidence:   numeric("adaptation_confidence",  { precision: 5, scale: 2 }),

  // ── Crisis Intelligence ───────────────────────────────────────────────────
  crisisStatus:     text("crisis_status"),
  crisisSeverity:   text("crisis_severity"),
  survivalModeActive: boolean("survival_mode_active").default(false),
  recoveryStage:    text("recovery_stage"),
  recoveryProgress: numeric("recovery_progress", { precision: 5, scale: 2 }),

  // ── Executive Risk Scores ─────────────────────────────────────────────────
  overallRiskScore:       numeric("overall_risk_score",       { precision: 5, scale: 2 }).notNull(),
  survivalScore:          numeric("survival_score",           { precision: 5, scale: 2 }).notNull(),
  capitalHealthScore:     numeric("capital_health_score",     { precision: 5, scale: 2 }).notNull(),
  infrastructureScore:    numeric("infrastructure_score",     { precision: 5, scale: 2 }).notNull(),
  brokerScore:            numeric("broker_score",             { precision: 5, scale: 2 }).notNull(),
  portfolioStabilityScore: numeric("portfolio_stability_score", { precision: 5, scale: 2 }).notNull(),
  recoveryConfidenceScore: numeric("recovery_confidence_score", { precision: 5, scale: 2 }).notNull(),

  // ── Recommendation ────────────────────────────────────────────────────────
  recommendation:      text("recommendation").notNull(),
  recommendationLabel: text("recommendation_label").notNull(),
  recommendationConf:  numeric("recommendation_conf", { precision: 5, scale: 2 }),
  rationale:           text("rationale"),

  // Explainability
  topContributingSubsystem: text("top_contributing_subsystem"),
  triggeringMetrics:        jsonb("triggering_metrics").$type<string[]>(),
  activeProtections:        jsonb("active_protections").$type<string[]>(),
  confidenceInterval:       jsonb("confidence_interval").$type<{ lower: number; upper: number }>(),
  reliabilityRating:        text("reliability_rating"),

  // Payloads
  scoreBreakdown:   jsonb("score_breakdown").$type<Record<string, unknown>>(),
  evidenceItems:    jsonb("evidence_items").$type<string[]>(),
  supportingMetrics: jsonb("supporting_metrics").$type<Record<string, number>>(),
  fullPayload:      jsonb("full_payload").$type<unknown>(),

  evaluatedAt: timestamp("evaluated_at").notNull().defaultNow(),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
}, t => [
  index("erb_reports_regime_idx").on(t.regime),
  index("erb_reports_rec_idx").on(t.recommendation),
  index("erb_reports_overall_idx").on(t.overallRiskScore),
  index("erb_reports_evaluated_idx").on(t.evaluatedAt),
]);

// ─── ERB Decisions (Timeline) ─────────────────────────────────────────────────
// Append-only log of every Executive Risk Decision for full replay.

export const erbDecisionsTable = pgTable("erb_decisions", {
  id:       serial("id").primaryKey(),
  reportId: text("report_id").notNull(),

  // Snapshot
  overallRiskScore:  numeric("overall_risk_score",  { precision: 5, scale: 2 }).notNull(),
  survivalScore:     numeric("survival_score",       { precision: 5, scale: 2 }).notNull(),
  capitalHealth:     numeric("capital_health",       { precision: 5, scale: 2 }).notNull(),
  recommendation:    text("recommendation").notNull(),
  activeRiskProfile: text("active_risk_profile"),
  crisisStatus:      text("crisis_status"),
  marketRegime:      text("market_regime"),
  strategyVersion:   text("strategy_version"),
  riskVersion:       text("risk_version"),

  // Outcome (populated post-event for replay)
  outcome:           text("outcome"),
  outcomeNotes:      text("outcome_notes"),
  outcomeCapturedAt: timestamp("outcome_captured_at"),

  evaluatedAt: timestamp("evaluated_at").notNull().defaultNow(),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
}, t => [
  index("erb_decisions_rec_idx").on(t.recommendation),
  index("erb_decisions_evaluated_idx").on(t.evaluatedAt),
  index("erb_decisions_risk_idx").on(t.overallRiskScore),
]);

// ─── ERB Certification ────────────────────────────────────────────────────────
// Risk Readiness Certification audit results.

export const erbCertificationTable = pgTable("erb_certification", {
  id:            serial("id").primaryKey(),
  certId:        text("cert_id").notNull().unique(),
  engineVersion: text("engine_version").notNull().default("1.0.0"),

  // Overall
  overallScore:        numeric("overall_score",        { precision: 5, scale: 2 }).notNull(),
  certificationStatus: text("certification_status").notNull(),
  grade:               text("grade").notNull(),
  phase7Readiness:     numeric("phase7_readiness",     { precision: 5, scale: 2 }),
  phase7ReadinessLabel: text("phase7_readiness_label"),

  // Subsystem scores (13-point audit)
  accountProtection:    numeric("account_protection",    { precision: 5, scale: 2 }),
  exposureControl:      numeric("exposure_control",      { precision: 5, scale: 2 }),
  portfolioStability:   numeric("portfolio_stability",   { precision: 5, scale: 2 }),
  marketRiskMonitoring: numeric("market_risk_monitoring",{ precision: 5, scale: 2 }),
  adaptiveRiskLogic:    numeric("adaptive_risk_logic",   { precision: 5, scale: 2 }),
  crisisDetection:      numeric("crisis_detection",      { precision: 5, scale: 2 }),
  recoveryLogic:        numeric("recovery_logic",        { precision: 5, scale: 2 }),
  explainability:       numeric("explainability",        { precision: 5, scale: 2 }),
  auditLogging:         numeric("audit_logging",         { precision: 5, scale: 2 }),
  versioning:           numeric("versioning",            { precision: 5, scale: 2 }),
  apiStability:         numeric("api_stability",         { precision: 5, scale: 2 }),
  dashboardFunctionality: numeric("dashboard_functionality", { precision: 5, scale: 2 }),
  scalability:          numeric("scalability",           { precision: 5, scale: 2 }),

  subsystemReadiness: jsonb("subsystem_readiness").$type<Record<string, number>>(),
  criticalIssues:     jsonb("critical_issues").$type<string[]>(),
  warnings:           jsonb("warnings").$type<string[]>(),
  recommendations:    jsonb("recommendations").$type<string[]>(),
  technicalDebt:      jsonb("technical_debt").$type<string[]>(),
  remainingDebt:      jsonb("remaining_debt").$type<string[]>(),
  futureImprovements: jsonb("future_improvements").$type<string[]>(),
  fullReport:         jsonb("full_report").$type<unknown>(),

  certifiedAt: timestamp("certified_at").notNull().defaultNow(),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
}, t => [
  index("erb_cert_status_idx").on(t.certificationStatus),
  index("erb_cert_score_idx").on(t.overallScore),
  index("erb_cert_certified_idx").on(t.certifiedAt),
]);

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type ErbReport          = typeof erbReportsTable.$inferSelect;
export type NewErbReport       = typeof erbReportsTable.$inferInsert;
export type ErbDecision        = typeof erbDecisionsTable.$inferSelect;
export type NewErbDecision     = typeof erbDecisionsTable.$inferInsert;
export type ErbCertification   = typeof erbCertificationTable.$inferSelect;
export type NewErbCertification = typeof erbCertificationTable.$inferInsert;
