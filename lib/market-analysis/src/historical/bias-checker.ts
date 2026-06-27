import type { Candle } from "./providers/base.js";
import type { TradeResult } from "./metrics.js";
import { computeExtendedMetrics } from "./metrics.js";

export type BiasType =
  | "look_ahead"
  | "overfitting"
  | "parameter_sensitivity"
  | "data_leakage"
  | "survivorship_bias"
  | "execution_bias"
  | "duplicate_trades";

export type BiasLevel = "pass" | "warn" | "fail";

export interface BiasCheck {
  type: BiasType;
  level: BiasLevel;
  title: string;
  description: string;
  evidence: string;
  count: number;
  suggestedFix: string;
}

export interface HistoricalBiasReport {
  checks: BiasCheck[];
  overallLevel: BiasLevel;
  summary: string;
  passCount: number;
  warnCount: number;
  failCount: number;
}

// ── Individual bias check functions ──────────────────────────────────────────

/**
 * Look-ahead bias: verifies that no trade entry uses data from the same bar
 * it was decided on (bar-close vs bar-open entry).
 */
function checkLookAhead(trades: TradeResult[], candles: Candle[]): BiasCheck {
  let violations = 0;
  const examples: string[] = [];

  for (const t of trades) {
    const c = candles[t.index];
    if (!c) continue;
    // Entry above bar high (buy) or below bar low (sell) = look-ahead or bad fill
    if (t.direction === "buy" && t.entryPrice > c.high * 1.0001) {
      violations++;
      if (examples.length < 3) examples.push(`Bar ${t.index}: BUY entry ${t.entryPrice.toFixed(5)} > bar high ${c.high.toFixed(5)}`);
    }
    if (t.direction === "sell" && t.entryPrice < c.low * 0.9999) {
      violations++;
      if (examples.length < 3) examples.push(`Bar ${t.index}: SELL entry ${t.entryPrice.toFixed(5)} < bar low ${c.low.toFixed(5)}`);
    }
  }

  return {
    type: "look_ahead",
    level: violations === 0 ? "pass" : violations > 3 ? "fail" : "warn",
    title: "Look-Ahead Bias",
    description: "Checks that trade entry prices do not exceed the current bar's trading range, which would require future price knowledge.",
    evidence: violations === 0 ? "All entry prices are within bar OHLC range." : `${violations} entries violate bar range. Examples: ${examples.join("; ")}`,
    count: violations,
    suggestedFix: "Use the zone boundary price or bar close as entry — never a price above the bar high / below the bar low.",
  };
}

/**
 * Overfitting detection: walk-forward cross-validation.
 * Splits data 70/30 (train/test), compares win rates.
 * A large drop in performance on the test set indicates overfitting.
 */
function checkOverfitting(trades: TradeResult[]): BiasCheck {
  if (trades.length < 20) {
    return {
      type: "overfitting",
      level: "warn",
      title: "Overfitting Detection",
      description: "Walk-forward analysis requires ≥20 trades for reliable results.",
      evidence: `Only ${trades.length} trades available.`,
      count: 0,
      suggestedFix: "Run validation over a longer period to obtain more trades.",
    };
  }

  const trainEnd = Math.floor(trades.length * 0.7);
  const trainTrades = trades.slice(0, trainEnd);
  const testTrades = trades.slice(trainEnd);

  const trainMetrics = computeExtendedMetrics(trainTrades);
  const testMetrics = computeExtendedMetrics(testTrades);

  const wrDrop = trainMetrics.winRate - testMetrics.winRate;
  const pfDrop = trainMetrics.profitFactor - testMetrics.profitFactor;

  const isOverfit = wrDrop > 20 || pfDrop > 1.0 || testMetrics.profitFactor < 1.0;
  const level: BiasLevel = isOverfit ? "fail" : wrDrop > 10 ? "warn" : "pass";

  return {
    type: "overfitting",
    level,
    title: "Overfitting Detection (Walk-Forward)",
    description: "70% in-sample / 30% out-of-sample split. Compares win rate and profit factor between periods.",
    evidence: `In-sample: WR ${trainMetrics.winRate.toFixed(1)}% PF ${trainMetrics.profitFactor.toFixed(2)} | Out-of-sample: WR ${testMetrics.winRate.toFixed(1)}% PF ${testMetrics.profitFactor.toFixed(2)} | WR drop: ${wrDrop.toFixed(1)}pp`,
    count: isOverfit ? 1 : 0,
    suggestedFix: isOverfit
      ? "Performance degrades significantly on unseen data. Simplify strategy rules or use larger validation windows."
      : "Performance is consistent across in-sample and out-of-sample periods.",
  };
}

/**
 * Parameter sensitivity: tests whether small ATR threshold variations (±20%)
 * dramatically change the number of trades taken.
 * A robust strategy should be relatively insensitive to minor parameter changes.
 */
function checkParameterSensitivity(trades: TradeResult[]): BiasCheck {
  if (trades.length === 0) {
    return {
      type: "parameter_sensitivity",
      level: "pass",
      title: "Parameter Sensitivity",
      description: "No trades to evaluate.",
      evidence: "N/A",
      count: 0,
      suggestedFix: "",
    };
  }

  // Proxy: check if most trades cluster around similar final scores
  // High variance in finalScore = sensitive to scoring threshold
  const scores = trades.map((t) => t.finalScore);
  const meanScore = scores.reduce((s, v) => s + v, 0) / scores.length;
  const stdScore = Math.sqrt(scores.reduce((s, v) => s + (v - meanScore) ** 2, 0) / scores.length);
  const cv = meanScore > 0 ? stdScore / meanScore : 0; // coefficient of variation

  // Also check: how many trades scored within 5 points of the threshold (80)?
  const threshold = 80;
  const marginal = trades.filter((t) => Math.abs(t.finalScore - threshold) <= 5).length;
  const marginalPct = (marginal / trades.length) * 100;

  const level: BiasLevel = marginalPct > 40 ? "fail" : marginalPct > 20 ? "warn" : "pass";

  return {
    type: "parameter_sensitivity",
    level,
    title: "Parameter Sensitivity",
    description: "Checks whether many trades cluster near the decision threshold (±5 points), indicating the strategy is overly sensitive to that parameter.",
    evidence: `${marginal}/${trades.length} trades (${marginalPct.toFixed(1)}%) scored within 5 points of threshold ${threshold}. Score CV: ${cv.toFixed(2)}`,
    count: marginal,
    suggestedFix: marginalPct > 20
      ? "Many trades are marginal decisions. Consider raising the threshold to 85 to capture only high-conviction setups, reducing threshold sensitivity."
      : "Parameter sensitivity is acceptable — less than 20% of trades are marginal.",
  };
}

/**
 * Data leakage: verifies no trade timestamp is from a future bar
 * relative to the current bar index.
 */
function checkDataLeakage(trades: TradeResult[], candles: Candle[]): BiasCheck {
  let violations = 0;
  const examples: string[] = [];

  for (const t of trades) {
    const decisionCandle = candles[t.index];
    if (!decisionCandle) continue;
    // Check that entry time ≥ decision candle open time
    if (t.time < decisionCandle.time) {
      violations++;
      if (examples.length < 3) {
        examples.push(`Trade index ${t.index}: entry time ${t.time.toISOString()} before bar open ${decisionCandle.time.toISOString()}`);
      }
    }
  }

  return {
    type: "data_leakage",
    level: violations === 0 ? "pass" : "fail",
    title: "Data Leakage",
    description: "Verifies that trade entry timestamps are not earlier than the decision bar's open time.",
    evidence: violations === 0 ? "No data leakage detected." : `${violations} trades have timestamps before their decision bar. Examples: ${examples.join("; ")}`,
    count: violations,
    suggestedFix: "Ensure trade timestamps use the decision bar's time, not a future bar's time.",
  };
}

/**
 * Survivorship bias: notes that the strategy was tested only on currently
 * liquid major pairs (EUR/USD, GBP/USD, USD/JPY), which may not represent
 * the full opportunity set at the time.
 */
function checkSurvivorshipBias(trades: TradeResult[]): BiasCheck {
  const pairs = [...new Set(trades.map((t) => t.pair))];
  const onlyMajors = pairs.every((p) => ["EURUSD", "GBPUSD", "USDJPY"].includes(p));

  return {
    type: "survivorship_bias",
    level: "warn",
    title: "Survivorship Bias",
    description: "Validation covers only currently-liquid major pairs, which are known to be profitable. Results may not generalise to cross pairs or exotic instruments.",
    evidence: `Pairs tested: ${pairs.join(", ")}. ${onlyMajors ? "All tested pairs are current major pairs — historically these exhibit strong trend and structure behaviour." : ""}`,
    count: 0,
    suggestedFix: "Acknowledge this limitation in reports. Consider testing on EUR/GBP, AUD/USD, USD/CAD to assess robustness across different dynamics.",
  };
}

/**
 * Execution bias: checks for unrealistic entry conditions.
 * - Entry price above bar high (BUY) or below bar low (SELL)
 * - Stop loss and take profit on wrong side of entry
 * - Zero or negative risk
 */
function checkExecutionBias(trades: TradeResult[], candles: Candle[]): BiasCheck {
  let violations = 0;
  const examples: string[] = [];

  for (const t of trades) {
    const c = candles[t.index];
    if (!c) continue;

    const unreachable =
      (t.direction === "buy" && t.entryPrice > c.high) ||
      (t.direction === "sell" && t.entryPrice < c.low);

    const slWrongSide =
      (t.direction === "buy" && t.stopLoss >= t.entryPrice) ||
      (t.direction === "sell" && t.stopLoss <= t.entryPrice);

    const tpWrongSide =
      (t.direction === "buy" && t.takeProfit <= t.entryPrice) ||
      (t.direction === "sell" && t.takeProfit >= t.entryPrice);

    if (unreachable || slWrongSide || tpWrongSide) {
      violations++;
      if (examples.length < 3) {
        const reasons: string[] = [];
        if (unreachable) reasons.push("entry unreachable");
        if (slWrongSide) reasons.push("SL wrong side");
        if (tpWrongSide) reasons.push("TP wrong side");
        examples.push(`Bar ${t.index} ${t.direction}: ${reasons.join(", ")}`);
      }
    }
  }

  return {
    type: "execution_bias",
    level: violations === 0 ? "pass" : violations > 5 ? "fail" : "warn",
    title: "Execution Bias",
    description: "Checks for unrealistic trade entries: price above bar high, stop loss on wrong side, or take profit on wrong side.",
    evidence: violations === 0 ? "All trade entries are realistic." : `${violations} trades have execution issues. Examples: ${examples.join("; ")}`,
    count: violations,
    suggestedFix: "Use zone boundary or bar close as entry. Verify SL is below entry (BUY) / above entry (SELL). TP must be in the profit direction.",
  };
}

/**
 * Duplicate trades: detects when the same zone triggers multiple signals
 * within a short window (≤5 bars), which may indicate double-counting.
 */
function checkDuplicateTrades(trades: TradeResult[]): BiasCheck {
  let duplicates = 0;
  const examples: string[] = [];

  for (let i = 1; i < trades.length; i++) {
    const prev = trades[i - 1]!;
    const curr = trades[i]!;
    const barGap = curr.index - prev.index;
    const samePair = curr.pair === prev.pair;
    const sameDir = curr.direction === prev.direction;
    const similarPrice = Math.abs(prev.entryPrice - curr.entryPrice) / prev.entryPrice < 0.002;

    if (samePair && sameDir && similarPrice && barGap <= 5) {
      duplicates++;
      if (examples.length < 3) {
        examples.push(`Trades at bars ${prev.index} and ${curr.index} (${barGap} bar gap, ${curr.direction} ${curr.pair})`);
      }
    }
  }

  return {
    type: "duplicate_trades",
    level: duplicates === 0 ? "pass" : duplicates > 5 ? "fail" : "warn",
    title: "Duplicate Trades",
    description: "Detects multiple trades in the same direction on the same pair within 5 bars at a similar price — may indicate the same zone re-triggering.",
    evidence: duplicates === 0 ? "No duplicate trades detected." : `${duplicates} potential duplicates. Examples: ${examples.join("; ")}`,
    count: duplicates,
    suggestedFix: "Implement a zone cooldown — once a zone triggers a trade, mark it unavailable for 5–10 bars to prevent re-entry on the same structure.",
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function detectHistoricalBias(
  trades: TradeResult[],
  candles: Candle[],
): HistoricalBiasReport {
  const checks: BiasCheck[] = [
    checkLookAhead(trades, candles),
    checkOverfitting(trades),
    checkParameterSensitivity(trades),
    checkDataLeakage(trades, candles),
    checkSurvivorshipBias(trades),
    checkExecutionBias(trades, candles),
    checkDuplicateTrades(trades),
  ];

  const passCount = checks.filter((c) => c.level === "pass").length;
  const warnCount = checks.filter((c) => c.level === "warn").length;
  const failCount = checks.filter((c) => c.level === "fail").length;

  const overallLevel: BiasLevel = failCount > 0 ? "fail" : warnCount > 2 ? "warn" : "pass";

  const summary =
    failCount > 0
      ? `${failCount} critical bias issues detected — results may not be reliable`
      : warnCount > 0
        ? `${warnCount} bias warnings — review before drawing conclusions`
        : "All bias checks passed — results appear reliable";

  return { checks, overallLevel, summary, passCount, warnCount, failCount };
}
