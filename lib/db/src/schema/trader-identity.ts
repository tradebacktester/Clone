// ─── Trader Identity & Strategy Consistency Engine — DB Schema ────────────────
// Versioned identity profiles, per-setup similarity reports, preference
// discoveries, drift events, and identity version history.
// All tables are append-only. No strategy parameters are modified.

import {
  pgTable, serial, text, integer, numeric,
  timestamp, jsonb, index, boolean,
} from "drizzle-orm/pg-core";

// ─── Identity Profiles ────────────────────────────────────────────────────────
// One row per identity version. Stage 1 = rule-based, Stage 2 = adaptive.

export const tiIdentityProfilesTable = pgTable("ti_identity_profiles", {
  id:             serial("id").primaryKey(),
  profileId:      text("profile_id").notNull().unique(),
  version:        text("version").notNull(),           // semver e.g. "1.0.0"
  stage:          text("stage").notNull(),             // "rule_identity" | "adaptive_identity"

  // Sample statistics at time of creation
  sampleSize:        integer("sample_size").notNull().default(0),
  confidenceScore:   numeric("confidence_score",   { precision: 5, scale: 2 }).notNull().default("0"),
  minSampleRequired: integer("min_sample_required").notNull().default(20),

  // Rule identity baseline (always present)
  ruleBaselineScore: numeric("rule_baseline_score", { precision: 5, scale: 2 }).notNull().default("100"),
  ruleProfile:       jsonb("rule_profile").$type<unknown>(),

  // Adaptive identity (Stage 2+ only)
  preferredPairs:    jsonb("preferred_pairs").$type<string[]>(),
  preferredSessions: jsonb("preferred_sessions").$type<string[]>(),
  preferredRegimes:  jsonb("preferred_regimes").$type<string[]>(),
  preferredVolatility: text("preferred_volatility"),
  preferredTrend:    text("preferred_trend"),

  avgSetupScore:          numeric("avg_setup_score",          { precision: 5, scale: 2 }),
  avgTqi:                 numeric("avg_tqi",                  { precision: 5, scale: 2 }),
  avgSupplyQuality:       numeric("avg_supply_quality",       { precision: 5, scale: 2 }),
  avgDemandQuality:       numeric("avg_demand_quality",       { precision: 5, scale: 2 }),
  avgLiquidityScore:      numeric("avg_liquidity_score",      { precision: 5, scale: 2 }),
  avgAmdScore:            numeric("avg_amd_score",            { precision: 5, scale: 2 }),
  avgConfirmationQuality: numeric("avg_confirmation_quality", { precision: 5, scale: 2 }),
  avgRrPlanned:           numeric("avg_rr_planned",           { precision: 6, scale: 2 }),
  avgHoldDuration:        numeric("avg_hold_duration",        { precision: 8, scale: 2 }),

  overallWinRate:   numeric("overall_win_rate",   { precision: 6, scale: 4 }),
  overallPf:        numeric("overall_pf",         { precision: 8, scale: 4 }),
  overallAvgRr:     numeric("overall_avg_rr",     { precision: 6, scale: 2 }),

  // Preference changes vs previous version
  preferenceChanges: jsonb("preference_changes").$type<unknown[]>(),
  changeReason:      text("change_reason"),

  isActive:    boolean("is_active").notNull().default(true),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
}, t => ({
  idxVersion:  index("ti_profiles_version_idx").on(t.version),
  idxStage:    index("ti_profiles_stage_idx").on(t.stage),
  idxActive:   index("ti_profiles_active_idx").on(t.isActive),
  idxCreated:  index("ti_profiles_created_idx").on(t.createdAt),
}));

// ─── Similarity Reports ───────────────────────────────────────────────────────
// One row per evaluated setup — full similarity breakdown.

export const tiSimilarityReportsTable = pgTable("ti_similarity_reports", {
  id:        serial("id").primaryKey(),
  reportId:  text("report_id").notNull().unique(),
  profileId: text("profile_id").notNull(),
  version:   text("version").notNull().default("1.0.0"),
  setupId:   text("setup_id"),

  // Setup snapshot
  pair:       text("pair").notNull().default("EURUSD"),
  session:    text("session").notNull().default("unknown"),
  regime:     text("regime").notNull().default("unknown"),
  trend:      text("trend").notNull().default("unknown"),
  volatility: text("volatility").notNull().default("medium"),
  setupScore: numeric("setup_score", { precision: 5, scale: 2 }),
  tqi:        numeric("tqi",         { precision: 5, scale: 2 }),

  // Similarity component scores (0–100)
  ruleSimilarityScore:       numeric("rule_similarity_score",       { precision: 5, scale: 2 }).notNull(),
  historicalSimilarityScore: numeric("historical_similarity_score", { precision: 5, scale: 2 }).notNull(),
  preferenceAlignmentScore:  numeric("preference_alignment_score",  { precision: 5, scale: 2 }).notNull(),
  identitySimilarityScore:   numeric("identity_similarity_score",   { precision: 5, scale: 2 }).notNull(),

  statisticalConfidence: numeric("statistical_confidence", { precision: 5, scale: 2 }).notNull(),
  historicalSampleSize:  integer("historical_sample_size").notNull().default(0),

  // Consistency verdict
  consistencyLevel:  text("consistency_level").notNull(),   // fully_consistent | mostly_consistent | ...
  consistencyLabel:  text("consistency_label").notNull(),
  consistencyReason: text("consistency_reason"),

  // Matched historical trades
  similarTrades: jsonb("similar_trades").$type<unknown[]>(),

  // Evidence breakdown
  ruleDetails:       jsonb("rule_details").$type<unknown[]>(),
  preferenceDetails: jsonb("preference_details").$type<unknown[]>(),
  identityNarrative: text("identity_narrative").notNull().default(""),

  isAdvisoryOnly: boolean("is_advisory_only").notNull().default(true),
  evaluatedAt:    timestamp("evaluated_at").notNull().defaultNow(),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
}, t => ({
  idxPair:        index("ti_sim_pair_idx").on(t.pair),
  idxProfile:     index("ti_sim_profile_idx").on(t.profileId),
  idxConsistency: index("ti_sim_consistency_idx").on(t.consistencyLevel),
  idxEvaluated:   index("ti_sim_evaluated_idx").on(t.evaluatedAt),
  idxScore:       index("ti_sim_score_idx").on(t.identitySimilarityScore),
}));

// ─── Preference Discoveries ───────────────────────────────────────────────────
// Statistically significant preferences derived from historical trade data.

export const tiPreferenceDiscoveriesTable = pgTable("ti_preference_discoveries", {
  id:           serial("id").primaryKey(),
  discoveryId:  text("discovery_id").notNull().unique(),
  profileId:    text("profile_id").notNull(),

  // What was discovered
  preferenceType:  text("preference_type").notNull(),  // pair | session | regime | volatility | ...
  preferenceValue: text("preference_value").notNull(),
  preferenceLabel: text("preference_label").notNull(),

  // Statistical backing
  sampleSize:    integer("sample_size").notNull(),
  winRate:       numeric("win_rate",       { precision: 6, scale: 4 }).notNull(),
  avgRr:         numeric("avg_rr",         { precision: 6, scale: 2 }).notNull(),
  profitFactor:  numeric("profit_factor",  { precision: 8, scale: 4 }),
  confidence:    numeric("confidence",     { precision: 5, scale: 2 }).notNull(),
  effect:        text("effect").notNull(),             // positive | negative | neutral
  effectSize:    numeric("effect_size",    { precision: 6, scale: 4 }).notNull(),

  // vs baseline
  baselineWinRate: numeric("baseline_win_rate", { precision: 6, scale: 4 }),
  liftVsBaseline:  numeric("lift_vs_baseline",  { precision: 6, scale: 4 }),

  explanation: text("explanation").notNull(),
  isSignificant: boolean("is_significant").notNull().default(false),
  isAdoptedByIdentity: boolean("is_adopted_by_identity").notNull().default(false),

  discoveredAt: timestamp("discovered_at").notNull().defaultNow(),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
}, t => ({
  idxProfile:    index("ti_pref_profile_idx").on(t.profileId),
  idxType:       index("ti_pref_type_idx").on(t.preferenceType),
  idxSignificant:index("ti_pref_significant_idx").on(t.isSignificant),
  idxDiscovered: index("ti_pref_discovered_idx").on(t.discoveredAt),
}));

// ─── Drift Events ─────────────────────────────────────────────────────────────
// Detected changes in trading behavior — statistically verified only.

export const tiDriftEventsTable = pgTable("ti_drift_events", {
  id:        serial("id").primaryKey(),
  eventId:   text("event_id").notNull().unique(),
  profileId: text("profile_id").notNull(),

  driftType:     text("drift_type").notNull(),     // preference_drift | consistency_drift | ...
  driftSeverity: text("drift_severity").notNull(), // low | medium | high | critical
  driftScore:    numeric("drift_score", { precision: 5, scale: 2 }).notNull(),

  // What changed
  dimension:     text("dimension").notNull(),
  previousValue: text("previous_value"),
  currentValue:  text("current_value"),
  changePercent: numeric("change_percent", { precision: 6, scale: 2 }),

  // Statistical evidence
  sampleSizeBefore: integer("sample_size_before").notNull().default(0),
  sampleSizeAfter:  integer("sample_size_after").notNull().default(0),
  pValue:           numeric("p_value",   { precision: 8, scale: 6 }),
  isStatisticallySignificant: boolean("is_statistically_significant").notNull().default(false),

  description: text("description").notNull(),
  detail:      jsonb("detail").$type<unknown>(),

  detectedAt: timestamp("detected_at").notNull().defaultNow(),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
}, t => ({
  idxProfile:   index("ti_drift_profile_idx").on(t.profileId),
  idxType:      index("ti_drift_type_idx").on(t.driftType),
  idxSeverity:  index("ti_drift_severity_idx").on(t.driftSeverity),
  idxDetected:  index("ti_drift_detected_idx").on(t.detectedAt),
}));

// ─── Identity Version History ─────────────────────────────────────────────────
// Lightweight table for timeline and version comparison queries.

export const tiIdentityVersionsTable = pgTable("ti_identity_versions", {
  id:          serial("id").primaryKey(),
  versionId:   text("version_id").notNull().unique(),
  profileId:   text("profile_id").notNull(),
  versionTag:  text("version_tag").notNull(),
  stage:       text("stage").notNull(),
  sampleSize:  integer("sample_size").notNull().default(0),
  confidence:  numeric("confidence", { precision: 5, scale: 2 }).notNull().default("0"),

  // Snapshot of key metrics at this version
  preferredPairs:    jsonb("preferred_pairs").$type<string[]>(),
  preferredSessions: jsonb("preferred_sessions").$type<string[]>(),
  overallWinRate:    numeric("overall_win_rate", { precision: 6, scale: 4 }),
  overallAvgRr:      numeric("overall_avg_rr",   { precision: 6, scale: 2 }),

  event:       text("event").notNull(),   // created | updated | drift_detected | reset
  summary:     text("summary"),

  createdAt:   timestamp("created_at").notNull().defaultNow(),
}, t => ({
  idxProfile:  index("ti_versions_profile_idx").on(t.profileId),
  idxVersion:  index("ti_versions_tag_idx").on(t.versionTag),
  idxCreated:  index("ti_versions_created_idx").on(t.createdAt),
}));

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type TiIdentityProfile      = typeof tiIdentityProfilesTable.$inferSelect;
export type NewTiIdentityProfile   = typeof tiIdentityProfilesTable.$inferInsert;
export type TiSimilarityReport     = typeof tiSimilarityReportsTable.$inferSelect;
export type NewTiSimilarityReport  = typeof tiSimilarityReportsTable.$inferInsert;
export type TiPreferenceDiscovery  = typeof tiPreferenceDiscoveriesTable.$inferSelect;
export type NewTiPreferenceDiscovery = typeof tiPreferenceDiscoveriesTable.$inferInsert;
export type TiDriftEvent           = typeof tiDriftEventsTable.$inferSelect;
export type NewTiDriftEvent        = typeof tiDriftEventsTable.$inferInsert;
export type TiIdentityVersion      = typeof tiIdentityVersionsTable.$inferSelect;
export type NewTiIdentityVersion   = typeof tiIdentityVersionsTable.$inferInsert;
