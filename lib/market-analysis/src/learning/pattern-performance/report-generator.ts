// ─── Pattern Performance Report Generator ────────────────────────────────────
// Generates PatternReport objects and PATTERN_PERFORMANCE_REPORT.md markdown.
// Advisory only — all recommendations are observational, never auto-applied.

import type { PatternRecord, PatternReport } from "./types.js";
import { filterPatterns, rankPatterns } from "./pattern-analyzer.js";

export function generatePatternReport(
  patterns: PatternRecord[],
  version: string,
): PatternReport {
  const now = new Date();
  const sufficient = filterPatterns(patterns, { sufficientOnly: true });

  const bestByWinRate  = rankPatterns(sufficient, "win_rate").slice(0, 5);
  const worstByWinRate = rankPatterns(sufficient, "win_rate").reverse().slice(0, 5);

  const sessions = filterPatterns(sufficient, { category: "session" });
  const bestSessions  = rankPatterns(sessions, "win_rate").slice(0, 3);
  const worstSessions = rankPatterns(sessions, "win_rate").reverse().slice(0, 3);

  const regimes = filterPatterns(sufficient, { category: "regime" });
  const bestRegimes  = rankPatterns(regimes, "win_rate").slice(0, 3);
  const worstRegimes = rankPatterns(regimes, "win_rate").reverse().slice(0, 3);

  const highestConf = rankPatterns(sufficient, "confidence").slice(0, 5);
  const lowestConf  = rankPatterns(sufficient, "confidence").reverse().slice(0, 5);

  const significant = sufficient.filter(p =>
    p.stats.sampleSize >= 30 && p.evidence.statisticalConfidence >= 50,
  );

  const recommendations = buildRecommendations(sufficient);
  const markdownContent = buildMarkdown(
    now, version, patterns, sufficient,
    bestByWinRate, worstByWinRate,
    bestSessions, worstSessions,
    bestRegimes, worstRegimes,
    highestConf, lowestConf,
    significant, recommendations,
  );

  return {
    generatedAt: now,
    version,
    totalPatterns: patterns.length,
    sufficientPatterns: sufficient.length,
    bestByWinRate,
    worstByWinRate,
    bestSessions,
    worstSessions,
    bestRegimes,
    worstRegimes,
    highestConfidence: highestConf,
    lowestConfidence: lowestConf,
    significantPatterns: significant,
    recommendations,
    markdownContent,
  };
}

// ─── Recommendations ──────────────────────────────────────────────────────────

function buildRecommendations(sufficient: PatternRecord[]): string[] {
  const recs: string[] = [];

  // Worst pair by win rate (< 35%)
  const pairs = filterPatterns(sufficient, { category: "pair" });
  for (const p of pairs) {
    if (p.stats.winRate < 0.35) {
      recs.push(
        `Observe: ${p.key} shows a win rate of ${(p.stats.winRate * 100).toFixed(1)}% across ${p.stats.sampleSize} trades — well below 35%. Consider monitoring for regime-specific underperformance. (Advisory only)`,
      );
    }
  }

  // Best pair by win rate (> 65%)
  for (const p of pairs) {
    if (p.stats.winRate > 0.65 && p.stats.sampleSize >= 20) {
      recs.push(
        `Observe: ${p.key} shows a strong win rate of ${(p.stats.winRate * 100).toFixed(1)}% across ${p.stats.sampleSize} trades. Statistical confidence: ${p.evidence.statisticalConfidence.toFixed(1)}. (Advisory only)`,
      );
    }
  }

  // Worst session (< 30%)
  const sessions = filterPatterns(sufficient, { category: "session" });
  for (const p of sessions) {
    if (p.stats.winRate < 0.30) {
      recs.push(
        `Observe: ${p.description} shows a win rate of ${(p.stats.winRate * 100).toFixed(1)}% — below 30% threshold. Recommend monitoring session filter performance. (Advisory only)`,
      );
    }
  }

  // Regime with negative expectancy
  const regimes = filterPatterns(sufficient, { category: "regime" });
  for (const p of regimes) {
    if (p.stats.profitFactor < 1.0 && p.stats.expectancy < 0) {
      recs.push(
        `Observe: "${p.key}" regime shows negative expectancy (${p.stats.expectancy.toFixed(4)}) and profit factor below 1.0 (${p.stats.profitFactor.toFixed(2)}) across ${p.stats.sampleSize} trades. (Advisory only)`,
      );
    }
  }

  // Low zone quality underperforming
  const lowZone = sufficient.find(p => p.id === "zone_quality::low");
  if (lowZone && lowZone.stats.winRate < 0.40) {
    recs.push(
      `Observe: Low zone quality setups have a ${(lowZone.stats.winRate * 100).toFixed(1)}% win rate across ${lowZone.stats.sampleSize} trades — below the 40% threshold. (Advisory only)`,
    );
  }

  // Declining patterns
  const declining = sufficient.filter(p => p.trend.direction === "declining" && p.trend.directionConfidence >= 50);
  for (const p of declining.slice(0, 2)) {
    recs.push(
      `Trend alert: "${p.description}" shows a declining win rate (${p.trend.explanation}) (Advisory only)`,
    );
  }

  return recs.slice(0, 10);
}

// ─── Markdown Report ──────────────────────────────────────────────────────────

function fmtPct(v: number): string { return `${(v * 100).toFixed(1)}%`; }
function fmtN(v: number): string { return v.toFixed(2); }

function patternRow(p: PatternRecord): string {
  const wr = fmtPct(p.stats.winRate);
  const rr = fmtN(p.stats.avgRR);
  const conf = p.evidence.statisticalConfidence.toFixed(1);
  const n = p.stats.sampleSize;
  return `| ${p.description} | ${n} | ${wr} | ${rr} | ${conf} | ${p.trend.direction} |`;
}

function buildMarkdown(
  now: Date,
  version: string,
  all: PatternRecord[],
  sufficient: PatternRecord[],
  bestWR: PatternRecord[],
  worstWR: PatternRecord[],
  bestSess: PatternRecord[],
  worstSess: PatternRecord[],
  bestReg: PatternRecord[],
  worstReg: PatternRecord[],
  highConf: PatternRecord[],
  lowConf: PatternRecord[],
  significant: PatternRecord[],
  recs: string[],
): string {
  const header = `| Pattern | Sample Size | Win Rate | Avg R:R | Confidence | Trend |
|---------|-------------|----------|---------|------------|-------|`;

  return `# PATTERN PERFORMANCE REPORT

**Generated:** ${now.toISOString()}  
**Version:** ${version}  
**Status:** Advisory Only — No trading rules modified  

---

## Summary

| Metric | Value |
|--------|-------|
| Total Patterns Analyzed | ${all.length} |
| Patterns with Sufficient Evidence | ${sufficient.length} |
| Statistically Significant Patterns | ${significant.length} |

---

## Best Performing Patterns (by Win Rate)

${header}
${bestWR.map(patternRow).join("\n") || "_No sufficient evidence yet._"}

---

## Worst Performing Patterns (by Win Rate)

${header}
${worstWR.map(patternRow).join("\n") || "_No sufficient evidence yet._"}

---

## Session Performance

### Strongest Sessions

${header}
${bestSess.map(patternRow).join("\n") || "_No sufficient evidence yet._"}

### Weakest Sessions

${header}
${worstSess.map(patternRow).join("\n") || "_No sufficient evidence yet._"}

---

## Regime Performance

### Strongest Regimes

${header}
${bestReg.map(patternRow).join("\n") || "_No sufficient evidence yet._"}

### Weakest Regimes

${header}
${worstReg.map(patternRow).join("\n") || "_No sufficient evidence yet._"}

---

## Confidence Analysis

### Highest Confidence Patterns

${header}
${highConf.map(patternRow).join("\n") || "_No sufficient evidence yet._"}

### Lowest Confidence Patterns

${header}
${lowConf.map(patternRow).join("\n") || "_No sufficient evidence yet._"}

---

## Statistical Significance

Patterns with ≥ 30 trades and ≥ 50% statistical confidence:

${header}
${significant.map(patternRow).join("\n") || "_No statistically significant patterns yet._"}

---

## Recommendations for Future Observation

${recs.length > 0
    ? recs.map((r, i) => `${i + 1}. ${r}`).join("\n")
    : "_No actionable observations at this confidence level._"}

---

*All conclusions are advisory only. No trading rules, parameters, or filters have been modified.*  
*Sample sizes are always displayed alongside every statistical conclusion.*  
*Patterns with fewer than ${sufficient.length > 0 ? 5 : 5} trades are marked as "Insufficient historical evidence."*
`;
}
