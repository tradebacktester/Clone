// ─── Feature Importance Report Generator ──────────────────────────────────────
// Generates FEATURE_IMPORTANCE_REPORT.md and structured report objects.
// Advisory only — no trade execution, no strategy modification.

import type {
  FeatureImportanceResult,
  InteractionResult,
  FeatureRanking,
  FeatureImportanceReport,
} from "./types.js";
import { FI_ENGINE_VERSION } from "./types.js";
import { topFeatures, weakestFeatures, topInteractions, summarizeByCategory } from "./ranking-engine.js";

// ─── Main report generator ────────────────────────────────────────────────────

export function generateFeatureImportanceReport(
  features: FeatureImportanceResult[],
  interactions: InteractionResult[],
  sampleSize: number,
  overallConfidence: number,
): FeatureImportanceReport {
  const top     = topFeatures(features, 5);
  const weakest = weakestFeatures(features, 5);
  const bestInteractions = topInteractions(interactions, 5);

  const markdown = buildMarkdown(features, interactions, top, weakest, bestInteractions, sampleSize, overallConfidence);

  return {
    generatedAt: new Date(),
    version: FI_ENGINE_VERSION,
    sampleSize,
    totalFeaturesAnalyzed: features.length,
    sufficientFeatures: features.filter(f => !f.isInsufficient).length,
    markdownContent: markdown,
    topFeatures: top,
    weakestFeatures: weakest,
    bestInteractions,
    overallConfidence,
    methodology: METHODOLOGY,
  };
}

// ─── Markdown builder ─────────────────────────────────────────────────────────

function buildMarkdown(
  features: FeatureImportanceResult[],
  interactions: InteractionResult[],
  top: FeatureRanking[],
  weakest: FeatureRanking[],
  bestInteractions: InteractionResult[],
  sampleSize: number,
  overallConfidence: number,
): string {
  const now = new Date().toISOString().slice(0, 10);
  const sufficient = features.filter(f => !f.isInsufficient);
  const catSummary = summarizeByCategory(features);

  const confidenceLabel =
    overallConfidence >= 75 ? "High" :
    overallConfidence >= 50 ? "Moderate" :
    overallConfidence >= 25 ? "Low" : "Insufficient";

  let md = `# FEATURE IMPORTANCE REPORT\n\n`;
  md += `**Generated:** ${now}  \n`;
  md += `**Engine Version:** ${FI_ENGINE_VERSION}  \n`;
  md += `**Sample Size:** ${sampleSize} trades  \n`;
  md += `**Features Analyzed:** ${features.length} (${sufficient.length} with sufficient data)  \n`;
  md += `**Overall Confidence:** ${overallConfidence.toFixed(1)}% (${confidenceLabel})  \n`;
  md += `**Advisory Only:** This report never modifies trading behavior.\n\n`;
  md += `---\n\n`;

  // ── 1. Top Contributing Features ─
  md += `## 1. Top Contributing Features\n\n`;
  if (top.length === 0) {
    md += `_No features with sufficient data yet. Log more trades to enable analysis._\n\n`;
  } else {
    md += `| Rank | Feature | Predictive Value | Confidence | Reliability | Sample Size |\n`;
    md += `|------|---------|-----------------|------------|-------------|-------------|\n`;
    for (const r of top) {
      const rel = r.isInsufficient ? "—" : r.reliabilityRating;
      md += `| ${r.rank} | ${r.displayName} | ${r.predictiveValue.toFixed(1)}/100 | ${r.confidenceScore.toFixed(1)}% | ${rel} | ${r.sampleSize} |\n`;
    }
    md += `\n`;
    for (const f of features.filter(f => top.some(t => t.featureId === f.featureId))) {
      md += `### ${f.displayName}\n`;
      md += `${f.confidenceExplanation}\n\n`;
    }
  }

  // ── 2. Weakest Features ─
  md += `## 2. Weakest Features\n\n`;
  if (weakest.length === 0) {
    md += `_Insufficient data to identify weak features._\n\n`;
  } else {
    md += `| Rank | Feature | Predictive Value | Confidence | Overfitting Risk | Sample Size |\n`;
    md += `|------|---------|-----------------|------------|-----------------|-------------|\n`;
    for (const r of weakest) {
      const feat = features.find(f => f.featureId === r.featureId);
      const risk = feat?.overfittingRisk ?? "—";
      md += `| ${r.rank} | ${r.displayName} | ${r.predictiveValue.toFixed(1)}/100 | ${r.confidenceScore.toFixed(1)}% | ${risk} | ${r.sampleSize} |\n`;
    }
    md += `\n`;
  }

  // ── 3. Strongest Feature Combinations ─
  md += `## 3. Strongest Feature Combinations\n\n`;
  const synergeticInteractions = interactions.filter(i => i.isSynergistic && !i.isInsufficient);
  if (synergeticInteractions.length === 0) {
    md += `_No synergistic combinations identified yet. More data needed._\n\n`;
  } else {
    md += `| Combination | Win Rate | Synergy Score | Lift vs A | Lift vs B | Sample Size |\n`;
    md += `|-------------|----------|--------------|-----------|-----------|-------------|\n`;
    for (const i of bestInteractions.filter(i => i.isSynergistic)) {
      md += `| ${i.displayName} | ${(i.winRate * 100).toFixed(1)}% | ${i.synergyScore.toFixed(1)}/100 | ${i.liftVsFeatureA.toFixed(2)}x | ${i.liftVsFeatureB.toFixed(2)}x | ${i.sampleSize} |\n`;
    }
    md += `\n`;
    for (const i of bestInteractions.filter(i => i.isSynergistic)) {
      md += `### ${i.displayName}\n`;
      md += `${i.description}  \n`;
      md += `Combination win rate: **${(i.winRate * 100).toFixed(1)}%** vs Feature A baseline: ${(i.baselineWinRateA * 100).toFixed(1)}%, Feature B baseline: ${(i.baselineWinRateB * 100).toFixed(1)}%.  \n`;
      md += `Synergy score: **${i.synergyScore.toFixed(1)}/100**. Sample size: ${i.sampleSize} trades.\n\n`;
    }
  }

  // ── 4. Full Feature Rankings Table ─
  md += `## 4. Full Feature Rankings\n\n`;
  md += `| Rank | Feature | Category | Predictive Value | Win Rate | Confidence | Reliability | Status |\n`;
  md += `|------|---------|----------|-----------------|----------|------------|-------------|--------|\n`;
  const ranked = [...features].sort((a, b) => {
    if (a.isInsufficient && !b.isInsufficient) return 1;
    if (!a.isInsufficient && b.isInsufficient) return -1;
    return b.predictiveValue - a.predictiveValue;
  });
  for (let i = 0; i < ranked.length; i++) {
    const f = ranked[i];
    const status = f.isInsufficient ? "⚠ Insufficient" : f.hasContradiction ? "⚡ Contradiction" : f.isUnstable ? "〰 Unstable" : "✓ Valid";
    md += `| ${i + 1} | ${f.displayName} | ${f.category} | ${f.predictiveValue.toFixed(1)} | ${(f.winRate * 100).toFixed(1)}% | ${f.confidenceScore.toFixed(1)}% | ${f.reliabilityRating} | ${status} |\n`;
  }
  md += `\n`;

  // ── 5. Confidence Analysis ─
  md += `## 5. Confidence Analysis\n\n`;
  md += `Overall system confidence: **${overallConfidence.toFixed(1)}%** (${confidenceLabel})\n\n`;
  md += `### Confidence Methodology\n\n${METHODOLOGY}\n\n`;
  md += `### Per-Category Summary\n\n`;
  md += `| Category | Features | Sufficient | Avg Predictive Value | Avg Confidence | Top Feature |\n`;
  md += `|----------|----------|------------|---------------------|----------------|-------------|\n`;
  for (const cat of catSummary) {
    md += `| ${cat.category} | ${cat.total} | ${cat.sufficient} | ${cat.avgPredictiveValue.toFixed(1)} | ${cat.avgConfidence.toFixed(1)}% | ${cat.topFeature ?? "—"} |\n`;
  }
  md += `\n`;

  // ── 6. Statistical Evidence ─
  md += `## 6. Statistical Evidence\n\n`;
  md += `### Validation Flags\n\n`;
  const contradictions = features.filter(f => f.hasContradiction);
  const unstable = features.filter(f => f.isUnstable);
  const overfitting = features.filter(f => f.overfittingRisk === "high" || f.overfittingRisk === "medium");
  if (contradictions.length > 0) {
    md += `**Contradictions detected** (${contradictions.length}):\n`;
    for (const f of contradictions) md += `- ${f.displayName}: ${f.contradictionNote}\n`;
    md += `\n`;
  }
  if (unstable.length > 0) {
    md += `**Unstable features** (${unstable.length}):\n`;
    for (const f of unstable) md += `- ${f.displayName}: ${f.instabilityNote}\n`;
    md += `\n`;
  }
  if (overfitting.length > 0) {
    md += `**Overfitting risk features** (${overfitting.length}):\n`;
    for (const f of overfitting) md += `- ${f.displayName} [${f.overfittingRisk} risk]: n=${f.sampleSize}, predictive value=${f.predictiveValue.toFixed(1)}\n`;
    md += `\n`;
  }
  if (contradictions.length === 0 && unstable.length === 0 && overfitting.length === 0) {
    md += `_No significant validation issues detected._\n\n`;
  }

  // ── 7. Reliability Assessment ─
  md += `## 7. Reliability Assessment\n\n`;
  const institutional = features.filter(f => f.reliabilityRating === "institutional");
  const strong = features.filter(f => f.reliabilityRating === "strong");
  const moderate = features.filter(f => f.reliabilityRating === "moderate");
  const weak = features.filter(f => f.reliabilityRating === "weak");
  const insuf = features.filter(f => f.reliabilityRating === "insufficient");
  md += `| Rating | Count | Features |\n`;
  md += `|--------|-------|---------|\n`;
  md += `| Institutional | ${institutional.length} | ${institutional.map(f => f.displayName).join(", ") || "—"} |\n`;
  md += `| Strong | ${strong.length} | ${strong.map(f => f.displayName).join(", ") || "—"} |\n`;
  md += `| Moderate | ${moderate.length} | ${moderate.map(f => f.displayName).join(", ") || "—"} |\n`;
  md += `| Weak | ${weak.length} | ${weak.map(f => f.displayName).join(", ") || "—"} |\n`;
  md += `| Insufficient | ${insuf.length} | ${insuf.map(f => f.displayName).join(", ") || "—"} |\n`;
  md += `\n`;

  // ── 8. Interaction Matrix Summary ─
  md += `## 8. Interaction Analysis\n\n`;
  md += `| Combination | Synergy Score | Win Rate | Sufficient Data |\n`;
  md += `|-------------|--------------|----------|----------------|\n`;
  for (const i of interactions.sort((a, b) => b.synergyScore - a.synergyScore).slice(0, 10)) {
    const suf = i.isInsufficient ? "No" : "Yes";
    md += `| ${i.displayName} | ${i.synergyScore.toFixed(1)} | ${(i.winRate * 100).toFixed(1)}% | ${suf} |\n`;
  }
  md += `\n`;

  // ── 9. Suggested Areas for Future Study ─
  md += `## 9. Suggested Areas for Future Study\n\n`;
  const suggestions: string[] = [];
  const insuffFeatures = features.filter(f => f.isInsufficient);
  if (insuffFeatures.length > 0) {
    suggestions.push(`**Increase sample size** for ${insuffFeatures.length} features that currently lack sufficient data: ${insuffFeatures.slice(0, 3).map(f => f.displayName).join(", ")}${insuffFeatures.length > 3 ? " and others" : ""}.`);
  }
  if (synergeticInteractions.length === 0) {
    suggestions.push(`**Interaction analysis** has insufficient data — log more trades to identify synergistic feature combinations.`);
  }
  const highRisk = features.filter(f => f.overfittingRisk === "high");
  if (highRisk.length > 0) {
    suggestions.push(`**Re-evaluate high overfitting risk features** once more trades are available: ${highRisk.map(f => f.displayName).join(", ")}.`);
  }
  const lowPredictive = sufficient.filter(f => f.predictiveValue < 20);
  if (lowPredictive.length > 0) {
    suggestions.push(`**Investigate low-predictive features** (${lowPredictive.map(f => f.displayName).join(", ")}) — consider whether they add value to the strategy.`);
  }
  suggestions.push(`**Temporal analysis**: Compare feature importance across different time periods to detect market regime shifts.`);
  suggestions.push(`**Extended interaction analysis**: Test 3-way feature combinations once 2-way interactions are validated.`);

  for (const s of suggestions) md += `- ${s}\n`;
  md += `\n`;

  md += `---\n\n`;
  md += `_This report is advisory only. No trading parameters are modified by this analysis._  \n`;
  md += `_Engine: KRYTOS Feature Importance Engine v${FI_ENGINE_VERSION} | Generated: ${now}_\n`;

  return md;
}

const METHODOLOGY = `
The Feature Importance Engine uses statistical methods to measure the predictive value of each trading strategy component:

1. **Point-biserial correlation**: Measures the linear relationship between a continuous feature value and trade outcome (win=1, loss=0). Ranges from -1 to +1.
2. **Chi-square significance**: Measures whether the distribution of outcomes differs significantly across feature buckets. Higher = more significant.
3. **Wilson Score Lower Bound (90% CI)**: Conservative lower bound on the true win rate, accounting for sample size. Prevents overconfidence on small samples.
4. **Bucket analysis**: Features are divided into Low/Medium/High buckets (or categorical groups) and win rates are computed per bucket.
5. **Predictive Value (0–100)**: Composite of correlation strength (40%), statistical significance (35%), and sample adequacy (25%).
6. **Reliability Score (0–100)**: Wilson lower bound × consistency factor (stability of win rates across buckets).
7. **Confidence Score (0–100)**: Blends predictive value, reliability, significance, and sample adequacy.
8. **Minimum evidence threshold**: Conclusions are flagged as insufficient below ${5} samples per feature.

All scores are reproducible from the same input data. No neural networks or RL agents are used.
`.trim();
