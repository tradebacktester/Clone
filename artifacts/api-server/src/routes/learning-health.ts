// ─── Learning Health Routes ───────────────────────────────────────────────────
// Phase 3: Learning Validation, Drift Detection, Health Monitor, Scheduler.
// Advisory only — no routes here modify trading behavior.
//
// GET /learning/health
// GET /learning/drift
// GET /learning/validation
// GET /learning/recommendation-accuracy
// GET /learning/certification
// GET /learning/reports
// POST /learning/run-cycle       (trigger manual scheduled run)
// POST /learning/validate        (run standalone validation)

import { Router } from "express";
import { db } from "@workspace/db";
import {
  learningCyclesTable,
  learningFeaturesTable,
  learningValidationResultsTable,
  learningDriftEventsTable,
  learningSchedulerLogTable,
  recommendationAccuracyLogTable,
  learningHealthSnapshotsTable,
  patternRecordsTable,
  tradeMemoryTable,
  skippedSetupMemoryTable,
  tradeReviewsTable,
} from "@workspace/db";
import {
  desc,
  eq,
  sql,
  and,
  gte,
  lte,
  count,
  isNull,
} from "drizzle-orm";
import {
  runLearningPipeline,
  historyStore,
  LEARNING_ENGINE_VERSION,
} from "@workspace/market-analysis";
import type { RawTradeRecord, RawSkippedSetup, RawManualReview } from "@workspace/market-analysis";

import {
  runStatisticalValidation,
} from "../lib/phase3/statistical-validator-bridge.js";
import {
  runDriftDetectionBridge,
} from "../lib/phase3/drift-detector-bridge.js";
import {
  computeHealthBridge,
} from "../lib/phase3/health-monitor-bridge.js";
import {
  evaluateAccuracyBridge,
} from "../lib/phase3/recommendation-tracker-bridge.js";
import {
  buildScheduledRun,
  computeScheduleWindow,
  getScheduleStatus,
} from "../lib/phase3/scheduler-bridge.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── Helper: Load trade records ───────────────────────────────────────────────

async function loadTradeRecords(fromDate?: Date, toDate?: Date): Promise<RawTradeRecord[]> {
  const conditions: ReturnType<typeof gte>[] = [];
  if (fromDate) conditions.push(gte(tradeMemoryTable.openedAt, fromDate));
  if (toDate) conditions.push(lte(tradeMemoryTable.openedAt, toDate));

  const rows = await db
    .select()
    .from(tradeMemoryTable)
    .where(conditions.length ? and(...conditions) : sql`${tradeMemoryTable.outcome} IS NOT NULL`)
    .orderBy(desc(tradeMemoryTable.openedAt))
    .limit(5000);

  return rows.map(r => ({
    id: r.id,
    pair: r.pair,
    direction: r.direction,
    session: r.session,
    regime: r.regime,
    regimeConfidence: r.regimeConfidence ? Number(r.regimeConfidence) : null,
    zoneScore: r.zoneScore ? Number(r.zoneScore) : null,
    liquidityScore: r.liquidityScore ? Number(r.liquidityScore) : null,
    amdScore: r.amdScore ? Number(r.amdScore) : null,
    confirmationScore: r.confirmationScore ? Number(r.confirmationScore) : null,
    finalScore: r.finalScore ? Number(r.finalScore) : null,
    confidence: r.confidence ? Number(r.confidence) : null,
    zoneType: r.zoneType,
    amdPattern: r.amdPattern,
    riskRewardPlanned: r.riskRewardPlanned ? Number(r.riskRewardPlanned) : null,
    riskRewardActual: r.riskRewardActual ? Number(r.riskRewardActual) : null,
    slippagePips: r.slippagePips ? Number(r.slippagePips) : null,
    outcome: r.outcome,
    pnl: r.pnl ? Number(r.pnl) : null,
    pnlPercent: r.pnlPercent ? Number(r.pnlPercent) : null,
    timeInTradeMins: r.timeInTradeMins,
    openedAt: r.openedAt,
    closedAt: r.closedAt,
    spreadPips: r.spreadPips ? Number(r.spreadPips) : null,
    setupScore: r.finalScore ? Number(r.finalScore) : null,
    tqi: r.tqi ? Number(r.tqi) : null,
  }));
}

// ─── GET /learning/health ─────────────────────────────────────────────────────

router.get("/learning/health", async (req, res) => {
  try {
    const snapshot = await computeHealthBridge();
    res.json({ ok: true, data: snapshot });
  } catch (err) {
    logger.error({ err }, "GET /learning/health failed");
    res.status(500).json({ ok: false, error: "Failed to compute health snapshot" });
  }
});

// ─── GET /learning/drift ──────────────────────────────────────────────────────

router.get("/learning/drift", async (req, res) => {
  try {
    const windowDays = parseInt(String(req.query.window ?? "90"));
    const resolved = req.query.resolved === "true";

    const conditions = [];
    if (!resolved) conditions.push(eq(learningDriftEventsTable.resolved, false));

    const recentEvents = await db
      .select()
      .from(learningDriftEventsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(learningDriftEventsTable.detectedAt))
      .limit(100);

    // Also run a live detection pass
    const trades = await loadTradeRecords();
    const liveReport = await runDriftDetectionBridge(trades);

    res.json({
      ok: true,
      data: {
        storedEvents: recentEvents,
        liveDetection: liveReport,
        summary: {
          totalActive: recentEvents.length,
          criticalCount: recentEvents.filter(e => e.severity === "critical").length,
          highCount: recentEvents.filter(e => e.severity === "high").length,
        },
      },
    });
  } catch (err) {
    logger.error({ err }, "GET /learning/drift failed");
    res.status(500).json({ ok: false, error: "Failed to load drift data" });
  }
});

// ─── GET /learning/validation ─────────────────────────────────────────────────

router.get("/learning/validation", async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "20")), 100);

    const results = await db
      .select()
      .from(learningValidationResultsTable)
      .orderBy(desc(learningValidationResultsTable.createdAt))
      .limit(limit);

    // Run live validation
    const trades = await loadTradeRecords();
    const liveValidation = await runStatisticalValidation(trades);

    const summary = {
      totalValidations: results.length,
      passedCount: results.filter(r => r.overallStatus === "passed").length,
      degradedCount: results.filter(r => r.overallStatus === "degraded").length,
      failedCount: results.filter(r => r.overallStatus === "failed").length,
      latestScore: results[0]?.overallScore ?? null,
    };

    res.json({ ok: true, data: { history: results, liveValidation, summary } });
  } catch (err) {
    logger.error({ err }, "GET /learning/validation failed");
    res.status(500).json({ ok: false, error: "Failed to load validation data" });
  }
});

// ─── GET /learning/recommendation-accuracy ────────────────────────────────────

router.get("/learning/recommendation-accuracy", async (req, res) => {
  try {
    const window = String(req.query.window ?? "all");
    const limit = Math.min(parseInt(String(req.query.limit ?? "10")), 50);

    const history = await db
      .select()
      .from(recommendationAccuracyLogTable)
      .orderBy(desc(recommendationAccuracyLogTable.evaluatedAt))
      .limit(limit);

    const liveAccuracy = await evaluateAccuracyBridge(window);

    res.json({ ok: true, data: { history, liveAccuracy, window } });
  } catch (err) {
    logger.error({ err }, "GET /learning/recommendation-accuracy failed");
    res.status(500).json({ ok: false, error: "Failed to load recommendation accuracy" });
  }
});

// ─── GET /learning/certification ──────────────────────────────────────────────

router.get("/learning/certification", async (req, res) => {
  try {
    const [latestHealth] = await db
      .select()
      .from(learningHealthSnapshotsTable)
      .orderBy(desc(learningHealthSnapshotsTable.snapshotAt))
      .limit(1);

    const [latestValidation] = await db
      .select()
      .from(learningValidationResultsTable)
      .orderBy(desc(learningValidationResultsTable.createdAt))
      .limit(1);

    const [totalCycles] = await db
      .select({ count: count() })
      .from(learningCyclesTable)
      .where(eq(learningCyclesTable.status, "complete"));

    const [totalFeatures] = await db
      .select({ count: count() })
      .from(learningFeaturesTable);

    const [totalPatterns] = await db
      .select({ count: count() })
      .from(patternRecordsTable);

    const activeDriftAlerts = await db
      .select({ count: count() })
      .from(learningDriftEventsTable)
      .where(eq(learningDriftEventsTable.resolved, false));

    const healthScore = Number(latestHealth?.overallScore ?? 0);
    const certificationStatus = latestHealth?.certificationStatus ?? "not_ready";

    const checklist = [
      { item: "Minimum trade sample collected (≥ 30)", status: (totalFeatures[0]?.count ?? 0) >= 30, priority: "critical" },
      { item: "Statistical validation passed", status: latestValidation?.overallStatus === "passed", priority: "critical" },
      { item: "No critical drift alerts active", status: (activeDriftAlerts[0]?.count ?? 0) === 0, priority: "critical" },
      { item: "Learning cycles completed (≥ 3)", status: (totalCycles[0]?.count ?? 0) >= 3, priority: "high" },
      { item: "Health score ≥ 70", status: healthScore >= 70, priority: "high" },
      { item: "Pattern knowledge base populated", status: (totalPatterns[0]?.count ?? 0) > 0, priority: "high" },
      { item: "Data quality ≥ 70/100", status: Number(latestHealth?.dataQualityScore ?? 0) >= 70, priority: "medium" },
      { item: "Confidence stability established", status: Number(latestHealth?.confidenceStabilityScore ?? 0) >= 60, priority: "medium" },
      { item: "Recommendation accuracy tracked", status: Number(latestHealth?.recommendationAccScore ?? 0) > 0, priority: "low" },
    ];

    const readinessScore = Math.round(
      (checklist.filter(c => c.status).length / checklist.length) * 100
    );

    res.json({
      ok: true,
      data: {
        certificationStatus,
        healthScore,
        readinessScore,
        learningEngineVersion: LEARNING_ENGINE_VERSION,
        phaseReadyFor: certificationStatus === "certified" ? "Phase 4 (Market Intelligence)" : "Continued Phase 3 validation",
        totalCycles: totalCycles[0]?.count ?? 0,
        totalFeatures: totalFeatures[0]?.count ?? 0,
        totalPatterns: totalPatterns[0]?.count ?? 0,
        activeDriftAlerts: activeDriftAlerts[0]?.count ?? 0,
        checklist,
        lastHealthAt: latestHealth?.snapshotAt ?? null,
        lastValidationAt: latestValidation?.createdAt ?? null,
      },
    });
  } catch (err) {
    logger.error({ err }, "GET /learning/certification failed");
    res.status(500).json({ ok: false, error: "Failed to load certification data" });
  }
});

// ─── GET /learning/reports ────────────────────────────────────────────────────

router.get("/learning/reports", async (req, res) => {
  try {
    const [latestHealth] = await db
      .select()
      .from(learningHealthSnapshotsTable)
      .orderBy(desc(learningHealthSnapshotsTable.snapshotAt))
      .limit(1);

    const [latestValidation] = await db
      .select()
      .from(learningValidationResultsTable)
      .orderBy(desc(learningValidationResultsTable.createdAt))
      .limit(1);

    const recentDrift = await db
      .select()
      .from(learningDriftEventsTable)
      .where(eq(learningDriftEventsTable.resolved, false))
      .orderBy(desc(learningDriftEventsTable.detectedAt))
      .limit(20);

    const recentCycles = await db
      .select()
      .from(learningCyclesTable)
      .orderBy(desc(learningCyclesTable.startedAt))
      .limit(10);

    const schedulerHistory = await db
      .select()
      .from(learningSchedulerLogTable)
      .orderBy(desc(learningSchedulerLogTable.createdAt))
      .limit(20);

    const scheduleStatus = {
      daily: getScheduleStatus("daily", schedulerHistory.find(r => r.scheduleType === "daily")?.completedAt ?? null),
      weekly: getScheduleStatus("weekly", schedulerHistory.find(r => r.scheduleType === "weekly")?.completedAt ?? null),
      monthly: getScheduleStatus("monthly", schedulerHistory.find(r => r.scheduleType === "monthly")?.completedAt ?? null),
    };

    res.json({
      ok: true,
      data: {
        latestHealth,
        latestValidation,
        recentDrift,
        recentCycles,
        schedulerHistory,
        scheduleStatus,
      },
    });
  } catch (err) {
    logger.error({ err }, "GET /learning/reports failed");
    res.status(500).json({ ok: false, error: "Failed to load reports data" });
  }
});

// ─── GET /learning/schedule ───────────────────────────────────────────────────

router.get("/learning/schedule", async (req, res) => {
  try {
    const history = await db
      .select()
      .from(learningSchedulerLogTable)
      .orderBy(desc(learningSchedulerLogTable.createdAt))
      .limit(50);

    const lastByType = {
      daily: history.find(r => r.scheduleType === "daily")?.completedAt ?? null,
      weekly: history.find(r => r.scheduleType === "weekly")?.completedAt ?? null,
      monthly: history.find(r => r.scheduleType === "monthly")?.completedAt ?? null,
    };

    const scheduleStatus = {
      daily: getScheduleStatus("daily", lastByType.daily),
      weekly: getScheduleStatus("weekly", lastByType.weekly),
      monthly: getScheduleStatus("monthly", lastByType.monthly),
    };

    res.json({ ok: true, data: { history, scheduleStatus } });
  } catch (err) {
    logger.error({ err }, "GET /learning/schedule failed");
    res.status(500).json({ ok: false, error: "Failed to load schedule data" });
  }
});

// ─── POST /learning/run-cycle ─────────────────────────────────────────────────

router.post("/learning/run-cycle", async (req, res) => {
  const scheduleType = (req.body?.scheduleType ?? "manual") as "daily" | "weekly" | "monthly" | "manual";

  const scheduledRun = buildScheduledRun(scheduleType);
  const { window: win } = scheduledRun;

  // Insert scheduler log as pending
  await db.insert(learningSchedulerLogTable).values({
    runId: scheduledRun.runId,
    scheduleType,
    status: "running",
    fromDate: win.fromDate,
    toDate: win.toDate,
    tradesCollected: 0,
    driftEventsFound: 0,
    scheduledFor: scheduledRun.scheduledFor,
    startedAt: new Date(),
  });

  // Run async — respond immediately
  res.json({
    ok: true,
    data: {
      runId: scheduledRun.runId,
      scheduleType,
      window: win.label,
      status: "running",
      message: "Learning cycle started. Use GET /learning/schedule to check progress.",
    },
  });

  // Background execution
  setImmediate(async () => {
    const startedAt = new Date();
    let pipelineStatus = "pending";
    let validationStatus = "pending";
    let driftEventsFound = 0;
    let cycleId: string | null = null;
    let validationId: string | null = null;
    let healthScoreAfter: number | null = null;
    let errorMessage: string | null = null;
    let tradesCollected = 0;

    try {
      // 1. Collect
      const trades = await loadTradeRecords(win.fromDate, win.toDate);
      const skipped: RawSkippedSetup[] = [];
      tradesCollected = trades.length;

      // 2. Pipeline
      const pipelineResult = await runLearningPipeline({
        triggeredBy: scheduleType,
        trades,
        skippedSetups: skipped,
        manualReviews: [],
        dataRangeFrom: win.fromDate,
        dataRangeTo: win.toDate,
      });
      pipelineStatus = pipelineResult.cycle.status;
      cycleId = pipelineResult.cycle.id;

      // 3. Statistical validation
      const { extractFeatures } = await import("@workspace/market-analysis");
      const features = extractFeatures(trades);
      const historicalCycles = await db
        .select({ winRate: learningCyclesTable.winRate })
        .from(learningCyclesTable)
        .where(eq(learningCyclesTable.status, "complete"))
        .orderBy(desc(learningCyclesTable.startedAt))
        .limit(20);
      const histWinRates = historicalCycles.map(c => Number(c.winRate ?? 0)).filter(v => v > 0);
      const validation = await runStatisticalValidation(features, histWinRates);
      validationStatus = validation.overallStatus;
      validationId = validation.validationId;

      // Persist validation
      await db.insert(learningValidationResultsTable).values({
        validationId: validation.validationId,
        cycleId,
        triggeredBy: scheduleType,
        sampleSize: validation.sampleSize,
        minSampleMet: validation.minSampleMet,
        minSampleRequired: validation.minSampleRequired,
        observedWinRate: String(validation.observedWinRate),
        ci95Lower: String(validation.ci95Lower),
        ci95Upper: String(validation.ci95Upper),
        wilsonLowerBound: String(validation.wilsonLower),
        zScore: String(validation.zScore),
        pValue: String(validation.pValue),
        statisticallySignificant: validation.statisticallySignificant,
        stabilityScore: String(validation.stabilityScore),
        stabilityGrade: validation.stabilityGrade,
        windowConsistency: String(validation.windowConsistency),
        dataQualityScore: String(validation.dataQualityScore),
        completenessScore: String(validation.completenessScore),
        missingDataPct: String(validation.missingDataPct),
        conflictingEvidence: validation.conflictingEvidence,
        reproducibilityScore: String(validation.reproducibilityScore),
        cycleVariance: String(validation.cycleVariance),
        outlierCount: validation.outlierCount,
        outlierInfluence: String(validation.outlierInfluence),
        jackknifeDelta: String(validation.jackknifeDelta),
        overallStatus: validation.overallStatus,
        overallScore: String(validation.overallScore),
        passedChecks: validation.passedChecks,
        totalChecks: validation.totalChecks,
        issues: validation.issues,
        recommendations: validation.recommendations,
      });

      // 4. Drift detection
      const driftReport = await runDriftDetectionBridge(features);
      driftEventsFound = driftReport.totalEventsDetected;

      // Persist drift events
      for (const event of driftReport.events) {
        await db.insert(learningDriftEventsTable).values({
          driftId: event.driftId,
          driftType: event.driftType,
          severity: event.severity,
          affectedEntity: event.affectedEntity,
          affectedWindow: event.affectedWindow,
          baselineValue: String(event.baselineValue),
          currentValue: String(event.currentValue),
          deltaAbsolute: String(event.deltaAbsolute),
          deltaPct: String(event.deltaPct),
          threshold: String(event.threshold),
          zScore: String(event.zScore),
          pValue: String(event.pValue),
          isSignificant: event.isSignificant,
          description: event.description,
          recommendation: event.recommendation,
        }).onConflictDoNothing();
      }

      // 5. Health snapshot
      const healthSnapshot = await computeHealthBridge();
      healthScoreAfter = healthSnapshot.overallScore;

      await db.insert(learningHealthSnapshotsTable).values({
        snapshotId: healthSnapshot.snapshotId,
        triggeredBy: scheduleType,
        overallScore: String(healthSnapshot.overallScore),
        grade: healthSnapshot.grade,
        certificationStatus: healthSnapshot.certificationStatus,
        dataQualityScore: String(healthSnapshot.dataQualityScore),
        evidenceVolumeScore: String(healthSnapshot.evidenceVolumeScore),
        confidenceStabilityScore: String(healthSnapshot.confidenceStabilityScore),
        patternReliabilityScore: String(healthSnapshot.patternReliabilityScore),
        validationSuccessScore: String(healthSnapshot.validationSuccessScore),
        driftStatusScore: String(healthSnapshot.driftStatusScore),
        recommendationAccScore: String(healthSnapshot.recommendationAccScore),
        totalCycles: healthSnapshot.totalCycles,
        passedCycles: healthSnapshot.passedCycles,
        activeDriftAlerts: healthSnapshot.activeDriftAlerts,
        criticalDriftAlerts: healthSnapshot.criticalDriftAlerts,
        totalPatterns: healthSnapshot.totalPatterns,
        reliablePatterns: healthSnapshot.reliablePatterns,
        totalFeatures: healthSnapshot.totalFeatures,
        strengths: healthSnapshot.strengths,
        weaknesses: healthSnapshot.weaknesses,
        recommendations: healthSnapshot.recommendations,
      });

    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "Background learning cycle failed");
    }

    // Update scheduler log
    const completedAt = new Date();
    await db
      .update(learningSchedulerLogTable)
      .set({
        status: errorMessage ? "failed" : "complete",
        cycleId,
        validationId,
        tradesCollected,
        pipelineStatus,
        validationStatus,
        driftEventsFound,
        healthScoreAfter: healthScoreAfter !== null ? String(healthScoreAfter) : null,
        errorMessage,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        completedAt,
      })
      .where(eq(learningSchedulerLogTable.runId, scheduledRun.runId));
  });
});

// ─── POST /learning/validate ──────────────────────────────────────────────────

router.post("/learning/validate", async (req, res) => {
  try {
    const { extractFeatures } = await import("@workspace/market-analysis");
    const trades = await loadTradeRecords();
    const features = extractFeatures(trades);

    const historicalCycles = await db
      .select({ winRate: learningCyclesTable.winRate })
      .from(learningCyclesTable)
      .where(eq(learningCyclesTable.status, "complete"))
      .orderBy(desc(learningCyclesTable.startedAt))
      .limit(20);
    const histWinRates = historicalCycles.map(c => Number(c.winRate ?? 0)).filter(v => v > 0);

    const result = await runStatisticalValidation(features, histWinRates);

    // Persist
    await db.insert(learningValidationResultsTable).values({
      validationId: result.validationId,
      triggeredBy: "manual",
      sampleSize: result.sampleSize,
      minSampleMet: result.minSampleMet,
      minSampleRequired: result.minSampleRequired,
      observedWinRate: String(result.observedWinRate),
      ci95Lower: String(result.ci95Lower),
      ci95Upper: String(result.ci95Upper),
      wilsonLowerBound: String(result.wilsonLower),
      zScore: String(result.zScore),
      pValue: String(result.pValue),
      statisticallySignificant: result.statisticallySignificant,
      stabilityScore: String(result.stabilityScore),
      stabilityGrade: result.stabilityGrade,
      windowConsistency: String(result.windowConsistency),
      dataQualityScore: String(result.dataQualityScore),
      completenessScore: String(result.completenessScore),
      missingDataPct: String(result.missingDataPct),
      conflictingEvidence: result.conflictingEvidence,
      reproducibilityScore: String(result.reproducibilityScore),
      cycleVariance: String(result.cycleVariance),
      outlierCount: result.outlierCount,
      outlierInfluence: String(result.outlierInfluence),
      jackknifeDelta: String(result.jackknifeDelta),
      overallStatus: result.overallStatus,
      overallScore: String(result.overallScore),
      passedChecks: result.passedChecks,
      totalChecks: result.totalChecks,
      issues: result.issues,
      recommendations: result.recommendations,
    });

    res.json({ ok: true, data: result });
  } catch (err) {
    logger.error({ err }, "POST /learning/validate failed");
    res.status(500).json({ ok: false, error: "Validation failed" });
  }
});

// ─── POST /learning/drift/resolve ─────────────────────────────────────────────

router.post("/learning/drift/resolve/:driftId", async (req, res) => {
  try {
    const { driftId } = req.params;
    const note = String(req.body?.note ?? "");

    await db
      .update(learningDriftEventsTable)
      .set({
        resolved: true,
        resolvedAt: new Date(),
        resolvedNote: note || "Manually resolved",
      })
      .where(eq(learningDriftEventsTable.driftId, driftId));

    res.json({ ok: true, data: { driftId, resolved: true } });
  } catch (err) {
    logger.error({ err }, "POST /learning/drift/resolve failed");
    res.status(500).json({ ok: false, error: "Failed to resolve drift event" });
  }
});

// ─── GET /learning/health/history ─────────────────────────────────────────────

router.get("/learning/health/history", async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "30")), 100);
    const snapshots = await db
      .select()
      .from(learningHealthSnapshotsTable)
      .orderBy(desc(learningHealthSnapshotsTable.snapshotAt))
      .limit(limit);
    res.json({ ok: true, data: snapshots });
  } catch (err) {
    logger.error({ err }, "GET /learning/health/history failed");
    res.status(500).json({ ok: false, error: "Failed to load health history" });
  }
});

export default router;
