// ─── Market World Model API Routes ───────────────────────────────────────────
// Advisory only. No trade execution. No strategy modification.
// All routes define paths WITHOUT /api prefix (app mounts at /api).

import { Router } from "express";
import { db } from "@workspace/db";
import {
  worldModelRelationshipsTable,
  worldModelTransitionsTable,
  worldModelTransitionStatsTable,
  worldModelMemoryTable,
  worldModelInfluenceEdgesTable,
  worldModelScenariosTable,
} from "@workspace/db";
import { desc, eq, and, gte } from "drizzle-orm";
import {
  worldModelStore,
  WORLD_MODEL_ENGINE_VERSION,
  analyzeRelationships,
  computeTransitionStats,
  detectTransitions,
  buildInfluenceGraph,
  runAllPredefinedScenarios,
  generateWorldModelReport,
  generateRelationshipReport,
  generateTransitionReport,
  generateScenarioReport,
  filterSignificantRelationships,
} from "@workspace/market-analysis";
import type { ScenarioQuery } from "@workspace/market-analysis";
import { learningFeaturesTable } from "@workspace/db";
import * as fs from "fs";
import * as path from "path";

const router = Router();

// ─── Helper: load feature rows ────────────────────────────────────────────────

async function loadFeatureRows(limit = 500) {
  const rows = await db
    .select()
    .from(learningFeaturesTable)
    .orderBy(desc(learningFeaturesTable.extractedAt))
    .limit(limit);

  // Reverse to ascending chronological order (oldest first) — required by all
  // time-sensitive engines (lag correlation, transition detection, current state).
  return rows.reverse().map(r => ({
    tradeId: r.tradeId,
    pair: r.pair,
    session: r.session,
    marketRegime: r.marketRegime,
    trend: r.trend ?? "unknown",
    supplyQuality: Number(r.supplyQuality),
    demandQuality: Number(r.demandQuality),
    liquidityScore: Number(r.liquidityScore),
    amdScore: Number(r.amdScore),
    confirmationQuality: Number(r.confirmationQuality),
    setupScore: Number(r.setupScore ?? 50),
    tqi: Number(r.tqi),
    spreadPips: Number(r.spreadPips),
    volatility: (r.volatility ?? "medium") as "low" | "medium" | "high",
    outcome: r.outcome,
    pnl: Number(r.pnl ?? 0),
    confidence: Number(r.confidence),
    patternType: r.patternType ?? "unknown",
    entryTime: r.entryTime ? new Date(r.entryTime) : new Date(),
  }));
}

// ─── Helper: persist computed relationships to DB ─────────────────────────────

async function persistRelationships(relationships: ReturnType<typeof analyzeRelationships>) {
  if (relationships.length === 0) return;
  // Upsert: delete old computed set then re-insert (simple approach)
  // Using batches to stay within DB limits
  const batch = relationships.slice(0, 200);
  await db.insert(worldModelRelationshipsTable).values(
    batch.map(r => ({
      sourceComponent: r.sourceComponent,
      targetComponent: r.targetComponent,
      relationshipType: r.relationshipType,
      strength: r.strength.toString(),
      confidence: r.confidence.toString(),
      sampleSize: r.sampleSize,
      reliabilityScore: r.reliabilityScore.toString(),
      lagBars: r.lagBars,
      pValue: r.pValue.toString(),
      isCausal: r.isCausal,
      evidenceSummary: r.evidenceSummary,
      historicalEvidence: r.historicalEvidence,
      engineVersion: WORLD_MODEL_ENGINE_VERSION,
    })),
  ).onConflictDoNothing();
}

async function persistTransitionStats(stats: ReturnType<typeof computeTransitionStats>) {
  if (stats.length === 0) return;
  await db.insert(worldModelTransitionStatsTable).values(
    stats.map(s => ({
      fromState: s.fromState,
      toState: s.toState,
      transitionCategory: s.transitionCategory,
      transitionProbability: s.transitionProbability.toString(),
      avgDurationBars: s.avgDurationBars.toString(),
      medianDurationBars: s.medianDurationBars.toString(),
      historicalFrequency: s.historicalFrequency,
      confidence: s.confidence.toString(),
      avgOutcomeQuality: s.avgOutcomeQuality.toString(),
      supportingEvidence: s.supportingEvidence,
    })),
  ).onConflictDoNothing();
}

// ─── GET /market/world-model ───────────────────────────────────────────────────

router.get("/market/world-model", async (req, res) => {
  try {
    const pair = (req.query.pair as string) ?? "EURUSD";
    const features = await loadFeatureRows(500);
    const memoryCount = await db.$count(worldModelMemoryTable);

    worldModelStore.compute(features, memoryCount);
    const summary = worldModelStore.getSummary(pair);

    // Persist world state to memory table
    if (features.length > 0) {
      const state = summary.currentState;
      await db.insert(worldModelMemoryTable).values({
        pair: state.pair,
        regime: state.regime,
        trend: state.trend,
        volatilityClass: state.volatilityClass,
        liquidityQuality: state.liquidityQuality,
        correlationRisk: state.correlationRisk,
        newsEnvironment: state.newsEnvironment,
        session: state.session,
        spreadCategory: state.spreadCategory,
        marketStructure: state.marketStructure,
        supplyDemandQuality: state.supplyDemandQuality,
        liquiditySweeps: state.liquiditySweeps,
        amdCompletion: state.amdCompletion,
        confirmationQuality: state.confirmationQuality,
        marketContextScore: state.marketContextScore,
        stabilityScore: state.stabilityScore,
        regimeConfidence: state.regimeConfidence,
        activeTransitions: state.activeTransitions,
        worldModelVersion: state.worldModelVersion,
        fullState: state as unknown as Record<string, unknown>,
      }).onConflictDoNothing();

      // Persist relationships
      await persistRelationships(summary.activeRelationships);
      // Persist transition stats
      await persistTransitionStats(summary.activeTransitions);

      // Persist raw transition events (historical record for audit / deep analysis)
      const rawEvents = detectTransitions(features);
      if (rawEvents.length > 0) {
        const batch = rawEvents.slice(0, 100);
        await db.insert(worldModelTransitionsTable).values(
          batch.map(ev => ({
            pair: ev.pair ?? pair,
            fromState: ev.fromState,
            toState: ev.toState,
            transitionCategory: ev.category,
            durationBars: ev.durationBars,
            triggerComponents: ev.triggers,
            marketContextAtTransition: null,
            outcomeQuality: ev.outcomeQuality.toString(),
            observedAt: ev.observedAt,
          })),
        ).onConflictDoNothing();
      }
    }

    res.json({
      success: true,
      pair,
      version: WORLD_MODEL_ENGINE_VERSION,
      featureCount: features.length,
      currentState: summary.currentState,
      modelHealth: summary.modelHealth,
      activeRelationshipCount: summary.activeRelationships.length,
      activeTransitionCount: summary.activeTransitions.length,
      recentMemoryCount: summary.recentMemoryCount,
      computedAt: summary.computedAt,
    });
  } catch (err) {
    console.error("[market-world-model] GET /market/world-model error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── GET /market/relationships ─────────────────────────────────────────────────

router.get("/market/relationships", async (req, res) => {
  try {
    const minConf = Number(req.query.minConfidence ?? 55);
    const source  = req.query.source as string | undefined;
    const target  = req.query.target as string | undefined;

    const features = await loadFeatureRows(500);
    worldModelStore.compute(features);
    let rels = worldModelStore.getRelationships(minConf);

    if (source) rels = rels.filter(r => r.sourceComponent === source);
    if (target) rels = rels.filter(r => r.targetComponent === target);

    res.json({
      success: true,
      count: rels.length,
      minConfidence: minConf,
      relationships: rels,
      computedAt: worldModelStore.getLastComputedAt(),
    });
  } catch (err) {
    console.error("[market-world-model] GET /market/relationships error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── GET /market/transitions ───────────────────────────────────────────────────

router.get("/market/transitions", async (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    const features = await loadFeatureRows(500);
    worldModelStore.compute(features);
    const stats = worldModelStore.getTransitionStats(category);

    res.json({
      success: true,
      count: stats.length,
      category: category ?? "all",
      transitions: stats,
      computedAt: worldModelStore.getLastComputedAt(),
    });
  } catch (err) {
    console.error("[market-world-model] GET /market/transitions error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── GET /market/influence-graph ───────────────────────────────────────────────

router.get("/market/influence-graph", async (req, res) => {
  try {
    const features = await loadFeatureRows(500);
    worldModelStore.compute(features);
    const graph = worldModelStore.getInfluenceGraph();

    // Persist edges to DB
    if (graph.edges.length > 0) {
      await db.insert(worldModelInfluenceEdgesTable).values(
        graph.edges.filter(e => e.propagationDepth === 1).slice(0, 100).map(e => ({
          sourceNode: e.sourceNode,
          targetNode: e.targetNode,
          influenceStrength: e.influenceStrength.toString(),
          influenceDirection: e.influenceDirection,
          confidence: e.confidence.toString(),
          sampleSize: e.sampleSize,
          propagationDepth: e.propagationDepth,
          explanation: e.explanation,
          supportingEvidence: e.supportingEvidence,
        })),
      ).onConflictDoNothing();
    }

    res.json({
      success: true,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      directEdgeCount: graph.edges.filter(e => e.propagationDepth === 1).length,
      indirectEdgeCount: graph.edges.filter(e => e.propagationDepth === 2).length,
      totalSampleSize: graph.totalSampleSize,
      nodes: graph.nodes,
      edges: graph.edges,
      computedAt: graph.computedAt,
      version: graph.version,
    });
  } catch (err) {
    console.error("[market-world-model] GET /market/influence-graph error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── GET /market/scenarios ─────────────────────────────────────────────────────

router.get("/market/scenarios", async (req, res) => {
  try {
    const features = await loadFeatureRows(500);
    worldModelStore.compute(features);
    const results = worldModelStore.runAllScenarios();

    // Persist to DB
    if (results.length > 0) {
      await db.insert(worldModelScenariosTable).values(
        results.map(r => ({
          scenarioType: r.query.scenarioType,
          triggerComponent: r.query.triggerComponent,
          triggerMagnitude: r.query.triggerMagnitude.toString(),
          affectedComponent: r.query.affectedComponent,
          historicalResponseMean: r.historicalResponseMean.toString(),
          historicalResponseStd: r.historicalResponseStd.toString(),
          historicalResponseMin: r.historicalResponseMin.toString(),
          historicalResponseMax: r.historicalResponseMax.toString(),
          sampleSize: r.sampleSize,
          confidence: r.confidence.toString(),
          responseTimelineBars: r.responseTimeBars.toString(),
          narrativeExplanation: r.narrativeExplanation,
          evidenceBreakdown: r.evidenceBreakdown,
        })),
      ).onConflictDoNothing();
    }

    res.json({
      success: true,
      count: results.length,
      scenarios: results,
      computedAt: worldModelStore.getLastComputedAt(),
    });
  } catch (err) {
    console.error("[market-world-model] GET /market/scenarios error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── POST /market/scenarios/custom ────────────────────────────────────────────

router.post("/market/scenarios/custom", async (req, res) => {
  try {
    const body = req.body as Partial<ScenarioQuery>;

    // Inline validation
    const validComponents = [
      "regime", "trend", "volatility", "liquidity", "correlation",
      "news", "session", "spread", "market_structure", "supply_demand",
      "liquidity_sweeps", "amd_completion", "confirmation_quality",
    ];
    const validTypes = [
      "volatility_impact", "correlation_shift", "regime_transition",
      "liquidity_shock", "news_event", "session_change",
    ];

    if (!body.triggerComponent || !validComponents.includes(body.triggerComponent)) {
      res.status(400).json({ success: false, error: "Invalid triggerComponent" });
      return;
    }
    if (!body.affectedComponent || !validComponents.includes(body.affectedComponent)) {
      res.status(400).json({ success: false, error: "Invalid affectedComponent" });
      return;
    }
    if (body.triggerComponent === body.affectedComponent) {
      res.status(400).json({ success: false, error: "triggerComponent and affectedComponent must differ" });
      return;
    }
    if (!body.scenarioType || !validTypes.includes(body.scenarioType)) {
      res.status(400).json({ success: false, error: "Invalid scenarioType" });
      return;
    }

    const query: ScenarioQuery = {
      scenarioType: body.scenarioType as ScenarioQuery["scenarioType"],
      triggerComponent: body.triggerComponent as ScenarioQuery["triggerComponent"],
      triggerMagnitude: typeof body.triggerMagnitude === "number" ? body.triggerMagnitude : 20,
      affectedComponent: body.affectedComponent as ScenarioQuery["affectedComponent"],
    };

    const features = await loadFeatureRows(500);
    worldModelStore.compute(features);
    const result = worldModelStore.runScenario(query);

    res.json({ success: true, result });
  } catch (err) {
    console.error("[market-world-model] POST /market/scenarios/custom error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── GET /market/history ───────────────────────────────────────────────────────

router.get("/market/history", async (req, res) => {
  try {
    const pair   = (req.query.pair as string) ?? undefined;
    const limit  = Math.min(200, Number(req.query.limit ?? 50));
    const regime = req.query.regime as string | undefined;

    let query = db.select().from(worldModelMemoryTable).orderBy(desc(worldModelMemoryTable.capturedAt));

    const rows = await db
      .select()
      .from(worldModelMemoryTable)
      .orderBy(desc(worldModelMemoryTable.capturedAt))
      .limit(limit);

    const filtered = rows.filter(r => {
      if (pair && r.pair !== pair) return false;
      if (regime && r.regime !== regime) return false;
      return true;
    });

    res.json({
      success: true,
      count: filtered.length,
      totalInDb: rows.length,
      history: filtered.map(r => ({
        id: r.id,
        pair: r.pair,
        regime: r.regime,
        trend: r.trend,
        volatilityClass: r.volatilityClass,
        liquidityQuality: r.liquidityQuality,
        session: r.session,
        marketContextScore: r.marketContextScore,
        stabilityScore: r.stabilityScore,
        regimeConfidence: r.regimeConfidence,
        worldModelVersion: r.worldModelVersion,
        capturedAt: r.capturedAt,
      })),
    });
  } catch (err) {
    console.error("[market-world-model] GET /market/history error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── GET /market/world-model/report ───────────────────────────────────────────

router.get("/market/world-model/report", async (req, res) => {
  try {
    const format = (req.query.format as string) ?? "json";
    const features = await loadFeatureRows(500);
    const memoryCount = await db.$count(worldModelMemoryTable);

    worldModelStore.compute(features, memoryCount);
    const summary = worldModelStore.getSummary("EURUSD");
    const rels = worldModelStore.getRelationships();
    const transitions = worldModelStore.getTransitionStats();
    const scenarios = worldModelStore.runAllScenarios();

    const worldReport       = generateWorldModelReport(summary);
    const relationshipReport = generateRelationshipReport(rels);
    const transitionReport   = generateTransitionReport(transitions);
    const scenarioReport     = generateScenarioReport(scenarios);

    // Save to disk
    const reportsDir = path.join(process.cwd(), "..");
    try {
      fs.writeFileSync(path.join(reportsDir, "MARKET_WORLD_MODEL_REPORT.md"),       worldReport,        "utf8");
      fs.writeFileSync(path.join(reportsDir, "MARKET_RELATIONSHIP_REPORT.md"),      relationshipReport, "utf8");
      fs.writeFileSync(path.join(reportsDir, "MARKET_TRANSITION_REPORT.md"),        transitionReport,   "utf8");
      fs.writeFileSync(path.join(reportsDir, "SCENARIO_SIMULATION_REPORT.md"),      scenarioReport,     "utf8");
    } catch (e) {
      console.warn("[market-world-model] Could not write reports to disk:", e);
    }

    if (format === "text") {
      res.type("text/plain").send(
        `${worldReport}\n\n---\n\n${relationshipReport}\n\n---\n\n${transitionReport}\n\n---\n\n${scenarioReport}`,
      );
      return;
    }

    res.json({
      success: true,
      reports: {
        worldModel:    worldReport,
        relationships: relationshipReport,
        transitions:   transitionReport,
        scenarios:     scenarioReport,
      },
    });
  } catch (err) {
    console.error("[market-world-model] GET /market/world-model/report error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── GET /market/world-model/status ───────────────────────────────────────────

router.get("/market/world-model/status", async (req, res) => {
  try {
    const featureCount  = await db.$count(learningFeaturesTable);
    const memoryCount   = await db.$count(worldModelMemoryTable);
    const relationCount = await db.$count(worldModelRelationshipsTable);
    const scenarioCount = await db.$count(worldModelScenariosTable);

    const health = worldModelStore.getModelHealth();

    res.json({
      success: true,
      version: WORLD_MODEL_ENGINE_VERSION,
      status: health.overallScore >= 60 ? "healthy" : health.overallScore >= 30 ? "degraded" : "insufficient_data",
      health,
      dbStats: {
        featureCount,
        memorySnapshots: memoryCount,
        storedRelationships: relationCount,
        scenarioResults: scenarioCount,
      },
      lastComputed: worldModelStore.getLastComputedAt(),
    });
  } catch (err) {
    console.error("[market-world-model] GET /market/world-model/status error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
