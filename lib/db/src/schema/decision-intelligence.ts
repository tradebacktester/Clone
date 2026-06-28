// ─── Decision Intelligence DB Schema ──────────────────────────────────────────
// Stores every recommendation, its evidence, similar experiences, and history.
// All tables are append-only. No strategy parameters are modified.

import {
  pgTable, serial, text, integer, numeric,
  timestamp, jsonb, index, boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Recommendations ──────────────────────────────────────────────────────────
// One row per evaluated setup. Append-only — never overwritten.

export const diRecommendationsTable = pgTable("di_recommendations", {
  id:                   serial("id").primaryKey(),
  recommendationId:     text("recommendation_id").notNull().unique(),   // uuid
  setupId:              text("setup_id"),                               // external setup ID if provided
  version:              text("version").notNull().default("1.0.0"),

  // Setup snapshot (the input being evaluated)
  pair:                 text("pair").notNull().default("EURUSD"),
  session:              text("session").notNull().default("unknown"),
  regime:               text("regime").notNull().default("unknown"),
  trend:                text("trend").notNull().default("unknown"),
  supplyQuality:        numeric("supply_quality",       { precision: 5, scale: 2 }),
  demandQuality:        numeric("demand_quality",       { precision: 5, scale: 2 }),
  liquidityScore:       numeric("liquidity_score",      { precision: 5, scale: 2 }),
  amdScore:             numeric("amd_score",            { precision: 5, scale: 2 }),
  confirmationQuality:  numeric("confirmation_quality", { precision: 5, scale: 2 }),
  setupScore:           numeric("setup_score",          { precision: 5, scale: 2 }),
  tqi:                  numeric("tqi",                  { precision: 5, scale: 2 }),
  rrPlanned:            numeric("rr_planned",           { precision: 6, scale: 2 }),
  spreadPips:           numeric("spread_pips",          { precision: 6, scale: 3 }),
  volatility:           text("volatility").notNull().default("medium"),

  // Trade Intelligence Score (0–100)
  tisScore:             numeric("tis_score",            { precision: 5, scale: 2 }).notNull(),
  tisComponents:        jsonb("tis_components").$type<Record<string, number>>().notNull(),
  tisWeights:           jsonb("tis_weights").$type<Record<string, number>>().notNull(),

  // Recommendation
  recommendationLevel:  text("recommendation_level").notNull(),
  recommendationLabel:  text("recommendation_label").notNull(),
  confidenceScore:      numeric("confidence_score",  { precision: 5, scale: 2 }).notNull(),
  uncertaintyLevel:     text("uncertainty_level").notNull().default("moderate"),
  reliabilityRating:    text("reliability_rating").notNull().default("insufficient"),
  isLowConfidence:      boolean("is_low_confidence").notNull().default(false),
  hasConflictingEvidence: boolean("has_conflicting_evidence").notNull().default(false),

  // Evidence
  historicalEvidenceCount: integer("historical_evidence_count").notNull().default(0),
  similarWinCount:      integer("similar_win_count").notNull().default(0),
  similarLossCount:     integer("similar_loss_count").notNull().default(0),
  historicalWinRate:    numeric("historical_win_rate", { precision: 6, scale: 4 }),
  statisticalExpectancy: numeric("statistical_expectancy", { precision: 8, scale: 4 }),

  // Factors
  positiveFactors:      jsonb("positive_factors").$type<FactorRecord[]>().notNull(),
  negativeFactors:      jsonb("negative_factors").$type<FactorRecord[]>().notNull(),

  // Full explainability payload
  report:               jsonb("report").$type<Record<string, unknown>>(),
  reasoning:            text("reasoning").notNull().default(""),

  // Outcome tracking (populated when trade resolves)
  finalOutcome:         text("final_outcome"),           // win | loss | break_even | null
  finalRR:              numeric("final_rr",             { precision: 6, scale: 2 }),
  wasAccurate:          boolean("was_accurate"),          // did recommendation match outcome?

  evaluatedAt:          timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
  outcomeRecordedAt:    timestamp("outcome_recorded_at", { withTimezone: true }),
}, (t) => [
  index("di_recommendations_evaluated_at_idx").on(t.evaluatedAt),
  index("di_recommendations_level_idx").on(t.recommendationLevel),
  index("di_recommendations_pair_idx").on(t.pair),
  index("di_recommendations_tis_idx").on(t.tisScore),
]);

export type FactorRecord = { name: string; impact: number; explanation: string; category: string };

export const insertDiRecommendationSchema = createInsertSchema(diRecommendationsTable).omit({ id: true });
export type InsertDiRecommendation = z.infer<typeof insertDiRecommendationSchema>;
export type DiRecommendationRow = typeof diRecommendationsTable.$inferSelect;

// ─── Similar Experiences ──────────────────────────────────────────────────────
// Up to N most-similar historical trades per recommendation.

export const diSimilarExperiencesTable = pgTable("di_similar_experiences", {
  id:                 serial("id").primaryKey(),
  recommendationId:   text("recommendation_id").notNull(),
  tradeId:            text("trade_id").notNull(),
  similarityScore:    numeric("similarity_score",   { precision: 6, scale: 4 }).notNull(), // 0–1
  isWin:              boolean("is_win").notNull().default(false),
  outcome:            text("outcome").notNull().default("unknown"),
  historicalRR:       numeric("historical_rr",      { precision: 6, scale: 2 }),
  historicalPnl:      numeric("historical_pnl",     { precision: 10, scale: 4 }),
  historicalConf:     numeric("historical_conf",    { precision: 5, scale: 2 }),
  pair:               text("pair"),
  session:            text("session"),
  regime:             text("regime"),
  similarityReason:   text("similarity_reason"),
  /** Numeric feature vector snapshot for future vector search */
  featureVector:      jsonb("feature_vector").$type<number[]>(),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("di_similar_experiences_rec_id_idx").on(t.recommendationId),
  index("di_similar_experiences_trade_id_idx").on(t.tradeId),
  index("di_similar_experiences_similarity_idx").on(t.similarityScore),
]);

export const insertDiSimilarExperienceSchema = createInsertSchema(diSimilarExperiencesTable).omit({ id: true, createdAt: true });
export type InsertDiSimilarExperience = z.infer<typeof insertDiSimilarExperienceSchema>;
export type DiSimilarExperienceRow = typeof diSimilarExperiencesTable.$inferSelect;

// ─── Recommendation History ───────────────────────────────────────────────────
// Append-only audit log — one row per recommendation lifecycle event.

export const diRecommendationHistoryTable = pgTable("di_recommendation_history", {
  id:               serial("id").primaryKey(),
  recommendationId: text("recommendation_id").notNull(),
  eventType:        text("event_type").notNull(),          // created | outcome_recorded | accuracy_assessed
  eventData:        jsonb("event_data").$type<Record<string, unknown>>(),
  tisScore:         numeric("tis_score",         { precision: 5, scale: 2 }),
  confidenceScore:  numeric("confidence_score",  { precision: 5, scale: 2 }),
  recommendationLevel: text("recommendation_level"),
  pair:             text("pair"),
  session:          text("session"),
  regime:           text("regime"),
  outcome:          text("outcome"),
  wasAccurate:      boolean("was_accurate"),
  recordedAt:       timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("di_history_rec_id_idx").on(t.recommendationId),
  index("di_history_recorded_at_idx").on(t.recordedAt),
  index("di_history_event_type_idx").on(t.eventType),
]);

export const insertDiHistorySchema = createInsertSchema(diRecommendationHistoryTable).omit({ id: true });
export type InsertDiHistory = z.infer<typeof insertDiHistorySchema>;
export type DiHistoryRow = typeof diRecommendationHistoryTable.$inferSelect;
