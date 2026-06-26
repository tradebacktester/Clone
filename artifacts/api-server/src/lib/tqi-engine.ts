import type { TradeSignal, AnalysisResult } from "@workspace/market-analysis";

export interface TqiComponent {
  name: string;
  score: number;
  maxScore: number;
  description: string;
}

export type TqiGrade = "A" | "B" | "C" | "D" | "F";

export interface TqiResult {
  pair: string;
  tqi: number;
  grade: TqiGrade;
  tradeable: boolean;
  threshold: number;
  components: TqiComponent[];
}

const DEFAULT_THRESHOLD = 65;

export function computeTqi(
  signal: TradeSignal,
  analysis: AnalysisResult,
  mtfScore: number = 0,
): TqiResult {
  const components: TqiComponent[] = [];

  // 1. HTF Structure (15pts) — weighted MTF alignment
  const htfPts = Math.round((mtfScore / 100) * 15);
  components.push({
    name: "HTF Structure",
    score: htfPts,
    maxScore: 15,
    description: `MTF alignment score: ${mtfScore}%`,
  });

  // 2. Premium / Discount (10pts)
  let fibPts = 0;
  let fibDesc = "No Fibonacci data available";
  if (analysis.fib) {
    const bias = analysis.fib.currentPriceBias;
    if (
      (signal.direction === "buy" && bias === "discount") ||
      (signal.direction === "sell" && bias === "premium")
    ) {
      fibPts = 10;
      fibDesc = `Price in ${bias} zone — optimal FIB bias (level: ${signal.fibLevel.toFixed(3)})`;
    } else if (bias === "equilibrium") {
      fibPts = 5;
      fibDesc = `Price at equilibrium — neutral FIB bias`;
    } else {
      fibPts = 0;
      fibDesc = `Price in ${bias} — against FIB directional bias`;
    }
  }
  components.push({ name: "Premium/Discount", score: fibPts, maxScore: 10, description: fibDesc });

  // 3. Zone Quality (15pts)
  const zonePts = Math.round((Math.min(100, signal.zoneScore) / 100) * 15);
  components.push({
    name: "Zone Quality",
    score: zonePts,
    maxScore: 15,
    description: `${signal.zoneType} zone — strength: ${signal.zoneStrength.toFixed(0)}, score: ${signal.zoneScore.toFixed(0)}`,
  });

  // 4. Liquidity Quality (15pts)
  const liqPts = Math.round((Math.min(100, signal.liquidityScore) / 100) * 15);
  components.push({
    name: "Liquidity Quality",
    score: liqPts,
    maxScore: 15,
    description: `Sweep score: ${signal.liquidityScore.toFixed(0)} — ${liqPts >= 10 ? "strong" : liqPts >= 7 ? "moderate" : "weak"} liquidity grab`,
  });

  // 5. AMD Quality (15pts)
  const amdPts = Math.round((Math.min(100, signal.amdScore) / 100) * 15);
  components.push({
    name: "AMD Quality",
    score: amdPts,
    maxScore: 15,
    description: `Phase: ${signal.amdPhase} — AMD score: ${signal.amdScore.toFixed(0)}`,
  });

  // 6. Confirmation Quality (10pts)
  const confPts = Math.round((Math.min(100, signal.confirmationScore) / 100) * 10);
  components.push({
    name: "Confirmation Quality",
    score: confPts,
    maxScore: 10,
    description: `Candle confirmation score: ${signal.confirmationScore.toFixed(0)}`,
  });

  // 7. Session Quality (10pts)
  const hour = new Date().getUTCHours();
  const session = signal.session;
  let sessionPts: number;
  let sessionDesc: string;
  if (session === "london" && hour >= 7 && hour < 12) {
    sessionPts = 10; sessionDesc = "London open — peak liquidity window";
  } else if (session === "newyork" && hour >= 12 && hour < 17) {
    sessionPts = 10; sessionDesc = "New York open — peak liquidity window";
  } else if (hour >= 12 && hour < 17) {
    sessionPts = 8; sessionDesc = "London-NY overlap — strong liquidity";
  } else if (session === "newyork" && hour >= 17 && hour < 20) {
    sessionPts = 6; sessionDesc = "NY afternoon — moderate liquidity";
  } else {
    sessionPts = 3; sessionDesc = `Off-peak session (${session}) — reduced liquidity`;
  }
  components.push({ name: "Session Quality", score: sessionPts, maxScore: 10, description: sessionDesc });

  // 8. Market Regime (10pts)
  const regime = analysis.regime.regime;
  const regConf = analysis.regime.regimeConfidence;
  const regimePts =
    regime === "trending" ? Math.round((regConf / 100) * 10)
    : regime === "ranging" ? 7
    : regime === "low_volatility" ? 4
    : 2; // volatile
  components.push({
    name: "Market Regime",
    score: regimePts,
    maxScore: 10,
    description: `${regime} regime at ${regConf.toFixed(0)}% confidence`,
  });

  const total = components.reduce((s, c) => s + c.score, 0);
  const tqi = Math.min(100, Math.max(0, total));
  const grade: TqiGrade =
    tqi >= 85 ? "A"
    : tqi >= 70 ? "B"
    : tqi >= 55 ? "C"
    : tqi >= 40 ? "D"
    : "F";

  return {
    pair: signal.pair,
    tqi,
    grade,
    tradeable: tqi >= DEFAULT_THRESHOLD,
    threshold: DEFAULT_THRESHOLD,
    components,
  };
}
