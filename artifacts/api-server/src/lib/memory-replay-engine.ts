/**
 * Memory Replay Engine
 *
 * Reconstructs a complete trading experience as a step-by-step timeline.
 * Allows step-by-step replay of the full trade lifecycle:
 *
 *   Market → Snapshot → Setup → Context → Screenshots
 *   → Decision → Trade → Management → Exit → Review → Lessons
 *
 * Sessions are stored in-process (Map with TTL) — no DB required.
 * Each step represents one event or phase in the trade lifecycle.
 * Replay filters: pair, date range, session, outcome, strategy version.
 */

import { db } from "@workspace/db";
import {
  memoryExperiencesTable,
  tradeEventsTable,
  tradeScreenshotsTable,
  tradeContextTable,
  contextTimelineEventsTable,
  setupMemoryTable,
  marketSnapshotMemoryTable,
  tradeReviewsTable,
} from "@workspace/db";
import { eq, and, gte, lte, inArray, isNotNull, desc, asc, sql } from "drizzle-orm";
import { logger } from "./logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReplayStepType =
  | "market_scan"
  | "snapshot"
  | "setup_evaluation"
  | "context_capture"
  | "screenshot"
  | "decision"
  | "trade_open"
  | "trade_management"
  | "trade_exit"
  | "review"
  | "lesson"
  | "timeline_event";

export interface ReplayStep {
  stepIndex:   number;
  type:        ReplayStepType;
  timestamp:   Date;
  title:       string;
  description: string;
  data:        Record<string, unknown>;
  hasVisual:   boolean;
  visualRef?:  string;  // screenshot ID
  phase:       "pre_trade" | "in_trade" | "post_trade";
}

export interface ReplaySession {
  sessionId:       string;
  tradeId:         number;
  experienceId:    string;
  pair:            string;
  direction:       string;
  outcome:         string | null;
  totalSteps:      number;
  currentStep:     number;
  status:          "active" | "paused" | "completed" | "error";
  playbackSpeed:   number;
  steps:           ReplayStep[];
  metadata: {
    openedAt:        Date | null;
    closedAt:        Date | null;
    durationMins:    number | null;
    pnlPips:         number | null;
    riskReward:      number | null;
    setupId:         string | null;
    snapshotId:      string | null;
    strategyVersion: string | null;
  };
  createdAt:       Date;
  lastAccessedAt:  Date;
  expiresAt:       Date;
}

export interface ReplayFilter {
  pair?:            string;
  session?:         string;
  outcome?:         string;
  strategyVersion?: string;
  dateFrom?:        Date;
  dateTo?:          Date;
  hasScreenshots?:  boolean;
  hasLessons?:      boolean;
  limit?:           number;
  offset?:          number;
}

export interface ReplaySearchResult {
  tradeId:     number;
  experienceId: string;
  pair:        string;
  direction:   string;
  session:     string | null;
  outcome:     string | null;
  openedAt:    Date | null;
  closedAt:    Date | null;
  durationMins: number | null;
  pnlPips:     number | null;
  riskReward:  number | null;
  screenshotCount: number;
  eventCount:  number;
  hasContext:  boolean;
  hasLessons:  boolean;
  strategyVersion: string | null;
}

// ─── Session Store ────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const sessions = new Map<string, ReplaySession>();

function cleanExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt.getTime() < now) {
      sessions.delete(id);
    }
  }
}

// ─── Step Builders ────────────────────────────────────────────────────────────

function buildPhase(step: number, total: number): ReplayStep["phase"] {
  const ratio = step / total;
  if (ratio < 0.3) return "pre_trade";
  if (ratio > 0.7) return "post_trade";
  return "in_trade";
}

function buildSnapshotStep(snap: Record<string, unknown>, index: number): ReplayStep {
  return {
    stepIndex:   index,
    type:        "snapshot",
    timestamp:   new Date(snap.captured_at as string ?? snap.createdAt as string ?? Date.now()),
    title:       `Market Snapshot — ${snap.pair ?? "Unknown"}`,
    description: `${snap.market_regime ?? "Unknown"} regime at ${snap.timeframe ?? "—"} | ATR: ${snap.atr ?? "—"} | Trend Strength: ${snap.trend_strength ?? "—"}`,
    data:        snap,
    hasVisual:   false,
    phase:       "pre_trade",
  };
}

function buildSetupStep(setup: Record<string, unknown>, index: number): ReplayStep {
  const accepted = setup.is_accepted ? "ACCEPTED" : "EVALUATED";
  return {
    stepIndex:   index,
    type:        "setup_evaluation",
    timestamp:   new Date(setup.evaluated_at as string ?? Date.now()),
    title:       `Setup ${accepted} — ${setup.pair ?? ""} ${String(setup.direction ?? "").toUpperCase()}`,
    description: `Zone: ${setup.zone_score ?? 0} | AMD: ${setup.amd_score ?? 0} | Liquidity: ${setup.liquidity_score ?? 0} | Confidence: ${setup.confidence ?? 0}% | RR: ${setup.risk_reward ?? "—"}`,
    data:        setup,
    hasVisual:   false,
    phase:       "pre_trade",
  };
}

function buildContextStep(ctx: Record<string, unknown>, index: number): ReplayStep {
  return {
    stepIndex:   index,
    type:        "context_capture",
    timestamp:   new Date(ctx.created_at as string ?? Date.now()),
    title:       "Context Captured",
    description: `Market: ${ctx.market_regime ?? "—"} | Session: ${ctx.session ?? "—"} | HTF Bias: ${ctx.htf_bias ?? "—"} | AMD: ${ctx.amd_stage ?? "—"}`,
    data:        ctx,
    hasVisual:   false,
    phase:       "pre_trade",
  };
}

function buildEventStep(event: Record<string, unknown>, index: number): ReplayStep {
  const eventType = String(event.event_type ?? "unknown");
  const phaseMap: Record<string, ReplayStep["phase"]> = {
    opened:       "in_trade",
    break_even:   "in_trade",
    partial_close:"in_trade",
    trailing_stop:"in_trade",
    sl_updated:   "in_trade",
    tp_updated:   "in_trade",
    price_update: "in_trade",
    closed:       "post_trade",
    manual_close: "post_trade",
  };

  const typeMap: Record<string, ReplayStepType> = {
    opened:       "trade_open",
    closed:       "trade_exit",
    manual_close: "trade_exit",
    break_even:   "trade_management",
    partial_close:"trade_management",
    trailing_stop:"trade_management",
    sl_updated:   "trade_management",
    tp_updated:   "trade_management",
    price_update: "trade_management",
  };

  const titles: Record<string, string> = {
    opened:       `Trade Opened @ ${event.price ?? "—"}`,
    closed:       `Trade Closed — ${String(event.outcome ?? "").toUpperCase()} | PnL: ${event.pnl ?? "—"}`,
    manual_close: `Trade Manually Closed @ ${event.price ?? "—"}`,
    break_even:   `Break Even Set @ ${event.stop_loss ?? "—"}`,
    partial_close:`Partial Close @ ${event.price ?? "—"}`,
    trailing_stop:`Trailing Stop Moved to ${event.stop_loss ?? "—"}`,
    sl_updated:   `Stop Loss Updated → ${event.stop_loss ?? "—"}`,
    tp_updated:   `Take Profit Updated → ${event.take_profit ?? "—"}`,
    price_update: `Price Update: ${event.price ?? "—"}`,
  };

  return {
    stepIndex:   index,
    type:        typeMap[eventType] ?? "trade_management",
    timestamp:   new Date(event.occurred_at as string ?? Date.now()),
    title:       titles[eventType] ?? `Event: ${eventType}`,
    description: `Price: ${event.price ?? "—"} | SL: ${event.stop_loss ?? "—"} | TP: ${event.take_profit ?? "—"} | ${event.close_reason ? `Reason: ${event.close_reason}` : ""}`,
    data:        event,
    hasVisual:   false,
    phase:       phaseMap[eventType] ?? "in_trade",
  };
}

function buildScreenshotStep(shot: Record<string, unknown>, index: number): ReplayStep {
  const stage = String(shot.stage ?? "custom");
  const phaseMap: Record<string, ReplayStep["phase"]> = {
    before_entry: "pre_trade",
    entry:        "in_trade",
    htf_analysis: "pre_trade",
    ltf_analysis: "pre_trade",
    during_trade: "in_trade",
    break_even:   "in_trade",
    partial_tp:   "in_trade",
    after_exit:   "post_trade",
    custom:       "in_trade",
  };

  return {
    stepIndex:   index,
    type:        "screenshot",
    timestamp:   new Date(shot.captured_at as string ?? shot.uploaded_at as string ?? Date.now()),
    title:       `Screenshot — ${stage.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}`,
    description: `Timeframe: ${shot.timeframe ?? "—"} | Pair: ${shot.pair ?? "—"}${shot.notes ? ` | Notes: ${shot.notes}` : ""}`,
    data:        { ...shot, imageData: undefined, thumbnailData: undefined },
    hasVisual:   true,
    visualRef:   String(shot.id),
    phase:       phaseMap[stage] ?? "in_trade",
  };
}

function buildReviewStep(review: Record<string, unknown>, index: number): ReplayStep {
  return {
    stepIndex:   index,
    type:        "review",
    timestamp:   new Date(review.created_at as string ?? Date.now()),
    title:       "Post-Trade Review",
    description: `${review.lessons_learned ? `Lessons: ${String(review.lessons_learned).slice(0, 100)}` : "Review recorded"}`,
    data:        review,
    hasVisual:   false,
    phase:       "post_trade",
  };
}

function buildTimelineEventStep(evt: Record<string, unknown>, index: number): ReplayStep {
  return {
    stepIndex:   index,
    type:        "timeline_event",
    timestamp:   new Date(evt.occurred_at as string ?? Date.now()),
    title:       String(evt.title ?? "Timeline Event"),
    description: String(evt.description ?? ""),
    data:        evt,
    hasVisual:   false,
    phase:       "in_trade",
  };
}

// ─── Assemble Replay Steps ────────────────────────────────────────────────────

async function assembleSteps(tradeId: number): Promise<{
  steps: ReplayStep[];
  metadata: ReplaySession["metadata"];
}> {
  const [
    experience,
    events,
    screenshots,
    contexts,
    timelineEvents,
    reviews,
  ] = await Promise.all([
    db.select().from(memoryExperiencesTable).where(eq(memoryExperiencesTable.tradeId, tradeId)).limit(1),
    db.select().from(tradeEventsTable).where(eq(tradeEventsTable.tradeId, tradeId)).orderBy(asc(tradeEventsTable.occurredAt)),
    db.select().from(tradeScreenshotsTable).where(eq(tradeScreenshotsTable.tradeId, tradeId)).orderBy(asc(tradeScreenshotsTable.uploadedAt)),
    db.select().from(tradeContextTable).where(eq(tradeContextTable.tradeId, tradeId)).limit(1),
    db.execute(sql`SELECT * FROM context_timeline_events WHERE trade_id = ${tradeId} ORDER BY occurred_at ASC`),
    db.select().from(tradeReviewsTable).where(eq(tradeReviewsTable.tradeId, tradeId)).limit(1),
  ]);

  const exp = experience[0];
  const ctx = contexts[0];

  // Fetch snapshot if linked
  let snapshot: Record<string, unknown> | null = null;
  if (exp?.snapshotId) {
    try {
      const [snap] = await db.select().from(marketSnapshotMemoryTable).where(eq(marketSnapshotMemoryTable.id, exp.snapshotId)).limit(1);
      snapshot = snap as unknown as Record<string, unknown> ?? null;
    } catch {}
  }

  // Fetch setup if linked
  let setup: Record<string, unknown> | null = null;
  if (exp?.setupId) {
    try {
      const [s] = await db.select().from(setupMemoryTable).where(eq(setupMemoryTable.id, exp.setupId)).limit(1);
      setup = s as unknown as Record<string, unknown> ?? null;
    } catch {}
  }

  // Build raw steps array (unordered)
  const rawSteps: Array<{ ts: Date; buildFn: (idx: number) => ReplayStep }> = [];

  if (snapshot) {
    const ts = new Date((snapshot.captured_at as string) ?? Date.now());
    rawSteps.push({ ts, buildFn: (i) => buildSnapshotStep(snapshot!, i) });
  }

  if (setup) {
    const ts = new Date((setup.evaluated_at as string) ?? Date.now());
    rawSteps.push({ ts, buildFn: (i) => buildSetupStep(setup!, i) });
  }

  if (ctx) {
    rawSteps.push({ ts: new Date(ctx.createdAt), buildFn: (i) => buildContextStep(ctx as unknown as Record<string, unknown>, i) });
  }

  for (const event of events) {
    rawSteps.push({ ts: new Date(event.occurredAt), buildFn: (i) => buildEventStep(event as unknown as Record<string, unknown>, i) });
  }

  for (const shot of screenshots) {
    const ts = new Date(shot.capturedAt ?? shot.uploadedAt);
    rawSteps.push({ ts, buildFn: (i) => buildScreenshotStep(shot as unknown as Record<string, unknown>, i) });
  }

  for (const tevt of (timelineEvents.rows as Record<string, unknown>[])) {
    const ts = new Date(tevt.occurred_at as string ?? Date.now());
    rawSteps.push({ ts, buildFn: (i) => buildTimelineEventStep(tevt, i) });
  }

  if (reviews[0]) {
    rawSteps.push({ ts: new Date(reviews[0].createdAt), buildFn: (i) => buildReviewStep(reviews[0] as unknown as Record<string, unknown>, i) });
  }

  // Sort by timestamp, assign sequential indices
  rawSteps.sort((a, b) => a.ts.getTime() - b.ts.getTime());
  const steps = rawSteps.map(({ buildFn }, idx) => buildFn(idx));

  // Fix phase based on final step count
  const total = steps.length;
  steps.forEach((s, i) => { s.phase = buildPhase(i, total); });

  const metadata: ReplaySession["metadata"] = {
    openedAt:        exp?.tradeOpenedAt ?? null,
    closedAt:        exp?.tradeClosedAt ?? null,
    durationMins:    exp?.durationMins  ?? null,
    pnlPips:         exp?.pnlPips       ? parseFloat(String(exp.pnlPips)) : null,
    riskReward:      exp?.riskReward    ? parseFloat(String(exp.riskReward)) : null,
    setupId:         exp?.setupId       ?? null,
    snapshotId:      exp?.snapshotId    ?? null,
    strategyVersion: exp?.strategyVersion ?? null,
  };

  return { steps, metadata };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Search for replayable trade experiences with filters.
 */
export async function searchReplayableExperiences(filter: ReplayFilter = {}): Promise<{
  total: number;
  results: ReplaySearchResult[];
}> {
  const conditions = [];

  if (filter.pair)            conditions.push(eq(memoryExperiencesTable.pair, filter.pair.toUpperCase()));
  if (filter.session)         conditions.push(eq(memoryExperiencesTable.session, filter.session.toLowerCase()));
  if (filter.outcome)         conditions.push(eq(memoryExperiencesTable.outcome, filter.outcome));
  if (filter.strategyVersion) conditions.push(eq(memoryExperiencesTable.strategyVersion, filter.strategyVersion));
  if (filter.hasScreenshots !== undefined) conditions.push(eq(memoryExperiencesTable.hasScreenshots, filter.hasScreenshots));
  if (filter.hasLessons !== undefined)     conditions.push(eq(memoryExperiencesTable.hasLessons, filter.hasLessons));
  if (filter.dateFrom)        conditions.push(gte(memoryExperiencesTable.tradeOpenedAt, filter.dateFrom));
  if (filter.dateTo)          conditions.push(lte(memoryExperiencesTable.tradeOpenedAt, filter.dateTo));

  conditions.push(isNotNull(memoryExperiencesTable.tradeId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.select().from(memoryExperiencesTable)
      .where(whereClause)
      .orderBy(desc(memoryExperiencesTable.tradeOpenedAt))
      .limit(filter.limit ?? 50)
      .offset(filter.offset ?? 0),
    db.select({ c: sql<number>`count(*)` }).from(memoryExperiencesTable).where(whereClause),
  ]);

  const total = Number(countResult[0]?.c ?? 0);

  const results: ReplaySearchResult[] = rows.map(r => ({
    tradeId:         r.tradeId!,
    experienceId:    r.experienceId,
    pair:            r.pair ?? "Unknown",
    direction:       r.direction ?? "unknown",
    session:         r.session,
    outcome:         r.outcome,
    openedAt:        r.tradeOpenedAt,
    closedAt:        r.tradeClosedAt,
    durationMins:    r.durationMins,
    pnlPips:         r.pnlPips ? parseFloat(String(r.pnlPips)) : null,
    riskReward:      r.riskReward ? parseFloat(String(r.riskReward)) : null,
    screenshotCount: r.screenshotCount ?? 0,
    eventCount:      r.eventCount ?? 0,
    hasContext:      r.hasContext ?? false,
    hasLessons:      r.hasLessons ?? false,
    strategyVersion: r.strategyVersion,
  }));

  return { total, results };
}

/**
 * Start a new replay session for a specific trade.
 */
export async function startReplaySession(tradeId: number, opts: {
  playbackSpeed?: number;
} = {}): Promise<ReplaySession> {
  cleanExpiredSessions();

  // Find the experience
  const [exp] = await db
    .select()
    .from(memoryExperiencesTable)
    .where(eq(memoryExperiencesTable.tradeId, tradeId))
    .limit(1);

  if (!exp) {
    throw new Error(`No experience record found for trade ${tradeId}`);
  }

  const { steps, metadata } = await assembleSteps(tradeId);

  if (steps.length === 0) {
    throw new Error(`No replayable data found for trade ${tradeId}`);
  }

  const now = new Date();
  const session: ReplaySession = {
    sessionId:     crypto.randomUUID(),
    tradeId,
    experienceId:  exp.experienceId,
    pair:          exp.pair ?? "Unknown",
    direction:     exp.direction ?? "unknown",
    outcome:       exp.outcome,
    totalSteps:    steps.length,
    currentStep:   0,
    status:        "active",
    playbackSpeed: Math.min(Math.max(opts.playbackSpeed ?? 1, 0.25), 10),
    steps,
    metadata,
    createdAt:     now,
    lastAccessedAt: now,
    expiresAt:     new Date(now.getTime() + SESSION_TTL_MS),
  };

  sessions.set(session.sessionId, session);
  logger.info({ sessionId: session.sessionId, tradeId, steps: steps.length }, "[MRE] Replay session started");

  return session;
}

/**
 * Get the current state of a replay session (without full step data).
 */
export function getReplaySession(sessionId: string): ReplaySession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  session.lastAccessedAt = new Date();
  session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  return session;
}

/**
 * Get the current step data.
 */
export function getCurrentStep(sessionId: string): ReplayStep | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  return session.steps[session.currentStep] ?? null;
}

/**
 * Advance one step forward.
 */
export function stepForward(sessionId: string): { step: ReplayStep | null; completed: boolean } {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status === "paused") throw new Error("Session is paused — resume first");

  if (session.currentStep >= session.totalSteps - 1) {
    session.status = "completed";
    return { step: null, completed: true };
  }

  session.currentStep++;
  session.lastAccessedAt = new Date();
  session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  return {
    step: session.steps[session.currentStep] ?? null,
    completed: session.currentStep >= session.totalSteps - 1,
  };
}

/**
 * Step backward.
 */
export function stepBackward(sessionId: string): { step: ReplayStep | null } {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");

  if (session.currentStep > 0) {
    session.currentStep--;
  }

  session.lastAccessedAt = new Date();
  return { step: session.steps[session.currentStep] ?? null };
}

/**
 * Seek to a specific step index.
 */
export function seekToStep(sessionId: string, stepIndex: number): { step: ReplayStep | null } {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");

  const target = Math.min(Math.max(0, stepIndex), session.totalSteps - 1);
  session.currentStep = target;
  session.status = "active";
  session.lastAccessedAt = new Date();

  return { step: session.steps[target] ?? null };
}

/**
 * Pause the session.
 */
export function pauseSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  session.status = "paused";
}

/**
 * Resume the session.
 */
export function resumeSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status === "completed") throw new Error("Session is completed");
  session.status = "active";
}

/**
 * Set playback speed.
 */
export function setPlaybackSpeed(sessionId: string, speed: number): void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  session.playbackSpeed = Math.min(Math.max(speed, 0.25), 10);
}

/**
 * End a session and free memory.
 */
export function endReplaySession(sessionId: string): void {
  sessions.delete(sessionId);
}

/**
 * Get active sessions summary (for monitoring).
 */
export function getActiveSessions(): Array<{
  sessionId: string;
  tradeId: number;
  pair: string;
  status: string;
  currentStep: number;
  totalSteps: number;
  createdAt: Date;
}> {
  cleanExpiredSessions();
  return Array.from(sessions.values()).map(s => ({
    sessionId:   s.sessionId,
    tradeId:     s.tradeId,
    pair:        s.pair,
    status:      s.status,
    currentStep: s.currentStep,
    totalSteps:  s.totalSteps,
    createdAt:   s.createdAt,
  }));
}
