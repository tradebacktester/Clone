/**
 * Experience Builder
 *
 * Assembles complete "Experience" objects from scattered memory records.
 * An Experience is the atomic unit of memory — a complete trade journey
 * containing market context, strategy context, screenshots, timeline,
 * performance metrics, notes, and lessons.
 *
 * Future AI modules should request Experiences, not individual DB rows.
 *
 * Every Experience carries placeholders for future AI integration:
 *   - featureVector:        10-dim numeric array for similarity prep
 *   - similarityMetadata:   reserved for nearest-neighbour results
 *   - embeddingPlaceholder: reserved for vector embedding
 */

import { db } from "@workspace/db";
import {
  memoryExperiencesTable,
  memoryRelationshipsTable,
  tradeEventsTable,
  tradeScreenshotsTable,
  tradeContextTable,
  contextTimelineEventsTable,
  tradeReviewsTable,
} from "@workspace/db";
import { eq, and, or, gte, lte, ilike, isNotNull, inArray, desc, asc, sql } from "drizzle-orm";
import { autoLinkTradeChain } from "./relationship-engine.js";
import { logger } from "./logger.js";

// ─── Feature Vector ───────────────────────────────────────────────────────────
// 10-dimensional numeric feature array.
// NOT an AI embedding — it's a structured numeric snapshot for future ML use.
// Dimensions:
//   [0] pnlPips (raw, unbounded)
//   [1] riskReward (0–5)
//   [2] durationMins (0–2880)
//   [3] volatilityScore (0–100)
//   [4] confirmationQuality (0–100)
//   [5] traderIntelligenceScore (0–100)
//   [6] liquidityScore (0–100)
//   [7] spreadPips (0–10)
//   [8] traderConfidence (0–100)
//   [9] screenshotCount (0–N, capped at 20)

function buildFeatureVector(opts: {
  pnlPips?:            number | null;
  riskReward?:         number | null;
  durationMins?:       number | null;
  volatilityScore?:    number | null;
  confirmationQuality?: number | null;
  tiScore?:            number | null;
  liquidityScore?:     number | null;
  spreadPips?:         number | null;
  traderConfidence?:   number | null;
  screenshotCount?:    number | null;
}): number[] {
  return [
    opts.pnlPips            ?? 0,
    Math.min(opts.riskReward         ?? 0, 20),
    Math.min(opts.durationMins       ?? 0, 2880),
    Math.min(opts.volatilityScore    ?? 0, 100),
    Math.min(opts.confirmationQuality ?? 0, 100),
    Math.min(opts.tiScore            ?? 0, 100),
    Math.min(opts.liquidityScore     ?? 0, 100),
    Math.min(opts.spreadPips         ?? 0, 10),
    Math.min(opts.traderConfidence   ?? 0, 100),
    Math.min(opts.screenshotCount    ?? 0, 20),
  ];
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExperienceSearchOptions {
  pair?:                string;
  session?:             string;
  marketRegime?:        string;
  outcome?:             string;
  direction?:           string;
  volatility?:          string;
  emotionTag?:          string;
  dayOfWeek?:           string;
  htfBias?:             string;
  hasLessons?:          boolean;
  hasScreenshots?:      boolean;
  hasReview?:           boolean;
  pnlMin?:              number;
  pnlMax?:              number;
  rrMin?:               number;
  rrMax?:               number;
  liquidityScoreMin?:   number;
  liquidityScoreMax?:   number;
  confidenceMin?:       number;
  confidenceMax?:       number;
  zoneQualityMin?:      number;
  zoneQualityMax?:      number;
  notes?:               string;  // free-text search in notes
  dateFrom?:            string;
  dateTo?:              string;
  limit?:               number;
  offset?:              number;
  orderBy?:             "newest" | "oldest" | "pnl_desc" | "pnl_asc" | "rr_desc";
}

export interface ExperienceObject {
  experienceId:   string;
  tradeId:        number | null;
  setupId:        string | null;
  snapshotId:     string | null;

  // Labels
  pair:           string | null;
  direction:      string | null;
  session:        string | null;
  marketRegime:   string | null;
  amdStage:       string | null;
  outcome:        string | null;
  dayOfWeek:      string | null;
  volatility:     string | null;
  htfBias:        string | null;
  emotionTag:     string | null;

  // Metrics
  pnlPips:        number | null;
  riskReward:     number | null;
  durationMins:   number | null;
  zoneQuality:    number | null;
  liquidityScore: number | null;
  amdQuality:     number | null;
  spreadPips:     number | null;
  confidenceScore: number | null;
  traderConfidence: number | null;

  // Completeness
  hasContext:      boolean;
  hasScreenshots:  boolean;
  hasReview:       boolean;
  hasLessons:      boolean;
  screenshotCount: number;
  eventCount:      number;
  relationshipCount: number;

  // Rich data (hydrated on request)
  context?:        Record<string, unknown> | null;
  screenshots?:    Array<{ id: string; stage: string; thumbnailData: string | null; capturedAt: Date | null }>;
  timeline?:       Array<{ stage: string; title: string; description: string | null; occurredAt: Date; type: string }>;
  relationships?:  Array<{ relType: string; toType: string; toId: string }>;
  notes?:          string | null;
  lessons?:        string | null;
  reviewSummary?:  string | null;

  // AI placeholders (future — not computed)
  featureVector:        number[];
  similarityMetadata:   { nearestNeighbours: string[]; similarityScores: number[]; lastComputedAt: string | null };
  embeddingPlaceholder: { model: string | null; dims: number | null; computed: boolean; vectorId: string | null };

  // Integrity
  integrityScore:  number | null;
  brokenLinks:     number;
  dataQualityNotes: string | null;
  lastValidatedAt: Date | null;

  tradeOpenedAt:   Date | null;
  tradeClosedAt:   Date | null;
  createdAt:       Date;
  updatedAt:       Date;
}

// ─── Upsert Experience Record ─────────────────────────────────────────────────

/**
 * Creates or updates the memory_experiences index record for a trade.
 * Should be called on trade open, close, and after any data change.
 */
export async function upsertExperienceRecord(tradeId: number): Promise<typeof memoryExperiencesTable.$inferSelect> {
  // Gather all relevant data for this trade
  const [events, ctx, screenshots, rels] = await Promise.all([
    db.select().from(tradeEventsTable).where(eq(tradeEventsTable.tradeId, tradeId)).orderBy(asc(tradeEventsTable.occurredAt)),
    db.select().from(tradeContextTable).where(eq(tradeContextTable.tradeId, tradeId)).limit(1),
    db.select({ id: tradeScreenshotsTable.id, stage: tradeScreenshotsTable.stage }).from(tradeScreenshotsTable).where(eq(tradeScreenshotsTable.tradeId, tradeId)),
    db.select().from(memoryRelationshipsTable).where(or(
      and(eq(memoryRelationshipsTable.fromType, "trade"), eq(memoryRelationshipsTable.fromId, String(tradeId))),
      and(eq(memoryRelationshipsTable.toType,   "trade"), eq(memoryRelationshipsTable.toId,   String(tradeId))),
    )),
  ]);

  const openEvent   = events.find(e => e.eventType === "opened");
  const closeEvent  = events.find(e => e.eventType === "closed");
  const context     = ctx[0];

  // Extract metrics from close event
  const pnlPips    = closeEvent?.pnlPips     ? parseFloat(String(closeEvent.pnlPips))    : null;
  const riskReward = closeEvent?.riskReward  ? parseFloat(String(closeEvent.riskReward)) : null;
  const duration   = closeEvent?.durationMins ?? null;
  const outcome    = closeEvent?.outcome      ?? (openEvent ? "open" : null);

  // Extract from open event
  const pair      = openEvent?.pair;
  const direction = openEvent?.direction;
  const session   = openEvent?.session;
  const regime    = openEvent?.regime ?? context?.marketRegime;
  const spread    = openEvent?.spreadPips ? parseFloat(String(openEvent.spreadPips)) : null;

  const confirmQ   = context?.confirmationQuality ? parseFloat(String(context.confirmationQuality)) : null;
  const tiScore    = context?.traderIntelligenceScore ? parseFloat(String(context.traderIntelligenceScore)) : null;
  const liqScore   = context?.liquidityScore ? parseFloat(String(context.liquidityScore)) : null;
  const traderConf = context?.confidence ?? null;
  const screenshotCnt = screenshots.length;

  const featureVector = buildFeatureVector({
    pnlPips,
    riskReward,
    durationMins:       duration,
    volatilityScore:    context?.volatilityScore ? parseFloat(String(context.volatilityScore)) : null,
    confirmationQuality: confirmQ,
    tiScore,
    liquidityScore:     liqScore,
    spreadPips:         spread,
    traderConfidence:   traderConf,
    screenshotCount:    screenshotCnt,
  });

  // Integrity score: count of populated key fields (0-1)
  const keyFields = [pair, direction, session, regime, outcome, context?.manualNotes || context?.lessonsLearned];
  const populated = keyFields.filter(Boolean).length;
  const integrityScore = (populated / keyFields.length + (screenshotCnt > 0 ? 0.2 : 0)) / 1.2;

  const hasContext     = !!context;
  const hasScreenshots = screenshotCnt > 0;
  const hasReview      = !!context?.reviewedAt;
  const hasLessons     = !!(context?.lessonsLearned?.trim());

  const values = {
    tradeId,
    setupId:          openEvent?.setupId ?? null,
    snapshotId:       openEvent?.snapshotId ?? null,
    contextId:        context?.id ?? null,
    pair:             pair ?? null,
    direction:        direction ?? null,
    session:          session ?? null,
    marketRegime:     typeof regime === "string" ? regime : null,
    amdStage:         context?.amdStage ?? null,
    outcome:          outcome ?? null,
    dayOfWeek:        context?.dayOfWeek ?? null,
    volatility:       context?.volatility ?? null,
    htfBias:          context?.htfBias ?? null,
    emotionTag:       context?.emotionTag ?? null,
    strategyVersion:  context?.strategyVersion ?? "2.0",
    pnlPips:          pnlPips != null    ? String(pnlPips)    : null,
    riskReward:       riskReward != null ? String(riskReward) : null,
    durationMins:     duration,
    confidenceScore:  confirmQ   != null ? String(confirmQ)   : null,
    zoneQuality:      null,
    liquidityScore:   liqScore   != null ? String(liqScore)   : null,
    amdQuality:       null,
    spreadPips:       spread     != null ? String(spread)     : null,
    traderConfidence: traderConf,
    hasContext,
    hasScreenshots,
    hasReview,
    hasLessons,
    screenshotCount:  screenshotCnt,
    eventCount:       events.length,
    relationshipCount: rels.length,
    featureVector,
    similarityMetadata: { nearestNeighbours: [], similarityScores: [], lastComputedAt: null },
    embeddingPlaceholder: { model: null, dims: null, computed: false, vectorId: null },
    integrityScore:   String(Math.min(1, Math.max(0, integrityScore))),
    brokenLinks:      0,
    dataQualityNotes: hasContext && hasScreenshots ? null : [
      !hasContext     ? "No context record" : null,
      !hasScreenshots ? "No screenshots"    : null,
    ].filter(Boolean).join("; ") || null,
    lastValidatedAt:  new Date(),
    tradeOpenedAt:    openEvent?.occurredAt  ?? null,
    tradeClosedAt:    closeEvent?.occurredAt ?? null,
    updatedAt:        new Date(),
  };

  const [record] = await db
    .insert(memoryExperiencesTable)
    .values({ ...values, createdAt: new Date() })
    .onConflictDoUpdate({
      target: memoryExperiencesTable.tradeId,
      set:    { ...values, createdAt: undefined },
    })
    .returning();

  return record!;
}

// ─── Retrieve Experience ──────────────────────────────────────────────────────

/**
 * Retrieves a full Experience object by its experienceId (UUID).
 * Hydrates all related data: context, screenshots, timeline, relationships.
 */
export async function getExperience(experienceId: string): Promise<ExperienceObject | null> {
  const rows = await db
    .select()
    .from(memoryExperiencesTable)
    .where(eq(memoryExperiencesTable.experienceId, experienceId))
    .limit(1);

  if (!rows[0]) return null;
  return hydrateExperience(rows[0]);
}

/**
 * Retrieves a full Experience object by trade ID.
 */
export async function getExperienceByTradeId(tradeId: number): Promise<ExperienceObject | null> {
  const rows = await db
    .select()
    .from(memoryExperiencesTable)
    .where(eq(memoryExperiencesTable.tradeId, tradeId))
    .limit(1);

  if (!rows[0]) return null;
  return hydrateExperience(rows[0]);
}

/**
 * Hydrates a raw experience record with all related data.
 */
async function hydrateExperience(row: typeof memoryExperiencesTable.$inferSelect): Promise<ExperienceObject> {
  const tradeId = row.tradeId!;

  const [ctx, screenshots, events, ctxEvents, rels] = await Promise.all([
    db.select().from(tradeContextTable).where(eq(tradeContextTable.tradeId, tradeId)).limit(1),
    db.select({
      id:           tradeScreenshotsTable.id,
      stage:        tradeScreenshotsTable.stage,
      thumbnailData: tradeScreenshotsTable.thumbnailData,
      capturedAt:   tradeScreenshotsTable.capturedAt,
    }).from(tradeScreenshotsTable).where(eq(tradeScreenshotsTable.tradeId, tradeId)),
    db.select().from(tradeEventsTable).where(eq(tradeEventsTable.tradeId, tradeId)).orderBy(asc(tradeEventsTable.occurredAt)),
    db.select().from(contextTimelineEventsTable).where(eq(contextTimelineEventsTable.tradeId, tradeId)).orderBy(asc(contextTimelineEventsTable.occurredAt)),
    db.select({ relType: memoryRelationshipsTable.relType, toType: memoryRelationshipsTable.toType, toId: memoryRelationshipsTable.toId })
      .from(memoryRelationshipsTable)
      .where(and(eq(memoryRelationshipsTable.fromType, "trade"), eq(memoryRelationshipsTable.fromId, String(tradeId)))),
  ]);

  // Build merged timeline
  const timeline: Array<{ stage: string; title: string; description: string | null; occurredAt: Date; type: string }> = [
    ...events.map(e => ({
      stage:       e.eventType,
      title:       formatEventTitle(e.eventType),
      description: e.eventType === "closed" ? `${e.outcome?.toUpperCase() ?? "?"} | R:R ${e.riskReward} | ${e.pnlPips}p` : null,
      occurredAt:  e.occurredAt,
      type:        "engine" as const,
    })),
    ...ctxEvents.map(e => ({
      stage:       e.stage,
      title:       e.title,
      description: e.description,
      occurredAt:  e.occurredAt,
      type:        "context" as const,
    })),
    ...screenshots.map(s => ({
      stage:       "screenshot_saved",
      title:       `Screenshot — ${s.stage}`,
      description: null,
      occurredAt:  s.capturedAt ?? new Date(),
      type:        "screenshot" as const,
    })),
  ].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const context = ctx[0];

  return {
    experienceId:    row.experienceId,
    tradeId:         row.tradeId,
    setupId:         row.setupId,
    snapshotId:      row.snapshotId,
    pair:            row.pair,
    direction:       row.direction,
    session:         row.session,
    marketRegime:    row.marketRegime,
    amdStage:        row.amdStage,
    outcome:         row.outcome,
    dayOfWeek:       row.dayOfWeek,
    volatility:      row.volatility,
    htfBias:         row.htfBias,
    emotionTag:      row.emotionTag,
    pnlPips:         row.pnlPips        ? parseFloat(row.pnlPips)        : null,
    riskReward:      row.riskReward     ? parseFloat(row.riskReward)     : null,
    durationMins:    row.durationMins,
    zoneQuality:     row.zoneQuality    ? parseFloat(row.zoneQuality)    : null,
    liquidityScore:  row.liquidityScore ? parseFloat(row.liquidityScore) : null,
    amdQuality:      row.amdQuality     ? parseFloat(row.amdQuality)     : null,
    spreadPips:      row.spreadPips     ? parseFloat(row.spreadPips)     : null,
    confidenceScore: row.confidenceScore? parseFloat(row.confidenceScore): null,
    traderConfidence: row.traderConfidence,
    hasContext:       row.hasContext     ?? false,
    hasScreenshots:   row.hasScreenshots ?? false,
    hasReview:        row.hasReview      ?? false,
    hasLessons:       row.hasLessons     ?? false,
    screenshotCount:  row.screenshotCount  ?? 0,
    eventCount:       row.eventCount       ?? 0,
    relationshipCount: row.relationshipCount ?? 0,
    context:         context ? { ...context } as Record<string, unknown> : null,
    screenshots,
    timeline,
    relationships:   rels,
    notes:           context?.manualNotes  ?? null,
    lessons:         context?.lessonsLearned ?? null,
    reviewSummary:   context?.reviewedAt ? `Reviewed at ${context.reviewedAt.toISOString()}` : null,
    featureVector:         (row.featureVector as number[])   ?? [0,0,0,0,0,0,0,0,0,0],
    similarityMetadata:    (row.similarityMetadata as { nearestNeighbours: string[]; similarityScores: number[]; lastComputedAt: string | null }) ?? { nearestNeighbours: [], similarityScores: [], lastComputedAt: null },
    embeddingPlaceholder:  (row.embeddingPlaceholder as { model: string | null; dims: number | null; computed: boolean; vectorId: string | null }) ?? { model: null, dims: null, computed: false, vectorId: null },
    integrityScore:  row.integrityScore  ? parseFloat(row.integrityScore)  : null,
    brokenLinks:     row.brokenLinks     ?? 0,
    dataQualityNotes: row.dataQualityNotes ?? null,
    lastValidatedAt: row.lastValidatedAt ?? null,
    tradeOpenedAt:   row.tradeOpenedAt   ?? null,
    tradeClosedAt:   row.tradeClosedAt   ?? null,
    createdAt:       row.createdAt,
    updatedAt:       row.updatedAt,
  };
}

function formatEventTitle(eventType: string): string {
  const map: Record<string, string> = {
    opened: "Trade Entry", closed: "Trade Exit", break_even: "Break Even",
    partial_close: "Partial Close", trailing_stop: "Trailing Stop",
  };
  return map[eventType] ?? eventType.replace(/_/g, " ");
}

// ─── Compound Search ──────────────────────────────────────────────────────────

/**
 * Compound filter search across all experience records.
 * Returns lightweight metadata rows (not hydrated).
 */
export async function searchExperiences(opts: ExperienceSearchOptions): Promise<{
  total:    number;
  results:  typeof memoryExperiencesTable.$inferSelect[];
}> {
  const limit  = Math.min(opts.limit  ?? 50, 200);
  const offset = opts.offset ?? 0;

  let query = db.select().from(memoryExperiencesTable).$dynamic();
  const conditions: ReturnType<typeof eq>[] = [];

  if (opts.pair)        conditions.push(eq(memoryExperiencesTable.pair,        opts.pair.toUpperCase()));
  if (opts.session)     conditions.push(eq(memoryExperiencesTable.session,     opts.session));
  if (opts.marketRegime)conditions.push(eq(memoryExperiencesTable.marketRegime,opts.marketRegime));
  if (opts.outcome)     conditions.push(eq(memoryExperiencesTable.outcome,     opts.outcome));
  if (opts.direction)   conditions.push(eq(memoryExperiencesTable.direction,   opts.direction));
  if (opts.volatility)  conditions.push(eq(memoryExperiencesTable.volatility,  opts.volatility));
  if (opts.emotionTag)  conditions.push(eq(memoryExperiencesTable.emotionTag,  opts.emotionTag));
  if (opts.dayOfWeek)   conditions.push(eq(memoryExperiencesTable.dayOfWeek,   opts.dayOfWeek));
  if (opts.htfBias)     conditions.push(eq(memoryExperiencesTable.htfBias,     opts.htfBias));

  if (opts.hasLessons    === true)  conditions.push(eq(memoryExperiencesTable.hasLessons,   true));
  if (opts.hasScreenshots === true) conditions.push(eq(memoryExperiencesTable.hasScreenshots, true));
  if (opts.hasReview     === true)  conditions.push(eq(memoryExperiencesTable.hasReview,    true));

  if (opts.dateFrom) conditions.push(gte(memoryExperiencesTable.tradeOpenedAt, new Date(opts.dateFrom)) as ReturnType<typeof eq>);
  if (opts.dateTo)   conditions.push(lte(memoryExperiencesTable.tradeOpenedAt, new Date(opts.dateTo))   as ReturnType<typeof eq>);

  // Numeric range filters (cast to numeric for comparison)
  if (opts.pnlMin   != null) conditions.push(sql`CAST(${memoryExperiencesTable.pnlPips} AS NUMERIC) >= ${opts.pnlMin}` as ReturnType<typeof eq>);
  if (opts.pnlMax   != null) conditions.push(sql`CAST(${memoryExperiencesTable.pnlPips} AS NUMERIC) <= ${opts.pnlMax}` as ReturnType<typeof eq>);
  if (opts.rrMin    != null) conditions.push(sql`CAST(${memoryExperiencesTable.riskReward} AS NUMERIC) >= ${opts.rrMin}` as ReturnType<typeof eq>);
  if (opts.rrMax    != null) conditions.push(sql`CAST(${memoryExperiencesTable.riskReward} AS NUMERIC) <= ${opts.rrMax}` as ReturnType<typeof eq>);
  if (opts.confidenceMin != null) conditions.push(sql`CAST(${memoryExperiencesTable.confidenceScore} AS NUMERIC) >= ${opts.confidenceMin}` as ReturnType<typeof eq>);
  if (opts.confidenceMax != null) conditions.push(sql`CAST(${memoryExperiencesTable.confidenceScore} AS NUMERIC) <= ${opts.confidenceMax}` as ReturnType<typeof eq>);
  if (opts.liquidityScoreMin != null) conditions.push(sql`CAST(${memoryExperiencesTable.liquidityScore} AS NUMERIC) >= ${opts.liquidityScoreMin}` as ReturnType<typeof eq>);
  if (opts.liquidityScoreMax != null) conditions.push(sql`CAST(${memoryExperiencesTable.liquidityScore} AS NUMERIC) <= ${opts.liquidityScoreMax}` as ReturnType<typeof eq>);
  if (opts.zoneQualityMin != null) conditions.push(sql`CAST(${memoryExperiencesTable.zoneQuality} AS NUMERIC) >= ${opts.zoneQualityMin}` as ReturnType<typeof eq>);
  if (opts.zoneQualityMax != null) conditions.push(sql`CAST(${memoryExperiencesTable.zoneQuality} AS NUMERIC) <= ${opts.zoneQualityMax}` as ReturnType<typeof eq>);

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  // Order
  const orderMap = {
    newest:   desc(memoryExperiencesTable.tradeOpenedAt),
    oldest:   asc(memoryExperiencesTable.tradeOpenedAt),
    pnl_desc: desc(memoryExperiencesTable.pnlPips),
    pnl_asc:  asc(memoryExperiencesTable.pnlPips),
    rr_desc:  desc(memoryExperiencesTable.riskReward),
  };
  const orderClause = orderMap[opts.orderBy ?? "newest"] ?? orderMap.newest;

  const results = await query.orderBy(orderClause).limit(limit).offset(offset);
  return { total: results.length, results };
}

/**
 * Lists experiences without compound search (paginated).
 */
export async function listExperiences(opts: { limit?: number; offset?: number }): Promise<{
  total:    number;
  results:  typeof memoryExperiencesTable.$inferSelect[];
}> {
  const limit  = Math.min(opts.limit  ?? 50, 200);
  const offset = opts.offset ?? 0;
  const results = await db
    .select()
    .from(memoryExperiencesTable)
    .orderBy(desc(memoryExperiencesTable.tradeOpenedAt))
    .limit(limit)
    .offset(offset);
  return { total: results.length, results };
}

// ─── Experience Timeline ──────────────────────────────────────────────────────

/**
 * Reconstructs the full experience timeline for a trade.
 * Merges: engine events → context timeline → screenshots
 * All timestamped, all typed.
 */
export async function getExperienceTimeline(tradeId: number): Promise<{
  tradeId:  number;
  count:    number;
  duration: number | null;
  events:   Array<{
    stage:       string;
    title:       string;
    description: string | null;
    occurredAt:  Date;
    type:        "engine" | "context" | "screenshot" | "review";
    meta?:       Record<string, unknown> | null;
  }>;
}> {
  const [engineEvents, ctxEvents, screenshots, reviews] = await Promise.all([
    db.select().from(tradeEventsTable).where(eq(tradeEventsTable.tradeId, tradeId)).orderBy(asc(tradeEventsTable.occurredAt)),
    db.select().from(contextTimelineEventsTable).where(eq(contextTimelineEventsTable.tradeId, tradeId)).orderBy(asc(contextTimelineEventsTable.occurredAt)),
    db.select({ stage: tradeScreenshotsTable.stage, capturedAt: tradeScreenshotsTable.capturedAt, uploadedAt: tradeScreenshotsTable.uploadedAt, id: tradeScreenshotsTable.id, notes: tradeScreenshotsTable.notes })
      .from(tradeScreenshotsTable).where(eq(tradeScreenshotsTable.tradeId, tradeId)).orderBy(asc(tradeScreenshotsTable.capturedAt)),
    db.select().from(tradeReviewsTable).where(eq(tradeReviewsTable.tradeId, tradeId)).orderBy(asc(tradeReviewsTable.reviewedAt)),
  ]);

  const events = [
    ...engineEvents.map(e => ({
      stage:       e.eventType,
      title:       formatEventTitle(e.eventType),
      description: e.eventType === "opened" ? `Entry @ ${e.price} | SL: ${e.stopLoss} | TP: ${e.takeProfit}` :
                   e.eventType === "closed"  ? `${e.outcome?.toUpperCase()} | ${e.pnlPips}p | R:R ${e.riskReward} | ${e.durationMins}m` : null,
      occurredAt:  e.occurredAt,
      type:        "engine" as const,
      meta:        { price: e.price, stopLoss: e.stopLoss, takeProfit: e.takeProfit, outcome: e.outcome, pnlPips: e.pnlPips, riskReward: e.riskReward },
    })),
    ...ctxEvents.map(e => ({
      stage:       e.stage,
      title:       e.title,
      description: e.description,
      occurredAt:  e.occurredAt,
      type:        "context" as const,
      meta:        e.meta as Record<string, unknown> | null,
    })),
    ...screenshots.map(s => ({
      stage:       "screenshot_saved",
      title:       `Screenshot — ${s.stage}`,
      description: s.notes ?? null,
      occurredAt:  s.capturedAt ?? s.uploadedAt,
      type:        "screenshot" as const,
      meta:        { screenshotId: s.id, stage: s.stage },
    })),
    ...reviews.map(r => ({
      stage:       "review",
      title:       "Trade Reviewed",
      description: r.notes ? r.notes.slice(0, 120) : null,
      occurredAt:  r.reviewedAt,
      type:        "review" as const,
      meta:        { reviewId: r.id },
    })),
  ].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  // Duration = from first to last event
  const first = events[0]?.occurredAt;
  const last  = events[events.length - 1]?.occurredAt;
  const duration = first && last ? Math.round((last.getTime() - first.getTime()) / 60000) : null;

  return { tradeId, count: events.length, duration, events };
}

// ─── Refresh All Experiences ──────────────────────────────────────────────────

/**
 * Rebuilds experience records for all trades that have events but no experience record.
 * Called from health check or on-demand repair.
 */
export async function backfillMissingExperiences(): Promise<{ created: number; errors: number }> {
  const allTradeIds = await db
    .selectDistinct({ tradeId: tradeEventsTable.tradeId })
    .from(tradeEventsTable)
    .where(isNotNull(tradeEventsTable.tradeId))
    .limit(500);

  const existingIds = await db
    .select({ tradeId: memoryExperiencesTable.tradeId })
    .from(memoryExperiencesTable)
    .where(isNotNull(memoryExperiencesTable.tradeId));

  const existingSet = new Set(existingIds.map(r => r.tradeId));
  const missing     = allTradeIds.filter(r => !existingSet.has(r.tradeId!));

  let created = 0;
  let errors  = 0;

  for (const { tradeId } of missing) {
    if (!tradeId) continue;
    try {
      await upsertExperienceRecord(tradeId);
      await autoLinkTradeChain({ tradeId });
      created++;
    } catch (err) {
      logger.warn({ err, tradeId }, "[EB] Failed to backfill experience");
      errors++;
    }
  }

  return { created, errors };
}
