// ─── Statistical Validator Bridge ────────────────────────────────────────────
// Wraps the pure market-analysis lib for use in the API server.

import {
  runStatisticalValidation as runValidation,
} from "@workspace/market-analysis";
import type { ExtractedFeature } from "@workspace/market-analysis";
import { extractFeatures } from "@workspace/market-analysis";
import type { RawTradeRecord } from "@workspace/market-analysis";

export async function runStatisticalValidation(
  featuresOrTrades: ExtractedFeature[] | RawTradeRecord[],
  historicalWinRates: number[] = [],
) {
  let features: ExtractedFeature[];

  // Accept either pre-extracted features or raw trades
  if (featuresOrTrades.length > 0 && "tradeId" in featuresOrTrades[0]) {
    features = featuresOrTrades as ExtractedFeature[];
  } else {
    features = extractFeatures(featuresOrTrades as RawTradeRecord[]);
  }

  return runValidation(features, historicalWinRates);
}
