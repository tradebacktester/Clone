// ─── Memory Module — Public API ────────────────────────────────────────────
// Re-exports the public surface of the long-term memory system.
// Import from here; never import from sub-modules directly.

export { memoryService, MemoryService } from "./memory-core/index.js";
export type { StoreResult, LinkResult } from "./memory-core/index.js";

export {
  MEMORY_TABLES,
  MEMORY_EVENT,
  SKIP_REASON,
  TRADE_OUTCOME,
  HYPOTHETICAL_OUTCOME,
  MEMORY_PAGE_DEFAULTS,
  MEMORY_SOURCE_MODULE,
} from "./memory-events/index.js";

export type {
  MemoryTable,
  MemoryEvent,
  SkipReason,
  TradeOutcome,
  HypotheticalOutcome,
  MemorySourceModule,
} from "./memory-events/index.js";

export {
  buildClusterKey,
  parseClusterKey,
  scoreToScoreBucket,
  buildSnapshotRefKey,
  buildSetupIdentityKey,
  buildSearchCacheKey,
  computeCompositeScore,
} from "./memory-index/index.js";

export type {
  ScoreBucket,
  ClusterKeyInput,
  SearchFilterInput,
  ScoredRecord,
} from "./memory-index/index.js";

export {
  normalisePagination,
  buildPaginatedResult,
  buildSetupFilters,
  buildSkippedFilters,
  buildSnapshotFilters,
  buildTradeMemoryFilters,
} from "./memory-search/index.js";

export type {
  PaginationParams,
  PaginatedResult,
  CommonFilters,
  SetupSearchFilters,
  SkippedSearchFilters,
  SnapshotSearchFilters,
  TradeMemoryFilters,
} from "./memory-search/index.js";

export {
  validateSetupMemory,
  validateSkippedSetupMemory,
  validateMarketSnapshot,
  validateMemoryMetadata,
  validateTimestamps,
  computeDataHash,
  verifyDataHash,
} from "./memory-validation/index.js";

export type { ValidationResult, HashInput } from "./memory-validation/index.js";

export {
  parseCommonQuery,
  parseSetupQuery,
  parseSkippedQuery,
  parseSnapshotQuery,
  parseTradeQuery,
  parseStoreRequest,
  apiError,
  apiNotFound,
} from "./memory-api/index.js";

export type {
  MemoryStoreRequest,
  ApiError,
} from "./memory-api/index.js";
