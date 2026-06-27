import { pgTable, serial, varchar, numeric, boolean, timestamp, jsonb, text, integer, index, unique } from "drizzle-orm/pg-core";

export const historicalCandlesTable = pgTable(
  "historical_candles",
  {
    id: serial("id").primaryKey(),
    pair: varchar("pair", { length: 10 }).notNull(),
    timeframe: varchar("timeframe", { length: 5 }).notNull(),
    time: timestamp("time").notNull(),
    open: numeric("open", { precision: 12, scale: 6 }).notNull(),
    high: numeric("high", { precision: 12, scale: 6 }).notNull(),
    low: numeric("low", { precision: 12, scale: 6 }).notNull(),
    close: numeric("close", { precision: 12, scale: 6 }).notNull(),
    volume: numeric("volume", { precision: 18, scale: 2 }).notNull().default("0"),
    provider: varchar("provider", { length: 60 }).notNull(),
    isReal: boolean("is_real").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    unique("historical_candles_pair_tf_time").on(t.pair, t.timeframe, t.time),
    index("historical_candles_pair_tf_idx").on(t.pair, t.timeframe),
    index("historical_candles_time_idx").on(t.time),
  ],
);

export const historicalSessionsTable = pgTable("historical_sessions", {
  id: serial("id").primaryKey(),
  pair: varchar("pair", { length: 10 }).notNull(),
  timeframe: varchar("timeframe", { length: 5 }).notNull(),
  startDate: varchar("start_date", { length: 10 }).notNull(),
  endDate: varchar("end_date", { length: 10 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),

  dataQuality: jsonb("data_quality"),
  metrics: jsonb("metrics"),
  breakdowns: jsonb("breakdowns"),
  bias: jsonb("bias"),

  totalCandles: integer("total_candles").notNull().default(0),
  totalEvaluated: integer("total_evaluated").notNull().default(0),
  totalTrades: integer("total_trades").notNull().default(0),
  totalWins: integer("total_wins").notNull().default(0),
  totalLosses: integer("total_losses").notNull().default(0),
  winRate: numeric("win_rate", { precision: 6, scale: 2 }).notNull().default("0"),
  profitFactor: numeric("profit_factor", { precision: 8, scale: 4 }).notNull().default("0"),
  maxDrawdown: numeric("max_drawdown", { precision: 6, scale: 2 }).notNull().default("0"),
  sharpeRatio: numeric("sharpe_ratio", { precision: 8, scale: 4 }).notNull().default("0"),

  reportText: text("report_text"),
  reportGenerated: boolean("report_generated").notNull().default(false),
  errorMessage: text("error_message"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type HistoricalCandle = typeof historicalCandlesTable.$inferSelect;
export type NewHistoricalCandle = typeof historicalCandlesTable.$inferInsert;
export type HistoricalSession = typeof historicalSessionsTable.$inferSelect;
export type NewHistoricalSession = typeof historicalSessionsTable.$inferInsert;
