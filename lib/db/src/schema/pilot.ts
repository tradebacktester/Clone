import { pgTable, serial, text, numeric, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Pilot Mode Config ─────────────────────────────────────────────────────
// Singleton row. Pilot Mode = live broker, hard-capped 0.25–0.5% risk, manual confirm.
// Completely separate from paper mode. Cannot coexist with live mode.

export const pilotConfigTable = pgTable("pilot_config", {
  id:                    serial("id").primaryKey(),

  enabled:               boolean("enabled").notNull().default(false),
  brokerAccountId:       integer("broker_account_id"),     // FK to broker_accounts

  // Risk constraints (hard limits, cannot be overridden)
  maxRiskPerTradePct:    numeric("max_risk_pct",           { precision: 5, scale: 3 }).notNull().default("0.25"),
  maxDailyLossPct:       numeric("max_daily_loss_pct",     { precision: 5, scale: 2 }).notNull().default("1.0"),
  maxWeeklyLossPct:      numeric("max_weekly_loss_pct",    { precision: 5, scale: 2 }).notNull().default("2.0"),
  maxOpenTrades:         integer("max_open_trades").notNull().default(1),

  // Safety features
  manualConfirmRequired: boolean("manual_confirm").notNull().default(true),
  shutdownOnNConsecLosses: integer("shutdown_consec_losses").notNull().default(3),
  requireCertification:  boolean("require_cert").notNull().default(true),   // must pass certification first

  // State tracking
  consecLosses:          integer("consec_losses").notNull().default(0),
  halted:                boolean("halted").notNull().default(false),
  haltReason:            text("halt_reason"),
  startedAt:             timestamp("started_at",    { withTimezone: true }),
  stoppedAt:             timestamp("stopped_at",    { withTimezone: true }),
  totalTrades:           integer("total_trades").notNull().default(0),
  totalPnl:              numeric("total_pnl",       { precision: 18, scale: 4 }).notNull().default("0"),

  updatedAt:             timestamp("updated_at",    { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPilotConfigSchema = createInsertSchema(pilotConfigTable).omit({ id: true, updatedAt: true });
export type InsertPilotConfig = z.infer<typeof insertPilotConfigSchema>;
export type PilotConfig = typeof pilotConfigTable.$inferSelect;

// ─── Pilot Mode Events ─────────────────────────────────────────────────────
// Comprehensive audit log for every action taken in Pilot Mode.

export const pilotEventsTable = pgTable("pilot_events", {
  id:          serial("id").primaryKey(),
  eventType:   text("event_type").notNull(),
  // 'started'|'stopped'|'halted'|'trade_opened'|'trade_closed'|'manual_confirm_requested'|
  // 'manual_confirm_approved'|'manual_confirm_rejected'|'risk_limit_hit'|'consec_loss_halt'

  pair:        text("pair"),
  direction:   text("direction"),
  tradeId:     integer("trade_id"),
  pnl:         numeric("pnl",         { precision: 18, scale: 4 }),
  riskPct:     numeric("risk_pct",    { precision: 5, scale: 3 }),
  notes:       text("notes"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPilotEventSchema = createInsertSchema(pilotEventsTable).omit({ id: true, createdAt: true });
export type InsertPilotEvent = z.infer<typeof insertPilotEventSchema>;
export type PilotEvent = typeof pilotEventsTable.$inferSelect;
