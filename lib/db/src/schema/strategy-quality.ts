// ─── Strategy Quality Intelligence Engine — DB Schema ─────────────────────────
// Stores every SQI report and a lightweight timeline table for trend queries.
// All tables are append-only. No strategy parameters are modified.

import {
  pgTable, serial, text, integer, numeric,
  timestamp, jsonb, index, boolean,
} from "drizzle-orm/pg-core";

// ─── Quality Reports ──────────────────────────────────────────────────────────
// One row per evaluated setup — full component breakdown.

export const sqiReportsTable = pgTable("sqi_reports", {
  id:       serial("id").primaryKey(),
  reportId: text("report_id").notNull().unique(),
  version:  text("version").notNull().default("1.0.0"),
  setupId:  text("setup_id"),

  // Setup snapshot
  pair:       text("pair").notNull().default("EURUSD"),
  session:    text("session").notNull().default("unknown"),
  regime:     text("regime").notNull().default("unknown"),
  trend:      text("trend").notNull().default("unknown"),
  volatility: text("volatility").notNull().default("medium"),
  rrPlanned:  numeric("rr_planned",  { precision: 6, scale: 2 }),
  spreadPips: numeric("spread_pips", { precision: 6, scale: 3 }),

  // Core input scores
  supplyQuality:       numeric("supply_quality",       { precision: 5, scale: 2 }),
  demandQuality:       numeric("demand_quality",       { precision: 5, scale: 2 }),
  liquidityScore:      numeric("liquidity_score",      { precision: 5, scale: 2 }),
  amdScore:            numeric("amd_score",            { precision: 5, scale: 2 }),
  confirmationQuality: numeric("confirmation_quality", { precision: 5, scale: 2 }),
  setupScore:          numeric("setup_score",          { precision: 5, scale: 2 }),
  tqi:                 numeric("tqi",                  { precision: 5, scale: 2 }),

  // Component scores (0–100 each)
  ruleIntegrityScore:            numeric("rule_integrity_score",            { precision: 5, scale: 2 }).notNull(),
  structuralQualityScore:        numeric("structural_quality_score",        { precision: 5, scale: 2 }).notNull(),
  liquidityIntelligenceScore:    numeric("liquidity_intelligence_score",    { precision: 5, scale: 2 }).notNull(),
  amdIntelligenceScore:          numeric("amd_intelligence_score",          { precision: 5, scale: 2 }).notNull(),
  confirmationIntelligenceScore: numeric("confirmation_intelligence_score", { precision: 5, scale: 2 }).notNull(),
  marketIntelligenceScore:       numeric("market_intelligence_score",       { precision: 5, scale: 2 }).notNull(),
  historicalIntelligenceScore:   numeric("historical_intelligence_score",   { precision: 5, scale: 2 }).notNull(),

  // Unified SQS
  strategyQualityScore: numeric("strategy_quality_score", { precision: 5, scale: 2 }).notNull(),

  // Classification
  classification:      text("classification").notNull(),
  classificationLabel: text("classification_label").notNull(),

  // Historical summary
  evidenceCount:    integer("evidence_count").notNull().default(0),
  winRate:          numeric("win_rate",      { precision: 6, scale: 4 }),
  averageRR:        numeric("average_rr",    { precision: 6, scale: 2 }),
  wilsonLowerBound: numeric("wilson_lb",     { precision: 6, scale: 4 }),

  // Full payloads (JSONB)
  componentScores:      jsonb("component_scores").$type<unknown[]>(),
  ruleIntegrityDetail:  jsonb("rule_integrity_detail").$type<unknown>(),
  structuralDetail:     jsonb("structural_detail").$type<unknown>(),
  liquidityDetail:      jsonb("liquidity_detail").$type<unknown>(),
  amdDetail:            jsonb("amd_detail").$type<unknown>(),
  confirmationDetail:   jsonb("confirmation_detail").$type<unknown>(),
  marketDetail:         jsonb("market_detail").$type<unknown>(),
  historicalDetail:     jsonb("historical_detail").$type<unknown>(),

  // Insights
  strongestComponents: jsonb("strongest_components").$type<string[]>(),
  weakestComponents:   jsonb("weakest_components").$type<string[]>(),
  qualityNarrative:    text("quality_narrative").notNull().default(""),
  justification:       text("justification"),

  isAdvisoryOnly: boolean("is_advisory_only").notNull().default(true),
  evaluatedAt:    timestamp("evaluated_at").notNull().defaultNow(),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
}, t => ({
  idxPair:           index("sqi_reports_pair_idx").on(t.pair),
  idxSession:        index("sqi_reports_session_idx").on(t.session),
  idxSqs:            index("sqi_reports_sqs_idx").on(t.strategyQualityScore),
  idxClassification: index("sqi_reports_cls_idx").on(t.classification),
  idxEvaluated:      index("sqi_reports_evaluated_idx").on(t.evaluatedAt),
}));

// ─── Quality Timeline ─────────────────────────────────────────────────────────
// Light-weight table for time-series queries and trend analysis.

export const sqiTimelineTable = pgTable("sqi_timeline", {
  id:                   serial("id").primaryKey(),
  reportId:             text("report_id").notNull(),
  pair:                 text("pair").notNull(),
  session:              text("session").notNull(),
  regime:               text("regime").notNull(),
  strategyQualityScore: numeric("strategy_quality_score", { precision: 5, scale: 2 }).notNull(),
  classification:       text("classification").notNull(),
  ruleIntegrityScore:   numeric("rule_integrity_score",   { precision: 5, scale: 2 }),
  structuralScore:      numeric("structural_score",       { precision: 5, scale: 2 }),
  marketScore:          numeric("market_score",           { precision: 5, scale: 2 }),
  historicalScore:      numeric("historical_score",       { precision: 5, scale: 2 }),
  // Outcome populated post-trade for replay
  tradeOutcome:         text("trade_outcome"),
  tradeRR:              numeric("trade_rr", { precision: 6, scale: 2 }),
  evaluatedAt:          timestamp("evaluated_at").notNull().defaultNow(),
  createdAt:            timestamp("created_at").notNull().defaultNow(),
}, t => ({
  idxPair:      index("sqi_timeline_pair_idx").on(t.pair),
  idxEvaluated: index("sqi_timeline_evaluated_idx").on(t.evaluatedAt),
  idxSqs:       index("sqi_timeline_sqs_idx").on(t.strategyQualityScore),
}));

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type SqiReport        = typeof sqiReportsTable.$inferSelect;
export type NewSqiReport     = typeof sqiReportsTable.$inferInsert;
export type SqiTimeline      = typeof sqiTimelineTable.$inferSelect;
export type NewSqiTimeline   = typeof sqiTimelineTable.$inferInsert;
