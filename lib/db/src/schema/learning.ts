import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rlAgentTable = pgTable("rl_agent", {
  id: serial("id").primaryKey(),
  episode: integer("episode").notNull().default(0),
  totalReward: numeric("total_reward", { precision: 12, scale: 4 }).notNull().default("0"),
  avgReward: numeric("avg_reward", { precision: 12, scale: 4 }).notNull().default("0"),
  epsilon: numeric("epsilon", { precision: 6, scale: 4 }).notNull().default("1"),
  learningRate: numeric("learning_rate", { precision: 8, scale: 6 }).notNull().default("0.001"),
  tradesAnalyzed: integer("trades_analyzed").notNull().default(0),
  modelVersion: integer("model_version").notNull().default(1),
  lastTrained: timestamp("last_trained", { withTimezone: true }).notNull().defaultNow(),
});

export const setupScoresTable = pgTable("setup_scores", {
  id: serial("id").primaryKey(),
  pattern: text("pattern").notNull().unique(),
  avgScore: numeric("avg_score", { precision: 5, scale: 2 }).notNull().default("0"),
  confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull().default("0"),
  trades: integer("trades").notNull().default(0),
  winRate: numeric("win_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  avgPnl: numeric("avg_pnl", { precision: 10, scale: 4 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRlAgentSchema = createInsertSchema(rlAgentTable).omit({ id: true });
export type InsertRlAgent = z.infer<typeof insertRlAgentSchema>;
export type RlAgent = typeof rlAgentTable.$inferSelect;
