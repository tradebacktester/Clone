// ─── Risk Intelligence — Portfolio Risk Evaluator ─────────────────────────────
// Evaluates portfolio-level risk: concentration, correlation, direction, capacity.
// Advisory only. NEVER modifies positions.

import { randomUUID } from "crypto";
import type { PortfolioInput, PortfolioRiskResult, RiskAlert } from "./types.js";
import { scoreToRiskClassification } from "./scorer.js";

// ─── Limits ───────────────────────────────────────────────────────────────────

const MAX_POSITIONS         = 5;     // max simultaneous open trades
const MAX_PAIR_CONCENTRATION = 0.6;  // max 60% of exposure in one pair
const MAX_TOTAL_RISK_PCT    = 6.0;   // max 6% total open risk
const MAX_DIRECTIONAL_BIAS  = 0.75;  // max 75% positions in one direction

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, isFinite(v) ? v : 0));
}

// ─── Currency exposure builder ────────────────────────────────────────────────

export function buildCurrencyExposure(
  pairExposure: Record<string, number>,
): Record<string, number> {
  const currencies: Record<string, number> = {};
  for (const [pair, sizeUsd] of Object.entries(pairExposure)) {
    const base  = pair.slice(0, 3).toUpperCase();
    const quote = pair.slice(3, 6).toUpperCase();
    currencies[base]  = (currencies[base]  ?? 0) + sizeUsd;
    currencies[quote] = (currencies[quote] ?? 0) + sizeUsd;
  }
  return currencies;
}

// ─── Sub-scorers ──────────────────────────────────────────────────────────────

/** Concentration: 0 = all in one pair, 100 = perfectly diversified */
function scoreConcentration(pairExposure: Record<string, number>, totalExposure: number): number {
  if (totalExposure <= 0 || Object.keys(pairExposure).length === 0) return 100;
  const maxPairExposure = Math.max(...Object.values(pairExposure));
  const concentrationRatio = maxPairExposure / totalExposure;
  if (concentrationRatio >= MAX_PAIR_CONCENTRATION * 1.5) return 10;
  if (concentrationRatio >= MAX_PAIR_CONCENTRATION)        return 40;
  return clamp(100 - (concentrationRatio / MAX_PAIR_CONCENTRATION) * 60);
}

/** Correlation: 0 = all positions highly correlated, 100 = uncorrelated */
function scoreCorrelation(correlationMatrix: Record<string, Record<string, number>> | undefined, positions: { pair: string }[]): number {
  if (!correlationMatrix || positions.length < 2) return 75; // assume moderate when unknown
  let totalCorr = 0;
  let count = 0;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const p1 = positions[i]!.pair;
      const p2 = positions[j]!.pair;
      const corr = Math.abs(correlationMatrix[p1]?.[p2] ?? correlationMatrix[p2]?.[p1] ?? 0.5);
      totalCorr += corr;
      count++;
    }
  }
  const avgCorr = count > 0 ? totalCorr / count : 0.5;
  return clamp(100 - avgCorr * 80);
}

/** Direction bias: 0 = all same direction, 100 = balanced */
function scoreDirection(directionalBias: number): number {
  const absBias = Math.abs(directionalBias) / 100;
  if (absBias >= MAX_DIRECTIONAL_BIAS) return 20;
  return clamp(100 - (absBias / MAX_DIRECTIONAL_BIAS) * 80);
}

/** Capacity: 0 = at/over max trades, 100 = well within capacity */
function scoreCapacity(openTrades: number): number {
  if (openTrades <= 0)             return 100;
  if (openTrades >= MAX_POSITIONS) return clamp(100 - ((openTrades - MAX_POSITIONS + 1) / MAX_POSITIONS) * 100);
  return clamp(100 - (openTrades / MAX_POSITIONS) * 50);
}

/** Aggregate risk score: 0 = over risk limit, 100 = within */
function scoreAggregateRisk(totalRiskPct: number): number {
  if (totalRiskPct <= 0)                        return 100;
  if (totalRiskPct >= MAX_TOTAL_RISK_PCT * 1.5) return 0;
  if (totalRiskPct >= MAX_TOTAL_RISK_PCT)        return clamp(20 - ((totalRiskPct - MAX_TOTAL_RISK_PCT) / MAX_TOTAL_RISK_PCT) * 20);
  return clamp(100 - (totalRiskPct / MAX_TOTAL_RISK_PCT) * 80);
}

// ─── Alert builder ────────────────────────────────────────────────────────────

function buildPortfolioAlerts(
  result: Omit<PortfolioRiskResult, "evidence" | "alerts">,
): RiskAlert[] {
  const alerts: RiskAlert[] = [];

  if (result.openTrades > MAX_POSITIONS) {
    alerts.push({
      alertId: randomUUID(), category: "portfolio", severity: "warning",
      title: "Too Many Open Positions",
      message: `${result.openTrades} open positions exceeds the ${MAX_POSITIONS} maximum guideline`,
      evidence: [`Open trades: ${result.openTrades}`, `Maximum: ${MAX_POSITIONS}`],
      metrics: { openTrades: result.openTrades, maximum: MAX_POSITIONS },
    });
  }

  if (result.aggregateRisk >= MAX_TOTAL_RISK_PCT) {
    alerts.push({
      alertId: randomUUID(), category: "portfolio", severity: "warning",
      title: "Aggregate Portfolio Risk Elevated",
      message: `Total open risk ${result.aggregateRisk.toFixed(2)}% exceeds the ${MAX_TOTAL_RISK_PCT}% guideline`,
      evidence: [`Aggregate risk: ${result.aggregateRisk.toFixed(2)}%`, `Guideline: ${MAX_TOTAL_RISK_PCT}%`],
      metrics: { aggregateRisk: result.aggregateRisk, guideline: MAX_TOTAL_RISK_PCT },
    });
  }

  if (result.correlationExposure > 0.75) {
    alerts.push({
      alertId: randomUUID(), category: "portfolio", severity: "warning",
      title: "High Portfolio Correlation",
      message: `Average pair correlation at ${(result.correlationExposure * 100).toFixed(1)}% — diversification insufficient`,
      evidence: [`Avg correlation: ${(result.correlationExposure * 100).toFixed(1)}%`, "Correlated positions amplify risk"],
      metrics: { avgCorrelation: result.correlationExposure },
    });
  }

  if (Math.abs(result.directionalBias) > MAX_DIRECTIONAL_BIAS * 100) {
    const direction = result.directionalBias > 0 ? "long" : "short";
    alerts.push({
      alertId: randomUUID(), category: "portfolio", severity: "info",
      title: "Strong Directional Bias",
      message: `Portfolio is ${Math.abs(result.directionalBias).toFixed(0)}% ${direction} — concentrated directional exposure`,
      evidence: [`Directional bias: ${result.directionalBias.toFixed(0)}`, `Limit: ±${MAX_DIRECTIONAL_BIAS * 100}%`],
      metrics: { directionalBias: result.directionalBias, limit: MAX_DIRECTIONAL_BIAS * 100 },
    });
  }

  return alerts;
}

// ─── Main evaluator ───────────────────────────────────────────────────────────

export function evaluatePortfolioRisk(input: PortfolioInput): PortfolioRiskResult {
  const positions = input.openPositions;
  const n = positions.length;

  // Build exposures
  const pairExposure: Record<string, number> = {};
  let totalRiskUsd = 0;
  let buyCount = 0;
  let sellCount = 0;
  let totalExposureUsd = 0;

  for (const pos of positions) {
    const pairKey = pos.pair.toUpperCase().replace("/", "");
    pairExposure[pairKey] = (pairExposure[pairKey] ?? 0) + pos.sizeUsd;
    totalRiskUsd      += pos.riskUsd;
    totalExposureUsd  += pos.sizeUsd;
    if (pos.direction === "buy")  buyCount++;
    else                          sellCount++;
  }

  const currencyExposure = buildCurrencyExposure(pairExposure);

  // Metrics
  const aggregateRiskPct = input.accountBalance > 0
    ? (totalRiskUsd / input.accountBalance) * 100 : 0;

  const directionalBias = n > 0
    ? ((buyCount - sellCount) / n) * 100 : 0;

  const avgCorrelation = n >= 2
    ? (1 - scoreCorrelation(input.correlationMatrix, positions) / 100) * 0.8 + 0.2
    : 0;

  // Sub-scores
  const concentrationScore = scoreConcentration(pairExposure, totalExposureUsd);
  const correlationScore   = scoreCorrelation(input.correlationMatrix, positions);
  const directionScore     = scoreDirection(directionalBias);
  const capacityScore      = scoreCapacity(n);
  const aggregateScore     = scoreAggregateRisk(aggregateRiskPct);

  const metrics = { concentrationScore, correlationScore, directionScore, capacityScore };

  // Portfolio health (lower risk = higher health)
  const portfolioHealth = clamp(
    concentrationScore * 0.25 +
    correlationScore   * 0.25 +
    directionScore     * 0.20 +
    capacityScore      * 0.15 +
    aggregateScore     * 0.15,
  );

  const portfolioRiskScore = clamp(n === 0 ? 0 : 100 - portfolioHealth);
  const riskClassification = scoreToRiskClassification(portfolioRiskScore);

  const intermediate: Omit<PortfolioRiskResult, "evidence" | "alerts"> = {
    portfolioRiskScore,
    riskClassification,
    openTrades:          n,
    pairExposure,
    currencyExposure,
    correlationExposure: avgCorrelation,
    directionalBias,
    aggregateRisk:       aggregateRiskPct,
    metrics,
  };

  const evidence: string[] = [
    `Open positions: ${n} (max: ${input.maxOpenTrades})`,
    `Pairs: ${Object.keys(pairExposure).join(", ") || "none"}`,
    `Direction split: ${buyCount} long / ${sellCount} short (bias: ${directionalBias >= 0 ? "+" : ""}${directionalBias.toFixed(0)}%)`,
    `Total open risk: ${aggregateRiskPct.toFixed(2)}% ($${totalRiskUsd.toFixed(2)}) — limit ${MAX_TOTAL_RISK_PCT}%`,
    `Total notional exposure: $${totalExposureUsd.toFixed(2)}`,
    `Avg pair correlation: ${(avgCorrelation * 100).toFixed(1)}%`,
    `Concentration score: ${concentrationScore.toFixed(1)}, Correlation score: ${correlationScore.toFixed(1)}`,
    `Portfolio risk score: ${portfolioRiskScore.toFixed(1)}/100`,
  ];

  const alerts = buildPortfolioAlerts(intermediate);

  return { ...intermediate, evidence, alerts };
}
