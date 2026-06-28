// ─── Pattern Performance DB Schema ───────────────────────────────────────────
// Stores the pattern knowledge base.
// pattern_records: one row per pattern (upserted on each analysis run).
// pattern_trend_snapshots: append-only time-series for trend visualization.

import {
  pgTable, serial, text, integer, numeric,
  timestamp, jsonb, index, boolean, unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Pattern Records ──────────────────────────────────────────────────────────

export const patternRecordsTable = pgTable("pattern_records", {
  id:                  serial("id").primaryKey(),
  patternId:           text("pattern_id").notNull().unique(),     // "category::key"
  category:            text("category").notNull(),
  key:                 text("key").notNull(),
  description:         text("description").notNull(),
  conditions:          jsonb("conditions").$type<Record<string, string>>().notNull(),
  version:             text("version").notNull().default("1.0.0"),

  // Core stats (denormalised for fast dashboard queries)
  totalTrades:         integer("total_trades").notNull().default(0),
  wins:                integer("wins").notNull().default(0),
  losses:              integer("losses").notNull().default(0),
  breakEvens:          integer("break_evens").notNull().default(0),
  winRate:             numeric("win_rate",         { precision: 6, scale: 4 }),
  lossRate:            numeric("loss_rate",         { precision: 6, scale: 4 }),
  avgRR:               numeric("avg_rr",            { precision: 6, scale: 2 }),
  avgProfit:           numeric("avg_profit",        { precision: 10, scale: 4 }),
  avgLoss:             numeric("avg_loss",          { precision: 10, scale: 4 }),
  expectancy:          numeric("expectancy",        { precision: 10, scale: 4 }),
  profitFactor:        numeric("profit_factor",     { precision: 8, scale: 4 }),
  avgDurationMins:     numeric("avg_duration_mins", { precision: 8, scale: 2 }),
  maxDrawdownPct:      numeric("max_drawdown_pct",  { precision: 6, scale: 2 }),
  recoveryFactor:      numeric("recovery_factor",   { precision: 8, scale: 4 }),
  stdDevRR:            numeric("std_dev_rr",        { precision: 6, scale: 4 }),
  ci95Lower:           numeric("ci95_lower",        { precision: 6, scale: 4 }),
  ci95Upper:           numeric("ci95_upper",        { precision: 6, scale: 4 }),

  // Evidence
  evidenceCount:       integer("evidence_count").notNull().default(0),
  statisticalConf:     numeric("statistical_confidence", { precision: 5, scale: 2 }),
  dataQualityScore:    numeric("data_quality_score",     { precision: 5, scale: 2 }),
  isInsufficient:      boolean("is_insufficient").notNull().default(true),
  insufficientReason:  text("insufficient_reason"),

  // Trend
  trendDirection:      text("trend_direction").notNull().default("insufficient_data"),
  trendConfidence:     numeric("trend_confidence", { precision: 5, scale: 2 }),
  trendExplanation:    text("trend_explanation"),
  trendLast30:         jsonb("trend_last30").$type<Record<string, unknown> | null>(),
  trendLast100:        jsonb("trend_last100").$type<Record<string, unknown> | null>(),
  trendLast500:        jsonb("trend_last500").$type<Record<string, unknown> | null>(),

  // Full payload for reconstruction
  statsPayload:        jsonb("stats_payload").$type<Record<string, unknown>>(),
  evidencePayload:     jsonb("evidence_payload").$type<Record<string, unknown>>(),

  // Meta
  lastValidationDate:  timestamp("last_validation_date", { withTimezone: true }).notNull().defaultNow(),
  createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("pattern_records_category_idx").on(t.category),
  index("pattern_records_win_rate_idx").on(t.winRate),
  index("pattern_records_confidence_idx").on(t.statisticalConf),
  index("pattern_records_updated_at_idx").on(t.updatedAt),
]);

export const insertPatternRecordSchema = createInsertSchema(patternRecordsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPatternRecord = z.infer<typeof insertPatternRecordSchema>;
export type PatternRecordRow = typeof patternRecordsTable.$inferSelect;

// ─── Pattern Trend Snapshots ──────────────────────────────────────────────────
// Append-only — one row per pattern per analysis run.
// Enables win-rate trend charts over wall-clock time.

export const patternTrendSnapshotsTable = pgTable("pattern_trend_snapshots", {
  id:           serial("id").primaryKey(),
  patternId:    text("pattern_id").notNull(),
  snapshotDate: timestamp("snapshot_date", { withTimezone: true }).notNull().defaultNow(),
  winRate:      numeric("win_rate",   { precision: 6, scale: 4 }),
  avgRR:        numeric("avg_rr",     { precision: 6, scale: 2 }),
  sampleSize:   integer("sample_size").notNull(),
  confidence:   numeric("confidence", { precision: 5, scale: 2 }),
  version:      text("version").notNull().default("1.0.0"),
}, (t) => [
  index("pattern_trend_snapshots_pattern_id_idx").on(t.patternId),
  index("pattern_trend_snapshots_snapshot_date_idx").on(t.snapshotDate),
]);

export const insertPatternTrendSnapshotSchema = createInsertSchema(patternTrendSnapshotsTable).omit({ id: true });
export type InsertPatternTrendSnapshot = z.infer<typeof insertPatternTrendSnapshotSchema>;
export type PatternTrendSnapshotRow = typeof patternTrendSnapshotsTable.$inferSelect;
