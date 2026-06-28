// ─── Pattern Store ────────────────────────────────────────────────────────────
// In-process knowledge base for pattern records.
// Patterns are upserted (replace by id) — no duplicates.
// Provides filtering, ranking, and summary utilities.

import type { PatternRecord, PatternFilter, PatternCategory } from "./types.js";

export class PatternStore {
  private records = new Map<string, PatternRecord>();

  upsert(patterns: PatternRecord[]): void {
    for (const p of patterns) {
      this.records.set(p.id, p);
    }
  }

  getById(id: string): PatternRecord | null {
    return this.records.get(id) ?? null;
  }

  list(filter?: PatternFilter): PatternRecord[] {
    let out = Array.from(this.records.values());
    if (!filter) return out;
    if (filter.category !== undefined) {
      out = out.filter(p => p.category === filter.category);
    }
    if (filter.sufficientOnly) {
      out = out.filter(p => !p.evidence.isInsufficient);
    }
    if (filter.minSampleSize !== undefined) {
      out = out.filter(p => p.stats.sampleSize >= filter.minSampleSize!);
    }
    if (filter.minConfidence !== undefined) {
      out = out.filter(p => p.evidence.statisticalConfidence >= filter.minConfidence!);
    }
    if (filter.minWinRate !== undefined) {
      out = out.filter(p => p.stats.winRate >= filter.minWinRate!);
    }
    if (filter.maxWinRate !== undefined) {
      out = out.filter(p => p.stats.winRate <= filter.maxWinRate!);
    }
    return out;
  }

  count(): number {
    return this.records.size;
  }

  sufficientCount(): number {
    return this.list({ sufficientOnly: true }).length;
  }

  byCategory(category: PatternCategory): PatternRecord[] {
    return this.list({ category });
  }

  topByWinRate(n: number, sufficientOnly = true): PatternRecord[] {
    return this.list(sufficientOnly ? { sufficientOnly: true } : undefined)
      .sort((a, b) => b.stats.winRate - a.stats.winRate)
      .slice(0, n);
  }

  bottomByWinRate(n: number, sufficientOnly = true): PatternRecord[] {
    return this.list(sufficientOnly ? { sufficientOnly: true } : undefined)
      .sort((a, b) => a.stats.winRate - b.stats.winRate)
      .slice(0, n);
  }

  topByConfidence(n: number, sufficientOnly = true): PatternRecord[] {
    return this.list(sufficientOnly ? { sufficientOnly: true } : undefined)
      .sort((a, b) => b.evidence.statisticalConfidence - a.evidence.statisticalConfidence)
      .slice(0, n);
  }

  bottomByConfidence(n: number, sufficientOnly = true): PatternRecord[] {
    return this.list(sufficientOnly ? { sufficientOnly: true } : undefined)
      .sort((a, b) => a.evidence.statisticalConfidence - b.evidence.statisticalConfidence)
      .slice(0, n);
  }

  topByExpectancy(n: number, sufficientOnly = true): PatternRecord[] {
    return this.list(sufficientOnly ? { sufficientOnly: true } : undefined)
      .sort((a, b) => b.stats.expectancy - a.stats.expectancy)
      .slice(0, n);
  }

  clear(): void {
    this.records.clear();
  }

  toArray(): PatternRecord[] {
    return Array.from(this.records.values());
  }
}

export const patternStore = new PatternStore();
