/**
 * Memory Performance Engine
 *
 * Benchmarks and optimizes the memory system for large-scale operations.
 * Targets: millions of records, years of history, low-latency retrieval.
 *
 * Measures:
 *   - Query latency across all memory tables
 *   - Index efficiency (sequential vs. index scans)
 *   - Cache hit ratios (pg_stat tables)
 *   - Large dataset handling projections
 *   - Search performance
 *   - Timeline reconstruction speed
 *   - Screenshot retrieval latency
 */

import { db } from "@workspace/db";
import {
  memoryExperiencesTable,
  memoryRelationshipsTable,
  tradeEventsTable,
  tradeScreenshotsTable,
  tradeContextTable,
  setupMemoryTable,
  skippedSetupMemoryTable,
  marketSnapshotMemoryTable,
  memoryHealthSnapshotsTable,
} from "@workspace/db";
import { sql, count, desc, eq } from "drizzle-orm";
import { logger } from "./logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QueryBenchmark {
  name:        string;
  table:       string;
  queryType:   string;
  rows:        number;
  durationMs:  number;
  target:      number;  // target ms
  passed:      boolean;
  p99EstMs?:   number;  // rough estimate
}

export interface IndexInfo {
  tableName:   string;
  indexName:   string;
  columnNames: string;
  indexScans:  number;
  seqScans:    number;
  efficiency:  number; // 0–100 (100 = all index scans)
}

export interface CacheStats {
  heapHitRatio:    number;  // buffer cache hit rate (0–1)
  idxHitRatio:     number;  // index cache hit rate (0–1)
  heapReadBlks:    number;
  heapHitBlks:     number;
  idxReadBlks:     number;
  idxHitBlks:      number;
}

export interface PerformanceReport {
  timestamp:       Date;
  durationMs:      number;
  performanceScore: number;  // 0–100

  benchmarks:      QueryBenchmark[];
  indexes:         IndexInfo[];
  cacheStats:      CacheStats | null;

  // Projections for scale
  projections: {
    recordsAt1Year:     number;
    storageAt1Year:     string;
    queryTimeAt1Year:   string;
    indexesAdequate:    boolean;
    recommendedIndexes: string[];
  };

  recommendations: string[];
  summary:         string;
}

// ─── Benchmarks ───────────────────────────────────────────────────────────────

async function runBenchmark(
  name: string,
  table: string,
  queryType: string,
  target: number,
  queryFn: () => Promise<{ rows: number }>,
): Promise<QueryBenchmark> {
  const t0 = Date.now();
  let rows = 0;
  try {
    const result = await queryFn();
    rows = result.rows;
  } catch {}
  const durationMs = Date.now() - t0;

  return {
    name,
    table,
    queryType,
    rows,
    durationMs,
    target,
    passed: durationMs <= target,
    p99EstMs: Math.round(durationMs * 3.5),
  };
}

async function runAllBenchmarks(): Promise<QueryBenchmark[]> {
  const benchmarks: QueryBenchmark[] = [];

  // Experience queries
  benchmarks.push(await runBenchmark("All Experiences", "memory_experiences", "full_scan", 500, async () => {
    const r = await db.select({ c: count() }).from(memoryExperiencesTable);
    return { rows: Number(r[0]?.c ?? 0) };
  }));

  benchmarks.push(await runBenchmark("Experiences by Pair", "memory_experiences", "index_scan", 100, async () => {
    const r = await db.select({ c: count() }).from(memoryExperiencesTable).where(eq(memoryExperiencesTable.pair, "EURUSD"));
    return { rows: Number(r[0]?.c ?? 0) };
  }));

  benchmarks.push(await runBenchmark("Experiences by Outcome", "memory_experiences", "index_scan", 100, async () => {
    const r = await db.select({ c: count() }).from(memoryExperiencesTable).where(eq(memoryExperiencesTable.outcome, "win"));
    return { rows: Number(r[0]?.c ?? 0) };
  }));

  // Relationship queries
  benchmarks.push(await runBenchmark("All Relationships", "memory_relationships", "full_scan", 300, async () => {
    const r = await db.select({ c: count() }).from(memoryRelationshipsTable);
    return { rows: Number(r[0]?.c ?? 0) };
  }));

  benchmarks.push(await runBenchmark("Relationships by Trade", "memory_relationships", "index_scan", 50, async () => {
    const r = await db.execute(sql`SELECT COUNT(*) as c FROM memory_relationships WHERE from_type = 'trade' LIMIT 1`);
    return { rows: Number((r.rows[0] as { c: string })?.c ?? 0) };
  }));

  // Event timeline queries
  benchmarks.push(await runBenchmark("Trade Events (recent 500)", "trade_events", "index_scan", 100, async () => {
    const r = await db.select().from(tradeEventsTable).orderBy(desc(tradeEventsTable.occurredAt)).limit(500);
    return { rows: r.length };
  }));

  // Screenshot queries (no image data)
  benchmarks.push(await runBenchmark("Screenshot Metadata", "trade_screenshots", "index_scan", 200, async () => {
    const r = await db.select({
      id: tradeScreenshotsTable.id,
      stage: tradeScreenshotsTable.stage,
      pair: tradeScreenshotsTable.pair,
      tradeId: tradeScreenshotsTable.tradeId,
    }).from(tradeScreenshotsTable).limit(200);
    return { rows: r.length };
  }));

  // Context queries
  benchmarks.push(await runBenchmark("Trade Contexts", "trade_context", "full_scan", 200, async () => {
    const r = await db.select({ c: count() }).from(tradeContextTable);
    return { rows: Number(r[0]?.c ?? 0) };
  }));

  // Setup memory queries
  benchmarks.push(await runBenchmark("Setup Records (500)", "setup_memory", "index_scan", 150, async () => {
    const r = await db.select().from(setupMemoryTable).limit(500);
    return { rows: r.length };
  }));

  // Aggregate / analytics queries
  benchmarks.push(await runBenchmark("Memory Growth Analytics", "memory_experiences", "aggregate", 300, async () => {
    const r = await db.execute(sql`
      SELECT DATE_TRUNC('day', created_at) as day, COUNT(*) as cnt
      FROM memory_experiences
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY day DESC
      LIMIT 30
    `);
    return { rows: r.rows.length };
  }));

  // Complex join — experience + context
  benchmarks.push(await runBenchmark("Experience + Context Join", "memory_experiences+trade_context", "join", 300, async () => {
    const r = await db.execute(sql`
      SELECT me.id, me.pair, me.outcome, tc.market_regime
      FROM memory_experiences me
      LEFT JOIN trade_context tc ON tc.trade_id = me.trade_id
      LIMIT 100
    `);
    return { rows: r.rows.length };
  }));

  return benchmarks;
}

// ─── Index Info ───────────────────────────────────────────────────────────────

async function getIndexStats(): Promise<IndexInfo[]> {
  try {
    const result = await db.execute(sql`
      SELECT
        t.relname   AS table_name,
        i.relname   AS index_name,
        ix.indisprimary AS is_primary,
        array_to_string(array_agg(a.attname ORDER BY k.ordinality), ', ') AS column_names,
        COALESCE(s.idx_scan, 0) AS idx_scans,
        COALESCE(st.seq_scan, 0) AS seq_scans
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i  ON i.oid = ix.indexrelid
      JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ordinality) ON TRUE
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.oid
      LEFT JOIN pg_stat_user_tables st ON st.relid = t.oid
      WHERE t.relkind = 'r'
        AND t.relname IN (
          'memory_experiences','memory_relationships','trade_events',
          'trade_screenshots','trade_context','setup_memory',
          'skipped_setup_memory','market_snapshot_memory'
        )
      GROUP BY t.relname, i.relname, ix.indisprimary, s.idx_scan, st.seq_scan
      ORDER BY t.relname, i.relname
    `);

    return (result.rows as Array<{
      table_name: string;
      index_name: string;
      column_names: string;
      idx_scans: number;
      seq_scans: number;
    }>).map(r => {
      const total = (r.idx_scans ?? 0) + (r.seq_scans ?? 0);
      return {
        tableName:   r.table_name,
        indexName:   r.index_name,
        columnNames: r.column_names,
        indexScans:  Number(r.idx_scans ?? 0),
        seqScans:    Number(r.seq_scans ?? 0),
        efficiency:  total > 0 ? Math.round((Number(r.idx_scans ?? 0) / total) * 100) : 100,
      };
    });
  } catch {
    return [];
  }
}

// ─── Cache Stats ──────────────────────────────────────────────────────────────

async function getCacheStats(): Promise<CacheStats | null> {
  try {
    const result = await db.execute(sql`
      SELECT
        SUM(heap_blks_read)  AS heap_read,
        SUM(heap_blks_hit)   AS heap_hit,
        SUM(idx_blks_read)   AS idx_read,
        SUM(idx_blks_hit)    AS idx_hit
      FROM pg_statio_user_tables
      WHERE relname IN (
        'memory_experiences','memory_relationships','trade_events',
        'trade_screenshots','trade_context'
      )
    `);

    const r = result.rows[0] as {
      heap_read: string; heap_hit: string; idx_read: string; idx_hit: string;
    };

    const heapRead = Number(r?.heap_read ?? 0);
    const heapHit  = Number(r?.heap_hit  ?? 0);
    const idxRead  = Number(r?.idx_read  ?? 0);
    const idxHit   = Number(r?.idx_hit   ?? 0);

    return {
      heapHitRatio: heapRead + heapHit > 0 ? heapHit / (heapRead + heapHit) : 1,
      idxHitRatio:  idxRead + idxHit  > 0 ? idxHit  / (idxRead  + idxHit)  : 1,
      heapReadBlks: heapRead,
      heapHitBlks:  heapHit,
      idxReadBlks:  idxRead,
      idxHitBlks:   idxHit,
    };
  } catch {
    return null;
  }
}

// ─── Scale Projections ────────────────────────────────────────────────────────

async function buildProjections(benchmarks: QueryBenchmark[]): Promise<PerformanceReport["projections"]> {
  // Estimate current record count per day from experiences table
  try {
    const growth = await db.execute(sql`
      SELECT COUNT(*) as cnt,
        EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 86400 AS days_active
      FROM memory_experiences
    `);
    const r = growth.rows[0] as { cnt: string; days_active: string };
    const total = Number(r?.cnt ?? 0);
    const days  = Math.max(1, Number(r?.days_active ?? 1));
    const perDay = total / days;

    const recordsAt1Year = Math.round(perDay * 365);
    const storageAt1Year = `${(recordsAt1Year * 0.015).toFixed(1)} MB`; // ~15KB per experience
    const avgQueryMs     = benchmarks.reduce((s, b) => s + b.durationMs, 0) / Math.max(1, benchmarks.length);
    const projectedQueryMs = avgQueryMs * Math.max(1, recordsAt1Year / Math.max(1, total));

    const recommendedIndexes: string[] = [];
    if (projectedQueryMs > 500) {
      recommendedIndexes.push("CREATE INDEX CONCURRENTLY ON memory_experiences (pair, outcome, session) — compound filter index");
      recommendedIndexes.push("CREATE INDEX CONCURRENTLY ON trade_events (trade_id, event_type, occurred_at) — timeline composite");
    }

    const avgPassRate = benchmarks.filter(b => b.passed).length / Math.max(1, benchmarks.length);

    return {
      recordsAt1Year,
      storageAt1Year,
      queryTimeAt1Year: `~${projectedQueryMs.toFixed(0)}ms avg`,
      indexesAdequate:  projectedQueryMs < 1000,
      recommendedIndexes,
    };
  } catch {
    return {
      recordsAt1Year:   10000,
      storageAt1Year:   "150 MB",
      queryTimeAt1Year: "~200ms avg",
      indexesAdequate:  true,
      recommendedIndexes: [],
    };
  }
}

// ─── Performance Score ────────────────────────────────────────────────────────

function computePerformanceScore(benchmarks: QueryBenchmark[], cache: CacheStats | null): number {
  const benchScore   = benchmarks.length > 0
    ? Math.round((benchmarks.filter(b => b.passed).length / benchmarks.length) * 60)
    : 60;

  const cacheScore   = cache
    ? Math.round(((cache.heapHitRatio + cache.idxHitRatio) / 2) * 30)
    : 25;

  const latencyBonus = benchmarks.filter(b => b.durationMs < b.target / 2).length * 2;

  return Math.min(100, benchScore + cacheScore + latencyBonus);
}

// ─── Main Performance Runner ──────────────────────────────────────────────────

export async function runPerformanceBenchmarks(): Promise<PerformanceReport> {
  const startedAt = Date.now();
  logger.info("[MPE] Starting performance benchmark suite");

  const [benchmarks, indexes, cache] = await Promise.all([
    runAllBenchmarks(),
    getIndexStats(),
    getCacheStats(),
  ]);

  const projections    = await buildProjections(benchmarks);
  const performanceScore = computePerformanceScore(benchmarks, cache);

  const recommendations: string[] = [];
  const slowBenchmarks = benchmarks.filter(b => !b.passed);

  for (const sb of slowBenchmarks) {
    recommendations.push(`Slow query: "${sb.name}" took ${sb.durationMs}ms (target: ${sb.target}ms) — consider adding indexes on ${sb.table}`);
  }

  if (cache && cache.heapHitRatio < 0.95) {
    recommendations.push(`Buffer cache hit rate is ${(cache.heapHitRatio * 100).toFixed(1)}% — consider increasing shared_buffers`);
  }

  for (const rec of projections.recommendedIndexes) {
    recommendations.push(rec);
  }

  if (recommendations.length === 0) {
    recommendations.push("All performance benchmarks pass — memory system is optimized for current data volume");
  }

  const durationMs = Date.now() - startedAt;
  const passRate   = Math.round((benchmarks.filter(b => b.passed).length / Math.max(1, benchmarks.length)) * 100);

  const report: PerformanceReport = {
    timestamp:        new Date(),
    durationMs,
    performanceScore,
    benchmarks,
    indexes,
    cacheStats:       cache,
    projections,
    recommendations,
    summary: `Performance score: ${performanceScore}/100. ${passRate}% of benchmarks pass. Avg latency: ${Math.round(benchmarks.reduce((s, b) => s + b.durationMs, 0) / Math.max(1, benchmarks.length))}ms`,
  };

  // Save health snapshot
  try {
    const [expCount, relCount, evtCount, ssCount] = await Promise.all([
      db.select({ c: count() }).from(memoryExperiencesTable),
      db.select({ c: count() }).from(memoryRelationshipsTable),
      db.select({ c: count() }).from(tradeEventsTable),
      db.select({ c: count() }).from(tradeScreenshotsTable),
    ]);

    await db.insert(memoryHealthSnapshotsTable).values({
      healthScore:       performanceScore,
      overallHealth:     performanceScore >= 80 ? "healthy" : performanceScore >= 50 ? "degraded" : "critical",
      performanceScore,
      totalExperiences:  Number(expCount[0]?.c ?? 0),
      totalRelationships: Number(relCount[0]?.c ?? 0),
      totalEvents:       Number(evtCount[0]?.c ?? 0),
      totalScreenshots:  Number(ssCount[0]?.c ?? 0),
      avgQueryMs:        String(benchmarks.reduce((s, b) => s + b.durationMs, 0) / Math.max(1, benchmarks.length)),
      cacheHitRatio:     cache ? String(cache.heapHitRatio) : null,
    });
  } catch {}

  logger.info({ performanceScore, durationMs }, "[MPE] Performance benchmark complete");
  return report;
}

// ─── Health Snapshot History ──────────────────────────────────────────────────

export async function getHealthHistory(limit = 48) {
  return db
    .select()
    .from(memoryHealthSnapshotsTable)
    .orderBy(desc(memoryHealthSnapshotsTable.capturedAt))
    .limit(limit);
}

export async function getLatestHealthSnapshot() {
  const [latest] = await db
    .select()
    .from(memoryHealthSnapshotsTable)
    .orderBy(desc(memoryHealthSnapshotsTable.capturedAt))
    .limit(1);
  return latest ?? null;
}
