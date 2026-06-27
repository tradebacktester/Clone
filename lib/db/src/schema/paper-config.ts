import { pgTable, serial, text, numeric, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Per-Pair Paper Execution Config ──────────────────────────────────────
// Configures realistic spread and slippage simulation for each pair.
// One row per pair. Defaults match typical ECN broker conditions.

export const paperExecConfigTable = pgTable("paper_exec_config", {
  id:                   serial("id").primaryKey(),
  pair:                 text("pair").notNull().unique(),

  // Spread
  spreadPips:           numeric("spread_pips",      { precision: 5, scale: 2 }).notNull().default("1.2"),

  // Slippage (entry)
  minEntrySlippagePips: numeric("min_entry_slippage", { precision: 5, scale: 2 }).notNull().default("0.3"),
  maxEntrySlippagePips: numeric("max_entry_slippage", { precision: 5, scale: 2 }).notNull().default("2.0"),

  // Slippage (exit)
  minExitSlippagePips:  numeric("min_exit_slippage",  { precision: 5, scale: 2 }).notNull().default("0.3"),
  maxExitSlippagePips:  numeric("max_exit_slippage",  { precision: 5, scale: 2 }).notNull().default("1.0"),

  // Commission (per side per standard lot in account currency)
  commissionPerLot:     numeric("commission_per_lot", { precision: 8, scale: 4 }).notNull().default("3.5"),

  // Fill model
  partialFillsEnabled:  boolean("partial_fills").notNull().default(false),
  fillRejectionRatePct: numeric("fill_rejection_rate", { precision: 5, scale: 2 }).notNull().default("0"),

  updatedAt:            timestamp("updated_at",     { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPaperExecConfigSchema = createInsertSchema(paperExecConfigTable).omit({ id: true, updatedAt: true });
export type InsertPaperExecConfig = z.infer<typeof insertPaperExecConfigSchema>;
export type PaperExecConfig = typeof paperExecConfigTable.$inferSelect;

// ─── Execution Quality Log ─────────────────────────────────────────────────
// Per-trade execution quality record: signal-to-fill latency, fill price vs ideal.

export const execQualityLogTable = pgTable("exec_quality_log", {
  id:               serial("id").primaryKey(),
  tradeId:          integer("trade_id").notNull(),
  pair:             text("pair").notNull(),
  direction:        text("direction").notNull(),

  // Signal → fill
  signalGeneratedAt: timestamp("signal_at",     { withTimezone: true }),
  fillAt:            timestamp("fill_at",       { withTimezone: true }),
  signalToFillMs:   integer("signal_to_fill_ms"),

  // Price quality
  idealEntryPrice:  numeric("ideal_entry",      { precision: 18, scale: 6 }),
  actualEntryPrice: numeric("actual_entry",     { precision: 18, scale: 6 }),
  entrySlippagePips:numeric("entry_slippage",   { precision: 6, scale: 2 }),
  spreadPips:       numeric("spread_pips",      { precision: 5, scale: 2 }),

  // Exit quality (filled in on close)
  idealExitPrice:   numeric("ideal_exit",       { precision: 18, scale: 6 }),
  actualExitPrice:  numeric("actual_exit",      { precision: 18, scale: 6 }),
  exitSlippagePips: numeric("exit_slippage",    { precision: 6, scale: 2 }),

  // Commission
  commissionPaid:   numeric("commission",       { precision: 10, scale: 4 }),

  // Overall fill quality score (0–100)
  qualityScore:     integer("quality_score"),

  createdAt:        timestamp("created_at",     { withTimezone: true }).notNull().defaultNow(),
});

export const insertExecQualityLogSchema = createInsertSchema(execQualityLogTable).omit({ id: true, createdAt: true });
export type InsertExecQualityLog = z.infer<typeof insertExecQualityLogSchema>;
export type ExecQualityLog = typeof execQualityLogTable.$inferSelect;
