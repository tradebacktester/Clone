import type { Candle } from "../types.js";
import type { DecisionTrace } from "./rule-evaluator.js";

export type BiasType =
  | "look_ahead"
  | "repainting"
  | "future_data_leakage"
  | "duplicate_signal"
  | "invalid_entry";

export interface BiasFlag {
  type: BiasType;
  candleIndex: number;
  candleTime: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  evidence: string;
  suggestedFix: string;
}

export interface BiasSummary {
  flags: BiasFlag[];
  totalFlags: number;
  byType: Record<BiasType, number>;
  lookAheadDetected: boolean;
  repaintingDetected: boolean;
  futureLeak: boolean;
  duplicateSignals: number;
  invalidEntries: number;
  overallRating: "clean" | "suspicious" | "biased";
}

export function detectBias(traces: DecisionTrace[], allCandles: Candle[]): BiasSummary {
  const flags: BiasFlag[] = [];

  flags.push(...detectFutureDateLeakage(traces, allCandles));
  flags.push(...detectDuplicateSignals(traces));
  flags.push(...detectInvalidEntries(traces, allCandles));
  flags.push(...detectLookAheadPatterns(traces, allCandles));
  flags.push(...detectRepaintingPatterns(traces));

  const byType: Record<BiasType, number> = {
    look_ahead: 0,
    repainting: 0,
    future_data_leakage: 0,
    duplicate_signal: 0,
    invalid_entry: 0,
  };
  for (const f of flags) byType[f.type]++;

  const hasCritical = flags.some(f => f.severity === "critical");
  const hasHigh = flags.some(f => f.severity === "high");
  const overallRating: "clean" | "suspicious" | "biased" =
    hasCritical || byType.look_ahead > 0 || byType.future_data_leakage > 0
      ? "biased"
      : hasHigh || byType.repainting > 0 || byType.duplicate_signal > 5
        ? "suspicious"
        : "clean";

  return {
    flags,
    totalFlags: flags.length,
    byType,
    lookAheadDetected: byType.look_ahead > 0,
    repaintingDetected: byType.repainting > 0,
    futureLeak: byType.future_data_leakage > 0,
    duplicateSignals: byType.duplicate_signal,
    invalidEntries: byType.invalid_entry,
    overallRating,
  };
}

function detectFutureDateLeakage(traces: DecisionTrace[], allCandles: Candle[]): BiasFlag[] {
  const flags: BiasFlag[] = [];
  for (const trace of traces) {
    if (!trace.tradeTaken || !trace.trade) continue;
    const candleTime = new Date(trace.candleTime).getTime();

    for (const zoneEval of trace.zoneEvaluations) {
      if (!zoneEval.tradeTaken) continue;

      const entryTime = candleTime;
      const futureCandles = allCandles.filter(c => c.time.getTime() > entryTime);

      if (futureCandles.length === 0) {
        flags.push({
          type: "future_data_leakage",
          candleIndex: trace.candleIndex,
          candleTime: trace.candleTime,
          severity: "high",
          description: "Trade signal generated at last available candle — no future candles to verify outcome",
          evidence: `Signal at index ${trace.candleIndex} (${trace.candleTime}) has no candles after it`,
          suggestedFix: "Ensure replay has sufficient candles after the last signal for outcome resolution",
        });
      }
    }
  }
  return flags;
}

function detectDuplicateSignals(traces: DecisionTrace[]): BiasFlag[] {
  const flags: BiasFlag[] = [];
  const tradedTraces = traces.filter(t => t.tradeTaken && t.trade);

  for (let i = 1; i < tradedTraces.length; i++) {
    const prev = tradedTraces[i - 1]!;
    const curr = tradedTraces[i]!;
    if (!prev.trade || !curr.trade) continue;

    const indexGap = curr.candleIndex - prev.candleIndex;
    const sameDirection = prev.trade.direction === curr.trade.direction;
    const similarPrice = Math.abs(prev.trade.entryPrice - curr.trade.entryPrice) / prev.trade.entryPrice < 0.001;

    if (indexGap <= 3 && sameDirection && similarPrice) {
      flags.push({
        type: "duplicate_signal",
        candleIndex: curr.candleIndex,
        candleTime: curr.candleTime,
        severity: "medium",
        description: `Duplicate ${curr.trade.direction} signal detected ${indexGap} candle(s) after previous signal at same price level`,
        evidence: `Previous signal at index ${prev.candleIndex} (${prev.trade.direction} @ ${prev.trade.entryPrice.toFixed(5)}), current at index ${curr.candleIndex} (${curr.trade.direction} @ ${curr.trade.entryPrice.toFixed(5)})`,
        suggestedFix: "Add a cooldown period (minimum 5 candles) after each signal before re-evaluating the same zone",
      });
    }
  }
  return flags;
}

function detectInvalidEntries(traces: DecisionTrace[], allCandles: Candle[]): BiasFlag[] {
  const flags: BiasFlag[] = [];

  for (const trace of traces) {
    if (!trace.tradeTaken || !trace.trade) continue;
    const { direction, entryPrice, stopLoss, takeProfit } = trace.trade;

    if (direction === "buy") {
      if (stopLoss >= entryPrice) {
        flags.push({
          type: "invalid_entry",
          candleIndex: trace.candleIndex,
          candleTime: trace.candleTime,
          severity: "critical",
          description: `BUY trade has stop loss (${stopLoss.toFixed(5)}) above or equal to entry (${entryPrice.toFixed(5)})`,
          evidence: `direction=buy, entry=${entryPrice.toFixed(5)}, SL=${stopLoss.toFixed(5)}, TP=${takeProfit.toFixed(5)}`,
          suggestedFix: "Ensure stop loss for buy trades is strictly below entry price",
        });
      }
      if (takeProfit <= entryPrice) {
        flags.push({
          type: "invalid_entry",
          candleIndex: trace.candleIndex,
          candleTime: trace.candleTime,
          severity: "critical",
          description: `BUY trade has take profit (${takeProfit.toFixed(5)}) below or equal to entry (${entryPrice.toFixed(5)})`,
          evidence: `direction=buy, entry=${entryPrice.toFixed(5)}, SL=${stopLoss.toFixed(5)}, TP=${takeProfit.toFixed(5)}`,
          suggestedFix: "Ensure take profit for buy trades is strictly above entry price",
        });
      }
    } else {
      if (stopLoss <= entryPrice) {
        flags.push({
          type: "invalid_entry",
          candleIndex: trace.candleIndex,
          candleTime: trace.candleTime,
          severity: "critical",
          description: `SELL trade has stop loss (${stopLoss.toFixed(5)}) below or equal to entry (${entryPrice.toFixed(5)})`,
          evidence: `direction=sell, entry=${entryPrice.toFixed(5)}, SL=${stopLoss.toFixed(5)}, TP=${takeProfit.toFixed(5)}`,
          suggestedFix: "Ensure stop loss for sell trades is strictly above entry price",
        });
      }
      if (takeProfit >= entryPrice) {
        flags.push({
          type: "invalid_entry",
          candleIndex: trace.candleIndex,
          candleTime: trace.candleTime,
          severity: "critical",
          description: `SELL trade has take profit (${takeProfit.toFixed(5)}) above or equal to entry (${entryPrice.toFixed(5)})`,
          evidence: `direction=sell, entry=${entryPrice.toFixed(5)}, SL=${stopLoss.toFixed(5)}, TP=${takeProfit.toFixed(5)}`,
          suggestedFix: "Ensure take profit for sell trades is strictly below entry price",
        });
      }
    }

    const risk = Math.abs(entryPrice - stopLoss);
    if (risk === 0) {
      flags.push({
        type: "invalid_entry",
        candleIndex: trace.candleIndex,
        candleTime: trace.candleTime,
        severity: "critical",
        description: "Trade has zero risk (entry price equals stop loss)",
        evidence: `entry=${entryPrice.toFixed(5)}, SL=${stopLoss.toFixed(5)}`,
        suggestedFix: "Ensure stop loss is calculated with minimum ATR buffer",
      });
    }

    const currentCandle = allCandles[trace.candleIndex];
    if (currentCandle) {
      if (direction === "buy" && entryPrice > currentCandle.high * 1.001) {
        flags.push({
          type: "invalid_entry",
          candleIndex: trace.candleIndex,
          candleTime: trace.candleTime,
          severity: "high",
          description: `BUY entry price (${entryPrice.toFixed(5)}) is significantly above candle high (${currentCandle.high.toFixed(5)}) — price may not have been reachable`,
          evidence: `entry=${entryPrice.toFixed(5)}, candle high=${currentCandle.high.toFixed(5)}`,
          suggestedFix: "Use candle close or zone top as entry — not a price above the bar's high",
        });
      }
      if (direction === "sell" && entryPrice < currentCandle.low * 0.999) {
        flags.push({
          type: "invalid_entry",
          candleIndex: trace.candleIndex,
          candleTime: trace.candleTime,
          severity: "high",
          description: `SELL entry price (${entryPrice.toFixed(5)}) is significantly below candle low (${currentCandle.low.toFixed(5)}) — price may not have been reachable`,
          evidence: `entry=${entryPrice.toFixed(5)}, candle low=${currentCandle.low.toFixed(5)}`,
          suggestedFix: "Use candle close or zone bottom as entry — not a price below the bar's low",
        });
      }
    }
  }
  return flags;
}

function detectLookAheadPatterns(traces: DecisionTrace[], _allCandles: Candle[]): BiasFlag[] {
  const flags: BiasFlag[] = [];

  const tradedTraces = traces.filter(t => t.tradeTaken && t.trade);

  for (const trace of tradedTraces) {
    if (!trace.trade) continue;

    if (trace.trade.outcome === "win" && trace.trade.closedAtIndex !== undefined) {
      const barsToClose = trace.trade.closedAtIndex - trace.candleIndex;
      if (barsToClose < 1) {
        flags.push({
          type: "look_ahead",
          candleIndex: trace.candleIndex,
          candleTime: trace.candleTime,
          severity: "critical",
          description: `Trade closed on the SAME bar it was entered — classic look-ahead bias indicator`,
          evidence: `Entry at index ${trace.candleIndex}, closed at index ${trace.trade.closedAtIndex}`,
          suggestedFix: "Trades can only be closed on candles AFTER the entry candle. Do not check TP/SL on the entry bar.",
        });
      }
    }

    for (const zoneEval of trace.zoneEvaluations) {
      if (zoneEval.tradeTaken) {
        const zoneTop = zoneEval.priceTop;
        const zoneBottom = zoneEval.priceBottom;
        if (zoneTop < zoneBottom) {
          flags.push({
            type: "look_ahead",
            candleIndex: trace.candleIndex,
            candleTime: trace.candleTime,
            severity: "critical",
            description: `Zone has inverted boundaries (top < bottom) — possible data corruption or look-ahead in zone calculation`,
            evidence: `${zoneEval.zoneType} zone: top=${zoneTop.toFixed(5)}, bottom=${zoneBottom.toFixed(5)}`,
            suggestedFix: "Verify zone boundary calculation ensures priceTop > priceBottom",
          });
        }
      }
    }
  }

  return flags;
}

function detectRepaintingPatterns(traces: DecisionTrace[]): BiasFlag[] {
  const flags: BiasFlag[] = [];

  const tradedTraces = traces.filter(t => t.tradeTaken && t.trade);

  for (let i = 0; i < tradedTraces.length - 1; i++) {
    const signalTrace = tradedTraces[i]!;
    if (!signalTrace.trade) continue;

    const followupIdx = traces.findIndex(
      t => t.candleIndex > signalTrace.candleIndex && t.candleIndex <= signalTrace.candleIndex + 10,
    );

    if (followupIdx === -1) continue;
    const followup = traces[followupIdx]!;

    const signalZone = signalTrace.zoneEvaluations.find(e => e.tradeTaken);
    if (!signalZone) continue;

    const zoneStillExists = followup.zoneEvaluations.some(
      e =>
        Math.abs(e.priceTop - signalZone.priceTop) < 0.0001 &&
        Math.abs(e.priceBottom - signalZone.priceBottom) < 0.0001,
    );

    if (!zoneStillExists && followup.candleIndex <= signalTrace.candleIndex + 5) {
      flags.push({
        type: "repainting",
        candleIndex: followup.candleIndex,
        candleTime: followup.candleTime,
        severity: "high",
        description: `Zone that triggered trade at index ${signalTrace.candleIndex} disappeared within 5 candles — possible repainting`,
        evidence: `${signalZone.zoneType} zone [${signalZone.priceBottom.toFixed(5)}–${signalZone.priceTop.toFixed(5)}] not found at index ${followup.candleIndex}`,
        suggestedFix: "Zones should be formed from past candles only. If a zone disappears after formation, the detection logic may be using future data to validate it.",
      });
    }
  }

  return flags;
}
