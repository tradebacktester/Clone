/**
 * Memory Capture Engine — Automatic Episodic Memory for KRYTOS
 *
 * Automatically intercepts every meaningful trading lifecycle event and
 * persists it as a permanent, linked memory record. No manual calls required.
 *
 * Event chain:
 *   Market Scan → Market Snapshot
 *   Signal Detected → Setup Memory (isAccepted=false initially)
 *   Signal Rejected → Skipped Setup Memory + mark Setup rejected
 *   Trade Opened → Trade Event (type="opened") + link Setup to Trade
 *   Trade Monitoring → Excursion tracker (MFE/MAE)
 *   Trade Closed → Trade Event (type="closed") + MFE/MAE + outcome
 */

import { db } from "@workspace/db";
import {
  marketSnapshotMemoryTable,
  setupMemoryTable,
  skippedSetupMemoryTable,
  tradeEventsTable,
} from "@workspace/db";
import { eq, and, isNull, lt } from "drizzle-orm";
import { logger } from "./logger.js";
import type { TradeSignal, AnalysisResult, Pair } from "@workspace/market-analysis";

// ─── Constants ────────────────────────────────────────────────────────────────

const STRATEGY_VERSION = "2.0";
const SOURCE_MODULE    = "memory-capture-engine";

// ─── Excursion Tracker ────────────────────────────────────────────────────────
// Tracks Maximum Favorable Excursion (MFE) and Maximum Adverse Excursion (MAE)
// in-memory per open trade. Written to DB when trade closes.

interface ExcursionState {
  mfePips: number;
  maePips: number;
  entryPrice: number;
  direction: string;
  pair: string;
  openedAt: Date;
}

const excursionTracker = new Map<number, ExcursionState>();

function getPipSize(pair: string): number {
  return pair.includes("JPY") ? 0.01 : 0.0001;
}

function calcSession(): "london" | "newyork" | "asian" {
  const hour = new Date().getUTCHours();
  if (hour >= 7 && hour < 16) return "london";
  if (hour >= 12 && hour < 21) return "newyork";
  return "asian";
}

// ─── Excursion Tracking ───────────────────────────────────────────────────────

/**
 * Called every monitoring tick for each open trade.
 * Updates in-memory MFE/MAE trackers without any DB I/O.
 */
export function updateExcursionTracker(
  tradeId: number,
  currentMidPrice: number,
  entryPrice: number,
  direction: string,
  pair: string,
): void {
  const pipSize = getPipSize(pair);

  const favorableDiff = direction === "buy"
    ? currentMidPrice - entryPrice
    : entryPrice - currentMidPrice;

  const adverseDiff = direction === "buy"
    ? entryPrice - currentMidPrice
    : currentMidPrice - entryPrice;

  const currentFavorablePips = Math.max(0, favorableDiff / pipSize);
  const currentAdversePips   = Math.max(0, adverseDiff   / pipSize);

  const existing = excursionTracker.get(tradeId);

  if (!existing) {
    excursionTracker.set(tradeId, {
      mfePips:    currentFavorablePips,
      maePips:    currentAdversePips,
      entryPrice,
      direction,
      pair,
      openedAt:   new Date(),
    });
  } else {
    existing.mfePips = Math.max(existing.mfePips, currentFavorablePips);
    existing.maePips = Math.max(existing.maePips, currentAdversePips);
  }
}

/** Remove a trade from the excursion tracker (after close event written). */
export function clearExcursionTracker(tradeId: number): void {
  excursionTracker.delete(tradeId);
}

/** Seed the tracker from DB on restart (so no MFE/MAE data is lost across restarts). */
export function seedExcursionTracker(
  tradeId: number,
  entryPrice: number,
  direction: string,
  pair: string,
  openedAt: Date,
): void {
  if (!excursionTracker.has(tradeId)) {
    excursionTracker.set(tradeId, { mfePips: 0, maePips: 0, entryPrice, direction, pair, openedAt });
  }
}

// ─── Market Snapshot Capture ──────────────────────────────────────────────────

/**
 * Called by the analyzer after every 4h analysis run per pair.
 * Creates a permanent market snapshot for that moment.
 *
 * @returns snapshotId UUID, or null on failure (never throws)
 */
export async function captureMarketSnapshot(
  pair: Pair,
  result: AnalysisResult,
  newsStatus: string = "clear",
): Promise<string | null> {
  try {
    const session = calcSession();
    const regime  = result.regime;
    const zones   = result.zones ?? [];
    const signals = result.signals ?? [];

    const supplyZones = zones.filter(z => z.zoneType === "supply");
    const demandZones = zones.filter(z => z.zoneType === "demand");

    // Summarise zones into high/low liquidity reference levels
    const demandHighs  = demandZones.map(z => z.priceTop);
    const supplyLows   = supplyZones.map(z => z.priceBottom);
    const liquidityAbove = supplyLows.length  > 0 ? Math.min(...supplyLows)  : null;
    const liquidityBelow = demandHighs.length > 0 ? Math.max(...demandHighs) : null;

    const [inserted] = await db
      .insert(marketSnapshotMemoryTable)
      .values({
        pair,
        session,
        strategyVersion: STRATEGY_VERSION,
        capturedAt:      new Date(),

        // Zone summary
        supplyZoneCount:   supplyZones.length,
        demandZoneCount:   demandZones.length,
        activeSignalCount: signals.length,

        liquidityAbove: liquidityAbove != null ? String(liquidityAbove) : null,
        liquidityBelow: liquidityBelow != null ? String(liquidityBelow) : null,

        // Regime data
        regime:           regime.regime,
        regimeConfidence: String(regime.regimeConfidence),
        trend:            regime.trend,
        volatility:       regime.volatility,

        // News
        newsStatus,
        highImpactWithin1h: newsStatus === "high_impact",

        // Timeframe analysis objects — store each TF's top-level result
        tf4h: {
          zones:   zones.length,
          signals: signals.length,
          regime:  regime.regime,
          trend:   regime.trend,
        },
      })
      .returning({ id: marketSnapshotMemoryTable.id });

    const snapshotId = inserted?.id ?? null;
    logger.debug({ pair, snapshotId }, "[MCE] Market snapshot captured");
    return snapshotId;
  } catch (err) {
    logger.warn({ err, pair }, "[MCE] Failed to capture market snapshot");
    return null;
  }
}

// ─── Setup Memory Capture ─────────────────────────────────────────────────────

/**
 * Called when a valid signal is detected, BEFORE any gate checks.
 * Records the setup with isAccepted=false (updated if a trade opens).
 *
 * @returns setupId UUID, or null on failure
 */
export async function captureSetupDetected(
  signal: TradeSignal,
  result: AnalysisResult,
  session: string,
  snapshotId: string | null,
  newsStatus: string = "clear",
): Promise<string | null> {
  try {
    const zones   = result.zones ?? [];
    const supplyZ = zones.filter(z => z.zoneType === "supply");
    const demandZ = zones.filter(z => z.zoneType === "demand");

    const supplyTop    = supplyZ.length > 0 ? Math.max(...supplyZ.map(z => z.priceTop))    : null;
    const supplyBottom = supplyZ.length > 0 ? Math.min(...supplyZ.map(z => z.priceBottom)) : null;
    const demandTop    = demandZ.length > 0 ? Math.max(...demandZ.map(z => z.priceTop))    : null;
    const demandBottom = demandZ.length > 0 ? Math.min(...demandZ.map(z => z.priceBottom)) : null;

    const [inserted] = await db
      .insert(setupMemoryTable)
      .values({
        pair:             signal.pair,
        direction:        signal.direction,
        session,
        strategyVersion:  STRATEGY_VERSION,
        htfBias:          result.regime.trend,
        htfStructure:     result.regime.regime,

        supplyZoneHigh:   supplyTop    != null ? String(supplyTop)    : null,
        supplyZoneLow:    supplyBottom != null ? String(supplyBottom) : null,
        demandZoneHigh:   demandTop    != null ? String(demandTop)    : null,
        demandZoneLow:    demandBottom != null ? String(demandBottom) : null,

        zoneScore:         String(signal.zoneScore),
        liquidityScore:    String(signal.liquidityScore),
        amdScore:          String(signal.amdScore),
        confirmationScore: String(signal.confirmationScore),
        confidence:        String(signal.confidence),

        entryPrice:  String(signal.entryPrice),
        stopLoss:    String(signal.stopLoss),
        takeProfit:  String(signal.takeProfit),
        riskReward:  String(Math.round(signal.riskReward * 100) / 100),

        isValid:    true,
        isAccepted: false,

        marketSnapshotId: snapshotId ?? undefined,
        regime:           result.regime.regime,
        newsState:        newsStatus,

        evaluatedAt: new Date(),
      })
      .returning({ id: setupMemoryTable.id });

    const setupId = inserted?.id ?? null;
    logger.debug({ pair: signal.pair, setupId }, "[MCE] Setup detected, memory created");
    return setupId;
  } catch (err) {
    logger.warn({ err, pair: signal.pair }, "[MCE] Failed to capture setup detection");
    return null;
  }
}

// ─── Skipped Setup Capture ────────────────────────────────────────────────────

export interface SkipContext {
  priceAtSkip?:    number;
  volatility?:     string;
  spread?:         number;
  additionalMeta?: Record<string, unknown>;
}

/**
 * Called at every gate rejection point in the paper engine.
 * Records a permanent skipped-setup record for learning.
 * Never throws — capture failures must not interrupt trading.
 */
export async function captureSkippedSetup(
  signal: TradeSignal,
  skipReason: string,
  rejectingRule: string,
  session: string,
  regime: string | null,
  snapshotId: string | null,
  setupId:    string | null,
  ctx:        SkipContext = {},
): Promise<void> {
  try {
    await db.insert(skippedSetupMemoryTable).values({
      setupId:          setupId  ?? undefined,
      pair:             signal.pair,
      direction:        signal.direction,
      session,
      regime:           regime ?? undefined,

      skipReason,
      rejectingRule,
      rejectingModule:  SOURCE_MODULE,

      zoneScore:         String(signal.zoneScore),
      liquidityScore:    String(signal.liquidityScore),
      amdScore:          String(signal.amdScore),
      confirmationScore: String(signal.confirmationScore),
      confidence:        String(signal.confidence),

      priceAtSkip: ctx.priceAtSkip != null ? String(ctx.priceAtSkip) : undefined,
      entryPrice:  String(signal.entryPrice),
      stopLoss:    String(signal.stopLoss),
      takeProfit:  String(signal.takeProfit),
      riskReward:  String(Math.round(signal.riskReward * 100) / 100),

      volatility:       ctx.volatility ?? undefined,
      spread:           ctx.spread != null ? String(ctx.spread) : undefined,
      marketSnapshotId: snapshotId ?? undefined,

      marketContext: {
        amdPhase:  signal.amdPhase,
        zoneType:  signal.zoneType,
        fibLevel:  signal.fibLevel,
        ...(ctx.additionalMeta ?? {}),
      },
    });

    // Mark the parent setup as not-accepted if we have a setupId
    if (setupId) {
      await db
        .update(setupMemoryTable)
        .set({ isAccepted: false })
        .where(eq(setupMemoryTable.id, setupId));
    }

    logger.debug({ pair: signal.pair, skipReason }, "[MCE] Skipped setup captured");
  } catch (err) {
    logger.warn({ err, pair: signal.pair, skipReason }, "[MCE] Failed to capture skipped setup");
  }
}

// ─── Trade Open Capture ───────────────────────────────────────────────────────

export interface TradeOpenData {
  tradeId:       number;
  pair:          string;
  direction:     string;
  entryPrice:    number;
  stopLoss:      number;
  takeProfit:    number;
  lotSize:       number;
  riskPct:       number;
  slippagePips:  number;
  spreadPips:    number;
  session:       string;
  regime:        string | null;
  newsStatus:    string;
  ruleEvaluation?: Record<string, unknown>;
}

/**
 * Called immediately after a trade is successfully inserted in the DB.
 * Records the "opened" trade event and links the setup to the trade.
 * Initialises the excursion tracker for this trade.
 * Never throws.
 */
export async function captureTradeOpened(
  data:       TradeOpenData,
  snapshotId: string | null,
  setupId:    string | null,
): Promise<void> {
  try {
    // Seed the excursion tracker so MFE/MAE are tracked from first tick
    seedExcursionTracker(
      data.tradeId,
      data.entryPrice,
      data.direction,
      data.pair,
      new Date(),
    );

    // Write the "opened" trade event
    await db.insert(tradeEventsTable).values({
      tradeId:    data.tradeId,
      setupId:    setupId   ?? undefined,
      snapshotId: snapshotId ?? undefined,
      eventType:  "opened",
      price:      String(data.entryPrice),
      stopLoss:   String(data.stopLoss),
      takeProfit: String(data.takeProfit),
      lotSize:    String(data.lotSize),
      riskPct:    String(data.riskPct),
      expectedRr: String(
        Math.round(
          (Math.abs(data.takeProfit - data.entryPrice) /
           Math.abs(data.entryPrice - data.stopLoss)) * 100,
        ) / 100,
      ),
      spreadPips:    String(data.spreadPips),
      slippagePips:  String(data.slippagePips),
      brokerResponse: "accepted",
      meta: {
        newsStatus:    data.newsStatus,
        regime:        data.regime,
        ruleEvaluation: data.ruleEvaluation,
      },
      occurredAt: new Date(),
    });

    // Mark the setup as accepted and link it to the trade
    if (setupId) {
      await db
        .update(setupMemoryTable)
        .set({
          isAccepted:   true,
          linkedTradeId: data.tradeId,
        })
        .where(eq(setupMemoryTable.id, setupId));
    }

    logger.debug({ tradeId: data.tradeId, setupId }, "[MCE] Trade opened event captured");
  } catch (err) {
    logger.warn({ err, tradeId: data.tradeId }, "[MCE] Failed to capture trade open");
  }
}

// ─── Trade Modification Capture ───────────────────────────────────────────────

export type TradeEventType =
  | "break_even"
  | "partial_close"
  | "trailing_stop"
  | "sl_updated"
  | "tp_updated"
  | "size_changed"
  | "manual_close"
  | "price_update";

export interface TradeModificationData {
  price?:     number;
  stopLoss?:  number;
  takeProfit?: number;
  lotSize?:   number;
  meta?:      Record<string, unknown>;
}

/**
 * Called whenever a trade is modified (break-even, trailing stop, etc.).
 * Each modification becomes a permanent append-only event.
 * Never throws.
 */
export async function captureTradeEvent(
  tradeId:   number,
  eventType: TradeEventType,
  data:      TradeModificationData,
): Promise<void> {
  try {
    await db.insert(tradeEventsTable).values({
      tradeId,
      eventType,
      price:      data.price     != null ? String(data.price)     : undefined,
      stopLoss:   data.stopLoss  != null ? String(data.stopLoss)  : undefined,
      takeProfit: data.takeProfit != null ? String(data.takeProfit): undefined,
      lotSize:    data.lotSize   != null ? String(data.lotSize)   : undefined,
      meta:       data.meta,
      occurredAt: new Date(),
    });

    logger.debug({ tradeId, eventType }, "[MCE] Trade modification event captured");
  } catch (err) {
    logger.warn({ err, tradeId, eventType }, "[MCE] Failed to capture trade modification");
  }
}

// ─── Trade Close Capture ──────────────────────────────────────────────────────

export interface TradeCloseData {
  tradeId:        number;
  pair:           string;
  direction:      string;
  entryPrice:     number;
  closePrice:     number;
  stopLoss:       number;
  takeProfit:     number;
  lotSize:        number;
  pnl:            number;
  pnlPercent:     number;
  closeReason:    string;
  exitSlippage:   number;
  openedAt:       Date;
}

/**
 * Called when a trade closes (SL hit, TP hit, or manual close).
 * Writes the "closed" trade event including MFE/MAE analysis.
 * Clears the excursion tracker for this trade.
 * Never throws.
 */
export async function captureTradeClose(data: TradeCloseData): Promise<void> {
  try {
    const now      = new Date();
    const pipSize  = getPipSize(data.pair);
    const duration = Math.floor((now.getTime() - data.openedAt.getTime()) / 60_000);
    const outcome  = data.pnl > 0 ? "win" : data.pnl < 0 ? "loss" : "break_even";

    const rrActual = Math.round(
      (Math.abs(data.closePrice - data.entryPrice) /
       Math.abs(data.entryPrice - data.stopLoss)) * 100,
    ) / 100;

    // Read excursion state (or approximate from close data)
    const excursion = excursionTracker.get(data.tradeId);
    let mfePips = excursion?.mfePips ?? 0;
    let maePips = excursion?.maePips ?? 0;

    // If excursion tracker was never seeded, approximate from outcome
    if (!excursion) {
      const pipDiff = Math.abs(data.closePrice - data.entryPrice) / pipSize;
      if (outcome === "win") {
        mfePips = pipDiff;
        maePips = 0;
      } else {
        mfePips = 0;
        maePips = pipDiff;
      }
    }

    // Guarantee MFE is at least the final favorable excursion
    const finalFavPips = Math.max(
      0,
      (data.direction === "buy"
        ? data.closePrice - data.entryPrice
        : data.entryPrice - data.closePrice) / pipSize,
    );
    mfePips = Math.max(mfePips, finalFavPips);

    await db.insert(tradeEventsTable).values({
      tradeId:      data.tradeId,
      eventType:    "closed",
      price:        String(data.closePrice),
      stopLoss:     String(data.stopLoss),
      takeProfit:   String(data.takeProfit),
      lotSize:      String(data.lotSize),
      pnl:          String(Math.round(data.pnl * 100) / 100),
      pnlPercent:   String(Math.round(data.pnlPercent * 1000) / 1000),
      riskReward:   String(rrActual),
      closeReason:  data.closeReason,
      outcome,
      durationMins: duration,
      mfePips:      String(Math.round(mfePips * 10) / 10),
      maePips:      String(Math.round(maePips * 10) / 10),
      slippagePips: String(data.exitSlippage),
      meta: {
        entryPrice:  data.entryPrice,
        slippage:    data.exitSlippage,
      },
      occurredAt: now,
    });

    clearExcursionTracker(data.tradeId);
    logger.debug({ tradeId: data.tradeId, outcome, mfePips, maePips }, "[MCE] Trade close event captured");
  } catch (err) {
    logger.warn({ err, tradeId: data.tradeId }, "[MCE] Failed to capture trade close");
  }
}

// ─── Timeline Queries ─────────────────────────────────────────────────────────

export interface TimelineEntry {
  type:       "snapshot" | "setup" | "skipped" | "trade_event";
  occurredAt: string;
  pair:       string;
  data:       Record<string, unknown>;
}

/**
 * Reconstructs the complete episodic timeline for a single trade.
 * Returns all linked memory records ordered chronologically.
 */
export async function getTradeTimeline(tradeId: number): Promise<{
  tradeId:    number;
  events:     Array<typeof tradeEventsTable.$inferSelect>;
  setup:      typeof setupMemoryTable.$inferSelect | null;
  snapshot:   typeof marketSnapshotMemoryTable.$inferSelect | null;
  skipped:    Array<typeof skippedSetupMemoryTable.$inferSelect>;
}> {
  const events = await db
    .select()
    .from(tradeEventsTable)
    .where(eq(tradeEventsTable.tradeId, tradeId))
    .orderBy(tradeEventsTable.occurredAt);

  const openEvent = events.find(e => e.eventType === "opened");
  const setupId   = openEvent?.setupId   ?? null;
  const snapId    = openEvent?.snapshotId ?? null;

  const [setup, snapshot, skipped] = await Promise.all([
    setupId
      ? db.select().from(setupMemoryTable).where(eq(setupMemoryTable.id, setupId)).limit(1).then(r => r[0] ?? null)
      : Promise.resolve(null),
    snapId
      ? db.select().from(marketSnapshotMemoryTable).where(eq(marketSnapshotMemoryTable.id, snapId)).limit(1).then(r => r[0] ?? null)
      : Promise.resolve(null),
    setupId
      ? db.select().from(skippedSetupMemoryTable).where(eq(skippedSetupMemoryTable.setupId, setupId))
      : Promise.resolve([]),
  ]);

  return { tradeId, events, setup, snapshot, skipped };
}

/**
 * Returns a merged chronological timeline of all memory events.
 * Used for the global memory timeline endpoint.
 */
export async function getGlobalTimeline(opts: {
  pair?:     string;
  limit?:    number;
  offset?:   number;
  dateFrom?: Date;
  dateTo?:   Date;
}): Promise<{
  total:   number;
  entries: TimelineEntry[];
}> {
  const limit  = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;

  // Fetch recent events from the primary event log
  const eventsQuery = db
    .select()
    .from(tradeEventsTable)
    .orderBy(tradeEventsTable.occurredAt)
    .limit(limit)
    .offset(offset);

  const snapshotsQuery = db
    .select()
    .from(marketSnapshotMemoryTable)
    .orderBy(marketSnapshotMemoryTable.capturedAt)
    .limit(limit)
    .offset(offset);

  const setupsQuery = db
    .select()
    .from(setupMemoryTable)
    .orderBy(setupMemoryTable.evaluatedAt)
    .limit(limit)
    .offset(offset);

  const skippedQuery = db
    .select()
    .from(skippedSetupMemoryTable)
    .orderBy(skippedSetupMemoryTable.createdAt)
    .limit(limit)
    .offset(offset);

  const [events, snapshots, setups, skipped] = await Promise.all([
    eventsQuery,
    snapshotsQuery,
    setupsQuery,
    skippedQuery,
  ]);

  const entries: TimelineEntry[] = [
    ...snapshots.map(s => ({
      type:       "snapshot" as const,
      occurredAt: s.capturedAt.toISOString(),
      pair:       s.pair,
      data:       s as unknown as Record<string, unknown>,
    })),
    ...setups.map(s => ({
      type:       "setup" as const,
      occurredAt: s.evaluatedAt.toISOString(),
      pair:       s.pair,
      data:       s as unknown as Record<string, unknown>,
    })),
    ...skipped.map(s => ({
      type:       "skipped" as const,
      occurredAt: s.createdAt.toISOString(),
      pair:       s.pair,
      data:       s as unknown as Record<string, unknown>,
    })),
    ...events.map(e => ({
      type:       "trade_event" as const,
      occurredAt: e.occurredAt.toISOString(),
      pair:       (e.meta as Record<string, unknown> | null)?.pair as string ?? "UNKNOWN",
      data:       e as unknown as Record<string, unknown>,
    })),
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  const filtered = opts.pair
    ? entries.filter(e => e.pair === opts.pair)
    : entries;

  return {
    total:   filtered.length,
    entries: filtered.slice(0, limit),
  };
}

/**
 * Returns paginated full history of all captured memory records.
 * Used for the /memory/history endpoint.
 */
export async function getMemoryHistory(opts: {
  limit?:  number;
  offset?: number;
}): Promise<{
  snapshots:    typeof marketSnapshotMemoryTable.$inferSelect[];
  setups:       typeof setupMemoryTable.$inferSelect[];
  skipped:      typeof skippedSetupMemoryTable.$inferSelect[];
  tradeEvents:  typeof tradeEventsTable.$inferSelect[];
  counts: {
    snapshots:   number;
    setups:      number;
    skipped:     number;
    tradeEvents: number;
  };
}> {
  const limit  = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;

  const [snapshots, setups, skipped, tradeEvents] = await Promise.all([
    db.select().from(marketSnapshotMemoryTable).orderBy(marketSnapshotMemoryTable.capturedAt).limit(limit).offset(offset),
    db.select().from(setupMemoryTable).orderBy(setupMemoryTable.evaluatedAt).limit(limit).offset(offset),
    db.select().from(skippedSetupMemoryTable).orderBy(skippedSetupMemoryTable.createdAt).limit(limit).offset(offset),
    db.select().from(tradeEventsTable).orderBy(tradeEventsTable.occurredAt).limit(limit).offset(offset),
  ]);

  return {
    snapshots,
    setups,
    skipped,
    tradeEvents,
    counts: {
      snapshots:   snapshots.length,
      setups:      setups.length,
      skipped:     skipped.length,
      tradeEvents: tradeEvents.length,
    },
  };
}

/**
 * Returns trade events for a specific trade — quick lookup for trade detail pages.
 */
export async function getTradeEvents(tradeId: number): Promise<typeof tradeEventsTable.$inferSelect[]> {
  return db
    .select()
    .from(tradeEventsTable)
    .where(eq(tradeEventsTable.tradeId, tradeId))
    .orderBy(tradeEventsTable.occurredAt);
}

/**
 * Cleans up aftermath-pending skipped setups — updates hypothetical outcomes
 * based on current price vs the original skip price.
 * Called periodically by the main monitor loop.
 */
export async function updateSkippedSetupAftermath(
  getPriceFn: (pair: string) => { mid: number } | null,
): Promise<void> {
  try {
    const pending = await db
      .select()
      .from(skippedSetupMemoryTable)
      .where(
        and(
          isNull(skippedSetupMemoryTable.priceAt1h),
          isNull(skippedSetupMemoryTable.hypotheticalOutcome),
        ),
      )
      .limit(50);

    for (const skip of pending) {
      const now       = Date.now();
      const createdMs = new Date(skip.createdAt).getTime();
      const ageMs     = now - createdMs;
      const ageH      = ageMs / (60 * 60 * 1000);

      if (!skip.entryPrice) continue;

      const live = getPriceFn(skip.pair);
      if (!live) continue;

      const entryPrice = parseFloat(skip.entryPrice);
      const pipSize    = getPipSize(skip.pair);
      const priceDiff  = skip.direction === "buy"
        ? live.mid - entryPrice
        : entryPrice - live.mid;
      const pipsIfTaken = Math.round((priceDiff / pipSize) * 10) / 10;

      const updates: Record<string, string> = {};
      if (ageH >= 1  && !skip.priceAt1h)  updates.price_at_1h  = String(live.mid);
      if (ageH >= 4  && !skip.priceAt4h)  updates.price_at_4h  = String(live.mid);
      if (ageH >= 24 && !skip.priceAt24h) updates.price_at_24h = String(live.mid);

      if (ageH >= 4) {
        updates.hypothetical_outcome = pipsIfTaken > 0 ? "would_win" : "would_lose";
      }

      if (Object.keys(updates).length > 0) {
        await db
          .update(skippedSetupMemoryTable)
          .set(updates)
          .where(eq(skippedSetupMemoryTable.id, skip.id));
      }
    }
  } catch (err) {
    logger.warn({ err }, "[MCE] Skipped setup aftermath update failed");
  }
}
