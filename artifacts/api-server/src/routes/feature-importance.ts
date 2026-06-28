// ─── Feature Importance Routes ─────────────────────────────────────────────────
// Advisory only. Surfaces feature importance analysis — never modifies trading
// rules, parameters, signals, or execution behavior.

import { Router } from "express";
import { db } from "@workspace/db";
import {
  fiFeatureRecordsTable,
  fiInteractionRecordsTable,
  fiConfidenceHistoryTable,
  fiAnalysisCyclesTable,
  learningFeaturesTable,
} from "@workspace/db";
import { desc, eq, gte, sql } from "drizzle-orm";
import {
  calculateFeatureImportance,
  analyzeInteractions,
  rankFeatures,
  applyConfidenceLearning,
  computeOverallCycleConfidence,
  validateFeatureSet,
  validateInteractions,
  featureImportanceStore,
  generateFeatureImportanceReport,
  FI_ENGINE_VERSION,
  FEATURE_DEFINITIONS,
} from "@workspace/market-analysis";
import type { ExtractedFeature } from "@workspace/market-analysis";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

const router = Router();

// ─── Load features from DB ────────────────────────────────────────────────────

async function loadFeaturesFromDb(): Promise<ExtractedFeature[]> {
  const rows = await db
    .select()
    .from(learningFeaturesTable)
    .orderBy(desc(learningFeaturesTable.extractedAt))
    .limit(5000);

  return rows.map(r => ({
    tradeId: r.tradeId,
    pair: (r.pair as "EURUSD" | "GBPUSD" | "USDJPY"),
    session: (r.session as "london" | "new_york" | "asian" | "unknown"),
    trend: (r.trend as "bullish" | "bearish" | "ranging"),
    marketRegime: (r.marketRegime as "trending" | "ranging" | "volatile" | "low_volatility" | "unknown"),
    supplyQuality: Number(r.supplyQuality),
    demandQuality: Number(r.demandQuality),
    liquidityScore: Number(r.liquidityScore),
    amdScore: Number(r.amdScore),
    confirmationQuality: Number(r.confirmationQuality),
    tradeDurationMins: r.tradeDurationMins ?? 0,
    spreadPips: Number(r.spreadPips),
    volatility: (r.volatility as "low" | "medium" | "high"),
    riskPct: 1,
    rrPlanned: Number(r.rrPlanned),
    rrActual: Number(r.rrActual),
    outcome: (r.outcome as "win" | "loss" | "break_even"),
    pnl: Number(r.pnl),
    pnlPercent: Number(r.pnlPercent),
    setupScore: Number(r.setupScore),
    confidence: Number(r.confidence),
    tqi: Number(r.tqi),
    openedAt: r.openedAt ? new Date(r.openedAt) : new Date(),
    closedAt: null,
  }));
}

// ─── Persist feature records to DB ───────────────────────────────────────────

async function persistFeatureRecords(
  features: ReturnType<typeof calculateFeatureImportance>,
  cycleId: string,
): Promise<void> {
  if (features.length === 0) return;
  const rows = features.map(f => ({
    featureId: f.featureId,
    displayName: f.displayName,
    category: f.category,
    description: f.description,
    dataType: f.dataType,
    sampleSize: f.sampleSize,
    wins: f.wins,
    losses: f.losses,
    breakEvens: f.breakEvens,
    winRate: String(f.winRate),
    lossRate: String(f.lossRate),
    avgRR: String(f.avgRR),
    avgProfit: String(f.avgProfit),
    avgLoss: String(f.avgLoss),
    statisticalSignificance: String(f.statisticalSignificance),
    pValue: String(f.pValue),
    correlationCoeff: String(f.correlationCoeff),
    predictiveValue: String(f.predictiveValue),
    reliabilityScore: String(f.reliabilityScore),
    confidenceScore: String(f.confidenceScore),
    isInsufficient: f.isInsufficient,
    insufficientReason: f.insufficientReason ?? null,
    hasContradiction: f.hasContradiction,
    contradictionNote: f.contradictionNote ?? null,
    isUnstable: f.isUnstable,
    instabilityNote: f.instabilityNote ?? null,
    overfittingRisk: f.overfittingRisk,
    confidenceExplanation: f.confidenceExplanation,
    confidenceTrend: f.confidenceTrend,
    reliabilityRating: f.reliabilityRating,
    bucketBreakdown: f.bucketBreakdown as unknown as Record<string, unknown>,
    supportingTrades: f.supportingTradeIds.slice(0, 100),
    cycleId,
    version: FI_ENGINE_VERSION,
    lastAnalyzedAt: new Date(),
  }));

  await db.insert(fiFeatureRecordsTable)
    .values(rows)
    .onConflictDoUpdate({
      target: fiFeatureRecordsTable.featureId,
      set: {
        sampleSize: sql`excluded.sample_size`,
        wins: sql`excluded.wins`,
        losses: sql`excluded.losses`,
        winRate: sql`excluded.win_rate`,
        lossRate: sql`excluded.loss_rate`,
        avgRR: sql`excluded.avg_rr`,
        avgProfit: sql`excluded.avg_profit`,
        avgLoss: sql`excluded.avg_loss`,
        statisticalSignificance: sql`excluded.statistical_significance`,
        pValue: sql`excluded.p_value`,
        correlationCoeff: sql`excluded.correlation_coeff`,
        predictiveValue: sql`excluded.predictive_value`,
        reliabilityScore: sql`excluded.reliability_score`,
        confidenceScore: sql`excluded.confidence_score`,
        isInsufficient: sql`excluded.is_insufficient`,
        insufficientReason: sql`excluded.insufficient_reason`,
        hasContradiction: sql`excluded.has_contradiction`,
        contradictionNote: sql`excluded.contradiction_note`,
        isUnstable: sql`excluded.is_unstable`,
        instabilityNote: sql`excluded.instability_note`,
        overfittingRisk: sql`excluded.overfitting_risk`,
        confidenceExplanation: sql`excluded.confidence_explanation`,
        confidenceTrend: sql`excluded.confidence_trend`,
        reliabilityRating: sql`excluded.reliability_rating`,
        bucketBreakdown: sql`excluded.bucket_breakdown`,
        supportingTrades: sql`excluded.supporting_trades`,
        cycleId: sql`excluded.cycle_id`,
        lastAnalyzedAt: sql`excluded.last_analyzed_at`,
        updatedAt: sql`now()`,
      },
    });
}

// ─── Persist interactions to DB ───────────────────────────────────────────────

async function persistInteractions(
  interactions: ReturnType<typeof analyzeInteractions>,
  cycleId: string,
): Promise<void> {
  if (interactions.length === 0) return;
  const rows = interactions.map(i => ({
    interactionId: i.interactionId,
    featureA: i.featureA,
    featureB: i.featureB,
    displayName: i.displayName,
    description: i.description,
    sampleSize: i.sampleSize,
    wins: i.wins,
    losses: i.losses,
    winRate: String(i.winRate),
    avgRR: String(i.avgRR),
    avgProfit: String(i.avgProfit),
    liftVsFeatureA: String(i.liftVsFeatureA),
    liftVsFeatureB: String(i.liftVsFeatureB),
    synergyScore: String(i.synergyScore),
    isSynergistic: i.isSynergistic,
    statisticalSignificance: String(i.statisticalSignificance),
    isInsufficient: i.isInsufficient,
    insufficientReason: i.insufficientReason ?? null,
    breakdown: i.breakdown as unknown as Record<string, unknown>,
    cycleId,
    version: FI_ENGINE_VERSION,
    lastAnalyzedAt: new Date(),
  }));

  await db.insert(fiInteractionRecordsTable)
    .values(rows)
    .onConflictDoUpdate({
      target: fiInteractionRecordsTable.interactionId,
      set: {
        sampleSize: sql`excluded.sample_size`,
        wins: sql`excluded.wins`,
        losses: sql`excluded.losses`,
        winRate: sql`excluded.win_rate`,
        avgRR: sql`excluded.avg_rr`,
        avgProfit: sql`excluded.avg_profit`,
        liftVsFeatureA: sql`excluded.lift_vs_feature_a`,
        liftVsFeatureB: sql`excluded.lift_vs_feature_b`,
        synergyScore: sql`excluded.synergy_score`,
        isSynergistic: sql`excluded.is_synergistic`,
        statisticalSignificance: sql`excluded.statistical_significance`,
        isInsufficient: sql`excluded.is_insufficient`,
        insufficientReason: sql`excluded.insufficient_reason`,
        breakdown: sql`excluded.breakdown`,
        cycleId: sql`excluded.cycle_id`,
        lastAnalyzedAt: sql`excluded.last_analyzed_at`,
        updatedAt: sql`now()`,
      },
    });
}

// ─── Persist confidence history (append-only) ─────────────────────────────────

async function persistConfidenceHistory(
  features: ReturnType<typeof calculateFeatureImportance>,
  cycleId: string,
): Promise<void> {
  const sufficientFeatures = features.filter(f => !f.isInsufficient);
  if (sufficientFeatures.length === 0) return;
  const rows = sufficientFeatures.map(f => ({
    featureId: f.featureId,
    cycleId,
    snapshotDate: new Date(),
    confidenceScore: String(f.confidenceScore),
    reliabilityScore: String(f.reliabilityScore),
    predictiveValue: String(f.predictiveValue),
    sampleSize: f.sampleSize,
    winRate: String(f.winRate),
    trendDirection: f.confidenceTrend,
    isInsufficient: f.isInsufficient,
    version: FI_ENGINE_VERSION,
  }));
  await db.insert(fiConfidenceHistoryTable).values(rows);
}

// ─── POST /learning/features/analyze — run full analysis ──────────────────────

router.post("/learning/features/analyze", async (req, res) => {
  const cycleId = randomUUID();
  const startedAt = Date.now();

  // Log cycle start
  await db.insert(fiAnalysisCyclesTable).values({
    cycleId,
    version: FI_ENGINE_VERSION,
    status: "running",
    triggeredBy: (req.body?.triggeredBy === "scheduled" ? "scheduled" : "manual"),
    sampleSize: 0,
    featuresAnalyzed: 0,
    interactionsFound: 0,
    startedAt: new Date(),
  }).catch(() => {});

  try {
    const rawFeatures = await loadFeaturesFromDb();

    if (rawFeatures.length === 0) {
      await db.update(fiAnalysisCyclesTable)
        .set({ status: "failed", errorMessage: "No feature data available", completedAt: new Date() })
        .where(eq(fiAnalysisCyclesTable.cycleId, cycleId))
        .catch(() => {});

      return res.json({
        success: false,
        message: "No feature data available. Run a learning cycle first to populate trade features.",
        cycleId,
      });
    }

    // Load previous confidence states for delta calculation
    const prevConfidenceStates = featureImportanceStore.getAllConfidenceStates();

    // Core calculations
    const featureResults = calculateFeatureImportance(rawFeatures);
    const interactions = analyzeInteractions(rawFeatures);

    // Apply confidence learning (uses previous cycle states for deltas)
    const featuresWithConfidence = applyConfidenceLearning(featureResults, prevConfidenceStates);

    // Rankings
    const rankings = rankFeatures(featuresWithConfidence);

    // Validation
    const validation = validateFeatureSet(featuresWithConfidence, rawFeatures.length);
    const interactionNotes = validateInteractions(interactions);

    // Overall confidence
    const overallConfidence = computeOverallCycleConfidence(featuresWithConfidence);

    // Assemble cycle
    const cycle = {
      cycleId,
      version: FI_ENGINE_VERSION,
      status: "complete" as const,
      triggeredBy: req.body?.triggeredBy === "scheduled" ? "scheduled" as const : "manual" as const,
      startedAt: new Date(startedAt),
      completedAt: new Date(),
      durationMs: Date.now() - startedAt,
      sampleSize: rawFeatures.length,
      features: featuresWithConfidence,
      interactions,
      rankings,
      overallConfidence,
      validationPassed: validation.isValid,
      validationNotes: [...validation.globalNotes, ...interactionNotes],
      errorMessage: null,
    };

    featureImportanceStore.upsert(cycle);

    // Persist to DB (non-blocking)
    Promise.all([
      persistFeatureRecords(featuresWithConfidence, cycleId),
      persistInteractions(interactions, cycleId),
      persistConfidenceHistory(featuresWithConfidence, cycleId),
      db.update(fiAnalysisCyclesTable).set({
        status: "complete",
        sampleSize: rawFeatures.length,
        featuresAnalyzed: featuresWithConfidence.length,
        interactionsFound: interactions.filter(i => !i.isInsufficient).length,
        overallConfidence: String(overallConfidence),
        validationPassed: validation.isValid,
        validationNotes: validation.globalNotes,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
      }).where(eq(fiAnalysisCyclesTable.cycleId, cycleId)),
    ]).catch(() => {});

    res.json({
      success: true,
      cycleId,
      version: FI_ENGINE_VERSION,
      sampleSize: rawFeatures.length,
      featuresAnalyzed: featuresWithConfidence.length,
      sufficientFeatures: validation.sufficientFeatures,
      insufficientFeatures: validation.insufficientFeatures,
      interactionsAnalyzed: interactions.length,
      synergisticInteractions: interactions.filter(i => i.isSynergistic && !i.isInsufficient).length,
      overallConfidence,
      validationPassed: validation.isValid,
      validationNotes: validation.globalNotes,
      durationMs: Date.now() - startedAt,
      isAdvisoryOnly: true,
    });
  } catch (err) {
    await db.update(fiAnalysisCyclesTable)
      .set({ status: "failed", errorMessage: err instanceof Error ? err.message : "Unknown error", completedAt: new Date() })
      .where(eq(fiAnalysisCyclesTable.cycleId, cycleId))
      .catch(() => {});
    res.status(500).json({ error: err instanceof Error ? err.message : "Feature importance analysis failed" });
  }
});

// ─── GET /learning/features — all feature importance results ──────────────────

router.get("/learning/features", async (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    const sufficientOnly = req.query.sufficientOnly === "true";
    const sortBy = (req.query.sortBy as string) || "predictive_value";
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    let features = featureImportanceStore.getFeatures();

    if (features.length === 0) {
      const rows = await db.select().from(fiFeatureRecordsTable)
        .orderBy(desc(fiFeatureRecordsTable.predictiveValue))
        .limit(limit);
      return res.json({ features: rows, source: "db", total: rows.length });
    }

    if (category) features = features.filter(f => f.category === category);
    if (sufficientOnly) features = features.filter(f => !f.isInsufficient);

    // Sort
    features = [...features].sort((a, b) => {
      if (a.isInsufficient && !b.isInsufficient) return 1;
      if (!a.isInsufficient && b.isInsufficient) return -1;
      switch (sortBy) {
        case "confidence_score": return b.confidenceScore - a.confidenceScore;
        case "reliability_score": return b.reliabilityScore - a.reliabilityScore;
        case "win_rate": return b.winRate - a.winRate;
        case "sample_size": return b.sampleSize - a.sampleSize;
        default: return b.predictiveValue - a.predictiveValue;
      }
    });

    res.json({
      features: features.slice(0, limit).map(f => ({
        featureId: f.featureId,
        displayName: f.displayName,
        category: f.category,
        description: f.description,
        sampleSize: f.sampleSize,
        winRate: f.winRate,
        lossRate: f.lossRate,
        avgRR: f.avgRR,
        predictiveValue: f.predictiveValue,
        reliabilityScore: f.reliabilityScore,
        confidenceScore: f.confidenceScore,
        statisticalSignificance: f.statisticalSignificance,
        correlationCoeff: f.correlationCoeff,
        isInsufficient: f.isInsufficient,
        insufficientReason: f.insufficientReason,
        hasContradiction: f.hasContradiction,
        contradictionNote: f.contradictionNote,
        isUnstable: f.isUnstable,
        instabilityNote: f.instabilityNote,
        overfittingRisk: f.overfittingRisk,
        confidenceExplanation: f.confidenceExplanation,
        confidenceTrend: f.confidenceTrend,
        reliabilityRating: f.reliabilityRating,
        confidenceTier: f.confidenceTier,
        bucketBreakdown: f.bucketBreakdown,
      })),
      source: "memory",
      total: features.length,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ─── GET /learning/features/status — quick status ─────────────────────────────
// NOTE: must be before /learning/features/:id

router.get("/learning/features/status", async (req, res) => {
  try {
    const latest = featureImportanceStore.getLatest();
    const dbCount = await db.select({ count: sql<number>`count(*)::int` }).from(fiFeatureRecordsTable);
    res.json({
      version: FI_ENGINE_VERSION,
      isAdvisoryOnly: true,
      isLoaded: featureImportanceStore.isLoaded(),
      inMemoryFeatures: featureImportanceStore.featureCount(),
      sufficientFeatures: featureImportanceStore.sufficientFeatureCount(),
      dbFeatures: dbCount[0]?.count ?? 0,
      lastCycleId: latest?.cycleId ?? null,
      lastAnalyzedAt: latest?.completedAt ?? null,
      overallConfidence: latest?.overallConfidence ?? 0,
      totalCycles: featureImportanceStore.cycleCount(),
      definedFeatures: FEATURE_DEFINITIONS.length,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ─── GET /learning/features/report — markdown report ──────────────────────────
// NOTE: must be before /learning/features/:id

router.get("/learning/features/report", async (req, res) => {
  try {
    const features = featureImportanceStore.getFeatures();
    const interactions = featureImportanceStore.getInteractions();
    const latest = featureImportanceStore.getLatest();

    if (features.length === 0) {
      return res.json({ report: null, message: "No features analyzed yet. Run POST /learning/features/analyze first." });
    }

    const report = generateFeatureImportanceReport(
      features,
      interactions,
      latest?.sampleSize ?? 0,
      latest?.overallConfidence ?? 0,
    );

    // Write to file
    try {
      const reportPath = path.resolve(process.cwd(), "FEATURE_IMPORTANCE_REPORT.md");
      fs.writeFileSync(reportPath, report.markdownContent, "utf-8");
    } catch {
      // Non-fatal — report still returned in response
    }

    const format = req.query.format;
    if (format === "markdown") {
      res.setHeader("Content-Type", "text/markdown");
      return res.send(report.markdownContent);
    }

    res.json({ report });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ─── GET /learning/features/:id — single feature detail ──────────────────────
// NOTE: Must be after all fixed /learning/features/* routes

router.get("/learning/features/:id", async (req, res) => {
  try {
    const featureId = req.params.id;
    const inMemory = featureImportanceStore.getFeatureById(featureId);
    if (inMemory) return res.json({ feature: inMemory, source: "memory" });

    const rows = await db.select().from(fiFeatureRecordsTable)
      .where(eq(fiFeatureRecordsTable.featureId, featureId))
      .limit(1);

    if (rows.length === 0) return res.status(404).json({ error: "Feature not found" });
    res.json({ feature: rows[0], source: "db" });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ─── GET /learning/interactions — all feature interactions ───────────────────

router.get("/learning/interactions", async (req, res) => {
  try {
    const sufficientOnly = req.query.sufficientOnly === "true";
    const synergisticOnly = req.query.synergisticOnly === "true";

    let interactions = featureImportanceStore.getInteractions();

    if (interactions.length === 0) {
      const rows = await db.select().from(fiInteractionRecordsTable)
        .orderBy(desc(fiInteractionRecordsTable.synergyScore))
        .limit(50);
      return res.json({ interactions: rows, source: "db", total: rows.length });
    }

    if (sufficientOnly) interactions = interactions.filter(i => !i.isInsufficient);
    if (synergisticOnly) interactions = interactions.filter(i => i.isSynergistic);

    res.json({
      interactions: interactions.map(i => ({
        interactionId: i.interactionId,
        featureA: i.featureA,
        featureB: i.featureB,
        displayName: i.displayName,
        description: i.description,
        sampleSize: i.sampleSize,
        winRate: i.winRate,
        avgRR: i.avgRR,
        baselineWinRateA: i.baselineWinRateA,
        baselineWinRateB: i.baselineWinRateB,
        liftVsFeatureA: i.liftVsFeatureA,
        liftVsFeatureB: i.liftVsFeatureB,
        synergyScore: i.synergyScore,
        isSynergistic: i.isSynergistic,
        statisticalSignificance: i.statisticalSignificance,
        isInsufficient: i.isInsufficient,
        insufficientReason: i.insufficientReason,
        breakdown: i.breakdown,
      })),
      source: "memory",
      total: interactions.length,
      synergisticCount: interactions.filter(i => i.isSynergistic && !i.isInsufficient).length,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ─── GET /learning/confidence — current confidence state per feature ──────────

router.get("/learning/confidence", async (req, res) => {
  try {
    const features = featureImportanceStore.getFeatures();
    const latest = featureImportanceStore.getLatest();

    if (features.length === 0) {
      return res.json({ hasData: false, message: "No analysis run yet." });
    }

    const confident = features.filter(f => !f.isInsufficient);
    const byTier: Record<string, number> = { insufficient: 0, low: 0, moderate: 0, high: 0, very_high: 0 };
    const byTrend: Record<string, number> = { improving: 0, stable: 0, declining: 0, unknown: 0 };

    for (const f of features) {
      byTier[f.confidenceTier] = (byTier[f.confidenceTier] ?? 0) + 1;
      byTrend[f.confidenceTrend] = (byTrend[f.confidenceTrend] ?? 0) + 1;
    }

    res.json({
      hasData: true,
      overallConfidence: latest?.overallConfidence ?? 0,
      totalFeatures: features.length,
      sufficientFeatures: confident.length,
      byTier,
      byTrend,
      features: confident.map(f => ({
        featureId: f.featureId,
        displayName: f.displayName,
        confidenceScore: f.confidenceScore,
        confidenceTier: f.confidenceTier,
        confidenceTrend: f.confidenceTrend,
        reliabilityRating: f.reliabilityRating,
        sampleSize: f.sampleSize,
        confidenceExplanation: f.confidenceExplanation,
      })),
      methodology: "Wilson Score Lower Bound (90% CI) × consistency factor × data quality factor. No ML models used.",
      version: FI_ENGINE_VERSION,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ─── GET /learning/confidence-history — confidence snapshots from DB ──────────

router.get("/learning/confidence-history", async (req, res) => {
  try {
    const featureId = req.query.featureId as string | undefined;
    const days = Math.min(Number(req.query.days) || 30, 365);
    const since = new Date(Date.now() - days * 86400000);
    const limit = Math.min(Number(req.query.limit) || 500, 2000);

    const query = featureId
      ? db.select().from(fiConfidenceHistoryTable)
          .where(
            featureId
              ? sql`${fiConfidenceHistoryTable.featureId} = ${featureId} AND ${fiConfidenceHistoryTable.snapshotDate} >= ${since}`
              : sql`${fiConfidenceHistoryTable.snapshotDate} >= ${since}`,
          )
          .orderBy(desc(fiConfidenceHistoryTable.snapshotDate))
          .limit(limit)
      : db.select().from(fiConfidenceHistoryTable)
          .where(gte(fiConfidenceHistoryTable.snapshotDate, since))
          .orderBy(desc(fiConfidenceHistoryTable.snapshotDate))
          .limit(limit);

    const rows = await query;

    res.json({
      history: rows,
      total: rows.length,
      featureId: featureId ?? "all",
      days,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ─── GET /learning/feature-rankings — ranked features ────────────────────────

router.get("/learning/feature-rankings", async (req, res) => {
  try {
    const sortBy = (req.query.sortBy as string) || "predictive_value";

    let rankings = featureImportanceStore.getRankings();

    if (rankings.length === 0) {
      const features = featureImportanceStore.getFeatures();
      if (features.length > 0) {
        rankings = rankFeatures(
          features,
          sortBy as "predictive_value" | "confidence_score" | "reliability_score" | "win_rate" | "sample_size",
        );
      } else {
        const rows = await db.select().from(fiFeatureRecordsTable)
          .orderBy(desc(fiFeatureRecordsTable.predictiveValue))
          .limit(50);
        return res.json({ rankings: rows, source: "db", total: rows.length });
      }
    }

    // Re-sort if different sort requested
    if (sortBy !== "predictive_value" && featureImportanceStore.getFeatures().length > 0) {
      rankings = rankFeatures(
        featureImportanceStore.getFeatures(),
        sortBy as "predictive_value" | "confidence_score" | "reliability_score" | "win_rate" | "sample_size",
      );
    }

    const latest = featureImportanceStore.getLatest();

    res.json({
      rankings,
      sortBy,
      source: "memory",
      total: rankings.length,
      overallConfidence: latest?.overallConfidence ?? 0,
      sampleSize: latest?.sampleSize ?? 0,
      version: FI_ENGINE_VERSION,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
