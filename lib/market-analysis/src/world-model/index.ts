// ─── World Model Public API ───────────────────────────────────────────────────
// Re-exports the complete public surface of the Market World Model.

export * from "./types.js";
export {
  analyzeRelationships,
  filterSignificantRelationships,
  getRelationshipsFor,
  MIN_RELATIONSHIP_SAMPLE,
  MIN_CONFIDENCE_THRESHOLD,
  CAUSAL_CONFIDENCE_THRESHOLD,
  CAUSAL_SAMPLE_THRESHOLD,
} from "./relationship-analyzer.js";
export {
  detectTransitions,
  computeTransitionStats,
  detectActiveTransitions,
  KNOWN_TRANSITIONS,
} from "./transition-engine.js";
export type { TransitionDefinition } from "./transition-engine.js";
export {
  buildInfluenceGraph,
  getInfluencedBy,
  getInfluences,
  getTopInfluencers,
  buildInfluenceChain,
} from "./influence-graph.js";
export {
  runScenario,
  runAllPredefinedScenarios,
  PREDEFINED_SCENARIOS,
} from "./scenario-simulator.js";
export {
  WorldModelStore,
  worldModelStore,
  WORLD_MODEL_ENGINE_VERSION,
} from "./world-model-store.js";
export {
  generateWorldModelReport,
  generateRelationshipReport,
  generateTransitionReport,
  generateScenarioReport,
} from "./report-generator.js";
