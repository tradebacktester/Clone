// ─── Data Integrity Crisis Checker ───────────────────────────────────────────

import {
  DataContext,
  DataIntegrityCrisisSignal,
  THRESHOLDS,
  scoreToCrisisSeverity,
} from "./types.js";

export function checkDataIntegrity(ctx: DataContext): DataIntegrityCrisisSignal {
  const evidence: string[] = [];

  const missingCandles = ctx.recentGapCount >= THRESHOLDS.GAPS_HIGH;
  if (missingCandles)
    evidence.push(`Missing candles: ${ctx.recentGapCount} gaps detected (threshold ${THRESHOLDS.GAPS_HIGH})`);

  const duplicateCandles = ctx.duplicateCount > 0;
  if (duplicateCandles)
    evidence.push(`Duplicate candles: ${ctx.duplicateCount} duplicates found`);

  // OHLC corruption: treat feed delay + gaps together as indicator
  const corruptedOHLC =
    ctx.recentGapCount >= THRESHOLDS.GAPS_CRITICAL &&
    ctx.feedDelaySeconds >= THRESHOLDS.FEED_DELAY_HIGH_SECONDS;
  if (corruptedOHLC)
    evidence.push("Corrupted OHLC data risk: multiple gaps + feed delay combination");

  // Timestamp issues: feed delay suggests time desync
  const incorrectTimestamps = ctx.feedDelaySeconds >= THRESHOLDS.FEED_DELAY_HIGH_SECONDS;
  if (incorrectTimestamps)
    evidence.push(`Potential timestamp issues: feed delayed by ${ctx.feedDelaySeconds}s`);

  // Feed desynchronization: last candle is stale relative to expected interval
  const expectedDelaySeconds = ctx.expectedInterval * 60;
  const feedDesynchronization = ctx.feedDelaySeconds >= expectedDelaySeconds * 2;
  if (feedDesynchronization)
    evidence.push(`Feed desynchronization: ${ctx.feedDelaySeconds}s delay vs ${expectedDelaySeconds}s expected interval`);

  // Indicator errors: too many gaps = indicators unreliable
  const indicatorErrors = ctx.recentGapCount >= THRESHOLDS.GAPS_HIGH;
  if (indicatorErrors)
    evidence.push("Indicator calculation errors likely due to missing candle data");

  const incompleteMarketData =
    ctx.feedDelaySeconds >= THRESHOLDS.FEED_DELAY_CRITICAL_SECONDS;
  if (incompleteMarketData)
    evidence.push(`Incomplete market data: feed ${ctx.feedDelaySeconds}s behind (critical threshold ${THRESHOLDS.FEED_DELAY_CRITICAL_SECONDS}s)`);

  let score = 0;
  if (corruptedOHLC)           score += 50;
  if (incompleteMarketData)    score += 40;
  if (feedDesynchronization)   score += 35;
  if (incorrectTimestamps)     score += 20;
  if (missingCandles)          score += 25;
  if (duplicateCandles)        score += 10;
  if (indicatorErrors)         score += 15;

  score += Math.max(0, ctx.recentGapCount - THRESHOLDS.GAPS_HIGH) * 5;
  score += Math.max(0, ctx.feedDelaySeconds - THRESHOLDS.FEED_DELAY_HIGH_SECONDS) * 0.05;
  score += ctx.duplicateCount * 5;

  const crisisScore    = Math.min(100, Math.round(score));
  const integrityScore = Math.max(0, 100 - crisisScore);

  return {
    missingCandles,
    duplicateCandles,
    corruptedOHLC,
    incorrectTimestamps,
    feedDesynchronization,
    indicatorErrors,
    incompleteMarketData,
    crisisScore,
    severity:       scoreToCrisisSeverity(crisisScore),
    evidence,
    integrityScore,
    gapCount:       ctx.recentGapCount,
  };
}
