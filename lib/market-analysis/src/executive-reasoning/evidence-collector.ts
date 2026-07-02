// ─── Stage 1: Evidence Collection ────────────────────────────────────────────
import { randomUUID } from "crypto";
import type { EvidenceCollection, EvidenceItem } from "./types.js";

function quality(score: number, minStrong = 70, minMod = 45): EvidenceItem["quality"] {
  if (score >= minStrong) return "strong";
  if (score >= minMod)    return "moderate";
  if (score > 0)          return "weak";
  return "missing";
}

function freshness(ts: string | undefined): EvidenceItem["freshness"] {
  if (!ts) return "unknown";
  const ageMs = Date.now() - new Date(ts).getTime();
  if (ageMs < 5 * 60_000) return "fresh";
  if (ageMs < 30 * 60_000) return "fresh";
  if (ageMs < 2 * 60 * 60_000) return "fresh";
  return "stale";
}

export function collectEvidence(params: {
  pair:            string;
  timeframe:       string;
  strategyResult:  Record<string, unknown> | null;
  erbResult:       Record<string, unknown> | null;
  riResult:        Record<string, unknown> | null;
  now:             string;
}): EvidenceCollection {
  const { pair, timeframe, strategyResult, erbResult, riResult, now } = params;
  const items: EvidenceItem[] = [];

  // Strategy evidence
  const stratScore = Number(strategyResult?.executiveScore ?? 50);
  items.push({
    evidenceId: `ev_strategy_${Date.now()}`,
    source:     "Executive Strategy Brain",
    dataType:   "strategy_intelligence",
    value:      { executiveScore: stratScore, recommendation: strategyResult?.recommendation ?? "wait" },
    quality:    quality(stratScore),
    freshness:  freshness(strategyResult?.evaluatedAt as string),
    timestamp:  now,
  });

  // Risk evidence (ERB)
  const riskScore = Number(erbResult?.overallRiskScore ?? 30);
  items.push({
    evidenceId: `ev_risk_${Date.now()}`,
    source:     "Executive Risk Brain",
    dataType:   "risk_intelligence",
    value:      { overallRiskScore: riskScore, survivalScore: erbResult?.survivalScore ?? 75, crisisStatus: erbResult?.crisisStatus ?? "none" },
    quality:    "strong",
    freshness:  freshness(erbResult?.evaluatedAt as string),
    timestamp:  now,
  });

  // Market evidence (from RI market component)
  const mktScore = Number(riResult?.marketRisk?.marketRiskScore ?? 40);
  items.push({
    evidenceId: `ev_market_${Date.now()}`,
    source:     "Market Intelligence",
    dataType:   "market_intelligence",
    value:      { marketRiskScore: mktScore, regime: riResult?.regime ?? "unknown" },
    quality:    quality(100 - mktScore, 60, 40),
    freshness:  "fresh",
    timestamp:  now,
  });

  // Memory evidence (synthetic — would come from DB in production)
  items.push({
    evidenceId: `ev_memory_${Date.now()}`,
    source:     "Memory System",
    dataType:   "memory_intelligence",
    value:      { historicalWinRate: 55, similarTradeCount: 0, patternFrequency: 40 },
    quality:    "moderate",
    freshness:  "fresh",
    timestamp:  now,
  });

  // Learning evidence
  items.push({
    evidenceId: `ev_learning_${Date.now()}`,
    source:     "Learning Engine",
    dataType:   "learning_intelligence",
    value:      { overallConfidence: 55, validationStatus: "complete" },
    quality:    "moderate",
    freshness:  "fresh",
    timestamp:  now,
  });

  // Identity evidence
  items.push({
    evidenceId: `ev_identity_${Date.now()}`,
    source:     "Trader Identity Engine",
    dataType:   "identity_intelligence",
    value:      { identitySimilarityScore: 60, preferenceAlignmentScore: 60 },
    quality:    "moderate",
    freshness:  "fresh",
    timestamp:  now,
  });

  // Broker status
  const brokerReliability = Number(erbResult?.brokerReliabilityScore ?? 80);
  items.push({
    evidenceId: `ev_broker_${Date.now()}`,
    source:     "Broker Monitor",
    dataType:   "broker_status",
    value:      { reliabilityScore: brokerReliability, status: brokerReliability >= 70 ? "healthy" : "degraded" },
    quality:    quality(brokerReliability),
    freshness:  "fresh",
    timestamp:  now,
  });

  // Infrastructure
  const infraScore = Number(erbResult?.infrastructureScore ?? 85);
  items.push({
    evidenceId: `ev_infra_${Date.now()}`,
    source:     "Infrastructure Monitor",
    dataType:   "infrastructure_status",
    value:      { healthScore: infraScore, status: infraScore >= 70 ? "healthy" : "degraded" },
    quality:    quality(infraScore),
    freshness:  "fresh",
    timestamp:  now,
  });

  const validItems  = items.filter(i => i.quality !== "missing").length;
  const staleItems  = items.filter(i => i.freshness === "stale").map(i => i.source);
  const missingItems = items.filter(i => i.quality === "missing").map(i => i.source);
  const overallQuality = Math.round((validItems / items.length) * 100);

  return {
    collectionId:   `ec_${randomUUID().slice(0, 8)}`,
    collectedAt:    now,
    pair,
    timeframe,
    items,
    overallQuality,
    missingItems,
    staleItems,
    validItems,
    totalItems: items.length,
  };
}
