// ─── Executive Risk Brain — Scorer ────────────────────────────────────────────
// Computes all 7 Executive Risk Scores with full calculation transparency.
// Advisory only. NEVER modifies strategy or safety limits.

import type {
  ErbScoreWeights,
  ErbScoreBreakdown,
  ErbAccountIntelligence,
  ErbPositionIntelligence,
  ErbPortfolioIntelligence,
  ErbMarketIntelligence,
  ErbBrokerIntelligence,
  ErbInfrastructureIntelligence,
  ErbAdaptiveIntelligence,
  ErbCrisisIntelligence,
} from "./types.js";
import { DEFAULT_ERB_WEIGHTS } from "./types.js";

// ─── Utility ──────────────────────────────────────────────────────────────────

export function clamp(v: number, lo = 0, hi = 100): number {
  if (!isFinite(v)) return v === Infinity ? hi : lo;
  return Math.max(lo, Math.min(hi, v));
}

function r(v: number): number { return Math.round(v * 10) / 10; }

// ─── Individual component scorers ─────────────────────────────────────────────

/**
 * Account health score (0-100, higher = better health = lower risk contribution).
 */
export function scoreAccountHealth(a: ErbAccountIntelligence): number {
  return clamp(a.accountHealthScore);
}

/**
 * Position risk score (0-100, higher = safer position = lower risk contribution).
 * Inverts positionRiskScore since that scale is 0=safe, 100=risky.
 */
export function scorePositionSafety(p: ErbPositionIntelligence | null): number {
  if (!p) return 70; // no open position = reduced but not zero risk
  return clamp(100 - p.positionRiskScore);
}

/**
 * Portfolio stability (0-100, higher = more stable).
 * Inverts portfolioRiskScore.
 */
export function scorePortfolioStability(pf: ErbPortfolioIntelligence): number {
  return clamp(100 - pf.portfolioRiskScore);
}

/**
 * Market safety (0-100, higher = safer market = lower risk contribution).
 * Combines market health, liquidity, opportunity.
 */
export function scoreMarketSafety(m: ErbMarketIntelligence): number {
  const healthScore     = clamp(m.marketHealth);
  const liquidityScore  = clamp(m.liquidity);
  const oppScore        = clamp(m.opportunityScore);
  const riskInversion   = clamp(100 - m.marketRiskScore);
  return clamp(healthScore * 0.35 + liquidityScore * 0.25 + riskInversion * 0.25 + oppScore * 0.15);
}

/**
 * Broker reliability (0-100, higher = more reliable).
 */
export function scoreBrokerReliability(b: ErbBrokerIntelligence): number {
  return clamp(b.brokerReliabilityScore);
}

/**
 * System health (0-100, higher = healthier infrastructure).
 */
export function scoreSystemHealth(infra: ErbInfrastructureIntelligence): number {
  return clamp(infra.systemHealthScore);
}

/**
 * Crisis score contribution (0-100, higher = less crisis = safer).
 * Inverts from crisis severity.
 */
export function scoreCrisisSafety(crisis: ErbCrisisIntelligence): number {
  const severityMap: Record<string, number> = {
    none:     0,
    low:      15,
    moderate: 40,
    high:     65,
    critical: 85,
    extreme:  100,
  };
  const crisisRisk = severityMap[crisis.crisisSeverity] ?? 0;
  const survivalPenalty = crisis.survivalModeActive ? 20 : 0;
  return clamp(100 - crisisRisk - survivalPenalty);
}

/**
 * Adaptive risk alignment (0-100, higher = profile well-aligned).
 */
export function scoreAdaptiveAlignment(ari: ErbAdaptiveIntelligence): number {
  const conf = clamp(ari.confidence);
  const adaptConf = clamp(ari.adaptationConfidence);
  const profileAligned = ari.currentRiskProfile === ari.recommendedRiskProfile ? 20 : 0;
  return clamp(conf * 0.50 + adaptConf * 0.30 + profileAligned);
}

// ─── Overall Risk Score (0-100, higher = MORE risky) ──────────────────────────

export function computeOverallRiskScore(
  account:    ErbAccountIntelligence,
  position:   ErbPositionIntelligence | null,
  portfolio:  ErbPortfolioIntelligence,
  market:     ErbMarketIntelligence,
  broker:     ErbBrokerIntelligence,
  infra:      ErbInfrastructureIntelligence,
  crisis:     ErbCrisisIntelligence,
  adaptive:   ErbAdaptiveIntelligence,
  weights:    ErbScoreWeights,
): { overallRiskScore: number; breakdown: ErbScoreBreakdown } {
  // Safety scores (0-100, higher = safer)
  const accountSafety    = scoreAccountHealth(account);
  const positionSafety   = scorePositionSafety(position);
  const portfolioSafety  = scorePortfolioStability(portfolio);
  const marketSafety     = scoreMarketSafety(market);
  const brokerSafety     = scoreBrokerReliability(broker);
  const systemSafety     = scoreSystemHealth(infra);
  const crisisSafety     = scoreCrisisSafety(crisis);
  const adaptiveSafety   = scoreAdaptiveAlignment(adaptive);

  // Invert to risk contributions (0-100, higher = riskier)
  const accountRisk    = 100 - accountSafety;
  const positionRisk   = 100 - positionSafety;
  const portfolioRisk  = 100 - portfolioSafety;
  const marketRisk     = 100 - marketSafety;
  const brokerRisk     = 100 - brokerSafety;
  const systemRisk     = 100 - systemSafety;
  const crisisRisk     = 100 - crisisSafety;
  const adaptiveRisk   = 100 - adaptiveSafety;

  const breakdown: ErbScoreBreakdown = {
    accountHealth: {
      raw:      accountRisk,
      weighted: r(accountRisk * weights.accountHealth),
      weight:   weights.accountHealth,
      label:    "Account Health",
      calculation: `(100 - accountHealthScore ${accountSafety.toFixed(1)}) × weight ${(weights.accountHealth * 100).toFixed(0)}%`,
    },
    positionRisk: {
      raw:      positionRisk,
      weighted: r(positionRisk * weights.positionRisk),
      weight:   weights.positionRisk,
      label:    "Position Risk",
      calculation: `(100 - positionSafety ${positionSafety.toFixed(1)}) × weight ${(weights.positionRisk * 100).toFixed(0)}%`,
    },
    portfolioStability: {
      raw:      portfolioRisk,
      weighted: r(portfolioRisk * weights.portfolioStability),
      weight:   weights.portfolioStability,
      label:    "Portfolio Stability",
      calculation: `(100 - portfolioStability ${portfolioSafety.toFixed(1)}) × weight ${(weights.portfolioStability * 100).toFixed(0)}%`,
    },
    marketRisk: {
      raw:      marketRisk,
      weighted: r(marketRisk * weights.marketRisk),
      weight:   weights.marketRisk,
      label:    "Market Risk",
      calculation: `(100 - marketSafety ${marketSafety.toFixed(1)}) × weight ${(weights.marketRisk * 100).toFixed(0)}%`,
    },
    brokerReliability: {
      raw:      brokerRisk,
      weighted: r(brokerRisk * weights.brokerReliability),
      weight:   weights.brokerReliability,
      label:    "Broker Reliability",
      calculation: `(100 - brokerReliability ${brokerSafety.toFixed(1)}) × weight ${(weights.brokerReliability * 100).toFixed(0)}%`,
    },
    systemHealth: {
      raw:      systemRisk,
      weighted: r(systemRisk * weights.systemHealth),
      weight:   weights.systemHealth,
      label:    "System Health",
      calculation: `(100 - systemHealth ${systemSafety.toFixed(1)}) × weight ${(weights.systemHealth * 100).toFixed(0)}%`,
    },
    crisisScore: {
      raw:      crisisRisk,
      weighted: r(crisisRisk * weights.crisisScore),
      weight:   weights.crisisScore,
      label:    "Crisis Score",
      calculation: `(100 - crisisSafety ${crisisSafety.toFixed(1)}) × weight ${(weights.crisisScore * 100).toFixed(0)}%`,
    },
    adaptiveRisk: {
      raw:      adaptiveRisk,
      weighted: r(adaptiveRisk * weights.adaptiveRisk),
      weight:   weights.adaptiveRisk,
      label:    "Adaptive Risk",
      calculation: `(100 - adaptiveAlignment ${adaptiveSafety.toFixed(1)}) × weight ${(weights.adaptiveRisk * 100).toFixed(0)}%`,
    },
    total: 0,
  };

  const total = clamp(
    breakdown.accountHealth.weighted +
    breakdown.positionRisk.weighted +
    breakdown.portfolioStability.weighted +
    breakdown.marketRisk.weighted +
    breakdown.brokerReliability.weighted +
    breakdown.systemHealth.weighted +
    breakdown.crisisScore.weighted +
    breakdown.adaptiveRisk.weighted,
  );

  breakdown.total = r(total);

  return { overallRiskScore: r(total), breakdown };
}

// ─── Survival Score (0-100, higher = better capital survival outlook) ──────────

export function computeSurvivalScore(
  account:  ErbAccountIntelligence,
  crisis:   ErbCrisisIntelligence,
  cp:       { protectionLevel?: string; recoveryProgress?: number } | null,
): number {
  const baseHealth = clamp(account.accountHealthScore);
  const drawdownPenalty = clamp(account.drawdownPct * 2);
  const crisisPenalty = crisis.survivalModeActive ? 25 : 0;

  const cpBonus = cp?.protectionLevel === "normal" ? 10 :
                  cp?.protectionLevel === "conservative" ? 5 : 0;

  return clamp(baseHealth - drawdownPenalty - crisisPenalty + cpBonus);
}

// ─── Capital Health Score (0-100, higher = healthier account) ─────────────────

export function computeCapitalHealthScore(account: ErbAccountIntelligence): number {
  const drawdownScore = clamp(100 - account.drawdownPct * 3);
  const marginScore   = account.marginLevel > 0
    ? clamp(Math.min(100, account.marginLevel / 2))
    : 80; // no margin usage = healthy
  const pnlScore = account.dailyPnl >= 0 ? 70 : clamp(70 + (account.dailyPnl / Math.max(account.balance, 1)) * 1000);

  return clamp(account.accountHealthScore * 0.50 + drawdownScore * 0.25 + marginScore * 0.15 + pnlScore * 0.10);
}

// ─── Infrastructure Score (0-100, higher = healthier infra) ──────────────────

export function computeInfrastructureScore(infra: ErbInfrastructureIntelligence): number {
  return clamp(infra.systemHealthScore);
}

// ─── Portfolio Stability Score (0-100, higher = more stable) ─────────────────

export function computePortfolioStabilityScore(pf: ErbPortfolioIntelligence): number {
  return clamp(100 - pf.portfolioRiskScore);
}

// ─── Recovery Confidence Score (0-100, higher = better recovery outlook) ──────

export function computeRecoveryConfidenceScore(
  crisis:   ErbCrisisIntelligence,
  adaptive: ErbAdaptiveIntelligence,
  account:  ErbAccountIntelligence,
): number {
  const recoveryBase   = clamp(crisis.recoveryProgress);
  const adaptiveConf   = clamp(adaptive.adaptationConfidence);
  const healthBonus    = clamp(account.accountHealthScore * 0.3);
  const crisisPenalty  = crisis.survivalModeActive ? 20 : 0;

  return clamp(recoveryBase * 0.40 + adaptiveConf * 0.35 + healthBonus - crisisPenalty);
}

// ─── Master scorer ────────────────────────────────────────────────────────────

export interface MasterScorerInput {
  account:   ErbAccountIntelligence;
  position:  ErbPositionIntelligence | null;
  portfolio: ErbPortfolioIntelligence;
  market:    ErbMarketIntelligence;
  broker:    ErbBrokerIntelligence;
  infra:     ErbInfrastructureIntelligence;
  adaptive:  ErbAdaptiveIntelligence;
  crisis:    ErbCrisisIntelligence;
  cp:        { protectionLevel?: string; recoveryProgress?: number } | null;
  weights?:  Partial<ErbScoreWeights>;
}

export function computeAllScores(input: MasterScorerInput): {
  overallRiskScore:        number;
  survivalScore:           number;
  capitalHealthScore:      number;
  infrastructureScore:     number;
  brokerReliabilityScore:  number;
  portfolioStabilityScore: number;
  recoveryConfidenceScore: number;
  scoreWeights:            ErbScoreWeights;
  scoreBreakdown:          ErbScoreBreakdown;
} {
  const weights: ErbScoreWeights = {
    ...DEFAULT_ERB_WEIGHTS,
    ...input.weights,
  };

  // Normalise weights to sum 1
  const wSum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (wSum > 0 && Math.abs(wSum - 1) > 0.01) {
    for (const k of Object.keys(weights) as (keyof ErbScoreWeights)[]) {
      weights[k] = weights[k] / wSum;
    }
  }

  const { overallRiskScore, breakdown } = computeOverallRiskScore(
    input.account, input.position, input.portfolio, input.market,
    input.broker, input.infra, input.crisis, input.adaptive, weights,
  );

  return {
    overallRiskScore,
    survivalScore:           r(computeSurvivalScore(input.account, input.crisis, input.cp)),
    capitalHealthScore:      r(computeCapitalHealthScore(input.account)),
    infrastructureScore:     r(computeInfrastructureScore(input.infra)),
    brokerReliabilityScore:  r(scoreBrokerReliability(input.broker)),
    portfolioStabilityScore: r(computePortfolioStabilityScore(input.portfolio)),
    recoveryConfidenceScore: r(computeRecoveryConfidenceScore(input.crisis, input.adaptive, input.account)),
    scoreWeights:   weights,
    scoreBreakdown: breakdown,
  };
}
