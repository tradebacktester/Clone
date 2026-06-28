/**
 * Relationship Engine
 *
 * Manages the directed soft-link graph stored in memory_relationships.
 * All links are created, updated, validated, and repaired automatically.
 * No manual linking required from call sites — use the auto-link helpers.
 *
 * Entity types:  snapshot | setup | trade | context | screenshot | event | review | lesson
 * Relationship types:
 *   snapshot  → has_setup      → setup
 *   setup     → has_trade      → trade
 *   trade     → has_context    → context
 *   trade     → has_screenshot → screenshot
 *   trade     → has_event      → event  (count-based, not per-event)
 *   trade     → has_review     → review
 *   trade     → has_lesson     → lesson
 *   trade     → followed_by    → trade  (sequential chain)
 */

import { db } from "@workspace/db";
import {
  memoryRelationshipsTable,
  memoryRelationshipHistoryTable,
  tradeEventsTable,
  tradeScreenshotsTable,
  tradeContextTable,
} from "@workspace/db";
import { eq, and, or, sql, count } from "drizzle-orm";
import { logger } from "./logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EntityType =
  | "snapshot" | "setup" | "trade" | "context"
  | "screenshot" | "event" | "review" | "lesson";

export type RelType =
  | "has_snapshot" | "has_setup" | "has_trade" | "has_context"
  | "has_screenshot" | "has_event" | "has_review" | "has_lesson"
  | "followed_by" | "superseded_by" | "related_to";

export interface RelationshipNode {
  id:        number;
  fromType:  string;
  fromId:    string;
  toType:    string;
  toId:      string;
  relType:   string;
  strength:  string | null;
  meta:      Record<string, unknown> | null;
  createdAt: Date;
}

export interface ChainValidation {
  tradeId:       number;
  isComplete:    boolean;
  missingLinks:  string[];
  presentLinks:  string[];
  brokenLinks:   string[];
  score:         number; // 0-100
}

export interface OrphanReport {
  orphanedRelationships: Array<{ id: number; fromType: string; fromId: string; relType: string }>;
  count: number;
}

// ─── Core Relationship CRUD ────────────────────────────────────────────────────

/**
 * Ensures a relationship exists. Idempotent — safe to call multiple times.
 * Returns the relationship ID (new or existing).
 */
export async function ensureRelationship(
  fromType: EntityType,
  fromId:   string,
  toType:   EntityType,
  toId:     string,
  relType:  RelType,
  strength = "1.0",
  meta?:    Record<string, unknown>,
): Promise<number> {
  // Try to find existing
  const existing = await db
    .select({ id: memoryRelationshipsTable.id })
    .from(memoryRelationshipsTable)
    .where(and(
      eq(memoryRelationshipsTable.fromType, fromType),
      eq(memoryRelationshipsTable.fromId,   fromId),
      eq(memoryRelationshipsTable.toType,   toType),
      eq(memoryRelationshipsTable.toId,     toId),
      eq(memoryRelationshipsTable.relType,  relType),
    ))
    .limit(1);

  if (existing.length > 0) return existing[0]!.id;

  const [inserted] = await db
    .insert(memoryRelationshipsTable)
    .values({ fromType, fromId, toType, toId, relType, strength, meta })
    .returning({ id: memoryRelationshipsTable.id });

  const id = inserted!.id;

  // Audit log
  await logHistory(id, "created", { fromType, fromId, toType, toId, relType });
  return id;
}

/**
 * Removes a specific relationship by ID.
 */
export async function deleteRelationship(id: number): Promise<boolean> {
  const row = await db
    .select()
    .from(memoryRelationshipsTable)
    .where(eq(memoryRelationshipsTable.id, id))
    .limit(1);

  if (!row[0]) return false;

  await db.delete(memoryRelationshipsTable).where(eq(memoryRelationshipsTable.id, id));
  await logHistory(id, "deleted", {
    fromType: row[0].fromType, fromId: row[0].fromId,
    toType:   row[0].toType,   toId:   row[0].toId,
    relType:  row[0].relType,
  });
  return true;
}

/**
 * Returns all relationships where this entity is the source (outgoing).
 */
export async function getOutgoing(type: EntityType, id: string): Promise<RelationshipNode[]> {
  return db
    .select()
    .from(memoryRelationshipsTable)
    .where(and(
      eq(memoryRelationshipsTable.fromType, type),
      eq(memoryRelationshipsTable.fromId,   id),
    )) as Promise<RelationshipNode[]>;
}

/**
 * Returns all relationships where this entity is the target (incoming).
 */
export async function getIncoming(type: EntityType, id: string): Promise<RelationshipNode[]> {
  return db
    .select()
    .from(memoryRelationshipsTable)
    .where(and(
      eq(memoryRelationshipsTable.toType, type),
      eq(memoryRelationshipsTable.toId,   id),
    )) as Promise<RelationshipNode[]>;
}

/**
 * Returns both incoming and outgoing relationships for an entity.
 */
export async function getRelationshipsForEntity(
  type: EntityType,
  id:   string,
): Promise<{ outgoing: RelationshipNode[]; incoming: RelationshipNode[] }> {
  const [outgoing, incoming] = await Promise.all([
    getOutgoing(type, id),
    getIncoming(type, id),
  ]);
  return { outgoing, incoming };
}

/**
 * Returns all relationships for a trade (all directions combined).
 */
export async function getAllTradeRelationships(tradeId: number): Promise<RelationshipNode[]> {
  const tradeIdStr = String(tradeId);
  const rows = await db
    .select()
    .from(memoryRelationshipsTable)
    .where(or(
      and(eq(memoryRelationshipsTable.fromType, "trade"), eq(memoryRelationshipsTable.fromId, tradeIdStr)),
      and(eq(memoryRelationshipsTable.toType,   "trade"), eq(memoryRelationshipsTable.toId,   tradeIdStr)),
    ));
  return rows as RelationshipNode[];
}

// ─── Auto-Linking ─────────────────────────────────────────────────────────────

/**
 * Builds the full relationship chain for a trade.
 * Called automatically when a trade opens and again when it closes.
 * Safe to call multiple times — ensureRelationship is idempotent.
 */
export async function autoLinkTradeChain(opts: {
  tradeId:     number;
  setupId?:    string | null;
  snapshotId?: string | null;
  contextId?:  string | null;
}): Promise<{ linksCreated: number; linksExisting: number }> {
  const { tradeId, setupId, snapshotId, contextId } = opts;
  const tid = String(tradeId);
  let created  = 0;
  let existing = 0;

  const link = async (
    ft: EntityType, fi: string,
    tt: EntityType, ti: string,
    rt: RelType,
  ) => {
    const prev = await db
      .select({ id: memoryRelationshipsTable.id })
      .from(memoryRelationshipsTable)
      .where(and(
        eq(memoryRelationshipsTable.fromType, ft),
        eq(memoryRelationshipsTable.fromId,   fi),
        eq(memoryRelationshipsTable.toType,   tt),
        eq(memoryRelationshipsTable.toId,     ti),
        eq(memoryRelationshipsTable.relType,  rt),
      ))
      .limit(1);

    if (prev.length > 0) { existing++; return; }

    await ensureRelationship(ft, fi, tt, ti, rt);
    created++;
  };

  // snapshot → has_setup → setup
  if (snapshotId && setupId) {
    await link("snapshot", snapshotId, "setup", setupId, "has_setup");
  }

  // setup → has_trade → trade
  if (setupId) {
    await link("setup", setupId, "trade", tid, "has_trade");
  }

  // trade → has_context → context
  if (contextId) {
    await link("trade", tid, "context", contextId, "has_context");
  } else {
    // Try to find context by tradeId
    const ctx = await db
      .select({ id: tradeContextTable.id })
      .from(tradeContextTable)
      .where(eq(tradeContextTable.tradeId, tradeId))
      .limit(1);
    if (ctx[0]) {
      await link("trade", tid, "context", ctx[0].id, "has_context");
    }
  }

  // trade → has_screenshot → screenshot (per screenshot)
  const screenshots = await db
    .select({ id: tradeScreenshotsTable.id })
    .from(tradeScreenshotsTable)
    .where(eq(tradeScreenshotsTable.tradeId, tradeId));
  for (const ss of screenshots) {
    await link("trade", tid, "screenshot", ss.id, "has_screenshot");
  }

  logger.debug({ tradeId, created, existing }, "[RE] Trade chain auto-linked");
  return { linksCreated: created, linksExisting: existing };
}

/**
 * Links a review / lesson to its trade.
 * Called when a review or lesson is saved.
 */
export async function linkReviewToTrade(tradeId: number, reviewId: string, hasLesson: boolean): Promise<void> {
  const tid = String(tradeId);
  await ensureRelationship("trade", tid, "review", reviewId, "has_review");
  if (hasLesson) {
    await ensureRelationship("trade", tid, "lesson", reviewId, "has_lesson");
  }
}

/**
 * Links two trades as sequential experiences (trade B follows trade A).
 */
export async function linkSequentialTrades(fromTradeId: number, toTradeId: number): Promise<void> {
  await ensureRelationship("trade", String(fromTradeId), "trade", String(toTradeId), "followed_by");
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates the relationship chain for a single trade.
 * Returns a score 0–100 and a list of missing/broken links.
 */
export async function validateTradeChain(tradeId: number): Promise<ChainValidation> {
  const tid     = String(tradeId);
  const allRels = await getAllTradeRelationships(tradeId);

  const relTypes = new Set(allRels.map(r =>
    r.fromId === tid ? r.relType : `←${r.relType}`
  ));

  // Expected links for a complete experience
  const expectedLinks = ["has_setup", "has_context", "has_screenshot", "has_review"];
  const missingLinks:  string[] = [];
  const presentLinks:  string[] = [];
  const brokenLinks:   string[] = [];

  for (const expected of expectedLinks) {
    if (relTypes.has(expected) || allRels.some(r => r.relType === expected && r.fromId === tid)) {
      presentLinks.push(expected);
    } else {
      missingLinks.push(expected);
    }
  }

  // has_setup comes from setup→trade direction
  const hasSetup = allRels.some(r => r.relType === "has_trade" && r.toId === tid);
  if (hasSetup && !presentLinks.includes("has_setup")) {
    presentLinks.push("has_setup");
    missingLinks.splice(missingLinks.indexOf("has_setup"), 1);
  }

  const score = Math.round((presentLinks.length / expectedLinks.length) * 100);

  return {
    tradeId,
    isComplete:   missingLinks.length === 0,
    missingLinks,
    presentLinks,
    brokenLinks,
    score,
  };
}

// ─── Orphan Detection & Repair ────────────────────────────────────────────────

/**
 * Detects relationships that reference entities which no longer exist.
 * Checks screenshot and context IDs against their respective tables.
 * Returns an orphan report (does NOT auto-delete; call removeOrphans() to clean up).
 */
export async function detectOrphanedRelationships(): Promise<OrphanReport> {
  const allRels = await db.select().from(memoryRelationshipsTable);
  const orphaned: Array<{ id: number; fromType: string; fromId: string; relType: string }> = [];

  // Batch: check screenshot relationships
  const screenshotRels = allRels.filter(r => r.toType === "screenshot");
  if (screenshotRels.length > 0) {
    const ssIds = screenshotRels.map(r => r.toId);
    const existing = await db
      .select({ id: tradeScreenshotsTable.id })
      .from(tradeScreenshotsTable)
      .where(sql`${tradeScreenshotsTable.id}::text = ANY(ARRAY[${sql.raw(ssIds.map(id => `'${id}'`).join(","))}])`);
    const existingIds = new Set(existing.map(r => r.id));
    for (const rel of screenshotRels) {
      if (!existingIds.has(rel.toId)) orphaned.push({ id: rel.id, fromType: rel.fromType, fromId: rel.fromId, relType: rel.relType });
    }
  }

  // Batch: check context relationships
  const contextRels = allRels.filter(r => r.toType === "context");
  if (contextRels.length > 0) {
    const ctxIds = contextRels.map(r => r.toId);
    const existing = await db
      .select({ id: tradeContextTable.id })
      .from(tradeContextTable)
      .where(sql`${tradeContextTable.id}::text = ANY(ARRAY[${sql.raw(ctxIds.map(id => `'${id}'`).join(","))}])`);
    const existingIds = new Set(existing.map(r => r.id));
    for (const rel of contextRels) {
      if (!existingIds.has(rel.toId)) orphaned.push({ id: rel.id, fromType: rel.fromType, fromId: rel.fromId, relType: rel.relType });
    }
  }

  return { orphanedRelationships: orphaned, count: orphaned.length };
}

/**
 * Removes all detected orphaned relationships and logs them.
 */
export async function removeOrphans(): Promise<{ removed: number }> {
  const report = await detectOrphanedRelationships();
  let removed  = 0;

  for (const orphan of report.orphanedRelationships) {
    await db.delete(memoryRelationshipsTable).where(eq(memoryRelationshipsTable.id, orphan.id));
    await logHistory(orphan.id, "orphan_removed", {
      fromType: orphan.fromType,
      fromId:   orphan.fromId,
      relType:  orphan.relType,
    });
    removed++;
  }

  if (removed > 0) {
    logger.info({ removed }, "[RE] Orphaned relationships removed");
  }

  return { removed };
}

/**
 * Detects trades that have no relationships at all (isolated nodes).
 */
export async function detectBrokenChains(limit = 50): Promise<number[]> {
  // Get all trade IDs referenced in relationships
  const linkedTrades = await db
    .select({ tradeId: memoryRelationshipsTable.toId })
    .from(memoryRelationshipsTable)
    .where(and(
      eq(memoryRelationshipsTable.toType, "trade"),
    ));

  const linkedSet = new Set(linkedTrades.map(r => r.tradeId));

  // Get all trade IDs from events table (which covers all trades that opened)
  const allTradeIds = await db
    .selectDistinct({ tradeId: tradeEventsTable.tradeId })
    .from(tradeEventsTable)
    .limit(limit * 3);

  const broken = allTradeIds
    .filter(r => r.tradeId !== null && !linkedSet.has(String(r.tradeId)))
    .map(r => r.tradeId!)
    .slice(0, limit);

  return broken;
}

/**
 * Repairs a broken chain by re-running autoLink for a trade.
 * Returns number of links created.
 */
export async function repairTradeChain(tradeId: number): Promise<{ linksCreated: number }> {
  const result = await autoLinkTradeChain({ tradeId });
  if (result.linksCreated > 0) {
    logger.info({ tradeId, linksCreated: result.linksCreated }, "[RE] Trade chain repaired");
  }
  return { linksCreated: result.linksCreated };
}

// ─── Relationship Statistics ──────────────────────────────────────────────────

export async function getRelationshipStats(): Promise<{
  total:        number;
  byRelType:    Record<string, number>;
  byFromType:   Record<string, number>;
  densityScore: number;
}> {
  const allRels = await db.select().from(memoryRelationshipsTable);

  const byRelType: Record<string, number>  = {};
  const byFromType: Record<string, number> = {};

  for (const rel of allRels) {
    byRelType[rel.relType]   = (byRelType[rel.relType]   ?? 0) + 1;
    byFromType[rel.fromType] = (byFromType[rel.fromType] ?? 0) + 1;
  }

  // Density = relationships / max possible (simple heuristic)
  const uniqueEntities = new Set([
    ...allRels.map(r => `${r.fromType}:${r.fromId}`),
    ...allRels.map(r => `${r.toType}:${r.toId}`),
  ]).size;

  const maxEdges      = uniqueEntities * (uniqueEntities - 1);
  const densityScore  = maxEdges > 0 ? Math.min(100, Math.round((allRels.length / maxEdges) * 100 * 20)) : 0;

  return { total: allRels.length, byRelType, byFromType, densityScore };
}

// ─── History ──────────────────────────────────────────────────────────────────

async function logHistory(
  relationshipId: number,
  action:         string,
  meta:           Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(memoryRelationshipHistoryTable).values({
      relationshipId,
      action,
      fromType:   String(meta.fromType ?? ""),
      fromId:     String(meta.fromId   ?? ""),
      toType:     String(meta.toType   ?? ""),
      toId:       String(meta.toId     ?? ""),
      relType:    String(meta.relType  ?? ""),
      meta,
      occurredAt: new Date(),
    });
  } catch {
    // Non-fatal — don't block the main operation
  }
}

export async function getRelationshipHistory(limit = 100): Promise<typeof memoryRelationshipHistoryTable.$inferSelect[]> {
  return db
    .select()
    .from(memoryRelationshipHistoryTable)
    .orderBy(memoryRelationshipHistoryTable.occurredAt)
    .limit(limit);
}
