import { pgTable, serial, text, numeric, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const regimePerformanceTable = pgTable(
  "regime_performance",
  {
    id: serial("id").primaryKey(),
    pair: text("pair"),
    regime: text("regime").notNull(),
    totalTrades: integer("total_trades").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    totalPnl: numeric("total_pnl", { precision: 18, scale: 4 }).notNull().default("0"),
    grossProfit: numeric("gross_profit", { precision: 18, scale: 4 }).notNull().default("0"),
    grossLoss: numeric("gross_loss", { precision: 18, scale: 4 }).notNull().default("0"),
    winRate: numeric("win_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    profitFactor: numeric("profit_factor", { precision: 8, scale: 4 }).notNull().default("0"),
    maxDrawdown: numeric("max_drawdown", { precision: 7, scale: 4 }).notNull().default("0"),
    avgSetupScore: numeric("avg_setup_score", { precision: 5, scale: 2 }).notNull().default("0"),
    zoneWinRate: numeric("zone_win_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    liquidityWinRate: numeric("liquidity_win_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    amdWinRate: numeric("amd_win_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    confirmationWinRate: numeric("confirmation_win_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("regime_performance_regime_pair_idx").on(t.regime, t.pair)],
);

export const regimeWeightsTable = pgTable(
  "regime_weights",
  {
    id: serial("id").primaryKey(),
    regime: text("regime").notNull(),
    pair: text("pair"),
    zoneWeight: numeric("zone_weight", { precision: 6, scale: 4 }).notNull().default("0.30"),
    liquidityWeight: numeric("liquidity_weight", { precision: 6, scale: 4 }).notNull().default("0.25"),
    amdWeight: numeric("amd_weight", { precision: 6, scale: 4 }).notNull().default("0.25"),
    confirmationWeight: numeric("confirmation_weight", { precision: 6, scale: 4 }).notNull().default("0.20"),
    sampleSize: integer("sample_size").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("regime_weights_regime_pair_idx").on(t.regime, t.pair)],
);

export const insertRegimePerformanceSchema = createInsertSchema(regimePerformanceTable).omit({ id: true, updatedAt: true });
export type InsertRegimePerformance = z.infer<typeof insertRegimePerformanceSchema>;
export type RegimePerformance = typeof regimePerformanceTable.$inferSelect;

export const insertRegimeWeightsSchema = createInsertSchema(regimeWeightsTable).omit({ id: true, updatedAt: true });
export type InsertRegimeWeights = z.infer<typeof insertRegimeWeightsSchema>;
export type RegimeWeights = typeof regimeWeightsTable.$inferSelect;
