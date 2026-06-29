// ─── World Model Report Generator ────────────────────────────────────────────
// Generates structured Markdown reports summarising world model findings.
// Observational only — no trade execution, no strategy modification.

import type {
  ComponentRelationship,
  MarketTransitionStats,
  InfluenceGraph,
  ScenarioResult,
  ModelHealth,
  WorldModelSummary,
} from "./types.js";
import { WORLD_MODEL_VERSION } from "./types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString();
}

function pct(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}

function bar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  return "[" + "█".repeat(filled) + "░".repeat(width - filled) + "]";
}

function strengthLabel(s: number): string {
  const abs = Math.abs(s);
  if (abs >= 0.6) return "Strong";
  if (abs >= 0.35) return "Moderate";
  if (abs >= 0.15) return "Weak";
  return "Negligible";
}

function formatRelationship(r: ComponentRelationship): string {
  const direction = r.strength >= 0 ? "+" : "-";
  return (
    `| ${r.sourceComponent.padEnd(22)} | ${r.targetComponent.padEnd(22)} | ` +
    `${r.relationshipType.padEnd(18)} | ${direction}${Math.abs(r.strength).toFixed(3)} | ` +
    `${r.confidence.toFixed(1).padStart(6)} | ${r.sampleSize.toString().padStart(6)} | ` +
    `${strengthLabel(r.strength).padEnd(10)} | ${r.isCausal ? "Yes" : "No "} |`
  );
}

function formatTransition(t: MarketTransitionStats): string {
  return (
    `| ${t.fromState.padEnd(18)} | ${t.toState.padEnd(18)} | ` +
    `${t.transitionCategory.padEnd(12)} | ${(t.transitionProbability * 100).toFixed(1).padStart(8)}% | ` +
    `${t.avgDurationBars.toFixed(1).padStart(8)} | ` +
    `${t.historicalFrequency.toString().padStart(6)} | ${t.confidence.toFixed(1).padStart(6)} |`
  );
}

// ─── World Model Report ────────────────────────────────────────────────────────

export function generateWorldModelReport(summary: WorldModelSummary): string {
  const { currentState: s, modelHealth: h } = summary;

  const statusEmoji = h.overallScore >= 70 ? "✅" : h.overallScore >= 45 ? "⚠️" : "❌";

  return `# MARKET WORLD MODEL REPORT
Generated: ${ts()}
Engine Version: ${WORLD_MODEL_VERSION}

---

## 1. Executive Summary

${statusEmoji} **Model Health Score: ${h.overallScore}/100**

The Market World Model provides a structured, statistically-grounded representation
of how market conditions interact and evolve. It is **observational and advisory only** —
it never generates trading signals, modifies strategy parameters, or executes trades.

| Dimension               | Score                         | Status                                      |
|-------------------------|-------------------------------|---------------------------------------------|
| Overall Health          | ${h.overallScore}/100         | ${bar(h.overallScore)}                      |
| Data Adequacy           | ${h.dataAdequacy}/100         | ${bar(h.dataAdequacy)}                      |
| Relationship Coverage   | ${h.relationshipCoverage}/100 | ${bar(h.relationshipCoverage)}              |
| Transition Coverage     | ${h.transitionCoverage}/100   | ${bar(h.transitionCoverage)}                |
| Memory Depth            | ${h.memoryDepth} snapshots    |                                             |

${h.issues.length > 0 ? "### Issues\n" + h.issues.map(i => `- ⚠️ ${i}`).join("\n") : "### No Issues Detected\nAll health checks passed."}

---

## 2. Current Market World State

| Component               | Value                     |
|-------------------------|---------------------------|
| Pair                    | ${s.pair}                 |
| Regime                  | ${s.regime}               |
| Trend                   | ${s.trend}                |
| Volatility              | ${s.volatilityClass}      |
| Liquidity               | ${s.liquidityQuality}     |
| Correlation Risk        | ${s.correlationRisk}      |
| News Environment        | ${s.newsEnvironment}      |
| Session                 | ${s.session}              |
| Spread Category         | ${s.spreadCategory}       |
| Market Structure        | ${s.marketStructure}      |
| Supply/Demand Quality   | ${s.supplyDemandQuality}  |
| Liquidity Sweeps        | ${s.liquiditySweeps}      |
| AMD Completion          | ${s.amdCompletion}        |
| Confirmation Quality    | ${s.confirmationQuality}  |
| Market Context Score    | ${s.marketContextScore}   |
| Stability Score         | ${s.stabilityScore}       |
| Regime Confidence       | ${s.regimeConfidence}     |

Active Transitions: ${s.activeTransitions.length === 0 ? "None" : s.activeTransitions.map(t =>
  `${t.fromState} → ${t.toState} (${t.category}, ${t.progressPercent.toFixed(0)}% complete)`
).join(", ")}

---

## 3. Architecture

### Core Components (13 Total)
1. **Market Regime** — Broad market environment (trending/ranging/volatile/low_volatility)
2. **Trend** — Price direction and strength
3. **Volatility** — ATR-based volatility classification
4. **Liquidity** — Market order book depth and participation
5. **Correlation** — Cross-pair relationship risk
6. **News Context** — Event-driven market environment
7. **Session** — Time-of-day institutional activity
8. **Spread** — Bid-ask spread category
9. **Market Structure** — BOS/CHoCH structural context
10. **Supply/Demand Quality** — Zone quality scoring
11. **Liquidity Sweeps** — Stop-hunt activity
12. **AMD Completion** — Accumulation/Manipulation/Distribution cycle stage
13. **Confirmation Quality** — Entry signal quality

### Engine Pipeline
1. Feature extraction from historical trade data
2. Pearson correlation analysis with lag detection (0, 1, 3 bars)
3. p-value filtering (p < 0.10) for statistical significance
4. Domain prior overlay for data-sparse edges
5. Directed influence graph construction (depth 1 + 2)
6. Transition state machine with probability estimation
7. Scenario simulation via bucket comparison analysis
8. Market memory storage for longitudinal tracking

---

## 4. Limitations

- Relationships derived from trade feature data may be incomplete if sample sizes are low.
- Correlation ≠ causation. Causal labelling requires lag > 0, confidence ≥ 75%, sample ≥ 50.
- Domain priors (zero sample size) represent market microstructure knowledge, not data-derived facts.
- Scenario simulation uses bucket comparison, not regression — suitable for directional guidance only.
- News and Correlation components currently rely on contextual encoding rather than live feeds.

---

## 5. Future AI Expansion

- Integration with live news NLP sentiment feed for real-time news component scoring
- Bayesian network upgrade for proper causal inference
- LSTM sequence modelling for transition timing prediction
- Cross-market regime coupling (DXY, Gold, indices)
- Reinforcement learning readiness detector (long-term roadmap only)

---

_This report is advisory only. No trading decisions should be made solely on this output._
`;
}

// ─── Relationship Report ───────────────────────────────────────────────────────

export function generateRelationshipReport(relationships: ComponentRelationship[]): string {
  const significant = relationships.filter(r => r.confidence >= 55);
  const causal = significant.filter(r => r.isCausal);

  const header = `| Source Component        | Target Component        | Type               | Strength | Conf % | Sample | Strength   | Causal |`;
  const sep    = `|-------------------------|-------------------------|--------------------|----------|--------|--------|------------|--------|`;

  return `# MARKET RELATIONSHIP REPORT
Generated: ${ts()}
Engine Version: ${WORLD_MODEL_VERSION}

---

## Summary

- **Total Relationships Detected**: ${relationships.length}
- **Statistically Significant (≥55% conf)**: ${significant.length}
- **Causal Relationships**: ${causal.length}
- **Pure Correlations**: ${significant.length - causal.length}

---

## Significant Relationships

${header}
${sep}
${significant.slice(0, 40).map(formatRelationship).join("\n")}

---

## Causal Relationships (High Confidence)

Causal relationships require: lag > 0, confidence ≥ 75%, sample ≥ 50.

${causal.length === 0 ? "_Insufficient data for causal inference. More historical trades needed._" :
  causal.map(r => `- **${r.sourceComponent} → ${r.targetComponent}** (${r.lagBars}b lag): ${r.evidenceSummary}`).join("\n")}

---

## Statistical Validation

- Minimum sample size: 20 observations
- Significance threshold: p < 0.10
- Minimum absolute correlation: |r| > 0.15
- Lag testing: 0, 1, 3 bars
- Multiple comparison correction: best-lag selection (not Bonferroni)

---

_Relationships reflect historical statistical patterns in trade feature data. They are observational only._
`;
}

// ─── Transition Report ────────────────────────────────────────────────────────

export function generateTransitionReport(transitions: MarketTransitionStats[]): string {
  const header = `| From State         | To State           | Category     | Prob (%) | Avg Bars | Count  | Conf % |`;
  const sep    = `|--------------------|--------------------|--------------|---------:|---------:|-------:|-------:|`;

  return `# MARKET TRANSITION REPORT
Generated: ${ts()}
Engine Version: ${WORLD_MODEL_VERSION}

---

## Summary

- **Total Transition Types Observed**: ${transitions.length}
- **Regime Transitions**: ${transitions.filter(t => t.transitionCategory === "regime").length}
- **Volatility Transitions**: ${transitions.filter(t => t.transitionCategory === "volatility").length}
- **Liquidity Transitions**: ${transitions.filter(t => t.transitionCategory === "liquidity").length}

---

## All Observed Transitions

${header}
${sep}
${transitions.map(formatTransition).join("\n")}

---

## Key Findings

${transitions.slice(0, 5).map(t =>
  `- **${t.fromState} → ${t.toState}** (${t.transitionCategory}): ` +
  `Occurs with ${pct(t.transitionProbability * 100)} probability, ` +
  `avg duration ${t.avgDurationBars.toFixed(0)} bars before transition. ` +
  `Confidence: ${t.confidence.toFixed(1)}%`
).join("\n")}

---

## Transition Categories

### Regime Transitions
Regime transitions (trending ↔ ranging ↔ volatile) typically take ${
  (() => {
    const r = transitions.filter(t => t.transitionCategory === "regime");
    return r.length > 0 ? r.reduce((s, t) => s + t.avgDurationBars, 0) / r.length : 0;
  })().toFixed(0)
} bars on average.

### Volatility Transitions
Compression → Expansion transitions are the most actionable structural events.

### Liquidity Transitions
High → Low liquidity shifts often coincide with off-session periods or news events.

---

_This report is advisory only. Transition probabilities are historical estimates, not guarantees._
`;
}

// ─── Scenario Report ──────────────────────────────────────────────────────────

export function generateScenarioReport(scenarios: ScenarioResult[]): string {
  return `# SCENARIO SIMULATION REPORT
Generated: ${ts()}
Engine Version: ${WORLD_MODEL_VERSION}

---

## Overview

This report presents observational scenario simulations answering questions such as:
- "What historically happens to liquidity when volatility increases?"
- "How has spread responded to news events?"

**All simulations are historical/observational only. No trading signals are generated.**

---

## Simulation Results

${scenarios.map((s, i) => `### Scenario ${i + 1}: ${s.query.triggerComponent} → ${s.query.affectedComponent}

**Query**: When \`${s.query.triggerComponent}\` changes by ${s.query.triggerMagnitude > 0 ? "+" : ""}${s.query.triggerMagnitude}%, what historically happens to \`${s.query.affectedComponent}\`?

| Metric                    | Value           |
|---------------------------|-----------------|
| Sample Size               | ${s.sampleSize} |
| Historical Mean Response  | ${s.historicalResponseMean.toFixed(3)} |
| Response Std Dev          | ${s.historicalResponseStd.toFixed(3)} |
| Min Response              | ${s.historicalResponseMin.toFixed(3)} |
| Max Response              | ${s.historicalResponseMax.toFixed(3)} |
| Confidence                | ${s.confidence.toFixed(1)}% |
| Response Time             | ~${s.responseTimeBars.toFixed(0)} bars |

${s.narrativeExplanation}
`).join("\n")}

---

## Limitations

- Simulations use bucket comparison, not regression modelling.
- Small sample sizes (<5) produce unreliable results.
- Historical patterns do not guarantee future outcomes.
- Correlation ≠ causation.

---

_This report is advisory only._
`;
}
