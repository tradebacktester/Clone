// ─── Trader Identity & Strategy Consistency Engine — API Routes ───────────────
// Advisory only. No trade execution. No strategy modification.
// All routes define paths WITHOUT /api prefix (app mounts at /api).

import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import {
  learningFeaturesTable,
  tiIdentityProfilesTable,
  tiSimilarityReportsTable,
  tiPreferenceDiscoveriesTable,
  tiDriftEventsTable,
  tiIdentityVersionsTable,
} from "@workspace/db";
import { desc, eq, and, gte, sql } from "drizzle-orm";
import {
  runTraderIdentityEngine,
  analyzeAdaptiveIdentity,
  detectDrift,
  TI_ENGINE_VERSION,
  MIN_SAMPLE_FOR_ADAPTIVE,
} from "@workspace/market-analysis";
import type { IdentitySetup, IdentityFeature } from "@workspace/market-analysis";

export const traderIdentityEngineRouter = Router();

// ─── Inline validation helpers ────────────────────────────────────────────────

function requireNumber(v: unknown, name: string, min = 0, max = 100): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  if (n < min || n > max)  throw new Error(`${name} must be between ${min} and ${max}`);
  return n;
}

function validateSetup(body: Record<string, unknown>): IdentitySetup {
  const required = ["pair", "session", "regime", "trend", "volatility"];
  for (const k of required) {
    if (!body[k]) throw new Error(`${k} is required`);
  }
  const vol = String(body.volatility);
  if (!["low", "medium", "high"].includes(vol)) throw new Error("volatility must be low | medium | high");
  return {
    setupId:    typeof body.setupId === "string" ? body.setupId : undefined,
    pair:       String(body.pair),
    session:    String(body.session),
    regime:     String(body.regime),
    trend:      String(body.trend),
    volatility: vol as "low" | "medium" | "high",
    direction:  body.direction === "buy" || body.direction === "sell" ? body.direction : undefined,

    supplyQuality:       requireNumber(body.supplyQuality,       "supplyQuality"),
    demandQuality:       requireNumber(body.demandQuality,       "demandQuality"),
    liquidityScore:      requireNumber(body.liquidityScore,      "liquidityScore"),
    amdScore:            requireNumber(body.amdScore,            "amdScore"),
    confirmationQuality: requireNumber(body.confirmationQuality, "confirmationQuality"),
    setupScore:          requireNumber(body.setupScore,          "setupScore"),
    tqi:                 requireNumber(body.tqi,                 "tqi"),
    rrPlanned:           requireNumber(body.rrPlanned,           "rrPlanned", 0, 100),
    spreadPips:          requireNumber(body.spreadPips,          "spreadPips", 0, 100),

    liquiditySweepSize:  body.liquiditySweepSize  !== undefined ? requireNumber(body.liquiditySweepSize,  "liquiditySweepSize")  : undefined,
    htfAlignment:        body.htfAlignment        !== undefined ? requireNumber(body.htfAlignment,        "htfAlignment")        : undefined,
    zoneQuality:         body.zoneQuality         !== undefined ? requireNumber(body.zoneQuality,         "zoneQuality")         : undefined,
    trendStrength:       body.trendStrength       !== undefined ? requireNumber(body.trendStrength,       "trendStrength")       : undefined,
    holdDurationMinutes: body.holdDurationMinutes !== undefined ? requireNumber(body.holdDurationMinutes, "holdDurationMinutes", 0, 10000) : undefined,
  };
}

// ─── Load historical features ─────────────────────────────────────────────────

async function loadFeatures(limit = 500): Promise<IdentityFeature[]> {
  const rows = await db
    .select()
    .from(learningFeaturesTable)
    .orderBy(desc(learningFeaturesTable.extractedAt))
    .limit(limit);

  return rows.map(r => ({
    tradeId:             r.tradeId,
    pair:                r.pair,
    session:             r.session,
    marketRegime:        r.marketRegime,
    trend:               r.trend ?? "unknown",
    volatility:          r.volatility ?? "medium",
    direction:           r.direction ?? "buy",
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
    outcome:             r.outcome,
    pnl:                 Number(r.pnl ?? 0),
    holdDurationMinutes: Number(r.holdDurationMinutes ?? 0),
    openedAt:            r.openedAt ? new Date(r.openedAt) : new Date(),
  }));
}

// ─── Save identity report to DB ───────────────────────────────────────────────

async function saveReport(
  report: Awaited<ReturnType<typeof runTraderIdentityEngine>>,
): Promise<void> {
  const s    = report.similarity;
  const c    = report.consistency;
  const hist = report.historicalSimilarity;

  await db.insert(tiSimilarityReportsTable).values({
    reportId:   report.reportId,
    profileId:  report.profileId,
    version:    report.version,
    setupId:    report.setup.setupId ?? null,

    pair:       report.setup.pair,
    session:    report.setup.session,
    regime:     report.setup.regime,
    trend:      report.setup.trend,
    volatility: report.setup.volatility,
    setupScore: String(report.setup.setupScore),
    tqi:        String(report.setup.tqi),

    ruleSimilarityScore:       String(s.ruleSimilarityScore),
    historicalSimilarityScore: String(s.historicalSimilarityScore),
    preferenceAlignmentScore:  String(s.preferenceAlignmentScore),
    identitySimilarityScore:   String(s.identitySimilarityScore),
    statisticalConfidence:     String(s.statisticalConfidence),
    historicalSampleSize:      s.historicalSampleSize,

    consistencyLevel:  c.level,
    consistencyLabel:  c.label,
    consistencyReason: c.reason,

    similarTrades: hist.similarTrades as unknown[],
    ruleDetails:   report.ruleEvaluation.details as unknown[],
    preferenceDetails: report.preferenceAlignment.details as unknown[],
    identityNarrative: report.identityNarrative,

    isAdvisoryOnly: true,
    evaluatedAt:    report.evaluatedAt,
  }).onConflictDoNothing();
}

// ─── Save preferences to DB ───────────────────────────────────────────────────

async function savePreferences(
  profileId: string,
  discoveries: Awaited<ReturnType<typeof analyzeAdaptiveIdentity>>["discoveries"],
): Promise<void> {
  if (discoveries.length === 0) return;
  await db.insert(tiPreferenceDiscoveriesTable).values(
    discoveries.map(d => ({
      discoveryId:   randomUUID(),
      profileId,
      preferenceType:  d.type,
      preferenceValue: d.value,
      preferenceLabel: d.label,
      sampleSize:      d.sampleSize,
      winRate:         String(d.winRate),
      avgRr:           String(d.avgRr),
      profitFactor:    String(d.profitFactor),
      confidence:      String(d.confidence),
      effect:          d.effect,
      effectSize:      String(d.effectSize),
      baselineWinRate: String(d.baselineWinRate),
      liftVsBaseline:  String(d.liftVsBaseline),
      explanation:     d.explanation,
      isSignificant:   d.isSignificant,
      isAdoptedByIdentity: d.isSignificant,
      discoveredAt:    new Date(),
    })),
  ).onConflictDoNothing();
}

// ─── GET /identity/profile ────────────────────────────────────────────────────
// Returns the current active identity profile with adaptive data if available.

traderIdentityEngineRouter.get("/identity/profile", async (req, res) => {
  try {
    const features  = await loadFeatures();
    const adaptive  = analyzeAdaptiveIdentity(features);
    const profileId = randomUUID();

    // Save profile snapshot
    await db.insert(tiIdentityProfilesTable).values({
      profileId,
      version:           TI_ENGINE_VERSION,
      stage:             adaptive.stage,
      sampleSize:        adaptive.sampleSize,
      confidenceScore:   String(adaptive.confidenceScore),
      minSampleRequired: MIN_SAMPLE_FOR_ADAPTIVE,
      ruleBaselineScore: "100",
      ruleProfile:       null,
      preferredPairs:    adaptive.preferredPairs,
      preferredSessions: adaptive.preferredSessions,
      preferredRegimes:  adaptive.preferredRegimes,
      preferredVolatility: adaptive.preferredVolatility ?? null,
      preferredTrend:    adaptive.preferredTrend ?? null,
      avgSetupScore:     adaptive.avgSetupScore > 0 ? String(adaptive.avgSetupScore) : null,
      avgTqi:            adaptive.avgTqi > 0 ? String(adaptive.avgTqi) : null,
      avgRrPlanned:      adaptive.avgRrPlanned > 0 ? String(adaptive.avgRrPlanned) : null,
      avgHoldDuration:   adaptive.avgHoldDuration > 0 ? String(adaptive.avgHoldDuration) : null,
      overallWinRate:    adaptive.overallWinRate > 0 ? String(adaptive.overallWinRate) : null,
      overallPf:         adaptive.overallPf > 0 ? String(adaptive.overallPf) : null,
      overallAvgRr:      adaptive.overallAvgRr !== 0 ? String(adaptive.overallAvgRr) : null,
      preferenceChanges: [],
      changeReason:      "Auto-generated profile snapshot.",
      isActive:          true,
    }).onConflictDoNothing();

    // Save identity version
    await db.insert(tiIdentityVersionsTable).values({
      versionId:       randomUUID(),
      profileId,
      versionTag:      TI_ENGINE_VERSION,
      stage:           adaptive.stage,
      sampleSize:      adaptive.sampleSize,
      confidence:      String(adaptive.confidenceScore),
      preferredPairs:  adaptive.preferredPairs,
      preferredSessions: adaptive.preferredSessions,
      overallWinRate:  adaptive.overallWinRate > 0 ? String(adaptive.overallWinRate) : null,
      overallAvgRr:    adaptive.overallAvgRr !== 0 ? String(adaptive.overallAvgRr) : null,
      event:           "created",
      summary:         `Profile snapshot: ${adaptive.sampleSize} trades, stage=${adaptive.stage}`,
    }).onConflictDoNothing();

    // Save discoveries
    await savePreferences(profileId, adaptive.discoveries);

    res.json({
      profileId,
      version:         TI_ENGINE_VERSION,
      stage:           adaptive.stage,
      stageLabel:      adaptive.stage === "adaptive_identity" ? "Stage 2 — Adaptive Identity" : "Stage 1 — Rule Identity",
      sampleSize:      adaptive.sampleSize,
      minSampleRequired: MIN_SAMPLE_FOR_ADAPTIVE,
      confidenceScore: adaptive.confidenceScore,
      isAdaptiveActive: adaptive.stage === "adaptive_identity",

      identity: adaptive,

      ruleIdentity: {
        stage:             "rule_identity",
        description:       "Core rules always active — Supply & Demand, AMD, Liquidity Sweep, Premium/Discount, TQI Gate, R:R Minimum.",
        ruleBaselineScore: 100,
        rules: [
          "Supply & Demand Zone Quality",
          "Premium / Discount Framework",
          "Liquidity Sweep Confirmation",
          "AMD Sequence Completeness",
          "Confirmation Signal Quality",
          "Overall Setup Score Threshold",
          "Trade Quality Index (TQI) Gate",
          "Risk-to-Reward Minimum",
          "Spread / Execution Cost",
        ],
      },

      isAdvisoryOnly: true,
      generatedAt:    new Date(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Identity profile generation failed", detail: msg });
  }
});

// ─── POST /identity/similarity ────────────────────────────────────────────────
// Evaluate a setup against the current identity and return full similarity report.

traderIdentityEngineRouter.post("/identity/similarity", async (req, res) => {
  try {
    const setup    = validateSetup(req.body as Record<string, unknown>);
    const features = await loadFeatures();
    const report   = runTraderIdentityEngine(setup, features);

    await saveReport(report);

    res.json(report);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const code = msg.includes("required") || msg.includes("must be") ? 400 : 500;
    res.status(code).json({ error: "Identity similarity evaluation failed", detail: msg });
  }
});

// ─── GET /identity/similarity ─────────────────────────────────────────────────
// List recent similarity reports.

traderIdentityEngineRouter.get("/identity/similarity", async (req, res) => {
  try {
    const limit  = Math.min(Number(req.query.limit ?? 50), 200);
    const pair   = typeof req.query.pair === "string" ? req.query.pair : undefined;
    const minScore = typeof req.query.minScore === "string" ? Number(req.query.minScore) : undefined;

    let query = db
      .select({
        reportId:               tiSimilarityReportsTable.reportId,
        pair:                   tiSimilarityReportsTable.pair,
        session:                tiSimilarityReportsTable.session,
        regime:                 tiSimilarityReportsTable.regime,
        identitySimilarityScore:tiSimilarityReportsTable.identitySimilarityScore,
        ruleSimilarityScore:    tiSimilarityReportsTable.ruleSimilarityScore,
        consistencyLevel:       tiSimilarityReportsTable.consistencyLevel,
        consistencyLabel:       tiSimilarityReportsTable.consistencyLabel,
        statisticalConfidence:  tiSimilarityReportsTable.statisticalConfidence,
        evaluatedAt:            tiSimilarityReportsTable.evaluatedAt,
      })
      .from(tiSimilarityReportsTable)
      .orderBy(desc(tiSimilarityReportsTable.evaluatedAt))
      .$dynamic();

    if (pair) query = query.where(eq(tiSimilarityReportsTable.pair, pair)) as typeof query;

    const rows = await query.limit(limit);
    const filtered = minScore
      ? rows.filter(r => Number(r.identitySimilarityScore) >= minScore)
      : rows;

    res.json({ reports: filtered, count: filtered.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Failed to fetch similarity reports", detail: msg });
  }
});

// ─── GET /identity/preferences ────────────────────────────────────────────────
// Return discovered preferences with statistical evidence.

traderIdentityEngineRouter.get("/identity/preferences", async (req, res) => {
  try {
    const features   = await loadFeatures();
    const adaptive   = analyzeAdaptiveIdentity(features);
    const profileId  = randomUUID();

    await savePreferences(profileId, adaptive.discoveries);

    const significant = adaptive.discoveries.filter(d => d.isSignificant);
    const positive    = significant.filter(d => d.effect === "positive");
    const negative    = significant.filter(d => d.effect === "negative");
    const all         = adaptive.discoveries;

    res.json({
      stage:          adaptive.stage,
      sampleSize:     adaptive.sampleSize,
      totalDiscovered: all.length,
      significantCount: significant.length,
      positivePreferences: positive,
      negativePreferences: negative,
      allDiscoveries: all,
      preferredPairs:    adaptive.preferredPairs,
      preferredSessions: adaptive.preferredSessions,
      preferredRegimes:  adaptive.preferredRegimes,
      preferredVolatility: adaptive.preferredVolatility,
      preferredTrend:    adaptive.preferredTrend,
      isAdvisoryOnly: true,
      generatedAt:    new Date(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Preference analysis failed", detail: msg });
  }
});

// ─── GET /identity/drift ──────────────────────────────────────────────────────
// Detect drift in trading behaviour.

traderIdentityEngineRouter.get("/identity/drift", async (req, res) => {
  try {
    const features = await loadFeatures(600);
    const profileId = randomUUID();
    const driftReport = detectDrift(features, profileId);

    // Persist significant events
    if (driftReport.driftEvents.length > 0) {
      for (const e of driftReport.driftEvents) {
        await db.insert(tiDriftEventsTable).values({
          eventId:        e.eventId,
          profileId,
          driftType:      e.driftType,
          driftSeverity:  e.driftSeverity,
          driftScore:     String(e.driftScore),
          dimension:      e.dimension,
          previousValue:  e.previousValue,
          currentValue:   e.currentValue,
          changePercent:  String(e.changePercent),
          sampleSizeBefore: e.sampleSizeBefore,
          sampleSizeAfter:  e.sampleSizeAfter,
          isStatisticallySignificant: e.isStatisticallySignificant,
          description:    e.description,
          detectedAt:     driftReport.detectedAt,
        }).onConflictDoNothing();
      }
    }

    res.json({
      ...driftReport,
      sampleSize:     features.length,
      isAdvisoryOnly: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Drift detection failed", detail: msg });
  }
});

// ─── GET /identity/history ────────────────────────────────────────────────────
// Return identity version timeline.

traderIdentityEngineRouter.get("/identity/history", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const rows  = await db
      .select()
      .from(tiIdentityVersionsTable)
      .orderBy(desc(tiIdentityVersionsTable.createdAt))
      .limit(limit);

    res.json({ versions: rows, count: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Failed to fetch identity history", detail: msg });
  }
});

// ─── GET /identity/report ─────────────────────────────────────────────────────
// Comprehensive summary report of the full identity engine state.

traderIdentityEngineRouter.get("/identity/report", async (req, res) => {
  try {
    const features  = await loadFeatures(600);
    const adaptive  = analyzeAdaptiveIdentity(features);
    const drift     = detectDrift(features, "report");

    // Recent similarity reports aggregate
    const recentReports = await db
      .select({
        identitySimilarityScore: tiSimilarityReportsTable.identitySimilarityScore,
        consistencyLevel:        tiSimilarityReportsTable.consistencyLevel,
        ruleSimilarityScore:     tiSimilarityReportsTable.ruleSimilarityScore,
        evaluatedAt:             tiSimilarityReportsTable.evaluatedAt,
      })
      .from(tiSimilarityReportsTable)
      .orderBy(desc(tiSimilarityReportsTable.evaluatedAt))
      .limit(50);

    const avgIdentitySimilarity = recentReports.length > 0
      ? recentReports.reduce((s, r) => s + Number(r.identitySimilarityScore), 0) / recentReports.length
      : null;

    const consistencyBreakdown: Record<string, number> = {};
    for (const r of recentReports) {
      consistencyBreakdown[r.consistencyLevel] = (consistencyBreakdown[r.consistencyLevel] ?? 0) + 1;
    }

    const significant = adaptive.discoveries.filter(d => d.isSignificant);

    res.json({
      version:       TI_ENGINE_VERSION,
      generatedAt:   new Date(),

      identityStage:     adaptive.stage,
      stageLabel:        adaptive.stage === "adaptive_identity" ? "Stage 2 — Adaptive Identity" : "Stage 1 — Rule Identity",
      sampleSize:        features.length,
      minSampleRequired: MIN_SAMPLE_FOR_ADAPTIVE,
      confidenceScore:   adaptive.confidenceScore,

      preferences: {
        preferredPairs:    adaptive.preferredPairs,
        preferredSessions: adaptive.preferredSessions,
        preferredRegimes:  adaptive.preferredRegimes,
        preferredVolatility: adaptive.preferredVolatility,
        preferredTrend:    adaptive.preferredTrend,
        significantCount:  significant.length,
        totalDiscovered:   adaptive.discoveries.length,
      },

      performance: {
        overallWinRate:  adaptive.overallWinRate,
        overallAvgRr:    adaptive.overallAvgRr,
        overallPf:       adaptive.overallPf,
        avgSetupScore:   adaptive.avgSetupScore,
        avgTqi:          adaptive.avgTqi,
      },

      consistencyStats: {
        reportsAnalyzed:        recentReports.length,
        avgIdentitySimilarity,
        consistencyBreakdown,
      },

      drift: {
        hasActiveDrift:    drift.hasActiveDrift,
        overallDriftScore: drift.overallDriftScore,
        eventCount:        drift.driftEvents.length,
        significantEvents: drift.driftEvents.filter(e => e.isStatisticallySignificant).length,
        summary:           drift.driftSummary,
      },

      isAdvisoryOnly: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Report generation failed", detail: msg });
  }
});

// ─── GET /identity/statistics ─────────────────────────────────────────────────
// Aggregate statistics for the dashboard.

traderIdentityEngineRouter.get("/identity/statistics", async (req, res) => {
  try {
    const [totalReports] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tiSimilarityReportsTable);

    const [avgSimilarity] = await db
      .select({ avg: sql<number>`AVG(identity_similarity_score)` })
      .from(tiSimilarityReportsTable);

    const [driftCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tiDriftEventsTable)
      .where(eq(tiDriftEventsTable.isStatisticallySignificant, true));

    const [prefCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tiPreferenceDiscoveriesTable)
      .where(eq(tiPreferenceDiscoveriesTable.isSignificant, true));

    res.json({
      totalSimilarityReports: Number(totalReports?.count ?? 0),
      avgIdentitySimilarity:  Number(avgSimilarity?.avg ?? 0),
      significantDriftEvents: Number(driftCount?.count ?? 0),
      adoptedPreferences:     Number(prefCount?.count ?? 0),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Statistics failed", detail: msg });
  }
});
