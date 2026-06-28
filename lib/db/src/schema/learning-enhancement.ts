// ─── Learning Enhancement DB Schema ──────────────────────────────────────────
// Phase 4 Enhancement: Calibration, Regime Transitions, Versioning, Quality.
// All tables are append-only. Advisory only — never modifies trading behavior.

import {
  pgTable, serial, text, integer, numeric,
  timestamp, jsonb, index, boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Calibration Results ──────────────────────────────────────────────────────
// One row per calibration run. Tracks confidence accuracy over time.

export const calibrationResultsTable = pgTable("calibration_results", {
  id:               serial("id").primaryKey(),
  calibrationId:    text("calibration_id").notNull().unique(),
  evaluationWindow: text("evaluation_window").notNull().default("all"), // 7d|30d|90d|all

  // Core metrics
  totalSamples:     integer("total_samples").notNull().default(0),
  brierScore:       numeric("brier_score",   { precision: 8, scale: 6 }), // 0=perfect,1=worst
  ece:              numeric("ece",           { precision: 8, scale: 6 }), // Expected Calibration Error
  mce:              numeric("mce",           { precision: 8, scale: 6 }), // Maximum Calibration Error
  ace:              numeric("ace",           { precision: 8, scale: 6 }), // Average Calibration Error
  calibrationError: numeric("calibration_error", { precision: 6, scale: 4 }),

  // Overconfidence / underconfidence
  overconfidentBuckets:  integer("overconfident_buckets").notNull().default(0),
  underconfidentBuckets: integer("underconfident_buckets").notNull().default(0),
  wellCalibratedBuckets: integer("well_calibrated_buckets").notNull().default(0),
  overconfidentPct:      numeric("overconfident_pct",  { precision: 5, scale: 2 }),
  underconfidentPct:     numeric("underconfident_pct", { precision: 5, scale: 2 }),

  // Reliability diagram data (10 buckets: 0-10%, ..., 90-100%)
  buckets:          jsonb("buckets").$type<CalibrationBucketRow[]>(),

  // Trend
  calibrationTrend: text("calibration_trend"), // improving|stable|degrading

  // Verdict
  calibrationGrade: text("calibration_grade"), // A|B|C|D|F
  calibrationStatus: text("calibration_status").notNull().default("uncalibrated"), // well_calibrated|overconfident|underconfident|mixed|uncalibrated
  summary:          text("summary"),

  evaluatedAt:      timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("cr_calibration_id_idx").on(t.calibrationId),
  index("cr_window_idx").on(t.evaluationWindow),
  index("cr_evaluated_at_idx").on(t.evaluatedAt),
]);

export interface CalibrationBucketRow {
  bucketLabel: string;   // "0-10%", "10-20%", ...
  confidenceLow: number;
  confidenceHigh: number;
  count: number;
  predictedAvg: number;  // mean confidence in bucket
  actualRate: number;    // actual win rate in bucket
  calibrationError: number; // |predicted - actual|
  status: "overconfident" | "underconfident" | "well_calibrated" | "empty";
}

export const insertCalibrationResultSchema = createInsertSchema(calibrationResultsTable).omit({ id: true, evaluatedAt: true });
export type InsertCalibrationResult = z.infer<typeof insertCalibrationResultSchema>;
export type CalibrationResultRow = typeof calibrationResultsTable.$inferSelect;

// ─── Regime Transitions ───────────────────────────────────────────────────────
// One row per detected regime transition event.

export const regimeTransitionsTable = pgTable("regime_transitions", {
  id:                  serial("id").primaryKey(),
  transitionId:        text("transition_id").notNull().unique(),
  pair:                text("pair").notNull().default("SYSTEM"), // EURUSD|GBPUSD|USDJPY|SYSTEM

  // Transition
  fromRegime:          text("from_regime").notNull(), // trending|ranging|volatile|low_volatility|expansion|compression
  toRegime:            text("to_regime").notNull(),
  transitionType:      text("transition_type").notNull(), // trend_reversal|expansion|compression|volatility_spike|volatility_drop|structural_break

  // Confidence
  transitionConfidence: numeric("transition_confidence", { precision: 5, scale: 2 }), // 0-100
  regimeConfidence:     numeric("regime_confidence",     { precision: 5, scale: 2 }), // confidence in new regime

  // Statistical evidence
  rollingVolatilityBefore: numeric("rolling_volatility_before", { precision: 10, scale: 6 }),
  rollingVolatilityAfter:  numeric("rolling_volatility_after",  { precision: 10, scale: 6 }),
  atrBefore:           numeric("atr_before",  { precision: 10, scale: 6 }),
  atrAfter:            numeric("atr_after",   { precision: 10, scale: 6 }),
  atrChangePct:        numeric("atr_change_pct", { precision: 8, scale: 4 }),
  hurstBefore:         numeric("hurst_before", { precision: 6, scale: 4 }), // <0.5=mean-revert, >0.5=trending
  hurstAfter:          numeric("hurst_after",  { precision: 6, scale: 4 }),
  adxBefore:           numeric("adx_before",  { precision: 6, scale: 4 }),
  adxAfter:            numeric("adx_after",   { precision: 6, scale: 4 }),
  cusumscore:          numeric("cusum_score", { precision: 10, scale: 6 }), // CUSUM change-point score

  // Duration context
  previousRegimeDurationDays: numeric("previous_regime_duration_days", { precision: 8, scale: 2 }),

  // Evidence narrative
  evidence:            jsonb("evidence").$type<string[]>(),
  description:         text("description").notNull(),
  recommendation:      text("recommendation").notNull(),

  // Resolution
  confirmed:           boolean("confirmed").notNull().default(false), // confirmed after 5+ candles
  falsePositive:       boolean("false_positive").notNull().default(false),

  detectedAt:          timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt:         timestamp("confirmed_at", { withTimezone: true }),
}, (t) => [
  index("rt_transition_id_idx").on(t.transitionId),
  index("rt_pair_idx").on(t.pair),
  index("rt_from_regime_idx").on(t.fromRegime),
  index("rt_to_regime_idx").on(t.toRegime),
  index("rt_detected_at_idx").on(t.detectedAt),
  index("rt_confirmed_idx").on(t.confirmed),
]);

export const insertRegimeTransitionSchema = createInsertSchema(regimeTransitionsTable).omit({ id: true, detectedAt: true });
export type InsertRegimeTransition = z.infer<typeof insertRegimeTransitionSchema>;
export type RegimeTransitionRow = typeof regimeTransitionsTable.$inferSelect;

// ─── Learning Versions ────────────────────────────────────────────────────────
// Semantic versioning for every learning cycle.

export const learningVersionsTable = pgTable("learning_versions", {
  id:               serial("id").primaryKey(),
  versionId:        text("version_id").notNull().unique(),
  semver:           text("semver").notNull(),             // e.g. "v1.2.3"
  major:            integer("major").notNull().default(1),
  minor:            integer("minor").notNull().default(0),
  patch:            integer("patch").notNull().default(0),

  // Linked cycle
  cycleId:          text("cycle_id"),
  cycleNumber:      integer("cycle_number").notNull().default(0),
  scheduleType:     text("schedule_type"),               // daily|weekly|monthly|manual

  // Data range covered
  dataFromDate:     timestamp("data_from_date", { withTimezone: true }),
  dataToDate:       timestamp("data_to_date", { withTimezone: true }),
  tradeCount:       integer("trade_count").notNull().default(0),
  featureCount:     integer("feature_count").notNull().default(0),

  // Performance snapshot
  winRate:          numeric("win_rate",          { precision: 6, scale: 4 }),
  avgConfidence:    numeric("avg_confidence",    { precision: 5, scale: 2 }),
  avgTqi:           numeric("avg_tqi",           { precision: 5, scale: 2 }),
  avgSetupScore:    numeric("avg_setup_score",   { precision: 5, scale: 2 }),
  profitFactor:     numeric("profit_factor",     { precision: 8, scale: 4 }),
  totalPnl:         numeric("total_pnl",         { precision: 12, scale: 4 }),

  // Validation snapshot
  validationStatus: text("validation_status"),   // passed|degraded|failed
  validationScore:  numeric("validation_score",  { precision: 5, scale: 2 }),

  // Health snapshot
  healthScore:      numeric("health_score",      { precision: 5, scale: 2 }),
  healthGrade:      text("health_grade"),        // A|B|C|D|F

  // Top features and patterns (serialized for comparison)
  topFeatureRankings:  jsonb("top_feature_rankings").$type<VersionFeatureRanking[]>(),
  topPatternRankings:  jsonb("top_pattern_rankings").$type<VersionPatternRanking[]>(),
  regimeDistribution:  jsonb("regime_distribution").$type<Record<string, number>>(),

  // Change summary from previous version
  changeFromPrev:   jsonb("change_from_prev").$type<VersionChange | null>(),

  // Changelog notes
  changelogNotes:   text("changelog_notes"),
  versionTag:       text("version_tag"),          // e.g. "stable", "experimental", "baseline"

  // Status
  isActive:         boolean("is_active").notNull().default(false),  // the current "live" version
  isBaseline:       boolean("is_baseline").notNull().default(false), // reference version for comparison

  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("lv_version_id_idx").on(t.versionId),
  index("lv_semver_idx").on(t.semver),
  index("lv_cycle_id_idx").on(t.cycleId),
  index("lv_is_active_idx").on(t.isActive),
  index("lv_created_at_idx").on(t.createdAt),
]);

export interface VersionFeatureRanking {
  feature: string;
  importance: number;
  rank: number;
}

export interface VersionPatternRanking {
  pattern: string;
  winRate: number;
  sampleSize: number;
  rank: number;
}

export interface VersionChange {
  winRateDelta: number;
  confidenceDelta: number;
  healthScoreDelta: number;
  validationStatusChange: string;  // e.g. "failed → passed"
  newPatternsAdded: number;
  patternsDegraded: number;
  majorChanges: string[];
  breakingChanges: boolean;
}

export const insertLearningVersionSchema = createInsertSchema(learningVersionsTable).omit({ id: true, createdAt: true });
export type InsertLearningVersion = z.infer<typeof insertLearningVersionSchema>;
export type LearningVersionRow = typeof learningVersionsTable.$inferSelect;

// ─── Learning Quality Snapshots ───────────────────────────────────────────────
// Continuous quality monitoring snapshots.

export const learningQualitySnapshotsTable = pgTable("learning_quality_snapshots", {
  id:               serial("id").primaryKey(),
  snapshotId:       text("snapshot_id").notNull().unique(),
  triggeredBy:      text("triggered_by").notNull().default("auto"),

  // Composite quality score (0–100)
  qualityScore:     numeric("quality_score",    { precision: 5, scale: 2 }).notNull(),
  qualityGrade:     text("quality_grade").notNull(), // A|B|C|D|F

  // Dimension scores (0–100 each)
  dataCompletenessScore:     numeric("data_completeness_score",     { precision: 5, scale: 2 }),
  sampleSizeScore:           numeric("sample_size_score",           { precision: 5, scale: 2 }),
  confidenceStabilityScore:  numeric("confidence_stability_score",  { precision: 5, scale: 2 }),
  patternStabilityScore:     numeric("pattern_stability_score",     { precision: 5, scale: 2 }),
  recommendationStabilityScore: numeric("recommendation_stability_score", { precision: 5, scale: 2 }),
  calibrationScore:          numeric("calibration_score",           { precision: 5, scale: 2 }),
  driftScore:                numeric("drift_score",                 { precision: 5, scale: 2 }),
  validationSuccessScore:    numeric("validation_success_score",    { precision: 5, scale: 2 }),

  // Raw counts
  totalTrades:         integer("total_trades").notNull().default(0),
  tradesWithContext:   integer("trades_with_context").notNull().default(0),
  tradesWithScreenshot: integer("trades_with_screenshot").notNull().default(0),
  duplicateRecords:    integer("duplicate_records").notNull().default(0),
  missingOutcomes:     integer("missing_outcomes").notNull().default(0),
  missingFeatures:     integer("missing_features").notNull().default(0),

  // Alert counts
  activeAlerts:        integer("active_alerts").notNull().default(0),
  criticalAlerts:      integer("critical_alerts").notNull().default(0),

  // Narrative
  strengths:           jsonb("strengths").$type<string[]>(),
  weaknesses:          jsonb("weaknesses").$type<string[]>(),
  recommendations:     jsonb("recommendations").$type<string[]>(),

  snapshotAt:          timestamp("snapshot_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("lqs_snapshot_id_idx").on(t.snapshotId),
  index("lqs_snapshot_at_idx").on(t.snapshotAt),
  index("lqs_quality_score_idx").on(t.qualityScore),
]);

export const insertLearningQualitySnapshotSchema = createInsertSchema(learningQualitySnapshotsTable).omit({ id: true, snapshotAt: true });
export type InsertLearningQualitySnapshot = z.infer<typeof insertLearningQualitySnapshotSchema>;
export type LearningQualitySnapshotRow = typeof learningQualitySnapshotsTable.$inferSelect;

// ─── Quality Alerts ───────────────────────────────────────────────────────────
// Operator alerts generated by the quality monitor. ADVISORY ONLY.

export const qualityAlertsTable = pgTable("quality_alerts", {
  id:           serial("id").primaryKey(),
  alertId:      text("alert_id").notNull().unique(),
  alertType:    text("alert_type").notNull(), // low_sample|confidence_decline|poor_calibration|missing_data|excessive_uncertainty|significant_drift|duplicate_data|validation_failure
  severity:     text("severity").notNull().default("medium"), // low|medium|high|critical
  dimension:    text("dimension"),           // which quality dimension triggered this

  // Context
  value:        numeric("value",     { precision: 10, scale: 4 }),
  threshold:    numeric("threshold", { precision: 10, scale: 4 }),
  delta:        numeric("delta",     { precision: 10, scale: 4 }),

  // Narrative
  title:        text("title").notNull(),
  description:  text("description").notNull(),
  recommendation: text("recommendation").notNull(),
  affectedEntity: text("affected_entity"),

  // Resolution
  resolved:     boolean("resolved").notNull().default(false),
  resolvedAt:   timestamp("resolved_at", { withTimezone: true }),
  resolvedNote: text("resolved_note"),
  autoResolved: boolean("auto_resolved").notNull().default(false),

  detectedAt:   timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("qa_alert_id_idx").on(t.alertId),
  index("qa_alert_type_idx").on(t.alertType),
  index("qa_severity_idx").on(t.severity),
  index("qa_resolved_idx").on(t.resolved),
  index("qa_detected_at_idx").on(t.detectedAt),
]);

export const insertQualityAlertSchema = createInsertSchema(qualityAlertsTable).omit({ id: true, detectedAt: true });
export type InsertQualityAlert = z.infer<typeof insertQualityAlertSchema>;
export type QualityAlertRow = typeof qualityAlertsTable.$inferSelect;
