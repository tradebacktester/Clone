import {
  pgTable, serial, text, real, integer, jsonb,
  timestamp, boolean, index,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ─── Executive Missions ────────────────────────────────────────────────────────

export const epMissionsTable = pgTable("ep_missions", {
  id:                    serial("id").primaryKey(),
  missionId:             text("mission_id").notNull().unique(),
  evaluatedAt:           timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
  pair:                  text("pair").notNull().default("EURUSD"),
  timeframe:             text("timeframe").notNull().default("15m"),

  // Health
  healthScore:           real("health_score").notNull().default(0),
  healthStatus:          text("health_status").notNull().default("healthy"),
  level1Adherence:       real("level1_adherence").notNull().default(0),
  goalAchievement:       real("goal_achievement").notNull().default(0),
  conflictCount:         integer("conflict_count").notNull().default(0),
  confidence:            real("confidence").notNull().default(0),

  // Summary
  totalGoals:            integer("total_goals").notNull().default(0),
  activeGoals:           integer("active_goals").notNull().default(0),
  completedGoals:        integer("completed_goals").notNull().default(0),
  immediateAction:       text("immediate_action").notNull().default(""),

  // Intelligence snapshot
  executiveScore:        real("executive_score").notNull().default(0),
  riskScore:             real("risk_score").notNull().default(0),
  drawdownPct:           real("drawdown_pct").notNull().default(0),
  crisisStatus:          text("crisis_status").notNull().default("none"),

  // Performance
  durationMs:            integer("duration_ms").notNull().default(0),
  engineVersion:         text("engine_version").notNull().default("1.0.0"),

  // Full payload
  fullPayload:           jsonb("full_payload"),
  isAdvisoryOnly:        boolean("is_advisory_only").notNull().default(true),
}, (t) => [
  index("ep_missions_evaluated_at_idx").on(t.evaluatedAt),
  index("ep_missions_pair_idx").on(t.pair),
  index("ep_missions_health_status_idx").on(t.healthStatus),
]);

export const insertEpMissionSchema = createInsertSchema(epMissionsTable).omit({ id: true });
export const selectEpMissionSchema = createSelectSchema(epMissionsTable);

// ─── Goals (one row per goal per mission) ─────────────────────────────────────

export const epGoalsTable = pgTable("ep_goals", {
  id:              serial("id").primaryKey(),
  missionId:       text("mission_id").notNull(),
  goalId:          text("goal_id").notNull(),
  recordedAt:      timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  level:           integer("level").notNull().default(1),
  levelName:       text("level_name").notNull().default("permanent_mission"),
  category:        text("category").notNull(),
  title:           text("title").notNull(),
  priority:        real("priority").notNull().default(0),
  importance:      real("importance").notNull().default(0),
  urgency:         real("urgency").notNull().default(0),
  progress:        real("progress").notNull().default(0),
  status:          text("status").notNull().default("active"),
  confidence:      real("confidence").notNull().default(0),
  metric:          text("metric").notNull().default(""),
  target:          real("target").notNull().default(0),
  current:         real("current").notNull().default(0),
}, (t) => [
  index("ep_goals_mission_id_idx").on(t.missionId),
  index("ep_goals_recorded_at_idx").on(t.recordedAt),
  index("ep_goals_level_idx").on(t.level),
]);

export const insertEpGoalSchema = createInsertSchema(epGoalsTable).omit({ id: true });
export const selectEpGoalSchema = createSelectSchema(epGoalsTable);

// ─── Executive Plans ───────────────────────────────────────────────────────────

export const epPlansTable = pgTable("ep_plans", {
  id:            serial("id").primaryKey(),
  missionId:     text("mission_id").notNull(),
  planId:        text("plan_id").notNull().unique(),
  recordedAt:    timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  horizon:       text("horizon").notNull(),
  horizonLabel:  text("horizon_label").notNull(),
  title:         text("title").notNull(),
  summary:       text("summary").notNull().default(""),
  confidence:    real("confidence").notNull().default(0),
  actionCount:   integer("action_count").notNull().default(0),
  fullPayload:   jsonb("full_payload"),
}, (t) => [
  index("ep_plans_mission_id_idx").on(t.missionId),
  index("ep_plans_recorded_at_idx").on(t.recordedAt),
  index("ep_plans_horizon_idx").on(t.horizon),
]);

export const insertEpPlanSchema = createInsertSchema(epPlansTable).omit({ id: true });
export const selectEpPlanSchema = createSelectSchema(epPlansTable);

// ─── Mission Timeline ─────────────────────────────────────────────────────────

export const epTimelineTable = pgTable("ep_timeline", {
  id:              serial("id").primaryKey(),
  missionId:       text("mission_id").notNull(),
  recordedAt:      timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  pair:            text("pair").notNull().default("EURUSD"),
  healthScore:     real("health_score").notNull().default(0),
  healthStatus:    text("health_status").notNull().default("healthy"),
  confidence:      real("confidence").notNull().default(0),
  activeGoals:     integer("active_goals").notNull().default(0),
  conflictCount:   integer("conflict_count").notNull().default(0),
  immediateAction: text("immediate_action").notNull().default(""),
  engineVersion:   text("engine_version").notNull().default("1.0.0"),
}, (t) => [
  index("ep_timeline_recorded_at_idx").on(t.recordedAt),
  index("ep_timeline_pair_idx").on(t.pair),
]);

export const insertEpTimelineSchema = createInsertSchema(epTimelineTable).omit({ id: true });
export const selectEpTimelineSchema = createSelectSchema(epTimelineTable);
