// ─── Stage 2: Independent Advisor Assessments ────────────────────────────────
import type { AdvisorAssessment, AdvisorId } from "./types.js";
import type { EaiDecisionType } from "../executive-ai-core/types.js";

function ts(): string { return new Date().toISOString(); }

function scoreToRec(score: number): EaiDecisionType {
  if (score >= 80) return "trade";
  if (score >= 65) return "wait";
  if (score >= 45) return "observe";
  if (score >= 30) return "reduce_risk";
  if (score >= 15) return "pause_trading";
  return "emergency_halt";
}

// ─── Strategy Advisor ─────────────────────────────────────────────────────────

export function strategyAdvisor(
  stratResult: Record<string, unknown> | null
): AdvisorAssessment {
  const r = stratResult ?? {};
  const execScore     = Number(r.executiveScore     ?? 50);
  const rulePassRate  = Number(r.rulePassRate       ?? 50);
  const strength      = Number(r.strategyStrength   ?? 50);
  const composite     = execScore * 0.45 + rulePassRate * 0.30 + strength * 0.25;
  const rec           = scoreToRec(composite);
  const confidence    = Math.min(95, Math.max(20, composite));
  const reliability   = Math.min(90, rulePassRate * 0.8 + 18);

  return {
    advisorId:          "strategy_advisor",
    advisorName:        "Strategy Intelligence Advisor",
    recommendation:     rec,
    confidence,
    supportingEvidence: [
      `Executive strategy score: ${execScore.toFixed(0)}/100`,
      `Rule pass rate: ${rulePassRate.toFixed(0)}%`,
      `Strategy strength: ${strength.toFixed(0)}/100`,
      `AMD/SMC rule engine status: ${rulePassRate >= 70 ? "passing" : "below threshold"}`,
    ],
    reliability,
    keyRisks: [
      rulePassRate < 70 ? "Rule pass rate below 70% threshold" : "Rule engine healthy",
      execScore < 60 ? "Strategy score below confidence threshold" : "Strategy signal is strong",
    ],
    dataQuality: execScore > 0 ? (execScore > 60 ? "strong" : "moderate") : "missing",
    reasoning:   `Strategy composite score of ${composite.toFixed(0)} from exec=${execScore.toFixed(0)}, rules=${rulePassRate.toFixed(0)}%, strength=${strength.toFixed(0)}. Recommends: ${rec}.`,
    timestamp:   ts(),
  };
}

// ─── Market Advisor ───────────────────────────────────────────────────────────

export function marketAdvisor(
  erbResult: Record<string, unknown> | null
): AdvisorAssessment {
  const r     = erbResult ?? {};
  const mkt   = (r.market ?? {}) as Record<string, unknown>;
  const health = Number(mkt.healthScore ?? 60);
  const vol    = Number(mkt.volatilityScore ?? 40);
  const regime = String(mkt.regime ?? "unknown");

  const marketScore = health * 0.50 + (100 - vol) * 0.50;
  const rec         = scoreToRec(marketScore);
  const confidence  = Math.min(90, Math.max(20, marketScore * 0.85));

  return {
    advisorId:          "market_advisor",
    advisorName:        "Market Intelligence Advisor",
    recommendation:     rec,
    confidence,
    supportingEvidence: [
      `Market health score: ${health.toFixed(0)}/100`,
      `Market regime: ${regime}`,
      `Volatility score: ${vol.toFixed(0)}/100 (lower is better for entries)`,
      `Market opportunity: ${marketScore.toFixed(0)}/100`,
    ],
    reliability:  75,
    keyRisks: [
      vol > 70 ? "High volatility — adverse entry conditions" : "Volatility within acceptable range",
      health < 40 ? "Poor market health — unfavorable conditions" : "Market conditions adequate",
    ],
    dataQuality: health > 0 ? "moderate" : "missing",
    reasoning:   `Market composite score ${marketScore.toFixed(0)}: health=${health.toFixed(0)}, volatility=${vol.toFixed(0)}, regime=${regime}. Recommends: ${rec}.`,
    timestamp:   ts(),
  };
}

// ─── Risk Advisor ─────────────────────────────────────────────────────────────

export function riskAdvisor(
  erbResult: Record<string, unknown> | null
): AdvisorAssessment {
  const r              = erbResult ?? {};
  const overallRisk    = Number(r.overallRiskScore        ?? 30);
  const survivalScore  = Number(r.survivalScore           ?? 75);
  const capitalHealth  = Number(r.capitalHealthScore      ?? 75);
  const brokerScore    = Number(r.brokerReliabilityScore  ?? 80);
  const crisisStatus   = String(r.crisisStatus            ?? "none");
  const survivalMode   = Boolean(r.survivalModeActive);
  const erbRec         = String(r.recommendation         ?? "trade_normally");

  // Risk advisor is the most conservative — direct mapping from ERB
  let rec: EaiDecisionType = "observe";
  if (crisisStatus === "emergency" || survivalMode || erbRec === "emergency_stop") {
    rec = "emergency_halt";
  } else if (erbRec === "survival_mode" || overallRisk >= 80) {
    rec = "pause_trading";
  } else if (erbRec === "defensive_mode" || overallRisk >= 65) {
    rec = "reduce_risk";
  } else if (erbRec === "observation_mode" || overallRisk >= 45) {
    rec = "observe";
  } else if (erbRec === "restrict_exposure" || overallRisk >= 30) {
    rec = "wait";
  } else {
    rec = overallRisk < 30 ? "trade" : "wait";
  }

  const safetyScore = (100 - overallRisk) * 0.35 + survivalScore * 0.25 + capitalHealth * 0.20 + brokerScore * 0.20;
  const confidence  = Math.min(95, Math.max(30, safetyScore));

  return {
    advisorId:          "risk_advisor",
    advisorName:        "Risk Intelligence Advisor",
    recommendation:     rec,
    confidence,
    supportingEvidence: [
      `ERB overall risk score: ${overallRisk.toFixed(0)}/100`,
      `Survival score: ${survivalScore.toFixed(0)}/100`,
      `Capital health: ${capitalHealth.toFixed(0)}/100`,
      `Broker reliability: ${brokerScore.toFixed(0)}/100`,
      `Crisis status: ${crisisStatus}`,
      `ERB recommendation: ${erbRec}`,
    ],
    reliability:  95,  // Risk advisor has highest reliability — ERB is always current
    keyRisks: [
      overallRisk > 65 ? `High ERB risk score (${overallRisk.toFixed(0)}) — capital at risk` : "Risk within acceptable bounds",
      crisisStatus !== "none" ? `Active crisis condition: ${crisisStatus}` : "No active crisis",
      survivalMode ? "Survival mode is active — trading prohibited" : "Survival mode inactive",
    ],
    dataQuality: "strong",
    reasoning:   `ERB composite risk=${overallRisk.toFixed(0)}, survival=${survivalScore.toFixed(0)}, capital=${capitalHealth.toFixed(0)}, ERB recommends ${erbRec}. Risk advisor recommends: ${rec}.`,
    timestamp:   ts(),
  };
}

// ─── Memory Advisor ───────────────────────────────────────────────────────────

export function memoryAdvisor(
  memoryData: { historicalWinRate?: number; similarTradeCount?: number; historicalConfidence?: number } | null
): AdvisorAssessment {
  const d  = memoryData ?? {};
  const wr = Number(d.historicalWinRate    ?? 50);
  const sc = Number(d.similarTradeCount   ?? 0);
  const hc = Number(d.historicalConfidence ?? 50);

  const memScore = wr * 0.50 + hc * 0.30 + Math.min(100, sc * 10) * 0.20;
  const rec      = scoreToRec(memScore);
  const conf     = Math.min(85, Math.max(20, hc * 0.7 + 15));

  return {
    advisorId:          "memory_advisor",
    advisorName:        "Memory Intelligence Advisor",
    recommendation:     rec,
    confidence:         conf,
    supportingEvidence: [
      `Historical win rate: ${wr.toFixed(0)}%`,
      `Similar trade count: ${sc}`,
      `Historical confidence: ${hc.toFixed(0)}/100`,
      sc < 3 ? "Insufficient historical precedent for high-confidence recommendation" : "Historical data supports recommendation",
    ],
    reliability: sc > 10 ? 80 : sc > 3 ? 60 : 35,
    keyRisks: [
      sc < 5 ? "Insufficient similar historical trades — low statistical confidence" : "Adequate historical sample",
      wr < 50 ? "Historical win rate below 50% for this pattern" : "Positive historical win rate",
    ],
    dataQuality: sc > 5 ? "moderate" : sc > 0 ? "weak" : "missing",
    reasoning:   `Memory composite ${memScore.toFixed(0)}: winRate=${wr.toFixed(0)}%, samples=${sc}, confidence=${hc.toFixed(0)}. Recommends: ${rec}.`,
    timestamp:   ts(),
  };
}

// ─── Learning Advisor ─────────────────────────────────────────────────────────

export function learningAdvisor(
  learningData: { overallConfidence?: number; performanceDrift?: number; predictionReliability?: number } | null
): AdvisorAssessment {
  const d         = learningData ?? {};
  const conf      = Number(d.overallConfidence      ?? 55);
  const drift     = Number(d.performanceDrift       ?? 0);
  const reliability = Number(d.predictionReliability ?? 55);

  const learningScore = conf * 0.50 + reliability * 0.35 + Math.max(0, drift) * 0.15;
  const rec           = scoreToRec(learningScore);

  return {
    advisorId:          "learning_advisor",
    advisorName:        "Learning Intelligence Advisor",
    recommendation:     rec,
    confidence:         Math.min(85, Math.max(20, conf)),
    supportingEvidence: [
      `Learning confidence: ${conf.toFixed(0)}/100`,
      `Prediction reliability: ${reliability.toFixed(0)}/100`,
      `Performance drift: ${drift > 0 ? "+" : ""}${drift.toFixed(1)} (${drift >= 0 ? "improving" : "degrading"})`,
    ],
    reliability: Math.min(80, reliability),
    keyRisks: [
      drift < -20 ? "Significant negative performance drift — model degrading" : "Performance drift within acceptable range",
      conf < 50 ? "Low learning confidence — model needs more data" : "Learning model is confident",
    ],
    dataQuality: conf > 0 ? (conf > 60 ? "strong" : "moderate") : "missing",
    reasoning:   `Learning score ${learningScore.toFixed(0)}: confidence=${conf.toFixed(0)}, reliability=${reliability.toFixed(0)}, drift=${drift.toFixed(1)}. Recommends: ${rec}.`,
    timestamp:   ts(),
  };
}

// ─── Identity Advisor ─────────────────────────────────────────────────────────

export function identityAdvisor(
  identityData: { identitySimilarityScore?: number; preferenceAlignmentScore?: number; identityConfidence?: number } | null
): AdvisorAssessment {
  const d       = identityData ?? {};
  const simil   = Number(d.identitySimilarityScore  ?? 60);
  const align   = Number(d.preferenceAlignmentScore ?? 60);
  const idConf  = Number(d.identityConfidence       ?? 55);

  const idScore = simil * 0.45 + align * 0.40 + idConf * 0.15;
  const rec     = scoreToRec(idScore);

  return {
    advisorId:          "identity_advisor",
    advisorName:        "Trader Identity Advisor",
    recommendation:     rec,
    confidence:         Math.min(80, Math.max(20, idScore * 0.75)),
    supportingEvidence: [
      `Identity similarity: ${simil.toFixed(0)}/100`,
      `Preference alignment: ${align.toFixed(0)}/100`,
      `Identity confidence: ${idConf.toFixed(0)}/100`,
      simil >= 70 ? "Setup strongly aligns with established trading identity" : "Partial alignment with trader profile",
    ],
    reliability: 65,
    keyRisks: [
      simil < 50 ? "Setup diverges from trader's established identity" : "Identity alignment satisfactory",
      align < 50 ? "Setup misaligns with historical preferences" : "Preference alignment acceptable",
    ],
    dataQuality: simil > 0 ? "moderate" : "missing",
    reasoning:   `Identity composite ${idScore.toFixed(0)}: similarity=${simil.toFixed(0)}, alignment=${align.toFixed(0)}. Recommends: ${rec}.`,
    timestamp:   ts(),
  };
}

// ─── Run all advisors ─────────────────────────────────────────────────────────

export function runAllAdvisors(params: {
  strategyResult:  Record<string, unknown> | null;
  erbResult:       Record<string, unknown> | null;
}): AdvisorAssessment[] {
  const { strategyResult, erbResult } = params;
  return [
    strategyAdvisor(strategyResult),
    marketAdvisor(erbResult),
    riskAdvisor(erbResult),
    memoryAdvisor(null),
    learningAdvisor(null),
    identityAdvisor(null),
  ];
}
