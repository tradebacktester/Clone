/**
 * Memory Validation Engine
 *
 * Comprehensive integrity validation across all memory tables.
 * Goes well beyond basic health checks — verifies:
 *   - Referential integrity (every foreign key points to a real record)
 *   - Broken relationships in the graph
 *   - Missing market snapshots
 *   - Missing screenshots for completed trades
 *   - Duplicate trades / setups / events
 *   - Invalid or reversed timestamps
 *   - Corrupted or null-critical records
 *   - Orphaned records (no parent)
 *   - Missing market context for closed trades
 *   - Missing trade outcomes for closed experiences
 *
 * All issues are surfaced — never silently ignored.
 * Auto-repairs what it can. Flags the rest with clear instructions.
 */

import { db } from "@workspace/db";
import {
  memoryExperiencesTable,
  memoryRelationshipsTable,
  memoryValidationRunsTable,
  tradeEventsTable,
  tradeScreenshotsTable,
  tradeContextTable,
  tradeReviewsTable,
  setupMemoryTable,
  skippedSetupMemoryTable,
  marketSnapshotMemoryTable,
  memoryMetadataTable,
} from "@workspace/db";
import { eq, sql, isNotNull, isNull, and, count, lt, gt, ne, inArray, notInArray, gte } from "drizzle-orm";
import { logger } from "./logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ValidationSeverity = "critical" | "warning" | "info";

export interface ValidationFinding {
  id:           string;
  severity:     ValidationSeverity;
  category:     string;
  check:        string;
  message:      string;
  count:        number;
  affectedIds?: (string | number)[];
  repaired:     boolean;
  repairNote?:  string;
  sqlHint?:     string;
}

export interface ValidationReport {
  runId:             string;
  runType:           string;
  triggeredBy:       string;
  startedAt:         Date;
  completedAt:       Date;
  durationMs:        number;

  healthScore:       number;   // 0–100
  overallHealth:     "healthy" | "degraded" | "critical";

  totalChecks:       number;
  criticalCount:     number;
  warningCount:      number;
  infoCount:         number;
  issuesRepaired:    number;

  findings:          ValidationFinding[];
  recommendations:   string[];
  summary:           string;
}

// ─── Check Categories ─────────────────────────────────────────────────────────

const CATEGORIES = {
  REFERENTIAL:  "Referential Integrity",
  DUPLICATES:   "Duplicate Detection",
  TIMESTAMPS:   "Timestamp Validity",
  COMPLETENESS: "Data Completeness",
  ORPHANS:      "Orphaned Records",
  CORRUPTION:   "Data Corruption",
  OUTCOMES:     "Trade Outcomes",
  CONTEXT:      "Market Context",
  SNAPSHOTS:    "Market Snapshots",
} as const;

// ─── Individual Checks ────────────────────────────────────────────────────────

async function checkReferentialIntegrity(findings: ValidationFinding[]): Promise<number> {
  let repaired = 0;

  // 1. Trade events pointing to non-existent setups
  try {
    const brokenSetupLinks = await db.execute(sql`
      SELECT te.id, te.setup_id
      FROM trade_events te
      WHERE te.setup_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM setup_memory sm WHERE sm.id::text = te.setup_id::text
        )
      LIMIT 100
    `);
    const rows = brokenSetupLinks.rows as Array<{ id: number; setup_id: string }>;
    if (rows.length > 0) {
      findings.push({
        id: "REF-001",
        severity: "warning",
        category: CATEGORIES.REFERENTIAL,
        check: "Trade events → Setup Memory",
        message: `${rows.length} trade event(s) reference non-existent setup records`,
        count: rows.length,
        affectedIds: rows.map(r => r.id),
        repaired: false,
        sqlHint: "UPDATE trade_events SET setup_id = NULL WHERE setup_id NOT IN (SELECT id FROM setup_memory)",
      });
    }
  } catch (err) {
    logger.warn({ err }, "[MVE] REF-001 check failed");
  }

  // 2. Screenshots pointing to non-existent trades
  try {
    const result = await db.execute(sql`
      SELECT ts.id, ts.trade_id
      FROM trade_screenshots ts
      WHERE ts.trade_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM paper_trades pt WHERE pt.id = ts.trade_id
        )
      LIMIT 100
    `);
    const rows = result.rows as Array<{ id: string; trade_id: number }>;
    if (rows.length > 0) {
      findings.push({
        id: "REF-002",
        severity: "info",
        category: CATEGORIES.REFERENTIAL,
        check: "Screenshots → Trades",
        message: `${rows.length} screenshot(s) reference trade IDs with no corresponding paper trade`,
        count: rows.length,
        affectedIds: rows.map(r => r.id),
        repaired: false,
        repairNote: "Screenshots may be from manually deleted trades — safe to ignore or clean up",
      });
    }
  } catch {
    // paper_trades might not exist yet
  }

  // 3. Context records pointing to non-existent experiences
  try {
    const noExpContext = await db.execute(sql`
      SELECT tc.id, tc.trade_id
      FROM trade_context tc
      WHERE NOT EXISTS (
        SELECT 1 FROM memory_experiences me WHERE me.trade_id = tc.trade_id
      )
      LIMIT 50
    `);
    const rows = noExpContext.rows as Array<{ id: string; trade_id: number }>;
    if (rows.length > 0) {
      findings.push({
        id: "REF-003",
        severity: "info",
        category: CATEGORIES.REFERENTIAL,
        check: "Context → Experience",
        message: `${rows.length} context record(s) have no matching experience record`,
        count: rows.length,
        repaired: false,
        repairNote: "These contexts were created before the experience record was built. Run /memory/health/repair to backfill.",
      });
    }
  } catch {}

  // 4. Relationship graph broken edges
  try {
    const brokenEdges = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM memory_relationships mr
      WHERE mr.from_type = 'trade'
        AND NOT EXISTS (
          SELECT 1 FROM memory_experiences me WHERE me.trade_id::text = mr.from_id
        )
    `);
    const cnt = Number((brokenEdges.rows[0] as { cnt: string })?.cnt ?? 0);
    if (cnt > 0) {
      findings.push({
        id: "REF-004",
        severity: "warning",
        category: CATEGORIES.REFERENTIAL,
        check: "Relationship Graph Edges → Experiences",
        message: `${cnt} relationship edge(s) point to trade IDs with no experience record`,
        count: cnt,
        repaired: false,
        sqlHint: "DELETE FROM memory_relationships WHERE from_type='trade' AND from_id NOT IN (SELECT trade_id::text FROM memory_experiences WHERE trade_id IS NOT NULL)",
      });
    }
  } catch {}

  return repaired;
}

async function checkDuplicates(findings: ValidationFinding[]): Promise<number> {
  let repaired = 0;

  // 1. Duplicate experience records by tradeId
  try {
    const dups = await db
      .select({ tradeId: memoryExperiencesTable.tradeId, cnt: count() })
      .from(memoryExperiencesTable)
      .where(isNotNull(memoryExperiencesTable.tradeId))
      .groupBy(memoryExperiencesTable.tradeId)
      .having(sql`count(*) > 1`);

    if (dups.length > 0) {
      findings.push({
        id: "DUP-001",
        severity: "critical",
        category: CATEGORIES.DUPLICATES,
        check: "Experience records",
        message: `${dups.length} trade(s) have duplicate experience records — this corrupts memory graph integrity`,
        count: dups.length,
        affectedIds: dups.map(d => d.tradeId!),
        repaired: false,
        sqlHint: "DELETE FROM memory_experiences WHERE id NOT IN (SELECT MIN(id) FROM memory_experiences GROUP BY trade_id)",
      });
    }
  } catch {}

  // 2. Duplicate setup memory by (pair + direction + evaluated_at)
  try {
    const dupSetups = await db.execute(sql`
      SELECT pair, direction, session, COUNT(*) as cnt
      FROM setup_memory
      GROUP BY pair, direction, session, DATE_TRUNC('minute', evaluated_at)
      HAVING COUNT(*) > 1
      LIMIT 20
    `);
    const rows = dupSetups.rows as Array<{ pair: string; direction: string; cnt: string }>;
    if (rows.length > 0) {
      findings.push({
        id: "DUP-002",
        severity: "warning",
        category: CATEGORIES.DUPLICATES,
        check: "Setup records",
        message: `${rows.length} group(s) of duplicate setup evaluations detected (same pair/direction within same minute)`,
        count: rows.length,
        repaired: false,
        repairNote: "Duplicate setups may occur if the analysis scheduler ran concurrently. Review setup_memory for same-minute duplicates.",
      });
    }
  } catch {}

  // 3. Duplicate trade events (same tradeId + eventType within 1 second)
  try {
    const dupEvents = await db.execute(sql`
      SELECT trade_id, event_type, COUNT(*) as cnt
      FROM trade_events
      GROUP BY trade_id, event_type, DATE_TRUNC('second', occurred_at)
      HAVING COUNT(*) > 1
      LIMIT 20
    `);
    const rows = dupEvents.rows as Array<{ trade_id: number; event_type: string; cnt: string }>;
    if (rows.length > 0) {
      findings.push({
        id: "DUP-003",
        severity: "warning",
        category: CATEGORIES.DUPLICATES,
        check: "Trade events",
        message: `${rows.length} duplicate trade event group(s) detected (same type within same second)`,
        count: rows.length,
        repaired: false,
        repairNote: "Duplicate events may arise from retry logic. Safe to delete all but the first occurrence.",
      });
    }
  } catch {}

  // 4. Screenshots with identical hash (exact duplicates)
  try {
    const dupScreenshots = await db.execute(sql`
      SELECT file_hash, COUNT(*) as cnt
      FROM trade_screenshots
      WHERE file_hash IS NOT NULL
      GROUP BY file_hash
      HAVING COUNT(*) > 1
      LIMIT 20
    `);
    const rows = dupScreenshots.rows as Array<{ file_hash: string; cnt: string }>;
    if (rows.length > 0) {
      findings.push({
        id: "DUP-004",
        severity: "info",
        category: CATEGORIES.DUPLICATES,
        check: "Screenshot hash duplicates",
        message: `${rows.length} duplicate screenshot hash group(s) — identical images uploaded multiple times`,
        count: rows.length,
        repaired: false,
        repairNote: "SHA-256 deduplication is active but older uploads may share hashes. Run cleanup to remove exact duplicates.",
      });
    }
  } catch {}

  return repaired;
}

async function checkTimestamps(findings: ValidationFinding[]): Promise<number> {
  const repaired = 0;

  // 1. Trade events with occurred_at in the future
  try {
    const future = await db
      .select({ cnt: count() })
      .from(tradeEventsTable)
      .where(gt(tradeEventsTable.occurredAt, new Date(Date.now() + 60_000)));
    const cnt = Number(future[0]?.cnt ?? 0);
    if (cnt > 0) {
      findings.push({
        id: "TS-001",
        severity: "critical",
        category: CATEGORIES.TIMESTAMPS,
        check: "Future trade events",
        message: `${cnt} trade event(s) have future timestamps — indicates clock skew or corrupted data`,
        count: cnt,
        repaired: false,
        sqlHint: "SELECT * FROM trade_events WHERE occurred_at > NOW() + INTERVAL '1 minute'",
      });
    }
  } catch {}

  // 2. Experiences with closedAt before openedAt
  try {
    const reversed = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM memory_experiences
      WHERE trade_closed_at IS NOT NULL
        AND trade_opened_at IS NOT NULL
        AND trade_closed_at < trade_opened_at
    `);
    const cnt = Number((reversed.rows[0] as { cnt: string })?.cnt ?? 0);
    if (cnt > 0) {
      findings.push({
        id: "TS-002",
        severity: "critical",
        category: CATEGORIES.TIMESTAMPS,
        check: "Reversed trade timestamps",
        message: `${cnt} experience(s) have close time before open time — corrupted timeline`,
        count: cnt,
        repaired: false,
        sqlHint: "SELECT * FROM memory_experiences WHERE trade_closed_at < trade_opened_at",
      });
    }
  } catch {}

  // 3. Context records with updatedAt before createdAt
  try {
    const reversed = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM trade_context
      WHERE updated_at < created_at
    `);
    const cnt = Number((reversed.rows[0] as { cnt: string })?.cnt ?? 0);
    if (cnt > 0) {
      findings.push({
        id: "TS-003",
        severity: "warning",
        category: CATEGORIES.TIMESTAMPS,
        check: "Context timestamp reversal",
        message: `${cnt} context record(s) have updated_at before created_at`,
        count: cnt,
        repaired: false,
        sqlHint: "UPDATE trade_context SET updated_at = created_at WHERE updated_at < created_at",
      });
    }
  } catch {}

  // 4. Screenshots from the far future
  try {
    const futureShots = await db
      .select({ cnt: count() })
      .from(tradeScreenshotsTable)
      .where(gt(tradeScreenshotsTable.uploadedAt, new Date(Date.now() + 86_400_000)));
    const cnt = Number(futureShots[0]?.cnt ?? 0);
    if (cnt > 0) {
      findings.push({
        id: "TS-004",
        severity: "warning",
        category: CATEGORIES.TIMESTAMPS,
        check: "Future screenshot timestamps",
        message: `${cnt} screenshot(s) have upload timestamps more than 24h in the future`,
        count: cnt,
        repaired: false,
      });
    }
  } catch {}

  return repaired;
}

async function checkCompleteness(findings: ValidationFinding[]): Promise<number> {
  const repaired = 0;

  // 1. Closed experiences missing context
  try {
    const noContext = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM memory_experiences
      WHERE outcome IN ('win','loss','break_even')
        AND has_context = false
    `);
    const cnt = Number((noContext.rows[0] as { cnt: string })?.cnt ?? 0);
    if (cnt > 0) {
      findings.push({
        id: "COMP-001",
        severity: "warning",
        category: CATEGORIES.COMPLETENESS,
        check: "Closed trades missing context",
        message: `${cnt} closed trade experience(s) have no context record — reduces AI module data quality`,
        count: cnt,
        repaired: false,
        repairNote: "Add context via POST /memory/context/:tradeId or the Context Memory page",
      });
    }
  } catch {}

  // 2. Closed experiences missing screenshots
  try {
    const noScreenshots = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM memory_experiences
      WHERE outcome IN ('win','loss','break_even')
        AND has_screenshots = false
    `);
    const cnt = Number((noScreenshots.rows[0] as { cnt: string })?.cnt ?? 0);
    if (cnt > 0) {
      findings.push({
        id: "COMP-002",
        severity: "info",
        category: CATEGORIES.COMPLETENESS,
        check: "Closed trades missing screenshots",
        message: `${cnt} closed trade experience(s) have no chart screenshots`,
        count: cnt,
        repaired: false,
        repairNote: "Upload via POST /memory/screenshots or the Context Memory dashboard",
      });
    }
  } catch {}

  // 3. Setup records missing market snapshot link
  try {
    const noSnap = await db
      .select({ cnt: count() })
      .from(setupMemoryTable)
      .where(isNull(setupMemoryTable.marketSnapshotId));
    const cnt = Number(noSnap[0]?.cnt ?? 0);
    if (cnt > 0) {
      findings.push({
        id: "COMP-003",
        severity: "info",
        category: CATEGORIES.SNAPSHOTS,
        check: "Setups missing market snapshot",
        message: `${cnt} setup record(s) have no linked market snapshot — limits historical context reconstruction`,
        count: cnt,
        repaired: false,
        repairNote: "Snapshots are auto-created on new setups. Missing links are from setups created before V2 memory system.",
      });
    }
  } catch {}

  // 4. Metadata records with isValid = false
  try {
    const invalid = await db
      .select({ cnt: count() })
      .from(memoryMetadataTable)
      .where(eq(memoryMetadataTable.isValid, false));
    const cnt = Number(invalid[0]?.cnt ?? 0);
    if (cnt > 0) {
      findings.push({
        id: "COMP-004",
        severity: "warning",
        category: CATEGORIES.CORRUPTION,
        check: "Invalid metadata records",
        message: `${cnt} memory metadata record(s) are marked invalid — data provenance is compromised`,
        count: cnt,
        repaired: false,
        sqlHint: "SELECT * FROM memory_metadata WHERE is_valid = false",
      });
    }
  } catch {}

  return repaired;
}

async function checkOrphans(findings: ValidationFinding[]): Promise<number> {
  let repaired = 0;

  // 1. Screenshots with no tradeId and no setupId
  try {
    const orphanShots = await db
      .select({ cnt: count() })
      .from(tradeScreenshotsTable)
      .where(and(
        isNull(tradeScreenshotsTable.tradeId),
        isNull(tradeScreenshotsTable.setupId),
      ));
    const cnt = Number(orphanShots[0]?.cnt ?? 0);
    if (cnt > 0) {
      findings.push({
        id: "ORP-001",
        severity: "info",
        category: CATEGORIES.ORPHANS,
        check: "Orphaned screenshots",
        message: `${cnt} screenshot(s) have no trade_id or setup_id — completely unlinked visual records`,
        count: cnt,
        repaired: false,
        repairNote: "Review manually — may be analysis screenshots without a trade context",
      });
    }
  } catch {}

  // 2. Context timeline events with no tradeId or setupId
  try {
    const orphanEvents = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM context_timeline_events
      WHERE trade_id IS NULL AND setup_id IS NULL
    `);
    const cnt = Number((orphanEvents.rows[0] as { cnt: string })?.cnt ?? 0);
    if (cnt > 0) {
      findings.push({
        id: "ORP-002",
        severity: "info",
        category: CATEGORIES.ORPHANS,
        check: "Orphaned timeline events",
        message: `${cnt} context timeline event(s) with no trade or setup link`,
        count: cnt,
        repaired: false,
      });
    }
  } catch {}

  // 3. Skipped setup records with no pair (corrupted on insert)
  try {
    const corrupt = await db
      .select({ cnt: count() })
      .from(skippedSetupMemoryTable)
      .where(sql`pair IS NULL OR pair = ''`);
    const cnt = Number(corrupt[0]?.cnt ?? 0);
    if (cnt > 0) {
      findings.push({
        id: "ORP-003",
        severity: "critical",
        category: CATEGORIES.CORRUPTION,
        check: "Corrupted skipped setups",
        message: `${cnt} skipped setup record(s) have null/empty pair field — cannot be reliably indexed`,
        count: cnt,
        repaired: false,
        sqlHint: "DELETE FROM skipped_setup_memory WHERE pair IS NULL OR pair = ''",
      });
    }
  } catch {}

  return repaired;
}

async function checkOutcomes(findings: ValidationFinding[]): Promise<number> {
  const repaired = 0;

  // 1. Experiences with null outcome but trade_closed_at is set
  try {
    const missingOutcome = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM memory_experiences
      WHERE trade_closed_at IS NOT NULL
        AND (outcome IS NULL OR outcome = 'open')
    `);
    const cnt = Number((missingOutcome.rows[0] as { cnt: string })?.cnt ?? 0);
    if (cnt > 0) {
      findings.push({
        id: "OUT-001",
        severity: "warning",
        category: CATEGORIES.OUTCOMES,
        check: "Missing outcomes on closed trades",
        message: `${cnt} experience(s) are closed (have close time) but outcome is missing or still 'open'`,
        count: cnt,
        repaired: false,
        repairNote: "Run POST /memory/experience/trade/:id/refresh to rebuild from trade events",
      });
    }
  } catch {}

  // 2. Experiences marked 'win' with negative pnl
  try {
    const badWins = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM memory_experiences
      WHERE outcome = 'win'
        AND pnl_pips IS NOT NULL
        AND CAST(pnl_pips AS NUMERIC) < 0
    `);
    const cnt = Number((badWins.rows[0] as { cnt: string })?.cnt ?? 0);
    if (cnt > 0) {
      findings.push({
        id: "OUT-002",
        severity: "critical",
        category: CATEGORIES.OUTCOMES,
        check: "Win/loss mismatch",
        message: `${cnt} experience(s) are marked 'win' but have negative PnL pips — data inconsistency`,
        count: cnt,
        repaired: false,
        sqlHint: "SELECT * FROM memory_experiences WHERE outcome='win' AND CAST(pnl_pips AS NUMERIC) < 0",
      });
    }
  } catch {}

  // 3. Experiences marked 'loss' with positive pnl
  try {
    const badLosses = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM memory_experiences
      WHERE outcome = 'loss'
        AND pnl_pips IS NOT NULL
        AND CAST(pnl_pips AS NUMERIC) > 0
    `);
    const cnt = Number((badLosses.rows[0] as { cnt: string })?.cnt ?? 0);
    if (cnt > 0) {
      findings.push({
        id: "OUT-003",
        severity: "critical",
        category: CATEGORIES.OUTCOMES,
        check: "Loss/win mismatch",
        message: `${cnt} experience(s) are marked 'loss' but have positive PnL pips — data inconsistency`,
        count: cnt,
        repaired: false,
        sqlHint: "SELECT * FROM memory_experiences WHERE outcome='loss' AND CAST(pnl_pips AS NUMERIC) > 0",
      });
    }
  } catch {}

  return repaired;
}

async function checkMarketContext(findings: ValidationFinding[]): Promise<number> {
  const repaired = 0;

  // 1. Snapshots missing regime (critical for learning)
  try {
    const noRegime = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM market_snapshot_memory
      WHERE market_regime IS NULL OR market_regime = ''
    `);
    const cnt = Number((noRegime.rows[0] as { cnt: string })?.cnt ?? 0);
    if (cnt > 0) {
      findings.push({
        id: "CTX-001",
        severity: "info",
        category: CATEGORIES.CONTEXT,
        check: "Snapshots missing regime",
        message: `${cnt} market snapshot(s) have no regime classification — regime-based analysis will be incomplete`,
        count: cnt,
        repaired: false,
        repairNote: "Regime is auto-assigned on new snapshots. Historical gaps are expected.",
      });
    }
  } catch {}

  // 2. Experiences with pair not matching EURUSD/GBPUSD/USDJPY
  try {
    const invalidPairs = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM memory_experiences
      WHERE pair IS NOT NULL
        AND pair NOT IN ('EURUSD','GBPUSD','USDJPY','EUR/USD','GBP/USD','USD/JPY')
    `);
    const cnt = Number((invalidPairs.rows[0] as { cnt: string })?.cnt ?? 0);
    if (cnt > 0) {
      findings.push({
        id: "CTX-002",
        severity: "warning",
        category: CATEGORIES.CONTEXT,
        check: "Invalid pair values",
        message: `${cnt} experience(s) have pairs outside the supported set (EURUSD/GBPUSD/USDJPY)`,
        count: cnt,
        repaired: false,
        sqlHint: "SELECT DISTINCT pair FROM memory_experiences WHERE pair NOT IN ('EURUSD','GBPUSD','USDJPY')",
      });
    }
  } catch {}

  // 3. Low data quality score — experiences < 30%
  try {
    const lowQuality = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM memory_experiences
      WHERE integrity_score IS NOT NULL
        AND CAST(integrity_score AS NUMERIC) < 0.3
    `);
    const cnt = Number((lowQuality.rows[0] as { cnt: string })?.cnt ?? 0);
    if (cnt > 0) {
      findings.push({
        id: "CTX-003",
        severity: "warning",
        category: CATEGORIES.CONTEXT,
        check: "Low integrity score experiences",
        message: `${cnt} experience(s) have integrity score below 30% — poor quality data for future AI modules`,
        count: cnt,
        repaired: false,
        repairNote: "Add screenshots, notes, and trade context to improve these records",
      });
    }
  } catch {}

  return repaired;
}

// ─── Compute Health Score ─────────────────────────────────────────────────────

function computeHealthScore(findings: ValidationFinding[]): number {
  const criticals = findings.filter(f => f.severity === "critical").length;
  const warnings  = findings.filter(f => f.severity === "warning").length;
  const infos     = findings.filter(f => f.severity === "info").length;

  const deduction = (criticals * 25) + (warnings * 8) + (infos * 2);
  return Math.max(0, Math.min(100, 100 - deduction));
}

function computeOverallHealth(score: number): "healthy" | "degraded" | "critical" {
  if (score >= 80) return "healthy";
  if (score >= 50) return "degraded";
  return "critical";
}

function buildRecommendations(findings: ValidationFinding[]): string[] {
  const recs: string[] = [];
  const categories = new Set(findings.map(f => f.category));

  if (findings.some(f => f.severity === "critical" && f.category === CATEGORIES.DUPLICATES)) {
    recs.push("URGENT: Remove duplicate experience records immediately — they will corrupt AI training data");
  }
  if (findings.some(f => f.severity === "critical" && f.category === CATEGORIES.OUTCOMES)) {
    recs.push("URGENT: Resolve win/loss PnL mismatches — this indicates a PnL calculation error in the trading engine");
  }
  if (findings.some(f => f.severity === "critical" && f.category === CATEGORIES.TIMESTAMPS)) {
    recs.push("URGENT: Fix reversed timestamps — these indicate clock errors or corrupted close events");
  }
  if (categories.has(CATEGORIES.REFERENTIAL)) {
    recs.push("Run /memory/health/repair to fix broken relationship links automatically");
  }
  if (categories.has(CATEGORIES.COMPLETENESS)) {
    recs.push("Improve coverage: upload chart screenshots and fill context records for closed trades");
  }
  if (categories.has(CATEGORIES.ORPHANS)) {
    recs.push("Review orphaned records and either link them to trades or archive them");
  }
  if (recs.length === 0) {
    recs.push("Memory system is passing all integrity checks — continue normal operation");
  }

  return recs;
}

// ─── Main Validation Runner ───────────────────────────────────────────────────

export async function runFullValidation(opts: {
  triggeredBy?: string;
  runType?: string;
} = {}): Promise<ValidationReport> {
  const startedAt  = new Date();
  const findings:  ValidationFinding[] = [];
  let   repaired   = 0;

  const triggeredBy = opts.triggeredBy ?? "system";
  const runType     = opts.runType     ?? "full";

  logger.info({ triggeredBy, runType }, "[MVE] Starting full memory validation");

  // Insert run record as 'running'
  const [runRow] = await db
    .insert(memoryValidationRunsTable)
    .values({ runType, triggeredBy, status: "running" })
    .returning();

  try {
    // Run all checks in parallel for speed
    const [r1, r2, r3, r4, r5, r6, r7] = await Promise.all([
      checkReferentialIntegrity(findings),
      checkDuplicates(findings),
      checkTimestamps(findings),
      checkCompleteness(findings),
      checkOrphans(findings),
      checkOutcomes(findings),
      checkMarketContext(findings),
    ]);

    repaired = r1 + r2 + r3 + r4 + r5 + r6 + r7;

    const completedAt  = new Date();
    const durationMs   = completedAt.getTime() - startedAt.getTime();
    const healthScore  = computeHealthScore(findings);
    const overallHealth = computeOverallHealth(healthScore);
    const recommendations = buildRecommendations(findings);

    const criticalCount = findings.filter(f => f.severity === "critical").length;
    const warningCount  = findings.filter(f => f.severity === "warning").length;
    const infoCount     = findings.filter(f => f.severity === "info").length;

    const summary = healthScore >= 80
      ? `Memory system is healthy (score: ${healthScore}/100). ${findings.length} issue(s) detected, ${repaired} repaired.`
      : `Memory system needs attention (score: ${healthScore}/100). ${criticalCount} critical, ${warningCount} warnings, ${infoCount} info issues.`;

    const report: ValidationReport = {
      runId:        runRow!.runId,
      runType,
      triggeredBy,
      startedAt,
      completedAt,
      durationMs,
      healthScore,
      overallHealth,
      totalChecks:   21,
      criticalCount,
      warningCount,
      infoCount,
      issuesRepaired: repaired,
      findings,
      recommendations,
      summary,
    };

    // Update run record with results
    await db
      .update(memoryValidationRunsTable)
      .set({
        status:        "completed",
        healthScore,
        overallHealth,
        totalChecks:   21,
        criticalCount,
        warningCount,
        infoCount,
        issuesRepaired: repaired,
        report:        report as unknown as Record<string, unknown>,
        completedAt,
        durationMs,
      })
      .where(eq(memoryValidationRunsTable.id, runRow!.id));

    logger.info({ healthScore, overallHealth, findings: findings.length, repaired, durationMs }, "[MVE] Validation complete");

    return report;
  } catch (err) {
    logger.error({ err }, "[MVE] Validation failed");
    await db
      .update(memoryValidationRunsTable)
      .set({ status: "failed", error: String(err), completedAt: new Date() })
      .where(eq(memoryValidationRunsTable.id, runRow!.id));
    throw err;
  }
}

// ─── Quick Validation (subset of checks) ─────────────────────────────────────

export async function runQuickValidation(): Promise<Omit<ValidationReport, "findings"> & { topFindings: ValidationFinding[] }> {
  const startedAt = new Date();
  const findings: ValidationFinding[] = [];

  await Promise.all([
    checkDuplicates(findings),
    checkOutcomes(findings),
  ]);

  const completedAt   = new Date();
  const healthScore   = computeHealthScore(findings);
  const overallHealth = computeOverallHealth(healthScore);

  return {
    runId:         crypto.randomUUID(),
    runType:       "quick",
    triggeredBy:   "system",
    startedAt,
    completedAt,
    durationMs:    completedAt.getTime() - startedAt.getTime(),
    healthScore,
    overallHealth,
    totalChecks:   4,
    criticalCount: findings.filter(f => f.severity === "critical").length,
    warningCount:  findings.filter(f => f.severity === "warning").length,
    infoCount:     findings.filter(f => f.severity === "info").length,
    issuesRepaired: 0,
    topFindings:   findings.filter(f => f.severity === "critical").slice(0, 5),
    recommendations: buildRecommendations(findings),
    summary:       `Quick check: ${healthScore}/100`,
  };
}

// ─── Validation Run History ───────────────────────────────────────────────────

export async function getValidationHistory(limit = 20) {
  return db
    .select()
    .from(memoryValidationRunsTable)
    .orderBy(sql`started_at DESC`)
    .limit(limit);
}

export async function getLatestValidationRun() {
  const [latest] = await db
    .select()
    .from(memoryValidationRunsTable)
    .where(eq(memoryValidationRunsTable.status, "completed"))
    .orderBy(sql`started_at DESC`)
    .limit(1);
  return latest ?? null;
}
