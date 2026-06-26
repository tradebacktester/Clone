// Module 9: Final Trade Score
//
// Weighted formula (max 100):
//   Demand/Supply zone score  × 30%
//   Liquidity sweep score     × 25%
//   AMD sequence score        × 25%
//   Confirmation candle score × 20%
//
// Entry is allowed only when ALL three gates pass:
//   1. finalScore ≥ 80
//   2. London OR New York session
//   3. No high-impact news

export interface FinalScoreResult {
  finalScore: number;           // 0–100 weighted sum
  zoneContrib: number;          // zone score × 0.30
  liquidityContrib: number;     // liquidity score × 0.25
  amdContrib: number;           // AMD score × 0.25
  confirmationContrib: number;  // confirmation score × 0.20
  allowed: boolean;             // finalScore ≥ 80
}

export function calcFinalTradeScore(
  zoneScore: number,
  liquidityScore: number,
  amdScore: number,
  confirmationScore: number,
  minScore = 80,
): FinalScoreResult {
  const zoneContrib         = zoneScore        * 0.30;
  const liquidityContrib    = liquidityScore   * 0.25;
  const amdContrib          = amdScore         * 0.25;
  const confirmationContrib = confirmationScore * 0.20;

  const finalScore = zoneContrib + liquidityContrib + amdContrib + confirmationContrib;

  return {
    finalScore: Math.round(finalScore * 10) / 10,
    zoneContrib:         Math.round(zoneContrib * 10) / 10,
    liquidityContrib:    Math.round(liquidityContrib * 10) / 10,
    amdContrib:          Math.round(amdContrib * 10) / 10,
    confirmationContrib: Math.round(confirmationContrib * 10) / 10,
    allowed: finalScore >= minScore,
  };
}

// Gate 2: London 07:00–12:00 UTC, New York 12:00–20:00 UTC.
export function isAllowedSession(session: string): boolean {
  return session === "london" || session === "newyork";
}

// Gate 3: High-impact news block.
// Pairs are injected by the API server via setNewsBlockedPairs() before each
// analysis run. The signal generator reads this state without making HTTP calls.
let _blockedPairs: Set<string> = new Set();

export function setNewsBlockedPairs(pairs: Set<string>): void {
  _blockedPairs = new Set([...pairs].map(p => p.toUpperCase()));
}

export function getNewsBlockedPairs(): Set<string> {
  return new Set(_blockedPairs);
}

export function isHighImpactNews(pair?: string): boolean {
  if (!pair) return false;
  return _blockedPairs.has(pair.toUpperCase());
}
