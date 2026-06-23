import { pgTable, serial, text, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const candlesTable = pgTable(
  "candles",
  {
    id: serial("id").primaryKey(),
    pair: text("pair").notNull(),
    timeframe: text("timeframe").notNull(),
    openTime: timestamp("open_time", { withTimezone: true }).notNull(),
    open: numeric("open", { precision: 18, scale: 6 }).notNull(),
    high: numeric("high", { precision: 18, scale: 6 }).notNull(),
    low: numeric("low", { precision: 18, scale: 6 }).notNull(),
    close: numeric("close", { precision: 18, scale: 6 }).notNull(),
    volume: numeric("volume", { precision: 18, scale: 2 }).notNull().default("0"),
  },
  (t) => [uniqueIndex("candles_pair_tf_time_idx").on(t.pair, t.timeframe, t.openTime)],
);

export const insertCandleSchema = createInsertSchema(candlesTable).omit({ id: true });
export type InsertCandle = z.infer<typeof insertCandleSchema>;
export type Candle = typeof candlesTable.$inferSelect;
