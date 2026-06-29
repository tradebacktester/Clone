// ─── Market World Model DB Schema ─────────────────────────────────────────────
// Observational only. No trade execution. No strategy modification.
// Stores relationships, transitions, market memory, influence edges, scenarios.

import {
  pgTable, serial, text, integer, numeric,
  timestamp, jsonb, index, boolean, uuid,
} from "drizzle-orm/pg-core";

// ─── World Model Components ───────────────────────────────────────────────────
// The 13 components modelled in the world model:
// regime | trend | volatility | liquidity | correlation | news | session |
// spread | market_structure | supply_demand | liquidity_sweeps |
// amd_completion | confirmation_quality

// ─── Causal Relationships ─────────────────────────────────────────────────────
// One row per directional relationship (sourceComponent → targetComponent).
// Computed from historical trade features. Append-only; version-tracked.

export const worldModelRelationshipsTable = pgTable("world_model_relationships", {
  id: serial("id").primaryKey(),
  sourceComponent: text("source_component").notNull(),
  targetComponent: text("target_component").notNull(),
  relationshipType: text("relationship_type").notNull(), // 'leads_to' | 'correlates_with' | 'amplifies' | 'suppresses'
  strength: numeric("strength", { precision: 6, scale: 4 }).notNull().default("0"),        // -1..1
  confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull().default("0"),    // 0..100
  sampleSize: integer("sample_size").notNull().default(0),
  reliabilityScore: numeric("reliability_score", { precision: 5, scale: 2 }).notNull().default("0"), // 0..100
  lagBars: integer("lag_bars").notNull().default(0),         // 0 = contemporaneous
  pValue: numeric("p_value", { precision: 8, scale: 6 }).notNull().default("1"),
  isCausal: boolean("is_causal").notNull().default(false),   // strict causal vs mere correlation
  evidenceSummary: text("evidence_summary").notNull().default(""),
  historicalEvidence: jsonb("historical_evidence"),           // array of supporting data points
  engineVersion: text("engine_version").notNull().default("1.0.0"),
  computedAt: timestamp("computed_at").defaultNow(),
}, (t) => [
  index("wmr_source_target_idx").on(t.sourceComponent, t.targetComponent),
  index("wmr_computed_at_idx").on(t.computedAt),
]);

// ─── Market Transitions ───────────────────────────────────────────────────────
// Tracks observed state transitions (e.g., trending → ranging).
// Each row = one historical occurrence.

export const worldModelTransitionsTable = pgTable("world_model_transitions", {
  id: serial("id").primaryKey(),
  pair: text("pair").notNull(),
  fromState: text("from_state").notNull(),   // e.g., "trending", "ranging", "compression"
  toState: text("to_state").notNull(),       // e.g., "ranging", "trending", "expansion"
  transitionCategory: text("transition_category").notNull(), // 'regime' | 'volatility' | 'liquidity'
  durationBars: integer("duration_bars").notNull().default(0),  // time spent in fromState before transition
  triggerComponents: jsonb("trigger_components"),               // which components changed first
  marketContextAtTransition: jsonb("market_context_at_transition"),
  outcomeQuality: numeric("outcome_quality", { precision: 5, scale: 2 }).notNull().default("50"), // 0..100 trade quality after
  observedAt: timestamp("observed_at").defaultNow(),
}, (t) => [
  index("wmt_pair_from_to_idx").on(t.pair, t.fromState, t.toState),
  index("wmt_observed_at_idx").on(t.observedAt),
]);

// ─── Transition Statistics ─────────────────────────────────────────────────────
// Aggregated stats per (fromState, toState) pair — updated on each compute run.

export const worldModelTransitionStatsTable = pgTable("world_model_transition_stats", {
  id: serial("id").primaryKey(),
  fromState: text("from_state").notNull(),
  toState: text("to_state").notNull(),
  transitionCategory: text("transition_category").notNull(),
  transitionProbability: numeric("transition_probability", { precision: 6, scale: 4 }).notNull().default("0"), // 0..1
  avgDurationBars: numeric("avg_duration_bars", { precision: 8, scale: 2 }).notNull().default("0"),
  medianDurationBars: numeric("median_duration_bars", { precision: 8, scale: 2 }).notNull().default("0"),
  historicalFrequency: integer("historical_frequency").notNull().default(0), // raw count
  confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull().default("0"), // 0..100
  avgOutcomeQuality: numeric("avg_outcome_quality", { precision: 5, scale: 2 }).notNull().default("50"),
  supportingEvidence: jsonb("supporting_evidence"),
  computedAt: timestamp("computed_at").defaultNow(),
}, (t) => [
  index("wmts_from_to_cat_idx").on(t.fromState, t.toState, t.transitionCategory),
]);

// ─── Market Memory ─────────────────────────────────────────────────────────────
// Long-term store of complete market states for world model learning.

export const worldModelMemoryTable = pgTable("world_model_memory", {
  id: uuid("id").defaultRandom().primaryKey(),
  pair: text("pair").notNull(),
  regime: text("regime").notNull(),
  trend: text("trend").notNull(),
  volatilityClass: text("volatility_class").notNull(),
  liquidityQuality: text("liquidity_quality").notNull(),
  correlationRisk: text("correlation_risk").notNull(),
  newsEnvironment: text("news_environment").notNull(),
  session: text("session").notNull(),
  spreadCategory: text("spread_category").notNull(),   // 'tight' | 'normal' | 'wide' | 'very_wide'
  marketStructure: text("market_structure").notNull(),  // 'bullish_bos' | 'bearish_bos' | 'ranging' | 'choppy'
  supplyDemandQuality: text("supply_demand_quality").notNull(), // 'strong' | 'moderate' | 'weak'
  liquiditySweeps: text("liquidity_sweeps").notNull(),  // 'none' | 'recent' | 'active'
  amdCompletion: text("amd_completion").notNull(),      // 'none' | 'accumulation' | 'manipulation' | 'distribution'
  confirmationQuality: text("confirmation_quality").notNull(), // 'strong' | 'moderate' | 'weak' | 'none'
  marketContextScore: integer("market_context_score").notNull().default(50),
  stabilityScore: integer("stability_score").notNull().default(50),
  regimeConfidence: integer("regime_confidence").notNull().default(50),
  activeTransitions: jsonb("active_transitions"),        // currently occurring transitions
  worldModelVersion: text("world_model_version").notNull().default("1.0.0"),
  fullState: jsonb("full_state"),                        // complete raw state snapshot
  capturedAt: timestamp("captured_at").defaultNow(),
}, (t) => [
  index("wmm_pair_captured_idx").on(t.pair, t.capturedAt),
  index("wmm_regime_idx").on(t.regime),
  index("wmm_captured_at_idx").on(t.capturedAt),
]);

// ─── Influence Graph Edges ─────────────────────────────────────────────────────
// Directed edges in the market influence graph.
// One row per (source → target) computed influence edge.

export const worldModelInfluenceEdgesTable = pgTable("world_model_influence_edges", {
  id: serial("id").primaryKey(),
  sourceNode: text("source_node").notNull(),
  targetNode: text("target_node").notNull(),
  influenceStrength: numeric("influence_strength", { precision: 6, scale: 4 }).notNull().default("0"), // 0..1
  influenceDirection: text("influence_direction").notNull().default("positive"), // 'positive' | 'negative' | 'mixed'
  confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull().default("0"), // 0..100
  sampleSize: integer("sample_size").notNull().default(0),
  propagationDepth: integer("propagation_depth").notNull().default(1), // 1 = direct, 2 = 1 hop, etc.
  explanation: text("explanation").notNull().default(""),
  supportingEvidence: jsonb("supporting_evidence"),
  computedAt: timestamp("computed_at").defaultNow(),
}, (t) => [
  index("wmie_source_target_idx").on(t.sourceNode, t.targetNode),
]);

// ─── Scenario Simulation Results ──────────────────────────────────────────────
// Stores the result of each scenario query for caching and audit.

export const worldModelScenariosTable = pgTable("world_model_scenarios", {
  id: serial("id").primaryKey(),
  scenarioType: text("scenario_type").notNull(),          // 'volatility_impact' | 'correlation_shift' | 'regime_transition' | 'liquidity_shock'
  triggerComponent: text("trigger_component").notNull(),  // what changes
  triggerMagnitude: numeric("trigger_magnitude", { precision: 8, scale: 4 }).notNull().default("0"), // % or absolute
  affectedComponent: text("affected_component").notNull(), // what we measure
  historicalResponseMean: numeric("historical_response_mean", { precision: 8, scale: 4 }).notNull().default("0"),
  historicalResponseStd: numeric("historical_response_std", { precision: 8, scale: 4 }).notNull().default("0"),
  historicalResponseMin: numeric("historical_response_min", { precision: 8, scale: 4 }).notNull().default("0"),
  historicalResponseMax: numeric("historical_response_max", { precision: 8, scale: 4 }).notNull().default("0"),
  sampleSize: integer("sample_size").notNull().default(0),
  confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull().default("0"),
  responseTimelineBars: numeric("response_time_bars", { precision: 6, scale: 1 }).notNull().default("0"),
  narrativeExplanation: text("narrative_explanation").notNull().default(""),
  evidenceBreakdown: jsonb("evidence_breakdown"),
  computedAt: timestamp("computed_at").defaultNow(),
}, (t) => [
  index("wms_trigger_affected_idx").on(t.triggerComponent, t.affectedComponent),
  index("wms_computed_at_idx").on(t.computedAt),
]);

// ─── TypeScript Types ──────────────────────────────────────────────────────────

export type WorldModelRelationship = typeof worldModelRelationshipsTable.$inferSelect;
export type NewWorldModelRelationship = typeof worldModelRelationshipsTable.$inferInsert;
export type WorldModelTransition = typeof worldModelTransitionsTable.$inferSelect;
export type NewWorldModelTransition = typeof worldModelTransitionsTable.$inferInsert;
export type WorldModelTransitionStats = typeof worldModelTransitionStatsTable.$inferSelect;
export type NewWorldModelTransitionStats = typeof worldModelTransitionStatsTable.$inferInsert;
export type WorldModelMemory = typeof worldModelMemoryTable.$inferSelect;
export type NewWorldModelMemory = typeof worldModelMemoryTable.$inferInsert;
export type WorldModelInfluenceEdge = typeof worldModelInfluenceEdgesTable.$inferSelect;
export type NewWorldModelInfluenceEdge = typeof worldModelInfluenceEdgesTable.$inferInsert;
export type WorldModelScenario = typeof worldModelScenariosTable.$inferSelect;
export type NewWorldModelScenario = typeof worldModelScenariosTable.$inferInsert;
