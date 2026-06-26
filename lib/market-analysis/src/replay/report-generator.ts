import type { DecisionTrace } from "./rule-evaluator.js";
import type { BiasSummary } from "./bias-detector.js";
import type { Pair, Timeframe } from "../types.js";

export interface ReplayConfig {
  pair: Pair;
  timeframe: Timeframe;
  startDate: string;
  endDate: string;
}

export interface ReplayStats {
  totalCandles: number;
  totalEvaluated: number;
  totalTradesTaken: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  falsePositives: number;
  falseNegatives: number;
  missedOpportunities: number;
  avgFinalScore: number;
  avgRiskReward: number;
  ruleAccuracy: Record<string, RuleAccuracyStats>;
}

export interface RuleAccuracyStats {
  rule: string;
  totalEvaluated: number;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number;
  winRateWhenPassed: number;
  winRateWhenFailed: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
}

export function computeStats(traces: DecisionTrace[]): ReplayStats {
  const evaluated = traces.filter(t => t.finalDecision !== "NO_ZONE");
  const traded = traces.filter(t => t.tradeTaken && t.trade);
  const wins = traded.filter(t => t.trade?.outcome === "win");
  const losses = traded.filter(t => t.trade?.outcome === "loss");
  const winRate = traded.length > 0 ? (wins.length / traded.length) * 100 : 0;

  const falsePositives = traded.filter(t => t.trade?.outcome === "loss").length;
  const totalMovements = traces.filter(t => {
    if (!t.tradeTaken) return false;
    const movement = Math.abs(t.close - t.open);
    return movement > t.atr * 0.5;
  }).length;
  const missedOpportunities = Math.max(0, totalMovements - traded.length);
  const falseNegatives = evaluated.filter(t => !t.tradeTaken).length;

  const avgFinalScore =
    traded.length > 0
      ? traded.reduce((s, t) => s + (t.trade?.finalScore ?? 0), 0) / traded.length
      : 0;

  const avgRiskReward =
    traded.length > 0
      ? traded.reduce((s, t) => s + (t.trade?.riskReward ?? 0), 0) / traded.length
      : 0;

  const ruleNames = [
    "Zone Proximity",
    "Zone Strength",
    "HTF Market Structure",
    "Premium/Discount",
    "Liquidity Sweep",
    "AMD Phase",
    "Confirmation Candle",
    "Final Score",
  ];

  const ruleAccuracy: Record<string, RuleAccuracyStats> = {};

  for (const ruleName of ruleNames) {
    const stats: RuleAccuracyStats = {
      rule: ruleName,
      totalEvaluated: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      passRate: 0,
      winRateWhenPassed: 0,
      winRateWhenFailed: 0,
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      trueNegatives: 0,
    };

    const passedWins: number[] = [];
    const passedLosses: number[] = [];
    const failedWins: number[] = [];
    const failedLosses: number[] = [];

    for (const trace of traces) {
      for (const ze of trace.zoneEvaluations) {
        const ruleCheck = ze.rules.find(r => r.rule === ruleName);
        if (!ruleCheck) continue;
        stats.totalEvaluated++;

        if (ruleCheck.status === "PASS" || ruleCheck.status === "WARN") {
          stats.passed++;
          if (trace.trade?.outcome === "win") passedWins.push(1);
          else if (trace.trade?.outcome === "loss") passedLosses.push(1);
        } else if (ruleCheck.status === "FAIL") {
          stats.failed++;
          if (trace.trade?.outcome === "win") failedWins.push(1);
          else if (trace.trade?.outcome === "loss") failedLosses.push(1);
        } else {
          stats.skipped++;
        }
      }
    }

    stats.passRate = stats.totalEvaluated > 0 ? (stats.passed / stats.totalEvaluated) * 100 : 0;
    const passedTotal = passedWins.length + passedLosses.length;
    const failedTotal = failedWins.length + failedLosses.length;
    stats.winRateWhenPassed = passedTotal > 0 ? (passedWins.length / passedTotal) * 100 : 0;
    stats.winRateWhenFailed = failedTotal > 0 ? (failedWins.length / failedTotal) * 100 : 0;
    stats.truePositives = passedWins.length;
    stats.falsePositives = passedLosses.length;
    stats.falseNegatives = failedWins.length;
    stats.trueNegatives = failedLosses.length;

    ruleAccuracy[ruleName] = stats;
  }

  return {
    totalCandles: traces.length,
    totalEvaluated: evaluated.length,
    totalTradesTaken: traded.length,
    totalWins: wins.length,
    totalLosses: losses.length,
    winRate,
    falsePositives,
    falseNegatives,
    missedOpportunities,
    avgFinalScore,
    avgRiskReward,
    ruleAccuracy,
  };
}

export function generateValidationReport(
  config: ReplayConfig,
  traces: DecisionTrace[],
  bias: BiasSummary,
  stats: ReplayStats,
): string {
  const now = new Date().toISOString().split("T")[0]!;
  const traded = traces.filter(t => t.tradeTaken && t.trade);
  const noZone = traces.filter(t => t.finalDecision === "NO_ZONE");
  const noTrade = traces.filter(t => t.finalDecision === "NO_TRADE");
  const biasRating =
    bias.overallRating === "clean"
      ? "✅ CLEAN"
      : bias.overallRating === "suspicious"
        ? "⚠️ SUSPICIOUS"
        : "❌ BIASED";

  const ruleRows = Object.values(stats.ruleAccuracy)
    .map(r => {
      const precision =
        r.truePositives + r.falsePositives > 0
          ? ((r.truePositives / (r.truePositives + r.falsePositives)) * 100).toFixed(1)
          : "N/A";
      const recall =
        r.truePositives + r.falseNegatives > 0
          ? ((r.truePositives / (r.truePositives + r.falseNegatives)) * 100).toFixed(1)
          : "N/A";
      return `| ${r.rule.padEnd(25)} | ${r.passRate.toFixed(1).padStart(8)}% | ${r.winRateWhenPassed.toFixed(1).padStart(12)}% | ${r.winRateWhenFailed.toFixed(1).padStart(12)}% | ${precision.toString().padStart(12)} | ${recall.toString().padStart(9)} |`;
    })
    .join("\n");

  const biasSection =
    bias.flags.length === 0
      ? "No bias flags detected. The strategy appears to be operating without look-ahead bias or data leakage.\n"
      : bias.flags
          .map(
            f =>
              `### ${f.type.replace(/_/g, " ").toUpperCase()} — ${f.severity.toUpperCase()}\n**Candle:** ${f.candleTime} (index ${f.candleIndex})\n**Description:** ${f.description}\n**Evidence:** ${f.evidence}\n**Suggested Fix:** ${f.suggestedFix}\n`,
          )
          .join("\n");

  const suggestedFixes: string[] = [];
  if (bias.duplicateSignals > 3) {
    suggestedFixes.push(
      `- **Cooldown filter**: ${bias.duplicateSignals} duplicate signals detected. Add a minimum 5-candle cooldown after each trade signal to prevent over-trading on the same zone.`,
    );
  }
  if (bias.repaintingDetected) {
    suggestedFixes.push(
      "- **Zone persistence**: Zones are disappearing within 5 candles of signal generation. Review zone formation logic — zones should be anchored to historical impulse candles and not re-evaluated retroactively.",
    );
  }
  if (bias.lookAheadDetected) {
    suggestedFixes.push(
      "- **Look-ahead elimination**: Trades closing on entry bars detected. Enforce a strict rule: TP/SL checks run only on bars AFTER the entry bar (index > entry_index).",
    );
  }
  if (stats.ruleAccuracy["Liquidity Sweep"]?.passRate ?? 0 < 20) {
    suggestedFixes.push(
      "- **Liquidity gate relaxation**: The Liquidity Sweep rule has a very low pass rate. Consider relaxing the lookback window from 8 to 12 bars, or downgrading it from a hard filter to a soft scoring factor.",
    );
  }
  if (stats.ruleAccuracy["AMD Phase"]?.passRate ?? 0 < 15) {
    suggestedFixes.push(
      "- **AMD threshold**: AMD full-sequence score ≥80 is rarely met. Consider relaxing to ≥65 or using partial AMD phases (Accumulation only) as a softer filter.",
    );
  }
  if (stats.falsePositives > stats.totalTradesTaken * 0.5) {
    suggestedFixes.push(
      "- **Signal quality**: More than 50% of trades are false positives (losses). Increase the minimum Final Score threshold from 80 to 85 to improve precision.",
    );
  }
  if (suggestedFixes.length === 0) {
    suggestedFixes.push("- No specific fixes required. Strategy is performing within expected parameters.");
  }

  return `# VALIDATION_REPORT.md
*Generated: ${now}*
*Pair: ${config.pair} | Timeframe: ${config.timeframe} | Period: ${config.startDate} → ${config.endDate}*

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Candles Replayed | ${stats.totalCandles} |
| Candles with Zone Activity | ${stats.totalEvaluated} |
| Total Trades Taken | ${stats.totalTradesTaken} |
| Winning Trades | ${stats.totalWins} |
| Losing Trades | ${stats.totalLosses} |
| Win Rate | ${stats.winRate.toFixed(1)}% |
| Avg Risk:Reward | ${stats.avgRiskReward.toFixed(2)}:1 |
| Avg Final Score | ${stats.avgFinalScore.toFixed(1)}/100 |
| Bias Rating | ${biasRating} |

---

## Trade Decision Breakdown

| Category | Count | Percentage |
|----------|-------|------------|
| Trades Taken | ${traded.length} | ${stats.totalCandles > 0 ? ((traded.length / stats.totalCandles) * 100).toFixed(1) : 0}% |
| No Trade (rules failed) | ${noTrade.length} | ${stats.totalCandles > 0 ? ((noTrade.length / stats.totalCandles) * 100).toFixed(1) : 0}% |
| No Zone Activity | ${noZone.length} | ${stats.totalCandles > 0 ? ((noZone.length / stats.totalCandles) * 100).toFixed(1) : 0}% |

---

## Rule Accuracy Analysis

| Rule | Pass Rate | Win Rate (Pass) | Win Rate (Fail) | Precision | Recall |
|------|-----------|-----------------|-----------------|-----------|--------|
${ruleRows}

### Interpretation
- **Pass Rate**: How often this rule allows the trade to proceed to the next rule
- **Win Rate (Pass)**: Of trades where this rule passed, how many were winners
- **Win Rate (Fail)**: Of trades where this rule blocked, how many would have been winners (false negatives)
- **Precision**: TP / (TP + FP) — how accurate the rule is when it says "trade"
- **Recall**: TP / (TP + FN) — how well the rule catches winning opportunities

---

## False Positives & False Negatives

| Metric | Count | Notes |
|--------|-------|-------|
| False Positives (losing trades) | ${stats.falsePositives} | Trades taken that resulted in losses |
| False Negatives (missed winners) | ${stats.falseNegatives} | Candles with zone activity where no trade was taken |
| Missed Opportunities | ${stats.missedOpportunities} | Significant price moves with no entry |

---

## Bias Detection

**Overall Rating: ${biasRating}**

| Bias Type | Count |
|-----------|-------|
| Look-Ahead Bias | ${bias.byType.look_ahead} |
| Repainting | ${bias.byType.repainting} |
| Future Data Leakage | ${bias.byType.future_data_leakage} |
| Duplicate Signals | ${bias.byType.duplicate_signal} |
| Invalid Entries | ${bias.byType.invalid_entry} |

### Detailed Findings

${biasSection}

---

## Suggested Fixes

${suggestedFixes.join("\n")}

---

## Technical Validation Notes

### Look-Ahead Bias Prevention
The replay engine enforces zero look-ahead by slicing the candle array to \`candles[0..i]\` at each step \`i\`. All analysis functions (zone detection, liquidity sweep, AMD, confirmation) are called exclusively on this past-only slice. Outcome resolution (win/loss determination) uses future candles but only AFTER the trade decision has been recorded.

### Zone Validity
Supply and demand zones are derived from historical impulse candles using displacement and BOS scoring. A zone is marked \`active\` only if price has not violated its boundaries in candles prior to the current bar.

### Signal Independence
Each candle's decision trace is fully independent. The engine does not carry forward state from one candle to the next (beyond the accumulated candle history), preventing any form of state-based look-ahead.

---

*Report generated by TradeClone AI — Strategy Validation & Replay Framework*
`;
}
