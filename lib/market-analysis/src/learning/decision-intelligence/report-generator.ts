// ─── Decision Intelligence Report Generator ───────────────────────────────────
// Generates DECISION_INTELLIGENCE_REPORT.md — a full written specification
// of the engine's scoring methodology and design.
// Advisory only — no trade execution.

import type { TradeIntelligenceReport } from "./types.js";
import { DI_ENGINE_VERSION, RECOMMENDATION_LEVELS, TIS_WEIGHTS } from "./types.js";

export function generateMarkdownReport(latestReport?: TradeIntelligenceReport): string {
  const lines: string[] = [];
  const now = new Date().toISOString().split("T")[0];

  lines.push(`# DECISION INTELLIGENCE REPORT`);
  lines.push(`\n**Generated:** ${now}  `);
  lines.push(`**Engine Version:** ${DI_ENGINE_VERSION}  `);
  lines.push(`**Advisory Only:** This engine NEVER executes trades or modifies strategy parameters.`);
  lines.push(`\n---\n`);

  // ─── Executive Summary
  lines.push(`## Executive Summary\n`);
  lines.push(`The KRYTOS Decision Intelligence Engine (DIE v${DI_ENGINE_VERSION}) evaluates every detected setup against full historical evidence and generates an explainable Trade Intelligence Report. The engine operates in a strictly advisory capacity — it produces recommendations for review only, never acting on them autonomously.\n`);
  lines.push(`**Core question answered:** "Given everything KRYTOS has learned, how does this setup compare to historical winners and losers?"\n`);

  // ─── Decision Pipeline
  lines.push(`## Decision Pipeline\n`);
  lines.push(`Every setup evaluation follows this 8-stage pipeline:\n`);
  lines.push(`\`\`\``);
  lines.push(`Current Market Snapshot`);
  lines.push(`        ↓`);
  lines.push(`Historical Pattern Lookup (cosine similarity matching)`);
  lines.push(`        ↓`);
  lines.push(`Feature Comparison (15 TIS components scored 0–100)`);
  lines.push(`        ↓`);
  lines.push(`Market Regime & Session Analysis`);
  lines.push(`        ↓`);
  lines.push(`Historical Performance Analysis (win rate, expectancy)`);
  lines.push(`        ↓`);
  lines.push(`Risk Context Analysis (spread, RR, volatility)`);
  lines.push(`        ↓`);
  lines.push(`Confidence Calculation (5-factor model)`);
  lines.push(`        ↓`);
  lines.push(`Trade Intelligence Report + Recommendation`);
  lines.push(`\`\`\``);
  lines.push(`\n`);

  // ─── Trade Intelligence Score
  lines.push(`## Trade Intelligence Score (TIS) — 0 to 100\n`);
  lines.push(`The TIS is a weighted composite of 15 individually-scored components. Every component is independently auditable.\n`);
  lines.push(`| # | Component | Weight | What it measures |`);
  lines.push(`|---|-----------|--------|-----------------|`);
  const componentDocs: [keyof typeof TIS_WEIGHTS, string][] = [
    ["patternPerformance",  "Historical win rate in the same session + regime combination"],
    ["historicalWinRate",   "Win rate across most-similar historical setups (cosine similarity)"],
    ["sampleSize",          "Adequacy of evidence — asymptotically scores toward 100 at 50+ samples"],
    ["featureImportance",   "Fraction of key setup features (zone, AMD, liquidity, confirmation) in favorable range"],
    ["confidenceScore",     "Average model confidence from historical trades on this pair"],
    ["marketRegimeMatch",   "Historical win rate when the current market regime was active"],
    ["sessionPerformance",  "Historical win rate for the current trading session"],
    ["pairPerformance",     "Overall historical win rate for this currency pair"],
    ["zoneQuality",         "Best of supply/demand quality score (0–100)"],
    ["liquidityQuality",    "Strength of the liquidity sweep preceding the setup"],
    ["amdQuality",          "Clarity of the AMD (Accumulation/Manipulation/Distribution) pattern"],
    ["confirmationQuality", "Quality of the confirmation candle at entry"],
    ["volatility",          "Historical win rate in the current volatility regime"],
    ["spread",              "Inverted spread score: lower spread = higher score (3+ pips = 0)"],
    ["dataQuality",         "Overall historical data volume (50+ trades = 100)"],
  ];
  componentDocs.forEach(([key, desc], i) => {
    const weight = TIS_WEIGHTS[key];
    lines.push(`| ${i+1} | ${key} | ${(weight*100).toFixed(0)}% | ${desc} |`);
  });
  lines.push(`\n**Total weight: 100%** — scores are fully reproducible from the same input data.\n`);

  // ─── Recommendation Levels
  lines.push(`## Recommendation Levels\n`);
  lines.push(`| Level | Label | TIS Range | Meaning |`);
  lines.push(`|-------|-------|-----------|---------|`);
  Object.entries(RECOMMENDATION_LEVELS).forEach(([key, meta]) => {
    const meanings: Record<string, string> = {
      exceptional:      "Setup aligns strongly with all historical success patterns",
      high_quality:     "Most indicators favor a positive outcome",
      good_opportunity: "More evidence for than against; warrants careful consideration",
      neutral:          "Mixed signals — historical evidence does not favor either direction",
      low_quality:      "More evidence against than for; proceed with extreme caution",
      avoid:            "Historical evidence strongly suggests avoiding this setup",
    };
    lines.push(`| ${key} | ${meta.label} | ${meta.minTis}–${meta.maxTis} | ${meanings[key]} |`);
  });
  lines.push(`\n`);

  // ─── Confidence Model
  lines.push(`## Confidence Model\n`);
  lines.push(`Confidence (0–100%) measures how certain we are about the TIS — distinct from the TIS itself.\n`);
  lines.push(`**5-factor weighted confidence model:**\n`);
  lines.push(`| Factor | Weight | Description |`);
  lines.push(`|--------|--------|-------------|`);
  lines.push(`| Historical Evidence | 30% | Sample size × Wilson lower bound on similar wins |`);
  lines.push(`| TIS Stability | 25% | Fraction of TIS components scoring above 55 |`);
  lines.push(`| Factor Agreement | 20% | Balance of positive vs negative evidence factors |`);
  lines.push(`| Setup Consistency | 15% | How uniformly all quality metrics score (low spread = more consistent) |`);
  lines.push(`| RR Adequacy | 10% | Planned Risk:Reward normalised to 0–1 |`);
  lines.push(`\n**Threshold:** Recommendations below 40% confidence are flagged as low-confidence.\n`);

  // ─── Similarity Architecture
  lines.push(`## Similarity Architecture\n`);
  lines.push(`Current implementation uses **12-dimensional normalized feature vectors** with weighted cosine similarity:\n`);
  lines.push(`\`\`\`\`\`\``);
  lines.push(`Vector dimensions:`);
  lines.push(`  [0] supplyQuality / 100`);
  lines.push(`  [1] demandQuality / 100`);
  lines.push(`  [2] liquidityScore / 100`);
  lines.push(`  [3] amdScore / 100`);
  lines.push(`  [4] confirmationQuality / 100`);
  lines.push(`  [5] setupScore / 100`);
  lines.push(`  [6] tqi / 100`);
  lines.push(`  [7] (rrPlanned − 0.5) / 4.5  → normalized RR`);
  lines.push(`  [8] 1 − spreadPips / 5        → inverted spread`);
  lines.push(`  [9] session encoding (london=1, new_york=0.7, asian=0.3)`);
  lines.push(`  [10] regime encoding (trending=1, ranging=0.5, other=0.2)`);
  lines.push(`  [11] volatility encoding (low=1, medium=0.5, high=0)`);
  lines.push(`\`\`\`\`\`\``);
  lines.push(`\nSimilarity threshold: 0.5 cosine similarity (50%+ feature alignment required).\n`);
  lines.push(`**Future upgrade path:** Feature vectors are persisted in \`di_similar_experiences.feature_vector\` (JSONB).`);
  lines.push(`When vector embeddings are added, the similarity search can be upgraded to use pgvector or a dedicated vector DB without schema changes.\n`);

  // ─── Explainability Design
  lines.push(`## Explainability Design\n`);
  lines.push(`Every recommendation includes:\n`);
  lines.push(`- **Trade Intelligence Score** with 15 individually auditable components`);
  lines.push(`- **Confidence Score** with 5-factor breakdown`);
  lines.push(`- **Historical Evidence Count** — number of similar setups in the dataset`);
  lines.push(`- **Similar Winning Patterns** — up to 5 most similar wins with similarity reason`);
  lines.push(`- **Similar Losing Patterns** — up to 5 most similar losses with similarity reason`);
  lines.push(`- **Strongest Positive Factors** — named evidence supporting the setup`);
  lines.push(`- **Strongest Negative Factors** — named evidence against the setup`);
  lines.push(`- **Statistical Expectancy** — avg(win_pnl) × winRate − avg(loss_pnl) × lossRate`);
  lines.push(`- **Reliability Rating** — institutional/strong/moderate/weak/insufficient`);
  lines.push(`- **Uncertainty Level** — very_low/low/moderate/high/very_high`);
  lines.push(`- **Validation Flags** — insufficient_evidence, low_confidence, conflicting_evidence, unstable_features, high_uncertainty\n`);
  lines.push(`**No black-box outputs.** Every number traces back to raw historical trades.\n`);

  // ─── Statistical Validation
  lines.push(`## Statistical Validation Safeguards\n`);
  lines.push(`1. **Minimum evidence gate** — recommendations flagged as insufficient below 3 similar setups`);
  lines.push(`2. **Wilson lower bound** — confidence intervals used instead of raw win rates`);
  lines.push(`3. **Conflict detection** — positive/negative factor balance checked for near-parity`);
  lines.push(`4. **Stability check** — TIS components with <3 evidence trades flagged as \`isInsufficient\``);
  lines.push(`5. **Uncertainty quantification** — 5-level uncertainty scale derived from confidence + evidence + conflict`);
  lines.push(`6. **Reproducibility guarantee** — same inputs always produce same TIS (no random elements)\n`);

  // ─── Recommendation Accuracy Tracking
  lines.push(`## Recommendation Accuracy Tracking\n`);
  lines.push(`Every recommendation stores its \`recommendationId\`. When a trade closes:\n`);
  lines.push(`- Final outcome (win/loss/break_even) is recorded against the recommendation`);
  lines.push(`- Accuracy is assessed: Positive recommendations (exceptional/high/good) are accurate when the trade wins`);
  lines.push(`- Accuracy rate is tracked overall and per-recommendation-level`);
  lines.push(`- History is persisted in \`di_recommendation_history\` for retrospective analysis\n`);

  // ─── Future AI Integration
  lines.push(`## Future AI Integration Points\n`);
  lines.push(`The engine is architected to support future AI enhancements without core changes:\n`);
  lines.push(`| Integration Point | Current | Future |`);
  lines.push(`|-------------------|---------|--------|`);
  lines.push(`| Similarity search | Cosine on 12-dim feature vectors | pgvector / Pinecone on learned embeddings |`);
  lines.push(`| Pattern matching | Rule-based regime/session grouping | Semantic cluster embeddings |`);
  lines.push(`| Factor extraction | Threshold-based rules | Attention weights from transformer |`);
  lines.push(`| Confidence model | 5-factor linear weighted | Bayesian calibrated neural confidence |`);
  lines.push(`| Expectancy estimate | Geometric average of similar trades | Monte Carlo with learned distributions |`);
  lines.push(`\n`);

  // ─── DB Schema
  lines.push(`## Database Schema\n`);
  lines.push(`| Table | Purpose |`);
  lines.push(`|-------|---------|`);
  lines.push(`| \`di_recommendations\` | One row per evaluated setup — full TIS, factors, evidence |`);
  lines.push(`| \`di_similar_experiences\` | Up to 5 wins + 5 losses per recommendation |`);
  lines.push(`| \`di_recommendation_history\` | Append-only audit log with outcome tracking |`);
  lines.push(`\n`);

  // ─── Latest Report (if available)
  if (latestReport) {
    lines.push(`## Latest Evaluated Setup\n`);
    lines.push(`**Pair:** ${latestReport.setup.pair} | **Session:** ${latestReport.setup.session} | **Regime:** ${latestReport.setup.regime}`);
    lines.push(`**TIS:** ${latestReport.tisScore.toFixed(1)}/100 → **${latestReport.recommendationLabel}**`);
    lines.push(`**Confidence:** ${latestReport.confidenceScore.toFixed(1)}% | **Evidence:** ${latestReport.historicalEvidenceCount} similar setups`);
    lines.push(`**Evaluated:** ${latestReport.evaluatedAt.toISOString()}`);
    lines.push(`\n`);
  }

  lines.push(`---\n`);
  lines.push(`_KRYTOS Decision Intelligence Engine v${DI_ENGINE_VERSION} — Advisory only. No trades are executed automatically._`);

  return lines.join("\n");
}
