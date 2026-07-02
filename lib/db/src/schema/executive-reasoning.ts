import {
  pgTable, serial, text, real, integer, jsonb,
  timestamp, boolean, index,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ─── Executive Reasoning Reports ─────────────────────────────────────────────

export const erReportsTable = pgTable("er_reports", {
  id:                    serial("id").primaryKey(),
  reportId:              text("report_id").notNull().unique(),
  traceId:               text("trace_id").notNull(),
  evaluatedAt:           timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
  pair:                  text("pair").notNull().default("EURUSD"),
  timeframe:             text("timeframe").notNull().default("15m"),

  // Stage summaries
  evidenceQuality:       real("evidence_quality").notNull().default(0),
  advisorCount:          integer("advisor_count").notNull().default(6),
  advisorAgreementScore: real("advisor_agreement_score").notNull().default(0),
  conflictCount:         integer("conflict_count").notNull().default(0),
  conflictLevel:         text("conflict_level").notNull().default("none"),

  // Final decision
  selectedAction:        text("selected_action").notNull(),
  selectedActionLabel:   text("selected_action_label").notNull(),
  executiveScore:        real("executive_score").notNull(),
  executiveConfidence:   real("executive_confidence").notNull(),
  utilityScore:          real("utility_score").notNull().default(0),

  // Safety
  allSafetyGatesPassed:  boolean("all_safety_gates_passed").notNull().default(false),
  tradingPermitted:      boolean("trading_permitted").notNull().default(false),
  failedGateCount:       integer("failed_gate_count").notNull().default(0),

  // Context
  marketRegime:          text("market_regime").notNull().default("unknown"),
  riskState:             text("risk_state").notNull().default("unknown"),

  // Performance
  durationMs:            integer("duration_ms").notNull().default(0),

  // Versioning
  engineVersion:         text("engine_version").notNull().default("1.0.0"),

  // Full trace
  fullPayload:           jsonb("full_payload"),
  isAdvisoryOnly:        boolean("is_advisory_only").notNull().default(true),
  isReplayable:          boolean("is_replayable").notNull().default(true),
}, (t) => [
  index("er_reports_evaluated_at_idx").on(t.evaluatedAt),
  index("er_reports_pair_idx").on(t.pair),
  index("er_reports_selected_action_idx").on(t.selectedAction),
]);

export const insertErReportSchema = createInsertSchema(erReportsTable).omit({ id: true });
export const selectErReportSchema = createSelectSchema(erReportsTable);

// ─── Executive Reasoning Traces (lightweight) ─────────────────────────────────

export const erTracesTable = pgTable("er_traces", {
  id:                serial("id").primaryKey(),
  traceId:           text("trace_id").notNull().unique(),
  reportId:          text("report_id").notNull(),
  recordedAt:        timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  pair:              text("pair").notNull().default("EURUSD"),
  selectedAction:    text("selected_action").notNull(),
  executiveScore:    real("executive_score").notNull(),
  confidence:        real("confidence").notNull(),
  stagesCompleted:   integer("stages_completed").notNull().default(5),
  conflictCount:     integer("conflict_count").notNull().default(0),
  safetyPassed:      boolean("safety_passed").notNull().default(false),
  durationMs:        integer("duration_ms").notNull().default(0),
  engineVersion:     text("engine_version").notNull().default("1.0.0"),
}, (t) => [
  index("er_traces_recorded_at_idx").on(t.recordedAt),
  index("er_traces_trace_id_idx").on(t.traceId),
]);

export const insertErTraceSchema = createInsertSchema(erTracesTable).omit({ id: true });
export const selectErTraceSchema = createSelectSchema(erTracesTable);

// ─── Safety Gate Audit ────────────────────────────────────────────────────────

export const erSafetyGatesTable = pgTable("er_safety_gates", {
  id:           serial("id").primaryKey(),
  reportId:     text("report_id").notNull(),
  recordedAt:   timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  gate:         text("gate").notNull(),
  passed:       boolean("passed").notNull(),
  value:        real("value").notNull(),
  threshold:    real("threshold").notNull(),
  message:      text("message").notNull(),
  severity:     text("severity").notNull().default("info"),  // info|warning|critical
}, (t) => [
  index("er_safety_gates_report_id_idx").on(t.reportId),
  index("er_safety_gates_recorded_at_idx").on(t.recordedAt),
]);

export const insertErSafetyGateSchema = createInsertSchema(erSafetyGatesTable).omit({ id: true });
export const selectErSafetyGateSchema = createSelectSchema(erSafetyGatesTable);
