import { pgTable, serial, text, numeric, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Threshold Optimization Runs ───────────────────────────────────────────
// Each row is one complete threshold analysis run stored for comparison.

export const thresholdRunsTable = pgTable("threshold_runs", {
  id:            serial("id").primaryKey(),
  runAt:         timestamp("run_at",       { withTimezone: true }).notNull().defaultNow(),
  tradesAnalyzed: integer("trades_analyzed").notNull().default(0),
  durationMs:    integer("duration_ms").notNull().default(0),

  // Walk-forward config
  windowSize:    integer("window_size").notNull().default(100),  // trades per fold
  folds:         integer("folds").notNull().default(5),

  // Current (baseline) thresholds
  currentZoneScore:    numeric("current_zone_score",    { precision: 5, scale: 2 }).notNull().default("0"),
  currentLiquidity:    numeric("current_liquidity",     { precision: 5, scale: 2 }).notNull().default("0"),
  currentAmd:          numeric("current_amd",           { precision: 5, scale: 2 }).notNull().default("0"),
  currentConfirmation: numeric("current_confirmation",  { precision: 5, scale: 2 }).notNull().default("0"),
  currentTqi:          numeric("current_tqi",           { precision: 5, scale: 2 }).notNull().default("0"),

  // Proposed (optimized) thresholds
  proposedZoneScore:    numeric("proposed_zone_score",    { precision: 5, scale: 2 }),
  proposedLiquidity:    numeric("proposed_liquidity",     { precision: 5, scale: 2 }),
  proposedAmd:          numeric("proposed_amd",           { precision: 5, scale: 2 }),
  proposedConfirmation: numeric("proposed_confirmation",  { precision: 5, scale: 2 }),
  proposedTqi:          numeric("proposed_tqi",           { precision: 5, scale: 2 }),

  // Performance comparison
  baselineWinRate:      numeric("baseline_win_rate",     { precision: 5, scale: 2 }),
  proposedWinRate:      numeric("proposed_win_rate",     { precision: 5, scale: 2 }),
  baselineProfitFactor: numeric("baseline_pf",           { precision: 8, scale: 4 }),
  proposedProfitFactor: numeric("proposed_pf",           { precision: 8, scale: 4 }),
  baselineExpectedValue:numeric("baseline_ev",           { precision: 10, scale: 4 }),
  proposedExpectedValue:numeric("proposed_ev",           { precision: 10, scale: 4 }),
  tradeCountDelta:      integer("trade_count_delta"),     // how many fewer/more trades with proposed thresholds

  // Walk-forward validation
  wfPassRate:           numeric("wf_pass_rate",          { precision: 5, scale: 2 }),  // % of folds where proposed outperforms
  wfConsistent:         boolean("wf_consistent").notNull().default(false),

  // Full results payload
  perThresholdAnalysis: jsonb("per_threshold_analysis"),  // { zoneScore: { curve: [...], optimal: X }, ... }
  wfFolds:              jsonb("wf_folds"),                 // fold-by-fold results
  reportPath:           text("report_path"),
});

export const insertThresholdRunSchema = createInsertSchema(thresholdRunsTable).omit({ id: true });
export type InsertThresholdRun = z.infer<typeof insertThresholdRunSchema>;
export type ThresholdRun = typeof thresholdRunsTable.$inferSelect;
