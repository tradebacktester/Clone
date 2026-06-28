// ─── Decision Intelligence In-Memory Store ────────────────────────────────────
// Singleton holding the latest recommendations and engine state.
// Flushed on server restart — DB is the durable store.
// Advisory only — no trade execution.

import type { TradeIntelligenceReport } from "./types.js";
import { DI_ENGINE_VERSION } from "./types.js";

export interface DiStoreState {
  version:             string;
  isAdvisoryOnly:      true;
  totalEvaluations:    number;
  lastEvaluatedAt:     Date | null;
  recommendations:     TradeIntelligenceReport[];   // most recent first, capped at 50
  lastReport:          TradeIntelligenceReport | null;
  accuracyStats:       AccuracyStats;
}

export interface AccuracyStats {
  totalWithOutcome:    number;
  accurateCount:       number;
  accuracyRate:        number;   // 0–1
  byLevel:             Record<string, { total: number; accurate: number }>;
}

class DiStore {
  private state: DiStoreState = {
    version:          DI_ENGINE_VERSION,
    isAdvisoryOnly:   true,
    totalEvaluations: 0,
    lastEvaluatedAt:  null,
    recommendations:  [],
    lastReport:       null,
    accuracyStats: {
      totalWithOutcome: 0,
      accurateCount:    0,
      accuracyRate:     0,
      byLevel:          {},
    },
  };

  addRecommendation(report: TradeIntelligenceReport): void {
    this.state.recommendations.unshift(report);
    if (this.state.recommendations.length > 50) {
      this.state.recommendations = this.state.recommendations.slice(0, 50);
    }
    this.state.lastReport       = report;
    this.state.lastEvaluatedAt  = report.evaluatedAt;
    this.state.totalEvaluations += 1;
  }

  recordOutcome(
    recommendationId: string,
    outcome: "win" | "loss" | "break_even",
    finalRR: number,
  ): boolean {
    const rec = this.state.recommendations.find(r => r.recommendationId === recommendationId);
    if (!rec) return false;

    // Accuracy: "exceptional" and "high_quality" → win is accurate; "avoid" → loss is accurate
    const isPositive = ["exceptional", "high_quality", "good_opportunity"].includes(rec.recommendationLevel);
    const isNegative = ["avoid", "low_quality"].includes(rec.recommendationLevel);
    const wasAccurate =
      (isPositive && outcome === "win") ||
      (isNegative && outcome === "loss") ||
      (rec.recommendationLevel === "neutral");

    // Update accuracy stats
    const stats = this.state.accuracyStats;
    stats.totalWithOutcome += 1;
    if (wasAccurate) stats.accurateCount += 1;
    stats.accuracyRate = stats.accurateCount / stats.totalWithOutcome;

    const lvl = rec.recommendationLevel;
    if (!stats.byLevel[lvl]) stats.byLevel[lvl] = { total: 0, accurate: 0 };
    stats.byLevel[lvl].total   += 1;
    if (wasAccurate) stats.byLevel[lvl].accurate += 1;

    return true;
  }

  getState(): DiStoreState {
    return { ...this.state, recommendations: [...this.state.recommendations] };
  }

  getRecommendation(id: string): TradeIntelligenceReport | undefined {
    return this.state.recommendations.find(r => r.recommendationId === id);
  }

  getLastReport(): TradeIntelligenceReport | null {
    return this.state.lastReport;
  }

  getRecommendations(limit = 20): TradeIntelligenceReport[] {
    return this.state.recommendations.slice(0, limit);
  }

  getTotalEvaluations(): number {
    return this.state.totalEvaluations;
  }

  getAccuracyStats(): AccuracyStats {
    return { ...this.state.accuracyStats };
  }

  clear(): void {
    this.state.recommendations  = [];
    this.state.lastReport       = null;
    this.state.lastEvaluatedAt  = null;
    this.state.totalEvaluations = 0;
  }
}

// Singleton export
export const diStore = new DiStore();
