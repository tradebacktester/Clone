// ─── World Model Store ────────────────────────────────────────────────────────
// Orchestrates all world model engines and provides the unified API surface.
// Observational only — no trade execution, no strategy modification.

import type {
  WorldModelFeatureRow,
  WorldModelSummary,
  MarketWorldState,
  ModelHealth,
  ComponentRelationship,
  MarketTransitionStats,
  InfluenceGraph,
  ScenarioResult,
  ScenarioQuery,
  ActiveTransition,
} from "./types.js";
import { WORLD_MODEL_VERSION } from "./types.js";
import { analyzeRelationships, filterSignificantRelationships } from "./relationship-analyzer.js";
import {
  detectTransitions,
  computeTransitionStats,
  detectActiveTransitions,
} from "./transition-engine.js";
import { buildInfluenceGraph } from "./influence-graph.js";
import { runScenario, runAllPredefinedScenarios } from "./scenario-simulator.js";

// ─── Default World State ────────────────────────────────────────────────────

function defaultWorldState(pair: string): MarketWorldState {
  return {
    pair,
    regime: "ranging",
    trend: "neutral",
    volatilityClass: "medium",
    liquidityQuality: "normal",
    correlationRisk: "low",
    newsEnvironment: "safe",
    session: "unknown",
    spreadCategory: "normal",
    marketStructure: "ranging",
    supplyDemandQuality: "moderate",
    liquiditySweeps: "none",
    amdCompletion: "none",
    confirmationQuality: "moderate",
    marketContextScore: 50,
    stabilityScore: 50,
    regimeConfidence: 40,
    activeTransitions: [],
    worldModelVersion: WORLD_MODEL_VERSION,
    capturedAt: new Date(),
  };
}

// ─── State Builders ───────────────────────────────────────────────────────────

function buildWorldStateFromFeatures(
  features: WorldModelFeatureRow[],
  pair: string,
  allTransitionStats: MarketTransitionStats[],
): MarketWorldState {
  if (features.length === 0) return defaultWorldState(pair);

  const recent = features.slice(-10); // last 10 observations
  const last = recent[recent.length - 1];

  const avgSetupScore = recent.reduce((s, f) => s + f.setupScore, 0) / recent.length;
  const avgAmdScore  = recent.reduce((s, f) => s + f.amdScore, 0) / recent.length;
  const avgLiq       = recent.reduce((s, f) => s + f.liquidityScore, 0) / recent.length;
  const avgConf      = recent.reduce((s, f) => s + f.confirmationQuality, 0) / recent.length;
  const avgSupply    = recent.reduce((s, f) => s + (f.supplyQuality + f.demandQuality) / 2, 0) / recent.length;
  const avgSpread    = recent.reduce((s, f) => s + f.spreadPips, 0) / recent.length;

  const spreadCategory =
    avgSpread < 1.5 ? "tight" :
    avgSpread < 4   ? "normal" :
    avgSpread < 8   ? "wide" : "very_wide";

  const supplyDemandQuality =
    avgSupply >= 70 ? "strong" : avgSupply >= 40 ? "moderate" : "weak";

  const amdCompletion =
    avgAmdScore >= 75 ? "distribution" :
    avgAmdScore >= 55 ? "manipulation" :
    avgAmdScore >= 35 ? "accumulation" : "none";

  const confirmationQuality =
    avgConf >= 70 ? "strong" : avgConf >= 45 ? "moderate" : avgConf >= 25 ? "weak" : "none";

  const liquiditySweeps =
    avgLiq < 30 ? "active" : avgLiq > 70 ? "recent" : "none";

  const marketContextScore = Math.round(
    avgSetupScore * 0.3 + avgLiq * 0.2 + avgConf * 0.25 + avgAmdScore * 0.25,
  );

  const stabilityScore = Math.round(
    100 - Math.min(50, features.length > 3
      ? Math.abs(features[features.length - 1].setupScore - features[0].setupScore) / 2
      : 0),
  );

  const recentForTransitions = features.slice(-5);
  const activeTransitions: ActiveTransition[] = detectActiveTransitions(
    recentForTransitions.map(f => ({
      ...f,
      entryTime: f.entryTime instanceof Date ? f.entryTime : new Date(f.entryTime),
    })),
    allTransitionStats,
  );

  return {
    pair,
    regime: last.marketRegime,
    trend: last.trend,
    volatilityClass: last.volatility,
    liquidityQuality: avgLiq >= 70 ? "high" : avgLiq >= 40 ? "normal" : "low",
    correlationRisk: "low",    // not in feature rows
    newsEnvironment: "safe",   // not in feature rows
    session: last.session,
    spreadCategory,
    marketStructure: last.marketRegime === "trending" ? "bullish_bos" : "ranging",
    supplyDemandQuality,
    liquiditySweeps,
    amdCompletion,
    confirmationQuality,
    marketContextScore,
    stabilityScore,
    regimeConfidence: Math.round(last.confidence),
    activeTransitions,
    worldModelVersion: WORLD_MODEL_VERSION,
    capturedAt: new Date(),
  };
}

// ─── Model Health ─────────────────────────────────────────────────────────────

function computeModelHealth(
  relationships: ComponentRelationship[],
  transitionStats: MarketTransitionStats[],
  memoryCount: number,
  featureCount: number,
): ModelHealth {
  const issues: string[] = [];

  const dataAdequacy = Math.min(100, (featureCount / 100) * 60 + (memoryCount / 50) * 40);
  if (featureCount < 20) issues.push("Insufficient historical trade features (need ≥20).");
  if (memoryCount < 10)  issues.push("Low world model memory depth (need ≥10 snapshots).");

  const sigRelationships = relationships.filter(r => r.confidence >= 55);
  const maxPossibleRel = 13 * 12; // 13 components, directed
  const relationshipCoverage = Math.min(100, (sigRelationships.length / (maxPossibleRel * 0.3)) * 100);
  if (sigRelationships.length < 10) issues.push("Low relationship coverage — more historical data needed.");

  const transitionCoverage = Math.min(100, (transitionStats.length / 14) * 100); // 14 known transitions
  if (transitionStats.length < 5) issues.push("Low transition coverage — more regime-change events needed.");

  const overallScore = Math.round(
    dataAdequacy * 0.35 +
    relationshipCoverage * 0.30 +
    transitionCoverage * 0.20 +
    (issues.length === 0 ? 15 : Math.max(0, 15 - issues.length * 5)),
  );

  return {
    overallScore,
    dataAdequacy: parseFloat(dataAdequacy.toFixed(1)),
    relationshipCoverage: parseFloat(relationshipCoverage.toFixed(1)),
    transitionCoverage: parseFloat(transitionCoverage.toFixed(1)),
    memoryDepth: memoryCount,
    lastUpdated: new Date(),
    issues,
  };
}

// ─── World Model Store Class ──────────────────────────────────────────────────

export class WorldModelStore {
  private relationships: ComponentRelationship[] = [];
  private transitionStats: MarketTransitionStats[] = [];
  private influenceGraph: InfluenceGraph | null = null;
  private lastFeatures: WorldModelFeatureRow[] = [];
  private lastComputedAt: Date | null = null;
  private memoryCount = 0;

  // ─── Compute ───────────────────────────────────────────────────────────────

  compute(features: WorldModelFeatureRow[], memoryCount = 0): void {
    this.lastFeatures = features;
    this.memoryCount = memoryCount;

    // Relationships
    this.relationships = analyzeRelationships(features);

    // Transitions
    const transitionEvents = detectTransitions(features);
    this.transitionStats = computeTransitionStats(transitionEvents);

    // Influence graph
    this.influenceGraph = buildInfluenceGraph(
      filterSignificantRelationships(this.relationships),
      true,
    );

    this.lastComputedAt = new Date();
  }

  // ─── Summary ───────────────────────────────────────────────────────────────

  getSummary(pair: string): WorldModelSummary {
    const state = buildWorldStateFromFeatures(
      this.lastFeatures,
      pair,
      this.transitionStats,
    );

    const graph = this.influenceGraph ?? buildInfluenceGraph([], true);

    const health = computeModelHealth(
      this.relationships,
      this.transitionStats,
      this.memoryCount,
      this.lastFeatures.length,
    );

    return {
      pair,
      currentState: state,
      activeRelationships: filterSignificantRelationships(this.relationships).slice(0, 50),
      activeTransitions: this.transitionStats.slice(0, 20),
      influenceGraph: graph,
      recentMemoryCount: this.memoryCount,
      modelHealth: health,
      computedAt: this.lastComputedAt ?? new Date(),
      version: WORLD_MODEL_VERSION,
    };
  }

  // ─── Individual Accessors ──────────────────────────────────────────────────

  getRelationships(minConfidence?: number): ComponentRelationship[] {
    if (minConfidence !== undefined) {
      return this.relationships.filter(r => r.confidence >= minConfidence);
    }
    return this.relationships;
  }

  getTransitionStats(category?: string): MarketTransitionStats[] {
    if (category) {
      return this.transitionStats.filter(t => t.transitionCategory === category);
    }
    return this.transitionStats;
  }

  getInfluenceGraph(): InfluenceGraph {
    return this.influenceGraph ?? buildInfluenceGraph([], true);
  }

  runScenario(query: ScenarioQuery): ScenarioResult {
    return runScenario(this.lastFeatures, query);
  }

  runAllScenarios(): ScenarioResult[] {
    return runAllPredefinedScenarios(this.lastFeatures);
  }

  getModelHealth(): ModelHealth {
    return computeModelHealth(
      this.relationships,
      this.transitionStats,
      this.memoryCount,
      this.lastFeatures.length,
    );
  }

  getLastComputedAt(): Date | null {
    return this.lastComputedAt;
  }

  getFeatureCount(): number {
    return this.lastFeatures.length;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const worldModelStore = new WorldModelStore();
export const WORLD_MODEL_ENGINE_VERSION = WORLD_MODEL_VERSION;
