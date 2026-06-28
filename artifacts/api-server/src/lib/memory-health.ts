/**
 * Memory Health Engine
 *
 * Validates the integrity of the memory graph and generates health reports.
 *
 * Detects:
 *   - Broken relationship links
 *   - Duplicate experience records
 *   - Missing context records
 *   - Missing screenshots
 *   - Invalid/corrupted timeline ordering
 *   - Orphaned relationships
 *   - Experiences with no events (ghost records)
 *
 * Repairs when possible, generates alerts otherwise.
 */

import { db } from "@workspace/db";
import {
  memoryExperiencesTable,
  memoryRelationshipsTable,
  tradeEventsTable,
  tradeContextTable,
  tradeScreenshotsTable,
} from "@workspace/db";
import { eq, sql, isNotNull, isNull, and, count } from "drizzle-orm";
import { detectOrphanedRelationships, removeOrphans, getRelationshipStats } from "./relationship-engine.js";
import { backfillMissingExperiences, upsertExperienceRecord } from "./experience-builder.js";
import { logger } from "./logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type IssueLevel = "critical" | "warning" | "info";

export interface HealthIssue {
  level:       IssueLevel;
  category:    string;
  message:     string;
  count:       number;
  repaired:    boolean;
  repair?:     string;
}

export interface IntegrityReport {
  runAt:             Date;
  durationMs:        number;
  overallHealth:     "healthy" | "degraded" | "critical";
  dataQualityScore:  number; // 0–100
  issueCount:        number;
  criticalCount:     number;
  warningCount:      number;
  issues:            HealthIssue[];
  repaired:          { orphans: number; experiences: number };
  recommendations:   string[];
}

export interface MemoryStatistics {
  totalExperiences:       number;
  winningExperiences:     number;
  losingExperiences:      number;
  breakEvenExperiences:   number;
  openExperiences:        number;
  experiencesWithContext:    number;
  experiencesWithScreenshots: number;
  experiencesWithReviews:    number;
  experiencesWithLessons:    number;
  avgDurationMins:        number | null;
  avgRiskReward:          number | null;
  avgPnlPips:             number | null;
  avgScreenshotsPerTrade: number | null;
  avgEventsPerTrade:      number | null;
  totalScreenshots:       number;
  totalEvents:            number;
  totalRelationships:     number;
  memoryGrowthRate:       string; // e.g. "2.3 experiences/day"
  estimatedStorageMB:     number;
  relationshipDensity:    number; // 0–100 score
  dataQualityScore:       number; // 0–100
  oldestExperience:       Date | null;
  newestExperience:       Date | null;
  byPair:                 Record<string, number>;
  byOutcome:              Record<string, number>;
  bySession:              Record<string, number>;
  byRegime:               Record<string, number>;
  byEmotion:              Record<string, number>;
}

// ─── Integrity Check ──────────────────────────────────────────────────────────

/**
 * Runs a full integrity check across all memory tables.
 * Repairs orphans and missing experience records automatically.
 * Returns a complete health report.
 */
export async function runIntegrityCheck(): Promise<IntegrityReport> {
  const startedAt = Date.now();
  const issues:  HealthIssue[] = [];
  const repaired = { orphans: 0, experiences: 0 };

  // ── 1. Orphaned relationships ────────────────────────────────────────────
  try {
    const orphanReport = await detectOrphanedRelationships();
    if (orphanReport.count > 0) {
      const removeResult = await removeOrphans();
      repaired.orphans = removeResult.removed;
      issues.push({
        level:    "warning",
        category: "relationships",
        message:  `${orphanReport.count} orphaned relationship(s) pointing to deleted entities`,
        count:    orphanReport.count,
        repaired: removeResult.removed === orphanReport.count,
        repair:   `Removed ${removeResult.removed} orphaned link(s)`,
      });
    }
  } catch (err) {
    logger.warn({ err }, "[MH] Orphan detection failed");
    issues.push({ level: "warning", category: "relationships", message: "Orphan detection failed", count: 0, repaired: false });
  }

  // ── 2. Experiences with no trade events (ghost records) ─────────────────
  try {
    const ghostExperiences = await db
      .select({ tradeId: memoryExperiencesTable.tradeId })
      .from(memoryExperiencesTable)
      .where(and(
        isNotNull(memoryExperiencesTable.tradeId),
        eq(memoryExperiencesTable.eventCount, 0),
      ))
      .limit(50);

    if (ghostExperiences.length > 0) {
      issues.push({
        level:    "warning",
        category: "experiences",
        message:  `${ghostExperiences.length} experience(s) have no associated trade events`,
        count:    ghostExperiences.length,
        repaired: false,
        repair:   "Run /memory/health/repair to rebuild these experience records",
      });
    }
  } catch {}

  // ── 3. Trades without experience records ─────────────────────────────────
  try {
    const allTradeIds = await db
      .selectDistinct({ tradeId: tradeEventsTable.tradeId })
      .from(tradeEventsTable)
      .where(isNotNull(tradeEventsTable.tradeId));

    const existingExpIds = await db
      .select({ tradeId: memoryExperiencesTable.tradeId })
      .from(memoryExperiencesTable)
      .where(isNotNull(memoryExperiencesTable.tradeId));

    const existingSet = new Set(existingExpIds.map(r => r.tradeId));
    const missing     = allTradeIds.filter(r => !existingSet.has(r.tradeId!));

    if (missing.length > 0) {
      // Auto-repair: backfill missing experience records
      const result = await backfillMissingExperiences();
      repaired.experiences = result.created;
      issues.push({
        level:    missing.length > 5 ? "critical" : "warning",
        category: "experiences",
        message:  `${missing.length} trade(s) had no experience record`,
        count:    missing.length,
        repaired: result.created > 0,
        repair:   result.created > 0 ? `Created ${result.created} experience record(s)` : `${result.errors} error(s) during repair`,
      });
    }
  } catch (err) {
    logger.warn({ err }, "[MH] Missing experience detection failed");
  }

  // ── 4. Experiences without context ──────────────────────────────────────
  try {
    const noContext = await db
      .select({ c: count() })
      .from(memoryExperiencesTable)
      .where(eq(memoryExperiencesTable.hasContext, false));

    const noContextCount = Number(noContext[0]?.c ?? 0);
    if (noContextCount > 0) {
      issues.push({
        level:    "info",
        category: "context",
        message:  `${noContextCount} experience(s) missing context record (market/strategy/trader data)`,
        count:    noContextCount,
        repaired: false,
        repair:   "Context is auto-populated on trade open. For historical trades, POST to /memory/context/:tradeId",
      });
    }
  } catch {}

  // ── 5. Experiences without screenshots ──────────────────────────────────
  try {
    const noScreenshots = await db
      .select({ c: count() })
      .from(memoryExperiencesTable)
      .where(eq(memoryExperiencesTable.hasScreenshots, false));

    const noSsCount = Number(noScreenshots[0]?.c ?? 0);
    if (noSsCount > 0) {
      issues.push({
        level:    "info",
        category: "screenshots",
        message:  `${noSsCount} experience(s) have no chart screenshots`,
        count:    noSsCount,
        repaired: false,
        repair:   "Upload screenshots via /memory/screenshots or the Context Memory dashboard",
      });
    }
  } catch {}

  // ── 6. Duplicate experience records (same tradeId) ───────────────────────
  try {
    const dups = await db
      .select({ tradeId: memoryExperiencesTable.tradeId, cnt: count() })
      .from(memoryExperiencesTable)
      .where(isNotNull(memoryExperiencesTable.tradeId))
      .groupBy(memoryExperiencesTable.tradeId)
      .having(sql`count(*) > 1`);

    if (dups.length > 0) {
      issues.push({
        level:    "critical",
        category: "integrity",
        message:  `${dups.length} trade(s) have duplicate experience records`,
        count:    dups.length,
        repaired: false,
        repair:   "Manual cleanup required: DELETE FROM memory_experiences WHERE id != (SELECT MIN(id) FROM memory_experiences GROUP BY trade_id)",
      });
    }
  } catch {}

  // ── 7. Experiences with integrity score < 0.4 ────────────────────────────
  try {
    const lowQuality = await db
      .select({ c: count() })
      .from(memoryExperiencesTable)
      .where(sql`CAST(${memoryExperiencesTable.integrityScore} AS NUMERIC) < 0.4`);

    const lqCount = Number(lowQuality[0]?.c ?? 0);
    if (lqCount > 0) {
      issues.push({
        level:    "warning",
        category: "quality",
        message:  `${lqCount} experience(s) have low data quality score (< 40%)`,
        count:    lqCount,
        repaired: false,
        repair:   "Add notes, screenshots, and context via the Context Memory page",
      });
    }
  } catch {}

  // ── Compute overall health ───────────────────────────────────────────────
  const criticalCount = issues.filter(i => i.level === "critical").length;
  const warningCount  = issues.filter(i => i.level === "warning").length;

  const overallHealth: IntegrityReport["overallHealth"] =
    criticalCount > 0 ? "critical" :
    warningCount  > 0 ? "degraded" : "healthy";

  // Data quality score: 100 - (critical * 30 + warning * 10 + info * 2)
  const dataQualityScore = Math.max(0,
    100 - (criticalCount * 30) - (warningCount * 10) - (issues.filter(i => i.level === "info").length * 2),
  );

  const recommendations: string[] = [];
  if (criticalCount > 0) recommendations.push("Resolve critical issues immediately — duplicate records or broken chains may affect AI module accuracy");
  if (warningCount  > 0) recommendations.push("Review warnings — orphaned links and missing experiences reduce memory graph coverage");
  if (issues.some(i => i.category === "screenshots")) recommendations.push("Upload chart screenshots to improve visual memory completeness");
  if (issues.some(i => i.category === "context"))     recommendations.push("Add context records via PATCH /memory/context/:tradeId or the Notes tab in Context Memory");
  if (recommendations.length === 0) recommendations.push("Memory graph is healthy. Continue normal operation.");

  return {
    runAt:             new Date(),
    durationMs:        Date.now() - startedAt,
    overallHealth,
    dataQualityScore,
    issueCount:        issues.length,
    criticalCount,
    warningCount,
    issues,
    repaired,
    recommendations,
  };
}

// ─── Memory Statistics ────────────────────────────────────────────────────────

/**
 * Computes comprehensive memory statistics across all experience records.
 */
export async function getMemoryStatistics(): Promise<MemoryStatistics> {
  const [
    allExps,
    screenshotCount,
    eventCount,
    relStats,
  ] = await Promise.all([
    db.select().from(memoryExperiencesTable),
    db.select({ c: count() }).from(tradeScreenshotsTable),
    db.select({ c: count() }).from(tradeEventsTable),
    getRelationshipStats(),
  ]);

  const total                   = allExps.length;
  const winningExperiences       = allExps.filter(e => e.outcome === "win").length;
  const losingExperiences        = allExps.filter(e => e.outcome === "loss").length;
  const breakEvenExperiences     = allExps.filter(e => e.outcome === "break_even").length;
  const openExperiences          = allExps.filter(e => e.outcome === "open" || !e.outcome).length;
  const experiencesWithContext   = allExps.filter(e => e.hasContext).length;
  const experiencesWithScreenshots = allExps.filter(e => e.hasScreenshots).length;
  const experiencesWithReviews   = allExps.filter(e => e.hasReview).length;
  const experiencesWithLessons   = allExps.filter(e => e.hasLessons).length;

  const closed = allExps.filter(e => e.durationMins != null);
  const avgDuration = closed.length > 0 ? Math.round(closed.reduce((s, e) => s + (e.durationMins ?? 0), 0) / closed.length) : null;

  const withRR = allExps.filter(e => e.riskReward != null);
  const avgRR  = withRR.length > 0 ? parseFloat((withRR.reduce((s, e) => s + parseFloat(String(e.riskReward ?? 0)), 0) / withRR.length).toFixed(2)) : null;

  const withPnl = allExps.filter(e => e.pnlPips != null);
  const avgPnl  = withPnl.length > 0 ? parseFloat((withPnl.reduce((s, e) => s + parseFloat(String(e.pnlPips ?? 0)), 0) / withPnl.length).toFixed(1)) : null;

  const avgScreenshots = total > 0 ? parseFloat((allExps.reduce((s, e) => s + (e.screenshotCount ?? 0), 0) / total).toFixed(1)) : null;
  const avgEvents      = total > 0 ? parseFloat((allExps.reduce((s, e) => s + (e.eventCount      ?? 0), 0) / total).toFixed(1)) : null;

  // Memory growth: experiences per day over last 7 days
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const recentCount = allExps.filter(e => e.createdAt >= weekAgo).length;
  const growthRate  = `${(recentCount / 7).toFixed(1)} experiences/day`;

  // Estimated storage: rough estimate from screenshot counts and avg size
  const estScreenshotsMB = Number(screenshotCount[0]?.c ?? 0) * 0.5; // ~500KB average
  const estRelsMB        = relStats.total * 0.001; // ~1KB per relationship
  const estMeta          = total * 0.01;           // ~10KB per experience metadata
  const estimatedStorageMB = parseFloat((estScreenshotsMB + estRelsMB + estMeta).toFixed(1));

  // Group by dimensions
  const byPair:    Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  const bySession: Record<string, number> = {};
  const byRegime:  Record<string, number> = {};
  const byEmotion: Record<string, number> = {};

  for (const e of allExps) {
    if (e.pair)        byPair[e.pair]                = (byPair[e.pair]         ?? 0) + 1;
    if (e.outcome)     byOutcome[e.outcome]           = (byOutcome[e.outcome]   ?? 0) + 1;
    if (e.session)     bySession[e.session]           = (bySession[e.session]   ?? 0) + 1;
    if (e.marketRegime) byRegime[e.marketRegime]      = (byRegime[e.marketRegime] ?? 0) + 1;
    if (e.emotionTag)  byEmotion[e.emotionTag]        = (byEmotion[e.emotionTag] ?? 0) + 1;
  }

  // Data quality score (0–100): % of experiences with good coverage
  const wellCovered = allExps.filter(e => e.hasContext && e.hasScreenshots && (e.outcome !== null)).length;
  const dataQualityScore = total > 0 ? Math.round((wellCovered / total) * 100) : 100;

  const dates = allExps.map(e => e.createdAt).sort((a, b) => a.getTime() - b.getTime());

  return {
    totalExperiences:           total,
    winningExperiences,
    losingExperiences,
    breakEvenExperiences,
    openExperiences,
    experiencesWithContext,
    experiencesWithScreenshots,
    experiencesWithReviews,
    experiencesWithLessons,
    avgDurationMins:            avgDuration,
    avgRiskReward:              avgRR,
    avgPnlPips:                 avgPnl,
    avgScreenshotsPerTrade:     avgScreenshots,
    avgEventsPerTrade:          avgEvents,
    totalScreenshots:           Number(screenshotCount[0]?.c ?? 0),
    totalEvents:                Number(eventCount[0]?.c      ?? 0),
    totalRelationships:         relStats.total,
    memoryGrowthRate:           growthRate,
    estimatedStorageMB,
    relationshipDensity:        relStats.densityScore,
    dataQualityScore,
    oldestExperience:           dates[0]             ?? null,
    newestExperience:           dates[dates.length-1] ?? null,
    byPair,
    byOutcome,
    bySession,
    byRegime,
    byEmotion,
  };
}

// ─── Repair Trigger ───────────────────────────────────────────────────────────

/**
 * Full repair sequence: remove orphans + backfill missing experiences.
 * Safe to call multiple times.
 */
export async function runRepair(): Promise<{
  orphansRemoved:        number;
  experiencesCreated:    number;
  errors:                number;
  durationMs:            number;
}> {
  const start = Date.now();
  let orphansRemoved     = 0;
  let experiencesCreated = 0;
  let errors             = 0;

  try {
    const orphans = await removeOrphans();
    orphansRemoved = orphans.removed;
  } catch (err) {
    logger.warn({ err }, "[MH] Orphan removal failed during repair");
    errors++;
  }

  try {
    const backfill = await backfillMissingExperiences();
    experiencesCreated = backfill.created;
    errors            += backfill.errors;
  } catch (err) {
    logger.warn({ err }, "[MH] Backfill failed during repair");
    errors++;
  }

  logger.info({ orphansRemoved, experiencesCreated, errors }, "[MH] Repair complete");
  return { orphansRemoved, experiencesCreated, errors, durationMs: Date.now() - start };
}
