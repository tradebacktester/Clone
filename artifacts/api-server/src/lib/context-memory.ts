/**
 * Context Memory — Rich contextual information attached to every trade.
 *
 * Three sub-domains stored per trade:
 *   Market Context  — regime, session, volatility, news, liquidity
 *   Strategy Context — HTF bias, supply/demand, AMD stage, rule evaluation
 *   Trader Context   — notes, emotion, confidence, lessons learned
 *
 * Upsert pattern: one context record per trade, always updated in place.
 * Context timeline events are appended for every meaningful change.
 *
 * Search is prepared for future pgvector semantic search via search_vector field.
 */

import { db } from "@workspace/db";
import {
  tradeContextTable,
  contextTimelineEventsTable,
  tradeScreenshotsTable,
  tradeEventsTable,
} from "@workspace/db";
import { eq, and, or, ilike, gte, lte, isNotNull, inArray, sql } from "drizzle-orm";
import { logger } from "./logger.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MarketContextInput {
  trendStrength?:    number;
  marketRegime?:     string;
  session?:          string;
  liquidityLevel?:   string;
  spreadPips?:       number;
  volatility?:       string;
  volatilityScore?:  number;
  correlationData?:  Record<string, number>;
  newsContext?:      {
    events:         Array<{ title: string; impact: string; timeUntil?: string }>;
    overallImpact:  string;
    blockingPairs:  string[];
  };
  sessionOpenClose?: string;
  dayOfWeek?:        string;
}

export interface StrategyContextInput {
  htfBias?:                 string;
  premiumDiscountState?:    string;
  supplyStrength?:          number;
  demandStrength?:          number;
  liquidityScore?:          number;
  amdStage?:                string;
  confirmationQuality?:     number;
  traderIntelligenceScore?: number;
  ruleEvaluationSummary?:   Record<string, unknown>;
}

export interface TraderContextInput {
  manualNotes?:     string;
  confidence?:      number;
  emotionTag?:      string;
  reasonAccepted?:  string;
  reasonRejected?:  string;
  lessonsLearned?:  string;
}

export interface ContextInput {
  tradeId:     number;
  setupId?:    string;
  snapshotId?: string;
  strategyVersion?: string;
  market?:     MarketContextInput;
  strategy?:   StrategyContextInput;
  trader?:     TraderContextInput;
}

export interface ContextSearchOptions {
  pair?:            string;
  session?:         string;
  regime?:          string;
  notes?:           string;       // free-text search in manualNotes + lessonsLearned
  dateFrom?:        string;
  dateTo?:          string;
  outcome?:         string;       // win | loss | break_even
  emotionTag?:      string;
  strategyVersion?: string;
  dayOfWeek?:       string;
  limit?:           number;
  offset?:          number;
}

// ─── Search Vector Builder ──────────────────────────────────────────────────

/**
 * Builds a concatenated text blob for future semantic search.
 * When pgvector is added, this field will be passed to the embedding model.
 */
function buildSearchVector(input: ContextInput): string {
  const parts: string[] = [];
  if (input.market?.marketRegime)   parts.push(input.market.marketRegime);
  if (input.market?.session)        parts.push(input.market.session);
  if (input.market?.volatility)     parts.push(input.market.volatility);
  if (input.market?.dayOfWeek)      parts.push(input.market.dayOfWeek);
  if (input.strategy?.htfBias)      parts.push(input.strategy.htfBias);
  if (input.strategy?.amdStage)     parts.push(input.strategy.amdStage);
  if (input.strategy?.premiumDiscountState) parts.push(input.strategy.premiumDiscountState);
  if (input.trader?.emotionTag)     parts.push(input.trader.emotionTag);
  if (input.trader?.manualNotes)    parts.push(input.trader.manualNotes);
  if (input.trader?.lessonsLearned) parts.push(input.trader.lessonsLearned);
  if (input.trader?.reasonAccepted) parts.push(input.trader.reasonAccepted);
  if (input.trader?.reasonRejected) parts.push(input.trader.reasonRejected);
  return parts.join(" ").toLowerCase().trim();
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

/**
 * Creates or updates the context record for a trade.
 * Safe to call multiple times — upserts on tradeId.
 */
export async function upsertTradeContext(input: ContextInput): Promise<typeof tradeContextTable.$inferSelect> {
  const searchVector = buildSearchVector(input);
  const now          = new Date();

  const values = {
    tradeId:                  input.tradeId,
    setupId:                  input.setupId,
    snapshotId:               input.snapshotId,
    strategyVersion:          input.strategyVersion ?? "2.0",

    // Market context
    trendStrength:            input.market?.trendStrength     != null ? String(input.market.trendStrength)    : undefined,
    marketRegime:             input.market?.marketRegime,
    session:                  input.market?.session,
    liquidityLevel:           input.market?.liquidityLevel,
    spreadPips:               input.market?.spreadPips        != null ? String(input.market.spreadPips)       : undefined,
    volatility:               input.market?.volatility,
    volatilityScore:          input.market?.volatilityScore   != null ? String(input.market.volatilityScore)  : undefined,
    correlationData:          input.market?.correlationData,
    newsContext:              input.market?.newsContext,
    sessionOpenClose:         input.market?.sessionOpenClose,
    dayOfWeek:                input.market?.dayOfWeek,

    // Strategy context
    htfBias:                  input.strategy?.htfBias,
    premiumDiscountState:     input.strategy?.premiumDiscountState,
    supplyStrength:           input.strategy?.supplyStrength  != null ? String(input.strategy.supplyStrength) : undefined,
    demandStrength:           input.strategy?.demandStrength  != null ? String(input.strategy.demandStrength) : undefined,
    liquidityScore:           input.strategy?.liquidityScore  != null ? String(input.strategy.liquidityScore) : undefined,
    amdStage:                 input.strategy?.amdStage,
    confirmationQuality:      input.strategy?.confirmationQuality != null ? String(input.strategy.confirmationQuality) : undefined,
    traderIntelligenceScore:  input.strategy?.traderIntelligenceScore != null ? String(input.strategy.traderIntelligenceScore) : undefined,
    ruleEvaluationSummary:    input.strategy?.ruleEvaluationSummary,

    // Trader context
    manualNotes:     input.trader?.manualNotes,
    confidence:      input.trader?.confidence,
    emotionTag:      input.trader?.emotionTag,
    reasonAccepted:  input.trader?.reasonAccepted,
    reasonRejected:  input.trader?.reasonRejected,
    lessonsLearned:  input.trader?.lessonsLearned,

    searchVector,
    createdAt:  now,
    updatedAt:  now,
  };

  const [record] = await db
    .insert(tradeContextTable)
    .values(values)
    .onConflictDoUpdate({
      target: tradeContextTable.tradeId,
      set: {
        // All fields except tradeId and createdAt
        setupId:                  values.setupId,
        snapshotId:               values.snapshotId,
        strategyVersion:          values.strategyVersion,
        trendStrength:            values.trendStrength,
        marketRegime:             values.marketRegime,
        session:                  values.session,
        liquidityLevel:           values.liquidityLevel,
        spreadPips:               values.spreadPips,
        volatility:               values.volatility,
        volatilityScore:          values.volatilityScore,
        correlationData:          values.correlationData,
        newsContext:              values.newsContext,
        sessionOpenClose:         values.sessionOpenClose,
        dayOfWeek:                values.dayOfWeek,
        htfBias:                  values.htfBias,
        premiumDiscountState:     values.premiumDiscountState,
        supplyStrength:           values.supplyStrength,
        demandStrength:           values.demandStrength,
        liquidityScore:           values.liquidityScore,
        amdStage:                 values.amdStage,
        confirmationQuality:      values.confirmationQuality,
        traderIntelligenceScore:  values.traderIntelligenceScore,
        ruleEvaluationSummary:    values.ruleEvaluationSummary,
        manualNotes:              values.manualNotes,
        confidence:               values.confidence,
        emotionTag:               values.emotionTag,
        reasonAccepted:           values.reasonAccepted,
        reasonRejected:           values.reasonRejected,
        lessonsLearned:           values.lessonsLearned,
        searchVector,
        updatedAt:                now,
      },
    })
    .returning();

  return record!;
}

/**
 * Partially updates a context record (e.g. adding notes after trade review).
 * Only provided fields are updated.
 */
export async function patchTradeContext(
  tradeId: number,
  patch:   Partial<TraderContextInput & { reviewedAt?: Date }>,
): Promise<typeof tradeContextTable.$inferSelect | null> {
  const existing = await getTradeContext(tradeId);
  if (!existing) return null;

  const setFields: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (patch.manualNotes     !== undefined) setFields.manualNotes     = patch.manualNotes;
  if (patch.confidence      !== undefined) setFields.confidence      = patch.confidence;
  if (patch.emotionTag      !== undefined) setFields.emotionTag      = patch.emotionTag;
  if (patch.reasonAccepted  !== undefined) setFields.reasonAccepted  = patch.reasonAccepted;
  if (patch.reasonRejected  !== undefined) setFields.reasonRejected  = patch.reasonRejected;
  if (patch.lessonsLearned  !== undefined) setFields.lessonsLearned  = patch.lessonsLearned;
  if (patch.reviewedAt      !== undefined) setFields.reviewedAt      = patch.reviewedAt;

  // Rebuild search vector with updated notes
  const updatedInput: ContextInput = {
    tradeId,
    market:   { marketRegime: existing.marketRegime ?? undefined, session: existing.session ?? undefined, volatility: existing.volatility ?? undefined, dayOfWeek: existing.dayOfWeek ?? undefined },
    strategy: { htfBias: existing.htfBias ?? undefined, amdStage: existing.amdStage ?? undefined, premiumDiscountState: existing.premiumDiscountState ?? undefined },
    trader:   {
      emotionTag:      (patch.emotionTag ?? existing.emotionTag)         ?? undefined,
      manualNotes:     (patch.manualNotes ?? existing.manualNotes)       ?? undefined,
      lessonsLearned:  (patch.lessonsLearned ?? existing.lessonsLearned) ?? undefined,
      reasonAccepted:  (patch.reasonAccepted ?? existing.reasonAccepted) ?? undefined,
      reasonRejected:  (patch.reasonRejected ?? existing.reasonRejected) ?? undefined,
    },
  };
  setFields.searchVector = buildSearchVector(updatedInput);

  const [updated] = await db
    .update(tradeContextTable)
    .set(setFields)
    .where(eq(tradeContextTable.tradeId, tradeId))
    .returning();

  if (patch.lessonsLearned) {
    addContextTimelineEvent(tradeId, undefined, "lesson_learned", "Lesson Learned", patch.lessonsLearned.slice(0, 120)).catch(() => {});
  }
  if (patch.reviewedAt) {
    addContextTimelineEvent(tradeId, undefined, "review", "Trade Reviewed", "Manual review completed").catch(() => {});
  }

  return updated ?? null;
}

/**
 * Retrieves the context for a trade.
 */
export async function getTradeContext(tradeId: number): Promise<typeof tradeContextTable.$inferSelect | null> {
  const rows = await db
    .select()
    .from(tradeContextTable)
    .where(eq(tradeContextTable.tradeId, tradeId))
    .limit(1);

  return rows[0] ?? null;
}

// ─── Context Timeline ─────────────────────────────────────────────────────────

/**
 * Adds a manual or system event to the context timeline.
 */
export async function addContextTimelineEvent(
  tradeId:      number,
  setupId:      string | undefined,
  stage:        string,
  title:        string,
  description?: string,
  meta?:        Record<string, unknown>,
  source:       "system" | "user" = "system",
): Promise<void> {
  try {
    await db.insert(contextTimelineEventsTable).values({
      tradeId,
      setupId,
      stage,
      title,
      description,
      iconType:   stage,
      source,
      meta,
      occurredAt: new Date(),
    });
  } catch (err) {
    logger.warn({ err, tradeId, stage }, "[CM] Failed to add timeline event");
  }
}

/**
 * Returns the full context timeline for a trade, merging:
 * 1. Trade events (from trade_events table — engine events)
 * 2. Context timeline events (from context_timeline_events — rich stages)
 * 3. Screenshot events (from trade_screenshots)
 *
 * All sorted chronologically.
 */
export async function getContextTimeline(tradeId: number): Promise<{
  stage:       string;
  title:       string;
  description: string | null;
  source:      string;
  occurredAt:  Date;
  iconType:    string | null;
  meta:        Record<string, unknown> | null;
  type:        "engine" | "context" | "screenshot";
}[]> {
  const [engineEvents, contextEvents, screenshotEvents] = await Promise.all([
    // Engine events (trade opened, closed, etc.)
    db.select().from(tradeEventsTable).where(eq(tradeEventsTable.tradeId, tradeId)).orderBy(tradeEventsTable.occurredAt),

    // Context timeline events
    db.select().from(contextTimelineEventsTable).where(eq(contextTimelineEventsTable.tradeId, tradeId)).orderBy(contextTimelineEventsTable.occurredAt),

    // Screenshot events (each screenshot = a timeline moment)
    db.select({
      stage:      tradeScreenshotsTable.stage,
      pair:       tradeScreenshotsTable.pair,
      timeframe:  tradeScreenshotsTable.timeframe,
      notes:      tradeScreenshotsTable.notes,
      capturedAt: tradeScreenshotsTable.capturedAt,
      uploadedAt: tradeScreenshotsTable.uploadedAt,
      id:         tradeScreenshotsTable.id,
    }).from(tradeScreenshotsTable).where(eq(tradeScreenshotsTable.tradeId, tradeId)).orderBy(tradeScreenshotsTable.capturedAt),
  ]);

  const merged: Array<{
    stage:       string;
    title:       string;
    description: string | null;
    source:      string;
    occurredAt:  Date;
    iconType:    string | null;
    meta:        Record<string, unknown> | null;
    type:        "engine" | "context" | "screenshot";
  }> = [
    ...engineEvents.map(e => ({
      stage:       e.eventType,
      title:       formatEngineEventTitle(e.eventType),
      description: formatEngineEventDesc(e),
      source:      "engine",
      occurredAt:  e.occurredAt,
      iconType:    mapEventTypeToIcon(e.eventType),
      meta:        e.meta as Record<string, unknown> | null,
      type:        "engine" as const,
    })),
    ...contextEvents.map(e => ({
      stage:       e.stage,
      title:       e.title,
      description: e.description,
      source:      e.source,
      occurredAt:  e.occurredAt,
      iconType:    e.iconType,
      meta:        e.meta as Record<string, unknown> | null,
      type:        "context" as const,
    })),
    ...screenshotEvents.map(e => ({
      stage:       "screenshot_saved",
      title:       `Screenshot — ${e.stage}`,
      description: e.notes ?? `${e.timeframe ?? "chart"} screenshot saved`,
      source:      "user",
      occurredAt:  e.capturedAt ?? e.uploadedAt,
      iconType:    "camera",
      meta:        { screenshotId: e.id, stage: e.stage, pair: e.pair, timeframe: e.timeframe },
      type:        "screenshot" as const,
    })),
  ];

  merged.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  return merged;
}

function formatEngineEventTitle(eventType: string): string {
  const labels: Record<string, string> = {
    opened:          "Trade Opened",
    closed:          "Trade Closed",
    break_even:      "Break Even Set",
    partial_close:   "Partial Close",
    trailing_stop:   "Trailing Stop Updated",
    sl_updated:      "Stop Loss Updated",
    tp_updated:      "Take Profit Updated",
    size_changed:    "Position Size Changed",
    manual_close:    "Manual Close",
    price_update:    "Price Update",
  };
  return labels[eventType] ?? eventType.replace(/_/g, " ");
}

function formatEngineEventDesc(e: typeof tradeEventsTable.$inferSelect): string | null {
  if (e.eventType === "opened")  return `Entry @ ${e.price}, SL @ ${e.stopLoss}, TP @ ${e.takeProfit}`;
  if (e.eventType === "closed")  return `Closed @ ${e.price} → ${e.outcome?.toUpperCase() ?? "?"} | R:R ${e.riskReward} | ${e.durationMins ?? 0}m | MFE ${e.mfePips}p / MAE ${e.maePips}p`;
  if (e.eventType === "break_even") return `SL moved to break even`;
  return null;
}

function mapEventTypeToIcon(eventType: string): string {
  const icons: Record<string, string> = {
    opened:         "play",
    closed:         "check",
    break_even:     "shield",
    partial_close:  "minus-circle",
    trailing_stop:  "trending-up",
    sl_updated:     "alert",
    tp_updated:     "target",
    manual_close:   "x-circle",
  };
  return icons[eventType] ?? "circle";
}

// ─── Search ──────────────────────────────────────────────────────────────────

/**
 * Searches trade context records.
 * Prepared for future semantic search by also maintaining search_vector.
 */
export async function searchContextMemory(opts: ContextSearchOptions): Promise<{
  total:   number;
  results: Array<typeof tradeContextTable.$inferSelect>;
}> {
  const limit  = Math.min(opts.limit  ?? 50, 200);
  const offset = opts.offset ?? 0;

  let query = db.select().from(tradeContextTable).$dynamic();

  const conditions = [];

  if (opts.session)    conditions.push(eq(tradeContextTable.session,     opts.session));
  if (opts.regime)     conditions.push(eq(tradeContextTable.marketRegime, opts.regime));
  if (opts.emotionTag) conditions.push(eq(tradeContextTable.emotionTag,  opts.emotionTag));
  if (opts.dayOfWeek)  conditions.push(eq(tradeContextTable.dayOfWeek,   opts.dayOfWeek));

  if (opts.notes) {
    const q = `%${opts.notes.toLowerCase()}%`;
    conditions.push(
      or(
        ilike(tradeContextTable.manualNotes,    q),
        ilike(tradeContextTable.lessonsLearned, q),
        ilike(tradeContextTable.reasonAccepted, q),
        ilike(tradeContextTable.reasonRejected, q),
        ilike(tradeContextTable.searchVector,   q),
      ),
    );
  }

  if (opts.dateFrom) {
    conditions.push(gte(tradeContextTable.createdAt, new Date(opts.dateFrom)));
  }
  if (opts.dateTo) {
    conditions.push(lte(tradeContextTable.createdAt, new Date(opts.dateTo)));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const results = await query
    .orderBy(tradeContextTable.createdAt)
    .limit(limit)
    .offset(offset);

  return { total: results.length, results };
}

// ─── Auto-populate from trade data ───────────────────────────────────────────

/**
 * Auto-populates the context from existing trade + analysis data.
 * Called from the paper engine after a trade opens.
 * Trader context fields are left empty for manual population.
 */
export async function autoPopulateContextFromTrade(
  tradeId:   number,
  setupId:   string | null,
  snapshotId: string | null,
  tradeData: {
    pair:           string;
    direction:      string;
    session:        string;
    regime:         string | null;
    newsStatus:     string;
    spreadPips:     number;
    ruleEvaluation: Record<string, unknown> | null;
    tqi?:           number;
    mtfAligned?:    boolean;
    mtfScore?:      number;
  },
): Promise<void> {
  try {
    const dayOfWeek = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()] ?? "Monday";
    const hour      = new Date().getUTCHours();
    const sessionPart = hour < 9 ? "open" : hour < 14 ? "mid" : "close";

    await upsertTradeContext({
      tradeId,
      setupId:    setupId ?? undefined,
      snapshotId: snapshotId ?? undefined,
      market: {
        marketRegime:      tradeData.regime ?? undefined,
        session:           tradeData.session,
        spreadPips:        tradeData.spreadPips,
        sessionOpenClose:  sessionPart,
        dayOfWeek,
        newsContext:       tradeData.newsStatus !== "clear" ? {
          events:        [],
          overallImpact: tradeData.newsStatus,
          blockingPairs: [tradeData.pair],
        } : undefined,
      },
      strategy: {
        amdStage:              "accumulation",  // populated from signal.amdPhase if available
        ruleEvaluationSummary: tradeData.ruleEvaluation ?? undefined,
        traderIntelligenceScore: tradeData.tqi,
      },
    });

    // Add entry event to context timeline
    await addContextTimelineEvent(
      tradeId,
      setupId ?? undefined,
      "entry",
      "Trade Entry",
      `${tradeData.direction.toUpperCase()} ${tradeData.pair} entered in ${tradeData.session} session`,
      { pair: tradeData.pair, direction: tradeData.direction, regime: tradeData.regime },
      "system",
    );
  } catch (err) {
    logger.warn({ err, tradeId }, "[CM] Auto-populate context failed");
  }
}

/**
 * Records a lesson learned for a closed trade.
 * Adds to the context timeline and updates lessonsLearned field.
 */
export async function recordLesson(
  tradeId:  number,
  lesson:   string,
  emotion?: string,
): Promise<void> {
  try {
    await patchTradeContext(tradeId, {
      lessonsLearned: lesson,
      emotionTag:     emotion,
      reviewedAt:     new Date(),
    });

    await addContextTimelineEvent(
      tradeId,
      undefined,
      "lesson_learned",
      "Lesson Learned",
      lesson.slice(0, 200),
      { lesson, emotion },
      "user",
    );
  } catch (err) {
    logger.warn({ err, tradeId }, "[CM] Record lesson failed");
  }
}
