import type { TradeSignal, AnalysisResult } from "@workspace/market-analysis";
import type { MtfAlignment } from "./mtf-engine.js";
import type { TqiResult } from "./tqi-engine.js";
import type { DynamicSizingResult } from "./dynamic-sizing.js";

export interface RuleResult {
  rule: string;
  passed: boolean;
  score: number;
  threshold: number;
  weight: string;
}

export interface MtfAlignmentDetail {
  timeframe: string;
  role: string;
  direction: string | null;
  status: "aligned" | "neutral" | "opposed" | "unavailable";
}

export interface TradeExplanation {
  summary: string;
  whyTaken: string[];
  rulesPassed: RuleResult[];
  rulesNearlyFailed: RuleResult[];
  confidenceBreakdown: { factor: string; contribution: number }[];
  riskAssessment: {
    lotSize: number;
    riskPct: number;
    riskAmount: number;
    stopLossPips: number;
    rr: number;
  };
  mtfAlignment: MtfAlignmentDetail[];
  tqiBreakdown: {
    component: string;
    score: number;
    maxScore: number;
    description: string;
  }[];
  tqi: number;
  tqiGrade: string;
  generatedAt: string;
}

function getRuleStatus(score: number, threshold: number): boolean {
  return score >= threshold;
}

export function generateExplanation(
  signal: TradeSignal,
  analysis: AnalysisResult,
  mtf: MtfAlignment,
  tqi: TqiResult,
  sizing: DynamicSizingResult,
): TradeExplanation {
  const pipSize = signal.pair.includes("JPY") ? 0.01 : 0.0001;
  const slPips = Math.round((Math.abs(signal.entryPrice - signal.stopLoss) / pipSize) * 10) / 10;

  // ── Why this trade was taken ───────────────────────────────────────────────
  const whyTaken: string[] = [];

  if (signal.confidence >= 85) {
    whyTaken.push(`Exceptional signal confidence (${signal.confidence.toFixed(0)}%) — near-maximum confluence of factors`);
  } else if (signal.confidence >= 75) {
    whyTaken.push(`High signal confidence (${signal.confidence.toFixed(0)}%) — strong multi-factor confluence`);
  } else {
    whyTaken.push(`Signal confidence ${signal.confidence.toFixed(0)}% meets minimum threshold (65%)`);
  }

  if (signal.amdPhase === "distribution") {
    whyTaken.push(`AMD distribution phase — institutional distribution detected, expecting impulsive ${signal.direction} move`);
  } else if (signal.amdPhase === "manipulation") {
    whyTaken.push(`AMD manipulation phase — stop-hunt complete, smart money repositioning for ${signal.direction === "buy" ? "upward" : "downward"} distribution`);
  } else if (signal.amdPhase === "accumulation") {
    whyTaken.push(`AMD accumulation phase — institutional position building in progress`);
  }

  if (signal.liquidityScore >= 80) {
    whyTaken.push(`Premium liquidity sweep (score: ${signal.liquidityScore.toFixed(0)}/100) — clean stop-hunt with strong reversal evidence`);
  } else if (signal.liquidityScore >= 60) {
    whyTaken.push(`Confirmed liquidity sweep (score: ${signal.liquidityScore.toFixed(0)}/100)`);
  }

  if (signal.zoneStrength >= 80) {
    whyTaken.push(`High-quality ${signal.zoneType} zone (strength: ${signal.zoneStrength.toFixed(0)}/100) — strongly respected institutional level`);
  } else if (signal.zoneStrength >= 65) {
    whyTaken.push(`Valid ${signal.zoneType} zone (strength: ${signal.zoneStrength.toFixed(0)}/100)`);
  }

  if (analysis.fib) {
    const bias = analysis.fib.currentPriceBias;
    if ((signal.direction === "buy" && bias === "discount") || (signal.direction === "sell" && bias === "premium")) {
      whyTaken.push(`Price in ${bias} zone at FIB level ${signal.fibLevel.toFixed(3)} — optimal entry bias`);
    }
  }

  if (mtf.aligned) {
    whyTaken.push(`${mtf.alignedCount}/${mtf.totalCount} timeframes aligned ${signal.direction === "buy" ? "bullishly" : "bearishly"} — multi-timeframe confirmation`);
  } else {
    whyTaken.push(`Partial MTF alignment (${mtf.alignedCount}/${mtf.totalCount} TFs) — proceed with reduced confidence`);
  }

  whyTaken.push(`Risk:Reward of ${signal.riskReward.toFixed(1)}:1 — favourable asymmetric payoff`);

  const sessionHour = new Date().getUTCHours();
  const sessionDesc =
    (signal.session === "london" && sessionHour >= 7 && sessionHour < 12) ? "London open — peak institutional activity" :
    (signal.session === "newyork" && sessionHour >= 12 && sessionHour < 17) ? "New York open — high-volume session" :
    `${signal.session} session`;
  whyTaken.push(`Taken during ${sessionDesc}`);

  // ── Rules assessment ───────────────────────────────────────────────────────
  const allRules: RuleResult[] = [
    { rule: "Final Score Gate (≥80)", passed: signal.finalScore >= 80, score: signal.finalScore, threshold: 80, weight: "Hard gate" },
    { rule: "Signal Confidence (≥65%)", passed: signal.confidence >= 65, score: signal.confidence, threshold: 65, weight: "Hard gate" },
    { rule: "Trade Quality Index (≥65)", passed: tqi.tqi >= 65, score: tqi.tqi, threshold: 65, weight: "Hard gate" },
    { rule: "Zone Score (≥55)", passed: signal.zoneScore >= 55, score: signal.zoneScore, threshold: 55, weight: "30%" },
    { rule: "Liquidity Score (≥50)", passed: signal.liquidityScore >= 50, score: signal.liquidityScore, threshold: 50, weight: "25%" },
    { rule: "AMD Score (≥50)", passed: signal.amdScore >= 50, score: signal.amdScore, threshold: 50, weight: "25%" },
    { rule: "Confirmation Score (≥70)", passed: signal.confirmationScore >= 70, score: signal.confirmationScore, threshold: 70, weight: "20%" },
    { rule: "Risk:Reward (≥2.0:1)", passed: signal.riskReward >= 2.0, score: Math.round(signal.riskReward * 10), threshold: 20, weight: "Required" },
    { rule: "MTF Alignment (≥2/4 TFs)", passed: mtf.alignedCount >= 2, score: mtf.alignedCount * 25, threshold: 50, weight: "Filter" },
    { rule: "Regime Not Volatile", passed: analysis.regime.regime !== "volatile", score: analysis.regime.regime !== "volatile" ? 100 : 0, threshold: 50, weight: "Filter" },
  ];

  const rulesPassed = allRules.filter(r => r.passed);
  const NEAR_FAIL_MARGIN = 12;
  const rulesNearlyFailed = allRules.filter(r => r.passed && (r.score - r.threshold) <= NEAR_FAIL_MARGIN);

  // ── Confidence breakdown ───────────────────────────────────────────────────
  const FACTOR_WEIGHTS: Record<string, number> = {
    "Fresh zone": 12, "Tested zone": 6, "Zone strength > 80": 12, "Zone strength > 70": 8,
    "AMD distribution": 20, "AMD manipulation": 18, "AMD accumulation": 12,
    "Liquidity sweep": 15, "Confirmed sweep": 12, "Equal highs swept": 14, "Equal lows swept": 14,
    "FIB 0.618": 12, "FIB 0.5": 8, "FIB 0.382": 6,
    "BOS confirmed": 12, "Bullish market structure": 10, "Bearish market structure": 10,
    "London session": 8, "NY session": 8, "Asian session": 4,
    "Trending regime": 10, "Ranging regime": 6,
  };

  const confidenceBreakdown = signal.confluenceFactors.map(f => {
    const weight = Object.entries(FACTOR_WEIGHTS).find(([k]) => f.toLowerCase().includes(k.toLowerCase()))?.[1] ?? 5;
    return { factor: f, contribution: weight };
  });

  // ── MTF details ────────────────────────────────────────────────────────────
  const mtfAlignment: MtfAlignmentDetail[] = mtf.timeframes.map(tf => ({
    timeframe: tf.timeframe,
    role: tf.role,
    direction: tf.trend,
    status: !tf.available ? "unavailable"
      : tf.bullishBias && signal.direction === "buy" ? "aligned"
      : tf.bearishBias && signal.direction === "sell" ? "aligned"
      : tf.trend === "neutral" ? "neutral"
      : "opposed",
  }));

  const summary = [
    `${signal.direction.toUpperCase()} ${signal.pair}`,
    `TQI ${tqi.tqi.toFixed(0)} (${tqi.grade})`,
    `${mtf.alignedCount}/${mtf.totalCount} TFs aligned`,
    `${signal.amdPhase} AMD`,
    `${signal.session} session`,
    `${signal.riskReward.toFixed(1)}:1 R:R`,
  ].join(" | ");

  return {
    summary,
    whyTaken,
    rulesPassed,
    rulesNearlyFailed,
    confidenceBreakdown,
    riskAssessment: {
      lotSize: sizing.lotSize,
      riskPct: sizing.adjustedRiskPct,
      riskAmount: sizing.riskAmount,
      stopLossPips: slPips,
      rr: signal.riskReward,
    },
    mtfAlignment,
    tqiBreakdown: tqi.components.map(c => ({
      component: c.name,
      score: c.score,
      maxScore: c.maxScore,
      description: c.description,
    })),
    tqi: tqi.tqi,
    tqiGrade: tqi.grade,
    generatedAt: new Date().toISOString(),
  };
}
