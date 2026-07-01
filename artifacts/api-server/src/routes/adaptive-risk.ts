// ─── Adaptive Risk Intelligence Engine — API Routes ───────────────────────────
// Advisory only. Learns from history, recommends risk profiles.
// NEVER modifies strategy, entry/exit rules, or research pipeline.
// All routes define paths WITHOUT /api prefix (app mounts at /api).

import { Router } from "express";
import { db } from "@workspace/db";
import {
  ariProfilesTable,
  ariRecommendationsTable,
  ariHistoryTable,
  ariPerformanceTable,
  tradesTable,
  marketRegimeTable,
} from "@workspace/db";
import { desc, eq, gte, sql } from "drizzle-orm";
import {
  runAdaptiveRiskEngine,
  learnByRegime,
  learnByVolatility,
  learnBySession,
  profileByPair,
  learnByLiquidity,
  learnByCondition,
  defaultMarketContext,
  ARI_ENGINE_VERSION,
} from "@workspace/market-analysis";
import type { MarketContext, RiskProfile, TradeRecord } from "@workspace/market-analysis";

const router = Router();

function ok(res: any, data: any) {
  res.json({ success: true, isAdvisoryOnly: true, data });
}
function err(res: any, status: number, message: string) {
  res.status(status).json({ success: false, error: message });
}

// ─── Load trades from DB ──────────────────────────────────────────────────────

async function loadTrades(limit = 500): Promise<TradeRecord[]> {
  const rows = await db.select().from(tradesTable)
    .where(eq(tradesTable.status, "closed"))
    .orderBy(desc(tradesTable.closedAt))
    .limit(limit);

  return rows.map(t => ({
    id:              t.id,
    pair:            t.pair ?? "EURUSD",
    direction:       (t.direction ?? "buy") as "buy" | "sell",
    pnl:             Number(t.profit ?? 0),
    riskPercent:     Number(t.riskPercent ?? 1),
    riskRewardRatio: Number(t.riskRewardRatio ?? 1.5),
    session:         t.session ?? "london",
    regime:          "trending",   // market regime at trade time; will enrich when available
    openedAt:        t.openedAt ?? new Date(),
    closedAt:        t.closedAt ?? new Date(),
    pips:            Number(t.pips ?? 0),
    lotSize:         Number(t.lotSize ?? 0.01),
    amdPhase:        t.amdPhase ?? undefined,
  }));
}

// ─── Load current market context from DB ─────────────────────────────────────

async function loadMarketContext(pair = "EURUSD"): Promise<MarketContext> {
  const regimeRows = await db.select().from(marketRegimeTable)
    .where(eq(marketRegimeTable.pair, pair))
    .orderBy(desc(marketRegimeTable.updatedAt))
    .limit(1);

  const latest = regimeRows[0];
  const regime = (latest?.regime ?? "trending") as MarketContext["regime"];

  return {
    pair,
    session:         "london",
    regime,
    volatilityLevel: "normal",
    liquidityLevel:  "high",
    condition:       "normal",
    volatilityScore: Number(latest?.confidence ?? 50),
    liquidityScore:  70,
    trendStrength:   Number(latest?.confidence ?? 60),
    newsRisk:        20,
  };
}

// ─── GET /adaptive-risk/profile ──────────────────────────────────────────────

router.get("/adaptive-risk/profile", async (req, res) => {
  try {
    const pair    = String(req.query.pair ?? "EURUSD");
    const [trades, context] = await Promise.all([loadTrades(), loadMarketContext(pair)]);

    // Retrieve last known profile
    const lastRows = await db.select().from(ariProfilesTable)
      .orderBy(desc(ariProfilesTable.generatedAt)).limit(1);
    const currentProfile = (lastRows[0]?.recommendedProfile ?? null) as RiskProfile | null;

    const report = await runAdaptiveRiskEngine({ trades, context, currentProfile });
    const rec    = report.recommendation;

    // Persist profile snapshot
    await db.insert(ariProfilesTable).values({
      engineVersion:         ARI_ENGINE_VERSION,
      isAdvisoryOnly:        true,
      recommendedProfile:    rec.recommendedProfile,
      recommendedProfileLabel: rec.recommendedProfileLabel,
      previousProfile:       rec.previousProfile ?? undefined,
      profileChanged:        rec.profileChanged,
      confidenceScore:       rec.confidence.score,
      confidenceLabel:       rec.confidence.label,
      sampleSize:            rec.confidence.sampleSize,
      statisticalSignificance: String(rec.confidence.statisticalSignificance),
      reliabilityRating:     rec.confidence.reliabilityRating,
      marketRegime:          context.regime,
      volatilityLevel:       context.volatilityLevel,
      liquidityLevel:        context.liquidityLevel,
      session:               context.session,
      pair:                  context.pair,
      maxRiskPerTrade:       String(rec.parameters.maxRiskPerTrade),
      maxOpenTrades:         rec.parameters.maxOpenTrades,
      maxPairExposure:       String(rec.parameters.maxPairExposure),
      maxCorrelationExposure: String(rec.parameters.maxCorrelationExposure),
      dailyRiskBudget:       String(rec.parameters.dailyRiskBudget),
      weeklyRiskBudget:      String(rec.parameters.weeklyRiskBudget),
      positionSizeMultiplier: String(rec.parameters.positionSizeMultiplier),
      exposureMultiplier:    String(rec.parameters.exposureMultiplier),
      primaryReason:         rec.primaryReason,
      supportingReasons:     rec.supportingReasons,
      riskFactors:           rec.riskFactors,
      expectedBenefits:      rec.expectedBenefits,
      potentialRisks:        rec.potentialRisks,
      fullProfile:           report as any,
      explainability:        rec.explainability as any,
      historicalEvidence:    rec.historicalEvidence as any,
    });

    // If profile changed, record history event
    if (rec.profileChanged && currentProfile) {
      await db.insert(ariHistoryTable).values({
        fromProfile:    currentProfile,
        toProfile:      rec.recommendedProfile,
        changeReason:   rec.primaryReason,
        changeType:     isEscalation(currentProfile, rec.recommendedProfile) ? "escalation" : "de-escalation",
        marketRegime:   context.regime,
        volatilityLevel: context.volatilityLevel,
        liquidityLevel: context.liquidityLevel,
        session:        context.session,
        confidenceScore: rec.confidence.score,
        sampleSize:     rec.confidence.sampleSize,
        supportingEvidence: rec.evidence as any,
        fullSnapshot:   report as any,
      });
    }

    ok(res, report);
  } catch (e: any) {
    err(res, 500, e.message);
  }
});

// ─── GET /adaptive-risk/recommendations ──────────────────────────────────────

router.get("/adaptive-risk/recommendations", async (req, res) => {
  try {
    const pair    = String(req.query.pair ?? "EURUSD");
    const [trades, context] = await Promise.all([loadTrades(), loadMarketContext(pair)]);

    const lastRows = await db.select().from(ariProfilesTable)
      .orderBy(desc(ariProfilesTable.generatedAt)).limit(1);
    const currentProfile = (lastRows[0]?.recommendedProfile ?? null) as RiskProfile | null;

    const report = await runAdaptiveRiskEngine({ trades, context, currentProfile });

    // Build & persist individual recommendations
    const { generateRecommendations: genRecs } = await import("@workspace/market-analysis");
    const { computeConfidence: compConf }       = await import("@workspace/market-analysis");
    const { buildEvidenceItems: buildEv }       = await import("@workspace/market-analysis");

    ok(res, {
      profile:         report.recommendation.recommendedProfile,
      profileLabel:    report.recommendation.recommendedProfileLabel,
      confidence:      report.recommendation.confidence,
      parameters:      report.recommendation.parameters,
      primaryReason:   report.recommendation.primaryReason,
      supportingReasons: report.recommendation.supportingReasons,
      expectedBenefits: report.recommendation.expectedBenefits,
      potentialRisks:  report.recommendation.potentialRisks,
      evidence:        report.recommendation.evidence,
      explainability:  report.recommendation.explainability,
      generatedAt:     report.generatedAt,
    });
  } catch (e: any) {
    err(res, 500, e.message);
  }
});

// ─── GET /adaptive-risk/history ───────────────────────────────────────────────

router.get("/adaptive-risk/history", async (req, res) => {
  try {
    const limit = Math.min(100, Number(req.query.limit ?? 50));
    const rows  = await db.select().from(ariHistoryTable)
      .orderBy(desc(ariHistoryTable.occurredAt))
      .limit(limit);

    const profileHistory = await db.select().from(ariProfilesTable)
      .orderBy(desc(ariProfilesTable.generatedAt))
      .limit(limit);

    ok(res, { events: rows, profileHistory, total: rows.length });
  } catch (e: any) {
    err(res, 500, e.message);
  }
});

// ─── GET /adaptive-risk/market-analysis ──────────────────────────────────────

router.get("/adaptive-risk/market-analysis", async (req, res) => {
  try {
    const pair    = String(req.query.pair ?? "EURUSD");
    const [trades, context] = await Promise.all([loadTrades(), loadMarketContext(pair)]);

    const report = await runAdaptiveRiskEngine({ trades, context });
    ok(res, {
      marketAnalysis:  report.marketAnalysis,
      summary:         report.summary,
      allEnvironments: report.allEnvironmentStats,
    });
  } catch (e: any) {
    err(res, 500, e.message);
  }
});

// ─── GET /adaptive-risk/performance ──────────────────────────────────────────

router.get("/adaptive-risk/performance", async (req, res) => {
  try {
    const trades = await loadTrades(1000);

    const regimeStats    = learnByRegime(trades);
    const volatilityStats = learnByVolatility(trades);
    const sessionStats   = learnBySession(trades);
    const pairStats      = profileByPair(trades);
    const liquidityStats = learnByLiquidity(trades);
    const conditionStats = learnByCondition(trades);

    // Persist performance snapshot (upsert by environment key)
    const allPerf = [...regimeStats, ...volatilityStats, ...sessionStats, ...pairStats, ...liquidityStats, ...conditionStats];
    for (const s of allPerf) {
      if (s.sampleSize < 1) continue;
      await db.insert(ariPerformanceTable).values({
        environment:    s.environment,
        environmentKey: s.environmentKey,
        sampleSize:     s.sampleSize,
        winRate:        String(s.winRate),
        expectancy:     String(s.expectancy),
        avgRR:          String(s.avgRR),
        avgPnl:         String(s.avgPnl),
        totalPnl:       String(s.totalPnl),
        maxDrawdown:    String(s.maxDrawdown),
        sharpeProxy:    String(s.sharpeProxy),
        profitFactor:   String(s.profitFactor),
        volatilityScore: String(s.volatilityScore),
        confidenceScore: s.confidenceScore,
        riskRating:     s.riskRating,
        riskScore:      s.riskScore,
        breakdown:      s.breakdown as any,
      }).onConflictDoNothing();
    }

    ok(res, {
      byRegime:     regimeStats,
      byVolatility: volatilityStats,
      bySession:    sessionStats,
      byPair:       pairStats,
      byLiquidity:  liquidityStats,
      byCondition:  conditionStats,
      totalTrades:  trades.length,
    });
  } catch (e: any) {
    err(res, 500, e.message);
  }
});

// ─── GET /adaptive-risk/report ────────────────────────────────────────────────

router.get("/adaptive-risk/report", async (req, res) => {
  try {
    const pair    = String(req.query.pair ?? "EURUSD");
    const [trades, context] = await Promise.all([loadTrades(1000), loadMarketContext(pair)]);

    const lastRows = await db.select().from(ariProfilesTable)
      .orderBy(desc(ariProfilesTable.generatedAt)).limit(1);
    const currentProfile = (lastRows[0]?.recommendedProfile ?? null) as RiskProfile | null;

    const [report, recentHistory, recentProfiles] = await Promise.all([
      runAdaptiveRiskEngine({ trades, context, currentProfile }),
      db.select().from(ariHistoryTable).orderBy(desc(ariHistoryTable.occurredAt)).limit(20),
      db.select().from(ariProfilesTable).orderBy(desc(ariProfilesTable.generatedAt)).limit(30),
    ]);

    ok(res, {
      report,
      recentHistory,
      recentProfiles,
      tradeCount:    trades.length,
      engineVersion: ARI_ENGINE_VERSION,
    });
  } catch (e: any) {
    err(res, 500, e.message);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isEscalation(from: RiskProfile, to: RiskProfile): boolean {
  const order: RiskProfile[] = ["aggressive", "balanced", "conservative", "recovery", "observation", "emergency"];
  return order.indexOf(to) > order.indexOf(from);
}

export default router;
