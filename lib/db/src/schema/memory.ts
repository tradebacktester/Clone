import {
  pgTable, serial, text, numeric, integer, boolean,
  timestamp, uniqueIndex, uuid, index, jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Trade Memory ──────────────────────────────────────────────────────────
// Full per-trade record with all component scores; linked to tradesTable by tradeId

export const tradeMemoryTable = pgTable("trade_memory", {
  id:                serial("id").primaryKey(),
  tradeId:           integer("trade_id").notNull().unique(),

  pair:              text("pair").notNull(),
  direction:         text("direction").notNull(),
  session:           text("session").notNull(),
  regime:            text("regime"),
  regimeConfidence:  numeric("regime_confidence", { precision: 5, scale: 2 }),

  zoneScore:         numeric("zone_score",         { precision: 5, scale: 2 }).notNull().default("0"),
  liquidityScore:    numeric("liquidity_score",     { precision: 5, scale: 2 }).notNull().default("0"),
  amdScore:          numeric("amd_score",           { precision: 5, scale: 2 }).notNull().default("0"),
  confirmationScore: numeric("confirmation_score",  { precision: 5, scale: 2 }).notNull().default("0"),
  finalScore:        numeric("final_score",         { precision: 5, scale: 2 }).notNull().default("0"),
  confidence:        numeric("confidence",          { precision: 5, scale: 2 }).notNull().default("0"),

  zoneType:          text("zone_type"),
  amdPattern:        text("amd_pattern"),
  fibLevel:          numeric("fib_level",           { precision: 5, scale: 4 }),
  confluenceFactors: text("confluence_factors"),

  riskRewardPlanned: numeric("rr_planned",          { precision: 6, scale: 2 }).notNull().default("0"),
  riskRewardActual:  numeric("rr_actual",           { precision: 6, scale: 2 }),
  slippagePips:      numeric("slippage_pips",       { precision: 6, scale: 2 }),
  exitSlippagePips:  numeric("exit_slippage_pips",  { precision: 6, scale: 2 }),

  outcome:           text("outcome"),
  pnl:               numeric("pnl",               { precision: 18, scale: 4 }),
  pnlPercent:        numeric("pnl_percent",        { precision: 10, scale: 4 }),
  closeReason:       text("close_reason"),

  timeInTradeMins:   integer("time_in_trade_mins"),
  openedAt:          timestamp("opened_at",       { withTimezone: true }).notNull().defaultNow(),
  closedAt:          timestamp("closed_at",       { withTimezone: true }),

  clusterKey:        text("cluster_key"),
}, (t) => [
  index("trade_memory_pair_idx").on(t.pair),
  index("trade_memory_opened_at_idx").on(t.openedAt),
  index("trade_memory_outcome_idx").on(t.outcome),
  index("trade_memory_cluster_key_idx").on(t.clusterKey),
]);

export const insertTradeMemorySchema = createInsertSchema(tradeMemoryTable).omit({ id: true });
export type InsertTradeMemory = z.infer<typeof insertTradeMemorySchema>;
export type TradeMemory = typeof tradeMemoryTable.$inferSelect;

// ─── Missed Opportunities ──────────────────────────────────────────────────

export const missedOpportunitiesTable = pgTable("missed_opportunities", {
  id:                serial("id").primaryKey(),

  pair:              text("pair").notNull(),
  direction:         text("direction").notNull(),
  session:           text("session").notNull(),
  regime:            text("regime"),

  zoneScore:         numeric("zone_score",         { precision: 5, scale: 2 }).notNull().default("0"),
  liquidityScore:    numeric("liquidity_score",     { precision: 5, scale: 2 }).notNull().default("0"),
  amdScore:          numeric("amd_score",           { precision: 5, scale: 2 }).notNull().default("0"),
  confirmationScore: numeric("confirmation_score",  { precision: 5, scale: 2 }).notNull().default("0"),
  finalScore:        numeric("final_score",         { precision: 5, scale: 2 }).notNull().default("0"),
  confidence:        numeric("confidence",          { precision: 5, scale: 2 }).notNull().default("0"),

  zoneType:          text("zone_type"),
  amdPattern:        text("amd_pattern"),
  riskReward:        numeric("risk_reward",         { precision: 6, scale: 2 }),
  entryPrice:        numeric("entry_price",         { precision: 18, scale: 6 }),

  rejectionReason:   text("rejection_reason").notNull(),

  priceAt1h:         numeric("price_at_1h",        { precision: 18, scale: 6 }),
  priceAt4h:         numeric("price_at_4h",        { precision: 18, scale: 6 }),
  priceAt24h:        numeric("price_at_24h",       { precision: 18, scale: 6 }),
  estimatedPipsIfTaken: numeric("estimated_pips_if_taken", { precision: 8, scale: 1 }),
  outcomeIfTaken:    text("outcome_if_taken"),

  createdAt:         timestamp("created_at",       { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("missed_opportunities_pair_idx").on(t.pair),
  index("missed_opportunities_created_at_idx").on(t.createdAt),
]);

export const insertMissedOpportunitySchema = createInsertSchema(missedOpportunitiesTable).omit({ id: true });
export type InsertMissedOpportunity = z.infer<typeof insertMissedOpportunitySchema>;
export type MissedOpportunity = typeof missedOpportunitiesTable.$inferSelect;

// ─── Setup Confidence Profiles ─────────────────────────────────────────────

export const setupConfidenceProfilesTable = pgTable(
  "setup_confidence_profiles",
  {
    id:                     serial("id").primaryKey(),
    clusterKey:             text("cluster_key").notNull().unique(),

    zoneScoreBucket:        text("zone_score_bucket").notNull(),
    liquidityScoreBucket:   text("liquidity_score_bucket").notNull(),
    amdScoreBucket:         text("amd_score_bucket").notNull(),
    confirmationScoreBucket:text("confirmation_score_bucket").notNull(),
    session:                text("session").notNull(),

    totalTrades:      integer("total_trades").notNull().default(0),
    wins:             integer("wins").notNull().default(0),
    losses:           integer("losses").notNull().default(0),
    totalPnl:         numeric("total_pnl",       { precision: 18, scale: 4 }).notNull().default("0"),
    grossProfit:      numeric("gross_profit",     { precision: 18, scale: 4 }).notNull().default("0"),
    grossLoss:        numeric("gross_loss",       { precision: 18, scale: 4 }).notNull().default("0"),
    winRate:          numeric("win_rate",         { precision: 5, scale: 2 }).notNull().default("0"),
    profitFactor:     numeric("profit_factor",    { precision: 8, scale: 4 }).notNull().default("0"),
    avgRr:            numeric("avg_rr",           { precision: 6, scale: 2 }).notNull().default("0"),
    avgPnl:           numeric("avg_pnl",          { precision: 10, scale: 4 }).notNull().default("0"),
    avgFinalScore:    numeric("avg_final_score",  { precision: 5, scale: 2 }).notNull().default("0"),

    confidenceAdjustment:   numeric("confidence_adjustment", { precision: 5, scale: 2 }).notNull().default("0"),

    last10WinRate:    numeric("last10_win_rate",  { precision: 5, scale: 2 }),
    last10Pnl:        numeric("last10_pnl",       { precision: 18, scale: 4 }),

    rank:             integer("rank"),
    updatedAt:        timestamp("updated_at",    { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("setup_confidence_profiles_cluster_key_idx").on(t.clusterKey)],
);

export const insertSetupConfidenceProfileSchema = createInsertSchema(setupConfidenceProfilesTable).omit({ id: true, updatedAt: true });
export type InsertSetupConfidenceProfile = z.infer<typeof insertSetupConfidenceProfileSchema>;
export type SetupConfidenceProfile = typeof setupConfidenceProfilesTable.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════
// V2 LONG-TERM MEMORY TABLES
// ═══════════════════════════════════════════════════════════════════════════

// ─── Setup Memory ──────────────────────────────────────────────────────────
// Every detected setup, whether or not a trade was executed.
// This is the foundation record for memory relationships.

export const setupMemoryTable = pgTable("setup_memory", {
  id:                 uuid("id").primaryKey().defaultRandom(),

  // Core identifiers
  pair:               text("pair").notNull(),
  direction:          text("direction").notNull(),
  session:            text("session").notNull(),
  strategyVersion:    text("strategy_version").notNull().default("1.0"),

  // HTF Structure
  htfStructure:       text("htf_structure"),
  htfBias:            text("htf_bias"),

  // Zone data
  supplyZoneHigh:     numeric("supply_zone_high", { precision: 18, scale: 6 }),
  supplyZoneLow:      numeric("supply_zone_low",  { precision: 18, scale: 6 }),
  demandZoneHigh:     numeric("demand_zone_high", { precision: 18, scale: 6 }),
  demandZoneLow:      numeric("demand_zone_low",  { precision: 18, scale: 6 }),

  // Premium / Discount
  premiumDiscountLevel: numeric("premium_discount_level", { precision: 18, scale: 6 }),
  premiumDiscountLabel: text("premium_discount_label"),

  // Scoring breakdown
  zoneScore:          numeric("zone_score",          { precision: 5, scale: 2 }).notNull().default("0"),
  liquidityScore:     numeric("liquidity_score",     { precision: 5, scale: 2 }).notNull().default("0"),
  amdScore:           numeric("amd_score",           { precision: 5, scale: 2 }).notNull().default("0"),
  confirmationScore:  numeric("confirmation_score",  { precision: 5, scale: 2 }).notNull().default("0"),
  tqi:                numeric("tqi",                 { precision: 5, scale: 2 }),
  confidence:         numeric("confidence",          { precision: 5, scale: 2 }).notNull().default("0"),

  // Status flags
  isValid:            boolean("is_valid").notNull().default(true),
  isAccepted:         boolean("is_accepted").notNull().default(false),

  // Relationship to trade (null if setup was evaluated but no trade taken)
  linkedTradeId:      integer("linked_trade_id"),
  linkedTradeUuid:    uuid("linked_trade_uuid"),

  // Market context at setup time
  marketSnapshotId:   uuid("market_snapshot_id"),
  regime:             text("regime"),
  newsState:          text("news_state"),

  // Optional rich context
  meta:               jsonb("meta").$type<Record<string, unknown>>(),

  evaluatedAt:        timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt:          timestamp("created_at",   { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("setup_memory_pair_idx").on(t.pair),
  index("setup_memory_evaluated_at_idx").on(t.evaluatedAt),
  index("setup_memory_is_accepted_idx").on(t.isAccepted),
  index("setup_memory_is_valid_idx").on(t.isValid),
  index("setup_memory_session_idx").on(t.session),
  index("setup_memory_linked_trade_id_idx").on(t.linkedTradeId),
]);

export const insertSetupMemorySchema = createInsertSchema(setupMemoryTable).omit({ createdAt: true });
export type InsertSetupMemory = z.infer<typeof insertSetupMemorySchema>;
export type SetupMemory = typeof setupMemoryTable.$inferSelect;

// ─── Skipped Setup Memory ──────────────────────────────────────────────────
// Every opportunity that was evaluated and deliberately skipped.
// Provides a complete audit trail of rejections for learning purposes.

export const skippedSetupMemoryTable = pgTable("skipped_setup_memory", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  setupId:            uuid("setup_id"),

  pair:               text("pair").notNull(),
  direction:          text("direction").notNull(),
  session:            text("session").notNull(),
  regime:             text("regime"),

  // Why it was skipped
  skipReason:         text("skip_reason").notNull(),
  rejectingRule:      text("rejecting_rule").notNull(),
  rejectingModule:    text("rejecting_module").notNull(),

  // Scores at time of rejection
  zoneScore:          numeric("zone_score",         { precision: 5, scale: 2 }),
  liquidityScore:     numeric("liquidity_score",    { precision: 5, scale: 2 }),
  amdScore:           numeric("amd_score",          { precision: 5, scale: 2 }),
  confirmationScore:  numeric("confirmation_score", { precision: 5, scale: 2 }),
  confidence:         numeric("confidence",         { precision: 5, scale: 2 }),

  // Price at skip time
  priceAtSkip:        numeric("price_at_skip", { precision: 18, scale: 6 }),

  // Screenshot reference (for future visual analysis)
  screenshotRef:      text("screenshot_ref"),

  // Market context
  newsState:          text("news_state"),
  volatility:         text("volatility"),
  spread:             numeric("spread", { precision: 6, scale: 2 }),
  marketContext:      jsonb("market_context").$type<Record<string, unknown>>(),

  // Aftermath tracking (populated by background job)
  priceAt1h:          numeric("price_at_1h",   { precision: 18, scale: 6 }),
  priceAt4h:          numeric("price_at_4h",   { precision: 18, scale: 6 }),
  priceAt24h:         numeric("price_at_24h",  { precision: 18, scale: 6 }),
  hypotheticalOutcome: text("hypothetical_outcome"),

  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("skipped_setup_memory_pair_idx").on(t.pair),
  index("skipped_setup_memory_created_at_idx").on(t.createdAt),
  index("skipped_setup_memory_rejecting_rule_idx").on(t.rejectingRule),
  index("skipped_setup_memory_setup_id_idx").on(t.setupId),
]);

export const insertSkippedSetupMemorySchema = createInsertSchema(skippedSetupMemoryTable).omit({ createdAt: true });
export type InsertSkippedSetupMemory = z.infer<typeof insertSkippedSetupMemorySchema>;
export type SkippedSetupMemory = typeof skippedSetupMemoryTable.$inferSelect;

// ─── Market Snapshot Memory ────────────────────────────────────────────────
// A point-in-time snapshot of market conditions at the moment a setup is evaluated.
// Referenced by both setup_memory and skipped_setup_memory.

export const marketSnapshotMemoryTable = pgTable("market_snapshot_memory", {
  id:                 uuid("id").primaryKey().defaultRandom(),

  capturedAt:         timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  pair:               text("pair").notNull(),
  session:            text("session").notNull(),

  // Price data
  priceOpen:          numeric("price_open",  { precision: 18, scale: 6 }),
  priceHigh:          numeric("price_high",  { precision: 18, scale: 6 }),
  priceLow:           numeric("price_low",   { precision: 18, scale: 6 }),
  priceClose:         numeric("price_close", { precision: 18, scale: 6 }),
  spread:             numeric("spread",      { precision: 6, scale: 2 }),

  // Timeframe contexts (JSON encoded objects)
  tf15m:              jsonb("tf_15m").$type<Record<string, unknown>>(),
  tf1h:               jsonb("tf_1h").$type<Record<string, unknown>>(),
  tf4h:               jsonb("tf_4h").$type<Record<string, unknown>>(),
  tf1d:               jsonb("tf_1d").$type<Record<string, unknown>>(),

  // Derived state
  trend:              text("trend"),
  trendStrength:      numeric("trend_strength",  { precision: 5, scale: 2 }),
  volatility:         text("volatility"),
  volatilityScore:    numeric("volatility_score", { precision: 5, scale: 2 }),
  regime:             text("regime"),
  regimeConfidence:   numeric("regime_confidence", { precision: 5, scale: 2 }),

  // Liquidity / structure
  liquidityAbove:     numeric("liquidity_above", { precision: 18, scale: 6 }),
  liquidityBelow:     numeric("liquidity_below", { precision: 18, scale: 6 }),
  nearestResistance:  numeric("nearest_resistance", { precision: 18, scale: 6 }),
  nearestSupport:     numeric("nearest_support",    { precision: 18, scale: 6 }),

  // Correlation
  correlatedPairs:    jsonb("correlated_pairs").$type<Record<string, number>>(),
  correlationRisk:    text("correlation_risk"),

  // News / macro
  newsStatus:         text("news_status"),
  upcomingEvents:     jsonb("upcoming_events").$type<Array<Record<string, unknown>>>(),
  highImpactWithin1h: boolean("high_impact_within_1h").notNull().default(false),
}, (t) => [
  index("market_snapshot_memory_pair_idx").on(t.pair),
  index("market_snapshot_memory_captured_at_idx").on(t.capturedAt),
  index("market_snapshot_memory_session_idx").on(t.session),
]);

export const insertMarketSnapshotMemorySchema = createInsertSchema(marketSnapshotMemoryTable);
export type InsertMarketSnapshotMemory = z.infer<typeof insertMarketSnapshotMemorySchema>;
export type MarketSnapshotMemory = typeof marketSnapshotMemoryTable.$inferSelect;

// ─── Memory Metadata ───────────────────────────────────────────────────────
// Tracks the integrity and provenance of every memory record.
// One row per stored record (any table). Enables audit and consistency checks.

export const memoryMetadataTable = pgTable("memory_metadata", {
  id:             uuid("id").primaryKey().defaultRandom(),

  // Which record this metadata describes
  recordId:       text("record_id").notNull(),
  recordTable:    text("record_table").notNull(),
  recordVersion:  integer("record_version").notNull().default(1),

  // Integrity
  dataHash:       text("data_hash").notNull(),
  isValid:        boolean("is_valid").notNull().default(true),
  validationErrors: jsonb("validation_errors").$type<string[]>(),

  // Provenance
  sourceModule:   text("source_module").notNull(),
  sourceVersion:  text("source_version").notNull().default("1.0"),
  createdBy:      text("created_by").notNull().default("system"),

  createdAt:      timestamp("created_at",  { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at",  { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("memory_metadata_record_id_idx").on(t.recordId),
  index("memory_metadata_record_table_idx").on(t.recordTable),
  index("memory_metadata_is_valid_idx").on(t.isValid),
  index("memory_metadata_created_at_idx").on(t.createdAt),
  uniqueIndex("memory_metadata_record_unique_idx").on(t.recordId, t.recordTable),
]);

export const insertMemoryMetadataSchema = createInsertSchema(memoryMetadataTable).omit({ createdAt: true, updatedAt: true });
export type InsertMemoryMetadata = z.infer<typeof insertMemoryMetadataSchema>;
export type MemoryMetadata = typeof memoryMetadataTable.$inferSelect;
