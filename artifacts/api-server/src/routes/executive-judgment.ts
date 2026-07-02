// ─── Executive Judgment Routes ────────────────────────────────────────────────
// Phase 7.3 · GET /executive/*

import { Router } from "express";
import { db }     from "@workspace/db";
import {
  ejJudgmentsTable,
  ejSimulationsTable,
  ejCounterfactualsTable,
  ejTimelineTable,
} from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import {
  runExecutiveJudgment,
  buildCounterfactualAnalysis,
  EJ_ENGINE_VERSION,
} from "@workspace/market-analysis";

// Top-level imports from db for sub-system results
import {
  esbReportsTable,
  erbReportsTable,
} from "@workspace/db";

export const executiveJudgmentRouter = Router();

function n(v: unknown, fallback = 0): number {
  const num = Number(v);
  return isFinite(num) ? num : fallback;
}

async function fetchSubsystemData() {
  const [latestEsb, latestErb] = await Promise.all([
    db.select().from(esbReportsTable).orderBy(desc(esbReportsTable.evaluatedAt)).limit(1),
    db.select().from(erbReportsTable).orderBy(desc(erbReportsTable.evaluatedAt)).limit(1),
  ]);
  const strategyResult = latestEsb[0]?.fullPayload
    ? (typeof latestEsb[0].fullPayload === "string" ? JSON.parse(latestEsb[0].fullPayload) : latestEsb[0].fullPayload)
    : null;
  const erbResult = latestErb[0]?.fullPayload
    ? (typeof latestErb[0].fullPayload === "string" ? JSON.parse(latestErb[0].fullPayload) : latestErb[0].fullPayload)
    : null;
  return { strategyResult, erbResult };
}

// ─── GET /executive/judgment ───────────────────────────────────────────────────
// Run full judgment cycle + persist

executiveJudgmentRouter.get("/executive/judgment", async (req, res) => {
  try {
    const pair      = String(req.query.pair      ?? "EURUSD");
    const timeframe = String(req.query.timeframe ?? "15m");
    const { strategyResult, erbResult } = await fetchSubsystemData();

    const judgment = await runExecutiveJudgment({ pair, timeframe, strategyResult, erbResult });

    // Persist main judgment
    await db.insert(ejJudgmentsTable).values({
      judgmentId:           judgment.judgmentId,
      evaluatedAt:          new Date(judgment.evaluatedAt),
      pair:                 judgment.pair,
      timeframe:            judgment.timeframe,
      finalDecision:        judgment.finalDecision,
      finalDecisionLabel:   judgment.finalDecisionLabel,
      finalScore:           judgment.finalScore,
      finalConfidence:      judgment.finalConfidence,
      bestDecision:         judgment.bestDecision.decisionType,
      secondBestDecision:   judgment.secondBestDecision.decisionType,
      thirdBestDecision:    judgment.thirdBestDecision.decisionType,
      opportunityCostScore: judgment.opportunityCost.opportunityCostScore,
      ocRecommendation:     judgment.opportunityCost.recommendation,
      executiveScore:       judgment.intelligenceSnapshot.executiveScore,
      riskScore:            judgment.intelligenceSnapshot.riskScore,
      crisisStatus:         judgment.intelligenceSnapshot.crisisStatus,
      durationMs:           judgment.durationMs,
      engineVersion:        judgment.engineVersion,
      fullPayload:          judgment as unknown as Record<string, unknown>,
      isAdvisoryOnly:       true,
    }).onConflictDoNothing();

    // Persist individual simulations
    for (const sim of judgment.simulations) {
      const ranking = judgment.rankings.find(r => r.decisionType === sim.decisionType);
      await db.insert(ejSimulationsTable).values({
        judgmentId:          judgment.judgmentId,
        recordedAt:          new Date(judgment.evaluatedAt),
        pair:                judgment.pair,
        decisionType:        sim.decisionType,
        decisionLabel:       sim.decisionLabel,
        rank:                ranking?.rank ?? 0,
        overallScore:        ranking?.overallScore ?? 0,
        expectedProbability: sim.expectedProbability,
        expectedRisk:        sim.expectedRisk,
        historicalWinRate:   sim.historicalWinRate,
        expectedRR:          sim.expectedRR,
        expectedValue:       sim.expectedValue,
        confidence:          sim.confidence,
        sampleSize:          sim.sampleSize,
      }).onConflictDoNothing();
    }

    // Persist timeline entry
    await db.insert(ejTimelineTable).values({
      judgmentId:      judgment.judgmentId,
      recordedAt:      new Date(judgment.evaluatedAt),
      pair:            judgment.pair,
      finalDecision:   judgment.finalDecision,
      finalScore:      judgment.finalScore,
      finalConfidence: judgment.finalConfidence,
      ocScore:         judgment.opportunityCost.opportunityCostScore,
      riskScore:       judgment.intelligenceSnapshot.riskScore,
      engineVersion:   judgment.engineVersion,
    }).onConflictDoNothing();

    res.json({ success: true, data: judgment });
  } catch (err: any) {
    res.status(500).json({ error: "Judgment cycle failed", detail: err?.message });
  }
});

// ─── GET /executive/simulations ───────────────────────────────────────────────
// List recent decision simulations (flat, per candidate)

executiveJudgmentRouter.get("/executive/simulations", async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const pair  = req.query.pair ? String(req.query.pair) : undefined;

    // Fetch latest judgments and extract simulation data
    const judgments = await db
      .select()
      .from(ejJudgmentsTable)
      .orderBy(desc(ejJudgmentsTable.evaluatedAt))
      .limit(10);

    const latestPayload = judgments[0]?.fullPayload as Record<string, unknown> | null;
    const latestSims    = (latestPayload as any)?.simulations ?? [];

    // Also fetch aggregate stats from simulation table
    const recentSims = await db
      .select()
      .from(ejSimulationsTable)
      .orderBy(desc(ejSimulationsTable.recordedAt))
      .limit(limit);

    // Decision type win rate summary
    const summary = await db
      .select({
        decisionType:       ejSimulationsTable.decisionType,
        avgScore:           sql<number>`avg(${ejSimulationsTable.overallScore})`,
        avgWinRate:         sql<number>`avg(${ejSimulationsTable.historicalWinRate})`,
        avgEV:              sql<number>`avg(${ejSimulationsTable.expectedValue})`,
        count:              sql<number>`count(*)`,
        avgRank:            sql<number>`avg(${ejSimulationsTable.rank})`,
      })
      .from(ejSimulationsTable)
      .groupBy(ejSimulationsTable.decisionType)
      .orderBy(sql`avg(${ejSimulationsTable.overallScore}) desc`);

    res.json({
      success: true,
      data: {
        latestSimulations: latestSims,
        recentRows:        recentSims.slice(0, 50),
        summary,
        totalJudgments:    judgments.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch simulations", detail: err?.message });
  }
});

// ─── GET /executive/rankings ──────────────────────────────────────────────────
// Latest decision rankings + historical rank distribution

executiveJudgmentRouter.get("/executive/rankings", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(ejJudgmentsTable)
      .orderBy(desc(ejJudgmentsTable.evaluatedAt))
      .limit(1);

    const latestPayload = rows[0]?.fullPayload as Record<string, unknown> | null;
    const rankings      = (latestPayload as any)?.rankings ?? [];

    // Historical: how often does each decision type rank #1?
    const rankHistory = await db
      .select({
        decisionType: ejSimulationsTable.decisionType,
        timesRank1:   sql<number>`count(*) filter (where ${ejSimulationsTable.rank} = 1)`,
        timesTop3:    sql<number>`count(*) filter (where ${ejSimulationsTable.rank} <= 3)`,
        totalJudgments: sql<number>`count(*)`,
      })
      .from(ejSimulationsTable)
      .groupBy(ejSimulationsTable.decisionType)
      .orderBy(sql`count(*) filter (where ${ejSimulationsTable.rank} = 1) desc`);

    res.json({
      success: true,
      data: {
        latestRankings:  rankings,
        rankHistory,
        latestJudgmentId: rows[0]?.judgmentId ?? null,
        evaluatedAt:      rows[0]?.evaluatedAt ?? null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch rankings", detail: err?.message });
  }
});

// ─── GET /executive/opportunity-cost ──────────────────────────────────────────
// Latest OC analysis + historical OC trend

executiveJudgmentRouter.get("/executive/opportunity-cost", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(ejJudgmentsTable)
      .orderBy(desc(ejJudgmentsTable.evaluatedAt))
      .limit(1);

    const latestPayload = rows[0]?.fullPayload as Record<string, unknown> | null;
    const oc            = (latestPayload as any)?.opportunityCost ?? null;

    // Historical OC score trend
    const ocTrend = await db
      .select({
        recordedAt: ejTimelineTable.recordedAt,
        ocScore:    ejTimelineTable.ocScore,
        decision:   ejTimelineTable.finalDecision,
        score:      ejTimelineTable.finalScore,
      })
      .from(ejTimelineTable)
      .orderBy(desc(ejTimelineTable.recordedAt))
      .limit(50);

    // OC recommendation distribution
    const ocDist = await db
      .select({
        recommendation: ejJudgmentsTable.ocRecommendation,
        count:          sql<number>`count(*)`,
      })
      .from(ejJudgmentsTable)
      .groupBy(ejJudgmentsTable.ocRecommendation)
      .orderBy(sql`count(*) desc`);

    res.json({
      success: true,
      data: {
        latest:          oc,
        trend:           ocTrend.reverse(),
        distribution:    ocDist,
        latestJudgmentId: rows[0]?.judgmentId ?? null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch opportunity cost", detail: err?.message });
  }
});

// ─── GET /executive/counterfactual ────────────────────────────────────────────
// List counterfactual analyses + run one for a specific judgment

executiveJudgmentRouter.get("/executive/counterfactual", async (req, res) => {
  try {
    const judgmentId = req.query.judgmentId ? String(req.query.judgmentId) : null;

    if (judgmentId) {
      // Fetch specific counterfactual
      const rows = await db
        .select()
        .from(ejCounterfactualsTable)
        .where(eq(ejCounterfactualsTable.judgmentId, judgmentId))
        .orderBy(desc(ejCounterfactualsTable.completedAt))
        .limit(1);

      if (rows[0]) {
        return res.json({ success: true, data: rows[0].fullPayload ?? rows[0] });
      }

      // Generate one on-the-fly using default scenario if no trade result yet
      const judgmentRows = await db
        .select()
        .from(ejJudgmentsTable)
        .where(eq(ejJudgmentsTable.judgmentId, judgmentId))
        .limit(1);

      if (!judgmentRows[0]) {
        return res.status(404).json({ error: "Judgment not found", judgmentId });
      }

      const payload = judgmentRows[0].fullPayload as any;
      const sims    = payload?.simulations ?? [];
      const cf      = buildCounterfactualAnalysis({
        judgmentId,
        tradeId:        null,
        actualDecision: judgmentRows[0].finalDecision as any,
        actualOutcome:  "neutral",
        actualPnL:      0,
        actualRR:       0,
        simulations:    sims,
      });

      return res.json({ success: true, data: cf, generated: true });
    }

    // List recent counterfactuals
    const rows = await db
      .select()
      .from(ejCounterfactualsTable)
      .orderBy(desc(ejCounterfactualsTable.completedAt))
      .limit(20);

    // Aggregate quality score
    const qualityStats = await db
      .select({
        avgQuality: sql<number>`avg(${ejCounterfactualsTable.decisionQualityScore})`,
        count:      sql<number>`count(*)`,
      })
      .from(ejCounterfactualsTable);

    res.json({
      success: true,
      data: {
        counterfactuals: rows.map(r => ({
          analysisId:           r.analysisId,
          judgmentId:           r.judgmentId,
          completedAt:          r.completedAt,
          actualDecision:       r.actualDecision,
          actualOutcome:        r.actualOutcome,
          actualPnL:            r.actualPnL,
          decisionQualityScore: r.decisionQualityScore,
          learningInsight:      r.learningInsight,
        })),
        avgQualityScore: n(qualityStats[0]?.avgQuality),
        totalAnalyses:   n(qualityStats[0]?.count),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch counterfactuals", detail: err?.message });
  }
});

// ─── GET /executive/report ────────────────────────────────────────────────────
// Aggregated report — decision distribution, quality metrics, trends

executiveJudgmentRouter.get("/executive/report", async (req, res) => {
  try {
    const [
      totalRows,
      decisionDist,
      avgMetrics,
      recentTimeline,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(ejJudgmentsTable),
      db.select({
        decision: ejJudgmentsTable.finalDecision,
        count:    sql<number>`count(*)`,
        avgScore: sql<number>`avg(${ejJudgmentsTable.finalScore})`,
        avgConf:  sql<number>`avg(${ejJudgmentsTable.finalConfidence})`,
      }).from(ejJudgmentsTable)
        .groupBy(ejJudgmentsTable.finalDecision)
        .orderBy(sql`count(*) desc`),
      db.select({
        avgScore:   sql<number>`avg(${ejJudgmentsTable.finalScore})`,
        avgConf:    sql<number>`avg(${ejJudgmentsTable.finalConfidence})`,
        avgOCScore: sql<number>`avg(${ejJudgmentsTable.opportunityCostScore})`,
        avgRisk:    sql<number>`avg(${ejJudgmentsTable.riskScore})`,
      }).from(ejJudgmentsTable),
      db.select()
        .from(ejTimelineTable)
        .orderBy(desc(ejTimelineTable.recordedAt))
        .limit(20),
    ]);

    const total = n(totalRows[0]?.count);
    const avg   = avgMetrics[0] ?? {};

    res.json({
      success: true,
      data: {
        totalJudgments:      total,
        avgFinalScore:       n(avg.avgScore),
        avgConfidence:       n(avg.avgConf),
        avgOCScore:          n(avg.avgOCScore),
        avgRiskScore:        n(avg.avgRisk),
        decisionDistribution: decisionDist,
        recentTrend:         recentTimeline.reverse().map(t => ({
          time:       t.recordedAt,
          score:      t.finalScore,
          confidence: t.finalConfidence,
          decision:   t.finalDecision,
        })),
        engineVersion: EJ_ENGINE_VERSION,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to generate report", detail: err?.message });
  }
});
