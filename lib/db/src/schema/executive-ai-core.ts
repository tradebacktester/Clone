import { pgTable, serial, text, real, integer, jsonb, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ─── Executive AI Decisions ────────────────────────────────────────────────────

export const eaiDecisionsTable = pgTable("eai_decisions", {
  id:                   serial("id").primaryKey(),
  decisionId:           text("decision_id").notNull().unique(),
  evaluatedAt:          timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
  pair:                 text("pair").notNull().default("EURUSD"),
  timeframe:            text("timeframe").notNull().default("15m"),

  // Core decision
  decision:             text("decision").notNull(),        // trade|wait|observe|reduce_risk|pause_trading|emergency_halt
  decisionLabel:        text("decision_label").notNull(),
  executiveScore:       real("executive_score").notNull(),  // 0-100
  executiveConfidence:  real("executive_confidence").notNull(), // 0-100

  // Sub-scores
  strategyScore:        real("strategy_score").notNull().default(0),
  marketScore:          real("market_score").notNull().default(0),
  riskScore:            real("risk_score").notNull().default(0),
  memoryScore:          real("memory_score").notNull().default(0),
  learningScore:        real("learning_score").notNull().default(0),
  identityScore:        real("identity_score").notNull().default(0),
  researchScore:        real("research_score").notNull().default(0),

  // Conflict flag
  hasConflicts:         boolean("has_conflicts").notNull().default(false),
  conflictCount:        integer("conflict_count").notNull().default(0),

  // Context
  marketRegime:         text("market_regime").notNull().default("unknown"),
  riskState:            text("risk_state").notNull().default("unknown"),
  crisisStatus:         text("crisis_status").notNull().default("none"),

  // Version
  engineVersion:        text("engine_version").notNull().default("1.0.0"),
  strategyVersion:      text("strategy_version").notNull().default("1.0.0"),
  riskVersion:          text("risk_version").notNull().default("1.0.0"),

  // Full payload
  fullPayload:          jsonb("full_payload"),
  isAdvisoryOnly:       boolean("is_advisory_only").notNull().default(true),
}, (t) => [
  index("eai_decisions_evaluated_at_idx").on(t.evaluatedAt),
  index("eai_decisions_pair_idx").on(t.pair),
  index("eai_decisions_decision_idx").on(t.decision),
]);

export const insertEaiDecisionSchema = createInsertSchema(eaiDecisionsTable).omit({ id: true });
export const selectEaiDecisionSchema = createSelectSchema(eaiDecisionsTable);

// ─── Executive AI Timeline ────────────────────────────────────────────────────

export const eaiTimelineTable = pgTable("eai_timeline", {
  id:              serial("id").primaryKey(),
  decisionId:      text("decision_id").notNull(),
  recordedAt:      timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  decision:        text("decision").notNull(),
  executiveScore:  real("executive_score").notNull(),
  confidence:      real("confidence").notNull(),
  pair:            text("pair").notNull().default("EURUSD"),
  regime:          text("regime").notNull().default("unknown"),
  riskState:       text("risk_state").notNull().default("unknown"),
  hasConflicts:    boolean("has_conflicts").notNull().default(false),
  outcome:         text("outcome"),             // filled in post-trade: "profitable"|"loss"|"breakeven"|"n/a"
  outcomeNotes:    text("outcome_notes"),
  engineVersion:   text("engine_version").notNull().default("1.0.0"),
}, (t) => [
  index("eai_timeline_recorded_at_idx").on(t.recordedAt),
  index("eai_timeline_decision_id_idx").on(t.decisionId),
]);

export const insertEaiTimelineSchema = createInsertSchema(eaiTimelineTable).omit({ id: true });
export const selectEaiTimelineSchema = createSelectSchema(eaiTimelineTable);

// ─── Executive AI Conflicts ───────────────────────────────────────────────────

export const eaiConflictsTable = pgTable("eai_conflicts", {
  id:              serial("id").primaryKey(),
  decisionId:      text("decision_id").notNull(),
  recordedAt:      timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  conflictId:      text("conflict_id").notNull(),
  systemA:         text("system_a").notNull(),
  systemB:         text("system_b").notNull(),
  scoreA:          real("score_a").notNull(),
  scoreB:          real("score_b").notNull(),
  divergence:      real("divergence").notNull(),
  severity:        text("severity").notNull(),    // low|moderate|high|critical
  conflictType:    text("conflict_type").notNull(), // risk_vs_strategy|market_vs_strategy|learning_drift|etc
  winnerSystem:    text("winner_system").notNull(),
  resolution:      text("resolution").notNull(),
  winningEvidence: text("winning_evidence").array().notNull().default([]),
  rejectedEvidence: text("rejected_evidence").array().notNull().default([]),
  finalJustification: text("final_justification").notNull(),
}, (t) => [
  index("eai_conflicts_decision_id_idx").on(t.decisionId),
  index("eai_conflicts_recorded_at_idx").on(t.recordedAt),
]);

export const insertEaiConflictSchema = createInsertSchema(eaiConflictsTable).omit({ id: true });
export const selectEaiConflictSchema = createSelectSchema(eaiConflictsTable);
