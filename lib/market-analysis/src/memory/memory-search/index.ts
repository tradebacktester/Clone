// ─── Memory Search ─────────────────────────────────────────────────────────
// Provides composable filter builders and pagination utilities.
// All query construction passes through here — routes and MemoryService
// use these helpers to build type-safe, performant queries.

import { and, eq, gte, lte, desc, asc, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import {
  setupMemoryTable,
  skippedSetupMemoryTable,
  marketSnapshotMemoryTable,
  tradeMemoryTable,
} from "@workspace/db";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PaginationParams {
  limit:  number;
  offset: number;
}

export interface PaginatedResult<T> {
  data:    T[];
  total:   number;
  limit:   number;
  offset:  number;
  hasMore: boolean;
}

export interface CommonFilters {
  pair?:      string;
  direction?: string;
  session?:   string;
  regime?:    string;
  dateFrom?:  Date;
  dateTo?:    Date;
}

export interface SetupSearchFilters extends CommonFilters {
  isAccepted?: boolean;
  isValid?:    boolean;
  minConfidence?: number;
}

export interface SkippedSearchFilters extends CommonFilters {
  skipReason?:    string;
  rejectingRule?: string;
}

export interface SnapshotSearchFilters {
  pair?:     string;
  session?:  string;
  dateFrom?: Date;
  dateTo?:   Date;
}

export interface TradeMemoryFilters extends CommonFilters {
  outcome?:   string;
  clusterKey?: string;
}

// ─── Normalise Pagination ──────────────────────────────────────────────────

export function normalisePagination(
  rawLimit: unknown,
  rawOffset: unknown,
  maxLimit = 500,
): PaginationParams {
  const limit  = Math.min(Math.max(1, parseInt(String(rawLimit ?? "50"))),  maxLimit);
  const offset = Math.max(0, parseInt(String(rawOffset ?? "0")));
  return { limit, offset };
}

export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  params: PaginationParams,
): PaginatedResult<T> {
  return {
    data,
    total,
    limit:   params.limit,
    offset:  params.offset,
    hasMore: params.offset + data.length < total,
  };
}

// ─── Setup Memory Filters ──────────────────────────────────────────────────

export function buildSetupFilters(filters: SetupSearchFilters): SQL | undefined {
  const conditions: SQL[] = [];

  if (filters.pair)
    conditions.push(eq(setupMemoryTable.pair, filters.pair.toUpperCase()));
  if (filters.direction)
    conditions.push(eq(setupMemoryTable.direction, filters.direction.toLowerCase()));
  if (filters.session)
    conditions.push(eq(setupMemoryTable.session, filters.session.toLowerCase()));
  if (filters.regime)
    conditions.push(eq(setupMemoryTable.regime, filters.regime));
  if (filters.isAccepted !== undefined)
    conditions.push(eq(setupMemoryTable.isAccepted, filters.isAccepted));
  if (filters.isValid !== undefined)
    conditions.push(eq(setupMemoryTable.isValid, filters.isValid));
  if (filters.dateFrom)
    conditions.push(gte(setupMemoryTable.evaluatedAt, filters.dateFrom));
  if (filters.dateTo)
    conditions.push(lte(setupMemoryTable.evaluatedAt, filters.dateTo));
  if (filters.minConfidence !== undefined)
    conditions.push(
      gte(setupMemoryTable.confidence, String(filters.minConfidence))
    );

  return conditions.length > 0 ? and(...conditions) : undefined;
}

// ─── Skipped Setup Filters ─────────────────────────────────────────────────

export function buildSkippedFilters(filters: SkippedSearchFilters): SQL | undefined {
  const conditions: SQL[] = [];

  if (filters.pair)
    conditions.push(eq(skippedSetupMemoryTable.pair, filters.pair.toUpperCase()));
  if (filters.direction)
    conditions.push(eq(skippedSetupMemoryTable.direction, filters.direction.toLowerCase()));
  if (filters.session)
    conditions.push(eq(skippedSetupMemoryTable.session, filters.session.toLowerCase()));
  if (filters.regime)
    conditions.push(eq(skippedSetupMemoryTable.regime, filters.regime));
  if (filters.skipReason)
    conditions.push(eq(skippedSetupMemoryTable.skipReason, filters.skipReason));
  if (filters.rejectingRule)
    conditions.push(eq(skippedSetupMemoryTable.rejectingRule, filters.rejectingRule));
  if (filters.dateFrom)
    conditions.push(gte(skippedSetupMemoryTable.createdAt, filters.dateFrom));
  if (filters.dateTo)
    conditions.push(lte(skippedSetupMemoryTable.createdAt, filters.dateTo));

  return conditions.length > 0 ? and(...conditions) : undefined;
}

// ─── Market Snapshot Filters ───────────────────────────────────────────────

export function buildSnapshotFilters(filters: SnapshotSearchFilters): SQL | undefined {
  const conditions: SQL[] = [];

  if (filters.pair)
    conditions.push(eq(marketSnapshotMemoryTable.pair, filters.pair.toUpperCase()));
  if (filters.session)
    conditions.push(eq(marketSnapshotMemoryTable.session, filters.session.toLowerCase()));
  if (filters.dateFrom)
    conditions.push(gte(marketSnapshotMemoryTable.capturedAt, filters.dateFrom));
  if (filters.dateTo)
    conditions.push(lte(marketSnapshotMemoryTable.capturedAt, filters.dateTo));

  return conditions.length > 0 ? and(...conditions) : undefined;
}

// ─── Trade Memory Filters ──────────────────────────────────────────────────

export function buildTradeMemoryFilters(filters: TradeMemoryFilters): SQL | undefined {
  const conditions: SQL[] = [];

  if (filters.pair)
    conditions.push(eq(tradeMemoryTable.pair, filters.pair.toUpperCase()));
  if (filters.direction)
    conditions.push(eq(tradeMemoryTable.direction, filters.direction.toLowerCase()));
  if (filters.session)
    conditions.push(eq(tradeMemoryTable.session, filters.session.toLowerCase()));
  if (filters.regime)
    conditions.push(eq(tradeMemoryTable.regime, filters.regime));
  if (filters.outcome)
    conditions.push(eq(tradeMemoryTable.outcome, filters.outcome));
  if (filters.clusterKey)
    conditions.push(eq(tradeMemoryTable.clusterKey, filters.clusterKey));
  if (filters.dateFrom)
    conditions.push(gte(tradeMemoryTable.openedAt, filters.dateFrom));
  if (filters.dateTo)
    conditions.push(lte(tradeMemoryTable.openedAt, filters.dateTo));

  return conditions.length > 0 ? and(...conditions) : undefined;
}

// ─── Sort Helpers ──────────────────────────────────────────────────────────

export type SortOrder = "asc" | "desc";

export function sortDir(col: Parameters<typeof asc>[0], order: SortOrder) {
  return order === "asc" ? asc(col) : desc(col);
}

// ─── Count Utility ─────────────────────────────────────────────────────────

export const countStar = sql<number>`cast(count(*) as integer)`;
