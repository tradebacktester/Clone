// ─── Drift Detector Bridge ────────────────────────────────────────────────────
// Wraps the pure market-analysis drift detector for the API server.

import {
  runDriftDetection,
  extractFeatures,
} from "@workspace/market-analysis";
import type { ExtractedFeature, RawTradeRecord } from "@workspace/market-analysis";

export async function runDriftDetectionBridge(
  featuresOrTrades: ExtractedFeature[] | RawTradeRecord[],
) {
  let features: ExtractedFeature[];

  if (featuresOrTrades.length > 0 && "tradeId" in featuresOrTrades[0]) {
    features = featuresOrTrades as ExtractedFeature[];
  } else {
    features = extractFeatures(featuresOrTrades as RawTradeRecord[]);
  }

  return runDriftDetection(features);
}
