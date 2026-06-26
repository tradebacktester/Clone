import { pgTable, serial, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const replaySessionsTable = pgTable("replay_sessions", {
  id: serial("id").primaryKey(),
  pair: text("pair").notNull(),
  timeframe: text("timeframe").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull().default("running"),
  totalCandles: integer("total_candles").notNull().default(0),
  totalEvaluated: integer("total_evaluated").notNull().default(0),
  totalTradesTaken: integer("total_trades_taken").notNull().default(0),
  totalWins: integer("total_wins").notNull().default(0),
  totalLosses: integer("total_losses").notNull().default(0),
  winRate: text("win_rate").notNull().default("0"),
  falsePositives: integer("false_positives").notNull().default(0),
  falseNegatives: integer("false_negatives").notNull().default(0),
  missedOpportunities: integer("missed_opportunities").notNull().default(0),
  biasFlags: jsonb("bias_flags").notNull().default("[]"),
  tracesJson: jsonb("traces_json").notNull().default("[]"),
  candlesJson: jsonb("candles_json").notNull().default("[]"),
  reportGenerated: boolean("report_generated").notNull().default(false),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReplaySessionSchema = createInsertSchema(replaySessionsTable).omit({ id: true, createdAt: true });
export type InsertReplaySession = z.infer<typeof insertReplaySessionSchema>;
export type ReplaySession = typeof replaySessionsTable.$inferSelect;
