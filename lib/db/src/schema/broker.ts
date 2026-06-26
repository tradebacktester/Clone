import { pgTable, serial, text, numeric, boolean, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const brokerAccountsTable = pgTable("broker_accounts", {
  id: serial("id").primaryKey(),
  broker: text("broker").notNull(),
  accountId: text("account_id").notNull(),
  accountName: text("account_name").notNull(),
  apiKey: text("api_key").notNull(),
  apiSecret: text("api_secret"),
  active: boolean("active").notNull().default(true),
  paperTrading: boolean("paper_trading").notNull().default(true),
  balance: numeric("balance", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const riskSettingsTable = pgTable("risk_settings", {
  id: serial("id").primaryKey(),
  riskPerTrade: numeric("risk_per_trade", { precision: 5, scale: 2 }).notNull().default("0.75"),
  maxDailyLoss: numeric("max_daily_loss", { precision: 5, scale: 2 }).notNull().default("3"),
  maxWeeklyLoss: numeric("max_weekly_loss", { precision: 5, scale: 2 }).notNull().default("6"),
  maxOpenTrades: integer("max_open_trades").notNull().default(3),
  useTrailingStop: boolean("use_trailing_stop").notNull().default(true),
  trailingStopAt: numeric("trailing_stop_at", { precision: 5, scale: 2 }).notNull().default("1"),
  breakEvenAt: numeric("break_even_at", { precision: 5, scale: 2 }).notNull().default("0.5"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const executionLogTable = pgTable("execution_log", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  tradeId: integer("trade_id"),
  pair: text("pair"),
  direction: text("direction"),
  price: numeric("price", { precision: 18, scale: 6 }),
  slippagePips: numeric("slippage_pips", { precision: 6, scale: 2 }),
  pnl: numeric("pnl", { precision: 18, scale: 4 }),
  reason: text("reason").notNull().default(""),
  mode: text("mode").notNull().default("paper"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBrokerAccountSchema = createInsertSchema(brokerAccountsTable).omit({ id: true, createdAt: true });
export type InsertBrokerAccount = z.infer<typeof insertBrokerAccountSchema>;
export type BrokerAccount = typeof brokerAccountsTable.$inferSelect;

export const insertRiskSettingsSchema = createInsertSchema(riskSettingsTable).omit({ id: true, updatedAt: true });
export type InsertRiskSettings = z.infer<typeof insertRiskSettingsSchema>;
export type RiskSettings = typeof riskSettingsTable.$inferSelect;

export const insertExecutionLogSchema = createInsertSchema(executionLogTable).omit({ id: true, createdAt: true });
export type InsertExecutionLog = z.infer<typeof insertExecutionLogSchema>;
export type ExecutionLogEntry = typeof executionLogTable.$inferSelect;
