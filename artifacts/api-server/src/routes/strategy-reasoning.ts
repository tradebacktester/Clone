// ─── Strategy Reasoning API Routes ────────────────────────────────────────────
// Advisory only. No trade execution. No strategy modification.
// All routes define paths WITHOUT /api prefix (app mounts at /api).

import { Router } from "express";
import { db } from "@workspace/db";
import {
  learningFeaturesTable,
  srReportsTable,
  srSimilarTradesTable,
  srHistoryTable,
} from "@workspace/db";
import { desc, eq, and, gte, lte } from "drizzle-orm";
import {
  runStrategyReasoning,
  SR_ENGINE_VERSION,
} from "@workspace/market-analysis";
import type { StrategySetup, ExtractedFeature } from "@workspace/market-analysis";

export const strategyReasoningRouter = Router();

// ─── Helper: load historical features from DB ─────────────────────────────────

async function loadHistoricalFeatures(limit = 600): Promise<ExtractedFeature[]> {
  const rows = await db
    .select()
    .from(learningFeaturesTable)
    .orderBy(desc(learningFeaturesTable.extractedAt))
    .limit(limit);

  return rows.map(r => ({
    tradeId:             r.tradeId,
    setupId:             r.tradeId,
    pair:                r.pair,
    session:             r.session,
    marketRegime:        r.marketRegime,
    trend:               r.trend ?? "unknown",
    supplyQuality:       Number(r.supplyQuality),
    demandQuality:       Number(r.demandQuality),
    liquidityScore:      Number(r.liquidityScore),
    amdScore:            Number(r.amdScore),
    confirmationQuality: Number(r.confirmationQuality),
    setupScore:          Number(r.setupScore),
    tqi:                 Number(r.tqi),
    rrPlanned:           Number(r.rrPlanned),
    rrActual:            Number(r.rrActual ?? 0),
    spreadPips:          Number(r.spreadPips),
    volatility:          (r.volatility ?? "medium") as "low" | "medium" | "high",
    direction:           (r.direction ?? "buy") as "buy" | "sell",
    outcome:             r.outcome,
    pnl:                 Number(r.pnl ?? 0),
    confidence:          Number(r.confidence),
    patternType:         r.patternType ?? "unknown",
    holdDurationMinutes: Number(r.holdDurationMinutes ?? 0),
    openedAt:            r.entryTime ? new Date(r.entryTime) : new Date(),
    entryTime:           r.entryTime ? new Date(r.entryTime) : new Date(),
    exitTime:            r.exitTime  ? new Date(r.exitTime)  : new Date(),
  }));
}

// ─── Helper: save report to DB ────────────────────────────────────────────────

async function saveReport(
  report: Awaited<ReturnType<typeof runStrategyReasoning>>,
): Promise<void> {
  try {
    const s = report.setup;
    const st = report.strategyStrength;
    const ev = report.historicalEvidence;
    const rule = report.ruleEvaluation;

    await db.insert(srReportsTable).values({
      reportId:   report.reportId,
      version:    report.version,
      setupId:    s.setupId ?? null,

      pair:       s.pair,
      session:    s.session,
      regime:     s.regime,
      trend:      s.trend,
      volatility: s.volatility,

      supplyQuality:       String(s.supplyQuality),
      demandQuality:       String(s.demandQuality),
      liquidityScore:      String(s.liquidityScore),
      amdScore:            String(s.amdScore),
      confirmationQuality: String(s.confirmationQuality),
      setupScore:          String(s.setupScore),
      tqi:                 String(s.tqi),
      rrPlanned:           String(s.rrPlanned),
      spreadPips:          String(s.spreadPips),

      trendStrength:     s.trendStrength != null ? String(s.trendStrength) : null,
      correlationScore:  s.correlationScore != null ? String(s.correlationScore) : null,
      stabilityScore:    s.stabilityScore != null ? String(s.stabilityScore) : null,
      opportunityScore:  s.opportunityScore != null ? String(s.opportunityScore) : null,
      marketHealthScore: s.marketHealthScore != null ? String(s.marketHealthScore) : null,
      newsContext:       s.newsContext ?? "neutral",

      ruleQualityScore:        String(rule.ruleQualityScore.toFixed(2)),
      historicalEvidenceScore: String(ev.evidenceScore.toFixed(2)),
      marketSupportScore:      String(report.marketSupport.marketSupportScore.toFixed(2)),
      patternStrengthScore:    String(report.patternStrength.patternStrengthScore.toFixed(2)),
      contextStrengthScore:    String(report.contextStrength.contextStrengthScore.toFixed(2)),

      strategyStrengthScore: String(st.strategyStrengthScore.toFixed(2)),
      confidenceScore:       String(st.confidenceScore.toFixed(2)),
      strengthTier:          st.strengthTier,

      evidenceCount:      ev.evidenceCount,
      winCount:           ev.winCount,
      lossCount:          ev.lossCount,
      historicalWinRate:  String(ev.winRate.toFixed(4)),
      averageRR:          String(ev.averageRR.toFixed(2)),
      profitFactor:       String(ev.profitFactor.toFixed(4)),
      statisticalExpectancy: String(report.statisticalExpectancy.toFixed(4)),
      wilsonLowerBound:   String(ev.wilsonLowerBound.toFixed(4)),

      recommendation:          st.recommendation,
      recommendationLabel:     st.recommendationLabel,
      recommendationRationale: report.recommendationRationale,

      passingRules:    rule.passingRules,
      totalRules:      rule.totalRules,
      failedRules:     rule.failedRules,
      barelyPassed:    rule.barelyPassed,
      exceptionalRules: rule.exceptionalRules,
      ruleDetails:     rule.rules as unknown[],

      componentScores:  st.components as unknown[],
      strongestFactors: report.strongestFactors as unknown[],
      weakestFactors:   report.weakestFactors as unknown[],
      potentialRisks:   report.potentialRisks,
      riskAssessment:   report.riskAssessment,
      reasoning:        report.reasoning,

      isAdvisoryOnly: true,
      evaluatedAt:    report.evaluatedAt,
    });

    // Save similar trades
    if (ev.similarTrades.length > 0) {
      const tradeInserts = ev.similarTrades.map(t => ({
        reportId:   report.reportId,
        tradeId:    t.tradeId,
        pair:       t.pair,
        session:    t.session,
        regime:     t.regime,
        outcome:    t.outcome,
        rrActual:   String(t.rrActual),
        similarity: String(t.similarity.toFixed(4)),
        setupScore: String(t.setupScore),
        tqi:        String(t.tqi),
        openedAt:   t.openedAt,
      }));
      await db.insert(srSimilarTradesTable).values(tradeInserts);
    }

    // Save history event
    await db.insert(srHistoryTable).values({
      reportId: report.reportId,
      event:    "created",
      detail:   `Strategy strength: ${st.strategyStrengthScore.toFixed(1)} — ${st.recommendationLabel}`,
    });
  } catch (_err) {
    // Non-blocking — log silently
  }
}

// ─── POST /strategy/reasoning ─────────────────────────────────────────────────
// Evaluate a setup and produce a full reasoning report.

strategyReasoningRouter.post("/strategy/reasoning", async (req, res) => {
  try {
    const body = req.body as Partial<StrategySetup>;

    // Inline validation (esbuild cannot resolve zod/v4 in route files)
    const setup: StrategySetup = {
      setupId:             typeof body.setupId === "string" ? body.setupId : undefined,
      pair:                typeof body.pair === "string" ? body.pair : "EURUSD",
      session:             typeof body.session === "string" ? body.session : "london",
      regime:              typeof body.regime === "string" ? body.regime : "trending",
      trend:               typeof body.trend === "string" ? body.trend : "bullish",
      volatility:          typeof body.volatility === "string" ? body.volatility : "medium",
      supplyQuality:       typeof body.supplyQuality === "number" ? body.supplyQuality : 50,
      demandQuality:       typeof body.demandQuality === "number" ? body.demandQuality : 50,
      liquidityScore:      typeof body.liquidityScore === "number" ? body.liquidityScore : 50,
      amdScore:            typeof body.amdScore === "number" ? body.amdScore : 50,
      confirmationQuality: typeof body.confirmationQuality === "number" ? body.confirmationQuality : 50,
      setupScore:          typeof body.setupScore === "number" ? body.setupScore : 50,
      tqi:                 typeof body.tqi === "number" ? body.tqi : 50,
      rrPlanned:           typeof body.rrPlanned === "number" ? body.rrPlanned : 2.0,
      spreadPips:          typeof body.spreadPips === "number" ? body.spreadPips : 1.5,
      trendStrength:       typeof body.trendStrength === "number" ? body.trendStrength : undefined,
      correlationScore:    typeof body.correlationScore === "number" ? body.correlationScore : undefined,
      stabilityScore:      typeof body.stabilityScore === "number" ? body.stabilityScore : undefined,
      opportunityScore:    typeof body.opportunityScore === "number" ? body.opportunityScore : undefined,
      marketHealthScore:   typeof body.marketHealthScore === "number" ? body.marketHealthScore : undefined,
      newsContext:         (["positive","neutral","negative"].includes(body.newsContext as string))
                             ? body.newsContext as "positive" | "neutral" | "negative"
                             : "neutral",
      evaluatedAt:         new Date(),
    };

    const features = await loadHistoricalFeatures();
    const report   = runStrategyReasoning(setup, features);

    // Advisory-only enforcement — hard reject if invariant broken (should never occur)
    if (!report.isAdvisoryOnly) {
      res.status(500).json({ ok: false, message: "Advisory-only invariant violated" });
      return;
    }

    // Persist asynchronously
    saveReport(report).catch(() => {});

    res.json({ ok: true, report });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

// ─── GET /strategy/reasoning ──────────────────────────────────────────────────
// List recent reasoning reports.

strategyReasoningRouter.get("/strategy/reasoning", async (req, res) => {
  try {
    const limit  = Math.min(Number(req.query.limit) || 20, 100);
    const pair   = typeof req.query.pair === "string" ? req.query.pair : undefined;

    let query = db
      .select()
      .from(srReportsTable)
      .orderBy(desc(srReportsTable.evaluatedAt))
      .limit(limit);

    if (pair) {
      query = db
        .select()
        .from(srReportsTable)
        .where(eq(srReportsTable.pair, pair))
        .orderBy(desc(srReportsTable.evaluatedAt))
        .limit(limit) as typeof query;
    }

    const rows = await query;
    res.json({ ok: true, reports: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

// ─── GET /strategy/strength ───────────────────────────────────────────────────
// Quick summary: average strength, distribution, and recent trend.

strategyReasoningRouter.get("/strategy/strength", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(srReportsTable)
      .orderBy(desc(srReportsTable.evaluatedAt))
      .limit(200);

    if (rows.length === 0) {
      res.json({ ok: true, summary: null, count: 0 });
      return;
    }

    const scores = rows.map(r => Number(r.strategyStrengthScore));
    const avg    = scores.reduce((a, b) => a + b, 0) / scores.length;

    const dist: Record<string, number> = {
      exceptional: 0, very_strong: 0, strong: 0, average: 0, weak: 0, avoid: 0,
    };
    for (const r of rows) {
      const key = r.recommendation ?? "avoid";
      dist[key] = (dist[key] ?? 0) + 1;
    }

    const recent5 = rows.slice(0, 5).map(r => ({
      reportId:   r.reportId,
      pair:       r.pair,
      session:    r.session,
      score:      Number(r.strategyStrengthScore),
      recommendation: r.recommendation,
      evaluatedAt: r.evaluatedAt,
    }));

    res.json({
      ok: true,
      summary: {
        averageStrength: parseFloat(avg.toFixed(2)),
        totalReports:    rows.length,
        distribution:    dist,
        recent:          recent5,
        version:         SR_ENGINE_VERSION,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

// ─── GET /strategy/report/:reportId ──────────────────────────────────────────
// Full report by ID.

strategyReasoningRouter.get("/strategy/report/:reportId", async (req, res) => {
  try {
    const { reportId } = req.params;
    const rows = await db
      .select()
      .from(srReportsTable)
      .where(eq(srReportsTable.reportId, reportId))
      .limit(1);

    if (rows.length === 0) {
      res.status(404).json({ ok: false, message: "Report not found" });
      return;
    }

    const report = rows[0];

    // Fetch similar trades
    const trades = await db
      .select()
      .from(srSimilarTradesTable)
      .where(eq(srSimilarTradesTable.reportId, reportId))
      .orderBy(desc(srSimilarTradesTable.similarity))
      .limit(30);

    // Record view
    db.insert(srHistoryTable).values({
      reportId,
      event:  "viewed",
      detail: `Viewed via API`,
    }).catch(() => {});

    res.json({ ok: true, report, similarTrades: trades });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

// ─── GET /strategy/history ────────────────────────────────────────────────────
// Reasoning history timeline.

strategyReasoningRouter.get("/strategy/history", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows  = await db
      .select()
      .from(srHistoryTable)
      .orderBy(desc(srHistoryTable.createdAt))
      .limit(limit);
    res.json({ ok: true, history: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

// ─── GET /strategy/similar-trades/:reportId ───────────────────────────────────
// Similar trades for a specific report.

strategyReasoningRouter.get("/strategy/similar-trades/:reportId", async (req, res) => {
  try {
    const { reportId } = req.params;
    const rows = await db
      .select()
      .from(srSimilarTradesTable)
      .where(eq(srSimilarTradesTable.reportId, reportId))
      .orderBy(desc(srSimilarTradesTable.similarity))
      .limit(30);
    res.json({ ok: true, trades: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

// ─── GET /strategy/explanation ────────────────────────────────────────────────
// Engine explanation, scoring methodology, and version info.

strategyReasoningRouter.get("/strategy/explanation", async (req, res) => {
  try {
    res.json({
      ok: true,
      explanation: {
        version:     SR_ENGINE_VERSION,
        description: "Strategy Reasoning Engine — evaluates every valid setup using all accumulated KRYTOS knowledge.",
        isAdvisoryOnly: true,
        pipeline: [
          "Rule Validation — checks all 9 strategy rules with quality grading",
          "Historical Pattern Lookup — cosine similarity search over feature vectors",
          "Market Intelligence Review — trend, regime, volatility, liquidity, correlation, news, stability",
          "Feature Importance / Pattern Strength — zone, sweep, AMD, confirmation scoring",
          "Context Evaluation — session, pair, opportunity, health, historical context",
          "Strength Assessment — weighted composite of all 5 components",
          "Confidence Calculation — evidence-adjusted confidence score",
          "Reasoning Report — full narrative with supporting/weakest factors",
          "Recommendation — 6-tier advisory recommendation",
        ],
        components: [
          { name: "Rule Quality",        weight: 0.20, description: "9 strategy rules evaluated and graded" },
          { name: "Historical Evidence", weight: 0.25, description: "Cosine similarity search, win rate, profit factor, Wilson LB" },
          { name: "Market Support",      weight: 0.20, description: "Trend, regime, volatility, liquidity, correlation, news, stability" },
          { name: "Pattern Strength",    weight: 0.20, description: "Zone quality, liquidity sweep, AMD, confirmation" },
          { name: "Context Strength",    weight: 0.15, description: "Session, pair, opportunity, health, historical context" },
        ],
        recommendations: [
          { level: "exceptional",  min: 90, label: "Exceptional Opportunity" },
          { level: "very_strong",  min: 75, label: "Very Strong Setup" },
          { level: "strong",       min: 60, label: "Strong Setup" },
          { level: "average",      min: 45, label: "Average Setup" },
          { level: "weak",         min: 25, label: "Weak Setup" },
          { level: "avoid",        min: 0,  label: "Avoid — Low Quality" },
        ],
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});
