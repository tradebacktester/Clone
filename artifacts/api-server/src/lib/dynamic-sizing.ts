import type { TradeSignal, AnalysisResult } from "@workspace/market-analysis";

export interface SizingFactors {
  confidence: number;
  volatility: number;
  drawdown: number;
  regime: number;
  performance: number;
}

export interface DynamicSizingResult {
  baseRiskPct: number;
  adjustedRiskPct: number;
  lotSize: number;
  riskAmount: number;
  factors: SizingFactors;
}

const PAIR_TYPICAL_ATR: Record<string, number> = {
  EURUSD: 0.0008,
  GBPUSD: 0.001,
  USDJPY: 0.5,
};

export function calcDynamicSize(params: {
  signal: TradeSignal;
  analysis: AnalysisResult;
  balance: number;
  baseRiskPct: number;
  maxRiskPct: number;
  currentDrawdownPct: number;
  clusterWinRate?: number;
}): DynamicSizingResult {
  const { signal, analysis, balance, baseRiskPct, maxRiskPct, currentDrawdownPct, clusterWinRate } = params;

  // 1. Confidence factor: 0.70 → 1.30 over confidence range 65–100
  const confNorm = Math.max(0, Math.min(1, (signal.confidence - 65) / 35));
  const confFactor = 0.70 + confNorm * 0.60;

  // 2. Volatility factor: higher ATR vs typical = smaller size
  const typicalAtr = PAIR_TYPICAL_ATR[signal.pair] ?? 0.001;
  const atrRatio = analysis.atr / typicalAtr;
  const volFactor =
    atrRatio > 2.5 ? 0.45
    : atrRatio > 2.0 ? 0.55
    : atrRatio > 1.5 ? 0.70
    : atrRatio > 1.2 ? 0.85
    : 1.0;

  // 3. Drawdown reduction: linear scale-down as drawdown grows
  const ddFactor =
    currentDrawdownPct >= 15 ? 0.45
    : currentDrawdownPct >= 12 ? 0.55
    : currentDrawdownPct >= 8 ? 0.70
    : currentDrawdownPct >= 5 ? 0.85
    : 1.0;

  // 4. Regime factor
  const regime = analysis.regime.regime;
  const regimeFactor =
    regime === "trending" ? 1.10
    : regime === "ranging" ? 1.00
    : regime === "low_volatility" ? 0.80
    : 0.55; // volatile

  // 5. Historical cluster performance
  let perfFactor = 1.0;
  if (clusterWinRate != null) {
    // Scale: 30% wr → 0.70x, 55% wr → 1.00x, 80%+ wr → 1.20x
    perfFactor = 0.70 + ((Math.max(0, Math.min(100, clusterWinRate)) - 30) / 70) * 0.50;
    perfFactor = Math.max(0.60, Math.min(1.30, perfFactor));
  }

  const composite = confFactor * volFactor * ddFactor * regimeFactor * perfFactor;
  const adjustedRiskPct = Math.min(maxRiskPct, Math.max(0.1, baseRiskPct * composite));

  const riskAmount = balance * (adjustedRiskPct / 100);
  const pipSize = signal.pair.includes("JPY") ? 0.01 : 0.0001;
  const slPips = Math.abs(signal.entryPrice - signal.stopLoss) / pipSize;
  const pipValuePerLot = 10;
  const rawLot = slPips > 0 ? riskAmount / (slPips * pipValuePerLot) : 0.01;
  const lotSize = Math.max(0.01, Math.min(2.0, Math.round(rawLot * 100) / 100));

  return {
    baseRiskPct,
    adjustedRiskPct: Math.round(adjustedRiskPct * 10000) / 10000,
    lotSize,
    riskAmount: Math.round(riskAmount * 100) / 100,
    factors: {
      confidence: Math.round(confFactor * 1000) / 1000,
      volatility: Math.round(volFactor * 1000) / 1000,
      drawdown: Math.round(ddFactor * 1000) / 1000,
      regime: Math.round(regimeFactor * 1000) / 1000,
      performance: Math.round(perfFactor * 1000) / 1000,
    },
  };
}
