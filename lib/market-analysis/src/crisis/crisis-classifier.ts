// ─── Crisis Classifier ────────────────────────────────────────────────────────

import {
  MarketCrisisSignal,
  BrokerCrisisSignal,
  InfrastructureCrisisSignal,
  DataIntegrityCrisisSignal,
  StrategyStabilityCrisisSignal,
  CrisisClassification,
  CrisisType,
  CrisisSeverity,
  scoreToCrisisSeverity,
} from "./types.js";

const WEIGHTS = {
  market:       0.30,
  broker:       0.25,
  infrastructure: 0.20,
  dataIntegrity:  0.15,
  strategy:     0.10,
};

export function classifyCrisis(
  market:      MarketCrisisSignal,
  broker:      BrokerCrisisSignal,
  infra:       InfrastructureCrisisSignal,
  data:        DataIntegrityCrisisSignal,
  strategy:    StrategyStabilityCrisisSignal,
): CrisisClassification {
  const overallScore = Math.round(
    market.crisisScore   * WEIGHTS.market +
    broker.crisisScore   * WEIGHTS.broker +
    infra.crisisScore    * WEIGHTS.infrastructure +
    data.crisisScore     * WEIGHTS.dataIntegrity +
    strategy.crisisScore * WEIGHTS.strategy,
  );

  const overallSeverity: CrisisSeverity = scoreToCrisisSeverity(overallScore);

  // Dominant crisis type: highest individual score
  const scores: [CrisisType, number][] = [
    ["market",               market.crisisScore],
    ["broker",               broker.crisisScore],
    ["infrastructure",       infra.crisisScore],
    ["data_integrity",       data.crisisScore],
    ["strategy_performance", strategy.crisisScore],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  const dominantCrisisType: CrisisType | null = scores[0][1] > 10 ? scores[0][0] : null;

  // Confidence: more detectors flagging → higher confidence
  const activeDetectors = scores.filter(([, s]) => s >= 20).length;
  const confidence = Math.min(100, 20 + activeDetectors * 20);

  // Aggregate evidence
  const supportingEvidence: string[] = [
    ...market.evidence,
    ...broker.evidence,
    ...infra.evidence,
    ...data.evidence,
    ...strategy.evidence,
  ].filter(Boolean);

  const expectedImpact = buildImpactStatement(overallSeverity, dominantCrisisType);
  const recommendedResponse = buildResponseStatement(overallSeverity, dominantCrisisType);

  return {
    overallSeverity,
    overallScore,
    confidence,
    dominantCrisisType,
    marketSignal:        market,
    brokerSignal:        broker,
    infrastructureSignal: infra,
    dataIntegritySignal:  data,
    strategySignal:       strategy,
    supportingEvidence,
    expectedImpact,
    recommendedResponse,
    timestamp: new Date().toISOString(),
  };
}

function buildImpactStatement(severity: CrisisSeverity, type: CrisisType | null): string {
  switch (severity) {
    case "catastrophic": return "Complete trading halt required. Capital at maximum risk. All systems compromised.";
    case "critical":     return "Severe trading restrictions. Significant capital risk. Immediate action required.";
    case "major":        return "Material impact on trading quality. Elevated risk of losses. Defensive posture needed.";
    case "moderate":     return "Noticeable degradation in conditions. Increased risk. Caution warranted.";
    case "minor":        return "Minor deviation from normal. Low impact expected with monitoring.";
    default:             return "Normal operating conditions. No material impact expected.";
  }
}

function buildResponseStatement(severity: CrisisSeverity, type: CrisisType | null): string {
  const typeNote = type ? ` (${type.replace("_", " ")} crisis dominant)` : "";
  switch (severity) {
    case "catastrophic": return `Emergency mode — halt all trading${typeNote}. Monitor all systems continuously.`;
    case "critical":     return `Survival mode — no new trades${typeNote}. Protect open positions immediately.`;
    case "major":        return `Observation mode — suspend new entries${typeNote}. Manage existing trades defensively.`;
    case "moderate":     return `Defensive mode — reduce exposure${typeNote}. Apply higher confirmation for new entries.`;
    case "minor":        return `Caution mode — increase monitoring frequency${typeNote}. No restrictions, alerts active.`;
    default:             return "Normal mode — standard operation. Continue monitoring.";
  }
}
