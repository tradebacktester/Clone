/**
 * Synthetic candle generators for market stress scenarios.
 * Each generator produces a specific market condition pattern
 * that the strategy is tested against.
 */
import type { MarketCondition } from "./types.js";

/** LCG seeded random */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xFFFFFFFF;
  };
}

/** Win rate and RR modifiers for each market condition */
export interface MarketConditionProfile {
  condition: MarketCondition;
  label: string;
  description: string;
  winRateMultiplier: number;
  rrMultiplier: number;
  spreadMultiplier: number;    // additional spread pips
  signalFrequencyMultiplier: number;  // fraction of normal signals
}

export const MARKET_CONDITION_PROFILES: Record<MarketCondition, MarketConditionProfile> = {
  high_volatility: {
    condition: "high_volatility",
    label: "High Volatility",
    description: "VIX-equivalent spike — wide spreads, whipsaws, frequent SL hits",
    winRateMultiplier: 0.82,    // -18% win rate
    rrMultiplier: 0.88,         // SL wider, TP harder to hit cleanly
    spreadMultiplier: 2.5,      // 2.5× extra spread
    signalFrequencyMultiplier: 1.3,  // more signals but lower quality
  },
  low_volatility: {
    condition: "low_volatility",
    label: "Low Volatility",
    description: "Compressed ATR — zones compress, RR shrinks, slow price discovery",
    winRateMultiplier: 0.92,    // slight win rate reduction
    rrMultiplier: 0.78,         // TP much harder to reach
    spreadMultiplier: 0.8,
    signalFrequencyMultiplier: 0.5,  // fewer valid signals
  },
  flash_crash: {
    condition: "flash_crash",
    label: "Flash Crash",
    description: "Sudden 150–300 pip move in <5 min — SL gaps, catastrophic fills",
    winRateMultiplier: 0.65,
    rrMultiplier: 0.6,
    spreadMultiplier: 15,
    signalFrequencyMultiplier: 0.3,
  },
  major_news_event: {
    condition: "major_news_event",
    label: "Major News Event",
    description: "NFP / FOMC — extreme spread widening, delayed fills, erratic direction",
    winRateMultiplier: 0.72,
    rrMultiplier: 0.75,
    spreadMultiplier: 8,
    signalFrequencyMultiplier: 0.6,
  },
  strong_trend: {
    condition: "strong_trend",
    label: "Strong Trend",
    description: "Extended directional move — demand/supply zones tend to break",
    winRateMultiplier: 1.08,    // aligned signals do well, counter-trend filtered
    rrMultiplier: 1.15,
    spreadMultiplier: 0.9,
    signalFrequencyMultiplier: 0.75,
  },
  choppy_ranging: {
    condition: "choppy_ranging",
    label: "Choppy Ranging",
    description: "Whipsaw conditions — zones constantly being revisited, false BOS",
    winRateMultiplier: 0.78,
    rrMultiplier: 0.85,
    spreadMultiplier: 1.2,
    signalFrequencyMultiplier: 1.4,  // many signals, low quality
  },
};

/** All market stress conditions in order */
export const ALL_CONDITIONS: MarketCondition[] = [
  "high_volatility",
  "low_volatility",
  "flash_crash",
  "major_news_event",
  "strong_trend",
  "choppy_ranging",
];
