// ─── Adaptive Risk Intelligence Engine — DB Schema ───────────────────────────
// Advisory only. Learns from history, adapts risk management.
// NEVER modifies the deterministic strategy, entry/exit rules, or research pipeline.

import {
  pgTable, serial, text, numeric, integer, boolean,
  timestamp, jsonb, uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// ─── Adaptive Risk Profiles (current + historical snapshots) ──────────────────

export const ariProfilesTable = pgTable("ari_profiles", {
  id:            serial("id").primaryKey(),
  profileId:     uuid("profile_id").notNull().unique().defaultRandom(),
  engineVersion: text("engine_version").notNull().default("1.0.0"),
  generatedAt:   timestamp("generated_at").notNull().defaultNow(),
  isAdvisoryOnly: boolean("is_advisory_only").notNull().default(true),

  // Recommended profile
  recommendedProfile:      text("recommended_profile").notNull(), // conservative | balanced | aggressive | observation | recovery | emergency
  recommendedProfileLabel: text("recommended_profile_label").notNull(),
  previousProfile:         text("previous_profile"),
  profileChanged:          boolean("profile_changed").notNull().default(false),

  // Confidence
  confidenceScore:       integer("confidence_score").notNull().default(0),   // 0-100
  confidenceLabel:       text("confidence_label").notNull().default("low"),
  sampleSize:            integer("sample_size").notNull().default(0),
  statisticalSignificance: numeric("statistical_significance").default("0"),
  reliabilityRating:     text("reliability_rating").notNull().default("insufficient"),

  // Market context at generation time
  marketRegime:    text("market_regime"),
  volatilityLevel: text("volatility_level"),
  liquidityLevel:  text("liquidity_level"),
  session:         text("session"),
  pair:            text("pair"),

  // Dynamic recommendation parameters
  maxRiskPerTrade:       numeric("max_risk_per_trade"),       // %
  maxOpenTrades:         integer("max_open_trades"),
  maxPairExposure:       numeric("max_pair_exposure"),        // %
  maxCorrelationExposure: numeric("max_correlation_exposure"), // %
  dailyRiskBudget:       numeric("daily_risk_budget"),        // %
  weeklyRiskBudget:      numeric("weekly_risk_budget"),       // %
  positionSizeMultiplier: numeric("position_size_multiplier"),
  exposureMultiplier:    numeric("exposure_multiplier"),

  // Evidence summary
  primaryReason:     text("primary_reason"),
  supportingReasons: jsonb("supporting_reasons"),
  riskFactors:       jsonb("risk_factors"),
  expectedBenefits:  jsonb("expected_benefits"),
  potentialRisks:    jsonb("potential_risks"),

  // Full objects
  fullProfile:      jsonb("full_profile"),
  explainability:   jsonb("explainability"),
  historicalEvidence: jsonb("historical_evidence"),
});

// ─── Adaptive Recommendations (every recommendation event) ───────────────────

export const ariRecommendationsTable = pgTable("ari_recommendations", {
  id:               serial("id").primaryKey(),
  recommendationId: uuid("recommendation_id").notNull().unique().defaultRandom(),
  generatedAt:      timestamp("generated_at").notNull().defaultNow(),
  profileId:        text("profile_id"),

  // What is being recommended
  parameterName:    text("parameter_name").notNull(),
  parameterLabel:   text("parameter_label").notNull(),
  currentValue:     numeric("current_value"),
  recommendedValue: numeric("recommended_value"),
  changeDirection:  text("change_direction"),       // increase | decrease | maintain
  changeMagnitude:  numeric("change_magnitude"),    // % change

  // Why
  reason:            text("reason").notNull(),
  evidenceSummary:   text("evidence_summary"),
  confidenceScore:   integer("confidence_score").notNull().default(0),
  sampleSize:        integer("sample_size").notNull().default(0),

  // Context
  marketRegime:    text("market_regime"),
  volatilityLevel: text("volatility_level"),
  session:         text("session"),
  pair:            text("pair"),

  // Safety
  withinSafetyLimits: boolean("within_safety_limits").notNull().default(true),
  safetyNotes:        text("safety_notes"),

  evidence: jsonb("evidence"),
});

// ─── Adaptation History (every profile change event) ─────────────────────────

export const ariHistoryTable = pgTable("ari_history", {
  id:           serial("id").primaryKey(),
  eventId:      uuid("event_id").notNull().unique().defaultRandom(),
  occurredAt:   timestamp("occurred_at").notNull().defaultNow(),

  // What changed
  fromProfile:        text("from_profile"),
  toProfile:          text("to_profile").notNull(),
  changeReason:       text("change_reason").notNull(),
  changeType:         text("change_type").notNull(), // escalation | de-escalation | maintenance | initial

  // Market state at time of change
  marketRegime:    text("market_regime"),
  volatilityLevel: text("volatility_level"),
  liquidityLevel:  text("liquidity_level"),
  session:         text("session"),

  // Evidence
  confidenceScore:    integer("confidence_score").notNull().default(0),
  sampleSize:         integer("sample_size").notNull().default(0),
  supportingEvidence: jsonb("supporting_evidence"),

  // Full snapshot for replay
  fullSnapshot: jsonb("full_snapshot"),
});

// ─── Performance Stats (learnt environment profiles) ─────────────────────────

export const ariPerformanceTable = pgTable("ari_performance", {
  id:          serial("id").primaryKey(),
  perfId:      uuid("perf_id").notNull().unique().defaultRandom(),
  computedAt:  timestamp("computed_at").notNull().defaultNow(),
  environment: text("environment").notNull(), // regime | volatility | session | pair | liquidity | condition
  environmentKey: text("environment_key").notNull(), // e.g. "trending", "london", "EURUSD"

  // Stats
  sampleSize:     integer("sample_size").notNull().default(0),
  winRate:        numeric("win_rate"),
  expectancy:     numeric("expectancy"),
  avgRR:          numeric("avg_rr"),
  avgPnl:         numeric("avg_pnl"),
  totalPnl:       numeric("total_pnl"),
  maxDrawdown:    numeric("max_drawdown"),
  sharpeProxy:    numeric("sharpe_proxy"),
  profitFactor:   numeric("profit_factor"),
  volatilityScore: numeric("volatility_score"),
  confidenceScore: integer("confidence_score").notNull().default(0),

  // Derived risk rating for this environment
  riskRating:  text("risk_rating").notNull().default("neutral"), // favorable | neutral | unfavorable | avoid
  riskScore:   integer("risk_score").notNull().default(50),      // 0-100 (lower = riskier)

  // JSON details
  breakdown: jsonb("breakdown"),
});

// ─── Drizzle-Zod schemas ──────────────────────────────────────────────────────

export const insertAriProfileSchema        = createInsertSchema(ariProfilesTable).omit({ id: true, profileId: true });
export const insertAriRecommendationSchema = createInsertSchema(ariRecommendationsTable).omit({ id: true, recommendationId: true });
export const insertAriHistorySchema        = createInsertSchema(ariHistoryTable).omit({ id: true, eventId: true });
export const insertAriPerformanceSchema    = createInsertSchema(ariPerformanceTable).omit({ id: true, perfId: true });
