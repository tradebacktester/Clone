import { pgTable, serial, text, numeric, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Trade Memory ──────────────────────────────────────────────────────────
// Full per-trade record with all component scores; linked to tradesTable by tradeId

export const tradeMemoryTable = pgTable("trade_memory", {
  id:                serial("id").primaryKey(),
  tradeId:           integer("trade_id").notNull().unique(),

  // Core identifiers
  pair:              text("pair").notNull(),
  direction:         text("direction").notNull(),
  session:           text("session").notNull(),
  regime:            text("regime"),
  regimeConfidence:  numeric("regime_confidence", { precision: 5, scale: 2 }),

  // Component scores (0–100)
  zoneScore:         numeric("zone_score",         { precision: 5, scale: 2 }).notNull().default("0"),
  liquidityScore:    numeric("liquidity_score",     { precision: 5, scale: 2 }).notNull().default("0"),
  amdScore:          numeric("amd_score",           { precision: 5, scale: 2 }).notNull().default("0"),
  confirmationScore: numeric("confirmation_score",  { precision: 5, scale: 2 }).notNull().default("0"),
  finalScore:        numeric("final_score",         { precision: 5, scale: 2 }).notNull().default("0"),
  confidence:        numeric("confidence",          { precision: 5, scale: 2 }).notNull().default("0"),

  // Setup metadata
  zoneType:          text("zone_type"),
  amdPattern:        text("amd_pattern"),
  fibLevel:          numeric("fib_level",           { precision: 5, scale: 4 }),
  confluenceFactors: text("confluence_factors"),    // JSON array

  // Risk / execution
  riskRewardPlanned: numeric("rr_planned",          { precision: 6, scale: 2 }).notNull().default("0"),
  riskRewardActual:  numeric("rr_actual",           { precision: 6, scale: 2 }),
  slippagePips:      numeric("slippage_pips",       { precision: 6, scale: 2 }),
  exitSlippagePips:  numeric("exit_slippage_pips",  { precision: 6, scale: 2 }),

  // Outcome
  outcome:           text("outcome"),              // 'win' | 'loss' | 'open'
  pnl:               numeric("pnl",               { precision: 18, scale: 4 }),
  pnlPercent:        numeric("pnl_percent",        { precision: 10, scale: 4 }),
  closeReason:       text("close_reason"),

  // Timing
  timeInTradeMins:   integer("time_in_trade_mins"),
  openedAt:          timestamp("opened_at",       { withTimezone: true }).notNull().defaultNow(),
  closedAt:          timestamp("closed_at",       { withTimezone: true }),

  // Cluster
  clusterKey:        text("cluster_key"),         // computed on write
});

export const insertTradeMemorySchema = createInsertSchema(tradeMemoryTable).omit({ id: true });
export type InsertTradeMemory = z.infer<typeof insertTradeMemorySchema>;
export type TradeMemory = typeof tradeMemoryTable.$inferSelect;

// ─── Missed Opportunities ──────────────────────────────────────────────────
// Signals that were rejected; records why and what price did afterward

export const missedOpportunitiesTable = pgTable("missed_opportunities", {
  id:                serial("id").primaryKey(),

  pair:              text("pair").notNull(),
  direction:         text("direction").notNull(),
  session:           text("session").notNull(),
  regime:            text("regime"),

  // Component scores at rejection time
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

  // Why rejected
  rejectionReason:   text("rejection_reason").notNull(),
  // e.g. 'below_confidence', 'daily_loss_limit', 'weekly_loss_limit',
  //      'max_open_trades', 'pair_already_open', 'bot_halted', 'not_running'

  // Aftermath (filled in by background price tracking — nullable until updated)
  priceAt1h:         numeric("price_at_1h",        { precision: 18, scale: 6 }),
  priceAt4h:         numeric("price_at_4h",        { precision: 18, scale: 6 }),
  priceAt24h:        numeric("price_at_24h",       { precision: 18, scale: 6 }),
  estimatedPipsIfTaken: numeric("estimated_pips_if_taken", { precision: 8, scale: 1 }),
  outcomeIfTaken:    text("outcome_if_taken"),     // 'would_win' | 'would_lose' | 'unknown'

  createdAt:         timestamp("created_at",       { withTimezone: true }).notNull().defaultNow(),
});

export const insertMissedOpportunitySchema = createInsertSchema(missedOpportunitiesTable).omit({ id: true });
export type InsertMissedOpportunity = z.infer<typeof insertMissedOpportunitySchema>;
export type MissedOpportunity = typeof missedOpportunitiesTable.$inferSelect;

// ─── Setup Confidence Profiles ─────────────────────────────────────────────
// One row per unique cluster key; updated after every trade close

export const setupConfidenceProfilesTable = pgTable(
  "setup_confidence_profiles",
  {
    id:                     serial("id").primaryKey(),
    clusterKey:             text("cluster_key").notNull().unique(),

    // Cluster descriptor (decoded for display)
    zoneScoreBucket:        text("zone_score_bucket").notNull(),    // '<70' | '70-79' | '80-89' | '90+'
    liquidityScoreBucket:   text("liquidity_score_bucket").notNull(),
    amdScoreBucket:         text("amd_score_bucket").notNull(),
    confirmationScoreBucket:text("confirmation_score_bucket").notNull(),
    session:                text("session").notNull(),

    // Cumulative stats
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

    // Dynamic confidence adjustment
    confidenceAdjustment:   numeric("confidence_adjustment", { precision: 5, scale: 2 }).notNull().default("0"),
    // Range: -30 to +30 applied on top of base signal confidence
    // Only non-zero when totalTrades >= MIN_SAMPLE_SIZE (10)

    // Rolling 10-trade performance
    last10WinRate:    numeric("last10_win_rate",  { precision: 5, scale: 2 }),
    last10Pnl:        numeric("last10_pnl",       { precision: 18, scale: 4 }),

    rank:             integer("rank"),            // 1 = best, populated by ranking job

    updatedAt:        timestamp("updated_at",    { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("setup_confidence_profiles_cluster_key_idx").on(t.clusterKey)],
);

export const insertSetupConfidenceProfileSchema = createInsertSchema(setupConfidenceProfilesTable).omit({ id: true, updatedAt: true });
export type InsertSetupConfidenceProfile = z.infer<typeof insertSetupConfidenceProfileSchema>;
export type SetupConfidenceProfile = typeof setupConfidenceProfilesTable.$inferSelect;
