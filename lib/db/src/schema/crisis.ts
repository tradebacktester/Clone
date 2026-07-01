import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ─── Crisis Events ────────────────────────────────────────────────────────────

export const crisisEventsTable = pgTable("crisis_events", {
  id:                    text("id").primaryKey(),
  occurredAt:            timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  crisisType:            text("crisis_type").notNull(),
  severity:              text("severity").notNull(),
  overallScore:          integer("overall_score").notNull().default(0),
  survivalModeTriggered: text("survival_mode_triggered").notNull(),
  trigger:               text("trigger").notNull(),
  evidence:              jsonb("evidence").notNull().default([]),
  marketScore:           integer("market_score").notNull().default(0),
  brokerScore:           integer("broker_score").notNull().default(0),
  infrastructureScore:   integer("infrastructure_score").notNull().default(0),
  dataIntegrityScore:    integer("data_integrity_score").notNull().default(0),
  strategyScore:         integer("strategy_score").notNull().default(0),
  recommendedAction:     text("recommended_action").notNull(),
  recoveryConditions:    jsonb("recovery_conditions").notNull().default([]),
  historicalComparison:  text("historical_comparison").notNull(),
  isAdvisoryOnly:        boolean("is_advisory_only").notNull().default(true),
  fullSnapshot:          jsonb("full_snapshot"),
  resolvedAt:            timestamp("resolved_at", { withTimezone: true }),
  resolutionNotes:       text("resolution_notes"),
});

export const insertCrisisEventsSchema = createInsertSchema(crisisEventsTable).omit({ occurredAt: true });
export const selectCrisisEventsSchema = createSelectSchema(crisisEventsTable);
export type InsertCrisisEvent = typeof crisisEventsTable.$inferInsert;
export type SelectCrisisEvent = typeof crisisEventsTable.$inferSelect;

// ─── Crisis Timeline (comprehensive history) ──────────────────────────────────

export const crisisTimelineTable = pgTable("crisis_timeline", {
  id:              text("id").primaryKey(),
  recordedAt:      timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  severity:        text("severity").notNull(),
  overallScore:    integer("overall_score").notNull().default(0),
  survivalMode:    text("survival_mode").notNull(),
  previousMode:    text("previous_mode"),
  modeChangeType:  text("mode_change_type").notNull(),
  modeChanged:     boolean("mode_changed").notNull().default(false),
  dominantType:    text("dominant_type"),
  marketScore:     integer("market_score").notNull().default(0),
  brokerScore:     integer("broker_score").notNull().default(0),
  infraScore:      integer("infra_score").notNull().default(0),
  dataScore:       integer("data_score").notNull().default(0),
  strategyScore:   integer("strategy_score").notNull().default(0),
  healthScore:     integer("health_score").notNull().default(100),
  safeToTrade:     boolean("safe_to_trade").notNull().default(true),
  activeAlerts:    integer("active_alerts").notNull().default(0),
  narrative:       text("narrative"),
  engineVersion:   text("engine_version").notNull().default("1.0.0"),
});

export const insertCrisisTimelineSchema = createInsertSchema(crisisTimelineTable).omit({ recordedAt: true });
export const selectCrisisTimelineSchema = createSelectSchema(crisisTimelineTable);
export type InsertCrisisTimeline = typeof crisisTimelineTable.$inferInsert;
export type SelectCrisisTimeline = typeof crisisTimelineTable.$inferSelect;

// ─── System Health Snapshots ──────────────────────────────────────────────────

export const crisisSystemHealthTable = pgTable("crisis_system_health", {
  id:                   text("id").primaryKey(),
  checkedAt:            timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  overallHealth:        text("overall_health").notNull(),
  healthScore:          integer("health_score").notNull().default(100),
  marketHealth:         integer("market_health").notNull().default(100),
  brokerHealth:         integer("broker_health").notNull().default(100),
  infrastructureHealth: integer("infrastructure_health").notNull().default(100),
  dataIntegrityHealth:  integer("data_integrity_health").notNull().default(100),
  strategyHealth:       integer("strategy_health").notNull().default(100),
  survivalMode:         text("survival_mode").notNull(),
  severity:             text("severity").notNull(),
  // Raw context snapshots
  volatilityScore:      integer("volatility_score").notNull().default(0),
  liquidityScore:       integer("liquidity_score").notNull().default(100),
  brokerConnected:      boolean("broker_connected").notNull().default(true),
  dbResponseMs:         integer("db_response_ms").notNull().default(0),
  engineVersion:        text("engine_version").notNull().default("1.0.0"),
});

export const insertCrisisSystemHealthSchema = createInsertSchema(crisisSystemHealthTable).omit({ checkedAt: true });
export const selectCrisisSystemHealthSchema = createSelectSchema(crisisSystemHealthTable);
export type InsertCrisisSystemHealth = typeof crisisSystemHealthTable.$inferInsert;
export type SelectCrisisSystemHealth = typeof crisisSystemHealthTable.$inferSelect;

// ─── Recovery Log ─────────────────────────────────────────────────────────────

export const crisisRecoveryLogTable = pgTable("crisis_recovery_log", {
  id:                       text("id").primaryKey(),
  recordedAt:               timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  currentStage:             text("current_stage").notNull(),
  targetStage:              text("target_stage").notNull(),
  readyForNextStage:        boolean("ready_for_next_stage").notNull().default(false),
  stableInfrastructure:     boolean("stable_infrastructure").notNull().default(false),
  stableBroker:             boolean("stable_broker").notNull().default(false),
  stableMarket:             boolean("stable_market").notNull().default(false),
  sufficientConfirmation:   boolean("sufficient_confirmation").notNull().default(false),
  nextStageRequirements:    jsonb("next_stage_requirements").notNull().default([]),
  estimatedRecoveryMinutes: integer("estimated_recovery_minutes").notNull().default(0),
  stagesCompleted:          jsonb("stages_completed").notNull().default([]),
  stagesRemaining:          jsonb("stages_remaining").notNull().default([]),
  triggerEventId:           text("trigger_event_id"),
  engineVersion:            text("engine_version").notNull().default("1.0.0"),
});

export const insertCrisisRecoveryLogSchema = createInsertSchema(crisisRecoveryLogTable).omit({ recordedAt: true });
export const selectCrisisRecoveryLogSchema = createSelectSchema(crisisRecoveryLogTable);
export type InsertCrisisRecoveryLog = typeof crisisRecoveryLogTable.$inferInsert;
export type SelectCrisisRecoveryLog = typeof crisisRecoveryLogTable.$inferSelect;
