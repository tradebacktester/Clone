// ─── Memory API Helpers ────────────────────────────────────────────────────
// Request/response types and parsers for the memory REST layer.
// Route handlers import these — never raw DB types.

import { MEMORY_PAGE_DEFAULTS } from "../memory-events/index.js";
import { normalisePagination } from "../memory-search/index.js";
import type { PaginationParams, SetupSearchFilters, SkippedSearchFilters, TradeMemoryFilters, SnapshotSearchFilters } from "../memory-search/index.js";

// ─── Request Parsing ───────────────────────────────────────────────────────

export function parseCommonQuery(query: Record<string, unknown>): {
  pagination: PaginationParams;
  pair?:      string;
  direction?: string;
  session?:   string;
  regime?:    string;
  dateFrom?:  Date;
  dateTo?:    Date;
} {
  const pagination = normalisePagination(
    query.limit,
    query.offset,
    MEMORY_PAGE_DEFAULTS.MAX_LIMIT,
  );

  const dateFrom = query.dateFrom ? new Date(String(query.dateFrom)) : undefined;
  const dateTo   = query.dateTo   ? new Date(String(query.dateTo))   : undefined;

  return {
    pagination,
    pair:      query.pair      ? String(query.pair).toUpperCase()    : undefined,
    direction: query.direction ? String(query.direction).toLowerCase() : undefined,
    session:   query.session   ? String(query.session).toLowerCase() : undefined,
    regime:    query.regime    ? String(query.regime)                : undefined,
    dateFrom:  dateFrom && !isNaN(dateFrom.getTime()) ? dateFrom : undefined,
    dateTo:    dateTo   && !isNaN(dateTo.getTime())   ? dateTo   : undefined,
  };
}

export function parseSetupQuery(query: Record<string, unknown>): {
  filters:    SetupSearchFilters;
  pagination: PaginationParams;
} {
  const { pagination, pair, direction, session, regime, dateFrom, dateTo } = parseCommonQuery(query);

  const isAccepted = query.isAccepted !== undefined
    ? String(query.isAccepted) === "true"
    : undefined;

  const isValid = query.isValid !== undefined
    ? String(query.isValid) === "true"
    : undefined;

  const minConfidence = query.minConfidence
    ? parseFloat(String(query.minConfidence))
    : undefined;

  return {
    filters: { pair, direction, session, regime, dateFrom, dateTo, isAccepted, isValid, minConfidence },
    pagination,
  };
}

export function parseSkippedQuery(query: Record<string, unknown>): {
  filters:    SkippedSearchFilters;
  pagination: PaginationParams;
} {
  const { pagination, pair, direction, session, regime, dateFrom, dateTo } = parseCommonQuery(query);

  return {
    filters: {
      pair, direction, session, regime, dateFrom, dateTo,
      skipReason:    query.skipReason    ? String(query.skipReason)    : undefined,
      rejectingRule: query.rejectingRule ? String(query.rejectingRule) : undefined,
    },
    pagination,
  };
}

export function parseSnapshotQuery(query: Record<string, unknown>): {
  filters:    SnapshotSearchFilters;
  pagination: PaginationParams;
} {
  const { pagination, pair, session, dateFrom, dateTo } = parseCommonQuery(query);
  return { filters: { pair, session, dateFrom, dateTo }, pagination };
}

export function parseTradeQuery(query: Record<string, unknown>): {
  filters:    TradeMemoryFilters;
  pagination: PaginationParams;
} {
  const { pagination, pair, direction, session, regime, dateFrom, dateTo } = parseCommonQuery(query);

  return {
    filters: {
      pair, direction, session, regime, dateFrom, dateTo,
      outcome:    query.outcome    ? String(query.outcome)    : undefined,
      clusterKey: query.clusterKey ? String(query.clusterKey) : undefined,
    },
    pagination,
  };
}

// ─── Response Shaping ──────────────────────────────────────────────────────

export interface MemoryStoreRequest {
  table:         string;
  sourceModule:  string;
  data:          Record<string, unknown>;
}

export function parseStoreRequest(body: unknown): MemoryStoreRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  if (typeof b.table !== "string" || b.table.trim() === "")          return null;
  if (typeof b.sourceModule !== "string" || b.sourceModule.trim() === "") return null;
  if (typeof b.data !== "object" || b.data === null)                  return null;

  return {
    table:        b.table.trim(),
    sourceModule: b.sourceModule.trim(),
    data:         b.data as Record<string, unknown>,
  };
}

// ─── Standard API Responses ────────────────────────────────────────────────

export interface ApiError {
  error:   string;
  details?: string[];
}

export function apiError(message: string, details?: string[]): ApiError {
  return details ? { error: message, details } : { error: message };
}

export function apiNotFound(resource: string): ApiError {
  return { error: `${resource} not found` };
}
