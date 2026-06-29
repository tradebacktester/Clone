import { pgTable, serial, text, integer, numeric, timestamp, jsonb, uuid, unique } from "drizzle-orm/pg-core";

export const marketContextSnapshotsTable = pgTable("market_context_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  pair: text("pair").notNull(),
  score: integer("score").notNull().default(0),
  label: text("label").notNull().default("neutral"),
  regimeScore: integer("regime_score").notNull().default(50),
  trendScore: integer("trend_score").notNull().default(50),
  volatilityScore: integer("volatility_score").notNull().default(50),
  liquidityScore: integer("liquidity_score").notNull().default(50),
  correlationScore: integer("correlation_score").notNull().default(50),
  sessionScore: integer("session_score").notNull().default(50),
  newsScore: integer("news_score").notNull().default(50),
  historicalConfidenceScore: integer("historical_confidence_score").notNull().default(50),
  overallConfidence: integer("overall_confidence").notNull().default(0),
  sampleSize: integer("sample_size").notNull().default(0),
  stabilityScore: integer("stability_score").notNull().default(50),
  stabilityLabel: text("stability_label").notNull().default("stable"),
  regimeStability: integer("regime_stability").notNull().default(50),
  trendStability: integer("trend_stability").notNull().default(50),
  volatilityStability: integer("volatility_stability").notNull().default(50),
  liquidityStability: integer("liquidity_stability").notNull().default(50),
  fullAnalysis: jsonb("full_analysis"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const marketContextProfilesTable = pgTable("market_context_profiles", {
  id: serial("id").primaryKey(),
  pair: text("pair").notNull(),
  dimension: text("dimension").notNull(),
  condition: text("condition").notNull(),
  sampleSize: integer("sample_size").notNull().default(0),
  winRate: numeric("win_rate", { precision: 6, scale: 2 }).notNull().default("0"),
  lossRate: numeric("loss_rate", { precision: 6, scale: 2 }).notNull().default("0"),
  avgRR: numeric("avg_rr", { precision: 8, scale: 4 }).notNull().default("0"),
  profitFactor: numeric("profit_factor", { precision: 8, scale: 4 }).notNull().default("0"),
  expectancy: numeric("expectancy", { precision: 8, scale: 4 }).notNull().default("0"),
  maxDrawdown: numeric("max_drawdown", { precision: 6, scale: 2 }).notNull().default("0"),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }).notNull().default("0"),
  computedAt: timestamp("computed_at").defaultNow(),
}, (t) => [
  unique("mcp_pair_dimension_condition").on(t.pair, t.dimension, t.condition),
]);

export type MarketContextSnapshot = typeof marketContextSnapshotsTable.$inferSelect;
export type NewMarketContextSnapshot = typeof marketContextSnapshotsTable.$inferInsert;
export type MarketContextProfile = typeof marketContextProfilesTable.$inferSelect;
export type NewMarketContextProfile = typeof marketContextProfilesTable.$inferInsert;
