// ─── Risk Intelligence — Position Risk Evaluator ──────────────────────────────
// Evaluates individual position risk: size, RR, exposure, duration.
// Advisory only. NEVER modifies positions.

import { randomUUID } from "crypto";
import type { PositionInput, PositionRiskResult, RiskAlert } from "./types.js";
import { scoreToRiskClassification } from "./scorer.js";

// ─── Risk limits (institutional guidelines) ───────────────────────────────────

const MAX_RISK_PCT    = 2.0;   // max 2% per trade
const IDEAL_RR        = 2.0;   // minimum acceptable RR
const MAX_EXPOSURE    = 0.15;  // max 15% of balance as notional exposure
const MAX_DURATION_H  = 48;    // flag positions open >48 hours

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, isFinite(v) ? v : 50));
}

// ─── Sub-scorers ──────────────────────────────────────────────────────────────

/** Size score: 0 = way oversize, 100 = perfectly sized */
function scoreSizing(riskPct: number): number {
  if (riskPct <= 0)                    return 100;
  if (riskPct > MAX_RISK_PCT * 3)      return 0;
  if (riskPct <= MAX_RISK_PCT)         return clamp(100 - (riskPct / MAX_RISK_PCT) * 20);
  return clamp(80 - ((riskPct - MAX_RISK_PCT) / (MAX_RISK_PCT * 2)) * 80);
}

/** RR score: 0 = terrible RR, 100 = elite RR */
function scoreRR(expectedRR: number): number {
  if (expectedRR <= 0)       return 0;
  if (expectedRR < 1.0)      return clamp(expectedRR * 20);
  if (expectedRR < IDEAL_RR) return clamp(20 + ((expectedRR - 1) / (IDEAL_RR - 1)) * 40);
  if (expectedRR < 4.0)      return clamp(60 + ((expectedRR - IDEAL_RR) / (4.0 - IDEAL_RR)) * 35);
  return 95;
}

/** Exposure score: 0 = over-exposed, 100 = well-controlled */
function scoreExposure(exposureUsd: number, balanceUsd: number): number {
  if (balanceUsd <= 0 || exposureUsd <= 0) return 100;
  const exposurePct = exposureUsd / balanceUsd;
  if (exposurePct >= MAX_EXPOSURE * 3) return 0;
  if (exposurePct >= MAX_EXPOSURE)     return clamp(50 - ((exposurePct - MAX_EXPOSURE) / (MAX_EXPOSURE * 2)) * 50);
  return clamp(100 - (exposurePct / MAX_EXPOSURE) * 50);
}

/** Duration score: 0 = held far too long, 100 = within normal */
function scoreDuration(durationSec: number): number {
  const hours = durationSec / 3600;
  if (hours <= 4)                       return 100;
  if (hours <= 24)                      return clamp(100 - ((hours - 4) / 20) * 20);
  if (hours <= MAX_DURATION_H)          return clamp(80 - ((hours - 24) / 24) * 30);
  return clamp(50 - ((hours - MAX_DURATION_H) / 24) * 25);
}

// ─── Alert builder ────────────────────────────────────────────────────────────

function buildPositionAlerts(pos: PositionInput): RiskAlert[] {
  const alerts: RiskAlert[] = [];

  if (pos.riskPercentage > MAX_RISK_PCT) {
    alerts.push({
      alertId: randomUUID(), category: "position", severity: "warning",
      title: "Position Oversized",
      message: `Risk ${pos.riskPercentage.toFixed(2)}% exceeds the ${MAX_RISK_PCT}% per-trade guideline`,
      evidence: [`Risk %: ${pos.riskPercentage.toFixed(2)}%`, `Guideline: ${MAX_RISK_PCT}%`, `Max loss: $${pos.maxLoss.toFixed(2)}`],
      metrics: { riskPct: pos.riskPercentage, guideline: MAX_RISK_PCT },
    });
  }

  if (pos.expectedRR < 1.5) {
    alerts.push({
      alertId: randomUUID(), category: "position", severity: "warning",
      title: "Low Risk/Reward Ratio",
      message: `Expected RR ${pos.expectedRR.toFixed(2)} is below the 1.5 minimum — unfavourable trade`,
      evidence: [`Expected RR: ${pos.expectedRR.toFixed(2)}`, `Minimum: 1.5`, `Ideal: ${IDEAL_RR}`],
      metrics: { expectedRR: pos.expectedRR, minimum: 1.5, ideal: IDEAL_RR },
    });
  }

  const durationH = pos.positionDuration / 3600;
  if (durationH > MAX_DURATION_H) {
    alerts.push({
      alertId: randomUUID(), category: "position", severity: "warning",
      title: "Position Held Too Long",
      message: `Position open for ${durationH.toFixed(1)}h — exceeds ${MAX_DURATION_H}h guideline`,
      evidence: [`Duration: ${durationH.toFixed(1)} hours`, `Guideline: ${MAX_DURATION_H}h`],
      metrics: { durationH, guideline: MAX_DURATION_H },
    });
  }

  if (pos.accountBalance > 0 && pos.tradeExposure / pos.accountBalance > MAX_EXPOSURE) {
    const exposurePct = (pos.tradeExposure / pos.accountBalance) * 100;
    alerts.push({
      alertId: randomUUID(), category: "position", severity: "warning",
      title: "Notional Exposure High",
      message: `Notional exposure ${exposurePct.toFixed(1)}% of account — above ${(MAX_EXPOSURE * 100).toFixed(0)}% guideline`,
      evidence: [`Exposure: $${pos.tradeExposure.toFixed(2)} (${exposurePct.toFixed(1)}%)`, `Balance: $${pos.accountBalance.toFixed(2)}`],
      metrics: { exposurePct, guideline: MAX_EXPOSURE * 100 },
    });
  }

  return alerts;
}

// ─── Main evaluator ───────────────────────────────────────────────────────────

export function evaluatePositionRisk(pos: PositionInput): PositionRiskResult {
  const sizeScore     = scoreSizing(pos.riskPercentage);
  const rrScore       = scoreRR(pos.expectedRR);
  const exposureScore = scoreExposure(pos.tradeExposure, pos.accountBalance);
  const durationScore = scoreDuration(pos.positionDuration);
  const riskPctScore  = scoreSizing(pos.riskPercentage);

  const metrics = { sizeScore, rrScore, exposureScore, durationScore, riskPctScore };

  // Weighted position health (higher = lower risk on position)
  const positionHealthScore = clamp(
    sizeScore     * 0.30 +
    rrScore       * 0.30 +
    exposureScore * 0.20 +
    durationScore * 0.10 +
    riskPctScore  * 0.10,
  );

  // Convert health→ risk score
  const positionRiskScore = clamp(100 - positionHealthScore);
  const riskClassification = scoreToRiskClassification(positionRiskScore);

  const evidence: string[] = [
    `Position size: ${pos.positionSize.toFixed(2)} lots on ${pos.pair} (${pos.direction})`,
    `Stop loss distance: ${pos.stopLossDistance.toFixed(1)} pips`,
    `Risk: ${pos.riskPercentage.toFixed(2)}% ($${pos.maxLoss.toFixed(2)}) — limit ${MAX_RISK_PCT}%`,
    `Expected RR: ${pos.expectedRR.toFixed(2)} — target ≥${IDEAL_RR}`,
    `Notional exposure: $${pos.tradeExposure.toFixed(2)} (${pos.accountBalance > 0 ? ((pos.tradeExposure / pos.accountBalance) * 100).toFixed(1) : "N/A"}% of balance)`,
    `Duration: ${(pos.positionDuration / 3600).toFixed(1)}h — limit ${MAX_DURATION_H}h`,
    `Current P/L: $${pos.currentPnl >= 0 ? "+" : ""}${pos.currentPnl.toFixed(2)}`,
    `Position risk score: ${positionRiskScore.toFixed(1)}/100`,
  ];

  const alerts = buildPositionAlerts(pos);

  return { positionRiskScore, riskClassification, metrics, evidence, alerts };
}
