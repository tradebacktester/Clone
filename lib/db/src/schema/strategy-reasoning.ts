// ─── Strategy Reasoning Engine DB Schema ─────────────────────────────────────
// Stores every strategy reasoning report, similar trades found, and history.
// All tables are append-only. No strategy parameters are modified.

import {
  pgTable, serial, text, integer, numeric,
  timestamp, jsonb, index, boolean,
} from "drizzle-orm/pg-core";

// ─── Reasoning Reports ────────────────────────────────────────────────────────
// One row per evaluated setup.

export const srReportsTable = pgTable("sr_reports", {
  id:         serial("id").primaryKey(),
  reportId:   text("report_id").notNull().unique(),
  version:    text("version").notNull().default("1.0.0"),
  setupId:    text("setup_id"),

  // Setup snapshot
  pair:        text("pair").notNull().default("EURUSD"),
  session:     text("session").notNull().default("unknown"),
  regime:      text("regime").notNull().default("unknown"),
  trend:       text("trend").notNull().default("unknown"),
  volatility:  text("volatility").notNull().default("medium"),

  supplyQuality:       numeric("supply_quality",       { precision: 5, scale: 2 }),
  demandQuality:       numeric("demand_quality",       { precision: 5, scale: 2 }),
  liquidityScore:      numeric("liquidity_score",      { precision: 5, scale: 2 }),
  amdScore:            numeric("amd_score",            { precision: 5, scale: 2 }),
  confirmationQuality: numeric("confirmation_quality", { precision: 5, scale: 2 }),
  setupScore:          numeric("setup_score",          { precision: 5, scale: 2 }),
  tqi:                 numeric("tqi",                  { precision: 5, scale: 2 }),
  rrPlanned:           numeric("rr_planned",           { precision: 6, scale: 2 }),
  spreadPips:          numeric("spread_pips",          { precision: 6, scale: 3 }),

  // Optional market context inputs
  trendStrength:       numeric("trend_strength",       { precision: 5, scale: 2 }),
  correlationScore:    numeric("correlation_score",    { precision: 5, scale: 2 }),
  stabilityScore:      numeric("stability_score",      { precision: 5, scale: 2 }),
  opportunityScore:    numeric("opportunity_score",    { precision: 5, scale: 2 }),
  marketHealthScore:   numeric("market_health_score",  { precision: 5, scale: 2 }),
  newsContext:         text("news_context").default("neutral"),

  // Component scores (0–100 each)
  ruleQualityScore:       numeric("rule_quality_score",        { precision: 5, scale: 2 }).notNull(),
  historicalEvidenceScore: numeric("historical_evidence_score", { precision: 5, scale: 2 }).notNull(),
  marketSupportScore:     numeric("market_support_score",      { precision: 5, scale: 2 }).notNull(),
  patternStrengthScore:   numeric("pattern_strength_score",    { precision: 5, scale: 2 }).notNull(),
  contextStrengthScore:   numeric("context_strength_score",    { precision: 5, scale: 2 }).notNull(),

  // Unified strength
  strategyStrengthScore:  numeric("strategy_strength_score",  { precision: 5, scale: 2 }).notNull(),
  confidenceScore:        numeric("confidence_score",          { precision: 5, scale: 2 }).notNull(),
  strengthTier:           text("strength_tier").notNull().default("insufficient"),

  // Historical evidence summary
  evidenceCount:       integer("evidence_count").notNull().default(0),
  winCount:            integer("win_count").notNull().default(0),
  lossCount:           integer("loss_count").notNull().default(0),
  historicalWinRate:   numeric("historical_win_rate",     { precision: 6, scale: 4 }),
  averageRR:           numeric("average_rr",              { precision: 6, scale: 2 }),
  profitFactor:        numeric("profit_factor",           { precision: 8, scale: 4 }),
  statisticalExpectancy: numeric("statistical_expectancy",{ precision: 8, scale: 4 }),
  wilsonLowerBound:    numeric("wilson_lower_bound",      { precision: 6, scale: 4 }),

  // Recommendation
  recommendation:       text("recommendation").notNull(),
  recommendationLabel:  text("recommendation_label").notNull(),
  recommendationRationale: text("recommendation_rationale"),

  // Rule details
  passingRules:    integer("passing_rules").notNull().default(0),
  totalRules:      integer("total_rules").notNull().default(0),
  failedRules:     integer("failed_rules").notNull().default(0),
  barelyPassed:    integer("barely_passed").notNull().default(0),
  exceptionalRules: integer("exceptional_rules").notNull().default(0),
  ruleDetails:     jsonb("rule_details").$type<unknown[]>(),

  // Full payloads
  componentScores:     jsonb("component_scores").$type<unknown[]>(),
  strongestFactors:    jsonb("strongest_factors").$type<unknown[]>(),
  weakestFactors:      jsonb("weakest_factors").$type<unknown[]>(),
  potentialRisks:      jsonb("potential_risks").$type<string[]>(),
  riskAssessment:      text("risk_assessment"),
  reasoning:           text("reasoning").notNull().default(""),

  isAdvisoryOnly:   boolean("is_advisory_only").notNull().default(true),
  evaluatedAt:      timestamp("evaluated_at").notNull().defaultNow(),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
}, t => ({
  idxPair:        index("sr_reports_pair_idx").on(t.pair),
  idxSession:     index("sr_reports_session_idx").on(t.session),
  idxEvaluated:   index("sr_reports_evaluated_idx").on(t.evaluatedAt),
  idxStrength:    index("sr_reports_strength_idx").on(t.strategyStrengthScore),
  idxRecommendation: index("sr_reports_rec_idx").on(t.recommendation),
}));

// ─── Similar Trades ───────────────────────────────────────────────────────────
// Historical trades surfaced as evidence for a reasoning report.

export const srSimilarTradesTable = pgTable("sr_similar_trades", {
  id:          serial("id").primaryKey(),
  reportId:    text("report_id").notNull(),
  tradeId:     text("trade_id").notNull(),
  pair:        text("pair").notNull(),
  session:     text("session").notNull(),
  regime:      text("regime").notNull(),
  outcome:     text("outcome").notNull(),
  rrActual:    numeric("rr_actual",   { precision: 6, scale: 2 }),
  similarity:  numeric("similarity",  { precision: 6, scale: 4 }).notNull(),
  setupScore:  numeric("setup_score", { precision: 5, scale: 2 }),
  tqi:         numeric("tqi",         { precision: 5, scale: 2 }),
  openedAt:    timestamp("opened_at"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
}, t => ({
  idxReport: index("sr_similar_trades_report_idx").on(t.reportId),
}));

// ─── Reasoning History ────────────────────────────────────────────────────────
// Audit log for lifecycle events.

export const srHistoryTable = pgTable("sr_history", {
  id:        serial("id").primaryKey(),
  reportId:  text("report_id").notNull(),
  event:     text("event").notNull(),  // created | viewed | exported
  detail:    text("detail"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, t => ({
  idxReport: index("sr_history_report_idx").on(t.reportId),
}));

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type SrReport        = typeof srReportsTable.$inferSelect;
export type SrSimilarTrade  = typeof srSimilarTradesTable.$inferSelect;
export type SrHistory       = typeof srHistoryTable.$inferSelect;
export type NewSrReport     = typeof srReportsTable.$inferInsert;
export type NewSrSimilarTrade = typeof srSimilarTradesTable.$inferInsert;
export type NewSrHistory    = typeof srHistoryTable.$inferInsert;
