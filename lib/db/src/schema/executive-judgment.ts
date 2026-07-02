import {
  pgTable, serial, text, real, integer, jsonb,
  timestamp, boolean, index,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ─── Executive Judgment Reports ───────────────────────────────────────────────

export const ejJudgmentsTable = pgTable("ej_judgments", {
  id:                   serial("id").primaryKey(),
  judgmentId:           text("judgment_id").notNull().unique(),
  evaluatedAt:          timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
  pair:                 text("pair").notNull().default("EURUSD"),
  timeframe:            text("timeframe").notNull().default("15m"),

  // Final decision
  finalDecision:        text("final_decision").notNull(),
  finalDecisionLabel:   text("final_decision_label").notNull(),
  finalScore:           real("final_score").notNull().default(0),
  finalConfidence:      real("final_confidence").notNull().default(0),

  // Top 3
  bestDecision:         text("best_decision").notNull(),
  secondBestDecision:   text("second_best_decision").notNull(),
  thirdBestDecision:    text("third_best_decision").notNull(),

  // Opportunity cost
  opportunityCostScore: real("opportunity_cost_score").notNull().default(0),
  ocRecommendation:     text("oc_recommendation").notNull().default("wait"),

  // Intelligence snapshot
  executiveScore:       real("executive_score").notNull().default(0),
  riskScore:            real("risk_score").notNull().default(0),
  crisisStatus:         text("crisis_status").notNull().default("none"),

  // Performance
  durationMs:           integer("duration_ms").notNull().default(0),
  engineVersion:        text("engine_version").notNull().default("1.0.0"),

  // Full payload
  fullPayload:          jsonb("full_payload"),
  isAdvisoryOnly:       boolean("is_advisory_only").notNull().default(true),
}, (t) => [
  index("ej_judgments_evaluated_at_idx").on(t.evaluatedAt),
  index("ej_judgments_pair_idx").on(t.pair),
  index("ej_judgments_final_decision_idx").on(t.finalDecision),
]);

export const insertEjJudgmentSchema = createInsertSchema(ejJudgmentsTable).omit({ id: true });
export const selectEjJudgmentSchema = createSelectSchema(ejJudgmentsTable);

// ─── Decision Simulations (one row per candidate per judgment) ─────────────────

export const ejSimulationsTable = pgTable("ej_simulations", {
  id:                  serial("id").primaryKey(),
  judgmentId:          text("judgment_id").notNull(),
  recordedAt:          timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  pair:                text("pair").notNull().default("EURUSD"),
  decisionType:        text("decision_type").notNull(),
  decisionLabel:       text("decision_label").notNull(),
  rank:                integer("rank").notNull().default(0),
  overallScore:        real("overall_score").notNull().default(0),
  expectedProbability: real("expected_probability").notNull().default(0),
  expectedRisk:        real("expected_risk").notNull().default(0),
  historicalWinRate:   real("historical_win_rate").notNull().default(0),
  expectedRR:          real("expected_rr").notNull().default(0),
  expectedValue:       real("expected_value").notNull().default(0),
  confidence:          real("confidence").notNull().default(0),
  sampleSize:          integer("sample_size").notNull().default(0),
}, (t) => [
  index("ej_simulations_judgment_id_idx").on(t.judgmentId),
  index("ej_simulations_recorded_at_idx").on(t.recordedAt),
]);

export const insertEjSimulationSchema = createInsertSchema(ejSimulationsTable).omit({ id: true });
export const selectEjSimulationSchema = createSelectSchema(ejSimulationsTable);

// ─── Counterfactual Analysis ───────────────────────────────────────────────────

export const ejCounterfactualsTable = pgTable("ej_counterfactuals", {
  id:                    serial("id").primaryKey(),
  analysisId:            text("analysis_id").notNull().unique(),
  judgmentId:            text("judgment_id").notNull(),
  tradeId:               text("trade_id"),
  completedAt:           timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  actualDecision:        text("actual_decision").notNull(),
  actualOutcome:         text("actual_outcome").notNull(),
  actualPnL:             real("actual_pnl").notNull().default(0),
  actualRR:              real("actual_rr").notNull().default(0),
  decisionQualityScore:  real("decision_quality_score").notNull().default(0),
  learningInsight:       text("learning_insight").notNull().default(""),
  fullPayload:           jsonb("full_payload"),
}, (t) => [
  index("ej_counterfactuals_judgment_id_idx").on(t.judgmentId),
  index("ej_counterfactuals_completed_at_idx").on(t.completedAt),
]);

export const insertEjCounterfactualSchema = createInsertSchema(ejCounterfactualsTable).omit({ id: true });
export const selectEjCounterfactualSchema = createSelectSchema(ejCounterfactualsTable);

// ─── Judgment Timeline (lightweight for charting) ─────────────────────────────

export const ejTimelineTable = pgTable("ej_timeline", {
  id:              serial("id").primaryKey(),
  judgmentId:      text("judgment_id").notNull(),
  recordedAt:      timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  pair:            text("pair").notNull().default("EURUSD"),
  finalDecision:   text("final_decision").notNull(),
  finalScore:      real("final_score").notNull().default(0),
  finalConfidence: real("final_confidence").notNull().default(0),
  ocScore:         real("oc_score").notNull().default(0),
  riskScore:       real("risk_score").notNull().default(0),
  engineVersion:   text("engine_version").notNull().default("1.0.0"),
}, (t) => [
  index("ej_timeline_recorded_at_idx").on(t.recordedAt),
  index("ej_timeline_pair_idx").on(t.pair),
]);

export const insertEjTimelineSchema = createInsertSchema(ejTimelineTable).omit({ id: true });
export const selectEjTimelineSchema = createSelectSchema(ejTimelineTable);
