/**
 * Trade Memory & Self-Improvement Engine
 *
 * Records every trade with full component scores, tracks missed opportunities,
 * clusters setups by score buckets, and applies dynamic confidence adjustments
 * based on statistically significant sample sizes.
 */

import { eq, desc, and, isNotNull } from "drizzle-orm";
import {
  db,
  tradeMemoryTable,
  missedOpportunitiesTable,
  setupConfidenceProfilesTable,
  tradesTable,
} from "@workspace/db";
import type { TradeSignal } from "@workspace/market-analysis";
import { getCurrentPrice } from "./price-feed.js";
import { logger } from "./logger.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_SAMPLE_SIZE = 10;          // minimum trades before confidence adjustment
const MAX_ADJUSTMENT  = 30;          // maximum ±30 confidence adjustment
const ROLLING_WINDOW  = 10;          // trades used for rolling win-rate check
const LOW_WR_THRESHOLD = 40;         // below this % in rolling window → extra penalty
const LOW_WR_PENALTY   = 10;         // extra penalty points when low WR detected

// ─── Cluster Key ─────────────────────────────────────────────────────────────

export function bucketScore(score: number): string {
  if (score >= 90) return "90+";
  if (score >= 80) return "80-89";
  if (score >= 70) return "70-79";
  return "<70";
}

export function getClusterKey(
  zoneScore: number,
  liquidityScore: number,
  amdScore: number,
  confirmationScore: number,
  session: string,
): string {
  return [
    `z:${bucketScore(zoneScore)}`,
    `l:${bucketScore(liquidityScore)}`,
    `a:${bucketScore(amdScore)}`,
    `c:${bucketScore(confirmationScore)}`,
    `s:${session}`,
  ].join("|");
}

// ─── Record Trade Memory (on trade open) ─────────────────────────────────────

export async function recordTradeMemory(
  tradeId: number,
  signal: TradeSignal,
  regime: string | null,
  regimeConfidence: number | null,
  session: string,
): Promise<void> {
  try {
    const clusterKey = getClusterKey(
      signal.zoneScore,
      signal.liquidityScore,
      signal.amdScore,
      signal.confirmationScore,
      session,
    );

    await db.insert(tradeMemoryTable).values({
      tradeId,
      pair:              signal.pair,
      direction:         signal.direction,
      session,
      regime,
      regimeConfidence:  regimeConfidence != null ? String(regimeConfidence) : null,
      zoneScore:         String(signal.zoneScore),
      liquidityScore:    String(signal.liquidityScore),
      amdScore:          String(signal.amdScore),
      confirmationScore: String(signal.confirmationScore),
      finalScore:        String(signal.finalScore),
      confidence:        String(signal.confidence),
      zoneType:          signal.zoneType,
      amdPattern:        signal.amdPhase,
      fibLevel:          signal.fibLevel != null ? String(signal.fibLevel) : null,
      confluenceFactors: JSON.stringify(signal.confluenceFactors ?? []),
      riskRewardPlanned: String(signal.riskReward),
      outcome:           "open",
      clusterKey,
      openedAt:          new Date(),
    }).onConflictDoNothing();

    logger.debug({ tradeId, clusterKey }, "Trade memory recorded");
  } catch (err) {
    logger.warn({ err, tradeId }, "Failed to record trade memory");
  }
}

// ─── Close Trade Memory (on trade close) ─────────────────────────────────────

export async function closeTradeMemory(
  tradeId: number,
  outcome: "win" | "loss",
  pnl: number,
  pnlPercent: number,
  closeReason: string,
  riskRewardActual: number | null,
  exitSlippagePips: number | null,
  openedAt: Date,
  slippagePips: number | null,
): Promise<void> {
  try {
    const now = new Date();
    const timeInTradeMins = Math.round((now.getTime() - openedAt.getTime()) / 60_000);

    await db
      .update(tradeMemoryTable)
      .set({
        outcome,
        pnl:             String(pnl),
        pnlPercent:      String(pnlPercent),
        closeReason,
        riskRewardActual: riskRewardActual != null ? String(riskRewardActual) : null,
        exitSlippagePips: exitSlippagePips != null ? String(exitSlippagePips) : null,
        slippagePips:     slippagePips != null ? String(slippagePips) : null,
        timeInTradeMins,
        closedAt: now,
      })
      .where(eq(tradeMemoryTable.tradeId, tradeId));

    logger.debug({ tradeId, outcome, pnl, timeInTradeMins }, "Trade memory closed");

    // Async: update cluster profile without blocking the close flow
    updateClusterProfile(tradeId).catch(err =>
      logger.warn({ err, tradeId }, "Failed to update cluster profile"),
    );
  } catch (err) {
    logger.warn({ err, tradeId }, "Failed to close trade memory");
  }
}

// ─── Record Missed Opportunity ────────────────────────────────────────────────

export async function recordMissedOpportunity(
  signal: TradeSignal,
  rejectionReason: string,
  session: string,
  regime: string | null,
): Promise<void> {
  try {
    await db.insert(missedOpportunitiesTable).values({
      pair:              signal.pair,
      direction:         signal.direction,
      session,
      regime,
      zoneScore:         String(signal.zoneScore),
      liquidityScore:    String(signal.liquidityScore),
      amdScore:          String(signal.amdScore),
      confirmationScore: String(signal.confirmationScore),
      finalScore:        String(signal.finalScore),
      confidence:        String(signal.confidence),
      zoneType:          signal.zoneType,
      amdPattern:        signal.amdPhase,
      riskReward:        String(signal.riskReward),
      entryPrice:        String(signal.entryPrice),
      rejectionReason,
      createdAt:         new Date(),
    });

    logger.debug({ pair: signal.pair, reason: rejectionReason }, "Missed opportunity recorded");
  } catch (err) {
    logger.warn({ err }, "Failed to record missed opportunity");
  }
}

// ─── Update Aftermath for Missed Opportunities ───────────────────────────────

export async function updateMissedOpportunityAftermath(): Promise<void> {
  try {
    // Find missed opportunities from last 24h that haven't been evaluated yet
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pending = await db
      .select()
      .from(missedOpportunitiesTable)
      .where(and(
        isNotNull(missedOpportunitiesTable.entryPrice),
      ));

    for (const opp of pending) {
      const now = Date.now();
      const createdMs = new Date(opp.createdAt).getTime();
      const ageMs = now - createdMs;

      const entryPrice = parseFloat(opp.entryPrice ?? "0");
      if (!entryPrice) continue;

      const livePrice = getCurrentPrice(opp.pair as import("@workspace/market-analysis").Pair);
      if (!livePrice) continue;

      const pipSize = opp.pair.includes("JPY") ? 0.01 : 0.0001;
      const currentMid = livePrice.mid;
      const priceDiff = opp.direction === "buy"
        ? currentMid - entryPrice
        : entryPrice - currentMid;
      const pipsIfTaken = Math.round((priceDiff / pipSize) * 10) / 10;

      const updates: Partial<typeof missedOpportunitiesTable.$inferInsert> = {};

      if (ageMs >= 60 * 60 * 1000 && !opp.priceAt1h) {
        updates.priceAt1h = String(currentMid);
      }
      if (ageMs >= 4 * 60 * 60 * 1000 && !opp.priceAt4h) {
        updates.priceAt4h = String(currentMid);
        updates.estimatedPipsIfTaken = String(pipsIfTaken);
        updates.outcomeIfTaken = pipsIfTaken > 0 ? "would_win" : "would_lose";
      }
      if (ageMs >= 24 * 60 * 60 * 1000 && !opp.priceAt24h) {
        updates.priceAt24h = String(currentMid);
      }

      if (Object.keys(updates).length > 0) {
        await db
          .update(missedOpportunitiesTable)
          .set(updates as Record<string, string>)
          .where(eq(missedOpportunitiesTable.id, opp.id));
      }
    }
  } catch (err) {
    logger.warn({ err }, "Failed to update missed opportunity aftermath");
  }
}

// ─── Update Cluster Profile ───────────────────────────────────────────────────

async function updateClusterProfile(tradeId: number): Promise<void> {
  const [mem] = await db
    .select()
    .from(tradeMemoryTable)
    .where(eq(tradeMemoryTable.tradeId, tradeId));

  if (!mem?.clusterKey || mem.outcome === "open") return;

  const clusterKey = mem.clusterKey;

  // Fetch all trades for this cluster
  const allTrades = await db
    .select()
    .from(tradeMemoryTable)
    .where(and(
      eq(tradeMemoryTable.clusterKey, clusterKey),
      isNotNull(tradeMemoryTable.outcome),
    ));

  const closed = allTrades.filter(t => t.outcome !== "open");
  if (closed.length === 0) return;

  const wins   = closed.filter(t => t.outcome === "win");
  const losses = closed.filter(t => t.outcome === "loss");
  const totalPnl     = closed.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0);
  const grossProfit  = wins.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0);
  const grossLoss    = Math.abs(losses.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0));
  const winRate      = wins.length / closed.length * 100;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit;
  const avgRr        = closed.reduce((s, t) => s + parseFloat(t.riskRewardActual ?? t.riskRewardPlanned ?? "0"), 0) / closed.length;
  const avgPnl       = totalPnl / closed.length;
  const avgFinalScore = closed.reduce((s, t) => s + parseFloat(t.finalScore ?? "0"), 0) / closed.length;

  // Rolling last-10
  const last10 = closed.slice(-ROLLING_WINDOW);
  const last10Wins = last10.filter(t => t.outcome === "win").length;
  const last10WinRate = last10.length > 0 ? (last10Wins / last10.length) * 100 : 0;
  const last10Pnl = last10.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0);

  // ── Dynamic Confidence Adjustment ──────────────────────────────────────────
  // Only applies after MIN_SAMPLE_SIZE trades
  let confidenceAdjustment = 0;
  if (closed.length >= MIN_SAMPLE_SIZE) {
    // Base adjustment: (winRate - 55) * 0.5
    // 55% is our target baseline; above = positive, below = negative
    const baseAdj = (winRate - 55) * 0.5;

    // Rolling deterioration penalty
    const rollingPenalty = (last10.length >= ROLLING_WINDOW && last10WinRate < LOW_WR_THRESHOLD)
      ? -LOW_WR_PENALTY
      : 0;

    confidenceAdjustment = Math.min(MAX_ADJUSTMENT, Math.max(-MAX_ADJUSTMENT, baseAdj + rollingPenalty));
    confidenceAdjustment = Math.round(confidenceAdjustment * 10) / 10;
  }

  // Parse cluster key to extract buckets
  const parts = Object.fromEntries(
    clusterKey.split("|").map(p => {
      const [k, v] = p.split(":");
      return [k!, v!] as const;
    }),
  );

  const existing = await db
    .select()
    .from(setupConfidenceProfilesTable)
    .where(eq(setupConfidenceProfilesTable.clusterKey, clusterKey))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(setupConfidenceProfilesTable).values({
      clusterKey,
      zoneScoreBucket:         parts["z"] ?? "unknown",
      liquidityScoreBucket:    parts["l"] ?? "unknown",
      amdScoreBucket:          parts["a"] ?? "unknown",
      confirmationScoreBucket: parts["c"] ?? "unknown",
      session:                 parts["s"] ?? "unknown",
      totalTrades:   closed.length,
      wins:          wins.length,
      losses:        losses.length,
      totalPnl:      String(Math.round(totalPnl * 100) / 100),
      grossProfit:   String(Math.round(grossProfit * 100) / 100),
      grossLoss:     String(Math.round(grossLoss * 100) / 100),
      winRate:       String(Math.round(winRate * 100) / 100),
      profitFactor:  String(Math.round(profitFactor * 10000) / 10000),
      avgRr:         String(Math.round(avgRr * 100) / 100),
      avgPnl:        String(Math.round(avgPnl * 100) / 100),
      avgFinalScore: String(Math.round(avgFinalScore * 100) / 100),
      confidenceAdjustment: String(confidenceAdjustment),
      last10WinRate: String(Math.round(last10WinRate * 100) / 100),
      last10Pnl:     String(Math.round(last10Pnl * 100) / 100),
    });
  } else {
    await db
      .update(setupConfidenceProfilesTable)
      .set({
        totalTrades:   closed.length,
        wins:          wins.length,
        losses:        losses.length,
        totalPnl:      String(Math.round(totalPnl * 100) / 100),
        grossProfit:   String(Math.round(grossProfit * 100) / 100),
        grossLoss:     String(Math.round(grossLoss * 100) / 100),
        winRate:       String(Math.round(winRate * 100) / 100),
        profitFactor:  String(Math.round(profitFactor * 10000) / 10000),
        avgRr:         String(Math.round(avgRr * 100) / 100),
        avgPnl:        String(Math.round(avgPnl * 100) / 100),
        avgFinalScore: String(Math.round(avgFinalScore * 100) / 100),
        confidenceAdjustment: String(confidenceAdjustment),
        last10WinRate: String(Math.round(last10WinRate * 100) / 100),
        last10Pnl:     String(Math.round(last10Pnl * 100) / 100),
      })
      .where(eq(setupConfidenceProfilesTable.clusterKey, clusterKey));
  }

  // Recompute global rankings
  await recomputeRankings();
}

// ─── Recompute Rankings ───────────────────────────────────────────────────────

async function recomputeRankings(): Promise<void> {
  const profiles = await db
    .select()
    .from(setupConfidenceProfilesTable)
    .where(isNotNull(setupConfidenceProfilesTable.winRate));

  // Sort by composite score: winRate * 0.4 + profitFactor * 0.3 + avgRr * 0.2 + sampleBonus * 0.1
  const scored = profiles.map(p => {
    const wr = parseFloat(p.winRate ?? "0");
    const pf = Math.min(parseFloat(p.profitFactor ?? "0"), 5);  // cap at 5
    const rr = Math.min(parseFloat(p.avgRr ?? "0"), 4);         // cap at 4
    const sampleBonus = Math.min(p.totalTrades / 50, 1) * 10;   // up to 10 pts for sample size
    const composite = wr * 0.4 + pf * 10 * 0.3 + rr * 10 * 0.2 + sampleBonus * 0.1;
    return { id: p.id, composite };
  }).sort((a, b) => b.composite - a.composite);

  for (let i = 0; i < scored.length; i++) {
    await db
      .update(setupConfidenceProfilesTable)
      .set({ rank: i + 1 })
      .where(eq(setupConfidenceProfilesTable.id, scored[i]!.id));
  }
}

// ─── Public Query Functions ───────────────────────────────────────────────────

export async function getSetupRanking(limit = 10, order: "asc" | "desc" = "desc") {
  const profiles = await db
    .select()
    .from(setupConfidenceProfilesTable)
    .orderBy(order === "desc"
      ? desc(setupConfidenceProfilesTable.rank)
      : setupConfidenceProfilesTable.rank)
    .limit(limit * 4); // fetch more to filter then slice

  // Best = lowest rank number (1 = best)
  const sorted = [...profiles].sort((a, b) =>
    order === "asc"
      ? (a.rank ?? 999) - (b.rank ?? 999)
      : (b.rank ?? 0) - (a.rank ?? 0)
  );
  return sorted.slice(0, limit);
}

export async function getMemorySummary() {
  const [totalMem, totalMissed, profiles] = await Promise.all([
    db.select().from(tradeMemoryTable),
    db.select().from(missedOpportunitiesTable),
    db.select().from(setupConfidenceProfilesTable),
  ]);

  const closed   = totalMem.filter(t => t.outcome !== "open");
  const wins     = closed.filter(t => t.outcome === "win");
  const avgAdj   = profiles.length
    ? profiles.reduce((s, p) => s + parseFloat(p.confidenceAdjustment ?? "0"), 0) / profiles.length
    : 0;
  const bestCluster = profiles.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))[0];
  const wouldWin = totalMissed.filter(t => t.outcomeIfTaken === "would_win").length;
  const wouldLose = totalMissed.filter(t => t.outcomeIfTaken === "would_lose").length;

  return {
    totalRecorded:  totalMem.length,
    closedTrades:   closed.length,
    winRate:        closed.length ? Math.round((wins.length / closed.length) * 10000) / 100 : 0,
    totalClusters:  profiles.length,
    avgConfAdjustment: Math.round(avgAdj * 10) / 10,
    bestClusterKey: bestCluster?.clusterKey ?? null,
    missedOpportunities: totalMissed.length,
    missedWouldWin:  wouldWin,
    missedWouldLose: wouldLose,
  };
}

export async function getRecentMemory(limit = 50) {
  return db
    .select()
    .from(tradeMemoryTable)
    .orderBy(desc(tradeMemoryTable.openedAt))
    .limit(limit);
}

export async function getMissedOpportunities(limit = 50) {
  return db
    .select()
    .from(missedOpportunitiesTable)
    .orderBy(desc(missedOpportunitiesTable.createdAt))
    .limit(limit);
}

export async function getConfidenceProfiles() {
  return db
    .select()
    .from(setupConfidenceProfilesTable)
    .orderBy(setupConfidenceProfilesTable.rank);
}
