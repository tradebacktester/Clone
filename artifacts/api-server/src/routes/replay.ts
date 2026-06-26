import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc } from "drizzle-orm";
import { db, replaySessionsTable } from "@workspace/db";
import { runReplay, computeStats, generateValidationReport, type ReplayConfig } from "@workspace/market-analysis";

const router: IRouter = Router();

const VALID_PAIRS = ["EURUSD", "GBPUSD", "USDJPY"] as const;
const VALID_TIMEFRAMES = ["15m", "1h", "4h", "1d"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateRunBody(body: unknown): { ok: true; data: ReplayConfig } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Request body is required" };
  const b = body as Record<string, unknown>;

  if (!VALID_PAIRS.includes(b["pair"] as typeof VALID_PAIRS[number]))
    return { ok: false, error: `pair must be one of ${VALID_PAIRS.join(", ")}` };
  if (!VALID_TIMEFRAMES.includes(b["timeframe"] as typeof VALID_TIMEFRAMES[number]))
    return { ok: false, error: `timeframe must be one of ${VALID_TIMEFRAMES.join(", ")}` };
  if (typeof b["startDate"] !== "string" || !DATE_RE.test(b["startDate"]))
    return { ok: false, error: "startDate must be YYYY-MM-DD" };
  if (typeof b["endDate"] !== "string" || !DATE_RE.test(b["endDate"]))
    return { ok: false, error: "endDate must be YYYY-MM-DD" };

  return {
    ok: true,
    data: {
      pair: b["pair"] as ReplayConfig["pair"],
      timeframe: b["timeframe"] as ReplayConfig["timeframe"],
      startDate: b["startDate"] as string,
      endDate: b["endDate"] as string,
    },
  };
}

// POST /replay/run
router.post("/replay/run", async (req: Request, res: Response): Promise<void> => {
  const validated = validateRunBody(req.body);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }

  const config = validated.data;
  const startMs = new Date(config.startDate).getTime();
  const endMs = new Date(config.endDate).getTime();

  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
    res.status(400).json({ error: "endDate must be after startDate" });
    return;
  }
  const daysDiff = (endMs - startMs) / (1000 * 60 * 60 * 24);
  if (daysDiff > 730) {
    res.status(400).json({ error: "Date range cannot exceed 730 days" });
    return;
  }

  const [inserted] = await db
    .insert(replaySessionsTable)
    .values({
      pair: config.pair,
      timeframe: config.timeframe,
      startDate: config.startDate,
      endDate: config.endDate,
      status: "running",
    })
    .returning();

  if (!inserted) {
    res.status(500).json({ error: "Failed to create replay session" });
    return;
  }

  try {
    const result = runReplay(config);

    const wins = result.stats.totalWins;
    const total = result.stats.totalTradesTaken;
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(2) : "0";

    await db
      .update(replaySessionsTable)
      .set({
        status: "complete",
        totalCandles: result.stats.totalCandles,
        totalEvaluated: result.stats.totalEvaluated,
        totalTradesTaken: total,
        totalWins: wins,
        totalLosses: result.stats.totalLosses,
        winRate,
        falsePositives: result.stats.falsePositives,
        falseNegatives: result.stats.falseNegatives,
        missedOpportunities: result.stats.missedOpportunities,
        biasFlags: result.bias as unknown as Record<string, unknown>[],
        tracesJson: result.traces as unknown as Record<string, unknown>[],
        candlesJson: result.candles.map((c: { time: Date; open: number; high: number; low: number; close: number; volume?: number }) => ({
          time: c.time.toISOString(),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume ?? 0,
        })) as unknown as Record<string, unknown>[],
        reportGenerated: true,
      })
      .where(eq(replaySessionsTable.id, inserted.id));

    res.json({
      id: inserted.id,
      status: "complete",
      pair: config.pair,
      timeframe: config.timeframe,
      startDate: config.startDate,
      endDate: config.endDate,
      totalCandles: result.stats.totalCandles,
      totalEvaluated: result.stats.totalEvaluated,
      totalTradesTaken: total,
      totalWins: wins,
      totalLosses: result.stats.totalLosses,
      winRate: parseFloat(winRate),
      falsePositives: result.stats.falsePositives,
      falseNegatives: result.stats.falseNegatives,
      missedOpportunities: result.stats.missedOpportunities,
      avgFinalScore: result.stats.avgFinalScore,
      avgRiskReward: result.stats.avgRiskReward,
      bias: result.bias,
      stats: result.stats,
      durationMs: result.durationMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(replaySessionsTable)
      .set({ status: "failed", errorMessage: message })
      .where(eq(replaySessionsTable.id, inserted.id));
    res.status(500).json({ error: "Replay failed", details: message });
  }
});

// GET /replay/sessions
router.get("/replay/sessions", async (_req: Request, res: Response): Promise<void> => {
  const sessions = await db
    .select({
      id: replaySessionsTable.id,
      pair: replaySessionsTable.pair,
      timeframe: replaySessionsTable.timeframe,
      startDate: replaySessionsTable.startDate,
      endDate: replaySessionsTable.endDate,
      status: replaySessionsTable.status,
      totalCandles: replaySessionsTable.totalCandles,
      totalEvaluated: replaySessionsTable.totalEvaluated,
      totalTradesTaken: replaySessionsTable.totalTradesTaken,
      totalWins: replaySessionsTable.totalWins,
      totalLosses: replaySessionsTable.totalLosses,
      winRate: replaySessionsTable.winRate,
      falsePositives: replaySessionsTable.falsePositives,
      falseNegatives: replaySessionsTable.falseNegatives,
      reportGenerated: replaySessionsTable.reportGenerated,
      errorMessage: replaySessionsTable.errorMessage,
      createdAt: replaySessionsTable.createdAt,
    })
    .from(replaySessionsTable)
    .orderBy(desc(replaySessionsTable.createdAt))
    .limit(50);

  res.json(
    sessions.map((s: { winRate: string; createdAt: Date; [key: string]: unknown }) => ({
      ...s,
      winRate: parseFloat(s.winRate),
      createdAt: s.createdAt.toISOString(),
    })),
  );
});

// GET /replay/:id
router.get("/replay/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const [session] = await db
    .select()
    .from(replaySessionsTable)
    .where(eq(replaySessionsTable.id, id))
    .limit(1);

  if (!session) {
    res.status(404).json({ error: "Replay session not found" });
    return;
  }

  res.json({
    id: session.id,
    pair: session.pair,
    timeframe: session.timeframe,
    startDate: session.startDate,
    endDate: session.endDate,
    status: session.status,
    totalCandles: session.totalCandles,
    totalEvaluated: session.totalEvaluated,
    totalTradesTaken: session.totalTradesTaken,
    totalWins: session.totalWins,
    totalLosses: session.totalLosses,
    winRate: parseFloat(session.winRate),
    falsePositives: session.falsePositives,
    falseNegatives: session.falseNegatives,
    missedOpportunities: session.missedOpportunities,
    reportGenerated: session.reportGenerated,
    biasFlags: session.biasFlags,
    traces: session.tracesJson,
    candles: session.candlesJson,
    createdAt: session.createdAt.toISOString(),
  });
});

// GET /replay/:id/candle/:index
router.get("/replay/:id/candle/:index", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const candleIndex = parseInt(String(req.params["index"] ?? "0"), 10);

  if (isNaN(id) || isNaN(candleIndex)) {
    res.status(400).json({ error: "Invalid parameters" });
    return;
  }

  const [session] = await db
    .select({ tracesJson: replaySessionsTable.tracesJson, candlesJson: replaySessionsTable.candlesJson })
    .from(replaySessionsTable)
    .where(eq(replaySessionsTable.id, id))
    .limit(1);

  if (!session) {
    res.status(404).json({ error: "Replay session not found" });
    return;
  }

  const traces = session.tracesJson as Array<{ candleIndex: number }>;
  const trace = traces.find(t => t.candleIndex === candleIndex);

  const candles = session.candlesJson as Array<{ time: string }>;
  const candle = candles[candleIndex] ?? null;

  res.json({ trace: trace ?? null, candle });
});

// POST /replay/:id/report
router.post("/replay/:id/report", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const [session] = await db
    .select()
    .from(replaySessionsTable)
    .where(eq(replaySessionsTable.id, id))
    .limit(1);

  if (!session) {
    res.status(404).json({ error: "Replay session not found" });
    return;
  }

  if (session.status !== "complete") {
    res.status(400).json({ error: "Session is not complete" });
    return;
  }

  type TraceRow = Parameters<typeof computeStats>[0][number];
  type BiasRow = Parameters<typeof generateValidationReport>[2];

  const traces = session.tracesJson as TraceRow[];
  // biasFlags stores the full BiasSummary object (or falls back to empty summary)
  const storedBias = session.biasFlags as unknown;
  const bias: BiasRow = (storedBias && typeof storedBias === "object" && "flags" in (storedBias as object))
    ? storedBias as BiasRow
    : {
        flags: Array.isArray(storedBias) ? (storedBias as BiasRow["flags"]) : [],
        overallRating: "clean",
        lookAheadDetected: false,
        repaintingDetected: false,
        futureLeakageDetected: false,
        duplicateSignals: 0,
        invalidEntries: 0,
      };
  const config: ReplayConfig = {
    pair: session.pair as ReplayConfig["pair"],
    timeframe: session.timeframe as ReplayConfig["timeframe"],
    startDate: session.startDate,
    endDate: session.endDate,
  };

  const stats = computeStats(traces);
  const reportText = generateValidationReport(config, traces, bias, stats);

  res.json({ reportText, stats });
});

export default router;
