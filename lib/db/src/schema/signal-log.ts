import { pgTable, serial, text, numeric, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const signalLogTable = pgTable("signal_log", {
  id: serial("id").primaryKey(),
  pair: text("pair").notNull(),
  direction: text("direction").notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull(),
  amdPhase: text("amd_phase").notNull(),
  zoneType: text("zone_type").notNull(),
  zoneStrength: numeric("zone_strength", { precision: 5, scale: 2 }),
  regime: text("regime"),
  newsStatus: text("news_status"),
  session: text("session").notNull(),
  executed: boolean("executed").notNull().default(false),
  tradeId: text("trade_id"),
  skipReason: text("skip_reason"),
  entryPrice: numeric("entry_price", { precision: 18, scale: 6 }),
  stopLoss: numeric("stop_loss", { precision: 18, scale: 6 }),
  takeProfit: numeric("take_profit", { precision: 18, scale: 6 }),
  riskReward: numeric("risk_reward", { precision: 6, scale: 2 }),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("signal_log_pair_generated_idx").on(t.pair, t.generatedAt),
  index("signal_log_executed_idx").on(t.executed),
]);

export const insertSignalLogSchema = createInsertSchema(signalLogTable).omit({ id: true });
export type InsertSignalLog = z.infer<typeof insertSignalLogSchema>;
export type SignalLog = typeof signalLogTable.$inferSelect;
