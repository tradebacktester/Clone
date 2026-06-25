import { pgTable, serial, text, numeric, boolean, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const marketZonesTable = pgTable("market_zones", {
  id: serial("id").primaryKey(),
  pair: text("pair").notNull(),
  timeframe: text("timeframe").notNull(),
  zoneType: text("zone_type").notNull(),
  priceTop: numeric("price_top", { precision: 18, scale: 6 }).notNull(),
  priceBottom: numeric("price_bottom", { precision: 18, scale: 6 }).notNull(),
  strength: numeric("strength", { precision: 5, scale: 2 }).notNull().default("0"),
  tested: integer("tested").notNull().default(0),
  active: boolean("active").notNull().default(true),
  fibLevel: numeric("fib_level", { precision: 5, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const marketRegimeTable = pgTable("market_regime", {
  id: serial("id").primaryKey(),
  pair: text("pair").notNull().unique(),
  regime: text("regime").notNull().default("unknown"),
  trend: text("trend").notNull().default("neutral"),
  volatility: text("volatility").notNull().default("medium"),
  atr: numeric("atr", { precision: 10, scale: 6 }).notNull().default("0"),
  adxEquivalent: numeric("adx_equivalent", { precision: 6, scale: 2 }).notNull().default("0"),
  regimeConfidence: numeric("regime_confidence", { precision: 5, scale: 2 }).notNull().default("0"),
  volatilityPercentile: numeric("volatility_percentile", { precision: 5, scale: 2 }).notNull().default("50"),
  rangeCompression: numeric("range_compression", { precision: 5, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const tradeSignalsTable = pgTable("trade_signals", {
  id: serial("id").primaryKey(),
  pair: text("pair").notNull(),
  direction: text("direction").notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull().default("0"),
  zoneType: text("zone_type").notNull(),
  zoneStrength: numeric("zone_strength", { precision: 5, scale: 2 }).notNull().default("0"),
  amdPhase: text("amd_phase").notNull(),
  fibLevel: numeric("fib_level", { precision: 5, scale: 4 }).notNull().default("0"),
  session: text("session").notNull(),
  active: boolean("active").notNull().default(true),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const liquidityEventsTable = pgTable("liquidity_events", {
  eventId: serial("event_id").primaryKey(),
  pair: text("pair").notNull(),
  eventType: text("event_type").notNull(),
  sweepSize: numeric("sweep_size", { precision: 18, scale: 6 }).notNull().default("0"),
  score: numeric("score", { precision: 5, scale: 2 }).notNull().default("0"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const amdEventsTable = pgTable("amd_events", {
  amdId: serial("amd_id").primaryKey(),
  pair: text("pair").notNull(),
  accumulationScore: numeric("accumulation_score", { precision: 5, scale: 2 }).notNull().default("0"),
  manipulationScore: numeric("manipulation_score", { precision: 5, scale: 2 }).notNull().default("0"),
  distributionScore: numeric("distribution_score", { precision: 5, scale: 2 }).notNull().default("0"),
  finalScore: numeric("final_score", { precision: 5, scale: 2 }).notNull().default("0"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMarketZoneSchema = createInsertSchema(marketZonesTable).omit({ id: true, createdAt: true });
export type InsertMarketZone = z.infer<typeof insertMarketZoneSchema>;
export type MarketZone = typeof marketZonesTable.$inferSelect;

export const insertMarketRegimeSchema = createInsertSchema(marketRegimeTable).omit({ id: true, updatedAt: true });
export type InsertMarketRegime = z.infer<typeof insertMarketRegimeSchema>;
export type MarketRegime = typeof marketRegimeTable.$inferSelect;

export const insertLiquidityEventSchema = createInsertSchema(liquidityEventsTable).omit({ eventId: true });
export type InsertLiquidityEvent = z.infer<typeof insertLiquidityEventSchema>;
export type LiquidityEvent = typeof liquidityEventsTable.$inferSelect;

export const insertAmdEventSchema = createInsertSchema(amdEventsTable).omit({ amdId: true });
export type InsertAmdEvent = z.infer<typeof insertAmdEventSchema>;
export type AmdEvent = typeof amdEventsTable.$inferSelect;
