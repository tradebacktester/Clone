// ─── Trader Identity — Stage 1 Rule Identity ─────────────────────────────────
// Evaluates how closely a setup adheres to the deterministic strategy rules.
// This is the permanent foundation — always active in both stages.

import { clamp } from "./types.js";
import type { IdentitySetup, RuleCheck, RuleIdentityResult } from "./types.js";

// ─── Rule definitions ─────────────────────────────────────────────────────────

interface RuleDef {
  name:   string;
  weight: number;
  check:  (s: IdentitySetup) => { score: number; detail: string };
}

const RULES: RuleDef[] = [
  {
    name: "Supply & Demand Zone Quality",
    weight: 0.15,
    check(s) {
      const avg = (s.supplyQuality + s.demandQuality) / 2;
      const score = clamp(avg);
      const detail = avg >= 70
        ? `Zone quality ${avg.toFixed(0)}/100 — well-defined supply/demand levels.`
        : avg >= 50
        ? `Zone quality ${avg.toFixed(0)}/100 — zones present but definition below optimal.`
        : `Zone quality ${avg.toFixed(0)}/100 — weak or undefined zones.`;
      return { score, detail };
    },
  },
  {
    name: "Premium / Discount Framework",
    weight: 0.12,
    check(s) {
      // Demand zones prefer discount (buying below equilibrium), supply prefers premium.
      // We proxy this from demand quality vs supply quality relative to bias.
      const isLong  = s.direction === "buy"  || s.demandQuality >= s.supplyQuality;
      const isShort = s.direction === "sell" || s.supplyQuality > s.demandQuality;
      const zoneScore = isLong
        ? clamp(s.demandQuality)
        : isShort
        ? clamp(s.supplyQuality)
        : clamp((s.demandQuality + s.supplyQuality) / 2);
      const score = zoneScore;
      const detail = score >= 70
        ? "Premium/Discount alignment confirmed — entering at favourable zone."
        : score >= 50
        ? "Partial premium/discount alignment."
        : "Weak premium/discount alignment — entering against optimal framework.";
      return { score, detail };
    },
  },
  {
    name: "Liquidity Sweep Confirmation",
    weight: 0.14,
    check(s) {
      const score = clamp(s.liquidityScore);
      const detail = score >= 75
        ? `Liquidity sweep confirmed (${score.toFixed(0)}/100) — smart-money signature present.`
        : score >= 50
        ? `Partial liquidity sweep (${score.toFixed(0)}/100) — some sweep evidence.`
        : `Weak or absent liquidity sweep (${score.toFixed(0)}/100).`;
      return { score, detail };
    },
  },
  {
    name: "AMD Sequence Completeness",
    weight: 0.15,
    check(s) {
      const score = clamp(s.amdScore);
      const detail = score >= 75
        ? `AMD sequence complete (${score.toFixed(0)}/100) — Accumulation/Manipulation/Distribution confirmed.`
        : score >= 50
        ? `AMD sequence partial (${score.toFixed(0)}/100) — not all phases clearly identified.`
        : `AMD sequence weak (${score.toFixed(0)}/100) — trade lacks AMD structure.`;
      return { score, detail };
    },
  },
  {
    name: "Confirmation Signal Quality",
    weight: 0.13,
    check(s) {
      const score = clamp(s.confirmationQuality);
      const detail = score >= 70
        ? `Confirmation quality ${score.toFixed(0)}/100 — strong reversal/continuation signal.`
        : score >= 50
        ? `Confirmation quality ${score.toFixed(0)}/100 — moderate signal.`
        : `Confirmation quality ${score.toFixed(0)}/100 — signal too weak.`;
      return { score, detail };
    },
  },
  {
    name: "Overall Setup Score Threshold",
    weight: 0.12,
    check(s) {
      const score = clamp(s.setupScore);
      const detail = score >= 70
        ? `Setup score ${score.toFixed(0)}/100 — meets quality threshold.`
        : score >= 55
        ? `Setup score ${score.toFixed(0)}/100 — borderline quality.`
        : `Setup score ${score.toFixed(0)}/100 — below minimum quality threshold.`;
      return { score, detail };
    },
  },
  {
    name: "Trade Quality Index (TQI) Gate",
    weight: 0.12,
    check(s) {
      const score = clamp(s.tqi);
      const detail = score >= 65
        ? `TQI ${score.toFixed(0)}/100 — passes the V2 TQI gate (≥65).`
        : score >= 50
        ? `TQI ${score.toFixed(0)}/100 — below TQI gate; elevated risk.`
        : `TQI ${score.toFixed(0)}/100 — fails TQI gate; setup not viable.`;
      return { score, detail };
    },
  },
  {
    name: "Risk-to-Reward Minimum",
    weight: 0.08,
    check(s) {
      // Minimum R:R for the strategy is 1.5
      const raw   = Math.min(s.rrPlanned / 1.5, 2.0);  // caps bonus at 2x minimum
      const score = clamp(raw * 50);                     // 50 at 1:1, 100 at 2x min
      const detail = s.rrPlanned >= 2.0
        ? `R:R ${s.rrPlanned.toFixed(2)} — excellent, well above 1.5 minimum.`
        : s.rrPlanned >= 1.5
        ? `R:R ${s.rrPlanned.toFixed(2)} — meets 1.5 minimum.`
        : `R:R ${s.rrPlanned.toFixed(2)} — below 1.5 minimum required.`;
      return { score, detail };
    },
  },
  {
    name: "Spread / Execution Cost",
    weight: 0.09,
    check(s) {
      // Acceptable spread: <3 pips for majors. Score inversely.
      const maxPips = 3;
      const score   = clamp(100 - (s.spreadPips / maxPips) * 100);
      const detail  = s.spreadPips <= 1.5
        ? `Spread ${s.spreadPips.toFixed(2)} pips — favourable execution cost.`
        : s.spreadPips <= 3
        ? `Spread ${s.spreadPips.toFixed(2)} pips — acceptable.`
        : `Spread ${s.spreadPips.toFixed(2)} pips — high spread erodes edge.`;
      return { score, detail };
    },
  },
];

// ─── Main function ────────────────────────────────────────────────────────────

export function evaluateRuleIdentity(setup: IdentitySetup): RuleIdentityResult {
  const checks: RuleCheck[] = RULES.map(r => {
    const { score, detail } = r.check(setup);
    return {
      name:   r.name,
      score:  clamp(score),
      passed: score >= 60,
      weight: r.weight,
      detail,
    };
  });

  const weighted = checks.reduce((sum, c) => sum + c.score * c.weight, 0);
  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const ruleBaselineScore = clamp(totalWeight > 0 ? weighted / totalWeight : 0);

  const passingRules = checks.filter(c => c.passed).length;
  const totalRules   = checks.length;

  const summary = passingRules >= 8
    ? `All core rules satisfied — ${passingRules}/${totalRules} passing. Rule identity fully confirmed.`
    : passingRules >= 6
    ? `${passingRules}/${totalRules} core rules satisfied — strong rule alignment.`
    : passingRules >= 4
    ? `${passingRules}/${totalRules} core rules satisfied — partial rule compliance.`
    : `${passingRules}/${totalRules} core rules satisfied — significant rule violations present.`;

  return { ruleBaselineScore, passingRules, totalRules, checks, summary };
}
