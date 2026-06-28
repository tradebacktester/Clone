// ─── Learning Engine DB Schema ───────────────────────────────────────────────
// Append-only learning cycle history.
// Never overwrites previous learning — each cycle is a permanent record.

import {
  pgTable, serial, text, integer, numeric,
  timestamp, jsonb, index, boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const learningCyclesTable = pgTable("learning_cycles", {
  id:                serial("id").primaryKey(),
  cycleId:           text("cycle_id").notNull().unique(),           // UUID from engine
  version:           text("version").notNull().default("1.0.0"),    // semver — never decremented
  cycleNumber:       integer("cycle_number").notNull(),              // monotonic
  status:            text("status").notNull().default("running"),   // running|complete|failed
  triggeredBy:       text("triggered_by").notNull().default("manual"), // manual|scheduled

  // Data range covered
  dataRangeFrom:     timestamp("data_range_from", { withTimezone: true }),
  dataRangeTo:       timestamp("data_range_to", { withTimezone: true }),
  sampleSize:        integer("sample_size").notNull().default(0),

  // Validation
  validationStatus:  text("validation_status").notNull().default("failed"), // passed|degraded|failed
  completenessScore: numeric("completeness_score", { precision: 5, scale: 2 }),
  rejectedRecords:   integer("rejected_records").notNull().default(0),

  // Core metrics (denormalised for dashboard queries)
  totalTrades:       integer("total_trades"),
  wins:              integer("wins"),
  losses:            integer("losses"),
  winRate:           numeric("win_rate",        { precision: 6, scale: 4 }),
  avgRR:             numeric("avg_rr",          { precision: 6, scale: 2 }),
  profitFactor:      numeric("profit_factor",   { precision: 8, scale: 4 }),
  expectancy:        numeric("expectancy",      { precision: 10, scale: 4 }),
  sharpeRatio:       numeric("sharpe_ratio",    { precision: 8, scale: 4 }),
  sortinoRatio:      numeric("sortino_ratio",   { precision: 8, scale: 4 }),
  maxDrawdownPct:    numeric("max_drawdown_pct",{ precision: 6, scale: 2 }),
  totalPnl:          numeric("total_pnl",       { precision: 18, scale: 4 }),

  // Confidence
  overallConfidence:    numeric("overall_confidence",    { precision: 5, scale: 2 }),
  overallTier:          text("overall_tier"),                         // insufficient|low|moderate|high|very_high
  minSampleReached:     boolean("min_sample_reached").default(false),

  // Full cycle payload (JSONB for completeness)
  validationPayload:    jsonb("validation_payload").$type<Record<string, unknown>>(),
  metricsPayload:       jsonb("metrics_payload").$type<Record<string, unknown>>(),
  confidencePayload:    jsonb("confidence_payload").$type<Record<string, unknown>>(),
  statisticsPayload:    jsonb("statistics_payload").$type<Record<string, unknown>>(),
  featureSummary:       jsonb("feature_summary").$type<Record<string, unknown>>(),
  recommendations:      jsonb("recommendations").$type<unknown[]>(),

  // Timing
  durationMs:        integer("duration_ms"),
  errorMessage:      text("error_message"),
  startedAt:         timestamp("started_at",    { withTimezone: true }).notNull().defaultNow(),
  completedAt:       timestamp("completed_at",  { withTimezone: true }),
}, (t) => [
  index("learning_cycles_cycle_id_idx").on(t.cycleId),
  index("learning_cycles_status_idx").on(t.status),
  index("learning_cycles_started_at_idx").on(t.startedAt),
  index("learning_cycles_cycle_number_idx").on(t.cycleNumber),
]);

export const insertLearningCycleSchema = createInsertSchema(learningCyclesTable).omit({
  id: true,
  startedAt: true,
});
export type InsertLearningCycleRow = z.infer<typeof insertLearningCycleSchema>;
export type LearningCycleRow = typeof learningCyclesTable.$inferSelect;

// ─── Learning Features ────────────────────────────────────────────────────────
// One row per extracted feature — stored separately for future ML pipelines.

export const learningFeaturesTable = pgTable("learning_features", {
  id:                  serial("id").primaryKey(),
  cycleId:             text("cycle_id").notNull(),               // FK → learning_cycles.cycle_id
  tradeId:             text("trade_id").notNull(),
  pair:                text("pair").notNull(),
  session:             text("session").notNull(),
  trend:               text("trend").notNull(),
  marketRegime:        text("market_regime").notNull(),
  supplyQuality:       numeric("supply_quality",       { precision: 5, scale: 2 }).notNull(),
  demandQuality:       numeric("demand_quality",       { precision: 5, scale: 2 }).notNull(),
  liquidityScore:      numeric("liquidity_score",      { precision: 5, scale: 2 }).notNull(),
  amdScore:            numeric("amd_score",            { precision: 5, scale: 2 }).notNull(),
  confirmationQuality: numeric("confirmation_quality", { precision: 5, scale: 2 }).notNull(),
  tradeDurationMins:   integer("trade_duration_mins").notNull(),
  spreadPips:          numeric("spread_pips",          { precision: 6, scale: 2 }).notNull(),
  volatility:          text("volatility").notNull(),
  rrPlanned:           numeric("rr_planned",           { precision: 6, scale: 2 }).notNull(),
  rrActual:            numeric("rr_actual",            { precision: 6, scale: 2 }).notNull(),
  outcome:             text("outcome").notNull(),
  pnl:                 numeric("pnl",                  { precision: 18, scale: 4 }).notNull(),
  pnlPercent:          numeric("pnl_percent",          { precision: 10, scale: 4 }).notNull(),
  setupScore:          numeric("setup_score",          { precision: 5, scale: 2 }).notNull(),
  confidence:          numeric("confidence",           { precision: 5, scale: 2 }).notNull(),
  tqi:                 numeric("tqi",                  { precision: 5, scale: 2 }).notNull(),
  openedAt:            timestamp("opened_at",          { withTimezone: true }),
  extractedAt:         timestamp("extracted_at",       { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("learning_features_cycle_id_idx").on(t.cycleId),
  index("learning_features_trade_id_idx").on(t.tradeId),
  index("learning_features_pair_idx").on(t.pair),
  index("learning_features_outcome_idx").on(t.outcome),
  index("learning_features_extracted_at_idx").on(t.extractedAt),
]);

export const insertLearningFeatureSchema = createInsertSchema(learningFeaturesTable).omit({ id: true, extractedAt: true });
export type InsertLearningFeature = z.infer<typeof insertLearningFeatureSchema>;
export type LearningFeatureRow = typeof learningFeaturesTable.$inferSelect;
