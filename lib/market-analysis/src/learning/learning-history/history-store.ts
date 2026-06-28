// ─── History Store ───────────────────────────────────────────────────────────
// In-process store for completed learning cycles.
// Never overwrites previous learning — append-only.
// DB persistence is handled by the API route layer.

import type { LearningCycle } from "../learning-core/types.js";

export interface CycleListEntry {
  id: string;
  version: string;
  cycleNumber: number;
  status: LearningCycle["status"];
  triggeredBy: LearningCycle["triggeredBy"];
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
  sampleSize: number;
  validationStatus: LearningCycle["validationStatus"];
  overallConfidence: number | null;
  totalTrades: number | null;
  winRate: number | null;
  errorMessage: string | null;
}

class HistoryStore {
  private readonly cycles: Map<string, LearningCycle> = new Map();
  private maxCycles = 100;

  // ─── Write ────────────────────────────────────────────────────────────────

  append(cycle: LearningCycle): void {
    if (this.cycles.has(cycle.id)) return; // never overwrite
    this.cycles.set(cycle.id, cycle);

    // Evict oldest if over cap (FIFO by startedAt)
    if (this.cycles.size > this.maxCycles) {
      const oldest = [...this.cycles.values()]
        .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())[0];
      if (oldest) this.cycles.delete(oldest.id);
    }
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  getById(id: string): LearningCycle | null {
    return this.cycles.get(id) ?? null;
  }

  getLatest(): LearningCycle | null {
    if (this.cycles.size === 0) return null;
    return [...this.cycles.values()]
      .sort((a, b) => b.cycleNumber - a.cycleNumber)[0];
  }

  list(limit = 20): CycleListEntry[] {
    return [...this.cycles.values()]
      .sort((a, b) => b.cycleNumber - a.cycleNumber)
      .slice(0, limit)
      .map(toCycleListEntry);
  }

  count(): number {
    return this.cycles.size;
  }

  // ─── Version Helpers ──────────────────────────────────────────────────────

  getNextCycleNumber(): number {
    if (this.cycles.size === 0) return 1;
    return Math.max(...[...this.cycles.values()].map(c => c.cycleNumber)) + 1;
  }

  // ─── Serialisation ────────────────────────────────────────────────────────

  exportAll(): LearningCycle[] {
    return [...this.cycles.values()].sort(
      (a, b) => a.startedAt.getTime() - b.startedAt.getTime(),
    );
  }

  importMany(cycles: LearningCycle[]): number {
    let added = 0;
    for (const c of cycles) {
      if (!this.cycles.has(c.id)) {
        this.cycles.set(c.id, c);
        added++;
      }
    }
    return added;
  }

  clear(): void {
    this.cycles.clear();
  }
}

function toCycleListEntry(c: LearningCycle): CycleListEntry {
  return {
    id: c.id,
    version: c.version,
    cycleNumber: c.cycleNumber,
    status: c.status,
    triggeredBy: c.triggeredBy,
    startedAt: c.startedAt,
    completedAt: c.completedAt,
    durationMs: c.durationMs,
    sampleSize: c.sampleSize,
    validationStatus: c.validationStatus,
    overallConfidence: c.confidence?.overallConfidence ?? null,
    totalTrades: c.metrics?.totalTrades ?? null,
    winRate: c.metrics?.winRate ?? null,
    errorMessage: c.errorMessage,
  };
}

// Singleton instance — shared across the API server process
export const historyStore = new HistoryStore();
