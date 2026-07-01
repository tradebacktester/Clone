// ─── Capital Protection & Survival Engine — DB Schema ─────────────────────────
// Advisory only. Logs protection events, actions, and config.
// NEVER modifies strategy, entry/exit logic, or learning models.

import { pgTable, serial, text, numeric, integer, boolean, timestamp, jsonb, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// ─── Protection Reports (full snapshots) ──────────────────────────────────────

export const cpReportsTable = pgTable("cp_reports", {
  id:            serial("id").primaryKey(),
  reportId:      uuid("report_id").notNull().unique().defaultRandom(),
  engineVersion: text("engine_version").notNull().default("1.0.0"),
  evaluatedAt:   timestamp("evaluated_at").notNull().defaultNow(),
  isAdvisoryOnly: boolean("is_advisory_only").notNull().default(true),

  // Overall protection state
  protectionLevel:      text("protection_level").notNull(),
  protectionLevelLabel: text("protection_level_label").notNull(),
  protectionLevelScore: integer("protection_level_score").notNull().default(0),

  // Active action count
  activeActionCount: integer("active_action_count").notNull().default(0),
  activeActions:     jsonb("active_actions"),

  // Monitor summaries (severity + healthScore)
  accountSeverity:         text("account_severity"),
  accountHealthScore:      numeric("account_health_score"),
  accountDailyLossPct:     numeric("account_daily_loss_pct"),
  accountWeeklyLossPct:    numeric("account_weekly_loss_pct"),
  accountMonthlyLossPct:   numeric("account_monthly_loss_pct"),
  accountEquityDdPct:      numeric("account_equity_dd_pct"),

  consecutiveLossSeverity: text("consecutive_loss_severity"),
  consecutiveLossCount:    integer("consecutive_loss_count"),
  consecutiveLossHealth:   numeric("consecutive_loss_health"),

  drawdownSeverity:        text("drawdown_severity"),
  drawdownCurrentPct:      numeric("drawdown_current_pct"),
  drawdownMaxPct:          numeric("drawdown_max_pct"),
  drawdownHealthScore:     numeric("drawdown_health_score"),
  drawdownVelocity:        numeric("drawdown_velocity"),

  exposureSeverity:        text("exposure_severity"),
  exposureTotalRiskPct:    numeric("exposure_total_risk_pct"),
  exposureHealthScore:     numeric("exposure_health_score"),

  marginSeverity:          text("margin_severity"),
  marginLevel:             numeric("margin_level"),
  marginHealthScore:       numeric("margin_health_score"),
  marginCallRisk:          numeric("margin_call_risk"),

  brokerSeverity:          text("broker_severity"),
  brokerSpreadRatio:       numeric("broker_spread_ratio"),
  brokerHealthScore:       numeric("broker_health_score"),

  systemSeverity:          text("system_severity"),
  systemHealthScore:       numeric("system_health_score"),
  systemCriticalFailures:  integer("system_critical_failures"),

  // Recovery state
  recoveryInProgress:    boolean("recovery_in_progress").default(false),
  recoveryProgressPct:   integer("recovery_progress_pct").default(0),
  hoursAtCurrentLevel:   numeric("hours_at_current_level").default("0"),

  // Input context
  balance:      numeric("balance"),
  equity:       numeric("equity"),
  pair:         text("pair"),
  openPositions: integer("open_positions").default(0),

  // Full objects (JSONB)
  fullReport:     jsonb("full_report"),
  explainability: jsonb("explainability"),
});

// ─── Protection Actions Log ───────────────────────────────────────────────────

export const cpActionsTable = pgTable("cp_actions", {
  id:              serial("id").primaryKey(),
  actionId:        uuid("action_id").notNull().unique().defaultRandom(),
  reportId:        text("report_id"),
  actionType:      text("action_type").notNull(),
  label:           text("label").notNull(),
  severity:        text("severity").notNull(),
  trigger:         text("trigger").notNull(),
  thresholdCrossed: text("threshold_crossed"),
  evidence:        jsonb("evidence"),
  appliedAt:       timestamp("applied_at").notNull().defaultNow(),
  expectedBenefit: text("expected_benefit"),
  parameterChange: jsonb("parameter_change"),
  isReversible:    boolean("is_reversible").notNull().default(true),
  recoveryRequirements: jsonb("recovery_requirements"),
});

// ─── Protection Config (user-configurable thresholds) ─────────────────────────

export const cpConfigTable = pgTable("cp_config", {
  id:        serial("id").primaryKey(),
  configId:  uuid("config_id").notNull().unique().defaultRandom(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by").default("system"),
  isActive:  boolean("is_active").notNull().default(true),

  // All thresholds stored as JSONB for flexibility
  config: jsonb("config").notNull(),

  // Validation status
  isValid:  boolean("is_valid").notNull().default(true),
  errors:   jsonb("errors"),
  warnings: jsonb("warnings"),

  // Audit
  previousConfig: jsonb("previous_config"),
  changeReason:   text("change_reason"),
});

// ─── Protection Level Events (level change history) ───────────────────────────

export const cpEventsTable = pgTable("cp_events", {
  id:            serial("id").primaryKey(),
  eventId:       uuid("event_id").notNull().unique().defaultRandom(),
  occurredAt:    timestamp("occurred_at").notNull().defaultNow(),
  eventType:     text("event_type").notNull(),               // "escalation" | "de-escalation" | "action" | "recovery"

  fromLevel:     text("from_level"),
  toLevel:       text("to_level"),
  trigger:       text("trigger"),
  evidence:      jsonb("evidence"),
  activeActions: jsonb("active_actions"),
  autoResolved:  boolean("auto_resolved").default(false),

  // Context at time of event
  balance:           numeric("balance"),
  drawdownPct:       numeric("drawdown_pct"),
  consecutiveLosses: integer("consecutive_losses"),
});

// ─── Drizzle-Zod schemas ──────────────────────────────────────────────────────

export const insertCpReportSchema = createInsertSchema(cpReportsTable).omit({ id: true, reportId: true });
export const insertCpActionSchema = createInsertSchema(cpActionsTable).omit({ id: true, actionId: true });
export const insertCpConfigSchema = createInsertSchema(cpConfigTable).omit({ id: true, configId: true });
export const insertCpEventSchema  = createInsertSchema(cpEventsTable).omit({ id: true, eventId: true });
