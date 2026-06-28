// ─── Learning Validation DB Schema ───────────────────────────────────────────
// Phase 3: Validation, drift, scheduling, recommendation accuracy, health.
// All tables are append-only — never overwrites previous records.

import {
  pgTable, serial, text, integer, numeric,
  timestamp, jsonb, index, boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Learning Validation Results ─────────────────────────────────────────────
// One row per validation run. Linked to a learning cycle by cycleId.

export const learningValidationResultsTable = pgTable("learning_validation_results", {
  id:                    serial("id").primaryKey(),
  validationId:          text("validation_id").notNull().unique(),
  cycleId:               text("cycle_id"),                          // optional FK to learning_cycles
  triggeredBy:           text("triggered_by").notNull().default("manual"),

  // Statistical significance
  sampleSize:            integer("sample_size").notNull().default(0),
  minSampleMet:          boolean("min_sample_met").notNull().default(false),
  minSampleRequired:     integer("min_sample_required").notNull().default(30),

  // Win rate stats
  observedWinRate:       numeric("observed_win_rate",   { precision: 6, scale: 4 }),
  ci95Lower:             numeric("ci95_lower",           { precision: 6, scale: 4 }),
  ci95Upper:             numeric("ci95_upper",           { precision: 6, scale: 4 }),
  wilsonLowerBound:      numeric("wilson_lower_bound",   { precision: 6, scale: 4 }),
  zScore:                numeric("z_score",              { precision: 8, scale: 4 }),
  pValue:                numeric("p_value",              { precision: 8, scale: 6 }),
  statisticallySignificant: boolean("statistically_significant").notNull().default(false),

  // Stability
  stabilityScore:        numeric("stability_score",     { precision: 5, scale: 2 }),
  stabilityGrade:        text("stability_grade"),                   // A|B|C|D|F
  windowConsistency:     numeric("window_consistency",  { precision: 5, scale: 2 }),

  // Data quality
  dataQualityScore:      numeric("data_quality_score",  { precision: 5, scale: 2 }),
  completenessScore:     numeric("completeness_score",  { precision: 5, scale: 2 }),
  missingDataPct:        numeric("missing_data_pct",    { precision: 5, scale: 2 }),
  conflictingEvidence:   boolean("conflicting_evidence").notNull().default(false),

  // Reproducibility
  reproducibilityScore:  numeric("reproducibility_score", { precision: 5, scale: 2 }),
  cycleVariance:         numeric("cycle_variance",      { precision: 8, scale: 6 }),

  // Outlier influence
  outlierCount:          integer("outlier_count").notNull().default(0),
  outlierInfluence:      numeric("outlier_influence",   { precision: 5, scale: 2 }),
  jackknifeDelta:        numeric("jackknife_delta",     { precision: 6, scale: 4 }),

  // Overall verdict
  overallStatus:         text("overall_status").notNull().default("pending"),  // passed|degraded|failed
  overallScore:          numeric("overall_score",       { precision: 5, scale: 2 }),
  passedChecks:          integer("passed_checks").notNull().default(0),
  totalChecks:           integer("total_checks").notNull().default(0),
  issues:                jsonb("issues").$type<{ check: string; severity: string; message: string }[]>(),
  recommendations:       jsonb("recommendations").$type<string[]>(),

  createdAt:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("lvr_validation_id_idx").on(t.validationId),
  index("lvr_cycle_id_idx").on(t.cycleId),
  index("lvr_status_idx").on(t.overallStatus),
  index("lvr_created_at_idx").on(t.createdAt),
]);

export const insertLearningValidationResultSchema = createInsertSchema(learningValidationResultsTable).omit({ id: true, createdAt: true });
export type InsertLearningValidationResult = z.infer<typeof insertLearningValidationResultSchema>;
export type LearningValidationResultRow = typeof learningValidationResultsTable.$inferSelect;

// ─── Learning Drift Events ────────────────────────────────────────────────────
// One row per detected drift event. Append-only alert log.

export const learningDriftEventsTable = pgTable("learning_drift_events", {
  id:                serial("id").primaryKey(),
  driftId:           text("drift_id").notNull().unique(),
  driftType:         text("drift_type").notNull(),            // win_rate|regime|pattern|confidence|volatility|correlation
  severity:          text("severity").notNull().default("low"),  // low|medium|high|critical
  affectedEntity:    text("affected_entity"),                 // pattern id, pair, or "system"
  affectedWindow:    text("affected_window"),                 // 7d|30d|90d|all

  // Metrics at detection time
  baselineValue:     numeric("baseline_value",  { precision: 10, scale: 4 }),
  currentValue:      numeric("current_value",   { precision: 10, scale: 4 }),
  deltaAbsolute:     numeric("delta_absolute",  { precision: 10, scale: 4 }),
  deltaPct:          numeric("delta_pct",       { precision: 8, scale: 2 }),
  threshold:         numeric("threshold",       { precision: 10, scale: 4 }),

  // Statistical backing
  zScore:            numeric("z_score",         { precision: 8, scale: 4 }),
  pValue:            numeric("p_value",         { precision: 8, scale: 6 }),
  isSignificant:     boolean("is_significant").notNull().default(false),

  // Narrative
  description:       text("description").notNull(),
  recommendation:    text("recommendation").notNull(),

  // Resolution
  resolved:          boolean("resolved").notNull().default(false),
  resolvedAt:        timestamp("resolved_at", { withTimezone: true }),
  resolvedNote:      text("resolved_note"),

  detectedAt:        timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("lde_drift_id_idx").on(t.driftId),
  index("lde_drift_type_idx").on(t.driftType),
  index("lde_severity_idx").on(t.severity),
  index("lde_resolved_idx").on(t.resolved),
  index("lde_detected_at_idx").on(t.detectedAt),
]);

export const insertLearningDriftEventSchema = createInsertSchema(learningDriftEventsTable).omit({ id: true, detectedAt: true });
export type InsertLearningDriftEvent = z.infer<typeof insertLearningDriftEventSchema>;
export type LearningDriftEventRow = typeof learningDriftEventsTable.$inferSelect;

// ─── Learning Scheduler Log ───────────────────────────────────────────────────
// Records every scheduled learning cycle trigger.

export const learningSchedulerLogTable = pgTable("learning_scheduler_log", {
  id:              serial("id").primaryKey(),
  runId:           text("run_id").notNull().unique(),
  scheduleType:    text("schedule_type").notNull(),   // daily|weekly|monthly|manual
  status:          text("status").notNull().default("pending"),  // pending|running|complete|failed
  cycleId:         text("cycle_id"),                  // FK to learning_cycles once run
  validationId:    text("validation_id"),             // FK to learning_validation_results

  // Coverage
  fromDate:        timestamp("from_date", { withTimezone: true }),
  toDate:          timestamp("to_date", { withTimezone: true }),
  tradesCollected: integer("trades_collected").notNull().default(0),

  // Results summary
  pipelineStatus:  text("pipeline_status"),
  validationStatus: text("validation_status"),
  driftEventsFound: integer("drift_events_found").notNull().default(0),
  healthScoreAfter: numeric("health_score_after", { precision: 5, scale: 2 }),
  errorMessage:    text("error_message"),
  durationMs:      integer("duration_ms"),

  scheduledFor:    timestamp("scheduled_for", { withTimezone: true }),
  startedAt:       timestamp("started_at", { withTimezone: true }),
  completedAt:     timestamp("completed_at", { withTimezone: true }),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("lsl_run_id_idx").on(t.runId),
  index("lsl_schedule_type_idx").on(t.scheduleType),
  index("lsl_status_idx").on(t.status),
  index("lsl_created_at_idx").on(t.createdAt),
]);

export const insertLearningSchedulerLogSchema = createInsertSchema(learningSchedulerLogTable).omit({ id: true, createdAt: true });
export type InsertLearningSchedulerLog = z.infer<typeof insertLearningSchedulerLogSchema>;
export type LearningSchedulerLogRow = typeof learningSchedulerLogTable.$inferSelect;

// ─── Recommendation Accuracy Log ──────────────────────────────────────────────
// Tracks how accurate the advisory recommendations proved to be.

export const recommendationAccuracyLogTable = pgTable("recommendation_accuracy_log", {
  id:                 serial("id").primaryKey(),
  evaluationId:       text("evaluation_id").notNull().unique(),
  evaluationWindow:   text("evaluation_window").notNull(), // 7d|30d|90d|all

  // Volume
  totalRecommendations: integer("total_recommendations").notNull().default(0),
  evaluated:          integer("evaluated").notNull().default(0),     // had outcomes

  // Directional accuracy
  truePositives:      integer("true_positives").notNull().default(0),
  falsePositives:     integer("false_positives").notNull().default(0),
  trueNegatives:      integer("true_negatives").notNull().default(0),
  falseNegatives:     integer("false_negatives").notNull().default(0),

  // Derived metrics
  precision:          numeric("precision",   { precision: 6, scale: 4 }),
  recall:             numeric("recall",      { precision: 6, scale: 4 }),
  f1Score:            numeric("f1_score",    { precision: 6, scale: 4 }),
  accuracy:           numeric("accuracy",    { precision: 6, scale: 4 }),
  brierScore:         numeric("brier_score", { precision: 8, scale: 6 }),  // calibration (lower = better)

  // TIS accuracy (Trade Intelligence Score)
  tisCorrelation:     numeric("tis_correlation",  { precision: 6, scale: 4 }),
  tisMae:             numeric("tis_mae",           { precision: 6, scale: 4 }),  // mean absolute error
  tisBias:            numeric("tis_bias",          { precision: 6, scale: 4 }),  // systematic over/underestimation

  // Confidence calibration
  calibrationError:   numeric("calibration_error", { precision: 6, scale: 4 }),
  overconfidentPct:   numeric("overconfident_pct", { precision: 5, scale: 2 }),
  underconfidentPct:  numeric("underconfident_pct",{ precision: 5, scale: 2 }),

  // Historical payload for trend charts
  bucketBreakdown:    jsonb("bucket_breakdown").$type<Record<string, unknown>[]>(),

  evaluatedAt:        timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ral_evaluation_id_idx").on(t.evaluationId),
  index("ral_window_idx").on(t.evaluationWindow),
  index("ral_evaluated_at_idx").on(t.evaluatedAt),
]);

export const insertRecommendationAccuracyLogSchema = createInsertSchema(recommendationAccuracyLogTable).omit({ id: true, evaluatedAt: true });
export type InsertRecommendationAccuracyLog = z.infer<typeof insertRecommendationAccuracyLogSchema>;
export type RecommendationAccuracyLogRow = typeof recommendationAccuracyLogTable.$inferSelect;

// ─── Learning Health Snapshots ────────────────────────────────────────────────
// Point-in-time health score snapshots for trend visualization.

export const learningHealthSnapshotsTable = pgTable("learning_health_snapshots", {
  id:                     serial("id").primaryKey(),
  snapshotId:             text("snapshot_id").notNull().unique(),
  triggeredBy:            text("triggered_by").notNull().default("scheduler"),

  // Composite score (0–100)
  overallScore:           numeric("overall_score",            { precision: 5, scale: 2 }).notNull(),
  grade:                  text("grade").notNull(),            // A|B|C|D|F
  certificationStatus:    text("certification_status").notNull(), // certified|conditional|not_ready

  // Component scores (0–100 each)
  dataQualityScore:       numeric("data_quality_score",       { precision: 5, scale: 2 }),
  evidenceVolumeScore:    numeric("evidence_volume_score",    { precision: 5, scale: 2 }),
  confidenceStabilityScore: numeric("confidence_stability_score", { precision: 5, scale: 2 }),
  patternReliabilityScore:  numeric("pattern_reliability_score",  { precision: 5, scale: 2 }),
  validationSuccessScore: numeric("validation_success_score", { precision: 5, scale: 2 }),
  driftStatusScore:       numeric("drift_status_score",       { precision: 5, scale: 2 }),
  recommendationAccScore: numeric("recommendation_acc_score", { precision: 5, scale: 2 }),

  // Supporting counts
  totalCycles:            integer("total_cycles").notNull().default(0),
  passedCycles:           integer("passed_cycles").notNull().default(0),
  activeDriftAlerts:      integer("active_drift_alerts").notNull().default(0),
  criticalDriftAlerts:    integer("critical_drift_alerts").notNull().default(0),
  totalPatterns:          integer("total_patterns").notNull().default(0),
  reliablePatterns:       integer("reliable_patterns").notNull().default(0),
  totalFeatures:          integer("total_features").notNull().default(0),

  // Narrative
  strengths:              jsonb("strengths").$type<string[]>(),
  weaknesses:             jsonb("weaknesses").$type<string[]>(),
  recommendations:        jsonb("recommendations").$type<string[]>(),

  snapshotAt:             timestamp("snapshot_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("lhs_snapshot_id_idx").on(t.snapshotId),
  index("lhs_snapshot_at_idx").on(t.snapshotAt),
  index("lhs_overall_score_idx").on(t.overallScore),
]);

export const insertLearningHealthSnapshotSchema = createInsertSchema(learningHealthSnapshotsTable).omit({ id: true, snapshotAt: true });
export type InsertLearningHealthSnapshot = z.infer<typeof insertLearningHealthSnapshotSchema>;
export type LearningHealthSnapshotRow = typeof learningHealthSnapshotsTable.$inferSelect;
