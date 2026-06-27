import { pgTable, serial, text, numeric, boolean, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const liveJournalTable = pgTable("live_journal", {
  id: serial("id").primaryKey(),
  tradeId: integer("trade_id"),
  pair: text("pair").notNull(),
  direction: text("direction").notNull(),
  entryReason: text("entry_reason"),
  exitReason: text("exit_reason"),
  ruleEvaluation: jsonb("rule_evaluation"),
  confidenceScores: jsonb("confidence_scores"),
  marketRegime: text("market_regime"),
  regimeConfidence: numeric("regime_confidence", { precision: 5, scale: 2 }),
  brokerExecution: jsonb("broker_execution"),
  screenshots: jsonb("screenshots"),
  notes: text("notes"),
  mode: text("mode").notNull().default("paper"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const strategyHealthSnapshotTable = pgTable("strategy_health_snapshots", {
  id: serial("id").primaryKey(),
  snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull().defaultNow(),
  winRateRolling20: numeric("win_rate_rolling_20", { precision: 6, scale: 2 }),
  profitFactorRolling30: numeric("profit_factor_rolling_30", { precision: 8, scale: 4 }),
  maxDrawdownPct: numeric("max_drawdown_pct", { precision: 6, scale: 2 }),
  signalFrequencyPerDay: numeric("signal_frequency_per_day", { precision: 8, scale: 4 }),
  dataQualityScore: numeric("data_quality_score", { precision: 5, scale: 2 }),
  regimeStabilityScore: numeric("regime_stability_score", { precision: 5, scale: 2 }),
  overallHealthScore: numeric("overall_health_score", { precision: 5, scale: 2 }),
  totalTrades: integer("total_trades").notNull().default(0),
  openTrades: integer("open_trades").notNull().default(0),
  alertCount: integer("alert_count").notNull().default(0),
  alerts: jsonb("alerts"),
  mode: text("mode").notNull().default("paper"),
});

export const readinessChecklistResultTable = pgTable("readiness_checklist_results", {
  id: serial("id").primaryKey(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  overallPassed: boolean("overall_passed").notNull().default(false),
  readinessScore: numeric("readiness_score", { precision: 5, scale: 2 }).notNull().default("0"),
  items: jsonb("items").notNull(),
  recommendation: text("recommendation"),
  blockers: jsonb("blockers"),
  warnings: jsonb("warnings"),
});

export const brokerSafetyConfigTable = pgTable("broker_safety_config", {
  id: serial("id").primaryKey(),
  maxSpreadPips: numeric("max_spread_pips", { precision: 6, scale: 2 }).notNull().default("3.0"),
  maxSlippagePips: numeric("max_slippage_pips", { precision: 6, scale: 2 }).notNull().default("5.0"),
  connectionTimeoutMs: integer("connection_timeout_ms").notNull().default(5000),
  maxRetries: integer("max_retries").notNull().default(3),
  retryDelayMs: integer("retry_delay_ms").notNull().default(1000),
  partialFillThresholdPct: numeric("partial_fill_threshold_pct", { precision: 5, scale: 2 }).notNull().default("80"),
  reconciliationIntervalSec: integer("reconciliation_interval_sec").notNull().default(300),
  enableSpreadFilter: boolean("enable_spread_filter").notNull().default(true),
  enableSlippageProtection: boolean("enable_slippage_protection").notNull().default(true),
  enableConnectionMonitor: boolean("enable_connection_monitor").notNull().default(true),
  enableAutoRetry: boolean("enable_auto_retry").notNull().default(true),
  enablePartialFillHandling: boolean("enable_partial_fill_handling").notNull().default(true),
  enableReconciliation: boolean("enable_reconciliation").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const recoveryLogTable = pgTable("recovery_log", {
  id: serial("id").primaryKey(),
  event: text("event").notNull(),
  success: boolean("success").notNull().default(true),
  details: jsonb("details"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLiveJournalSchema = createInsertSchema(liveJournalTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLiveJournal = z.infer<typeof insertLiveJournalSchema>;
export type LiveJournalEntry = typeof liveJournalTable.$inferSelect;

export const insertStrategyHealthSnapshotSchema = createInsertSchema(strategyHealthSnapshotTable).omit({ id: true });
export type InsertStrategyHealthSnapshot = z.infer<typeof insertStrategyHealthSnapshotSchema>;
export type StrategyHealthSnapshot = typeof strategyHealthSnapshotTable.$inferSelect;

export const insertReadinessChecklistResultSchema = createInsertSchema(readinessChecklistResultTable).omit({ id: true, runAt: true });
export type InsertReadinessChecklistResult = z.infer<typeof insertReadinessChecklistResultSchema>;
export type ReadinessChecklistResult = typeof readinessChecklistResultTable.$inferSelect;

export const insertBrokerSafetyConfigSchema = createInsertSchema(brokerSafetyConfigTable).omit({ id: true, updatedAt: true });
export type InsertBrokerSafetyConfig = z.infer<typeof insertBrokerSafetyConfigSchema>;
export type BrokerSafetyConfig = typeof brokerSafetyConfigTable.$inferSelect;

export const insertRecoveryLogSchema = createInsertSchema(recoveryLogTable).omit({ id: true, createdAt: true });
export type InsertRecoveryLog = z.infer<typeof insertRecoveryLogSchema>;
export type RecoveryLogEntry = typeof recoveryLogTable.$inferSelect;
