// ─── Learning Scheduler ───────────────────────────────────────────────────────
// Phase 3: Defines schedule types and cycle metadata for the learning pipeline.
// The actual DB writes happen in the API route — this module defines the logic.
// NEVER overwrites previous cycles. Every run is a new append-only record.
//
// Supported schedule types: daily | weekly | monthly | manual
// Each cycle collects → validates → updates → recalculates → reports → archives.

import { randomUUID } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScheduleType = "daily" | "weekly" | "monthly" | "manual";

export interface ScheduleWindow {
  fromDate: Date;
  toDate: Date;
  label: string;
}

export interface ScheduledRun {
  runId: string;
  scheduleType: ScheduleType;
  window: ScheduleWindow;
  scheduledFor: Date;
}

// ─── Window Calculator ────────────────────────────────────────────────────────

export function computeScheduleWindow(type: ScheduleType, referenceDate: Date = new Date()): ScheduleWindow {
  const now = new Date(referenceDate);
  const toDate = new Date(now);

  switch (type) {
    case "daily": {
      const fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - 1);
      return { fromDate, toDate, label: `Daily — ${toDate.toISOString().slice(0, 10)}` };
    }
    case "weekly": {
      const fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - 7);
      return { fromDate, toDate, label: `Weekly — ${fromDate.toISOString().slice(0, 10)} to ${toDate.toISOString().slice(0, 10)}` };
    }
    case "monthly": {
      const fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - 30);
      return { fromDate, toDate, label: `Monthly — ${fromDate.toISOString().slice(0, 10)} to ${toDate.toISOString().slice(0, 10)}` };
    }
    case "manual":
    default: {
      // Full history for manual runs
      const fromDate = new Date("2020-01-01");
      return { fromDate, toDate, label: `Manual — full history to ${toDate.toISOString().slice(0, 10)}` };
    }
  }
}

// ─── Schedule Builder ─────────────────────────────────────────────────────────

export function buildScheduledRun(type: ScheduleType, scheduledFor?: Date): ScheduledRun {
  const window = computeScheduleWindow(type);
  return {
    runId: randomUUID(),
    scheduleType: type,
    window,
    scheduledFor: scheduledFor ?? new Date(),
  };
}

// ─── Next Run Calculator ──────────────────────────────────────────────────────
// Given the last completed run of a given type, returns when the next one is due.

export function nextRunDue(type: ScheduleType, lastRunAt: Date | null): Date {
  if (!lastRunAt) return new Date();

  const next = new Date(lastRunAt);
  switch (type) {
    case "daily":   next.setDate(next.getDate() + 1); break;
    case "weekly":  next.setDate(next.getDate() + 7); break;
    case "monthly": next.setDate(next.getDate() + 30); break;
    default:        return new Date(); // manual = always ready
  }
  return next;
}

// ─── Is Due? ──────────────────────────────────────────────────────────────────

export function isRunDue(type: ScheduleType, lastRunAt: Date | null): boolean {
  if (type === "manual") return true;
  if (!lastRunAt) return true;
  return new Date() >= nextRunDue(type, lastRunAt);
}

// ─── Schedule Status ──────────────────────────────────────────────────────────

export interface ScheduleStatus {
  type: ScheduleType;
  lastRunAt: Date | null;
  nextRunAt: Date;
  isDue: boolean;
  label: string;
}

export function getScheduleStatus(
  type: ScheduleType,
  lastRunAt: Date | null,
): ScheduleStatus {
  const nextRunAt = nextRunDue(type, lastRunAt);
  const isDue = isRunDue(type, lastRunAt);
  const labels: Record<ScheduleType, string> = {
    daily:   "Daily Learning Cycle",
    weekly:  "Weekly Learning Cycle",
    monthly: "Monthly Learning Cycle",
    manual:  "Manual Learning Cycle",
  };
  return { type, lastRunAt, nextRunAt, isDue, label: labels[type] };
}
