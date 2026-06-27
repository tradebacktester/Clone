import type { DataQualityScore } from "./data-quality.js";
import { formatQualityBlock } from "./data-quality.js";
import type { ExtendedMetrics } from "./metrics.js";
import type { Breakdowns } from "./breakdowns.js";
import { formatBreakdownTable } from "./breakdowns.js";
import type { HistoricalBiasReport } from "./bias-checker.js";
import type { HistoricalConfig, StrategyVsActual } from "./validator.js";
import type { TradeResult } from "./metrics.js";

const BIAS_EMOJI: Record<string, string> = { pass: "✅", warn: "⚠️", fail: "❌" };

// ── ASCII equity curve ────────────────────────────────────────────────────────

function asciiEquityCurve(trades: TradeResult[], width = 60, height = 12): string {
  if (trades.length === 0) return "_No trades to plot._\n";

  const equities = [0, ...trades.map((t) => t.equityAfter - (trades[0]?.equityAfter ?? 0))];
  const minE = Math.min(...equities);
  const maxE = Math.max(...equities);
  const range = maxE - minE || 1;

  const sample = Math.max(1, Math.floor(equities.length / width));
  const points = Array.from({ length: width }, (_, i) => {
    const idx = Math.min(equities.length - 1, i * sample);
    return equities[idx] ?? 0;
  });

  const rows: string[] = [];
  for (let row = height - 1; row >= 0; row--) {
    const threshold = minE + (row / (height - 1)) * range;
    const label = threshold.toFixed(0).padStart(7);
    const line = points.map((v) => (v >= threshold ? "█" : " ")).join("");
    rows.push(`${label} │${line}│`);
  }
  const xAxis = " ".repeat(8) + "└" + "─".repeat(width) + "┘";
  const xLabel = " ".repeat(9) + "Start" + " ".repeat(width - 9) + "End";
  return "```\n" + rows.join("\n") + "\n" + xAxis + "\n" + xLabel + "\n```\n";
}

// ── ASCII drawdown curve ──────────────────────────────────────────────────────

function asciiDrawdownCurve(trades: TradeResult[], width = 60, height = 8): string {
  if (trades.length === 0) return "_No trades to plot._\n";

  let peak = 0;
  const drawdowns = trades.map((t) => {
    const e = t.equityAfter;
    if (e > peak) peak = e;
    return peak > 0 ? -((peak - e) / peak) * 100 : 0;
  });

  const minD = Math.min(...drawdowns, -1);
  const sample = Math.max(1, Math.floor(drawdowns.length / width));
  const points = Array.from({ length: width }, (_, i) => {
    const idx = Math.min(drawdowns.length - 1, i * sample);
    return drawdowns[idx] ?? 0;
  });

  const rows: string[] = [];
  for (let row = height - 1; row >= 0; row--) {
    const threshold = (row / (height - 1)) * minD;
    const label = threshold.toFixed(1).padStart(7) + "%";
    const line = points.map((v) => (v <= threshold ? "▓" : " ")).join("");
    rows.push(`${label} │${line}│`);
  }
  const xAxis = " ".repeat(9) + "└" + "─".repeat(width) + "┘";
  return "```\n" + rows.join("\n") + "\n" + xAxis + "\n```\n";
}

// ── Monthly return heatmap (calendar grid) ────────────────────────────────────

function monthlyHeatmap(trades: TradeResult[]): string {
  if (trades.length === 0) return "_No trades._\n";

  const years = [...new Set(trades.map((t) => t.time.getUTCFullYear()))].sort();
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const header = `| Year | ${MONTHS.join(" | ")} | Total |`;
  const sep = `|------|${MONTHS.map(() => "------").join("|")}|-------|`;

  const rows = years.map((y) => {
    const yearTrades = trades.filter((t) => t.time.getUTCFullYear() === y);
    const total = yearTrades.reduce((s, t) => s + t.pnlPips, 0);
    const months = MONTHS.map((_, m) => {
      const monthTrades = yearTrades.filter((t) => t.time.getUTCMonth() === m);
      if (monthTrades.length === 0) return "     ";
      const pnl = monthTrades.reduce((s, t) => s + t.pnlPips, 0);
      const str = (pnl >= 0 ? "+" : "") + pnl.toFixed(0);
      return str.padEnd(5);
    });
    const totalStr = (total >= 0 ? "+" : "") + total.toFixed(0);
    return `| ${y} | ${months.join(" | ")} | ${totalStr} |`;
  });

  return `${header}\n${sep}\n${rows.join("\n")}\n`;
}

// ── Return distribution histogram ─────────────────────────────────────────────

function returnHistogram(metrics: ExtendedMetrics): string {
  if (metrics.returnDistribution.length === 0) return "_No data._\n";

  const maxCount = Math.max(...metrics.returnDistribution.map((b) => b.count), 1);
  const BAR_WIDTH = 20;
  const lines = metrics.returnDistribution.map((b) => {
    const bars = Math.round((b.count / maxCount) * BAR_WIDTH);
    const bar = "█".repeat(bars) + " ".repeat(BAR_WIDTH - bars);
    return `${b.label.padEnd(18)} │${bar}│ ${b.count} (${b.pct.toFixed(1)}%)`;
  });
  return "```\n" + lines.join("\n") + "\n```\n";
}

// ── Best / worst periods ──────────────────────────────────────────────────────

function bestWorstPeriods(trades: TradeResult[]): string {
  if (trades.length < 5) return "_Insufficient trades for period analysis._\n";

  // Group by week
  const weeks = new Map<string, TradeResult[]>();
  for (const t of trades) {
    const d = new Date(t.time);
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - day);
    const key = d.toISOString().slice(0, 10);
    const bucket = weeks.get(key) ?? [];
    bucket.push(t);
    weeks.set(key, bucket);
  }

  const weekStats = [...weeks.entries()]
    .map(([week, ts]) => ({
      week,
      pnl: ts.reduce((s, t) => s + t.pnlPips, 0),
      count: ts.length,
    }))
    .filter((w) => w.count >= 1)
    .sort((a, b) => b.pnl - a.pnl);

  const top5 = weekStats.slice(0, 5);
  const bottom5 = weekStats.slice(-5).reverse();

  const best = top5.map((w, i) => `${i + 1}. Week of ${w.week}: **+${w.pnl.toFixed(1)} pips** (${w.count} trades)`).join("\n");
  const worst = bottom5.map((w, i) => `${i + 1}. Week of ${w.week}: **${w.pnl.toFixed(1)} pips** (${w.count} trades)`).join("\n");

  return `**Best 5 Weeks:**\n${best}\n\n**Worst 5 Weeks:**\n${worst}\n`;
}

// ── Main report generator ─────────────────────────────────────────────────────

export function generateHistoricalReport(
  config: HistoricalConfig,
  quality: DataQualityScore,
  metrics: ExtendedMetrics,
  breakdowns: Breakdowns,
  bias: HistoricalBiasReport,
  strategyVsActual: StrategyVsActual[],
  trades: TradeResult[],
  generatedAt?: Date,
): string {
  const now = generatedAt ?? new Date();
  const sigStr = metrics.isSignificant
    ? `✅ Statistically significant (p=${metrics.pValue.toFixed(3)} < 0.05)`
    : `⚠️ Not statistically significant (p=${metrics.pValue.toFixed(3)} ≥ 0.05)`;

  const biasLevelBadge = { pass: "✅ CLEAN", warn: "⚠️ WARNINGS", fail: "❌ ISSUES DETECTED" }[bias.overallLevel];

  const svaTable = strategyVsActual.length > 0 ? `
| Rule | Expected Pass% | Actual Pass% | Δ | Expected Win% | Actual Win% | Status |
|------|---------------|--------------|---|---------------|-------------|--------|
${strategyVsActual.map((s) =>
  `| ${s.rule} | ${s.expectedPassRatePct}% | ${s.actualPassRatePct}% | ${s.deviation > 0 ? "+" : ""}${s.deviation}pp | ${s.expectedWinRatePct}% | ${s.actualWinRatePct}% | ${s.note} |`
).join("\n")}` : "_No rule comparison data._";

  const biasChecks = bias.checks.map((c) => `
#### ${BIAS_EMOJI[c.level] ?? "–"} ${c.title} — ${c.level.toUpperCase()}
${c.description}

**Evidence:** ${c.evidence}  
${c.count > 0 ? `**Suggested Fix:** ${c.suggestedFix}` : ""}
`).join("\n");

  return `# HISTORICAL_VALIDATION_REPORT.md

> **Generated:** ${now.toISOString().slice(0, 16).replace("T", " ")} UTC  
> **Strategy:** AMD / Smart Money Concepts / Supply & Demand  
> **Pair:** ${config.pair} | **Timeframe:** ${config.timeframe}  
> **Period:** ${config.startDate} → ${config.endDate}  
> **Note:** This report contains only real historical data. No synthetic candles were used.

---

## 1. Data Quality Report

${formatQualityBlock(quality)}

${quality.warnings.length > 0 ? "**Data Warnings:**\n" + quality.warnings.map((w) => `- ⚠️ ${w}`).join("\n") : ""}

${quality.disabledForValidation ? `\n> ⛔ **Validation was not run** — ${quality.disabledReason}\n` : ""}

---

## 2. Executive Summary

| Metric | Value |
|--------|-------|
| Total Candles | ${metrics.totalTrades > 0 ? "—" : "0"} |
| Total Trades | **${metrics.totalTrades}** |
| Winning Trades | ${metrics.wins} |
| Losing Trades | ${metrics.losses} |
| **Win Rate** | **${metrics.winRate.toFixed(1)}%** |
| **Profit Factor** | **${metrics.profitFactor.toFixed(2)}** |
| Net Profit | ${metrics.netProfitPips.toFixed(1)} pips |
| Gross Profit | ${metrics.grossProfitPips.toFixed(1)} pips |
| Gross Loss | ${metrics.grossLossPips.toFixed(1)} pips |
| **Expectancy** | **${metrics.expectancyPips.toFixed(2)} pips/trade** |

---

## 3. Performance Metrics

| Metric | Value |
|--------|-------|
| Win Rate | ${metrics.winRate.toFixed(2)}% |
| Profit Factor | ${metrics.profitFactor.toFixed(4)} |
| Expectancy | ${metrics.expectancyPips.toFixed(4)} pips |
| **Sharpe Ratio** | **${metrics.sharpeRatio.toFixed(4)}** |
| **Sortino Ratio** | **${metrics.sortinoRatio.toFixed(4)}** |
| **Max Drawdown** | **${metrics.maxDrawdownPips.toFixed(1)} pips (${metrics.maxDrawdownPct.toFixed(1)}%)** |
| Avg Drawdown | ${metrics.avgDrawdownPips.toFixed(1)} pips |
| **Avg Planned R:R** | **${metrics.avgPlannedRR.toFixed(2)}** |
| Avg Actual R:R | ${metrics.avgActualRR.toFixed(2)} |
| **Recovery Factor** | **${metrics.recoveryFactor === Infinity ? "∞" : metrics.recoveryFactor.toFixed(4)}** |
| Max Consecutive Wins | ${metrics.maxConsecWins} |
| Max Consecutive Losses | ${metrics.maxConsecLosses} |
| Return P25 / P50 / P75 | ${metrics.percentile25.toFixed(1)} / ${metrics.percentile50.toFixed(1)} / ${metrics.percentile75.toFixed(1)} pips |

---

## 4. Equity Curve

${asciiEquityCurve(trades)}

---

## 5. Drawdown Curve

${asciiDrawdownCurve(trades)}

---

## 6. Monthly Returns (Pips)

${monthlyHeatmap(trades)}

---

## 7. Return Distribution

${returnHistogram(metrics)}

---

## 8. Best & Worst Trading Periods

${bestWorstPeriods(trades)}

---

## 9. Performance Breakdowns

${formatBreakdownTable(breakdowns.byPair, "By Currency Pair")}

${formatBreakdownTable(breakdowns.byYear, "By Year")}

${formatBreakdownTable(breakdowns.byMonth, "By Month")}

${formatBreakdownTable(breakdowns.bySession, "By Trading Session")}

${formatBreakdownTable(breakdowns.byRegime, "By Market Regime")}

${formatBreakdownTable(breakdowns.byZoneQuality, "By Zone Quality")}

${formatBreakdownTable(breakdowns.byLiquidityScore, "By Liquidity Score")}

${formatBreakdownTable(breakdowns.byAMDScore, "By AMD Score")}

${formatBreakdownTable(breakdowns.byConfirmationScore, "By Confirmation Score")}

---

## 10. Strategy vs Actual Behavior

> A mismatch (|Δ| > 15pp) indicates the strategy is behaving differently from its design intent.
> This may signal overfitting, data-specific quirks, or a need for rule recalibration.

${svaTable}

---

## 11. Statistical Significance

| Metric | Value |
|--------|-------|
| T-Statistic | ${metrics.tStatistic.toFixed(4)} |
| P-Value | ${metrics.pValue.toFixed(4)} |
| Result | ${sigStr} |
| 95% CI (mean return) | [${metrics.confidenceInterval95[0].toFixed(2)}, ${metrics.confidenceInterval95[1].toFixed(2)}] pips |

${metrics.isSignificant
  ? "The mean return per trade is statistically different from zero at the 5% significance level."
  : "**Warning:** The strategy results are not statistically significant. More trades are needed before drawing conclusions. Consider running over a longer period or increasing trade frequency."}

---

## 12. Bias Detection Report

**Overall Bias Rating: ${biasLevelBadge}**

> ${bias.summary}

| Check | Result | Count |
|-------|--------|-------|
${bias.checks.map((c) => `| ${c.title} | ${BIAS_EMOJI[c.level] ?? "–"} ${c.level.toUpperCase()} | ${c.count} |`).join("\n")}

${biasChecks}

---

## 13. Data Quality Notes

### Real vs Missing Data

| Field | Value |
|-------|-------|
| Provider | ${quality.provider} |
| Real Candles | ${quality.actualBars.toLocaleString()} |
| Expected Candles | ${quality.totalExpectedBars.toLocaleString()} |
| Missing Candles | ${quality.missingBars.toLocaleString()} |
| Coverage | ${quality.coveragePct.toFixed(1)}% |
| Data Grade | ${quality.grade} |

${quality.gaps.length > 0 ? "**Data Gaps:**\n" + quality.gaps.slice(0, 10).map((g) => `- ${g.start.toISOString().slice(0, 10)} → ${g.end.toISOString().slice(0, 10)}: ${g.reason ?? "missing data"}`).join("\n") : "No significant data gaps detected."}

${quality.notes.map((n) => `> ℹ️ ${n}`).join("\n")}

### Validation Limitations

- **15M Timeframe**: Yahoo Finance provides real 15M data for the last 60 calendar days only. For earlier periods, 15M validation is disabled entirely — no synthetic candles are used.
- **4H Timeframe**: Yahoo Finance provides real 1H data aggregated to 4H bars (open=first bar's open, high/low=max/min, close=last bar's close). This is real downsampled data, not synthesized.
- **Daily Timeframe**: Up to 10 years of real daily OHLCV from Yahoo Finance.

---

*Report generated by TradeClone AI — Historical Market Validation Engine*  
*"Do not compromise execution accuracy for convenience."*
`;
}
