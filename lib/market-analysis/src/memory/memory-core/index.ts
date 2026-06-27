// ─── Memory Core — MemoryService ───────────────────────────────────────────
// The single gateway for all long-term memory operations.
// No module writes to or reads from memory tables directly.
// All access passes through this service.

import {
  insertSetupMemory,
  updateSetupMemory,
  deleteSetupMemory,
  findSetupMemory,
  findSetupMemoryById,
  insertSkippedSetupMemory,
  updateSkippedSetupMemory,
  findSkippedSetupMemory,
  findSkippedSetupMemoryById,
  insertMarketSnapshot,
  findMarketSnapshots,
  findMarketSnapshotById,
  upsertMemoryMetadata,
  findMetadataForRecord,
  findInvalidMetadata,
  findTradeMemory,
} from "../memory-storage/index.js";

import {
  buildSetupFilters,
  buildSkippedFilters,
  buildSnapshotFilters,
  buildTradeMemoryFilters,
  buildPaginatedResult,
} from "../memory-search/index.js";

import {
  validateSetupMemory,
  validateSkippedSetupMemory,
  validateMarketSnapshot,
  computeDataHash,
} from "../memory-validation/index.js";

import {
  buildClusterKey,
} from "../memory-index/index.js";

import {
  MEMORY_TABLES,
  MEMORY_SOURCE_MODULE,
} from "../memory-events/index.js";

import type {
  InsertSetupMemory,
  InsertSkippedSetupMemory,
  InsertMarketSnapshotMemory,
  SetupMemory,
  SkippedSetupMemory,
  MarketSnapshotMemory,
  TradeMemory,
} from "@workspace/db";

import type {
  SetupSearchFilters,
  SkippedSearchFilters,
  SnapshotSearchFilters,
  TradeMemoryFilters,
  PaginatedResult,
  PaginationParams,
} from "../memory-search/index.js";

// ─── Result Types ──────────────────────────────────────────────────────────

export interface StoreResult<T> {
  success: boolean;
  record?: T;
  errors?: string[];
}

export interface LinkResult {
  success: boolean;
  error?:  string;
}

// ─── MemoryService ─────────────────────────────────────────────────────────

export class MemoryService {
  // ── Setup Memory ────────────────────────────────────────────────────────

  async storeSetup(data: InsertSetupMemory): Promise<StoreResult<SetupMemory>> {
    const validation = validateSetupMemory(data);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    const record = await insertSetupMemory(data);

    await this._writeMetadata({
      recordId:     record.id,
      recordTable:  MEMORY_TABLES.SETUP_MEMORY,
      sourceModule: data.meta?.sourceModule as string ?? MEMORY_SOURCE_MODULE.MEMORY_SERVICE,
      payload:      data as Record<string, unknown>,
      isValid:      true,
      errors:       [],
    });

    return { success: true, record };
  }

  async updateSetup(
    id: string,
    data: Partial<InsertSetupMemory>,
  ): Promise<StoreResult<SetupMemory>> {
    const record = await updateSetupMemory(id, data);
    if (!record) return { success: false, errors: ["Setup not found"] };

    await this._bumpMetadataVersion(record.id, MEMORY_TABLES.SETUP_MEMORY);
    return { success: true, record };
  }

  async deleteSetup(id: string): Promise<boolean> {
    return deleteSetupMemory(id);
  }

  async getSetups(
    filters: SetupSearchFilters,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<SetupMemory>> {
    const where = buildSetupFilters(filters);
    const { data, total } = await findSetupMemory(where, pagination);
    return buildPaginatedResult(data, total, pagination);
  }

  async getSetupById(id: string): Promise<SetupMemory | null> {
    return findSetupMemoryById(id);
  }

  // ── Skipped Setup Memory ─────────────────────────────────────────────────

  async storeSkippedSetup(data: InsertSkippedSetupMemory): Promise<StoreResult<SkippedSetupMemory>> {
    const validation = validateSkippedSetupMemory(data);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    const record = await insertSkippedSetupMemory(data);

    await this._writeMetadata({
      recordId:     record.id,
      recordTable:  MEMORY_TABLES.SKIPPED_SETUP_MEMORY,
      sourceModule: MEMORY_SOURCE_MODULE.SIGNAL_GENERATOR,
      payload:      data as Record<string, unknown>,
      isValid:      true,
      errors:       [],
    });

    return { success: true, record };
  }

  async updateSkippedSetup(
    id: string,
    data: Partial<InsertSkippedSetupMemory>,
  ): Promise<StoreResult<SkippedSetupMemory>> {
    const record = await updateSkippedSetupMemory(id, data);
    if (!record) return { success: false, errors: ["Skipped setup not found"] };
    await this._bumpMetadataVersion(record.id, MEMORY_TABLES.SKIPPED_SETUP_MEMORY);
    return { success: true, record };
  }

  async getSkippedSetups(
    filters: SkippedSearchFilters,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<SkippedSetupMemory>> {
    const where = buildSkippedFilters(filters);
    const { data, total } = await findSkippedSetupMemory(where, pagination);
    return buildPaginatedResult(data, total, pagination);
  }

  async getSkippedSetupById(id: string): Promise<SkippedSetupMemory | null> {
    return findSkippedSetupMemoryById(id);
  }

  // ── Market Snapshot Memory ───────────────────────────────────────────────

  async storeSnapshot(data: InsertMarketSnapshotMemory): Promise<StoreResult<MarketSnapshotMemory>> {
    const validation = validateMarketSnapshot(data);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    const record = await insertMarketSnapshot(data);

    await this._writeMetadata({
      recordId:     record.id,
      recordTable:  MEMORY_TABLES.MARKET_SNAPSHOT,
      sourceModule: MEMORY_SOURCE_MODULE.MEMORY_SERVICE,
      payload:      data as Record<string, unknown>,
      isValid:      true,
      errors:       [],
    });

    return { success: true, record };
  }

  async getSnapshots(
    filters: SnapshotSearchFilters,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<MarketSnapshotMemory>> {
    const where = buildSnapshotFilters(filters);
    const { data, total } = await findMarketSnapshots(where, pagination);
    return buildPaginatedResult(data, total, pagination);
  }

  async getSnapshotById(id: string): Promise<MarketSnapshotMemory | null> {
    return findMarketSnapshotById(id);
  }

  // ── Trade Memory (read access) ───────────────────────────────────────────

  async getTrades(
    filters: TradeMemoryFilters,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<TradeMemory>> {
    const where = buildTradeMemoryFilters(filters);
    const { data, total } = await findTradeMemory(where, pagination);
    return buildPaginatedResult(data, total, pagination);
  }

  // ── Link ─────────────────────────────────────────────────────────────────
  // Associate a setup with the trade that was opened from it.

  async linkSetupToTrade(setupId: string, tradeId: number, tradeUuid?: string): Promise<LinkResult> {
    const record = await updateSetupMemory(setupId, {
      linkedTradeId:   tradeId,
      linkedTradeUuid: tradeUuid ?? null,
      isAccepted:      true,
    });

    if (!record) return { success: false, error: "Setup not found" };
    await this._bumpMetadataVersion(setupId, MEMORY_TABLES.SETUP_MEMORY);
    return { success: true };
  }

  // ── Archive (soft-delete via invalidation) ────────────────────────────────

  async archiveSetup(id: string): Promise<LinkResult> {
    const record = await updateSetupMemory(id, { isValid: false });
    if (!record) return { success: false, error: "Setup not found" };
    return { success: true };
  }

  // ── Validation / Integrity ────────────────────────────────────────────────

  async getInvalidRecords(limit = 100) {
    return findInvalidMetadata(limit);
  }

  async getMetadataForRecord(recordId: string, recordTable: string) {
    return findMetadataForRecord(recordId, recordTable);
  }

  // ── Search ────────────────────────────────────────────────────────────────
  // Cross-table search returning a summary result per record type.

  async search(query: {
    pair?:      string;
    direction?: string;
    session?:   string;
    regime?:    string;
    dateFrom?:  Date;
    dateTo?:    Date;
    limit?:     number;
  }): Promise<{
    trades:   TradeMemory[];
    setups:   SetupMemory[];
    skipped:  SkippedSetupMemory[];
  }> {
    const pagination = { limit: query.limit ?? 20, offset: 0 };
    const base = {
      pair: query.pair, direction: query.direction, session: query.session,
      regime: query.regime, dateFrom: query.dateFrom, dateTo: query.dateTo,
    };

    const [trades, setups, skipped] = await Promise.all([
      this.getTrades(base, pagination),
      this.getSetups(base, pagination),
      this.getSkippedSetups(base, pagination),
    ]);

    return {
      trades:  trades.data,
      setups:  setups.data,
      skipped: skipped.data,
    };
  }

  // ── Cluster Key Utility ───────────────────────────────────────────────────

  buildClusterKey(scores: {
    zoneScore: number;
    liquidityScore: number;
    amdScore: number;
    confirmationScore: number;
    session: string;
  }): string {
    return buildClusterKey(scores);
  }

  // ── Internal Helpers ──────────────────────────────────────────────────────

  private async _writeMetadata(opts: {
    recordId:     string;
    recordTable:  string;
    sourceModule: string;
    payload:      Record<string, unknown>;
    isValid:      boolean;
    errors:       string[];
  }) {
    const dataHash = computeDataHash({
      table:    opts.recordTable,
      recordId: opts.recordId,
      payload:  opts.payload,
    });

    await upsertMemoryMetadata({
      recordId:         opts.recordId,
      recordTable:      opts.recordTable,
      recordVersion:    1,
      dataHash,
      isValid:          opts.isValid,
      validationErrors: opts.errors.length > 0 ? opts.errors : null,
      sourceModule:     opts.sourceModule,
      sourceVersion:    "2.0",
      createdBy:        "system",
    });
  }

  private async _bumpMetadataVersion(recordId: string, recordTable: string) {
    const existing = await findMetadataForRecord(recordId, recordTable);
    if (!existing) return;

    await upsertMemoryMetadata({
      recordId,
      recordTable,
      recordVersion:    (existing.recordVersion ?? 1) + 1,
      dataHash:         existing.dataHash,
      isValid:          existing.isValid,
      validationErrors: existing.validationErrors as string[] | null,
      sourceModule:     existing.sourceModule,
      sourceVersion:    existing.sourceVersion,
      createdBy:        existing.createdBy,
    });
  }
}

// ─── Singleton Export ──────────────────────────────────────────────────────
// All consumers import this singleton — never instantiate MemoryService directly.
export const memoryService = new MemoryService();
