import { pgTable, serial, text, numeric, boolean, integer, timestamp } from "drizzle-orm/pg-core";
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

export const insertMarketZoneSchema = createInsertSchema(marketZonesTable).omit({ id: true, createdAt: true });
export type InsertMarketZone = z.infer<typeof insertMarketZoneSchema>;
export type MarketZone = typeof marketZonesTable.$inferSelect;

export const insertMarketRegimeSchema = createInsertSchema(marketRegimeTable).omit({ id: true, updatedAt: true });
export type InsertMarketRegime = z.infer<typeof insertMarketRegimeSchema>;
export type MarketRegime = typeof marketRegimeTable.$inferSelect;
