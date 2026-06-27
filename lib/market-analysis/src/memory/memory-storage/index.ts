// ─── Memory Storage ────────────────────────────────────────────────────────
// Raw DB access layer for the memory system.
// Only MemoryService should call these functions — never route handlers directly.

import { db } from "@workspace/db";
import {
  setupMemoryTable,
  skippedSetupMemoryTable,
  marketSnapshotMemoryTable,
  memoryMetadataTable,
  tradeMemoryTable,
  type InsertSetupMemory,
  type InsertSkippedSetupMemory,
  type InsertMarketSnapshotMemory,
  type InsertMemoryMetadata,
  type SetupMemory,
  type SkippedSetupMemory,
  type MarketSnapshotMemory,
  type MemoryMetadata,
  type TradeMemory,
} from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { normalisePagination } from "../memory-search/index.js";
import type { PaginationParams } from "../memory-search/index.js";

// ─── Setup Memory Storage ──────────────────────────────────────────────────

export async function insertSetupMemory(data: InsertSetupMemory): Promise<SetupMemory> {
  const [row] = await db.insert(setupMemoryTable).values(data).returning();
  return row;
}

export async function updateSetupMemory(
  id: string,
  data: Partial<InsertSetupMemory>,
): Promise<SetupMemory | null> {
  const [row] = await db
    .update(setupMemoryTable)
    .set(data)
    .where(eq(setupMemoryTable.id, id))
    .returning();
  return row ?? null;
}

export async function deleteSetupMemory(id: string): Promise<boolean> {
  const result = await db
    .delete(setupMemoryTable)
    .where(eq(setupMemoryTable.id, id))
    .returning({ id: setupMemoryTable.id });
  return result.length > 0;
}

export async function findSetupMemory(
  where?: SQL,
  pagination?: PaginationParams,
): Promise<{ data: SetupMemory[]; total: number }> {
  const pg = pagination ?? normalisePagination(50, 0);

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(setupMemoryTable)
      .where(where)
      .orderBy(desc(setupMemoryTable.evaluatedAt))
      .limit(pg.limit)
      .offset(pg.offset),
    db.select({ total: count() }).from(setupMemoryTable).where(where),
  ]);

  return { data: rows, total: totalRows[0]?.total ?? 0 };
}

export async function findSetupMemoryById(id: string): Promise<SetupMemory | null> {
  const [row] = await db
    .select()
    .from(setupMemoryTable)
    .where(eq(setupMemoryTable.id, id))
    .limit(1);
  return row ?? null;
}

// ─── Skipped Setup Storage ─────────────────────────────────────────────────

export async function insertSkippedSetupMemory(data: InsertSkippedSetupMemory): Promise<SkippedSetupMemory> {
  const [row] = await db.insert(skippedSetupMemoryTable).values(data).returning();
  return row;
}

export async function updateSkippedSetupMemory(
  id: string,
  data: Partial<InsertSkippedSetupMemory>,
): Promise<SkippedSetupMemory | null> {
  const [row] = await db
    .update(skippedSetupMemoryTable)
    .set(data)
    .where(eq(skippedSetupMemoryTable.id, id))
    .returning();
  return row ?? null;
}

export async function findSkippedSetupMemory(
  where?: SQL,
  pagination?: PaginationParams,
): Promise<{ data: SkippedSetupMemory[]; total: number }> {
  const pg = pagination ?? normalisePagination(50, 0);

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(skippedSetupMemoryTable)
      .where(where)
      .orderBy(desc(skippedSetupMemoryTable.createdAt))
      .limit(pg.limit)
      .offset(pg.offset),
    db.select({ total: count() }).from(skippedSetupMemoryTable).where(where),
  ]);

  return { data: rows, total: totalRows[0]?.total ?? 0 };
}

export async function findSkippedSetupMemoryById(id: string): Promise<SkippedSetupMemory | null> {
  const [row] = await db
    .select()
    .from(skippedSetupMemoryTable)
    .where(eq(skippedSetupMemoryTable.id, id))
    .limit(1);
  return row ?? null;
}

// ─── Market Snapshot Storage ───────────────────────────────────────────────

export async function insertMarketSnapshot(data: InsertMarketSnapshotMemory): Promise<MarketSnapshotMemory> {
  const [row] = await db.insert(marketSnapshotMemoryTable).values(data).returning();
  return row;
}

export async function findMarketSnapshots(
  where?: SQL,
  pagination?: PaginationParams,
): Promise<{ data: MarketSnapshotMemory[]; total: number }> {
  const pg = pagination ?? normalisePagination(50, 0);

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(marketSnapshotMemoryTable)
      .where(where)
      .orderBy(desc(marketSnapshotMemoryTable.capturedAt))
      .limit(pg.limit)
      .offset(pg.offset),
    db.select({ total: count() }).from(marketSnapshotMemoryTable).where(where),
  ]);

  return { data: rows, total: totalRows[0]?.total ?? 0 };
}

export async function findMarketSnapshotById(id: string): Promise<MarketSnapshotMemory | null> {
  const [row] = await db
    .select()
    .from(marketSnapshotMemoryTable)
    .where(eq(marketSnapshotMemoryTable.id, id))
    .limit(1);
  return row ?? null;
}

// ─── Memory Metadata Storage ───────────────────────────────────────────────

export async function upsertMemoryMetadata(data: InsertMemoryMetadata): Promise<MemoryMetadata> {
  const [row] = await db
    .insert(memoryMetadataTable)
    .values(data)
    .onConflictDoUpdate({
      target: [memoryMetadataTable.recordId, memoryMetadataTable.recordTable],
      set: {
        dataHash:         data.dataHash,
        isValid:          data.isValid,
        validationErrors: data.validationErrors,
        recordVersion:    data.recordVersion,
        updatedAt:        new Date(),
      },
    })
    .returning();
  return row;
}

export async function findMetadataForRecord(
  recordId: string,
  recordTable: string,
): Promise<MemoryMetadata | null> {
  const [row] = await db
    .select()
    .from(memoryMetadataTable)
    .where(
      and(
        eq(memoryMetadataTable.recordId, recordId),
        eq(memoryMetadataTable.recordTable, recordTable),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findInvalidMetadata(limit = 100): Promise<MemoryMetadata[]> {
  return db
    .select()
    .from(memoryMetadataTable)
    .where(eq(memoryMetadataTable.isValid, false))
    .orderBy(desc(memoryMetadataTable.createdAt))
    .limit(limit);
}

// ─── Trade Memory Storage (read-only passthrough) ──────────────────────────
// trade_memory rows are written by the paper/live engine hooks.
// MemoryService exposes reads through this layer.

export async function findTradeMemory(
  where?: SQL,
  pagination?: PaginationParams,
): Promise<{ data: TradeMemory[]; total: number }> {
  const pg = pagination ?? normalisePagination(50, 0);

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(tradeMemoryTable)
      .where(where)
      .orderBy(desc(tradeMemoryTable.openedAt))
      .limit(pg.limit)
      .offset(pg.offset),
    db.select({ total: count() }).from(tradeMemoryTable).where(where),
  ]);

  return { data: rows, total: totalRows[0]?.total ?? 0 };
}
