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

// ─── Market Snapshot Memory ────────────────────────────────────────────────
// A point-in-time snapshot of market conditions at the moment a setup is evaluated.
// Referenced by both setup_memory and skipped_setup_memory.

export const marketSnapshotMemoryTable = pgTable("market_snapshot_memory", {
  id:                 uuid("id").primaryKey().defaultRandom(),

  capturedAt:         timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  pair:               text("pair").notNull(),
  session:            text("session").notNull(),
  strategyVersion:    text("strategy_version").notNull().default("2.0"),

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

  // Zone summary at time of snapshot
  supplyZoneCount:    integer("supply_zone_count").default(0),
  demandZoneCount:    integer("demand_zone_count").default(0),
  activeSignalCount:  integer("active_signal_count").default(0),
}, (t) => [
  index("market_snapshot_memory_pair_idx").on(t.pair),
  index("market_snapshot_memory_captured_at_idx").on(t.capturedAt),
  index("market_snapshot_memory_session_idx").on(t.session),
]);

export const insertMarketSnapshotMemorySchema = createInsertSchema(marketSnapshotMemoryTable);
export type InsertMarketSnapshotMemory = z.infer<typeof insertMarketSnapshotMemorySchema>;
export type MarketSnapshotMemory = typeof marketSnapshotMemoryTable.$inferSelect;

// ─── Setup Memory ──────────────────────────────────────────────────────────
// Every detected setup, whether or not a trade was executed.
// This is the foundation record for memory relationships.

export const setupMemoryTable = pgTable("setup_memory", {
  id:                 uuid("id").primaryKey().defaultRandom(),

  // Core identifiers
  pair:               text("pair").notNull(),
  direction:          text("direction").notNull(),
  session:            text("session").notNull(),
  strategyVersion:    text("strategy_version").notNull().default("2.0"),

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

  // Entry parameters
  entryPrice:         numeric("entry_price",   { precision: 18, scale: 6 }),
  stopLoss:           numeric("stop_loss",     { precision: 18, scale: 6 }),
  takeProfit:         numeric("take_profit",   { precision: 18, scale: 6 }),
  riskReward:         numeric("risk_reward",   { precision: 6, scale: 2 }),

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
  index("setup_memory_snapshot_id_idx").on(t.marketSnapshotId),
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
  entryPrice:         numeric("entry_price",   { precision: 18, scale: 6 }),
  stopLoss:           numeric("stop_loss",     { precision: 18, scale: 6 }),
  takeProfit:         numeric("take_profit",   { precision: 18, scale: 6 }),
  riskReward:         numeric("risk_reward",   { precision: 6, scale: 2 }),

  // Screenshot reference (for future visual analysis)
  screenshotRef:      text("screenshot_ref"),

  // Market context
  newsState:          text("news_state"),
  volatility:         text("volatility"),
  spread:             numeric("spread", { precision: 6, scale: 2 }),
  marketSnapshotId:   uuid("market_snapshot_id"),
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
  index("skipped_setup_memory_snapshot_id_idx").on(t.marketSnapshotId),
]);

export const insertSkippedSetupMemorySchema = createInsertSchema(skippedSetupMemoryTable).omit({ createdAt: true });
export type InsertSkippedSetupMemory = z.infer<typeof insertSkippedSetupMemorySchema>;
export type SkippedSetupMemory = typeof skippedSetupMemoryTable.$inferSelect;

// ─── Trade Events ──────────────────────────────────────────────────────────
// Append-only event log for every meaningful change to a trade's lifecycle.
// One row per event. Never updated. Always appended.
// This forms the complete episodic memory timeline per trade.

export const tradeEventsTable = pgTable("trade_events", {
  id:            serial("id").primaryKey(),

  // Identifiers
  tradeId:       integer("trade_id").notNull(),
  setupId:       uuid("setup_id"),       // linked setup_memory record
  snapshotId:    uuid("snapshot_id"),    // linked market_snapshot_memory record

  // Event classification
  // opened | break_even | partial_close | trailing_stop | sl_updated |
  // tp_updated | size_changed | manual_close | closed | price_update
  eventType:     text("event_type").notNull(),

  // Price state at event time
  price:         numeric("price",       { precision: 18, scale: 6 }),
  stopLoss:      numeric("stop_loss",   { precision: 18, scale: 6 }),
  takeProfit:    numeric("take_profit", { precision: 18, scale: 6 }),
  lotSize:       numeric("lot_size",   { precision: 10, scale: 4 }),

  // Open event fields
  riskPct:       numeric("risk_pct",   { precision: 5, scale: 2 }),
  expectedRr:    numeric("expected_rr",{ precision: 6, scale: 2 }),
  spreadPips:    numeric("spread_pips",{ precision: 6, scale: 2 }),
  brokerResponse: text("broker_response"),

  // Close event fields
  pnl:           numeric("pnl",           { precision: 18, scale: 4 }),
  pnlPercent:    numeric("pnl_percent",   { precision: 10, scale: 4 }),
  riskReward:    numeric("risk_reward",   { precision: 6, scale: 2 }),
  closeReason:   text("close_reason"),
  outcome:       text("outcome"),          // 'win' | 'loss' | 'break_even'
  durationMins:  integer("duration_mins"),

  // Excursion analysis (only on close events)
  mfePips:       numeric("mfe_pips", { precision: 8, scale: 2 }), // Maximum Favorable Excursion
  maePips:       numeric("mae_pips", { precision: 8, scale: 2 }), // Maximum Adverse Excursion
  slippagePips:  numeric("slippage_pips", { precision: 6, scale: 2 }),

  // Generic metadata for any extra context
  meta:          jsonb("meta").$type<Record<string, unknown>>(),

  occurredAt:    timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("trade_events_trade_id_idx").on(t.tradeId),
  index("trade_events_setup_id_idx").on(t.setupId),
  index("trade_events_event_type_idx").on(t.eventType),
  index("trade_events_occurred_at_idx").on(t.occurredAt),
]);

export const insertTradeEventSchema = createInsertSchema(tradeEventsTable).omit({ id: true });
export type InsertTradeEvent = z.infer<typeof insertTradeEventSchema>;
export type TradeEvent = typeof tradeEventsTable.$inferSelect;

// ─── Trade Screenshots ─────────────────────────────────────────────────────
// Visual memory — one row per screenshot per trade lifecycle stage.
// Append-only: never update imageData. New screenshot = new row.

export const tradeScreenshotsTable = pgTable("trade_screenshots", {
  id:               uuid("id").primaryKey().defaultRandom(),

  // Relational links
  tradeId:          integer("trade_id"),
  setupId:          uuid("setup_id"),
  snapshotId:       uuid("snapshot_id"),
  contextId:        uuid("context_id"),

  // Stage in the trade lifecycle
  // before_entry | entry | during_trade | break_even | partial_tp | htf_analysis | ltf_analysis | after_exit | custom
  stage:            text("stage").notNull().default("custom"),

  // Chart metadata
  timeframe:        text("timeframe"),          // 1m | 5m | 15m | 1h | 4h | 1d
  pair:             text("pair"),
  theme:            text("theme").default("dark"),    // dark | light
  resolution:       text("resolution"),               // "1920x1080"
  chartAnnotations: jsonb("chart_annotations").$type<Record<string, unknown>>(),

  // Image storage (base64-encoded)
  imageData:        text("image_data"),               // full image
  thumbnailData:    text("thumbnail_data"),            // small preview (~200px wide)
  mimeType:         text("mime_type").notNull().default("image/png"),
  sizeBytes:        integer("size_bytes"),
  compressionRatio: numeric("compression_ratio", { precision: 5, scale: 2 }),

  // Duplicate detection
  fileHash:         text("file_hash"),                // SHA-256 of raw imageData

  // User-provided context
  notes:            text("notes"),
  tags:             jsonb("tags").$type<string[]>(),

  capturedAt:       timestamp("captured_at",   { withTimezone: true }),
  uploadedAt:       timestamp("uploaded_at",   { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("trade_screenshots_trade_id_idx").on(t.tradeId),
  index("trade_screenshots_stage_idx").on(t.stage),
  index("trade_screenshots_pair_idx").on(t.pair),
  index("trade_screenshots_file_hash_idx").on(t.fileHash),
  index("trade_screenshots_uploaded_at_idx").on(t.uploadedAt),
]);

export const insertTradeScreenshotSchema = createInsertSchema(tradeScreenshotsTable).omit({ uploadedAt: true });
export type InsertTradeScreenshot = z.infer<typeof insertTradeScreenshotSchema>;
export type TradeScreenshot = typeof tradeScreenshotsTable.$inferSelect;

// ─── Trade Context ──────────────────────────────────────────────────────────
// Rich contextual memory attached to a trade. One row per trade (upsert).
// Split into three sub-domains: market, strategy, trader.

export const tradeContextTable = pgTable("trade_context", {
  id:               uuid("id").primaryKey().defaultRandom(),
  tradeId:          integer("trade_id").notNull().unique(),
  setupId:          uuid("setup_id"),
  snapshotId:       uuid("snapshot_id"),
  strategyVersion:  text("strategy_version").notNull().default("2.0"),

  // ── Market Context ───────────────────────────────────────────────────────
  trendStrength:      numeric("trend_strength",     { precision: 5, scale: 2 }),
  marketRegime:       text("market_regime"),
  session:            text("session"),
  liquidityLevel:     text("liquidity_level"),    // high | medium | low
  spreadPips:         numeric("spread_pips",      { precision: 6, scale: 2 }),
  volatility:         text("volatility"),         // high | medium | low
  volatilityScore:    numeric("volatility_score", { precision: 5, scale: 2 }),
  correlationData:    jsonb("correlation_data").$type<Record<string, number>>(),
  newsContext:        jsonb("news_context").$type<{
    events: Array<{ title: string; impact: string; timeUntil?: string }>;
    overallImpact: string;
    blockingPairs: string[];
  }>(),
  sessionOpenClose:   text("session_open_close"),  // open | mid | close
  dayOfWeek:          text("day_of_week"),          // Monday ... Friday

  // ── Strategy Context ─────────────────────────────────────────────────────
  htfBias:              text("htf_bias"),           // bullish | bearish | neutral
  premiumDiscountState: text("premium_discount_state"), // premium | discount | equilibrium
  supplyStrength:       numeric("supply_strength",  { precision: 5, scale: 2 }),
  demandStrength:       numeric("demand_strength",  { precision: 5, scale: 2 }),
  liquidityScore:       numeric("liquidity_score",  { precision: 5, scale: 2 }),
  amdStage:             text("amd_stage"),          // accumulation | manipulation | distribution
  confirmationQuality:  numeric("confirmation_quality", { precision: 5, scale: 2 }),
  traderIntelligenceScore: numeric("trader_intelligence_score", { precision: 5, scale: 2 }),
  ruleEvaluationSummary:   jsonb("rule_evaluation_summary").$type<Record<string, unknown>>(),

  // ── Trader Context ───────────────────────────────────────────────────────
  manualNotes:      text("manual_notes"),
  confidence:       integer("confidence"),           // 0-100, trader's self-rated confidence
  emotionTag:       text("emotion_tag"),             // calm | fearful | confident | uncertain | fomo | disciplined
  reasonAccepted:   text("reason_accepted"),
  reasonRejected:   text("reason_rejected"),
  lessonsLearned:   text("lessons_learned"),

  // For future semantic search (placeholder for pgvector embedding)
  searchVector:     text("search_vector"),           // concatenated text blob for future vectorisation

  reviewedAt:       timestamp("reviewed_at",  { withTimezone: true }),
  createdAt:        timestamp("created_at",   { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at",   { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("trade_context_trade_id_idx").on(t.tradeId),
  index("trade_context_session_idx").on(t.session),
  index("trade_context_regime_idx").on(t.marketRegime),
  index("trade_context_emotion_tag_idx").on(t.emotionTag),
  index("trade_context_day_of_week_idx").on(t.dayOfWeek),
  index("trade_context_created_at_idx").on(t.createdAt),
]);

export const insertTradeContextSchema = createInsertSchema(tradeContextTable).omit({ createdAt: true, updatedAt: true });
export type InsertTradeContext = z.infer<typeof insertTradeContextSchema>;
export type TradeContext = typeof tradeContextTable.$inferSelect;

// ─── Context Timeline Events ────────────────────────────────────────────────
// Rich episodic stage log for context-aware timeline reconstruction.
// Combines auto-events (from trading engine) + manual review events.

export const contextTimelineEventsTable = pgTable("context_timeline_events", {
  id:          serial("id").primaryKey(),
  tradeId:     integer("trade_id"),
  setupId:     uuid("setup_id"),

  // Stage name — defines the icon/colour shown on the timeline
  // market_scan | htf_analysis | setup_created | screenshot_saved |
  // liquidity_sweep | amd_complete | entry | break_even | partial_tp |
  // exit | review | lesson_learned | note_added | custom
  stage:       text("stage").notNull(),
  title:       text("title").notNull(),
  description: text("description"),
  iconType:    text("icon_type"),      // maps to frontend icon set
  source:      text("source").notNull().default("system"),  // system | user

  meta:        jsonb("meta").$type<Record<string, unknown>>(),
  occurredAt:  timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ctx_timeline_trade_id_idx").on(t.tradeId),
  index("ctx_timeline_stage_idx").on(t.stage),
  index("ctx_timeline_occurred_at_idx").on(t.occurredAt),
]);

export const insertContextTimelineEventSchema = createInsertSchema(contextTimelineEventsTable).omit({ id: true });
export type InsertContextTimelineEvent = z.infer<typeof insertContextTimelineEventSchema>;
export type ContextTimelineEvent = typeof contextTimelineEventsTable.$inferSelect;

// ─── Memory Relationship Graph ─────────────────────────────────────────────
// Directed soft-link graph: (fromType, fromId) → relType → (toType, toId)
// All relationship resolution is managed by RelationshipEngine — no SQL FKs.

export const memoryRelationshipsTable = pgTable("memory_relationships", {
  id:           serial("id").primaryKey(),

  // Source entity
  fromType:     text("from_type").notNull(), // snapshot | setup | trade | context | screenshot | event | review | lesson
  fromId:       text("from_id").notNull(),   // UUID or integer serialised to text

  // Target entity
  toType:       text("to_type").notNull(),
  toId:         text("to_id").notNull(),

  // Relationship type
  // has_snapshot | has_setup | has_trade | has_context | has_screenshot |
  // has_event | has_review | has_lesson | followed_by | superseded_by | related_to
  relType:      text("rel_type").notNull(),

  // Optional numeric weight (reserved for future relevance scoring)
  strength:     numeric("strength", { precision: 5, scale: 4 }).default("1.0"),

  meta:         jsonb("meta").$type<Record<string, unknown>>(),

  createdAt:    timestamp("created_at",  { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at",  { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("mem_rel_from_idx").on(t.fromType, t.fromId),
  index("mem_rel_to_idx").on(t.toType, t.toId),
  index("mem_rel_type_idx").on(t.relType),
  uniqueIndex("mem_rel_unique_idx").on(t.fromType, t.fromId, t.toType, t.toId, t.relType),
]);

export const insertMemoryRelationshipSchema = createInsertSchema(memoryRelationshipsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMemoryRelationship = z.infer<typeof insertMemoryRelationshipSchema>;
export type MemoryRelationship = typeof memoryRelationshipsTable.$inferSelect;

// ─── Memory Relationship History ────────────────────────────────────────────
// Append-only audit log for relationship changes.

export const memoryRelationshipHistoryTable = pgTable("memory_relationship_history", {
  id:             serial("id").primaryKey(),
  relationshipId: integer("relationship_id"),
  action:         text("action").notNull(),   // created | updated | deleted | repaired | orphan_removed
  fromType:       text("from_type"),
  fromId:         text("from_id"),
  toType:         text("to_type"),
  toId:           text("to_id"),
  relType:        text("rel_type"),
  meta:           jsonb("meta").$type<Record<string, unknown>>(),
  occurredAt:     timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("mem_rel_hist_rid_idx").on(t.relationshipId),
  index("mem_rel_hist_at_idx").on(t.occurredAt),
]);

export const insertMemoryRelationshipHistorySchema = createInsertSchema(memoryRelationshipHistoryTable).omit({ id: true });
export type InsertMemoryRelationshipHistory = z.infer<typeof insertMemoryRelationshipHistorySchema>;

// ─── Memory Experiences ─────────────────────────────────────────────────────
// One row per trade experience — the central index record for the graph.
// Aggregate of trade + context + screenshots + timeline + outcome.
// Designed to be the primary unit future AI modules request.

export const memoryExperiencesTable = pgTable("memory_experiences", {
  id:               serial("id").primaryKey(),
  experienceId:     uuid("experience_id").notNull().unique().defaultRandom(), // stable external ID

  // Core links
  tradeId:          integer("trade_id").unique(),
  setupId:          uuid("setup_id"),
  snapshotId:       uuid("snapshot_id"),
  contextId:        uuid("context_id"),

  // Searchable labels (denormalised for fast compound filtering)
  pair:             text("pair"),
  direction:        text("direction"),
  session:          text("session"),
  marketRegime:     text("market_regime"),
  amdStage:         text("amd_stage"),
  outcome:          text("outcome"),       // win | loss | break_even | open
  dayOfWeek:        text("day_of_week"),
  volatility:       text("volatility"),
  htfBias:          text("htf_bias"),
  emotionTag:       text("emotion_tag"),
  strategyVersion:  text("strategy_version").default("2.0"),

  // Metrics (denormalised for range queries)
  pnlPips:          numeric("pnl_pips",       { precision: 10, scale: 4 }),
  riskReward:       numeric("risk_reward",     { precision: 8,  scale: 4 }),
  durationMins:     integer("duration_mins"),
  confidenceScore:  numeric("confidence_score",{ precision: 5,  scale: 2 }),
  zoneQuality:      numeric("zone_quality",    { precision: 5,  scale: 2 }),
  liquidityScore:   numeric("liquidity_score", { precision: 5,  scale: 2 }),
  amdQuality:       numeric("amd_quality",     { precision: 5,  scale: 2 }),
  spreadPips:       numeric("spread_pips",     { precision: 6,  scale: 2 }),
  traderConfidence: integer("trader_confidence"),

  // Completeness flags
  hasContext:       boolean("has_context").default(false),
  hasScreenshots:   boolean("has_screenshots").default(false),
  hasReview:        boolean("has_review").default(false),
  hasLessons:       boolean("has_lessons").default(false),
  screenshotCount:  integer("screenshot_count").default(0),
  eventCount:       integer("event_count").default(0),
  relationshipCount: integer("relationship_count").default(0),

  // ── AI Integration Placeholders (NOT active AI — architecture only) ──────
  // These fields are reserved for future AI modules.
  // Do NOT use for computation until explicitly enabled.
  featureVector:        jsonb("feature_vector").$type<number[]>(),              // 10-dim numeric feature array
  similarityMetadata:   jsonb("similarity_metadata").$type<{
    nearestNeighbours:  string[];   // future: top-k experience IDs
    similarityScores:   number[];   // future: cosine similarity scores
    lastComputedAt:     string | null;
  }>(),
  embeddingPlaceholder: jsonb("embedding_placeholder").$type<{
    model:    string | null;        // e.g. "text-embedding-3-small"
    dims:     number | null;        // e.g. 1536
    computed: boolean;
    vectorId: string | null;        // external vector DB ID
  }>(),

  // Integrity
  integrityScore:    numeric("integrity_score", { precision: 5, scale: 4 }),
  brokenLinks:       integer("broken_links").default(0),
  dataQualityNotes:  text("data_quality_notes"),
  lastValidatedAt:   timestamp("last_validated_at", { withTimezone: true }),

  tradeOpenedAt:    timestamp("trade_opened_at",  { withTimezone: true }),
  tradeClosedAt:    timestamp("trade_closed_at",  { withTimezone: true }),
  createdAt:        timestamp("created_at",        { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at",        { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("mem_exp_trade_id_idx").on(t.tradeId),
  index("mem_exp_pair_idx").on(t.pair),
  index("mem_exp_session_idx").on(t.session),
  index("mem_exp_regime_idx").on(t.marketRegime),
  index("mem_exp_outcome_idx").on(t.outcome),
  index("mem_exp_emotion_idx").on(t.emotionTag),
  index("mem_exp_day_idx").on(t.dayOfWeek),
  index("mem_exp_created_at_idx").on(t.createdAt),
]);

export const insertMemoryExperienceSchema = createInsertSchema(memoryExperiencesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMemoryExperience = z.infer<typeof insertMemoryExperienceSchema>;
export type MemoryExperience = typeof memoryExperiencesTable.$inferSelect;

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
  sourceVersion:  text("source_version").notNull().default("2.0"),
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
