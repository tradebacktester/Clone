// ─── Historical Reasoner ──────────────────────────────────────────────────────
// Finds similar historical trades and computes evidence-backed statistics.
// Uses cosine similarity over the feature vector.
// Advisory only.

import { clamp } from "../learning-validation/data-validator.js";
import { wilsonLowerBound } from "../learning-confidence/confidence-engine.js";
import type { ExtractedFeature } from "../learning-core/types.js";
import type {
  StrategySetup,
  SimilarTrade,
  HistoricalEvidenceResult,
} from "./types.js";
import {
  MIN_EVIDENCE_FOR_REASONING,
  HIGH_CONFIDENCE_EVIDENCE,
  STRONG_WIN_RATE,
  evidenceToReliability,
} from "./types.js";

// ─── Feature vector extraction ────────────────────────────────────────────────

function toVector(
  supplyQ: number, demandQ: number, liquidity: number,
  amd: number, confirm: number, setup: number, tqi: number,
): number[] {
  return [supplyQ, demandQ, liquidity, amd, confirm, setup, tqi];
}

function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0);
}

function magnitude(v: number[]): number {
  return Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
}

function cosineSimilarity(a: number[], b: number[]): number {
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return clamp(dotProduct(a, b) / (magA * magB), 0, 1);
}

// ─── Similar trade search ─────────────────────────────────────────────────────

const SIMILARITY_THRESHOLD = 0.72;
const MAX_SIMILAR_TRADES   = 30;

export function findSimilarHistoricalTrades(
  setup: StrategySetup,
  features: ExtractedFeature[],
): HistoricalEvidenceResult {
  const queryVec = toVector(
    setup.supplyQuality, setup.demandQuality, setup.liquidityScore,
    setup.amdScore, setup.confirmationQuality, setup.setupScore, setup.tqi,
  );

  // Score every historical feature row
  const scored = features
    .filter(f => f.pair === setup.pair || f.session === setup.session)
    .map(f => {
      const fVec = toVector(
        Number(f.supplyQuality ?? 0),
        Number(f.demandQuality ?? 0),
        Number(f.liquidityScore ?? 0),
        Number(f.amdScore ?? 0),
        Number(f.confirmationQuality ?? 0),
        Number(f.setupScore ?? 0),
        Number(f.tqi ?? 0),
      );
      const similarity = cosineSimilarity(queryVec, fVec);
      return { f, similarity };
    })
    .filter(s => s.similarity >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_SIMILAR_TRADES);

  const similarTrades: SimilarTrade[] = scored.map(({ f, similarity }) => ({
    tradeId:    String(f.tradeId ?? f.setupId ?? ""),
    pair:       f.pair ?? setup.pair,
    session:    f.session ?? "unknown",
    regime:     f.marketRegime ?? "unknown",
    outcome:    (f.outcome === "win" ? "win" : "loss") as "win" | "loss",
    rrActual:   Number(f.rrActual ?? 0),
    similarity,
    setupScore: Number(f.setupScore ?? 0),
    tqi:        Number(f.tqi ?? 0),
    openedAt:   f.openedAt instanceof Date ? f.openedAt : new Date(f.openedAt ?? Date.now()),
  }));

  const n       = similarTrades.length;
  const wins    = similarTrades.filter(t => t.outcome === "win").length;
  const losses  = n - wins;
  const winRate = n > 0 ? wins / n : 0;

  // Average RR for wins
  const winRRs  = similarTrades.filter(t => t.outcome === "win").map(t => t.rrActual);
  const lossRRs = similarTrades.filter(t => t.outcome === "loss").map(t => Math.abs(t.rrActual));
  const avgWinRR  = winRRs.length > 0  ? winRRs.reduce((a, b) => a + b, 0) / winRRs.length   : 0;
  const avgLossRR = lossRRs.length > 0 ? lossRRs.reduce((a, b) => a + b, 0) / lossRRs.length : 1;
  const profitFactor = losses > 0 ? (wins * avgWinRR) / (losses * avgLossRR) : wins > 0 ? 99 : 0;
  const avgSimilarity = n > 0 ? similarTrades.reduce((s, t) => s + t.similarity, 0) / n : 0;

  // Wilson lower bound for win rate confidence
  const wilson = n >= 3 ? wilsonLowerBound(wins, n) : 0;

  // Evidence score (0–100)
  let evidenceScore = 0;
  if (n >= MIN_EVIDENCE_FOR_REASONING) {
    const winRateScore    = clamp(winRate * 100, 0, 100);
    const sampleScore     = clamp((n / HIGH_CONFIDENCE_EVIDENCE) * 100, 0, 100);
    const similarityScore = clamp(avgSimilarity * 100, 0, 100);
    const pfScore         = clamp(Math.min(profitFactor / 3, 1) * 100, 0, 100);
    evidenceScore = clamp(
      winRateScore * 0.35 +
      sampleScore  * 0.25 +
      similarityScore * 0.20 +
      pfScore      * 0.20,
      0, 100,
    );
  } else {
    evidenceScore = clamp((n / MIN_EVIDENCE_FOR_REASONING) * 40, 0, 40);
  }

  const lines: string[] = [];
  lines.push(`Historical Evidence Score: ${evidenceScore.toFixed(1)}/100`);
  lines.push(`${n} similar trades found (${wins}W/${losses}L) — Win rate: ${(winRate * 100).toFixed(1)}%`);
  if (n >= MIN_EVIDENCE_FOR_REASONING) {
    lines.push(`Avg RR: ${avgWinRR.toFixed(2)} | Profit Factor: ${profitFactor.toFixed(2)} | Wilson LB: ${(wilson * 100).toFixed(1)}%`);
    if (winRate >= STRONG_WIN_RATE) {
      lines.push("Strong historical win rate supports this setup.");
    } else if (winRate < 0.40) {
      lines.push("⚠ Below-average historical win rate — exercise caution.");
    }
  } else {
    lines.push(`⚠ Insufficient historical evidence (need ${MIN_EVIDENCE_FOR_REASONING}, found ${n}) — treat as indicative only.`);
  }

  return {
    similarTrades,
    evidenceCount:    n,
    winCount:         wins,
    lossCount:        losses,
    winRate,
    averageRR:        avgWinRR,
    profitFactor,
    avgSimilarity,
    wilsonLowerBound: wilson,
    evidenceScore,
    explanation:      lines.join(" | "),
    sampleReliability: evidenceToReliability(n),
  };
}
