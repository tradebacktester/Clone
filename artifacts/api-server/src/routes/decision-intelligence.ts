// ─── Decision Intelligence API Routes ─────────────────────────────────────────
// Advisory only. No trade execution. No strategy modification.
// All routes define paths WITHOUT /api prefix (app mounts at /api).

import { Router } from "express";
import { db } from "@workspace/db";
import {
  learningFeaturesTable,
  diRecommendationsTable,
  diSimilarExperiencesTable,
  diRecommendationHistoryTable,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  evaluateSetup,
  diStore,
  generateDecisionReport,
  DI_ENGINE_VERSION,
} from "@workspace/market-analysis";
import type { CurrentSetup, TradeIntelligenceReport } from "@workspace/market-analysis";
import type { ExtractedFeature } from "@workspace/market-analysis";
import * as fs from "fs";
import * as path from "path";

export const decisionIntelligenceRouter = Router();

// ─── Helper: load historical features from DB ─────────────────────────────────

async function loadHistoricalFeatures(): Promise<ExtractedFeature[]> {
  const rows = await db
    .select()
    .from(learningFeaturesTable)
    .orderBy(desc(learningFeaturesTable.extractedAt))
    .limit(500);

  return rows.map(r => ({
    tradeId:              r.tradeId,
    pair:                 r.pair,
    session:              r.session,
    marketRegime:         r.marketRegime,
    trend:                r.trend ?? "unknown",
    supplyQuality:        Number(r.supplyQuality),
    demandQuality:        Number(r.demandQuality),
    liquidityScore:       Number(r.liquidityScore),
    amdScore:             Number(r.amdScore),
    confirmationQuality:  Number(r.confirmationQuality),
    setupScore:           Number(r.setupScore),
    tqi:                  Number(r.tqi),
    rrPlanned:            Number(r.rrPlanned),
    rrActual:             Number(r.rrActual ?? 0),
    spreadPips:           Number(r.spreadPips),
    volatility:           (r.volatility ?? "medium") as "low" | "medium" | "high",
    direction:            (r.direction ?? "buy") as "buy" | "sell",
    outcome:              r.outcome,
    pnl:                  Number(r.pnl ?? 0),
    confidence:           Number(r.confidence),
    patternType:          r.patternType ?? "unknown",
    holdDurationMinutes:  Number(r.holdDurationMinutes ?? 0),
    entryTime:            r.entryTime ? new Date(r.entryTime) : new Date(),
    exitTime:             r.exitTime  ? new Date(r.exitTime)  : new Date(),
  }));
}

// ─── POST /learning/recommendations/evaluate ──────────────────────────────────
// Evaluate a setup and generate a Trade Intelligence Report.

decisionIntelligenceRouter.post("/learning/recommendations/evaluate", async (req, res) => {
  try {
    const body = req.body as Partial<CurrentSetup>;

    // Inline validation (no zod import for esbuild compatibility)
    const setup: CurrentSetup = {
      setupId:             body.setupId,
      pair:                typeof body.pair === "string" ? body.pair : "EURUSD",
      session:             typeof body.session === "string" ? body.session : "london",
      regime:              typeof body.regime === "string" ? body.regime : "unknown",
      trend:               typeof body.trend === "string" ? body.trend : "unknown",
      supplyQuality:       typeof body.supplyQuality === "number" ? body.supplyQuality : 50,
      demandQuality:       typeof body.demandQuality === "number" ? body.demandQuality : 50,
      liquidityScore:      typeof body.liquidityScore === "number" ? body.liquidityScore : 50,
      amdScore:            typeof body.amdScore === "number" ? body.amdScore : 50,
      confirmationQuality: typeof body.confirmationQuality === "number" ? body.confirmationQuality : 50,
      setupScore:          typeof body.setupScore === "number" ? body.setupScore : 50,
      tqi:                 typeof body.tqi === "number" ? body.tqi : 50,
      rrPlanned:           typeof body.rrPlanned === "number" ? body.rrPlanned : 2.0,
      spreadPips:          typeof body.spreadPips === "number" ? body.spreadPips : 1.0,
      volatility:          (body.volatility === "low" || body.volatility === "medium" || body.volatility === "high")
                             ? body.volatility : "medium",
      direction:           (body.direction === "buy" || body.direction === "sell") ? body.direction : "buy",
      evaluatedAt:         new Date(),
    };

    // Load historical features
    const historicalFeatures = await loadHistoricalFeatures();

    // Run the decision pipeline
    const report = evaluateSetup(setup, historicalFeatures);

    // Store in memory
    diStore.addRecommendation(report);

    // Persist to DB
    await db.insert(diRecommendationsTable).values({
      recommendationId:        report.recommendationId,
      setupId:                 report.setup.setupId,
      pair:                    report.setup.pair,
      session:                 report.setup.session,
      regime:                  report.setup.regime,
      trend:                   report.setup.trend,
      supplyQuality:           String(report.setup.supplyQuality),
      demandQuality:           String(report.setup.demandQuality),
      liquidityScore:          String(report.setup.liquidityScore),
      amdScore:                String(report.setup.amdScore),
      confirmationQuality:     String(report.setup.confirmationQuality),
      setupScore:              String(report.setup.setupScore),
      tqi:                     String(report.setup.tqi),
      rrPlanned:               String(report.setup.rrPlanned),
      spreadPips:              String(report.setup.spreadPips),
      volatility:              report.setup.volatility,
      tisScore:                String(report.tisScore),
      tisComponents:           Object.fromEntries(report.tisComponents.map(c => [c.key, c.score])),
      tisWeights:              Object.fromEntries(report.tisComponents.map(c => [c.key, c.weight])),
      recommendationLevel:     report.recommendationLevel,
      recommendationLabel:     report.recommendationLabel,
      confidenceScore:         String(report.confidenceScore),
      uncertaintyLevel:        report.uncertaintyLevel,
      reliabilityRating:       report.reliabilityRating,
      isLowConfidence:         report.isLowConfidence,
      hasConflictingEvidence:  report.hasConflictingEvidence,
      historicalEvidenceCount: report.historicalEvidenceCount,
      similarWinCount:         report.similarWinCount,
      similarLossCount:        report.similarLossCount,
      historicalWinRate:       String(report.historicalWinRate),
      statisticalExpectancy:   String(report.statisticalExpectancy),
      positiveFactors:         report.positiveFactors,
      negativeFactors:         report.negativeFactors,
      report:                  { tisComponents: report.tisComponents, validationFlags: report.validationFlags },
      reasoning:               report.reasoning,
      evaluatedAt:             report.evaluatedAt,
    });

    // Persist similar experiences
    const expRows = [
      ...report.similarWinningExperiences.map(e => ({ ...e, recommendationId: report.recommendationId })),
      ...report.similarLosingExperiences.map(e => ({ ...e, recommendationId: report.recommendationId })),
    ];
    if (expRows.length > 0) {
      await db.insert(diSimilarExperiencesTable).values(
        expRows.map(e => ({
          recommendationId: e.recommendationId,
          tradeId:          e.tradeId,
          similarityScore:  String(e.similarityScore),
          isWin:            e.isWin,
          outcome:          e.outcome,
          historicalRR:     String(e.historicalRR),
          historicalPnl:    String(e.historicalPnl),
          historicalConf:   String(e.historicalConf),
          pair:             e.pair,
          session:          e.session,
          regime:           e.regime,
          similarityReason: e.similarityReason,
          featureVector:    e.featureVector,
        })),
      );
    }

    // Audit history
    await db.insert(diRecommendationHistoryTable).values({
      recommendationId:    report.recommendationId,
      eventType:           "created",
      tisScore:            String(report.tisScore),
      confidenceScore:     String(report.confidenceScore),
      recommendationLevel: report.recommendationLevel,
      pair:                report.setup.pair,
      session:             report.setup.session,
      regime:              report.setup.regime,
      eventData:           {
        setupId: report.setup.setupId,
        tisComponents: report.tisComponents.map(c => ({ key: c.key, score: c.score })),
      },
    });

    res.json({ success: true, report });
  } catch (err) {
    console.error("[decision-intelligence] evaluate error:", err);
    res.status(500).json({ success: false, message: String(err) });
  }
});

// ─── GET /learning/recommendations ───────────────────────────────────────────

decisionIntelligenceRouter.get("/learning/recommendations", async (req, res) => {
  try {
    const limit  = Math.min(Number(req.query.limit)  || 20, 50);
    const offset = Number(req.query.offset) || 0;
    const pair   = req.query.pair as string | undefined;

    // Serve from in-memory if populated
    const memory = diStore.getRecommendations(limit + offset);
    if (memory.length > 0) {
      const filtered = pair ? memory.filter(r => r.setup.pair === pair) : memory;
      return res.json({
        recommendations: filtered.slice(offset, offset + limit),
        total:           filtered.length,
        fromMemory:      true,
        accuracyStats:   diStore.getAccuracyStats(),
      });
    }

    // Fall back to DB
    const rows = await db
      .select()
      .from(diRecommendationsTable)
      .orderBy(desc(diRecommendationsTable.evaluatedAt))
      .limit(limit)
      .offset(offset);

    res.json({
      recommendations: rows,
      total:           rows.length,
      fromMemory:      false,
    });
  } catch (err) {
    console.error("[decision-intelligence] list error:", err);
    res.status(500).json({ success: false, message: String(err) });
  }
});

// ─── GET /learning/recommendations/:id ───────────────────────────────────────

decisionIntelligenceRouter.get("/learning/recommendations/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Check memory first
    const memRec = diStore.getRecommendation(id);
    if (memRec) {
      return res.json({ recommendation: memRec, fromMemory: true });
    }

    // Fall back to DB
    const [row] = await db
      .select()
      .from(diRecommendationsTable)
      .where(eq(diRecommendationsTable.recommendationId, id))
      .limit(1);

    if (!row) return res.status(404).json({ success: false, message: "Recommendation not found" });

    // Fetch similar experiences
    const experiences = await db
      .select()
      .from(diSimilarExperiencesTable)
      .where(eq(diSimilarExperiencesTable.recommendationId, id))
      .orderBy(desc(diSimilarExperiencesTable.similarityScore));

    res.json({ recommendation: row, similarExperiences: experiences, fromMemory: false });
  } catch (err) {
    console.error("[decision-intelligence] getById error:", err);
    res.status(500).json({ success: false, message: String(err) });
  }
});

// ─── GET /learning/trade-intelligence ────────────────────────────────────────
// Latest TIS report + engine status.

decisionIntelligenceRouter.get("/learning/trade-intelligence", async (req, res) => {
  try {
    const lastReport    = diStore.getLastReport();
    const state         = diStore.getState();
    const dbCount       = await db.$count(diRecommendationsTable);
    const accuracyStats = diStore.getAccuracyStats();

    res.json({
      version:          DI_ENGINE_VERSION,
      isAdvisoryOnly:   true,
      totalEvaluations: state.totalEvaluations,
      dbEvaluations:    dbCount,
      lastEvaluatedAt:  state.lastEvaluatedAt,
      lastReport:       lastReport ?? null,
      accuracyStats,
      hasData:          state.totalEvaluations > 0 || dbCount > 0,
    });
  } catch (err) {
    console.error("[decision-intelligence] trade-intelligence error:", err);
    res.status(500).json({ success: false, message: String(err) });
  }
});

// ─── GET /learning/similar-experiences ───────────────────────────────────────

decisionIntelligenceRouter.get("/learning/similar-experiences", async (req, res) => {
  try {
    const recommendationId = req.query.recommendationId as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    // Check in-memory store
    if (recommendationId) {
      const memRec = diStore.getRecommendation(recommendationId);
      if (memRec) {
        return res.json({
          wins:   memRec.similarWinningExperiences,
          losses: memRec.similarLosingExperiences,
          total:  memRec.similarWinningExperiences.length + memRec.similarLosingExperiences.length,
          fromMemory: true,
        });
      }
    }

    // DB fallback
    const query = db
      .select()
      .from(diSimilarExperiencesTable)
      .orderBy(desc(diSimilarExperiencesTable.similarityScore))
      .limit(limit);

    const rows = recommendationId
      ? await db
          .select()
          .from(diSimilarExperiencesTable)
          .where(eq(diSimilarExperiencesTable.recommendationId, recommendationId))
          .orderBy(desc(diSimilarExperiencesTable.similarityScore))
          .limit(limit)
      : await query;

    const wins   = rows.filter(r => r.isWin);
    const losses = rows.filter(r => !r.isWin);

    res.json({ wins, losses, total: rows.length, fromMemory: false });
  } catch (err) {
    console.error("[decision-intelligence] similar-experiences error:", err);
    res.status(500).json({ success: false, message: String(err) });
  }
});

// ─── GET /learning/recommendation-history ─────────────────────────────────────

decisionIntelligenceRouter.get("/learning/recommendation-history", async (req, res) => {
  try {
    const limit    = Math.min(Number(req.query.limit) || 50, 200);
    const offset   = Number(req.query.offset) || 0;
    const eventType = req.query.eventType as string | undefined;

    const rows = await db
      .select()
      .from(diRecommendationHistoryTable)
      .orderBy(desc(diRecommendationHistoryTable.recordedAt))
      .limit(limit)
      .offset(offset);

    const filtered = eventType ? rows.filter(r => r.eventType === eventType) : rows;

    // Accuracy summary from history
    const withOutcome = filtered.filter(r => r.outcome !== null);
    const accurate    = withOutcome.filter(r => r.wasAccurate === true);
    const accuracyRate = withOutcome.length > 0 ? accurate.length / withOutcome.length : 0;

    res.json({
      history:           filtered,
      total:             filtered.length,
      accuracySummary: {
        totalWithOutcome: withOutcome.length,
        accurateCount:    accurate.length,
        accuracyRate:     Math.round(accuracyRate * 1000) / 1000,
      },
    });
  } catch (err) {
    console.error("[decision-intelligence] recommendation-history error:", err);
    res.status(500).json({ success: false, message: String(err) });
  }
});

// ─── POST /learning/recommendations/:id/outcome ───────────────────────────────
// Record a final trade outcome against a recommendation.

decisionIntelligenceRouter.post("/learning/recommendations/:id/outcome", async (req, res) => {
  try {
    const { id } = req.params;
    const { outcome, finalRR } = req.body as { outcome?: string; finalRR?: number };

    if (!outcome || !["win", "loss", "break_even"].includes(outcome)) {
      return res.status(400).json({ success: false, message: "outcome must be win | loss | break_even" });
    }

    const rr = typeof finalRR === "number" ? finalRR : 0;

    // Update in-memory store
    const updated = diStore.recordOutcome(id, outcome as "win" | "loss" | "break_even", rr);

    // Determine accuracy
    const memRec = diStore.getRecommendation(id);
    const level  = memRec?.recommendationLevel;
    const isPositive = level && ["exceptional", "high_quality", "good_opportunity"].includes(level);
    const isNegative = level && ["avoid", "low_quality"].includes(level);
    const wasAccurate =
      (isPositive && outcome === "win") ||
      (isNegative && outcome === "loss") ||
      (level === "neutral") || false;

    // Persist to DB
    await db
      .update(diRecommendationsTable)
      .set({
        finalOutcome:      outcome,
        finalRR:           String(rr),
        wasAccurate,
        outcomeRecordedAt: new Date(),
      })
      .where(eq(diRecommendationsTable.recommendationId, id));

    // Audit log
    await db.insert(diRecommendationHistoryTable).values({
      recommendationId:    id,
      eventType:           "outcome_recorded",
      pair:                memRec?.setup.pair,
      session:             memRec?.setup.session,
      regime:              memRec?.setup.regime,
      recommendationLevel: level,
      outcome,
      wasAccurate,
      eventData:           { finalRR: rr, outcome },
    });

    res.json({
      success:    true,
      updated,
      wasAccurate,
      accuracyStats: diStore.getAccuracyStats(),
    });
  } catch (err) {
    console.error("[decision-intelligence] record-outcome error:", err);
    res.status(500).json({ success: false, message: String(err) });
  }
});

// ─── GET /learning/decision-report ───────────────────────────────────────────
// Generate and return DECISION_INTELLIGENCE_REPORT.md.

decisionIntelligenceRouter.get("/learning/decision-report", async (_req, res) => {
  try {
    const lastReport = diStore.getLastReport() ?? undefined;
    const md         = generateDecisionReport(lastReport ?? undefined);

    // Write to disk (non-fatal)
    try {
      const reportPath = path.join(process.cwd(), "DECISION_INTELLIGENCE_REPORT.md");
      fs.writeFileSync(reportPath, md, "utf8");
    } catch { /* non-fatal */ }

    res.json({
      success: true,
      version: DI_ENGINE_VERSION,
      markdown: md,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[decision-intelligence] report error:", err);
    res.status(500).json({ success: false, message: String(err) });
  }
});
