// ─── Learning Enhancement Routes ──────────────────────────────────────────────
// Phase 4: Calibration, Regime Transitions, Versioning, Quality Monitor.
// ADVISORY ONLY — no routes modify trading behavior.
//
// Route prefix: /learning/enhancement/* (mounted at /api)
//
// GET  /learning/enhancement/calibration           — current calibration result
// GET  /learning/enhancement/calibration/history   — historical calibration snapshots
// GET  /learning/enhancement/regime/transitions    — stored transitions + live analysis
// GET  /learning/enhancement/regime/state          — current regime state
// GET  /learning/enhancement/versions              — all learning versions
// GET  /learning/enhancement/versions/:id          — single version detail
// POST /learning/enhancement/versions/compare      — compare two versions
// GET  /learning/enhancement/versions/changelog    — markdown changelog
// GET  /learning/enhancement/quality               — current quality snapshot
// GET  /learning/enhancement/quality/alerts        — active quality alerts
// POST /learning/enhancement/quality/alerts/:id/resolve — resolve an alert
// POST /learning/enhancement/run-calibration       — trigger calibration run
// POST /learning/enhancement/run-regime-analysis   — trigger regime analysis
// POST /learning/enhancement/create-version        — create a version snapshot

import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import {
  calibrationResultsTable,
  regimeTransitionsTable,
  learningVersionsTable,
  learningQualitySnapshotsTable,
  qualityAlertsTable,
  tradesTable,
} from "@workspace/db/schema";
import { desc, eq, and, sql } from "drizzle-orm";
import {
  runCalibration,
  filterByWindow,
  analyzeRegimeState,
  detectRegimeTransition,
  buildRegimeHistory,
  featuresToCandles,
  buildLearningVersion,
  compareVersions,
  generateVersionChangelog,
  computeQualitySnapshot,
  extractFeatures,
} from "@workspace/market-analysis";

const router = Router();

// ─── Shared: Load features from DB ───────────────────────────────────────────

async function loadFeatures(windowDays?: number | null) {
  const trades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"));
  const features = extractFeatures(trades);
  if (!windowDays) return features;
  return filterByWindow(features, windowDays);
}

// ─── Calibration: Current ─────────────────────────────────────────────────────

router.get("/learning/enhancement/calibration", async (req, res) => {
  try {
    const windowParam = req.query["window"] as string | undefined;
    const windowDays = windowParam === "7d" ? 7 : windowParam === "30d" ? 30 : windowParam === "90d" ? 90 : null;

    // Return latest stored calibration if available
    const stored = await db
      .select()
      .from(calibrationResultsTable)
      .where(eq(calibrationResultsTable.evaluationWindow, windowParam ?? "all"))
      .orderBy(desc(calibrationResultsTable.evaluatedAt))
      .limit(1);

    // Also compute live
    const features = await loadFeatures(windowDays);
    const live = runCalibration(features, { evaluationWindow: windowParam ?? "all" });

    res.json({
      ok: true,
      data: {
        live,
        stored: stored[0] ?? null,
        totalFeatures: features.length,
      },
    });
  } catch (err) {
    console.error("GET /learning/enhancement/calibration error", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ─── Calibration: History ─────────────────────────────────────────────────────

router.get("/learning/enhancement/calibration/history", async (req, res) => {
  try {
    const limit = Math.min(100, Number(req.query["limit"] ?? 30));
    const history = await db
      .select()
      .from(calibrationResultsTable)
      .orderBy(desc(calibrationResultsTable.evaluatedAt))
      .limit(limit);

    res.json({ ok: true, data: history });
  } catch (err) {
    console.error("GET /learning/enhancement/calibration/history error", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ─── Regime: Transitions ──────────────────────────────────────────────────────

router.get("/learning/enhancement/regime/transitions", async (req, res) => {
  try {
    const limit = Math.min(100, Number(req.query["limit"] ?? 50));
    const pair = req.query["pair"] as string | undefined;

    const conditions = [];
    if (pair) conditions.push(eq(regimeTransitionsTable.pair, pair));

    const transitions = await db
      .select()
      .from(regimeTransitionsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(regimeTransitionsTable.detectedAt))
      .limit(limit);

    const history = buildRegimeHistory(
      transitions.map(t => ({
        transitionId: t.transitionId,
        pair: t.pair,
        fromRegime: t.fromRegime as import("@workspace/market-analysis").RegimeLabel,
        toRegime: t.toRegime as import("@workspace/market-analysis").RegimeLabel,
        transitionType: t.transitionType as import("@workspace/market-analysis").TransitionType,
        transitionConfidence: Number(t.transitionConfidence ?? 0),
        regimeConfidence: Number(t.regimeConfidence ?? 0),
        rollingVolatilityBefore: Number(t.rollingVolatilityBefore ?? 0),
        rollingVolatilityAfter: Number(t.rollingVolatilityAfter ?? 0),
        atrBefore: Number(t.atrBefore ?? 0),
        atrAfter: Number(t.atrAfter ?? 0),
        atrChangePct: Number(t.atrChangePct ?? 0),
        hurstBefore: Number(t.hurstBefore ?? 0),
        hurstAfter: Number(t.hurstAfter ?? 0),
        adxBefore: Number(t.adxBefore ?? 0),
        adxAfter: Number(t.adxAfter ?? 0),
        cusumScore: Number(t.cusumscore ?? 0),
        previousRegimeDurationDays: Number(t.previousRegimeDurationDays ?? 0),
        evidence: (t.evidence as string[]) ?? [],
        description: t.description,
        recommendation: t.recommendation,
        detectedAt: t.detectedAt,
        confirmed: t.confirmed,
      })),
    );

    res.json({ ok: true, data: { transitions, history } });
  } catch (err) {
    console.error("GET /learning/enhancement/regime/transitions error", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ─── Regime: Current State ────────────────────────────────────────────────────

router.get("/learning/enhancement/regime/state", async (req, res) => {
  try {
    const pair = (req.query["pair"] as string) ?? "SYSTEM";
    const features = await loadFeatures(null);

    const candles = featuresToCandles(features);
    const state = analyzeRegimeState(candles, pair);

    // Latest stored transition
    const latestTransition = await db
      .select()
      .from(regimeTransitionsTable)
      .orderBy(desc(regimeTransitionsTable.detectedAt))
      .limit(1);

    res.json({
      ok: true,
      data: {
        state,
        latestTransition: latestTransition[0] ?? null,
        featureCount: features.length,
      },
    });
  } catch (err) {
    console.error("GET /learning/enhancement/regime/state error", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ─── Run Regime Analysis ──────────────────────────────────────────────────────

router.post("/learning/enhancement/run-regime-analysis", async (req, res) => {
  try {
    const pair = (req.body?.pair as string) ?? "SYSTEM";
    const features = await loadFeatures(null);

    if (features.length < 20) {
      return res.json({
        ok: true,
        data: { message: "Insufficient data for regime analysis (need ≥ 20 trades)", stored: false },
      });
    }

    const allCandles = featuresToCandles(features);

    // Split into two halves to detect potential transition
    const mid = Math.floor(allCandles.length / 2);
    const prevCandles = allCandles.slice(0, mid);
    const currCandles = allCandles.slice(mid);

    // Detect latest stored regime start date
    const latestTransition = await db
      .select()
      .from(regimeTransitionsTable)
      .orderBy(desc(regimeTransitionsTable.detectedAt))
      .limit(1);

    const previousStart = latestTransition[0]?.detectedAt ?? undefined;
    const transition = detectRegimeTransition(prevCandles, currCandles, pair, previousStart);

    if (!transition) {
      const state = analyzeRegimeState(currCandles, pair);
      return res.json({
        ok: true,
        data: { message: "No regime transition detected", state, stored: false },
      });
    }

    // Store transition
    await db.insert(regimeTransitionsTable).values({
      transitionId: transition.transitionId,
      pair: transition.pair,
      fromRegime: transition.fromRegime,
      toRegime: transition.toRegime,
      transitionType: transition.transitionType,
      transitionConfidence: String(transition.transitionConfidence),
      regimeConfidence: String(transition.regimeConfidence),
      rollingVolatilityBefore: String(transition.rollingVolatilityBefore),
      rollingVolatilityAfter: String(transition.rollingVolatilityAfter),
      atrBefore: String(transition.atrBefore),
      atrAfter: String(transition.atrAfter),
      atrChangePct: String(transition.atrChangePct),
      hurstBefore: String(transition.hurstBefore),
      hurstAfter: String(transition.hurstAfter),
      adxBefore: String(transition.adxBefore),
      adxAfter: String(transition.adxAfter),
      cusumscore: String(transition.cusumScore),
      previousRegimeDurationDays: String(transition.previousRegimeDurationDays),
      evidence: transition.evidence,
      description: transition.description,
      recommendation: transition.recommendation,
      confirmed: transition.confirmed,
    }).onConflictDoNothing();

    res.json({ ok: true, data: { transition, stored: true } });
  } catch (err) {
    console.error("POST /learning/enhancement/run-regime-analysis error", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ─── Run Calibration ─────────────────────────────────────────────────────────

router.post("/learning/enhancement/run-calibration", async (req, res) => {
  try {
    const windowParam = (req.body?.window as string) ?? "all";
    const windowDays = windowParam === "7d" ? 7 : windowParam === "30d" ? 30 : windowParam === "90d" ? 90 : null;

    const features = await loadFeatures(windowDays);
    const result = runCalibration(features, { evaluationWindow: windowParam });

    // Store result
    await db.insert(calibrationResultsTable).values({
      calibrationId: result.calibrationId,
      evaluationWindow: result.evaluationWindow,
      totalSamples: result.totalSamples,
      brierScore: String(result.brierScore),
      ece: String(result.ece),
      mce: String(result.mce),
      ace: String(result.ace),
      calibrationError: String(result.calibrationError),
      overconfidentBuckets: result.overconfidentBuckets,
      underconfidentBuckets: result.underconfidentBuckets,
      wellCalibratedBuckets: result.wellCalibratedBuckets,
      overconfidentPct: String(result.overconfidentPct),
      underconfidentPct: String(result.underconfidentPct),
      buckets: result.buckets,
      calibrationTrend: result.calibrationTrend,
      calibrationGrade: result.calibrationGrade,
      calibrationStatus: result.calibrationStatus,
      summary: result.summary,
    });

    res.json({ ok: true, data: { result, stored: true } });
  } catch (err) {
    console.error("POST /learning/enhancement/run-calibration error", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ─── Versions: List ───────────────────────────────────────────────────────────

router.get("/learning/enhancement/versions", async (req, res) => {
  try {
    const limit = Math.min(100, Number(req.query["limit"] ?? 50));
    const versions = await db
      .select()
      .from(learningVersionsTable)
      .orderBy(desc(learningVersionsTable.createdAt))
      .limit(limit);

    res.json({ ok: true, data: versions });
  } catch (err) {
    console.error("GET /learning/enhancement/versions error", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ─── Versions: Changelog ─────────────────────────────────────────────────────

router.get("/learning/enhancement/versions/changelog", async (req, res) => {
  try {
    const versions = await db
      .select()
      .from(learningVersionsTable)
      .orderBy(desc(learningVersionsTable.createdAt))
      .limit(100);

    const changelog = generateVersionChangelog(
      versions.map(v => ({
        semver: v.semver,
        createdAt: v.createdAt,
        input: {
          cycleNumber: v.cycleNumber,
          tradeCount: v.tradeCount,
          featureCount: v.featureCount,
          winRate: Number(v.winRate ?? 0),
          avgConfidence: Number(v.avgConfidence ?? 0),
          avgTqi: Number(v.avgTqi ?? 0),
          avgSetupScore: Number(v.avgSetupScore ?? 0),
          profitFactor: Number(v.profitFactor ?? 0),
          totalPnl: Number(v.totalPnl ?? 0),
          validationStatus: (v.validationStatus ?? "failed") as "passed" | "degraded" | "failed",
          validationScore: Number(v.validationScore ?? 0),
          healthScore: Number(v.healthScore ?? 0),
          healthGrade: v.healthGrade ?? "F",
          topFeatureRankings: (v.topFeatureRankings as import("@workspace/market-analysis").VersionFeatureRanking[]) ?? [],
          topPatternRankings: (v.topPatternRankings as import("@workspace/market-analysis").VersionPatternRanking[]) ?? [],
          regimeDistribution: (v.regimeDistribution as Record<string, number>) ?? {},
          scheduleType: v.scheduleType ?? undefined,
          changelogNotes: v.changelogNotes ?? undefined,
          versionTag: v.versionTag ?? undefined,
        },
        changeFromPrev: v.changeFromPrev as import("@workspace/market-analysis").VersionChange | null,
      })),
    );

    res.json({ ok: true, data: { changelog, versionCount: versions.length } });
  } catch (err) {
    console.error("GET /learning/enhancement/versions/changelog error", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ─── Versions: Single ─────────────────────────────────────────────────────────

router.get("/learning/enhancement/versions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const version = await db
      .select()
      .from(learningVersionsTable)
      .where(eq(learningVersionsTable.versionId, id))
      .limit(1);

    if (!version[0]) return res.status(404).json({ ok: false, error: "Version not found" });
    res.json({ ok: true, data: version[0] });
  } catch (err) {
    console.error("GET /learning/enhancement/versions/:id error", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ─── Versions: Compare ────────────────────────────────────────────────────────

router.post("/learning/enhancement/versions/compare", async (req, res) => {
  try {
    const { versionAId, versionBId } = req.body ?? {};
    if (!versionAId || !versionBId) {
      return res.status(400).json({ ok: false, error: "versionAId and versionBId required" });
    }

    const [a, b] = await Promise.all([
      db.select().from(learningVersionsTable).where(eq(learningVersionsTable.versionId, versionAId)).limit(1),
      db.select().from(learningVersionsTable).where(eq(learningVersionsTable.versionId, versionBId)).limit(1),
    ]);

    if (!a[0] || !b[0]) {
      return res.status(404).json({ ok: false, error: "One or both versions not found" });
    }

    const toInput = (v: typeof a[0]): import("@workspace/market-analysis").LearningVersionInput => ({
      cycleNumber: v.cycleNumber,
      tradeCount: v.tradeCount,
      featureCount: v.featureCount,
      winRate: Number(v.winRate ?? 0),
      avgConfidence: Number(v.avgConfidence ?? 0),
      avgTqi: Number(v.avgTqi ?? 0),
      avgSetupScore: Number(v.avgSetupScore ?? 0),
      profitFactor: Number(v.profitFactor ?? 0),
      totalPnl: Number(v.totalPnl ?? 0),
      validationStatus: (v.validationStatus ?? "failed") as "passed" | "degraded" | "failed",
      validationScore: Number(v.validationScore ?? 0),
      healthScore: Number(v.healthScore ?? 0),
      healthGrade: v.healthGrade ?? "F",
      topFeatureRankings: (v.topFeatureRankings as import("@workspace/market-analysis").VersionFeatureRanking[]) ?? [],
      topPatternRankings: (v.topPatternRankings as import("@workspace/market-analysis").VersionPatternRanking[]) ?? [],
      regimeDistribution: (v.regimeDistribution as Record<string, number>) ?? {},
    });

    const comparison = compareVersions(
      { versionId: a[0].versionId, semver: a[0].semver, input: toInput(a[0]) },
      { versionId: b[0].versionId, semver: b[0].semver, input: toInput(b[0]) },
    );

    res.json({ ok: true, data: comparison });
  } catch (err) {
    console.error("POST /learning/enhancement/versions/compare error", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ─── Create Version ───────────────────────────────────────────────────────────

router.post("/learning/enhancement/create-version", async (req, res) => {
  try {
    const { changelogNotes, versionTag, scheduleType } = req.body ?? {};

    // Gather current state from other tables
    const [features, latestVersion] = await Promise.all([
      loadFeatures(null),
      db.select().from(learningVersionsTable).orderBy(desc(learningVersionsTable.createdAt)).limit(1),
    ]);

    const wins = features.filter(f => f.outcome === "win").length;
    const winRate = features.length > 0 ? wins / features.length : 0;
    const avgConf = features.length > 0
      ? features.reduce((s, f) => s + f.confidence, 0) / features.length
      : 0;
    const avgTqi = features.length > 0
      ? features.reduce((s, f) => s + f.tqi, 0) / features.length
      : 0;
    const avgSetup = features.length > 0
      ? features.reduce((s, f) => s + f.setupScore, 0) / features.length
      : 0;
    const totalPnl = features.reduce((s, f) => s + f.pnl, 0);
    const grossWin  = features.filter(f => f.pnl > 0).reduce((s, f) => s + f.pnl, 0);
    const grossLoss = Math.abs(features.filter(f => f.pnl < 0).reduce((s, f) => s + f.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999 : 0;

    // Regime distribution from features
    const regimeDist: Record<string, number> = {};
    for (const f of features) {
      const r = f.marketRegime ?? "unknown";
      regimeDist[r] = (regimeDist[r] ?? 0) + 1;
    }
    for (const k of Object.keys(regimeDist)) {
      regimeDist[k] = regimeDist[k] / features.length;
    }

    const prev = latestVersion[0];
    const prevInput = prev ? {
      cycleNumber: prev.cycleNumber,
      tradeCount: prev.tradeCount,
      featureCount: prev.featureCount,
      winRate: Number(prev.winRate ?? 0),
      avgConfidence: Number(prev.avgConfidence ?? 0),
      avgTqi: Number(prev.avgTqi ?? 0),
      avgSetupScore: Number(prev.avgSetupScore ?? 0),
      profitFactor: Number(prev.profitFactor ?? 0),
      totalPnl: Number(prev.totalPnl ?? 0),
      validationStatus: (prev.validationStatus ?? "failed") as "passed" | "degraded" | "failed",
      validationScore: Number(prev.validationScore ?? 0),
      healthScore: Number(prev.healthScore ?? 0),
      healthGrade: prev.healthGrade ?? "F",
      topFeatureRankings: (prev.topFeatureRankings as import("@workspace/market-analysis").VersionFeatureRanking[]) ?? [],
      topPatternRankings: (prev.topPatternRankings as import("@workspace/market-analysis").VersionPatternRanking[]) ?? [],
      regimeDistribution: (prev.regimeDistribution as Record<string, number>) ?? {},
    } : undefined;

    const input: import("@workspace/market-analysis").LearningVersionInput = {
      cycleNumber: prev ? prev.cycleNumber + 1 : 1,
      scheduleType: scheduleType ?? "manual",
      tradeCount: features.length,
      featureCount: features.length,
      winRate,
      avgConfidence: avgConf,
      avgTqi,
      avgSetupScore: avgSetup,
      profitFactor,
      totalPnl,
      validationStatus: "degraded",
      validationScore: 50,
      healthScore: 50,
      healthGrade: "D",
      topFeatureRankings: [],
      topPatternRankings: [],
      regimeDistribution: regimeDist,
      changelogNotes: changelogNotes ?? undefined,
      versionTag: versionTag ?? "manual",
    };

    const version = buildLearningVersion(
      input,
      prev ? { semver: prev.semver, input: prevInput! } : undefined,
    );

    // Deactivate previous active version
    if (prev) {
      await db.update(learningVersionsTable)
        .set({ isActive: false })
        .where(eq(learningVersionsTable.isActive, true));
    }

    // Store new version
    await db.insert(learningVersionsTable).values({
      versionId: version.versionId,
      semver: version.semver,
      major: version.major,
      minor: version.minor,
      patch: version.patch,
      cycleNumber: input.cycleNumber,
      scheduleType: input.scheduleType,
      tradeCount: input.tradeCount,
      featureCount: input.featureCount,
      winRate: String(input.winRate),
      avgConfidence: String(input.avgConfidence),
      avgTqi: String(input.avgTqi),
      avgSetupScore: String(input.avgSetupScore),
      profitFactor: String(input.profitFactor),
      totalPnl: String(input.totalPnl),
      validationStatus: input.validationStatus,
      validationScore: String(input.validationScore),
      healthScore: String(input.healthScore),
      healthGrade: input.healthGrade,
      topFeatureRankings: input.topFeatureRankings,
      topPatternRankings: input.topPatternRankings,
      regimeDistribution: input.regimeDistribution,
      changeFromPrev: version.changeFromPrev as Record<string, unknown> | null,
      changelogNotes: input.changelogNotes,
      versionTag: input.versionTag,
      isActive: true,
      isBaseline: !prev,
    });

    res.json({ ok: true, data: { version, stored: true } });
  } catch (err) {
    console.error("POST /learning/enhancement/create-version error", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ─── Quality: Current Snapshot ────────────────────────────────────────────────

router.get("/learning/enhancement/quality", async (req, res) => {
  try {
    const features = await loadFeatures(null);

    // Load supporting data
    const [driftAlerts, validationRows] = await Promise.all([
      db.query?.learningDriftEventsTable
        ? db.select({ count: sql<number>`count(*)` })
            .from(await import("@workspace/db/schema").then(m => m.learningDriftEventsTable))
            .where(eq(
              (await import("@workspace/db/schema").then(m => m.learningDriftEventsTable)).resolved,
              false,
            ))
        : Promise.resolve([{ count: 0 }]),
      db.select()
        .from(await import("@workspace/db/schema").then(m => m.learningValidationResultsTable))
        .orderBy(desc(await import("@workspace/db/schema").then(m => m.learningValidationResultsTable).then(t => t.createdAt)))
        .limit(50),
    ]);

    const activeDrift = Number(driftAlerts[0]?.count ?? 0);

    // Load calibration ECE
    const latestCal = await db
      .select()
      .from(calibrationResultsTable)
      .orderBy(desc(calibrationResultsTable.evaluatedAt))
      .limit(1);
    const calibrationECE = latestCal[0]?.ece ? Number(latestCal[0].ece) : undefined;

    const passedValidations = validationRows.filter(v => v.overallStatus === "passed").length;

    const snapshot = computeQualitySnapshot({
      features,
      calibrationECE,
      activeDriftAlerts: activeDrift,
      criticalDriftAlerts: 0,
      passedValidations,
      totalValidations: validationRows.length,
    });

    res.json({ ok: true, data: snapshot });
  } catch (err) {
    console.error("GET /learning/enhancement/quality error", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ─── Quality: Alerts ─────────────────────────────────────────────────────────

router.get("/learning/enhancement/quality/alerts", async (req, res) => {
  try {
    const limit = Math.min(100, Number(req.query["limit"] ?? 50));
    const includeResolved = req.query["includeResolved"] === "true";

    const alerts = await db
      .select()
      .from(qualityAlertsTable)
      .where(includeResolved ? undefined : eq(qualityAlertsTable.resolved, false))
      .orderBy(desc(qualityAlertsTable.detectedAt))
      .limit(limit);

    res.json({ ok: true, data: alerts });
  } catch (err) {
    console.error("GET /learning/enhancement/quality/alerts error", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ─── Quality: Resolve Alert ───────────────────────────────────────────────────

router.post("/learning/enhancement/quality/alerts/:id/resolve", async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body ?? {};

    await db
      .update(qualityAlertsTable)
      .set({
        resolved: true,
        resolvedAt: new Date(),
        resolvedNote: note ?? "Manually resolved",
      })
      .where(eq(qualityAlertsTable.alertId, id));

    res.json({ ok: true, data: { resolved: true, alertId: id } });
  } catch (err) {
    console.error("POST /learning/enhancement/quality/alerts/:id/resolve error", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ─── Quality: History ─────────────────────────────────────────────────────────

router.get("/learning/enhancement/quality/history", async (req, res) => {
  try {
    const limit = Math.min(100, Number(req.query["limit"] ?? 30));
    const history = await db
      .select()
      .from(learningQualitySnapshotsTable)
      .orderBy(desc(learningQualitySnapshotsTable.snapshotAt))
      .limit(limit);

    res.json({ ok: true, data: history });
  } catch (err) {
    console.error("GET /learning/enhancement/quality/history error", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ─── Overview: All enhancement data ──────────────────────────────────────────

router.get("/learning/enhancement/overview", async (req, res) => {
  try {
    const [features, versions, latestCal, activeAlerts] = await Promise.all([
      loadFeatures(null),
      db.select().from(learningVersionsTable).orderBy(desc(learningVersionsTable.createdAt)).limit(5),
      db.select().from(calibrationResultsTable).orderBy(desc(calibrationResultsTable.evaluatedAt)).limit(1),
      db.select().from(qualityAlertsTable).where(eq(qualityAlertsTable.resolved, false)).limit(20),
    ]);

    const liveCalibration = runCalibration(features, { evaluationWindow: "all" });
    const candles = featuresToCandles(features);
    const regimeState = analyzeRegimeState(candles);
    const qualitySnapshot = computeQualitySnapshot({
      features,
      calibrationECE: liveCalibration.ece,
      activeDriftAlerts: activeAlerts.length,
      criticalAlerts: activeAlerts.filter(a => a.severity === "critical").length,
    });

    res.json({
      ok: true,
      data: {
        calibration: liveCalibration,
        regimeState,
        activeVersion: versions.find(v => v.isActive) ?? versions[0] ?? null,
        qualityScore: qualitySnapshot.qualityScore,
        qualityGrade: qualitySnapshot.qualityGrade,
        activeAlertCount: activeAlerts.length,
        versionCount: versions.length,
        featureCount: features.length,
      },
    });
  } catch (err) {
    console.error("GET /learning/enhancement/overview error", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
