import { Router, type IRouter } from "express";
import { db, tradesTable, tradeReviewsTable, signalLogTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const INITIAL_BALANCE = 10_000;

// ── GET /paper/workspace/stats ─────────────────────────────────────────────
router.get("/paper/workspace/stats", async (_req, res): Promise<void> => {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const weekStart = new Date();
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    weekStart.setUTCHours(0, 0, 0, 0);

    const [agg] = await db.select({
      totalClosed: sql<string>`COUNT(*) FILTER (WHERE status = 'closed')`,
      winCount:    sql<string>`COUNT(*) FILTER (WHERE status = 'closed' AND pnl > 0)`,
      lossCount:   sql<string>`COUNT(*) FILTER (WHERE status = 'closed' AND pnl <= 0)`,
      grossProfit: sql<string>`COALESCE(SUM(pnl) FILTER (WHERE status = 'closed' AND pnl > 0), 0)`,
      grossLoss:   sql<string>`COALESCE(ABS(SUM(pnl) FILTER (WHERE status = 'closed' AND pnl < 0)), 0)`,
      totalPnl:    sql<string>`COALESCE(SUM(pnl) FILTER (WHERE status = 'closed'), 0)`,
      dailyPnl:    sql<string>`COALESCE(SUM(pnl) FILTER (WHERE status = 'closed' AND closed_at >= ${todayStart.toISOString()}), 0)`,
      weeklyPnl:   sql<string>`COALESCE(SUM(pnl) FILTER (WHERE status = 'closed' AND closed_at >= ${weekStart.toISOString()}), 0)`,
    }).from(tradesTable);

    const totalClosed = parseInt(agg?.totalClosed ?? "0", 10);
    const winCount    = parseInt(agg?.winCount    ?? "0", 10);
    const grossProfit = parseFloat(agg?.grossProfit ?? "0");
    const grossLoss   = parseFloat(agg?.grossLoss   ?? "0");
    const totalPnl    = parseFloat(agg?.totalPnl    ?? "0");

    const winRate      = totalClosed > 0 ? (winCount / totalClosed) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
    const balance      = INITIAL_BALANCE + totalPnl;

    // Signal stats
    const [sigAgg] = await db.select({
      totalSignals:    sql<string>`COUNT(*)`,
      executedSignals: sql<string>`COUNT(*) FILTER (WHERE executed = true)`,
    }).from(signalLogTable);

    // Review stats
    const reviews = await db.select({
      agreement: tradeReviewsTable.agreement,
      confidence: tradeReviewsTable.confidence,
    }).from(tradeReviewsTable);

    const totalReviewed  = reviews.length;
    const agreeCount     = reviews.filter(r => r.agreement === "agree").length;
    const disagreeCount  = reviews.filter(r => r.agreement === "disagree").length;
    const agreementRate  = totalReviewed > 0 ? (agreeCount / totalReviewed) * 100 : null;

    // Bot mistakes = disagree reviews (bot took a trade trader disagreed with)
    const botMistakes    = disagreeCount;
    // My mistakes = trades trader agreed with that still lost
    const agreedTradeIds = reviews.filter(r => r.agreement === "agree").map(r => r);

    res.json({
      totalTrades:    totalClosed,
      winRate:        Math.round(winRate * 10) / 10,
      profitFactor:   Math.round(profitFactor * 100) / 100,
      totalPnl:       Math.round(totalPnl * 100) / 100,
      balance:        Math.round(balance * 100) / 100,
      dailyPnl:       Math.round(parseFloat(agg?.dailyPnl ?? "0") * 100) / 100,
      weeklyPnl:      Math.round(parseFloat(agg?.weeklyPnl ?? "0") * 100) / 100,
      agreementRate:  agreementRate != null ? Math.round(agreementRate * 10) / 10 : null,
      totalReviewed,
      agreeCount,
      botMistakes,
      totalSignals:    parseInt(sigAgg?.totalSignals ?? "0", 10),
      executedSignals: parseInt(sigAgg?.executedSignals ?? "0", 10),
    });
  } catch (err) {
    logger.error({ err }, "paper/workspace/stats failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /paper/workspace/trades ───────────────────────────────────────────
router.get("/paper/workspace/trades", async (req, res): Promise<void> => {
  try {
    const limitRaw = req.query["limit"];
    const offsetRaw = req.query["offset"];
    const limit  = Math.min(parseInt(String(limitRaw  ?? "50"), 10), 200);
    const offset = parseInt(String(offsetRaw ?? "0"),  10);

    const trades = await db
      .select()
      .from(tradesTable)
      .orderBy(desc(tradesTable.openedAt))
      .limit(limit)
      .offset(offset);

    const reviews = await db.select().from(tradeReviewsTable);
    const reviewMap = new Map(reviews.map(r => [r.tradeId, r]));

    const result = trades.map(t => ({
      id: t.id,
      pair: t.pair,
      direction: t.direction,
      status: t.status,
      entryPrice: parseFloat(t.entryPrice),
      stopLoss: parseFloat(t.stopLoss),
      takeProfit: parseFloat(t.takeProfit),
      closedPrice: t.closedPrice ? parseFloat(t.closedPrice) : null,
      lotSize: parseFloat(t.lotSize),
      pnl: t.pnl ? parseFloat(t.pnl) : null,
      pnlPercent: t.pnlPercent ? parseFloat(t.pnlPercent) : null,
      session: t.session,
      setupScore: parseFloat(t.setupScore ?? "0"),
      confidence: parseFloat(t.setupScore ?? "0"),
      amdPattern: t.amdPattern,
      zoneType: t.zoneType,
      regime: t.regime,
      regimeConfidence: t.regimeConfidence ? parseFloat(t.regimeConfidence) : null,
      slippagePips: t.slippagePips ? parseFloat(t.slippagePips) : null,
      exitSlippagePips: t.exitSlippagePips ? parseFloat(t.exitSlippagePips) : null,
      spreadPips: t.spreadPips ? parseFloat(t.spreadPips) : null,
      newsStatus: t.newsStatus ?? "clear",
      screenshots: (t.screenshots as string[] | null) ?? [],
      ruleEvaluation: t.ruleEvaluation ?? null,
      explanation: t.explanation ?? null,
      tqi: t.tqi ? parseFloat(t.tqi) : null,
      tqiGrade: t.tqiGrade ?? null,
      mtfAligned: t.mtfAligned ?? null,
      mtfScore: t.mtfScore ? parseFloat(t.mtfScore) : null,
      riskRewardRatio: parseFloat(t.riskRewardRatio ?? "0"),
      closeReason: t.closeReason ?? null,
      openedAt: t.openedAt?.toISOString() ?? null,
      closedAt: t.closedAt?.toISOString() ?? null,
      review: reviewMap.get(t.id) ? {
        agreement: reviewMap.get(t.id)!.agreement,
        reason: reviewMap.get(t.id)!.reason ?? null,
        confidence: reviewMap.get(t.id)!.confidence ? parseFloat(reviewMap.get(t.id)!.confidence!) : null,
        notes: reviewMap.get(t.id)!.notes ?? null,
        reviewedAt: reviewMap.get(t.id)!.reviewedAt?.toISOString() ?? null,
      } : null,
    }));

    const [countRow] = await db.select({ count: sql<string>`COUNT(*)` }).from(tradesTable);
    res.json({ trades: result, total: parseInt(countRow?.count ?? "0", 10) });
  } catch (err) {
    logger.error({ err }, "paper/workspace/trades failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /paper/workspace/review/:tradeId ────────────────────────────────
router.post("/paper/workspace/review/:tradeId", async (req, res): Promise<void> => {
  const tradeId = parseInt(req.params["tradeId"] ?? "", 10);
  if (isNaN(tradeId)) {
    res.status(400).json({ error: "Invalid trade ID" });
    return;
  }

  const body = req.body as { agreement?: string; reason?: string; confidence?: number; notes?: string };
  const { agreement, reason, notes } = body;
  const confidence = body.confidence != null ? Number(body.confidence) : undefined;

  if (agreement !== "agree" && agreement !== "disagree") {
    res.status(400).json({ error: "agreement must be 'agree' or 'disagree'" });
    return;
  }
  if (confidence != null && (isNaN(confidence) || confidence < 0 || confidence > 100)) {
    res.status(400).json({ error: "confidence must be 0–100" });
    return;
  }

  if (agreement === "disagree" && !reason?.trim()) {
    res.status(400).json({ error: "Reason is required when disagreeing" });
    return;
  }

  try {
    const [trade] = await db.select({ id: tradesTable.id }).from(tradesTable).where(eq(tradesTable.id, tradeId)).limit(1);
    if (!trade) {
      res.status(404).json({ error: "Trade not found" });
      return;
    }

    await db
      .insert(tradeReviewsTable)
      .values({
        tradeId,
        agreement,
        reason:     reason ?? null,
        confidence: confidence != null ? String(confidence) : null,
        notes:      notes ?? null,
      })
      .onConflictDoUpdate({
        target: tradeReviewsTable.tradeId,
        set: {
          agreement,
          reason:     reason ?? null,
          confidence: confidence != null ? String(confidence) : null,
          notes:      notes ?? null,
          reviewedAt: new Date(),
        },
      });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err, tradeId }, "paper/workspace/review POST failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /paper/workspace/review/:tradeId ─────────────────────────────────
router.get("/paper/workspace/review/:tradeId", async (req, res): Promise<void> => {
  const tradeId = parseInt(req.params["tradeId"] ?? "", 10);
  if (isNaN(tradeId)) {
    res.status(400).json({ error: "Invalid trade ID" });
    return;
  }
  try {
    const [review] = await db.select().from(tradeReviewsTable).where(eq(tradeReviewsTable.tradeId, tradeId)).limit(1);
    if (!review) {
      res.json({ review: null });
      return;
    }
    res.json({
      review: {
        agreement:  review.agreement,
        reason:     review.reason ?? null,
        confidence: review.confidence ? parseFloat(review.confidence) : null,
        notes:      review.notes ?? null,
        reviewedAt: review.reviewedAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /paper/workspace/signals ─────────────────────────────────────────
router.get("/paper/workspace/signals", async (req, res): Promise<void> => {
  try {
    const limitRaw = req.query["limit"];
    const limit = Math.min(parseInt(String(limitRaw ?? "100"), 10), 500);

    const signals = await db
      .select()
      .from(signalLogTable)
      .orderBy(desc(signalLogTable.generatedAt))
      .limit(limit);

    res.json({
      signals: signals.map(s => ({
        id:           s.id,
        pair:         s.pair,
        direction:    s.direction,
        confidence:   parseFloat(s.confidence),
        amdPhase:     s.amdPhase,
        zoneType:     s.zoneType,
        zoneStrength: s.zoneStrength ? parseFloat(s.zoneStrength) : null,
        regime:       s.regime ?? null,
        newsStatus:   s.newsStatus ?? "clear",
        session:      s.session,
        executed:     s.executed,
        tradeId:      s.tradeId ?? null,
        skipReason:   s.skipReason ?? null,
        entryPrice:   s.entryPrice ? parseFloat(s.entryPrice) : null,
        stopLoss:     s.stopLoss ? parseFloat(s.stopLoss) : null,
        takeProfit:   s.takeProfit ? parseFloat(s.takeProfit) : null,
        riskReward:   s.riskReward ? parseFloat(s.riskReward) : null,
        generatedAt:  s.generatedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    logger.error({ err }, "paper/workspace/signals failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /paper/workspace/screenshot/:tradeId ─────────────────────────────
router.post("/paper/workspace/screenshot/:tradeId", async (req, res): Promise<void> => {
  const tradeId = parseInt(req.params["tradeId"] ?? "", 10);
  if (isNaN(tradeId)) { res.status(400).json({ error: "Invalid trade ID" }); return; }

  const { dataUrl } = req.body as { dataUrl?: string };
  if (!dataUrl || typeof dataUrl !== "string") {
    res.status(400).json({ error: "dataUrl required" });
    return;
  }

  try {
    const [trade] = await db.select({ id: tradesTable.id, screenshots: tradesTable.screenshots }).from(tradesTable).where(eq(tradesTable.id, tradeId)).limit(1);
    if (!trade) { res.status(404).json({ error: "Trade not found" }); return; }

    const existing = (trade.screenshots as string[] | null) ?? [];
    const updated  = [...existing, dataUrl].slice(-10);

    await db.update(tradesTable).set({ screenshots: updated }).where(eq(tradesTable.id, tradeId));
    res.json({ success: true, count: updated.length });
  } catch (err) {
    logger.error({ err }, "screenshot upload failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /paper/workspace/export/csv ──────────────────────────────────────
router.get("/paper/workspace/export/csv", async (_req, res): Promise<void> => {
  try {
    const trades = await db.select().from(tradesTable).orderBy(desc(tradesTable.openedAt));
    const reviews = await db.select().from(tradeReviewsTable);
    const reviewMap = new Map(reviews.map(r => [r.tradeId, r]));

    const headers = [
      "id","pair","direction","status","entry_price","stop_loss","take_profit",
      "closed_price","lot_size","pnl","pnl_percent","session","confidence",
      "amd_pattern","zone_type","regime","slippage_pips","exit_slippage_pips",
      "spread_pips","news_status","tqi","tqi_grade","mtf_aligned","mtf_score",
      "risk_reward","close_reason","opened_at","closed_at",
      "review_agreement","review_reason","review_confidence","review_notes","reviewed_at",
    ];

    const rows = trades.map(t => {
      const rv = reviewMap.get(t.id);
      return [
        t.id, t.pair, t.direction, t.status,
        t.entryPrice, t.stopLoss, t.takeProfit,
        t.closedPrice ?? "", t.lotSize,
        t.pnl ?? "", t.pnlPercent ?? "",
        t.session, t.setupScore,
        t.amdPattern, t.zoneType, t.regime ?? "",
        t.slippagePips ?? "", t.exitSlippagePips ?? "",
        t.spreadPips ?? "", t.newsStatus ?? "clear",
        t.tqi ?? "", t.tqiGrade ?? "",
        t.mtfAligned != null ? String(t.mtfAligned) : "",
        t.mtfScore ?? "",
        t.riskRewardRatio, t.closeReason ?? "",
        t.openedAt?.toISOString() ?? "", t.closedAt?.toISOString() ?? "",
        rv?.agreement ?? "", rv?.reason ?? "", rv?.confidence ?? "", rv?.notes ?? "",
        rv?.reviewedAt?.toISOString() ?? "",
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="paper-trades-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    logger.error({ err }, "export/csv failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /paper/workspace/export/json ─────────────────────────────────────
router.get("/paper/workspace/export/json", async (_req, res): Promise<void> => {
  try {
    const trades = await db.select().from(tradesTable).orderBy(desc(tradesTable.openedAt));
    const reviews = await db.select().from(tradeReviewsTable);
    const signals = await db.select().from(signalLogTable).orderBy(desc(signalLogTable.generatedAt)).limit(1000);
    const reviewMap = new Map(reviews.map(r => [r.tradeId, r]));

    const payload = {
      exportedAt: new Date().toISOString(),
      trades: trades.map(t => ({
        ...t,
        review: reviewMap.get(t.id) ?? null,
      })),
      signals,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="paper-trades-${Date.now()}.json"`);
    res.json(payload);
  } catch (err) {
    logger.error({ err }, "export/json failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
