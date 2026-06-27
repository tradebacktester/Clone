/**
 * ROBUSTNESS_REPORT.md Generator
 * Converts a full RobustnessPipelineResult into a structured markdown document.
 */

import type { RobustnessPipelineResult } from "./types.js";

function bar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function pct(v: number, decimals = 1): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}

function fmtScore(v: number): string {
  return v.toFixed(1);
}

function gradeEmoji(grade: string): string {
  switch (grade) {
    case "A": return "🟢";
    case "B": return "🟡";
    case "C": return "🟠";
    case "D": return "🔴";
    default:  return "🔴";
  }
}

function verdictBadge(verdict: string): string {
  switch (verdict) {
    case "robust":       return "✅ ROBUST";
    case "acceptable":   return "⚠️ ACCEPTABLE";
    case "needs_work":   return "🔶 NEEDS WORK";
    case "fragile":      return "❌ FRAGILE";
    default:             return verdict.toUpperCase();
  }
}

function stressVerdict(verdict: string): string {
  switch (verdict) {
    case "robust":   return "✅ Robust";
    case "degraded": return "⚠️ Degraded";
    case "critical": return "❌ Critical";
    default:         return verdict;
  }
}

function execVerdict(verdict: string): string {
  switch (verdict) {
    case "acceptable": return "✅ Acceptable";
    case "degraded":   return "⚠️ Degraded";
    case "critical":   return "❌ Critical";
    default:           return verdict;
  }
}

export function generateRobustnessReportMarkdown(result: RobustnessPipelineResult): string {
  const { score, sensitivity, marketStress, executionStress, riskStress, walkForward, oos, confidenceStability, findings, recommendations, runAt, pair, durationMs } = result;

  const lines: string[] = [];
  const hr = "---";

  // ── Header ──────────────────────────────────────────────────────────────────
  lines.push(`# Strategy Robustness & Stress Testing Report`);
  lines.push(``);
  lines.push(`**Pair:** ${pair}  `);
  lines.push(`**Run at:** ${new Date(runAt).toUTCString()}  `);
  lines.push(`**Duration:** ${(durationMs / 1000).toFixed(1)}s  `);
  lines.push(`**Report generated:** ${new Date().toUTCString()}`);
  lines.push(``);
  lines.push(hr);
  lines.push(``);

  // ── Overall Score ────────────────────────────────────────────────────────────
  lines.push(`## Overall Robustness Score`);
  lines.push(``);
  lines.push(`| Score | Grade | Verdict |`);
  lines.push(`|-------|-------|---------|`);
  lines.push(`| **${score.overall}/100** | ${gradeEmoji(score.grade)} **${score.grade}** | ${verdictBadge(score.verdict)} |`);
  lines.push(``);
  lines.push(`### Score Breakdown`);
  lines.push(``);
  lines.push(`| Category | Score | Bar |`);
  lines.push(`|----------|-------|-----|`);
  lines.push(`| Stability (param sensitivity + walk-forward) | ${score.breakdown.stability}/100 | \`${bar(score.breakdown.stability)}\` |`);
  lines.push(`| Generalization (OOS + walk-forward efficiency) | ${score.breakdown.generalization}/100 | \`${bar(score.breakdown.generalization)}\` |`);
  lines.push(`| Risk Resilience | ${score.breakdown.riskResilience}/100 | \`${bar(score.breakdown.riskResilience)}\` |`);
  lines.push(`| Execution Resilience | ${score.breakdown.executionResilience}/100 | \`${bar(score.breakdown.executionResilience)}\` |`);
  lines.push(`| Data Quality | ${score.breakdown.dataQuality}/100 | \`${bar(score.breakdown.dataQuality)}\` |`);
  lines.push(``);
  lines.push(hr);
  lines.push(``);

  // ── 1. Parameter Sensitivity ─────────────────────────────────────────────────
  lines.push(`## 1. Parameter Sensitivity Analysis`);
  lines.push(``);
  lines.push(`**Overall sensitivity score:** ${fmtScore(sensitivity.overallSensitivityScore)}/100 _(lower = more stable)_`);
  lines.push(``);
  lines.push(`**Stable parameters:** ${sensitivity.stableParameters.length > 0 ? sensitivity.stableParameters.join(", ") : "None"}`);
  lines.push(`**Sensitive parameters:** ${sensitivity.sensitiveParameters.length > 0 ? sensitivity.sensitiveParameters.join(", ") : "None"}`);
  lines.push(``);

  for (const param of sensitivity.parameters) {
    const flag = param.overlySensitive ? " ⚠️ OVERLY SENSITIVE" : "";
    lines.push(`### ${param.parameter}${flag}`);
    lines.push(``);
    lines.push(`> ${param.description}  `);
    lines.push(`> Baseline: **${param.baseline} ${param.unit}** | Sensitivity score: **${fmtScore(param.sensitivityScore)}/100**`);
    lines.push(``);
    lines.push(`| Variation | Win Rate Δ | Profit Factor Δ | Drawdown Δ | Expectancy Δ |`);
    lines.push(`|-----------|-----------|----------------|-----------|-------------|`);
    for (const v of param.variations) {
      const level = v.level === 0 ? "**baseline**" : `${v.level > 0 ? "+" : ""}${v.level}%`;
      lines.push(`| ${level} | ${pct(v.deltaWinRate)} | ${pct(v.deltaProfitFactor)} | ${pct(v.deltaDrawdown)} | ${pct(v.deltaExpectancy)} |`);
    }
    lines.push(``);
    if (param.recommendation) {
      lines.push(`_Recommendation: ${param.recommendation}_`);
      lines.push(``);
    }
  }

  if (sensitivity.findings.length > 0) {
    lines.push(`**Findings:**`);
    for (const f of sensitivity.findings) lines.push(`- ${f}`);
    lines.push(``);
  }
  lines.push(hr);
  lines.push(``);

  // ── 2. Market Stress Testing ─────────────────────────────────────────────────
  lines.push(`## 2. Market Stress Testing`);
  lines.push(``);
  lines.push(`**Overall robustness score:** ${fmtScore(marketStress.overallRobustScore)}/100`);
  lines.push(`**Worst market condition:** \`${marketStress.worstCondition}\``);
  lines.push(``);
  lines.push(`### Baseline`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Win Rate | ${fmtScore(marketStress.baseline.winRate)}% |`);
  lines.push(`| Profit Factor | ${fmtScore(marketStress.baseline.profitFactor)} |`);
  lines.push(`| Max Drawdown | ${fmtScore(marketStress.baseline.maxDrawdown)}% |`);
  lines.push(`| Expectancy | $${fmtScore(marketStress.baseline.expectancy)} |`);
  lines.push(`| Sharpe Ratio | ${fmtScore(marketStress.baseline.sharpeRatio)} |`);
  lines.push(``);
  lines.push(`### Scenarios`);
  lines.push(``);
  lines.push(`| Condition | Verdict | Win Rate Δ | PF Δ | DD Δ |`);
  lines.push(`|-----------|---------|-----------|------|------|`);
  for (const s of marketStress.scenarios) {
    const c = s.baselineComparison;
    lines.push(`| **${s.label}** | ${stressVerdict(s.verdict)} | ${pct(c.winRateDelta)} | ${pct(c.profitFactorDelta)} | ${pct(c.drawdownDelta)} |`);
  }
  lines.push(``);

  for (const s of marketStress.scenarios) {
    lines.push(`#### ${s.label}`);
    lines.push(``);
    lines.push(`> ${s.description}`);
    lines.push(``);
    lines.push(`| Metric | Stress | Baseline | Δ |`);
    lines.push(`|--------|--------|----------|---|`);
    lines.push(`| Win Rate | ${fmtScore(s.stats.winRate)}% | ${fmtScore(marketStress.baseline.winRate)}% | ${pct(s.baselineComparison.winRateDelta)} |`);
    lines.push(`| Profit Factor | ${fmtScore(s.stats.profitFactor)} | ${fmtScore(marketStress.baseline.profitFactor)} | ${pct(s.baselineComparison.profitFactorDelta)} |`);
    lines.push(`| Max Drawdown | ${fmtScore(s.stats.maxDrawdown)}% | ${fmtScore(marketStress.baseline.maxDrawdown)}% | ${pct(s.baselineComparison.drawdownDelta)} |`);
    lines.push(`| Expectancy | $${fmtScore(s.stats.expectancy)} | $${fmtScore(marketStress.baseline.expectancy)} | ${pct(s.baselineComparison.expectancyDelta)} |`);
    lines.push(``);
  }

  if (marketStress.findings.length > 0) {
    lines.push(`**Findings:**`);
    for (const f of marketStress.findings) lines.push(`- ${f}`);
    lines.push(``);
  }
  lines.push(hr);
  lines.push(``);

  // ── 3. Execution Stress Testing ──────────────────────────────────────────────
  lines.push(`## 3. Execution Stress Testing`);
  lines.push(``);
  lines.push(`**Overall resilience score:** ${fmtScore(executionStress.overallResilienceScore)}/100`);
  lines.push(`**Worst imperfection:** \`${executionStress.worstImperfection}\``);
  lines.push(`**Total worst-case PnL impact:** ${pct(executionStress.totalWorstCasePnlImpact)}`);
  lines.push(``);
  lines.push(`| Imperfection | Verdict | PnL Impact | Win Rate Δ |`);
  lines.push(`|-------------|---------|-----------|-----------|`);
  for (const s of executionStress.scenarios) {
    lines.push(`| **${s.label}** | ${execVerdict(s.verdict)} | ${pct(s.pnlImpact)} | ${pct(s.winRateImpact)} |`);
  }
  lines.push(``);

  for (const s of executionStress.scenarios) {
    lines.push(`#### ${s.label}`);
    lines.push(``);
    lines.push(`> ${s.description}`);
    lines.push(``);
    const paramStr = Object.entries(s.params).map(([k, v]) => `${k}: ${v}`).join(", ");
    if (paramStr) lines.push(`_Parameters: ${paramStr}_`);
    lines.push(``);
    lines.push(`| Metric | Stress | Baseline |`);
    lines.push(`|--------|--------|----------|`);
    lines.push(`| Total Trades | ${s.stats.totalTrades} | ${executionStress.baseline.totalTrades} |`);
    lines.push(`| Win Rate | ${fmtScore(s.stats.winRate)}% | ${fmtScore(executionStress.baseline.winRate)}% |`);
    lines.push(`| Total PnL | $${fmtScore(s.stats.totalPnl)} | $${fmtScore(executionStress.baseline.totalPnl)} |`);
    lines.push(`| Max Drawdown | ${fmtScore(s.stats.maxDrawdown)}% | ${fmtScore(executionStress.baseline.maxDrawdown)}% |`);
    lines.push(``);
  }

  if (executionStress.findings.length > 0) {
    lines.push(`**Findings:**`);
    for (const f of executionStress.findings) lines.push(`- ${f}`);
    lines.push(``);
  }
  lines.push(hr);
  lines.push(``);

  // ── 4. Risk Stress Testing ───────────────────────────────────────────────────
  lines.push(`## 4. Risk Stress Testing`);
  lines.push(``);
  lines.push(`**Overall resilience score:** ${fmtScore(riskStress.overallResilienceScore)}/100`);
  lines.push(``);
  lines.push(`### Losing Streak Analysis`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Max Consecutive Losses | ${riskStress.losingStreak.maxConsecutiveLosses} |`);
  lines.push(`| Max Drawdown from Streak | ${fmtScore(riskStress.losingStreak.maxDrawdownFromStreak)}% |`);
  lines.push(`| Recovery Trades Needed | ${riskStress.losingStreak.recoveryTradesNeeded} |`);
  lines.push(`| Streak Occurrences | ${riskStress.losingStreak.occurrenceCount} |`);
  lines.push(`| Streak Degradation | ${fmtScore(riskStress.losingStreak.streakDegradationPct)}% |`);
  lines.push(`| Daily Limit Breaches | ${riskStress.dailyLimitBreaches} |`);
  lines.push(`| Weekly Limit Breaches | ${riskStress.weeklyLimitBreaches} |`);
  lines.push(``);
  lines.push(`### Drawdown Recovery`);
  lines.push(``);
  lines.push(`| Drawdown Depth | Recovery Trades | Est. Days | Recovery Probability |`);
  lines.push(`|---------------|----------------|-----------|---------------------|`);
  for (const r of riskStress.drawdownRecovery) {
    lines.push(`| ${r.drawdownDepthPct}% | ${r.recoveryTrades} | ${r.recoveryDays} | ${fmtScore(r.probabilityOfRecovery)}% |`);
  }
  lines.push(``);
  lines.push(`### Position Sizing Resilience`);
  lines.push(``);
  lines.push(`| Equity Level | Win Rate | Profit Factor | Max Drawdown |`);
  lines.push(`|-------------|---------|--------------|-------------|`);
  lines.push(`| 50% equity | ${fmtScore(riskStress.positionSizingResilience.at50pctEquity.winRate)}% | ${fmtScore(riskStress.positionSizingResilience.at50pctEquity.profitFactor)} | ${fmtScore(riskStress.positionSizingResilience.at50pctEquity.maxDrawdown)}% |`);
  lines.push(`| 75% equity | ${fmtScore(riskStress.positionSizingResilience.at75pctEquity.winRate)}% | ${fmtScore(riskStress.positionSizingResilience.at75pctEquity.profitFactor)} | ${fmtScore(riskStress.positionSizingResilience.at75pctEquity.maxDrawdown)}% |`);
  lines.push(`| 125% equity | ${fmtScore(riskStress.positionSizingResilience.at125pctEquity.winRate)}% | ${fmtScore(riskStress.positionSizingResilience.at125pctEquity.profitFactor)} | ${fmtScore(riskStress.positionSizingResilience.at125pctEquity.maxDrawdown)}% |`);
  lines.push(``);

  if (riskStress.findings.length > 0) {
    lines.push(`**Findings:**`);
    for (const f of riskStress.findings) lines.push(`- ${f}`);
    lines.push(``);
  }
  lines.push(hr);
  lines.push(``);

  // ── 5. Walk-Forward Robustness ───────────────────────────────────────────────
  lines.push(`## 5. Walk-Forward Robustness`);
  lines.push(``);
  lines.push(`**Recommendation:** ${walkForward.recommendation}`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Windows | ${walkForward.windows} |`);
  lines.push(`| Passed Windows | ${walkForward.passedWindows} / ${walkForward.windows} |`);
  lines.push(`| Avg Efficiency Ratio | ${walkForward.avgEfficiencyRatio.toFixed(3)} |`);
  lines.push(`| Parameter Stability | ${fmtScore(walkForward.parameterStability)}/100 |`);
  lines.push(`| Overfit Score | ${fmtScore(walkForward.overfitScore)}/100 _(lower = better)_ |`);
  lines.push(`| Regime Sensitivity | ${fmtScore(walkForward.regimeSensitivity)}/100 _(lower = better)_ |`);
  lines.push(`| Consistency Score | ${fmtScore(walkForward.consistencyScore)}/100 |`);
  lines.push(`| Overall Score | ${fmtScore(walkForward.overallScore)}/100 |`);
  lines.push(``);

  if (walkForward.findings.length > 0) {
    lines.push(`**Findings:**`);
    for (const f of walkForward.findings) lines.push(`- ${f}`);
    lines.push(``);
  }
  lines.push(hr);
  lines.push(``);

  // ── 6. Out-of-Sample Validation ──────────────────────────────────────────────
  lines.push(`## 6. Out-of-Sample Validation`);
  lines.push(``);
  lines.push(`**Overall result:** ${oos.passed ? "✅ PASSED" : "❌ FAILED"}`);
  lines.push(`**Overall score:** ${fmtScore(oos.overallScore)}/100`);
  lines.push(`**Avg efficiency ratio:** ${oos.avgEfficiencyRatio.toFixed(3)}`);
  lines.push(`**Avg degradation:** ${fmtScore(oos.avgDegradationPct)}%`);
  lines.push(``);
  lines.push(`| Split | Train PF | Test PF | Efficiency | Degradation | Result |`);
  lines.push(`|-------|---------|--------|-----------|------------|--------|`);
  for (const s of oos.splits) {
    lines.push(`| ${s.trainPct}/${s.testPct} | ${fmtScore(s.trainStats.profitFactor)} | ${fmtScore(s.testStats.profitFactor)} | ${s.efficiencyRatio.toFixed(3)} | ${pct(s.degradationPct)} | ${s.passed ? "✅" : "❌"} |`);
  }
  lines.push(``);

  if (oos.findings.length > 0) {
    lines.push(`**Findings:**`);
    for (const f of oos.findings) lines.push(`- ${f}`);
    lines.push(``);
  }
  lines.push(hr);
  lines.push(``);

  // ── 7. Confidence Stability ──────────────────────────────────────────────────
  lines.push(`## 7. Confidence Stability`);
  lines.push(``);
  lines.push(`**Status:** ${confidenceStability.stable ? "✅ Stable" : "⚠️ Unstable"}`);
  lines.push(`**Overall score:** ${fmtScore(confidenceStability.overallScore)}/100`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Simulation Runs | ${confidenceStability.runs} |`);
  lines.push(`| Avg Confidence | ${fmtScore(confidenceStability.avgConfidence)}% |`);
  lines.push(`| Std Deviation | ${fmtScore(confidenceStability.confidenceStdDev)} |`);
  lines.push(`| Coefficient of Variation | ${(confidenceStability.coefficientOfVariation * 100).toFixed(1)}% |`);
  lines.push(`| Max Confidence Swing | ${fmtScore(confidenceStability.maxConfidenceSwing)} |`);
  lines.push(`| Overreaction Events | ${confidenceStability.overreactionEvents} |`);
  lines.push(``);

  if (confidenceStability.findings.length > 0) {
    lines.push(`**Findings:**`);
    for (const f of confidenceStability.findings) lines.push(`- ${f}`);
    lines.push(``);
  }
  lines.push(hr);
  lines.push(``);

  // ── 8. All Findings ──────────────────────────────────────────────────────────
  lines.push(`## 8. Failure Scenarios & Findings`);
  lines.push(``);
  if (findings.length === 0) {
    lines.push(`_No findings recorded._`);
  } else {
    for (const f of findings) lines.push(`- ${f}`);
  }
  lines.push(``);
  lines.push(hr);
  lines.push(``);

  // ── 9. Recommendations ───────────────────────────────────────────────────────
  lines.push(`## 9. Recommended Threshold Adjustments & Actions`);
  lines.push(``);
  if (recommendations.length === 0) {
    lines.push(`_No recommendations recorded._`);
  } else {
    for (const r of recommendations) lines.push(`- ${r}`);
  }
  lines.push(``);
  lines.push(hr);
  lines.push(``);

  // ── Summary Table ────────────────────────────────────────────────────────────
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`| Component | Score | Status |`);
  lines.push(`|-----------|-------|--------|`);
  lines.push(`| Parameter Sensitivity | ${fmtScore(100 - sensitivity.overallSensitivityScore)}/100 | ${sensitivity.sensitiveParameters.length === 0 ? "✅ All stable" : `⚠️ ${sensitivity.sensitiveParameters.length} sensitive`} |`);
  lines.push(`| Market Stress | ${fmtScore(marketStress.overallRobustScore)}/100 | ${marketStress.overallRobustScore >= 65 ? "✅ Robust" : marketStress.overallRobustScore >= 45 ? "⚠️ Degraded" : "❌ Critical"} |`);
  lines.push(`| Execution Stress | ${fmtScore(executionStress.overallResilienceScore)}/100 | ${executionStress.overallResilienceScore >= 65 ? "✅ Resilient" : executionStress.overallResilienceScore >= 45 ? "⚠️ Degraded" : "❌ Critical"} |`);
  lines.push(`| Risk Stress | ${fmtScore(riskStress.overallResilienceScore)}/100 | ${riskStress.overallResilienceScore >= 65 ? "✅ Resilient" : riskStress.overallResilienceScore >= 45 ? "⚠️ Acceptable" : "❌ Fragile"} |`);
  lines.push(`| Walk-Forward | ${fmtScore(walkForward.overallScore)}/100 | ${walkForward.recommendation} |`);
  lines.push(`| Out-of-Sample | ${fmtScore(oos.overallScore)}/100 | ${oos.passed ? "✅ Passed" : "❌ Failed"} |`);
  lines.push(`| Confidence Stability | ${fmtScore(confidenceStability.overallScore)}/100 | ${confidenceStability.stable ? "✅ Stable" : "⚠️ Unstable"} |`);
  lines.push(`| **Overall Score** | **${score.overall}/100** | ${verdictBadge(score.verdict)} |`);
  lines.push(``);
  lines.push(`_Generated by TradeClone AI Robustness Engine_`);

  return lines.join("\n");
}
