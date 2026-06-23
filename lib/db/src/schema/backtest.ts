import { pgTable, serial, text, numeric, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const backtestsTable = pgTable("backtests", {
  id: serial("id").primaryKey(),
  pair: text("pair").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  initialBalance: numeric("initial_balance", { precision: 12, scale: 2 }).notNull(),
  finalBalance: numeric("final_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  totalTrades: integer("total_trades").notNull().default(0),
  winRate: numeric("win_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  totalPnl: numeric("total_pnl", { precision: 12, scale: 4 }).notNull().default("0"),
  maxDrawdown: numeric("max_drawdown", { precision: 5, scale: 2 }).notNull().default("0"),
  profitFactor: numeric("profit_factor", { precision: 8, scale: 4 }).notNull().default("0"),
  sharpeRatio: numeric("sharpe_ratio", { precision: 8, scale: 4 }).notNull().default("0"),
  riskPerTrade: numeric("risk_per_trade", { precision: 5, scale: 2 }).notNull(),
  sessions: text("sessions").array(),
  enableNewsFilter: boolean("enable_news_filter").notNull().default(true),
  enableRL: boolean("enable_rl").notNull().default(false),
  tradesJson: jsonb("trades_json").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBacktestSchema = createInsertSchema(backtestsTable).omit({ id: true, createdAt: true });
export type InsertBacktest = z.infer<typeof insertBacktestSchema>;
export type Backtest = typeof backtestsTable.$inferSelect;
