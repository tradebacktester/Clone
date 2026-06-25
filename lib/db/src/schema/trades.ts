import { pgTable, serial, text, numeric, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradesTable = pgTable("trades", {
  id: serial("id").primaryKey(),
  pair: text("pair").notNull(),
  direction: text("direction").notNull(),
  entryPrice: numeric("entry_price", { precision: 18, scale: 6 }).notNull(),
  stopLoss: numeric("stop_loss", { precision: 18, scale: 6 }).notNull(),
  takeProfit: numeric("take_profit", { precision: 18, scale: 6 }).notNull(),
  currentPrice: numeric("current_price", { precision: 18, scale: 6 }),
  closedPrice: numeric("closed_price", { precision: 18, scale: 6 }),
  lotSize: numeric("lot_size", { precision: 10, scale: 4 }).notNull(),
  status: text("status").notNull().default("open"),
  pnl: numeric("pnl", { precision: 18, scale: 4 }),
  pnlPercent: numeric("pnl_percent", { precision: 10, scale: 4 }),
  session: text("session").notNull(),
  setupScore: numeric("setup_score", { precision: 5, scale: 2 }).notNull().default("0"),
  amdPattern: text("amd_pattern").notNull().default("unknown"),
  zoneType: text("zone_type").notNull(),
  zoneStrength: numeric("zone_strength", { precision: 5, scale: 2 }).notNull().default("0"),
  liquiditySweep: boolean("liquidity_sweep").notNull().default(false),
  fibLevel: numeric("fib_level", { precision: 5, scale: 4 }),
  riskRewardRatio: numeric("risk_reward_ratio", { precision: 6, scale: 2 }).notNull().default("0"),
  breakEvenMoved: boolean("break_even_moved").notNull().default(false),
  closeReason: text("close_reason"),
  regime: text("regime"),
  regimeConfidence: numeric("regime_confidence", { precision: 5, scale: 2 }),
  slippagePips: numeric("slippage_pips", { precision: 6, scale: 2 }),
  exitSlippagePips: numeric("exit_slippage_pips", { precision: 6, scale: 2 }),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const insertTradeSchema = createInsertSchema(tradesTable).omit({ id: true });
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof tradesTable.$inferSelect;
