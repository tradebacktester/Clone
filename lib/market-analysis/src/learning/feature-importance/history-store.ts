// ─── Feature Importance History Store ─────────────────────────────────────────
// In-memory store for the latest analysis cycle and confidence history.
// Never overwrites previous cycles — append-only semantics.
// Advisory only — no trade execution.

import type {
  FiAnalysisCycle,
  FeatureImportanceResult,
  InteractionResult,
  FeatureConfidenceState,
  FeatureRanking,
} from "./types.js";

// ─── Singleton store ──────────────────────────────────────────────────────────

class FeatureImportanceStore {
  private latestCycle: FiAnalysisCycle | null = null;
  private cycleHistory: FiAnalysisCycle[] = [];
  /** Per-feature last-known confidence state for delta calculations */
  private confidenceStateMap = new Map<string, FeatureConfidenceState>();

  // ─── Upsert latest cycle ───────────────────────────────────────────────────

  upsert(cycle: FiAnalysisCycle): void {
    this.latestCycle = cycle;

    // Append to history (bounded at 100 cycles in memory)
    this.cycleHistory.push(cycle);
    if (this.cycleHistory.length > 100) {
      this.cycleHistory = this.cycleHistory.slice(-100);
    }

    // Update per-feature confidence state map
    for (const f of cycle.features) {
      this.confidenceStateMap.set(f.featureId, {
        featureId: f.featureId as import("./types.js").FeatureId,
        cycleId: cycle.cycleId,
        snapshotDate: cycle.completedAt ?? new Date(),
        confidenceScore: f.confidenceScore,
        reliabilityScore: f.reliabilityScore,
        predictiveValue: f.predictiveValue,
        sampleSize: f.sampleSize,
        winRate: f.winRate,
        trendDirection: f.confidenceTrend,
        isInsufficient: f.isInsufficient,
      });
    }
  }

  // ─── Accessors ─────────────────────────────────────────────────────────────

  getLatest(): FiAnalysisCycle | null {
    return this.latestCycle;
  }

  getFeatures(): FeatureImportanceResult[] {
    return this.latestCycle?.features ?? [];
  }

  getInteractions(): InteractionResult[] {
    return this.latestCycle?.interactions ?? [];
  }

  getRankings(): FeatureRanking[] {
    return this.latestCycle?.rankings ?? [];
  }

  getFeatureById(id: string): FeatureImportanceResult | undefined {
    return this.latestCycle?.features.find(f => f.featureId === id);
  }

  getConfidenceState(featureId: string): FeatureConfidenceState | undefined {
    return this.confidenceStateMap.get(featureId);
  }

  getAllConfidenceStates(): FeatureConfidenceState[] {
    return [...this.confidenceStateMap.values()];
  }

  cycleCount(): number {
    return this.cycleHistory.length;
  }

  featureCount(): number {
    return this.latestCycle?.features.length ?? 0;
  }

  sufficientFeatureCount(): number {
    return this.latestCycle?.features.filter(f => !f.isInsufficient).length ?? 0;
  }

  isLoaded(): boolean {
    return this.latestCycle !== null;
  }

  /** History for trend visualization — one entry per past cycle */
  getHistory(limit: number = 50): FiAnalysisCycle[] {
    return this.cycleHistory.slice(-limit);
  }

  clear(): void {
    this.latestCycle = null;
    this.cycleHistory = [];
    this.confidenceStateMap.clear();
  }
}

export const featureImportanceStore = new FeatureImportanceStore();
