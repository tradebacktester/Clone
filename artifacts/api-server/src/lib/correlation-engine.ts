export type Pair = "EURUSD" | "GBPUSD" | "USDJPY";

export const CORRELATION_MATRIX: Record<string, Record<string, number>> = {
  EURUSD: { EURUSD: 1.00, GBPUSD: 0.82, USDJPY: -0.68 },
  GBPUSD: { EURUSD: 0.82, GBPUSD: 1.00, USDJPY: -0.60 },
  USDJPY: { EURUSD: -0.68, GBPUSD: -0.60, USDJPY: 1.00 },
};

export interface CorrelationCheck {
  allowed: boolean;
  reason: string | null;
  exposedPairs: string[];
  correlationRisk: number;
}

export interface OpenPosition {
  pair: string;
  direction: "buy" | "sell";
}

const MAX_CORRELATION_THRESHOLD = 0.70;

export function checkCorrelation(
  newPair: string,
  newDirection: "buy" | "sell",
  openPositions: OpenPosition[],
): CorrelationCheck {
  const exposedPairs: string[] = [];
  let maxRisk = 0;

  for (const pos of openPositions) {
    if (pos.pair === newPair) continue;

    const rawCorr = CORRELATION_MATRIX[newPair]?.[pos.pair] ?? 0;

    // For positively correlated pairs: same direction doubles USD exposure
    // For negatively correlated pairs: opposite direction doubles exposure
    // Effective harmful correlation = raw if same direction (pos corr) or opposite (neg corr)
    const sameDirection = newDirection === pos.direction;
    const effectiveCorr = sameDirection ? rawCorr : -rawCorr;

    if (effectiveCorr > MAX_CORRELATION_THRESHOLD) {
      exposedPairs.push(pos.pair);
      maxRisk = Math.max(maxRisk, effectiveCorr);
    }
  }

  if (exposedPairs.length > 0) {
    return {
      allowed: false,
      reason: `Correlated exposure risk ${(maxRisk * 100).toFixed(0)}% with ${exposedPairs.join(", ")} — blocking overexposure`,
      exposedPairs,
      correlationRisk: Math.round(maxRisk * 100),
    };
  }

  const existingCorr = openPositions
    .filter(p => p.pair !== newPair)
    .reduce((max, pos) => {
      const rawCorr = CORRELATION_MATRIX[newPair]?.[pos.pair] ?? 0;
      const sameDir = newDirection === pos.direction;
      return Math.max(max, Math.abs(sameDir ? rawCorr : -rawCorr));
    }, 0);

  return {
    allowed: true,
    reason: null,
    exposedPairs: [],
    correlationRisk: Math.round(existingCorr * 100),
  };
}

export function getCorrelationMatrix(): { pair1: string; pair2: string; correlation: number }[] {
  const pairs = ["EURUSD", "GBPUSD", "USDJPY"];
  const result: { pair1: string; pair2: string; correlation: number }[] = [];
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      result.push({
        pair1: pairs[i],
        pair2: pairs[j],
        correlation: CORRELATION_MATRIX[pairs[i]][pairs[j]],
      });
    }
  }
  return result;
}
