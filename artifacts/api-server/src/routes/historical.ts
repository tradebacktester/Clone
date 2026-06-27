import { Router } from "express";
import * as fs from "fs";
import * as path from "path";
import { db } from "@workspace/db";
import { historicalSessionsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  createDefaultRegistry,
  computeDataQuality,
  cacheCandles,
  getCachedCandles,
  isCacheValid,
  getCacheStatus,
  runHistoricalValidation,
  computeExtendedMetrics,
  computeBreakdowns,
  detectHistoricalBias,
  generateHistoricalReport,
  type HistoricalConfig,
} from "@workspace/market-analysis";
import type { Pair, Timeframe } from "@workspace/market-analysis";

const router = Router();
const registry = createDefaultRegistry();

// ── GET /historical/providers ─────────────────────────────────────────────────
router.get("/historical/providers", async (_req, res) => {
  try {
    const all = registry.getAll();
    const statuses = await Promise.all(
      all.map(async (p) => ({
        id: p.id,
        name: p.name,
        priority: p.priority,
        configured: await Promise.resolve(p.isConfigured()),
        supportedPairs: (["EURUSD", "GBPUSD", "USDJPY"] as Pair[]).filter((pair) =>
          p.supportsPair(pair),
        ),
        supportedTimeframes: (["15m", "1h", "4h", "1d"] as Timeframe[]).filter((tf) =>
          p.supportsTimeframe(tf),
        ),
        maxHistoryDays: {
          "15m": p.maxHistoryDays("15m"),
          "1h":  p.maxHistoryDays("1h"),
          "4h":  p.maxHistoryDays("4h"),
          "1d":  p.maxHistoryDays("1d"),
        },
      })),
    );
    res.json({ providers: statuses });
  } catch (err) {
    logger.error({ err }, "historical providers error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /historical/data-status ───────────────────────────────────────────────
router.get("/historical/data-status", async (req, res) => {
  try {
    const pairs:      Pair[]      = ["EURUSD", "GBPUSD", "USDJPY"];
    const timeframes: Timeframe[] = ["15m", "1h", "4h", "1d"];
    const statuses = await Promise.all(
      pairs.flatMap((pair) => timeframes.map((tf) => getCacheStatus(pair, tf))),
    );
    res.json({ statuses });
  } catch (err) {
    logger.error({ err }, "historical data-status error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /historical/fetch ────────────────────────────────────────────────────
router.post("/historical/fetch", async (req, res) => {
  try {
    const { pair, timeframe, startDate, endDate, forceRefresh = false } = req.body as {
      pair: Pair;
      timeframe: Timeframe;
      startDate: string;
      endDate: string;
      forceRefresh?: boolean;
    };

    if (!pair || !timeframe || !startDate || !endDate) {
      res.status(400).json({ error: "pair, timeframe, startDate, endDate required" });
      return;
    }

    const start = new Date(startDate);
    const end   = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({ error: "Invalid date format" });
      return;
    }

    // Use cache if valid and not forced
    if (!forceRefresh && await isCacheValid(pair, timeframe, start, end)) {
      const cached = await getCachedCandles(pair, timeframe, start, end);
      res.json({ source: "cache", candles: cached.length, message: `Loaded ${cached.length} candles from cache` });
      return;
    }

    const result = await registry.fetchBest(pair, timeframe, start, end);

    if (result.candles.length === 0) {
      res.json({
        source: result.provider, candles: 0, warnings: result.warnings,
        gaps: result.gaps, message: "No data available from any configured provider",
      });
      return;
    }

    const inserted = await cacheCandles(result);
    const quality = computeDataQuality(pair, timeframe, result);

    res.json({
      source: result.provider,
      candles: result.candles.length,
      inserted,
      quality: { grade: quality.grade, overallScore: quality.overallScore, coveragePct: quality.coveragePct },
      gaps: result.gaps.length,
      warnings: result.warnings,
      notes: result.notes,
    });
  } catch (err) {
    logger.error({ err }, "historical fetch error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /historical/run ──────────────────────────────────────────────────────
router.post("/historical/run", async (req, res) => {
  try {
    const config = req.body as HistoricalConfig;
    const { pair, timeframe, startDate, endDate } = config;

    if (!pair || !timeframe || !startDate || !endDate) {
      res.status(400).json({ error: "pair, timeframe, startDate, endDate required" });
      return;
    }

    const start = new Date(startDate);
    const end   = new Date(endDate);

    // Create session record immediately
    const [session] = await db
      .insert(historicalSessionsTable)
      .values({
        pair,
        timeframe,
        startDate,
        endDate,
        status: "running",
      })
      .returning();

    const sessionId = session!.id;

    res.json({ sessionId, status: "running", message: "Validation started" });

    // Fetch data if not cached
    setImmediate(async () => {
      try {
        // Auto-fetch if not cached
        const cached = await getCachedCandles(pair, timeframe, start, end);
        let candles = cached;
        let fetchResult;

        if (cached.length === 0) {
          fetchResult = await registry.fetchBest(pair, timeframe, start, end);
          if (fetchResult.candles.length > 0) {
            await cacheCandles(fetchResult);
            candles = fetchResult.candles;
          }
        }

        if (candles.length === 0) {
          await db.update(historicalSessionsTable)
            .set({
              status: "failed",
              errorMessage: "No data available from any provider for this pair/timeframe/period",
              updatedAt: new Date(),
            })
            .where(eq(historicalSessionsTable.id, sessionId));
          return;
        }

        // Compute data quality
        const fakeResult = {
          candles,
          provider: cached.length > 0 ? "cache" : (fetchResult?.provider ?? "unknown"),
          pair,
          timeframe,
          requestedStart: start,
          requestedEnd: end,
          actualStart: candles[0]?.time ?? null,
          actualEnd: candles[candles.length - 1]?.time ?? null,
          gaps: fetchResult?.gaps ?? [],
          totalExpected: 0,
          notes: fetchResult?.notes ?? [],
          warnings: fetchResult?.warnings ?? [],
        };
        const quality = computeDataQuality(pair, timeframe, fakeResult);

        if (quality.disabledForValidation) {
          await db.update(historicalSessionsTable)
            .set({
              status: "failed",
              errorMessage: quality.disabledReason ?? "Insufficient data quality",
              dataQuality: quality as unknown as Record<string, unknown>,
              updatedAt: new Date(),
            })
            .where(eq(historicalSessionsTable.id, sessionId));
          return;
        }

        // Run validation
        const validationResult = runHistoricalValidation(config, candles);
        const metrics    = computeExtendedMetrics(validationResult.trades);
        const breakdowns = computeBreakdowns(validationResult.trades);
        const bias       = detectHistoricalBias(validationResult.trades, candles);
        const reportText = generateHistoricalReport(
          config, quality, metrics, breakdowns, bias,
          validationResult.strategyVsActual, validationResult.trades,
        );

        await db.update(historicalSessionsTable)
          .set({
            status: "complete",
            dataQuality:  quality as unknown as Record<string, unknown>,
            metrics:      metrics as unknown as Record<string, unknown>,
            breakdowns:   breakdowns as unknown as Record<string, unknown>,
            bias:         bias as unknown as Record<string, unknown>,
            totalCandles: validationResult.totalCandles,
            totalEvaluated: validationResult.totalEvaluated,
            totalTrades:  validationResult.trades.length,
            totalWins:    metrics.wins,
            totalLosses:  metrics.losses,
            winRate:      metrics.winRate.toFixed(2),
            profitFactor: metrics.profitFactor.toFixed(4),
            maxDrawdown:  metrics.maxDrawdownPct.toFixed(2),
            sharpeRatio:  metrics.sharpeRatio.toFixed(4),
            reportText,
            reportGenerated: true,
            updatedAt: new Date(),
          })
          .where(eq(historicalSessionsTable.id, sessionId));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db.update(historicalSessionsTable)
          .set({
            status: "failed",
            errorMessage: msg,
            updatedAt: new Date(),
          })
          .where(eq(historicalSessionsTable.id, sessionId))
          .catch(() => {});
      }
    });
  } catch (err) {
    logger.error({ err }, "historical run error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /historical/sessions ──────────────────────────────────────────────────
router.get("/historical/sessions", async (_req, res) => {
  try {
    const sessions = await db
      .select({
        id: historicalSessionsTable.id,
        pair: historicalSessionsTable.pair,
        timeframe: historicalSessionsTable.timeframe,
        startDate: historicalSessionsTable.startDate,
        endDate: historicalSessionsTable.endDate,
        status: historicalSessionsTable.status,
        totalTrades: historicalSessionsTable.totalTrades,
        totalCandles: historicalSessionsTable.totalCandles,
        winRate: historicalSessionsTable.winRate,
        profitFactor: historicalSessionsTable.profitFactor,
        maxDrawdown: historicalSessionsTable.maxDrawdown,
        sharpeRatio: historicalSessionsTable.sharpeRatio,
        reportGenerated: historicalSessionsTable.reportGenerated,
        createdAt: historicalSessionsTable.createdAt,
      })
      .from(historicalSessionsTable)
      .orderBy(desc(historicalSessionsTable.createdAt))
      .limit(50);
    res.json({ sessions });
  } catch (err) {
    logger.error({ err }, "historical sessions error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /historical/:id ───────────────────────────────────────────────────────
router.get("/historical/:id", async (req, res) => {
  try {
    const id = parseInt(req.params["id"] ?? "0");
    const [session] = await db
      .select()
      .from(historicalSessionsTable)
      .where(eq(historicalSessionsTable.id, id));

    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    res.json({ session });
  } catch (err) {
    logger.error({ err }, "historical get-session error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /historical/:id/report ────────────────────────────────────────────────
router.get("/historical/:id/report", async (req, res) => {
  try {
    const id = parseInt(req.params["id"] ?? "0");
    const [session] = await db
      .select({
        reportText: historicalSessionsTable.reportText,
        reportGenerated: historicalSessionsTable.reportGenerated,
        pair: historicalSessionsTable.pair,
        timeframe: historicalSessionsTable.timeframe,
      })
      .from(historicalSessionsTable)
      .where(eq(historicalSessionsTable.id, id));

    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (!session.reportGenerated || !session.reportText) {
      res.status(404).json({ error: "Report not yet generated" });
      return;
    }

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.send(session.reportText);
  } catch (err) {
    logger.error({ err }, "historical report error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /historical/upload-csv ───────────────────────────────────────────────
router.post("/historical/upload-csv", async (req, res) => {
  try {
    const { type = "local", filename, content } = req.body as {
      type?: "mt5" | "local";
      filename: string;
      content: string; // base64 encoded
    };

    if (!filename || !content) {
      res.status(400).json({ error: "filename and content (base64) required" });
      return;
    }

    const dir = path.join(process.cwd(), "uploads", "market-data", type);
    fs.mkdirSync(dir, { recursive: true });

    const safeFilename = path.basename(filename).replace(/[^a-zA-Z0-9_\-\.]/g, "_");
    const filePath = path.join(dir, safeFilename);
    const buffer = Buffer.from(content, "base64");
    fs.writeFileSync(filePath, buffer);

    res.json({
      success: true,
      path: filePath,
      size: buffer.length,
      message: `CSV saved to uploads/market-data/${type}/${safeFilename}`,
    });
    return;
  } catch (err) {
    logger.error({ err }, "historical upload-csv error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /historical/:id ────────────────────────────────────────────────────
router.delete("/historical/:id", async (req, res) => {
  try {
    const id = parseInt(req.params["id"] ?? "0");
    await db.delete(historicalSessionsTable).where(eq(historicalSessionsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "historical delete error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
