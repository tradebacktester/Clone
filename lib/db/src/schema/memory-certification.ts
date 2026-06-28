import {
  pgTable, serial, uuid, text, integer, boolean,
  timestamp, numeric, jsonb, index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Memory Validation Runs ────────────────────────────────────────────────
// Tracks every validation run — quick, full, or scheduled.

export const memoryValidationRunsTable = pgTable("memory_validation_runs", {
  id:              serial("id").primaryKey(),
  runId:           uuid("run_id").notNull().defaultRandom(),
  runType:         text("run_type").notNull(),   // 'full' | 'quick' | 'scheduled' | 'triggered'
  triggeredBy:     text("triggered_by").notNull().default("system"), // 'system' | 'user' | 'scheduler'

  // Scores
  healthScore:     integer("health_score"),
  overallHealth:   text("overall_health"),       // 'healthy' | 'degraded' | 'critical'

  // Issue counts
  totalChecks:     integer("total_checks").default(0),
  criticalCount:   integer("critical_count").default(0),
  warningCount:    integer("warning_count").default(0),
  infoCount:       integer("info_count").default(0),
  issuesRepaired:  integer("issues_repaired").default(0),

  status:          text("status").notNull(),     // 'running' | 'completed' | 'failed'
  report:          jsonb("report").$type<Record<string, unknown>>(),
  error:           text("error"),

  startedAt:       timestamp("started_at",    { withTimezone: true }).notNull().defaultNow(),
  completedAt:     timestamp("completed_at",  { withTimezone: true }),
  durationMs:      integer("duration_ms"),
}, (t) => [
  index("mvr_started_at_idx").on(t.startedAt),
  index("mvr_health_score_idx").on(t.healthScore),
  index("mvr_status_idx").on(t.status),
]);

export const insertMemoryValidationRunSchema = createInsertSchema(memoryValidationRunsTable).omit({ id: true });
export type InsertMemoryValidationRun = z.infer<typeof insertMemoryValidationRunSchema>;
export type MemoryValidationRun = typeof memoryValidationRunsTable.$inferSelect;

// ─── Memory Backup Jobs ────────────────────────────────────────────────────
// Metadata for backup jobs — actual data lives in exported JSON (no file system).

export const memoryBackupJobsTable = pgTable("memory_backup_jobs", {
  id:                   serial("id").primaryKey(),
  jobId:                uuid("job_id").notNull().defaultRandom(),
  backupType:           text("backup_type").notNull(),     // 'full' | 'incremental' | 'scheduled'
  triggeredBy:          text("triggered_by").notNull().default("system"),

  status:               text("status").notNull(),           // 'running' | 'completed' | 'failed' | 'verified'
  recordsExported:      integer("records_exported").default(0),
  tablesIncluded:       jsonb("tables_included").$type<string[]>(),
  fileSizeBytes:        integer("file_size_bytes"),
  checksum:             text("checksum"),

  verifiedAt:           timestamp("verified_at",      { withTimezone: true }),
  verificationPassed:   boolean("verification_passed"),
  restorable:           boolean("restorable"),

  // Stats per table
  tableStats:           jsonb("table_stats").$type<Record<string, number>>(),

  error:                text("error"),
  startedAt:            timestamp("started_at",    { withTimezone: true }).notNull().defaultNow(),
  completedAt:          timestamp("completed_at",  { withTimezone: true }),
  durationMs:           integer("duration_ms"),
}, (t) => [
  index("mbj_started_at_idx").on(t.startedAt),
  index("mbj_backup_type_idx").on(t.backupType),
  index("mbj_status_idx").on(t.status),
]);

export const insertMemoryBackupJobSchema = createInsertSchema(memoryBackupJobsTable).omit({ id: true });
export type InsertMemoryBackupJob = z.infer<typeof insertMemoryBackupJobSchema>;
export type MemoryBackupJob = typeof memoryBackupJobsTable.$inferSelect;

// ─── Memory Health Snapshots ───────────────────────────────────────────────
// Time-series health scores captured by the Health Monitor service.

export const memoryHealthSnapshotsTable = pgTable("memory_health_snapshots", {
  id:                serial("id").primaryKey(),

  healthScore:       integer("health_score").notNull(),   // 0–100
  overallHealth:     text("overall_health").notNull(),    // 'healthy' | 'degraded' | 'critical'

  // Component scores (0–100 each)
  integrityScore:    integer("integrity_score"),
  performanceScore:  integer("performance_score"),
  coverageScore:     integer("coverage_score"),
  growthScore:       integer("growth_score"),

  // Database metrics at snapshot time
  totalExperiences:  integer("total_experiences"),
  totalScreenshots:  integer("total_screenshots"),
  totalEvents:       integer("total_events"),
  totalRelationships: integer("total_relationships"),
  totalSetups:       integer("total_setups"),
  totalSnapshots:    integer("total_snapshots"),
  estimatedStorageMb: numeric("estimated_storage_mb", { precision: 10, scale: 2 }),

  // Alert counts
  criticalAlerts:    integer("critical_alerts").default(0),
  warningAlerts:     integer("warning_alerts").default(0),

  // Performance metrics (ms)
  avgQueryMs:        numeric("avg_query_ms", { precision: 8, scale: 2 }),
  p99QueryMs:        numeric("p99_query_ms", { precision: 8, scale: 2 }),
  cacheHitRatio:     numeric("cache_hit_ratio", { precision: 5, scale: 4 }),

  capturedAt:        timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("mhs_captured_at_idx").on(t.capturedAt),
  index("mhs_health_score_idx").on(t.healthScore),
]);

export const insertMemoryHealthSnapshotSchema = createInsertSchema(memoryHealthSnapshotsTable).omit({ id: true });
export type InsertMemoryHealthSnapshot = z.infer<typeof insertMemoryHealthSnapshotSchema>;
export type MemoryHealthSnapshot = typeof memoryHealthSnapshotsTable.$inferSelect;

// ─── Memory Certification Runs ─────────────────────────────────────────────
// Results of production certification checks.

export const memoryCertificationRunsTable = pgTable("memory_certification_runs", {
  id:                    serial("id").primaryKey(),
  certId:                uuid("cert_id").notNull().defaultRandom(),

  // Overall certification
  productionReadyScore:  integer("production_ready_score"),  // 0–100
  certified:             boolean("certified").default(false),
  certificationLevel:    text("certification_level"),        // 'none' | 'development' | 'staging' | 'production'

  // Component pass/fail
  dataConsistency:       boolean("data_consistency"),
  relationshipConsistency: boolean("relationship_consistency"),
  replayAccuracy:        boolean("replay_accuracy"),
  recoveryAccuracy:      boolean("recovery_accuracy"),
  performanceTargets:    boolean("performance_targets"),
  scalabilityCheck:      boolean("scalability_check"),
  reliabilityCheck:      boolean("reliability_check"),

  // Detailed results
  checks:                jsonb("checks").$type<Array<{
    name: string;
    passed: boolean;
    score: number;
    details: string;
    recommendation?: string;
  }>>(),
  strengths:             jsonb("strengths").$type<string[]>(),
  weaknesses:            jsonb("weaknesses").$type<string[]>(),
  risks:                 jsonb("risks").$type<string[]>(),
  recommendations:       jsonb("recommendations").$type<string[]>(),

  status:                text("status").notNull(),  // 'running' | 'completed' | 'failed'
  certifiedAt:           timestamp("certified_at",  { withTimezone: true }),
  startedAt:             timestamp("started_at",    { withTimezone: true }).notNull().defaultNow(),
  durationMs:            integer("duration_ms"),
}, (t) => [
  index("mcr_started_at_idx").on(t.startedAt),
  index("mcr_certified_idx").on(t.certified),
]);

export const insertMemoryCertificationRunSchema = createInsertSchema(memoryCertificationRunsTable).omit({ id: true });
export type InsertMemoryCertificationRun = z.infer<typeof insertMemoryCertificationRunSchema>;
export type MemoryCertificationRun = typeof memoryCertificationRunsTable.$inferSelect;
