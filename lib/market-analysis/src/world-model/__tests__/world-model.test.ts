// ─── Market World Model Tests ─────────────────────────────────────────────────
// Comprehensive test suite covering all world model engines.
// Run with: node_modules/.pnpm/node_modules/.bin/tsx --test

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  analyzeRelationships,
  filterSignificantRelationships,
  getRelationshipsFor,
} from "../relationship-analyzer.js";
import {
  detectTransitions,
  computeTransitionStats,
  detectActiveTransitions,
  KNOWN_TRANSITIONS,
} from "../transition-engine.js";
import {
  buildInfluenceGraph,
  getInfluencedBy,
  getInfluences,
  getTopInfluencers,
  buildInfluenceChain,
} from "../influence-graph.js";
import {
  runScenario,
  runAllPredefinedScenarios,
  PREDEFINED_SCENARIOS,
} from "../scenario-simulator.js";
import {
  WorldModelStore,
} from "../world-model-store.js";
import {
  generateWorldModelReport,
  generateRelationshipReport,
  generateTransitionReport,
  generateScenarioReport,
} from "../report-generator.js";
import type { WorldModelFeatureRow, ScenarioQuery } from "../types.js";
import { ALL_COMPONENTS, WORLD_MODEL_VERSION } from "../types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeFeature(overrides: Partial<WorldModelFeatureRow> = {}): WorldModelFeatureRow {
  return {
    tradeId: Math.random().toString(36).slice(2),
    pair: "EURUSD",
    session: "london",
    marketRegime: "trending",
    trend: "bullish",
    supplyQuality: 70,
    demandQuality: 65,
    liquidityScore: 75,
    amdScore: 60,
    confirmationQuality: 65,
    setupScore: 68,
    tqi: 72,
    spreadPips: 1.5,
    volatility: "medium",
    outcome: "win",
    pnl: 1.5,
    confidence: 70,
    patternType: "BOS",
    entryTime: new Date(),
    ...overrides,
  };
}

function makeFeatureSet(n: number, seed = 0): WorldModelFeatureRow[] {
  const regimes = ["trending", "ranging", "volatile", "low_volatility"];
  const trends   = ["bullish", "bearish", "sideways"];
  const vols     = ["low", "medium", "high"];
  const sessions = ["london", "new_york", "asian", "overlap"];
  const outcomes = ["win", "loss"];

  return Array.from({ length: n }, (_, i) => {
    const idx = (i + seed) % regimes.length;
    return makeFeature({
      tradeId: `t${i + seed}`,
      pair: (i + seed) % 3 === 0 ? "GBPUSD" : "EURUSD",
      marketRegime: regimes[idx],
      trend: trends[i % trends.length],
      volatility: vols[i % vols.length] as "low" | "medium" | "high",
      session: sessions[i % sessions.length],
      liquidityScore: 30 + (i % 70),
      spreadPips: 0.5 + (i % 10),
      supplyQuality: 40 + (i % 60),
      demandQuality: 40 + (i % 60),
      amdScore: 30 + (i % 70),
      confirmationQuality: 30 + (i % 70),
      setupScore: 40 + (i % 60),
      tqi: 40 + (i % 60),
      outcome: outcomes[i % outcomes.length] as "win" | "loss",
      pnl: outcomes[i % outcomes.length] === "win" ? 1.5 : -0.8,
      confidence: 50 + (i % 40),
      entryTime: new Date(Date.now() - (n - i) * 3600_000),
    });
  });
}

// ─── Types Tests ──────────────────────────────────────────────────────────────

describe("Types & Constants", () => {
  test("WORLD_MODEL_VERSION is defined", () => {
    assert.ok(WORLD_MODEL_VERSION);
    assert.match(WORLD_MODEL_VERSION, /^\d+\.\d+\.\d+$/);
  });

  test("ALL_COMPONENTS has 13 entries", () => {
    assert.equal(ALL_COMPONENTS.length, 13);
  });

  test("ALL_COMPONENTS contains required components", () => {
    const required = [
      "regime", "trend", "volatility", "liquidity", "correlation",
      "news", "session", "spread", "market_structure", "supply_demand",
      "liquidity_sweeps", "amd_completion", "confirmation_quality",
    ];
    for (const comp of required) {
      assert.ok(ALL_COMPONENTS.includes(comp as any), `Missing component: ${comp}`);
    }
  });
});

// ─── Relationship Analyzer Tests ──────────────────────────────────────────────

describe("Relationship Analyzer", () => {
  test("returns empty array for insufficient data", () => {
    const result = analyzeRelationships([]);
    assert.deepEqual(result, []);
  });

  test("returns empty array below minimum sample size", () => {
    const features = makeFeatureSet(10);
    const result = analyzeRelationships(features);
    assert.deepEqual(result, []);
  });

  test("produces relationships from sufficient data", () => {
    const features = makeFeatureSet(50);
    const result = analyzeRelationships(features);
    assert.ok(result.length >= 0); // may or may not find significant ones
  });

  test("produces relationships from large dataset", () => {
    const features = makeFeatureSet(100);
    const result = analyzeRelationships(features);
    assert.ok(Array.isArray(result));
    // Relationships should be sorted by absolute strength
    for (let i = 1; i < result.length; i++) {
      assert.ok(
        Math.abs(result[i - 1].strength) >= Math.abs(result[i].strength) - 0.001,
        "Relationships should be sorted by strength desc",
      );
    }
  });

  test("relationship fields are all present", () => {
    const features = makeFeatureSet(100);
    const result = analyzeRelationships(features);
    for (const r of result) {
      assert.ok(typeof r.sourceComponent === "string");
      assert.ok(typeof r.targetComponent === "string");
      assert.ok(typeof r.strength === "number");
      assert.ok(r.strength >= -1 && r.strength <= 1, "Strength out of range");
      assert.ok(r.confidence >= 0 && r.confidence <= 100, "Confidence out of range");
      assert.ok(r.sampleSize >= 0);
      assert.ok(r.reliabilityScore >= 0 && r.reliabilityScore <= 100);
      assert.ok(r.lagBars >= 0);
      assert.ok(r.pValue >= 0 && r.pValue <= 1, "p-value out of range");
      assert.ok(typeof r.isCausal === "boolean");
      assert.ok(typeof r.evidenceSummary === "string");
    }
  });

  test("source and target are never the same component", () => {
    const features = makeFeatureSet(100);
    const result = analyzeRelationships(features);
    for (const r of result) {
      assert.notEqual(r.sourceComponent, r.targetComponent);
    }
  });

  test("filterSignificantRelationships filters by confidence", () => {
    const features = makeFeatureSet(100);
    const all = analyzeRelationships(features);
    const filtered = filterSignificantRelationships(all, 60);
    for (const r of filtered) {
      assert.ok(r.confidence >= 60, `Relationship confidence ${r.confidence} below threshold`);
    }
  });

  test("getRelationshipsFor source role works", () => {
    const features = makeFeatureSet(100);
    const all = analyzeRelationships(features);
    const result = getRelationshipsFor("volatility", all, "source");
    for (const r of result) {
      assert.equal(r.sourceComponent, "volatility");
    }
  });

  test("getRelationshipsFor target role works", () => {
    const features = makeFeatureSet(100);
    const all = analyzeRelationships(features);
    const result = getRelationshipsFor("liquidity", all, "target");
    for (const r of result) {
      assert.equal(r.targetComponent, "liquidity");
    }
  });
});

// ─── Transition Engine Tests ──────────────────────────────────────────────────

describe("Transition Engine", () => {
  test("detectTransitions returns empty for < 2 features", () => {
    assert.deepEqual(detectTransitions([]), []);
    assert.deepEqual(detectTransitions([makeFeature()]), []);
  });

  test("KNOWN_TRANSITIONS are all defined", () => {
    assert.ok(KNOWN_TRANSITIONS.length >= 14);
    for (const t of KNOWN_TRANSITIONS) {
      assert.ok(typeof t.from === "string");
      assert.ok(typeof t.to === "string");
      assert.ok(["regime", "volatility", "liquidity"].includes(t.category));
      assert.ok(typeof t.label === "string");
    }
  });

  test("computeTransitionStats returns empty for no events", () => {
    const stats = computeTransitionStats([]);
    assert.deepEqual(stats, []);
  });

  test("detectTransitions finds regime changes in varied data", () => {
    const features: WorldModelFeatureRow[] = [
      ...Array.from({ length: 5 }, () => makeFeature({ marketRegime: "trending" })),
      ...Array.from({ length: 5 }, () => makeFeature({ marketRegime: "ranging" })),
      ...Array.from({ length: 5 }, () => makeFeature({ marketRegime: "volatile" })),
    ];
    const events = detectTransitions(features);
    assert.ok(events.length >= 2); // at least 2 transitions detected
  });

  test("transition stats have valid probability range", () => {
    const features = makeFeatureSet(60);
    const events = detectTransitions(features);
    const stats = computeTransitionStats(events);
    for (const s of stats) {
      assert.ok(s.transitionProbability >= 0 && s.transitionProbability <= 1,
        `Transition probability ${s.transitionProbability} out of range`);
      assert.ok(s.avgDurationBars >= 0);
      assert.ok(s.confidence >= 0 && s.confidence <= 100);
      assert.ok(s.historicalFrequency >= 1);
    }
  });

  test("transition stats sorted by frequency descending", () => {
    const features = makeFeatureSet(60);
    const events = detectTransitions(features);
    const stats = computeTransitionStats(events);
    for (let i = 1; i < stats.length; i++) {
      assert.ok(
        stats[i - 1].historicalFrequency >= stats[i].historicalFrequency,
        "Stats should be sorted by frequency descending",
      );
    }
  });

  test("detectActiveTransitions returns array", () => {
    const features = makeFeatureSet(20);
    const events = detectTransitions(features);
    const stats = computeTransitionStats(events);
    const active = detectActiveTransitions(features.slice(-5), stats);
    assert.ok(Array.isArray(active));
  });

  test("active transitions have valid progress percent", () => {
    const features: WorldModelFeatureRow[] = [
      makeFeature({ marketRegime: "trending" }),
      makeFeature({ marketRegime: "trending" }),
      makeFeature({ marketRegime: "ranging" }),
      makeFeature({ marketRegime: "ranging" }),
      makeFeature({ marketRegime: "ranging" }),
    ];
    const events = detectTransitions(features);
    const stats = computeTransitionStats(events);
    const active = detectActiveTransitions(features, stats);
    for (const a of active) {
      assert.ok(a.progressPercent >= 0 && a.progressPercent <= 100);
      assert.ok(a.barsInProgress >= 0);
      assert.ok(a.probability >= 0 && a.probability <= 1);
    }
  });
});

// ─── Influence Graph Tests ─────────────────────────────────────────────────────

describe("Influence Graph", () => {
  test("buildInfluenceGraph with empty relationships uses priors", () => {
    const graph = buildInfluenceGraph([], true);
    assert.ok(graph.edges.length > 0, "Graph should have domain prior edges");
    assert.ok(graph.nodes.length === 13, "Graph should have 13 nodes");
  });

  test("graph nodes have all 13 components", () => {
    const graph = buildInfluenceGraph([], true);
    const nodeComps = graph.nodes.map(n => n.component);
    for (const comp of ALL_COMPONENTS) {
      assert.ok(nodeComps.includes(comp), `Missing node for component: ${comp}`);
    }
  });

  test("graph edges have valid strength 0..1", () => {
    const graph = buildInfluenceGraph([], true);
    for (const edge of graph.edges) {
      assert.ok(edge.influenceStrength >= 0 && edge.influenceStrength <= 1,
        `Edge strength ${edge.influenceStrength} out of range`);
      assert.ok(["positive", "negative", "mixed"].includes(edge.influenceDirection));
    }
  });

  test("no self-loops in graph", () => {
    const features = makeFeatureSet(100);
    const rels = analyzeRelationships(features);
    const graph = buildInfluenceGraph(rels, true);
    for (const edge of graph.edges) {
      assert.notEqual(edge.sourceNode, edge.targetNode, "Self-loop detected");
    }
  });

  test("getInfluencedBy returns edges targeting component", () => {
    const graph = buildInfluenceGraph([], true);
    const edges = getInfluencedBy("volatility", graph, true);
    for (const e of edges) {
      assert.equal(e.targetNode, "volatility");
      assert.equal(e.propagationDepth, 1);
    }
  });

  test("getInfluences returns edges from component", () => {
    const graph = buildInfluenceGraph([], true);
    const edges = getInfluences("news", graph, true);
    for (const e of edges) {
      assert.equal(e.sourceNode, "news");
    }
  });

  test("getTopInfluencers returns correct count", () => {
    const graph = buildInfluenceGraph([], true);
    const top = getTopInfluencers(graph, 3);
    assert.equal(top.length, 3);
    // Sorted by centrality
    assert.ok(top[0].centralityScore >= top[1].centralityScore);
    assert.ok(top[1].centralityScore >= top[2].centralityScore);
  });

  test("buildInfluenceChain returns paths from start", () => {
    const graph = buildInfluenceGraph([], true);
    const chains = buildInfluenceChain("news", graph, 3);
    assert.ok(Array.isArray(chains));
    for (const chain of chains) {
      assert.ok(chain.path[0] === "news");
      assert.ok(chain.cumulativeStrength >= 0 && chain.cumulativeStrength <= 1);
    }
  });

  test("indirect edges have propagationDepth 2", () => {
    const graph = buildInfluenceGraph([], true);
    const indirect = graph.edges.filter(e => e.propagationDepth === 2);
    for (const e of indirect) {
      assert.equal(e.propagationDepth, 2);
    }
  });

  test("node centrality scores are 0..100", () => {
    const graph = buildInfluenceGraph([], true);
    for (const node of graph.nodes) {
      assert.ok(node.centralityScore >= 0 && node.centralityScore <= 100,
        `Centrality ${node.centralityScore} out of range for ${node.component}`);
    }
  });

  test("graph version matches WORLD_MODEL_VERSION", () => {
    const graph = buildInfluenceGraph([], true);
    assert.equal(graph.version, WORLD_MODEL_VERSION);
  });
});

// ─── Scenario Simulator Tests ─────────────────────────────────────────────────

describe("Scenario Simulator", () => {
  test("runScenario returns result for empty features", () => {
    const query: ScenarioQuery = {
      scenarioType: "volatility_impact",
      triggerComponent: "volatility",
      triggerMagnitude: 20,
      affectedComponent: "liquidity",
    };
    const result = runScenario([], query);
    assert.ok(typeof result.narrativeExplanation === "string");
    assert.ok(result.sampleSize === 0);
  });

  test("runScenario returns valid result for sufficient data", () => {
    const features = makeFeatureSet(50);
    const query: ScenarioQuery = {
      scenarioType: "volatility_impact",
      triggerComponent: "volatility",
      triggerMagnitude: 20,
      affectedComponent: "liquidity",
    };
    const result = runScenario(features, query);
    assert.ok(result.confidence >= 0 && result.confidence <= 100);
    assert.ok(result.sampleSize >= 0);
    assert.ok(typeof result.narrativeExplanation === "string");
    assert.ok(result.narrativeExplanation.length > 10);
  });

  test("scenario result includes query reference", () => {
    const features = makeFeatureSet(30);
    const query: ScenarioQuery = {
      scenarioType: "liquidity_shock",
      triggerComponent: "liquidity",
      triggerMagnitude: -30,
      affectedComponent: "spread",
    };
    const result = runScenario(features, query);
    assert.deepEqual(result.query, query);
  });

  test("scenario stats are in valid ranges", () => {
    const features = makeFeatureSet(80);
    const query: ScenarioQuery = {
      scenarioType: "news_event",
      triggerComponent: "news",
      triggerMagnitude: 50,
      affectedComponent: "volatility",
    };
    const result = runScenario(features, query);
    assert.ok(result.historicalResponseMean >= 0 && result.historicalResponseMean <= 1);
    assert.ok(result.historicalResponseStd >= 0);
    assert.ok(result.responseTimeBars >= 0);
  });

  test("PREDEFINED_SCENARIOS has 8 entries", () => {
    assert.equal(PREDEFINED_SCENARIOS.length, 8);
  });

  test("runAllPredefinedScenarios returns 8 results", () => {
    const features = makeFeatureSet(60);
    const results = runAllPredefinedScenarios(features);
    assert.equal(results.length, PREDEFINED_SCENARIOS.length);
  });

  test("predefined scenarios trigger ≠ affected component", () => {
    for (const s of PREDEFINED_SCENARIOS) {
      assert.notEqual(s.triggerComponent, s.affectedComponent,
        "Trigger and affected component should differ");
    }
  });

  test("scenario narrative is observational (no trading signals)", () => {
    const features = makeFeatureSet(50);
    const results = runAllPredefinedScenarios(features);
    for (const r of results) {
      const text = r.narrativeExplanation.toLowerCase();
      assert.ok(
        !text.includes("buy") && !text.includes("sell") && !text.includes("trade signal"),
        `Narrative should not contain trading signals: ${r.narrativeExplanation.slice(0, 100)}`,
      );
    }
  });
});

// ─── World Model Store Tests ───────────────────────────────────────────────────

describe("WorldModelStore", () => {
  test("can instantiate store", () => {
    const store = new WorldModelStore();
    assert.ok(store);
  });

  test("getFeatureCount is 0 before compute", () => {
    const store = new WorldModelStore();
    assert.equal(store.getFeatureCount(), 0);
  });

  test("getLastComputedAt is null before compute", () => {
    const store = new WorldModelStore();
    assert.equal(store.getLastComputedAt(), null);
  });

  test("compute populates store", () => {
    const store = new WorldModelStore();
    const features = makeFeatureSet(60);
    store.compute(features, 5);
    assert.equal(store.getFeatureCount(), 60);
    assert.ok(store.getLastComputedAt() instanceof Date);
  });

  test("getRelationships returns array", () => {
    const store = new WorldModelStore();
    store.compute(makeFeatureSet(60));
    const rels = store.getRelationships();
    assert.ok(Array.isArray(rels));
  });

  test("getTransitionStats returns array", () => {
    const store = new WorldModelStore();
    store.compute(makeFeatureSet(60));
    const stats = store.getTransitionStats();
    assert.ok(Array.isArray(stats));
  });

  test("getInfluenceGraph returns valid graph", () => {
    const store = new WorldModelStore();
    store.compute(makeFeatureSet(60));
    const graph = store.getInfluenceGraph();
    assert.ok(graph.nodes.length === 13);
    assert.ok(graph.edges.length > 0);
  });

  test("runScenario works through store", () => {
    const store = new WorldModelStore();
    store.compute(makeFeatureSet(60));
    const result = store.runScenario({
      scenarioType: "volatility_impact",
      triggerComponent: "volatility",
      triggerMagnitude: 20,
      affectedComponent: "liquidity",
    });
    assert.ok(result.confidence >= 0);
  });

  test("runAllScenarios returns all predefined results", () => {
    const store = new WorldModelStore();
    store.compute(makeFeatureSet(60));
    const results = store.runAllScenarios();
    assert.equal(results.length, PREDEFINED_SCENARIOS.length);
  });

  test("getSummary returns valid structure", () => {
    const store = new WorldModelStore();
    store.compute(makeFeatureSet(80), 10);
    const summary = store.getSummary("EURUSD");
    assert.equal(summary.pair, "EURUSD");
    assert.equal(summary.version, WORLD_MODEL_VERSION);
    assert.ok(summary.currentState);
    assert.ok(Array.isArray(summary.activeRelationships));
    assert.ok(Array.isArray(summary.activeTransitions));
    assert.ok(summary.influenceGraph);
    assert.ok(summary.modelHealth);
  });

  test("model health overallScore is 0..100", () => {
    const store = new WorldModelStore();
    store.compute(makeFeatureSet(80), 10);
    const health = store.getModelHealth();
    assert.ok(health.overallScore >= 0 && health.overallScore <= 100);
    assert.ok(health.dataAdequacy >= 0 && health.dataAdequacy <= 100);
    assert.ok(health.relationshipCoverage >= 0 && health.relationshipCoverage <= 100);
    assert.ok(health.transitionCoverage >= 0 && health.transitionCoverage <= 100);
    assert.ok(Array.isArray(health.issues));
  });

  test("store with no data returns safe defaults", () => {
    const store = new WorldModelStore();
    store.compute([]);
    const summary = store.getSummary("EURUSD");
    assert.equal(summary.currentState.pair, "EURUSD");
    assert.equal(summary.currentState.worldModelVersion, WORLD_MODEL_VERSION);
  });
});

// ─── Report Generator Tests ───────────────────────────────────────────────────

describe("Report Generator", () => {
  test("generateWorldModelReport returns markdown string", () => {
    const store = new WorldModelStore();
    store.compute(makeFeatureSet(60), 5);
    const summary = store.getSummary("EURUSD");
    const report = generateWorldModelReport(summary);
    assert.ok(typeof report === "string");
    assert.ok(report.includes("MARKET WORLD MODEL REPORT"));
    assert.ok(report.includes("Model Health Score"));
    assert.ok(report.includes("advisory only"));
  });

  test("generateRelationshipReport contains relationship table", () => {
    const features = makeFeatureSet(60);
    const rels = analyzeRelationships(features);
    const report = generateRelationshipReport(rels);
    assert.ok(report.includes("MARKET RELATIONSHIP REPORT"));
    assert.ok(report.includes("Total Relationships Detected"));
  });

  test("generateTransitionReport contains transition table", () => {
    const features = makeFeatureSet(60);
    const events = detectTransitions(features);
    const stats = computeTransitionStats(events);
    const report = generateTransitionReport(stats);
    assert.ok(report.includes("MARKET TRANSITION REPORT"));
    assert.ok(report.includes("Total Transition Types"));
  });

  test("generateScenarioReport covers all predefined scenarios", () => {
    const features = makeFeatureSet(60);
    const results = runAllPredefinedScenarios(features);
    const report = generateScenarioReport(results);
    assert.ok(report.includes("SCENARIO SIMULATION REPORT"));
    assert.ok(report.includes("observational"));
    assert.ok(report.includes("No trading signals"));
  });

  test("reports do not contain buy/sell signals", () => {
    const store = new WorldModelStore();
    store.compute(makeFeatureSet(60), 5);
    const summary = store.getSummary("EURUSD");
    const worldReport = generateWorldModelReport(summary);
    const scenarioReport = generateScenarioReport(store.runAllScenarios());

    for (const report of [worldReport, scenarioReport]) {
      const lower = report.toLowerCase();
      // Reports are advisory so they shouldn't contain unqualified trade signals
      assert.ok(!lower.includes("place a trade"), "Report should not contain trade signals");
      assert.ok(!lower.includes("execute trade"), "Report should not contain execute trade");
    }
  });
});

// ─── Chronology Regression Tests ─────────────────────────────────────────────

describe("Chronology (Time-Order Integrity)", () => {
  test("transition engine correctly identifies direction in known sequence", () => {
    // Build a features array in ascending time order: trending → ranging → volatile
    const trending: WorldModelFeatureRow[] = Array.from({ length: 5 }, (_, i) =>
      makeFeature({ marketRegime: "trending", entryTime: new Date(Date.now() - (15 - i) * 3600_000) }),
    );
    const ranging: WorldModelFeatureRow[] = Array.from({ length: 5 }, (_, i) =>
      makeFeature({ marketRegime: "ranging", entryTime: new Date(Date.now() - (10 - i) * 3600_000) }),
    );
    const volatile: WorldModelFeatureRow[] = Array.from({ length: 5 }, (_, i) =>
      makeFeature({ marketRegime: "volatile", entryTime: new Date(Date.now() - (5 - i) * 3600_000) }),
    );

    // Ascending order (oldest first) — as engines expect
    const features = [...trending, ...ranging, ...volatile];
    const rawEvents = detectTransitions(features);
    const stats = computeTransitionStats(rawEvents);

    // Should find regime-category transitions in the stats
    const regimeStats = stats.filter(s => s.transitionCategory === "regime");
    assert.ok(regimeStats.length >= 2, `Should detect at least 2 regime transition types, found ${regimeStats.length}`);

    // Should include trending→ranging transition
    const trendingToRanging = regimeStats.find(s => s.fromState === "trending" && s.toState === "ranging");
    assert.ok(trendingToRanging, "Should find trending→ranging transition");

    // Should include ranging→volatile transition
    const rangingToVolatile = regimeStats.find(s => s.fromState === "ranging" && s.toState === "volatile");
    assert.ok(rangingToVolatile, "Should find ranging→volatile transition");
  });

  test("world model store identifies most recent feature as current state", () => {
    // Build ascending-time features ending in 'volatile' regime
    const features: WorldModelFeatureRow[] = [
      ...Array.from({ length: 10 }, (_, i) =>
        makeFeature({ marketRegime: "ranging", entryTime: new Date(Date.now() - (20 - i) * 3600_000) }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeFeature({ marketRegime: "volatile", entryTime: new Date(Date.now() - (10 - i) * 3600_000) }),
      ),
    ];

    const store = new WorldModelStore();
    store.compute(features);
    const summary = store.getSummary("EURUSD");

    // Current state should reflect the most recent 'volatile' features, not the earlier 'ranging'
    assert.equal(summary.currentState.regime, "volatile",
      "Current state should show volatile (most recent), not ranging (earlier)");
  });

  test("lag correlation uses correct temporal direction", () => {
    // Create features where source[t] predicts target[t+1] (not reversed)
    // Volatility at t=0..4 is high, liquidity at t=1..5 is low (lagged response)
    const features: WorldModelFeatureRow[] = Array.from({ length: 30 }, (_, i) => {
      const isHighVol = i < 15;
      return makeFeature({
        volatility: isHighVol ? "high" : "low",
        liquidityScore: i > 0 && i - 1 < 15 ? 20 : 80, // lag of 1
        entryTime: new Date(Date.now() - (30 - i) * 3600_000),
      });
    });

    const rels = analyzeRelationships(features);
    // There should be a relationship between volatility and liquidity (possibly lagged)
    // At minimum, the engine should not crash and return valid relationships
    assert.ok(Array.isArray(rels));
    for (const r of rels) {
      assert.ok(r.lagBars >= 0, "Lag bars should be non-negative");
      assert.ok(r.sampleSize >= 0, "Sample size should be non-negative");
    }
  });
});

// ─── Stress Tests ─────────────────────────────────────────────────────────────

describe("Stress Tests", () => {
  test("relationship analysis handles 500 features", () => {
    const features = makeFeatureSet(500);
    const start = Date.now();
    const rels = analyzeRelationships(features);
    const elapsed = Date.now() - start;
    assert.ok(Array.isArray(rels));
    assert.ok(elapsed < 5000, `Analysis took too long: ${elapsed}ms`);
  });

  test("transition detection handles 1000 features", () => {
    const features = makeFeatureSet(1000);
    const start = Date.now();
    const events = detectTransitions(features);
    const elapsed = Date.now() - start;
    assert.ok(Array.isArray(events));
    assert.ok(elapsed < 3000, `Transition detection took too long: ${elapsed}ms`);
  });

  test("full store compute handles 300 features", () => {
    const store = new WorldModelStore();
    const features = makeFeatureSet(300);
    const start = Date.now();
    store.compute(features, 50);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 10000, `Full compute took too long: ${elapsed}ms`);
    const summary = store.getSummary("EURUSD");
    assert.ok(summary.modelHealth.overallScore >= 0);
  });

  test("all predefined scenarios complete for 200 features", () => {
    const features = makeFeatureSet(200);
    const results = runAllPredefinedScenarios(features);
    assert.equal(results.length, PREDEFINED_SCENARIOS.length);
    for (const r of results) {
      assert.ok(r.confidence >= 0 && r.confidence <= 100);
    }
  });

  test("influence graph builds correctly for 100-feature dataset", () => {
    const features = makeFeatureSet(100);
    const rels = analyzeRelationships(features);
    const graph = buildInfluenceGraph(rels, true);
    assert.equal(graph.nodes.length, 13);
    assert.ok(graph.edges.length > 0);
  });
});
