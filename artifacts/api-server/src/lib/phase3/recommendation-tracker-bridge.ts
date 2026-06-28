// ─── Recommendation Accuracy Bridge ──────────────────────────────────────────
// Builds recommendation records from DB and evaluates accuracy.

import { db } from "@workspace/db";
import { tradeMemoryTable, skippedSetupMemoryTable } from "@workspace/db";
import { desc, isNotNull, and, gte, sql } from "drizzle-orm";
import { evaluateRecommendationAccuracy } from "@workspace/market-analysis";
import type { RecommendationRecord } from "@workspace/market-analysis";

export async function evaluateAccuracyBridge(window: string = "all") {
  // Map window to days
  const windowDays: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
  const days = windowDays[window];
  const fromDate = days ? new Date(Date.now() - days * 24 * 3600 * 1000) : new Date("2020-01-01");

  // Load closed trades that have both a confidence score and an outcome
  const conditions = [
    isNotNull(tradeMemoryTable.outcome),
    isNotNull(tradeMemoryTable.confidence),
    gte(tradeMemoryTable.openedAt, fromDate),
  ];

  const rows = await db
    .select()
    .from(tradeMemoryTable)
    .where(and(...conditions))
    .orderBy(desc(tradeMemoryTable.openedAt))
    .limit(1000);

  const records: RecommendationRecord[] = rows.map(r => {
    const confidence = Number(r.confidence ?? 50);
    const tqi = Number(r.tqi ?? 50);
    // Treat trades where TQI >= 65 as "recommended to take"
    const recommendedAction = tqi >= 65 ? "take" : "skip";
    const actualOutcome = (r.outcome as "win" | "loss" | "break_even") ?? "loss";

    return {
      recommendationId: String(r.id),
      recommendedAction,
      confidence,
      tisScore: tqi,
      actualOutcome,
      pnl: r.pnl ? Number(r.pnl) : undefined,
      evaluatedAt: r.closedAt ?? r.openedAt ?? new Date(),
    };
  });

  return evaluateRecommendationAccuracy(records, window);
}
