// ─── Factor Analyzer ──────────────────────────────────────────────────────────
// Extracts the strongest positive and negative factors for a setup.
// Every factor must be evidence-backed and reproducible.
// Advisory only — no trade execution.

import { clamp } from "../learning-validation/data-validator.js";
import type { CurrentSetup, EvidenceFactor, TisComponent } from "./types.js";
import type { ExtractedFeature } from "../learning-core/types.js";
import type { MatchResult } from "./historical-matcher.js";

// ─── Factor extraction ────────────────────────────────────────────────────────

export function extractFactors(
  setup: CurrentSetup,
  features: ExtractedFeature[],
  match: MatchResult,
  tisComponents: TisComponent[],
): { positive: EvidenceFactor[]; negative: EvidenceFactor[] } {
  const all: EvidenceFactor[] = [];

  // ── Zone quality factors ──
  const bestZone = Math.max(setup.supplyQuality, setup.demandQuality);
  if (bestZone >= 70) {
    all.push({
      name: "Strong Zone Quality",
      impact: clamp((bestZone - 50) * 1.2, 0, 60),
      explanation: `Zone quality ${bestZone.toFixed(0)}/100 — historically strong zones show higher win rates`,
      category: "zone",
      confidence: clamp(bestZone, 50, 95),
    });
  } else if (bestZone < 45) {
    all.push({
      name: "Weak Zone Quality",
      impact: -clamp((50 - bestZone) * 1.2, 0, 60),
      explanation: `Zone quality ${bestZone.toFixed(0)}/100 — weak zones reduce probability of successful trade`,
      category: "zone",
      confidence: 70,
    });
  }

  // ── AMD quality factors ──
  if (setup.amdScore >= 65) {
    all.push({
      name: "Clear AMD Pattern",
      impact: clamp((setup.amdScore - 50) * 1.0, 0, 50),
      explanation: `AMD quality ${setup.amdScore.toFixed(0)}/100 — clear accumulation/manipulation/distribution increases setup reliability`,
      category: "execution",
      confidence: clamp(setup.amdScore, 55, 90),
    });
  } else if (setup.amdScore < 40) {
    all.push({
      name: "Weak AMD Pattern",
      impact: -clamp((50 - setup.amdScore) * 1.0, 0, 50),
      explanation: `AMD quality ${setup.amdScore.toFixed(0)}/100 — unclear AMD pattern reduces confidence`,
      category: "execution",
      confidence: 65,
    });
  }

  // ── Liquidity factors ──
  if (setup.liquidityScore >= 65) {
    all.push({
      name: "Strong Liquidity Sweep",
      impact: clamp((setup.liquidityScore - 50) * 0.8, 0, 40),
      explanation: `Liquidity score ${setup.liquidityScore.toFixed(0)}/100 — strong liquidity sweep precedes high-probability reversals`,
      category: "execution",
      confidence: clamp(setup.liquidityScore, 55, 88),
    });
  } else if (setup.liquidityScore < 40) {
    all.push({
      name: "Weak Liquidity Sweep",
      impact: -clamp((50 - setup.liquidityScore) * 0.8, 0, 40),
      explanation: `Liquidity score ${setup.liquidityScore.toFixed(0)}/100 — insufficient liquidity sweep reduces reversal probability`,
      category: "execution",
      confidence: 65,
    });
  }

  // ── Confirmation factors ──
  if (setup.confirmationQuality >= 65) {
    all.push({
      name: "Strong Confirmation",
      impact: clamp((setup.confirmationQuality - 50) * 0.9, 0, 45),
      explanation: `Confirmation quality ${setup.confirmationQuality.toFixed(0)}/100 — strong confirmation candle validates the reversal`,
      category: "execution",
      confidence: clamp(setup.confirmationQuality, 55, 90),
    });
  } else if (setup.confirmationQuality < 40) {
    all.push({
      name: "Weak Confirmation",
      impact: -clamp((50 - setup.confirmationQuality) * 0.9, 0, 45),
      explanation: `Confirmation quality ${setup.confirmationQuality.toFixed(0)}/100 — weak confirmation increases false signal risk`,
      category: "execution",
      confidence: 65,
    });
  }

  // ── Session factors ──
  const sessionFeatures = features.filter(f => f.session === setup.session);
  if (sessionFeatures.length >= 5) {
    const wins    = sessionFeatures.filter(f => f.outcome === "win").length;
    const winRate = wins / sessionFeatures.length;
    const diff    = winRate - 0.5;
    if (Math.abs(diff) > 0.1) {
      all.push({
        name: diff > 0 ? "Favorable Session" : "Unfavorable Session",
        impact: clamp(diff * 80, -50, 50),
        explanation: `${setup.session} session: ${(winRate*100).toFixed(1)}% historical win rate (n=${sessionFeatures.length})`,
        category: "context",
        confidence: clamp(60 + sessionFeatures.length, 60, 85),
      });
    }
  } else if (setup.session === "london" || setup.session === "new_york") {
    all.push({
      name: "Primary Session",
      impact: 15,
      explanation: `${setup.session} is a primary high-liquidity session — generally favorable for SMC setups`,
      category: "context",
      confidence: 60,
    });
  }

  // ── Market regime factors ──
  const regimeFeatures = features.filter(f => f.marketRegime === setup.regime);
  if (regimeFeatures.length >= 5) {
    const wins    = regimeFeatures.filter(f => f.outcome === "win").length;
    const winRate = wins / regimeFeatures.length;
    const diff    = winRate - 0.5;
    if (Math.abs(diff) > 0.1) {
      all.push({
        name: diff > 0 ? `Favorable ${setup.regime} Regime` : `Challenging ${setup.regime} Regime`,
        impact: clamp(diff * 70, -45, 45),
        explanation: `${setup.regime} regime: ${(winRate*100).toFixed(1)}% win rate (n=${regimeFeatures.length})`,
        category: "context",
        confidence: clamp(60 + regimeFeatures.length * 0.5, 60, 85),
      });
    }
  }

  // ── Volatility factors ──
  if (setup.volatility === "high") {
    all.push({
      name: "High Volatility Risk",
      impact: -20,
      explanation: "High volatility increases slippage risk and reduces predictability of targets",
      category: "context",
      confidence: 70,
    });
  } else if (setup.volatility === "low") {
    all.push({
      name: "Low Volatility Environment",
      impact: 15,
      explanation: "Low volatility reduces false breakout risk and improves entry precision",
      category: "context",
      confidence: 65,
    });
  }

  // ── Spread factors ──
  if (setup.spreadPips <= 1.0) {
    all.push({
      name: "Tight Spread",
      impact: 20,
      explanation: `Spread ${setup.spreadPips.toFixed(2)} pips — tight spread reduces execution cost and improves RR`,
      category: "risk",
      confidence: 80,
    });
  } else if (setup.spreadPips >= 2.5) {
    all.push({
      name: "Wide Spread",
      impact: -25,
      explanation: `Spread ${setup.spreadPips.toFixed(2)} pips — wide spread significantly erodes profitability`,
      category: "risk",
      confidence: 85,
    });
  }

  // ── RR factor ──
  if (setup.rrPlanned >= 3) {
    all.push({
      name: "Excellent Risk:Reward",
      impact: 25,
      explanation: `Planned RR ${setup.rrPlanned.toFixed(1)}:1 — high RR can be profitable even with sub-50% win rate`,
      category: "risk",
      confidence: 75,
    });
  } else if (setup.rrPlanned < 1.5) {
    all.push({
      name: "Poor Risk:Reward",
      impact: -30,
      explanation: `Planned RR ${setup.rrPlanned.toFixed(1)}:1 — insufficient reward to justify risk`,
      category: "risk",
      confidence: 80,
    });
  }

  // ── Historical evidence quality factor ──
  if (match.evidenceCount >= 20) {
    all.push({
      name: "Strong Historical Evidence",
      impact: 20,
      explanation: `${match.evidenceCount} similar historical setups found — high statistical confidence`,
      category: "statistical",
      confidence: 85,
    });
  } else if (match.evidenceCount < 5) {
    all.push({
      name: "Insufficient Historical Evidence",
      impact: -25,
      explanation: `Only ${match.evidenceCount} similar historical setups — treat all conclusions with caution`,
      category: "statistical",
      confidence: 90,
    });
  }

  // ── TIS weak component factor ──
  const weakComponents = tisComponents.filter(c => c.score < 35 && !c.isInsufficient);
  if (weakComponents.length >= 3) {
    all.push({
      name: "Multiple Weak TIS Components",
      impact: -clamp(weakComponents.length * 8, 0, 35),
      explanation: `${weakComponents.length} TIS components score below 35: ${weakComponents.map(c => c.name).join(", ")}`,
      category: "statistical",
      confidence: 75,
    });
  }

  // ── Sort and split ──
  const positive = all
    .filter(f => f.impact > 0)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5);

  const negative = all
    .filter(f => f.impact < 0)
    .sort((a, b) => a.impact - b.impact)   // most negative first
    .slice(0, 5);

  return { positive, negative };
}
