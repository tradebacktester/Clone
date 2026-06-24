import { pgTable, serial, text, numeric, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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

export const learningDataTable = pgTable(
  "learning_data",
  {
    id: serial("id").primaryKey(),
    setupType: text("setup_type").notNull(),
    pair: text("pair").notNull(),
    session: text("session").notNull(),
    winRate: numeric("win_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    avgRr: numeric("avg_rr", { precision: 6, scale: 2 }).notNull().default("0"),
    sampleSize: integer("sample_size").notNull().default(0),
    confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("learning_data_setup_pair_session_idx").on(t.setupType, t.pair, t.session)],
);

export const insertRlAgentSchema = createInsertSchema(rlAgentTable).omit({ id: true });
export type InsertRlAgent = z.infer<typeof insertRlAgentSchema>;
export type RlAgent = typeof rlAgentTable.$inferSelect;

export const weightProfilesTable = pgTable(
  "weight_profiles",
  {
    id: serial("id").primaryKey(),
    pair: text("pair"),
    zoneWeight: numeric("zone_weight", { precision: 6, scale: 4 }).notNull().default("0.25"),
    liquidityWeight: numeric("liquidity_weight", { precision: 6, scale: 4 }).notNull().default("0.25"),
    amdWeight: numeric("amd_weight", { precision: 6, scale: 4 }).notNull().default("0.25"),
    confirmationWeight: numeric("confirmation_weight", { precision: 6, scale: 4 }).notNull().default("0.25"),
    sampleSize: integer("sample_size").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("weight_profiles_pair_idx").on(t.pair)],
);

export const insertLearningDataSchema = createInsertSchema(learningDataTable).omit({ id: true, updatedAt: true });
export type InsertLearningData = z.infer<typeof insertLearningDataSchema>;
export type LearningData = typeof learningDataTable.$inferSelect;

export const insertWeightProfileSchema = createInsertSchema(weightProfilesTable).omit({ id: true, updatedAt: true });
export type InsertWeightProfile = z.infer<typeof insertWeightProfileSchema>;
export type WeightProfileRow = typeof weightProfilesTable.$inferSelect;
