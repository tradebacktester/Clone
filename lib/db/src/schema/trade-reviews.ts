import { pgTable, serial, integer, text, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradeReviewsTable = pgTable("trade_reviews", {
  id: serial("id").primaryKey(),
  tradeId: integer("trade_id").notNull().unique(),
  agreement: text("agreement").notNull(),
  reason: text("reason"),
  confidence: numeric("confidence", { precision: 5, scale: 2 }),
  notes: text("notes"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("trade_reviews_trade_id_idx").on(t.tradeId),
]);

export const insertTradeReviewSchema = createInsertSchema(tradeReviewsTable).omit({ id: true, reviewedAt: true });
export type InsertTradeReview = z.infer<typeof insertTradeReviewSchema>;
export type TradeReview = typeof tradeReviewsTable.$inferSelect;
