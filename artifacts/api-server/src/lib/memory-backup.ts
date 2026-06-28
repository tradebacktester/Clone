/**
 * Memory Backup & Recovery Engine
 *
 * Provides full and incremental backup of all memory tables.
 * Backup data is structured JSON — no file-system dependency.
 * Integrity verified via SHA-256 checksum of the export payload.
 *
 * Supports:
 *   - Full backup (all records across all memory tables)
 *   - Incremental backup (records since last backup)
 *   - Integrity verification (checksum + record count match)
 *   - Restore testing (dry-run without committing)
 *   - Relationship / timeline / screenshot preservation
 */

import { db } from "@workspace/db";
import {
  memoryExperiencesTable,
  memoryRelationshipsTable,
  memoryRelationshipHistoryTable,
  tradeEventsTable,
  tradeScreenshotsTable,
  tradeContextTable,
  contextTimelineEventsTable,
  setupMemoryTable,
  skippedSetupMemoryTable,
  marketSnapshotMemoryTable,
  memoryMetadataTable,
  tradeReviewsTable,
  memoryBackupJobsTable,
} from "@workspace/db";
import { desc, gte, sql, eq } from "drizzle-orm";
import { createHash } from "crypto";
import { logger } from "./logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BackupManifest {
  backupId:       string;
  backupType:     "full" | "incremental";
  triggeredBy:    string;
  createdAt:      string;
  sinceDate?:     string;       // for incremental
  checksum:       string;       // SHA-256 of all data
  recordCounts:   Record<string, number>;
  totalRecords:   number;
  estimatedSizeBytes: number;
  tables:         string[];
  version:        string;       // backup format version
}

export interface BackupPayload {
  manifest:             BackupManifest;
  experiences:          unknown[];
  relationships:        unknown[];
  relationshipHistory:  unknown[];
  tradeEvents:          unknown[];
  screenshots:          unknown[];   // imageData excluded by default
  contexts:             unknown[];
  timelineEvents:       unknown[];
  setups:               unknown[];
  skippedSetups:        unknown[];
  snapshots:            unknown[];
  metadata:             unknown[];
  reviews:              unknown[];
}

export interface BackupResult {
  jobId:          string;
  backupType:     "full" | "incremental";
  status:         "completed" | "failed";
  recordsExported: number;
  tableStats:     Record<string, number>;
  checksum:       string;
  estimatedSizeBytes: number;
  durationMs:     number;
  error?:         string;
  payload:        BackupPayload | null;
}

export interface VerificationResult {
  passed:        boolean;
  recordCounts:  Record<string, number>;
  checksumMatch: boolean;
  missing:       string[];
  extra:         string[];
  details:       string;
}

export interface RestoreTestResult {
  wouldRestore:    boolean;
  tables:          string[];
  recordCounts:    Record<string, number>;
  relationshipsOk: boolean;
  timelinesOk:     boolean;
  screenshotsOk:   boolean;
  issues:          string[];
  recommendation:  string;
}

// ─── Checksum ─────────────────────────────────────────────────────────────────

function computeChecksum(data: unknown): string {
  const str = JSON.stringify(data, Object.keys(data as object).sort());
  return createHash("sha256").update(str).digest("hex");
}

// ─── Full Backup ──────────────────────────────────────────────────────────────

export async function runFullBackup(opts: {
  triggeredBy?: string;
  includeImages?: boolean;
} = {}): Promise<BackupResult> {
  const startedAt  = Date.now();
  const triggeredBy = opts.triggeredBy ?? "system";
  const includeImages = opts.includeImages ?? false;

  logger.info({ triggeredBy }, "[MB] Starting full memory backup");

  // Insert job record
  const [job] = await db
    .insert(memoryBackupJobsTable)
    .values({
      backupType:  "full",
      triggeredBy,
      status:      "running",
      tablesIncluded: [
        "memory_experiences", "memory_relationships", "memory_relationship_history",
        "trade_events", "trade_screenshots", "trade_context", "context_timeline_events",
        "setup_memory", "skipped_setup_memory", "market_snapshot_memory",
        "memory_metadata", "trade_reviews",
      ],
    })
    .returning();

  try {
    // Fetch all tables in parallel
    const [
      experiences,
      relationships,
      relHistory,
      events,
      screenshots,
      contexts,
      timelineEvents,
      setups,
      skipped,
      snapshots,
      meta,
      reviews,
    ] = await Promise.all([
      db.select().from(memoryExperiencesTable),
      db.select().from(memoryRelationshipsTable),
      db.select().from(memoryRelationshipHistoryTable).limit(10000),
      db.select().from(tradeEventsTable),
      db.select({
        id: tradeScreenshotsTable.id,
        tradeId: tradeScreenshotsTable.tradeId,
        setupId: tradeScreenshotsTable.setupId,
        stage: tradeScreenshotsTable.stage,
        timeframe: tradeScreenshotsTable.timeframe,
        pair: tradeScreenshotsTable.pair,
        fileHash: tradeScreenshotsTable.fileHash,
        notes: tradeScreenshotsTable.notes,
        tags: tradeScreenshotsTable.tags,
        sizeBytes: tradeScreenshotsTable.sizeBytes,
        uploadedAt: tradeScreenshotsTable.uploadedAt,
        capturedAt: tradeScreenshotsTable.capturedAt,
        // Exclude imageData and thumbnailData by default for size
        ...(includeImages ? {
          imageData: tradeScreenshotsTable.imageData,
          thumbnailData: tradeScreenshotsTable.thumbnailData,
        } : {}),
      }).from(tradeScreenshotsTable),
      db.select().from(tradeContextTable),
      db.execute(sql`SELECT * FROM context_timeline_events`).then(r => r.rows),
      db.select().from(setupMemoryTable),
      db.select().from(skippedSetupMemoryTable),
      db.select().from(marketSnapshotMemoryTable),
      db.select().from(memoryMetadataTable),
      db.select().from(tradeReviewsTable),
    ]);

    const tableStats: Record<string, number> = {
      memory_experiences:         experiences.length,
      memory_relationships:       relationships.length,
      memory_relationship_history: relHistory.length,
      trade_events:               events.length,
      trade_screenshots:          screenshots.length,
      trade_context:              contexts.length,
      context_timeline_events:    (timelineEvents as unknown[]).length,
      setup_memory:               setups.length,
      skipped_setup_memory:       skipped.length,
      market_snapshot_memory:     snapshots.length,
      memory_metadata:            meta.length,
      trade_reviews:              reviews.length,
    };

    const totalRecords = Object.values(tableStats).reduce((s, n) => s + n, 0);
    const backupId     = crypto.randomUUID();

    const payload: Omit<BackupPayload, "manifest"> & { manifest?: BackupManifest } = {
      experiences,
      relationships,
      relationshipHistory: relHistory,
      tradeEvents:         events,
      screenshots,
      contexts,
      timelineEvents:      timelineEvents as unknown[],
      setups,
      skippedSetups:       skipped,
      snapshots,
      metadata:            meta,
      reviews,
    };

    const checksum = computeChecksum(payload);

    const manifest: BackupManifest = {
      backupId,
      backupType:  "full",
      triggeredBy,
      createdAt:   new Date().toISOString(),
      checksum,
      recordCounts: tableStats,
      totalRecords,
      estimatedSizeBytes: JSON.stringify(payload).length,
      tables: Object.keys(tableStats),
      version: "2.0",
    };

    payload.manifest = manifest;
    const fullPayload = payload as BackupPayload;

    const durationMs = Date.now() - startedAt;
    const fileSizeBytes = manifest.estimatedSizeBytes;

    // Update job record
    await db.update(memoryBackupJobsTable).set({
      status:          "completed",
      recordsExported: totalRecords,
      tableStats,
      fileSizeBytes,
      checksum,
      completedAt:     new Date(),
      durationMs,
    }).where(eq(memoryBackupJobsTable.id, job!.id));

    logger.info({ backupId, totalRecords, durationMs, fileSizeBytes }, "[MB] Full backup complete");

    return {
      jobId:         job!.jobId,
      backupType:    "full",
      status:        "completed",
      recordsExported: totalRecords,
      tableStats,
      checksum,
      estimatedSizeBytes: fileSizeBytes,
      durationMs,
      payload:       fullPayload,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    await db.update(memoryBackupJobsTable).set({
      status:      "failed",
      error:       String(err),
      completedAt: new Date(),
      durationMs,
    }).where(eq(memoryBackupJobsTable.id, job!.id));

    logger.error({ err }, "[MB] Full backup failed");

    return {
      jobId:           job!.jobId,
      backupType:      "full",
      status:          "failed",
      recordsExported: 0,
      tableStats:      {},
      checksum:        "",
      estimatedSizeBytes: 0,
      durationMs,
      error:           String(err),
      payload:         null,
    };
  }
}

// ─── Incremental Backup ───────────────────────────────────────────────────────

export async function runIncrementalBackup(sinceDate: Date, opts: {
  triggeredBy?: string;
} = {}): Promise<BackupResult> {
  const startedAt   = Date.now();
  const triggeredBy = opts.triggeredBy ?? "system";

  logger.info({ triggeredBy, sinceDate }, "[MB] Starting incremental backup");

  const [job] = await db
    .insert(memoryBackupJobsTable)
    .values({
      backupType:  "incremental",
      triggeredBy,
      status:      "running",
    })
    .returning();

  try {
    const [
      experiences,
      relationships,
      events,
      screenshots,
      contexts,
      setups,
    ] = await Promise.all([
      db.select().from(memoryExperiencesTable).where(gte(memoryExperiencesTable.createdAt, sinceDate)),
      db.select().from(memoryRelationshipsTable).where(gte(memoryRelationshipsTable.createdAt, sinceDate)),
      db.select().from(tradeEventsTable).where(gte(tradeEventsTable.occurredAt, sinceDate)),
      db.select({ id: tradeScreenshotsTable.id, tradeId: tradeScreenshotsTable.tradeId, stage: tradeScreenshotsTable.stage, fileHash: tradeScreenshotsTable.fileHash, uploadedAt: tradeScreenshotsTable.uploadedAt }).from(tradeScreenshotsTable).where(gte(tradeScreenshotsTable.uploadedAt, sinceDate)),
      db.select().from(tradeContextTable).where(gte(tradeContextTable.createdAt, sinceDate)),
      db.select().from(setupMemoryTable).where(gte(setupMemoryTable.createdAt, sinceDate)),
    ]);

    const tableStats: Record<string, number> = {
      memory_experiences:   experiences.length,
      memory_relationships: relationships.length,
      trade_events:         events.length,
      trade_screenshots:    screenshots.length,
      trade_context:        contexts.length,
      setup_memory:         setups.length,
    };

    const totalRecords = Object.values(tableStats).reduce((s, n) => s + n, 0);
    const backupId     = crypto.randomUUID();

    const payload = {
      experiences,
      relationships,
      tradeEvents:  events,
      screenshots,
      contexts,
      setups,
    };

    const checksum = computeChecksum(payload);

    const manifest: BackupManifest = {
      backupId,
      backupType:  "incremental",
      triggeredBy,
      createdAt:   new Date().toISOString(),
      sinceDate:   sinceDate.toISOString(),
      checksum,
      recordCounts: tableStats,
      totalRecords,
      estimatedSizeBytes: JSON.stringify(payload).length,
      tables: Object.keys(tableStats),
      version: "2.0",
    };

    const durationMs = Date.now() - startedAt;
    const fileSizeBytes = manifest.estimatedSizeBytes;

    await db.update(memoryBackupJobsTable).set({
      status:          "completed",
      recordsExported: totalRecords,
      tableStats,
      fileSizeBytes,
      checksum,
      completedAt:     new Date(),
      durationMs,
    }).where(eq(memoryBackupJobsTable.id, job!.id));

    logger.info({ backupId, totalRecords, durationMs }, "[MB] Incremental backup complete");

    return {
      jobId:           job!.jobId,
      backupType:      "incremental",
      status:          "completed",
      recordsExported: totalRecords,
      tableStats,
      checksum,
      estimatedSizeBytes: fileSizeBytes,
      durationMs,
      payload:         { manifest, ...payload } as unknown as BackupPayload,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    await db.update(memoryBackupJobsTable).set({
      status: "failed", error: String(err), completedAt: new Date(), durationMs,
    }).where(eq(memoryBackupJobsTable.id, job!.id));

    return {
      jobId: job!.jobId, backupType: "incremental", status: "failed",
      recordsExported: 0, tableStats: {}, checksum: "", estimatedSizeBytes: 0,
      durationMs, error: String(err), payload: null,
    };
  }
}

// ─── Verify Backup Integrity ──────────────────────────────────────────────────

export async function verifyBackup(payload: BackupPayload): Promise<VerificationResult> {
  const { manifest } = payload;
  if (!manifest) {
    return { passed: false, recordCounts: {}, checksumMatch: false, missing: ["manifest"], extra: [], details: "No manifest found in backup payload" };
  }

  // Recompute checksum (excluding manifest)
  const { manifest: _m, ...dataOnly } = payload;
  const recomputed = computeChecksum(dataOnly);
  const checksumMatch = recomputed === manifest.checksum;

  // Verify record counts
  const actualCounts: Record<string, number> = {
    memory_experiences:         (payload.experiences         ?? []).length,
    memory_relationships:       (payload.relationships       ?? []).length,
    memory_relationship_history: (payload.relationshipHistory ?? []).length,
    trade_events:               (payload.tradeEvents         ?? []).length,
    trade_screenshots:          (payload.screenshots         ?? []).length,
    trade_context:              (payload.contexts            ?? []).length,
    context_timeline_events:    (payload.timelineEvents      ?? []).length,
    setup_memory:               (payload.setups              ?? []).length,
    skipped_setup_memory:       (payload.skippedSetups       ?? []).length,
    market_snapshot_memory:     (payload.snapshots           ?? []).length,
    memory_metadata:            (payload.metadata            ?? []).length,
    trade_reviews:              (payload.reviews             ?? []).length,
  };

  const missing: string[] = [];
  const extra:   string[] = [];

  for (const [table, expected] of Object.entries(manifest.recordCounts)) {
    const actual = actualCounts[table] ?? 0;
    if (actual !== expected) {
      missing.push(`${table}: expected ${expected}, got ${actual}`);
    }
  }

  const passed = checksumMatch && missing.length === 0;

  // Mark job as verified
  try {
    await db.update(memoryBackupJobsTable)
      .set({ verifiedAt: new Date(), verificationPassed: passed, restorable: passed, status: passed ? "verified" : "failed" })
      .where(eq(memoryBackupJobsTable.jobId, manifest.backupId));
  } catch {}

  return {
    passed,
    recordCounts: actualCounts,
    checksumMatch,
    missing,
    extra,
    details: passed
      ? `Backup verified: ${manifest.totalRecords} records, checksum matches`
      : `Backup has issues: checksum=${checksumMatch}, ${missing.length} count mismatches`,
  };
}

// ─── Restore Test (Dry Run) ───────────────────────────────────────────────────

export async function testRestore(payload: BackupPayload): Promise<RestoreTestResult> {
  const issues: string[] = [];
  const { manifest } = payload;

  if (!manifest) {
    return {
      wouldRestore: false,
      tables: [], recordCounts: {}, relationshipsOk: false,
      timelinesOk: false, screenshotsOk: false,
      issues: ["Missing backup manifest"],
      recommendation: "Backup file is invalid — do not restore",
    };
  }

  // Check relationships reference valid experience IDs
  const expIds = new Set((payload.experiences ?? []).map((e: unknown) => (e as { tradeId?: number }).tradeId));
  let brokenRels = 0;
  for (const rel of (payload.relationships ?? []) as Array<{ from_type: string; from_id: string }>) {
    if (rel.from_type === "trade" && !expIds.has(parseInt(rel.from_id))) {
      brokenRels++;
    }
  }
  if (brokenRels > 0) issues.push(`${brokenRels} relationship(s) point to non-existent experiences`);

  // Check timeline events reference valid trades
  const timelineTradeIds = new Set(
    ((payload.timelineEvents ?? []) as Array<{ trade_id?: number }>)
      .filter(e => e.trade_id != null)
      .map(e => e.trade_id)
  );
  const orphanTimeline = [...timelineTradeIds].filter(id => !expIds.has(id)).length;
  if (orphanTimeline > 0) issues.push(`${orphanTimeline} timeline event(s) reference trades not in backup`);

  // Check screenshot integrity
  const shotWithHash = ((payload.screenshots ?? []) as Array<{ fileHash?: string }>)
    .filter(s => s.fileHash).length;
  const totalShots = (payload.screenshots ?? []).length;
  if (totalShots > 0 && shotWithHash / totalShots < 0.5) {
    issues.push(`Only ${shotWithHash}/${totalShots} screenshots have integrity hashes`);
  }

  const recordCounts = manifest.recordCounts;
  const wouldRestore = issues.length === 0;

  return {
    wouldRestore,
    tables:          manifest.tables,
    recordCounts,
    relationshipsOk: brokenRels === 0,
    timelinesOk:     orphanTimeline === 0,
    screenshotsOk:   totalShots === 0 || shotWithHash / totalShots >= 0.5,
    issues,
    recommendation: wouldRestore
      ? `Backup is restorable. ${manifest.totalRecords} records across ${manifest.tables.length} tables will be restored.`
      : `Backup has ${issues.length} issue(s) — review before restoring to avoid data corruption`,
  };
}

// ─── Backup Job History ───────────────────────────────────────────────────────

export async function getBackupHistory(limit = 20) {
  return db
    .select()
    .from(memoryBackupJobsTable)
    .orderBy(desc(memoryBackupJobsTable.startedAt))
    .limit(limit);
}

export async function getLatestBackupJob() {
  const [latest] = await db
    .select()
    .from(memoryBackupJobsTable)
    .where(eq(memoryBackupJobsTable.status, "completed"))
    .orderBy(desc(memoryBackupJobsTable.startedAt))
    .limit(1);
  return latest ?? null;
}
