// ─── Exposure Protection Monitor ─────────────────────────────────────────────
// Monitors total open risk, pair concentration, correlation, directional bias.
// Advisory only. NEVER modifies strategy or executes trades.

import type {
  ExposureProtectionResult,
  MonitorSeverity,
  ProtectionActionType,
  ProtectionConfig,
} from "./types.js";

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, isFinite(v) ? v : lo));
}

interface OpenPosition {
  pair:        string;
  direction:   "buy" | "sell";
  riskPercent: number;
  lots:        number;
}

// Base currencies for EUR/USD, GBP/USD, USD/JPY
const PAIR_CURRENCIES: Record<string, [string, string]> = {
  EURUSD: ["EUR", "USD"],
  GBPUSD: ["GBP", "USD"],
  USDJPY: ["USD", "JPY"],
  "EUR/USD": ["EUR", "USD"],
  "GBP/USD": ["GBP", "USD"],
  "USD/JPY": ["USD", "JPY"],
};

// Simple correlation proxy for our 3 pairs
const PAIR_CORRELATIONS: Record<string, Record<string, number>> = {
  EURUSD: { EURUSD: 1.0, GBPUSD: 0.78, USDJPY: -0.65 },
  GBPUSD: { EURUSD: 0.78, GBPUSD: 1.0, USDJPY: -0.55 },
  USDJPY: { EURUSD: -0.65, GBPUSD: -0.55, USDJPY: 1.0 },
};

function normalisePair(pair: string): string {
  return pair.replace("/", "").toUpperCase();
}

function computePortfolioCorrelation(positions: OpenPosition[]): number {
  if (positions.length <= 1) return 0;
  let totalCorr = 0;
  let count = 0;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const pa = normalisePair(positions[i].pair);
      const pb = normalisePair(positions[j].pair);
      const baseCorr = PAIR_CORRELATIONS[pa]?.[pb] ?? 0;
      // If same direction, correlation amplifies risk; opposite direction, it reduces
      const sameDir = positions[i].direction === positions[j].direction;
      totalCorr += sameDir ? Math.abs(baseCorr) : -Math.abs(baseCorr);
      count++;
    }
  }
  return count > 0 ? clamp((totalCorr / count + 1) / 2 * 100, 0, 100) / 100 : 0;
}

function computeDirectionalBias(positions: OpenPosition[]): number {
  if (positions.length === 0) return 50; // balanced
  let buyRisk  = 0;
  let sellRisk = 0;
  for (const p of positions) {
    if (p.direction === "buy")  buyRisk  += p.riskPercent;
    else                        sellRisk += p.riskPercent;
  }
  const totalRisk = buyRisk + sellRisk;
  if (totalRisk === 0) return 50;
  // 50 = balanced, 100 = all one direction
  return clamp((Math.max(buyRisk, sellRisk) / totalRisk) * 100);
}

function scoreToSeverity(score: number): MonitorSeverity {
  if (score >= 80) return "normal";
  if (score >= 65) return "caution";
  if (score >= 45) return "warning";
  if (score >= 25) return "critical";
  return "emergency";
}

export function evaluateExposureProtection(
  positions: OpenPosition[],
  cfg: ProtectionConfig,
): ExposureProtectionResult {
  const totalOpenRiskPct = positions.reduce((s, p) => s + p.riskPercent, 0);

  // Pair exposure
  const pairRisk: Record<string, number> = {};
  for (const p of positions) {
    const key = normalisePair(p.pair);
    pairRisk[key] = (pairRisk[key] ?? 0) + p.riskPercent;
  }
  const maxPairExposurePct = Object.values(pairRisk).length > 0
    ? Math.max(...Object.values(pairRisk))
    : 0;

  // Concentration risk: % of total risk in single pair
  const concentrationRisk = totalOpenRiskPct > 0
    ? clamp(maxPairExposurePct / totalOpenRiskPct * 100)
    : 0;

  const correlationScore  = computePortfolioCorrelation(positions);
  const directionalBias   = computeDirectionalBias(positions);

  // Health scoring
  const openRiskScore  = clamp(100 - (totalOpenRiskPct / cfg.maxOpenRiskPercent) * 50);
  const pairRiskScore  = clamp(100 - (maxPairExposurePct / cfg.maxPairExposurePercent) * 50);
  const corrScore      = clamp(100 - correlationScore * 40);
  const biasScore      = clamp(100 - ((directionalBias - 50) / 50) * 40);
  const healthScore    = clamp(Math.min(openRiskScore, pairRiskScore, corrScore, biasScore));

  const triggeredLimits: string[] = [];
  const evidence: string[] = [];
  const actions: ProtectionActionType[] = [];

  evidence.push(`${positions.length} open position${positions.length !== 1 ? "s" : ""}, total open risk: ${totalOpenRiskPct.toFixed(2)}%`);
  evidence.push(`Max pair exposure: ${maxPairExposurePct.toFixed(2)}% (${Object.entries(pairRisk).map(([k, v]) => `${k}: ${v.toFixed(2)}%`).join(", ")})`);
  evidence.push(`Portfolio correlation: ${(correlationScore * 100).toFixed(1)}% | Directional bias: ${directionalBias.toFixed(1)}%`);

  // Total risk checks
  if (totalOpenRiskPct >= cfg.maxOpenRiskPercent * 1.5) {
    triggeredLimits.push(`Critical total exposure: ${totalOpenRiskPct.toFixed(2)}% ≥ ${(cfg.maxOpenRiskPercent * 1.5).toFixed(2)}%`);
    actions.push("block_all_entries");
    actions.push("generate_emergency_alert");
  } else if (totalOpenRiskPct >= cfg.maxOpenRiskPercent) {
    triggeredLimits.push(`Total exposure limit: ${totalOpenRiskPct.toFixed(2)}% ≥ ${cfg.maxOpenRiskPercent}%`);
    actions.push("pause_new_trades");
  } else if (totalOpenRiskPct >= cfg.maxOpenRiskPercent * 0.75) {
    evidence.push(`Approaching total exposure limit (${(totalOpenRiskPct / cfg.maxOpenRiskPercent * 100).toFixed(0)}%)`);
    actions.push("reduce_position_size");
  }

  // Pair concentration
  if (maxPairExposurePct >= cfg.maxPairExposurePercent * 1.5) {
    triggeredLimits.push(`Critical pair concentration: ${maxPairExposurePct.toFixed(2)}%`);
    actions.push("reduce_position_size");
  } else if (maxPairExposurePct >= cfg.maxPairExposurePercent) {
    triggeredLimits.push(`Pair exposure limit: ${maxPairExposurePct.toFixed(2)}% ≥ ${cfg.maxPairExposurePercent}%`);
    actions.push("increase_confirmation_requirements");
  }

  // Correlation
  if (correlationScore >= cfg.maxCorrelation) {
    triggeredLimits.push(`High correlation exposure: ${(correlationScore * 100).toFixed(1)}%`);
    actions.push("reduce_max_trades");
    actions.push("increase_confirmation_requirements");
  }

  // Directional bias
  if (directionalBias >= cfg.maxDirectionalBias) {
    triggeredLimits.push(`Excessive directional bias: ${directionalBias.toFixed(1)}%`);
    actions.push("increase_confirmation_requirements");
  }

  return {
    severity: scoreToSeverity(healthScore),
    healthScore,
    totalOpenRiskPct,
    maxPairExposurePct,
    correlationScore,
    directionalBias,
    concentrationRisk,
    triggeredLimits,
    evidence,
    actions: [...new Set(actions)],
  };
}
