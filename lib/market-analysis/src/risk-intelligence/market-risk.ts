// ─── Risk Intelligence — Market Risk Evaluator ────────────────────────────────
// Integrates Market Intelligence outputs into a market risk score.
// Advisory only. NEVER modifies strategy.

import { randomUUID } from "crypto";
import type { MarketRiskInput, MarketRiskResult, RiskAlert } from "./types.js";
import { scoreToRiskClassification } from "./scorer.js";

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, isFinite(v) ? v : 50));
}

// ─── Sub-scorers (higher output = more risk) ──────────────────────────────────

/** Volatility risk: high volatility = high risk */
function volatilityRisk(v: number): number {
  return clamp(v); // already 0-100, higher = riskier
}

/** Liquidity risk: low liquidity = high risk */
function liquidityRisk(l: number): number {
  return clamp(100 - l); // invert: low liquidity = high risk
}

/** Stability risk: low stability = high risk */
function stabilityRisk(s: number): number {
  return clamp(100 - s);
}

/** Correlation risk: high cross-pair correlation = high risk */
function correlationRisk(c: number): number {
  return clamp(c); // already risk-scaled
}

/** News risk: passed directly */
function newsRiskScore(n: number): number {
  return clamp(n);
}

// ─── Alert builder ────────────────────────────────────────────────────────────

function buildMarketAlerts(input: MarketRiskInput, marketRiskScore: number): RiskAlert[] {
  const alerts: RiskAlert[] = [];

  if (input.volatility > 75) {
    alerts.push({
      alertId: randomUUID(), category: "market", severity: "warning",
      title: "High Volatility Detected",
      message: `Market volatility at ${input.volatility.toFixed(1)}/100 — spreads widen and slippage risk increases`,
      evidence: [`Volatility: ${input.volatility.toFixed(1)}/100`, `Pair: ${input.pair}`, `Session: ${input.session}`],
      metrics: { volatility: input.volatility },
    });
  }

  if (input.liquidity < 30) {
    alerts.push({
      alertId: randomUUID(), category: "market", severity: "warning",
      title: "Low Market Liquidity",
      message: `Liquidity at ${input.liquidity.toFixed(1)}/100 — execution quality may be degraded`,
      evidence: [`Liquidity: ${input.liquidity.toFixed(1)}/100`, `Session: ${input.session}`],
      metrics: { liquidity: input.liquidity },
    });
  }

  if (input.newsRisk > 70) {
    alerts.push({
      alertId: randomUUID(), category: "market", severity: "critical",
      title: "High Impact News Risk",
      message: `News risk score ${input.newsRisk.toFixed(1)}/100 — high-impact event proximity detected`,
      evidence: [`News risk: ${input.newsRisk.toFixed(1)}/100`, `Pair: ${input.pair}`],
      metrics: { newsRisk: input.newsRisk },
    });
  }

  if (input.marketHealth < 30) {
    alerts.push({
      alertId: randomUUID(), category: "market", severity: "warning",
      title: "Poor Market Conditions",
      message: `Market health at ${input.marketHealth.toFixed(1)}/100 — unfavourable conditions for trading`,
      evidence: [`Market health: ${input.marketHealth.toFixed(1)}/100`, `Regime: ${input.regime}`],
      metrics: { marketHealth: input.marketHealth },
    });
  }

  if (marketRiskScore >= 75) {
    alerts.push({
      alertId: randomUUID(), category: "market", severity: "critical",
      title: "Critical Market Risk Level",
      message: `Composite market risk at ${marketRiskScore.toFixed(1)}/100 — elevated market danger`,
      evidence: [`Market risk score: ${marketRiskScore.toFixed(1)}/100`, `Pair: ${input.pair}`, `Regime: ${input.regime}`],
      metrics: { marketRiskScore },
    });
  }

  return alerts;
}

// ─── Main evaluator ───────────────────────────────────────────────────────────

export function evaluateMarketRisk(input: MarketRiskInput): MarketRiskResult {
  const volRisk    = volatilityRisk(input.volatility);
  const liqRisk    = liquidityRisk(input.liquidity);
  const stabRisk   = stabilityRisk(input.trendStability);
  const corrRisk   = correlationRisk(input.correlation);
  const newsRisk   = newsRiskScore(input.newsRisk);

  const metrics = {
    volatilityRisk: volRisk,
    liquidityRisk:  liqRisk,
    stabilityRisk:  stabRisk,
    correlationRisk: corrRisk,
    newsRiskScore:  newsRisk,
  };

  // Weighted market risk
  const marketRiskScore = clamp(
    volRisk  * 0.30 +
    liqRisk  * 0.20 +
    stabRisk * 0.20 +
    corrRisk * 0.15 +
    newsRisk * 0.15,
  );

  const riskClassification = scoreToRiskClassification(marketRiskScore);

  const evidence: string[] = [
    `Pair: ${input.pair}, Session: ${input.session}, Regime: ${input.regime}`,
    `Market health: ${input.marketHealth.toFixed(1)}/100, Opportunity: ${input.opportunityScore.toFixed(1)}/100`,
    `Volatility: ${input.volatility.toFixed(1)}/100 (risk contribution: ${volRisk.toFixed(1)})`,
    `Liquidity: ${input.liquidity.toFixed(1)}/100 (risk contribution: ${liqRisk.toFixed(1)})`,
    `Trend stability: ${input.trendStability.toFixed(1)}/100 (risk contribution: ${stabRisk.toFixed(1)})`,
    `Cross-pair correlation: ${input.correlation.toFixed(1)}/100 (risk contribution: ${corrRisk.toFixed(1)})`,
    `News risk: ${input.newsRisk.toFixed(1)}/100`,
    `Market risk score: ${marketRiskScore.toFixed(1)}/100`,
  ];

  const alerts = buildMarketAlerts(input, marketRiskScore);

  return { marketRiskScore, riskClassification, metrics, evidence, alerts };
}
