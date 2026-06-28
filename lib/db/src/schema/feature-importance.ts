// ─── Feature Importance DB Schema ─────────────────────────────────────────────
// Stores feature-level importance analysis, interaction results, confidence
// history, and analysis cycle records.
// All tables are append-friendly; nothing is ever overwritten on the cycle log.

import {
  pgTable, serial, text, integer, numeric,
  timestamp, jsonb, index, boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Analysis Cycles ──────────────────────────────────────────────────────────
// Append-only log — one row per analysis run. Never overwritten.

export const fiAnalysisCyclesTable = pgTable("fi_analysis_cycles", {
  id:               serial("id").primaryKey(),
  cycleId:          text("cycle_id").notNull().unique(),       // uuid
  version:          text("version").notNull().default("1.0.0"),
  status:           text("status").notNull().default("running"), // running | complete | failed
  triggeredBy:      text("triggered_by").notNull().default("manual"),
  sampleSize:       integer("sample_size").notNull().default(0),
  featuresAnalyzed: integer("features_analyzed").notNull().default(0),
  interactionsFound: integer("interactions_found").notNull().default(0),
  overallConfidence: numeric("overall_confidence", { precision: 5, scale: 2 }),
  validationPassed: boolean("validation_passed").notNull().default(false),
  validationNotes:  jsonb("validation_notes").$type<string[]>(),
  errorMessage:     text("error_message"),
  startedAt:        timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt:      timestamp("completed_at", { withTimezone: true }),
  durationMs:       integer("duration_ms"),
}, (t) => [
  index("fi_cycles_started_at_idx").on(t.startedAt),
  index("fi_cycles_status_idx").on(t.status),
]);

export const insertFiCycleSchema = createInsertSchema(fiAnalysisCyclesTable).omit({ id: true });
export type InsertFiCycle = z.infer<typeof insertFiCycleSchema>;
export type FiAnalysisCycleRow = typeof fiAnalysisCyclesTable.$inferSelect;

// ─── Feature Records ──────────────────────────────────────────────────────────
// One row per feature (upserted on each analysis run).

export const fiFeatureRecordsTable = pgTable("fi_feature_records", {
  id:                  serial("id").primaryKey(),
  featureId:           text("feature_id").notNull().unique(),   // e.g. "supply_zone_quality"
  displayName:         text("display_name").notNull(),
  category:            text("category").notNull(),              // zone | execution | context | risk
  description:         text("description").notNull(),
  dataType:            text("data_type").notNull(),             // numeric | categorical

  // Core stats
  sampleSize:          integer("sample_size").notNull().default(0),
  wins:                integer("wins").notNull().default(0),
  losses:              integer("losses").notNull().default(0),
  breakEvens:          integer("break_evens").notNull().default(0),
  winRate:             numeric("win_rate",          { precision: 6, scale: 4 }),
  lossRate:            numeric("loss_rate",         { precision: 6, scale: 4 }),
  avgRR:               numeric("avg_rr",            { precision: 6, scale: 2 }),
  avgProfit:           numeric("avg_profit",        { precision: 10, scale: 4 }),
  avgLoss:             numeric("avg_loss",          { precision: 10, scale: 4 }),

  // Statistical analysis
  statisticalSignificance: numeric("statistical_significance", { precision: 6, scale: 4 }), // 0–1 (higher = more significant)
  pValue:              numeric("p_value",            { precision: 8, scale: 6 }),            // chi-square or t-test p-value
  correlationCoeff:    numeric("correlation_coeff", { precision: 6, scale: 4 }),             // point-biserial r

  // Derived scores
  predictiveValue:     numeric("predictive_value",  { precision: 5, scale: 2 }),             // 0–100
  reliabilityScore:    numeric("reliability_score", { precision: 5, scale: 2 }),             // 0–100
  confidenceScore:     numeric("confidence_score",  { precision: 5, scale: 2 }),             // 0–100

  // Evidence quality
  isInsufficient:      boolean("is_insufficient").notNull().default(true),
  insufficientReason:  text("insufficient_reason"),
  hasContradiction:    boolean("has_contradiction").notNull().default(false),
  contradictionNote:   text("contradiction_note"),
  isUnstable:          boolean("is_unstable").notNull().default(false),
  instabilityNote:     text("instability_note"),
  overfittingRisk:     text("overfitting_risk"),                                             // none | low | medium | high

  // Confidence explanation
  confidenceExplanation: text("confidence_explanation"),
  confidenceTrend:     text("confidence_trend").notNull().default("unknown"),                // improving | stable | declining | unknown
  reliabilityRating:   text("reliability_rating").notNull().default("unknown"),              // institutional | strong | moderate | weak | insufficient

  // Bucketed breakdown payload (JSONB)
  bucketBreakdown:     jsonb("bucket_breakdown").$type<Record<string, unknown>>(),
  supportingTrades:    jsonb("supporting_trades").$type<string[]>(),

  // Meta
  cycleId:             text("cycle_id"),
  version:             text("version").notNull().default("1.0.0"),
  lastAnalyzedAt:      timestamp("last_analyzed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("fi_feature_records_category_idx").on(t.category),
  index("fi_feature_records_confidence_idx").on(t.confidenceScore),
  index("fi_feature_records_predictive_idx").on(t.predictiveValue),
  index("fi_feature_records_updated_at_idx").on(t.updatedAt),
]);

export const insertFiFeatureSchema = createInsertSchema(fiFeatureRecordsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFiFeature = z.infer<typeof insertFiFeatureSchema>;
export type FiFeatureRow = typeof fiFeatureRecordsTable.$inferSelect;

// ─── Interaction Records ──────────────────────────────────────────────────────
// One row per feature combination (upserted on each analysis run).

export const fiInteractionRecordsTable = pgTable("fi_interaction_records", {
  id:                  serial("id").primaryKey(),
  interactionId:       text("interaction_id").notNull().unique(),  // "featureA::featureB"
  featureA:            text("feature_a").notNull(),
  featureB:            text("feature_b").notNull(),
  displayName:         text("display_name").notNull(),
  description:         text("description").notNull(),

  sampleSize:          integer("sample_size").notNull().default(0),
  wins:                integer("wins").notNull().default(0),
  losses:              integer("losses").notNull().default(0),
  winRate:             numeric("win_rate",      { precision: 6, scale: 4 }),
  avgRR:               numeric("avg_rr",        { precision: 6, scale: 2 }),
  avgProfit:           numeric("avg_profit",    { precision: 10, scale: 4 }),

  // Lift: does this combo outperform individual features?
  liftVsFeatureA:      numeric("lift_vs_feature_a", { precision: 6, scale: 4 }),  // ratio > 1 = synergy
  liftVsFeatureB:      numeric("lift_vs_feature_b", { precision: 6, scale: 4 }),
  synergyScore:        numeric("synergy_score",     { precision: 5, scale: 2 }),  // 0–100
  isSynergistic:       boolean("is_synergistic").notNull().default(false),

  statisticalSignificance: numeric("statistical_significance", { precision: 6, scale: 4 }),
  isInsufficient:      boolean("is_insufficient").notNull().default(true),
  insufficientReason:  text("insufficient_reason"),

  breakdown:           jsonb("breakdown").$type<Record<string, unknown>>(),

  cycleId:             text("cycle_id"),
  version:             text("version").notNull().default("1.0.0"),
  lastAnalyzedAt:      timestamp("last_analyzed_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("fi_interactions_synergy_idx").on(t.synergyScore),
  index("fi_interactions_feature_a_idx").on(t.featureA),
  index("fi_interactions_feature_b_idx").on(t.featureB),
]);

export const insertFiInteractionSchema = createInsertSchema(fiInteractionRecordsTable).omit({ id: true });
export type InsertFiInteraction = z.infer<typeof insertFiInteractionSchema>;
export type FiInteractionRow = typeof fiInteractionRecordsTable.$inferSelect;

// ─── Confidence History ───────────────────────────────────────────────────────
// Append-only snapshot per feature per analysis run.
// Enables confidence trend visualization over wall-clock time.

export const fiConfidenceHistoryTable = pgTable("fi_confidence_history", {
  id:              serial("id").primaryKey(),
  featureId:       text("feature_id").notNull(),
  cycleId:         text("cycle_id").notNull(),
  snapshotDate:    timestamp("snapshot_date", { withTimezone: true }).notNull().defaultNow(),
  confidenceScore: numeric("confidence_score",  { precision: 5, scale: 2 }),
  reliabilityScore: numeric("reliability_score", { precision: 5, scale: 2 }),
  predictiveValue: numeric("predictive_value",  { precision: 5, scale: 2 }),
  sampleSize:      integer("sample_size").notNull().default(0),
  winRate:         numeric("win_rate",          { precision: 6, scale: 4 }),
  trendDirection:  text("trend_direction").notNull().default("unknown"),
  isInsufficient:  boolean("is_insufficient").notNull().default(true),
  version:         text("version").notNull().default("1.0.0"),
}, (t) => [
  index("fi_confidence_history_feature_id_idx").on(t.featureId),
  index("fi_confidence_history_cycle_id_idx").on(t.cycleId),
  index("fi_confidence_history_snapshot_date_idx").on(t.snapshotDate),
]);

export const insertFiConfidenceHistorySchema = createInsertSchema(fiConfidenceHistoryTable).omit({ id: true });
export type InsertFiConfidenceHistory = z.infer<typeof insertFiConfidenceHistorySchema>;
export type FiConfidenceHistoryRow = typeof fiConfidenceHistoryTable.$inferSelect;
