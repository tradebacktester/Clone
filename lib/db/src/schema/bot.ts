import { pgTable, serial, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botConfigTable = pgTable("bot_config", {
  id: serial("id").primaryKey(),
  pairs: text("pairs").array().notNull().default(["EURUSD", "GBPUSD", "USDJPY"]),
  sessions: text("sessions").array().notNull().default(["london", "newyork"]),
  riskPerTrade: numeric("risk_per_trade", { precision: 5, scale: 2 }).notNull().default("0.75"),
  maxDailyLoss: numeric("max_daily_loss", { precision: 5, scale: 2 }).notNull().default("3"),
  maxWeeklyLoss: numeric("max_weekly_loss", { precision: 5, scale: 2 }).notNull().default("6"),
  newsFilterEnabled: boolean("news_filter_enabled").notNull().default(true),
  trailingStopEnabled: boolean("trailing_stop_enabled").notNull().default(true),
  confirmationRequired: boolean("confirmation_required").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const botStateTable = pgTable("bot_state", {
  id: serial("id").primaryKey(),
  running: boolean("running").notNull().default(false),
  mode: text("mode").notNull().default("paper"),
  activePairs: text("active_pairs").array().notNull().default([]),
  haltedDueToRisk: boolean("halted_due_to_risk").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBotConfigSchema = createInsertSchema(botConfigTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;
export type BotConfig = typeof botConfigTable.$inferSelect;

export const insertBotStateSchema = createInsertSchema(botStateTable).omit({ id: true, updatedAt: true });
export type InsertBotState = z.infer<typeof insertBotStateSchema>;
export type BotState = typeof botStateTable.$inferSelect;
