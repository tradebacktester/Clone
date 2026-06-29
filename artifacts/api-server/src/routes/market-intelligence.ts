// ─── Unified Market Intelligence API Routes ────────────────────────────────────
// Advisory only. No trade execution. No strategy modification.
// All routes define paths WITHOUT /api prefix (app mounts at /api).

import { Router } from "express";
import { db } from "@workspace/db";
import {
  marketIntelligenceReportsTable,
  marketHealthScoresTable,
  marketOpportunityScoresTable,
  marketRiskAssessmentsTable,
  marketOutlookTable,
  learningFeaturesTable,
} from "@workspace/db";
import { desc, gte } from "drizzle-orm";
import {
  generateIntelligenceReport,
  computeHealthScore,
  computeOpportunityScore,
  assessMarketRisk,
  compareHistorical,
  generateOutlook,
  UNIFIED_INTELLIGENCE_VERSION,
} from "@workspace/market-analysis";
import * as fs from "fs";
import * as path from "path";

const router = Router();

// ─── Helper: load feature rows ─────────────────────────────────────────────────

async function loadFeatureRows(limit = 500, pair?: string) {
  let query = db
    .select()
    .from(learningFeaturesTable)
    .orderBy(desc(learningFeaturesTable.extractedAt))
    .limit(limit)
    .$dynamic();

  if (pair) {
    const { eq } = await import("drizzle-orm");
    query = query.where(eq(learningFeaturesTable.pair, pair));
  }

  const rows = await query;

  return rows.reverse().map(r => ({
    pair: r.pair,
    session: r.session,
    marketRegime: r.marketRegime,
    trend: r.trend ?? "unknown",
    supplyQuality: Number(r.supplyQuality),
    demandQuality: Number(r.demandQuality),
    liquidityScore: Number(r.liquidityScore),
    amdScore: Number(r.amdScore),
    confirmationQuality: Number(r.confirmationQuality),
    setupScore: Number(r.setupScore),
    tqi: Number(r.tqi),
    spreadPips: Number(r.spreadPips),
    volatility: (r.volatility ?? "medium") as "low" | "medium" | "high",
    outcome: r.outcome,
    pnl: Number(r.pnl ?? 0),
    confidence: Number(r.confidence),
    patternType: "unknown",
    entryTime: r.openedAt ? new Date(r.openedAt) : new Date(),
  }));
}

// ─── GET /market/intelligence ──────────────────────────────────────────────────
// Full unified intelligence report — primary endpoint.

router.get("/market/intelligence", async (req, res) => {
  try {
    const pair = (req.query.pair as string) ?? "EURUSD";
    const features = await loadFeatureRows(500, pair);
    const report = generateIntelligenceReport(features, pair);

    // Persist to DB
    await db.insert(marketIntelligenceReportsTable).values({
      pair,
      engineVersion: UNIFIED_INTELLIGENCE_VERSION,
      regime: report.regime,
      trendDirection: report.unifiedState.marketSummary.trendDirection,
      trendStrength: report.unifiedState.marketSummary.trendStrength.toString(),
      trendAge: report.unifiedState.marketSummary.trendAge,
      volatilityLevel: report.unifiedState.marketSummary.volatilityLevel,
      liquidityQuality: report.unifiedState.marketSummary.liquidityQuality,
      correlationState: report.unifiedState.marketSummary.correlationState,
      newsContext: report.unifiedState.marketSummary.newsContext,
      session: report.unifiedState.marketSummary.session,
      spread: report.unifiedState.marketSummary.spread,
      marketStability: report.unifiedState.marketSummary.marketStability.toString(),
      healthScore: report.healthScore,
      opportunityScore: report.opportunityScore,
      riskLevel: report.riskLevel,
      overallConfidence: report.confidence,
      historicalSimilarityScore: report.unifiedState.historicalContext.similarityScore.toString(),
      similarMarketsCount: report.unifiedState.historicalContext.similarMarketsCount,
      historicalWinRate: (report.unifiedState.historicalContext.winRate * 100).toString(),
      historicalProfitFactor: report.unifiedState.historicalContext.profitFactor.toString(),
      historicalExpectancy: report.unifiedState.historicalContext.expectancy.toString(),
      historicalDrawdown: report.unifiedState.historicalContext.drawdown.toString(),
      fullReport: report as unknown as Record<string, unknown>,
    }).onConflictDoNothing();

    res.json({
      success: true,
      pair,
      version: UNIFIED_INTELLIGENCE_VERSION,
      featureCount: features.length,
      report,
    });
  } catch (err) {
    console.error("[market-intelligence] GET /market/intelligence error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── GET /market/health ────────────────────────────────────────────────────────

router.get("/market/health", async (req, res) => {
  try {
    const pair = (req.query.pair as string) ?? "EURUSD";
    const features = await loadFeatureRows(500, pair);
    const health = computeHealthScore(features);

    // Persist
    const componentWeights: Record<string, number> = {};
    for (const [k, v] of Object.entries(health.components)) {
      componentWeights[k] = v.weight;
    }
    await db.insert(marketHealthScoresTable).values({
      pair,
      overallScore: health.overall,
      stabilityScore: health.components.stability.score,
      liquidityScore: health.components.liquidity.score,
      volatilityScore: health.components.volatility.score,
      correlationScore: health.components.correlation.score,
      newsRiskScore: health.components.newsRisk.score,
      trendQualityScore: health.components.trendQuality.score,
      historicalReliabilityScore: health.components.historicalReliability.score,
      dataQualityScore: health.components.dataQuality.score,
      componentWeights: componentWeights as unknown as Record<string, unknown>,
      grade: health.grade,
      interpretation: health.interpretation,
    }).onConflictDoNothing();

    res.json({
      success: true,
      pair,
      featureCount: features.length,
      health,
      computedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[market-intelligence] GET /market/health error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── GET /market/opportunity ───────────────────────────────────────────────────

router.get("/market/opportunity", async (req, res) => {
  try {
    const pair = (req.query.pair as string) ?? "EURUSD";
    const features = await loadFeatureRows(500, pair);
    const opportunity = computeOpportunityScore(features);

    // Persist
    await db.insert(marketOpportunityScoresTable).values({
      pair,
      overallScore: opportunity.overall,
      regimeScore: opportunity.factors.regime.score,
      trendScore: opportunity.factors.trend.score,
      liquidityScore: opportunity.factors.liquidity.score,
      volatilityScore: opportunity.factors.volatility.score,
      historicalScore: opportunity.factors.historical.score,
      stabilityScore: opportunity.factors.stability.score,
      confidenceScore: opportunity.factors.confidence.score,
      label: opportunity.label,
      reasoning: opportunity.reasoning,
      factorWeights: Object.fromEntries(
        Object.entries(opportunity.factors).map(([k, v]) => [k, v.weight])
      ) as unknown as Record<string, unknown>,
    }).onConflictDoNothing();

    res.json({
      success: true,
      pair,
      featureCount: features.length,
      opportunity,
      note: "Non-directional. Does not indicate buy or sell.",
      computedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[market-intelligence] GET /market/opportunity error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── GET /market/risk ──────────────────────────────────────────────────────────

router.get("/market/risk", async (req, res) => {
  try {
    const pair = (req.query.pair as string) ?? "EURUSD";
    const features = await loadFeatureRows(500, pair);
    const risk = assessMarketRisk(features);

    // Persist
    await db.insert(marketRiskAssessmentsTable).values({
      pair,
      overallRisk: risk.overall,
      volatilityRisk: risk.dimensions.volatility.level,
      liquidityRisk: risk.dimensions.liquidity.level,
      correlationRisk: risk.dimensions.correlation.level,
      newsRisk: risk.dimensions.news.level,
      sessionRisk: risk.dimensions.session.level,
      spreadRisk: risk.dimensions.spread.level,
      volatilityRiskScore: risk.dimensions.volatility.score,
      liquidityRiskScore: risk.dimensions.liquidity.score,
      correlationRiskScore: risk.dimensions.correlation.score,
      newsRiskScore: risk.dimensions.news.score,
      sessionRiskScore: risk.dimensions.session.score,
      spreadRiskScore: risk.dimensions.spread.score,
      evidence: risk.evidence as unknown as Record<string, unknown>,
    }).onConflictDoNothing();

    res.json({
      success: true,
      pair,
      featureCount: features.length,
      risk,
      computedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[market-intelligence] GET /market/risk error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── GET /market/outlook ───────────────────────────────────────────────────────

router.get("/market/outlook", async (req, res) => {
  try {
    const pair = (req.query.pair as string) ?? "EURUSD";
    const features = await loadFeatureRows(500, pair);
    const outlook = generateOutlook(features);

    // Persist
    await db.insert(marketOutlookTable).values({
      pair,
      primaryOutlook: outlook.primary.description,
      primaryProbability: outlook.primary.probability.toString(),
      alternativeOutlook: outlook.alternative.description,
      alternativeProbability: outlook.alternative.probability.toString(),
      transitionProbability: outlook.transitionProbability.toString(),
      expectedDurationBars: outlook.expectedDurationBars,
      confidence: outlook.confidence,
      supportingEvidence: outlook.supportingEvidence as unknown as Record<string, unknown>,
      historicalBasis: outlook.historicalBasis,
      scenarios: outlook.allScenarios as unknown as Record<string, unknown>,
    }).onConflictDoNothing();

    res.json({
      success: true,
      pair,
      featureCount: features.length,
      outlook,
      note: "Statistical outlook based on historically observed behavior. No price levels are forecast.",
      computedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[market-intelligence] GET /market/outlook error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── GET /market/report ────────────────────────────────────────────────────────
// Generate and persist full report; also write Markdown reports to disk.

router.get("/market/report", async (req, res) => {
  try {
    const pair = (req.query.pair as string) ?? "EURUSD";
    const features = await loadFeatureRows(500, pair);
    const report = generateIntelligenceReport(features, pair);

    // Write markdown reports
    const reportsDir = path.join(process.cwd(), "reports");
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const now = new Date().toISOString();
    const h = report.unifiedState.healthScore;
    const o = report.unifiedState.opportunityScore;
    const r = report.unifiedState.riskAssessment;
    const hs = report.unifiedState.historicalContext;
    const ol = report.unifiedState.outlook;
    const s = report.unifiedState.marketSummary;

    // MARKET_INTELLIGENCE_REPORT.md
    const intelligenceReport = `# MARKET INTELLIGENCE REPORT
_Generated: ${now}_
_Engine Version: ${UNIFIED_INTELLIGENCE_VERSION}_
_Pair: ${pair}_

## Executive Summary
${report.reportSummary}

## Market Summary
| Dimension | Value |
|-----------|-------|
| Regime | ${s.regime} |
| Trend Direction | ${s.trendDirection} |
| Trend Strength | ${s.trendStrength}/100 |
| Trend Age | ${s.trendAge} bars |
| Volatility | ${s.volatilityLevel} |
| Liquidity | ${s.liquidityQuality} |
| Correlation | ${s.correlationState} |
| News Context | ${s.newsContext} |
| Session | ${s.session} |
| Spread | ${s.spread} |
| Stability | ${s.marketStability}/100 |

## Key Findings
${report.keyFindings.map(f => `- ${f}`).join("\n")}

## Health Score: ${h.overall}/100 (Grade: ${h.grade})
${h.interpretation}

### Component Breakdown
${Object.entries(h.components).map(([k, v]) =>
  `| ${v.label} | ${v.score}/100 | Weight: ${(v.weight * 100).toFixed(0)}% |`
).join("\n")}

## Opportunity Score: ${o.overall}/100 (${o.label})
${o.reasoning}
> **Note:** ${o.note}

## Risk Assessment: ${r.overall}
| Dimension | Level | Score |
|-----------|-------|-------|
${Object.entries(r.dimensions).map(([k, v]) =>
  `| ${k} | ${v.level} | ${v.score}/100 |`
).join("\n")}

## Historical Context
- Similar Markets Found: ${hs.similarMarketsCount}
- Historical Win Rate: ${(hs.winRate * 100).toFixed(1)}%
- Historical Profit Factor: ${hs.profitFactor.toFixed(2)}
- Historical Expectancy: ${hs.expectancy.toFixed(4)} R
- Historical Drawdown: ${hs.drawdown.toFixed(1)}%
- Historical Confidence: ${hs.confidence}/100

## Market Outlook
**Primary:** ${ol.primary.description}
- Probability: ${(ol.primary.probability * 100).toFixed(0)}%
- Confidence: ${ol.primary.confidence}/100

**Alternative:** ${ol.alternative.description}
- Probability: ${(ol.alternative.probability * 100).toFixed(0)}%

**Transition Probability:** ${(ol.transitionProbability * 100).toFixed(0)}%

## Data Quality
- Data Quality: ${report.dataQuality}
- Feature Count: ${features.length}
- Overall Confidence: ${report.confidence}/100

## Phase 5 Readiness
${report.readinessForPhase5 ? "✅ Ready for Phase 5 (Strategy Intelligence)" : "⚠️ Not yet ready — increase data coverage"}

---
_Advisory only. No trade execution. No strategy modification._
`;

    fs.writeFileSync(path.join(reportsDir, "MARKET_INTELLIGENCE_REPORT.md"), intelligenceReport);

    // MARKET_HEALTH_REPORT.md
    const healthReport = `# MARKET HEALTH REPORT
_Generated: ${now}_

## Executive Summary
Market health grade: **${h.grade}** (${h.overall}/100). ${h.interpretation}

## Architecture
The Market Health Score is computed from 8 transparent, weighted components:

| Component | Weight | Score | Label |
|-----------|--------|-------|-------|
${Object.entries(h.components).map(([k, v]) =>
  `| ${v.label} | ${(v.weight * 100).toFixed(0)}% | ${v.score}/100 | ${k} |`
).join("\n")}

## Statistical Validation
- All weights sum to 100% (verified at implementation).
- Each component is independently computable and observable.
- Scores bounded to [0, 100] with no silent clamping.

## Performance
- Computed from ${features.length} feature observations.
- Computation is O(n) per component.

## Production Readiness
${h.overall >= 60 ? "✅ Health score acceptable for production monitoring." : "⚠️ Health score below optimal threshold."}

---
_Advisory only. No trade execution._
`;
    fs.writeFileSync(path.join(reportsDir, "MARKET_HEALTH_REPORT.md"), healthReport);

    // MARKET_OPPORTUNITY_REPORT.md
    const oppReport = `# MARKET OPPORTUNITY REPORT
_Generated: ${now}_

## Executive Summary
Opportunity score: **${o.overall}/100** (${o.label}).
${o.reasoning}

## IMPORTANT NOTICE
> **${o.note}**

## Factor Breakdown
| Factor | Score | Weight | Description |
|--------|-------|--------|-------------|
${Object.entries(o.factors).map(([k, v]) =>
  `| ${k} | ${v.score}/100 | ${(v.weight * 100).toFixed(0)}% | ${v.description.slice(0, 80)}... |`
).join("\n")}

## Statistical Validation
- All factors have transparent weights summing to 100%.
- Historical performance data drives the Historical factor.
- Score is non-directional by design.

---
_Advisory only. No trade execution._
`;
    fs.writeFileSync(path.join(reportsDir, "MARKET_OPPORTUNITY_REPORT.md"), oppReport);

    // MARKET_OUTLOOK_REPORT.md
    const outlookReport = `# MARKET OUTLOOK REPORT
_Generated: ${now}_

## Executive Summary
Statistical market outlook based on ${features.length} historical observations.
No price levels are forecast. Only historically observed behavior is described.

## Primary Scenario (${(ol.primary.probability * 100).toFixed(0)}% probability)
${ol.primary.description}
- Confidence: ${ol.primary.confidence}/100
- Historical basis: ${ol.primary.historicalBasis}

## Alternative Scenario (${(ol.alternative.probability * 100).toFixed(0)}% probability)
${ol.alternative.description}
- Confidence: ${ol.alternative.confidence}/100

## Transition Analysis
- Transition probability: ${(ol.transitionProbability * 100).toFixed(0)}%
- Expected remaining duration: ${ol.expectedDurationBars} bars

## Supporting Evidence
${ol.supportingEvidence.map(e => `- ${e}`).join("\n")}

## Statistical Validation
- Outlook based on ${features.length} historical feature observations.
- Transition probabilities derived from observed regime change patterns.
- No Monte Carlo or price-level forecasting is performed.

---
_Advisory only. No trade execution. No price forecasting._
`;
    fs.writeFileSync(path.join(reportsDir, "MARKET_OUTLOOK_REPORT.md"), outlookReport);

    res.json({
      success: true,
      pair,
      engineVersion: UNIFIED_INTELLIGENCE_VERSION,
      report,
      reportsGenerated: [
        "MARKET_INTELLIGENCE_REPORT.md",
        "MARKET_HEALTH_REPORT.md",
        "MARKET_OPPORTUNITY_REPORT.md",
        "MARKET_OUTLOOK_REPORT.md",
      ],
    });
  } catch (err) {
    console.error("[market-intelligence] GET /market/report error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── GET /market/history ───────────────────────────────────────────────────────
// Recent historical intelligence reports.

router.get("/market/history", async (req, res) => {
  try {
    const pair = (req.query.pair as string) ?? "EURUSD";
    const limit = Math.min(100, Number(req.query.limit ?? 50));

    const reports = await db
      .select()
      .from(marketIntelligenceReportsTable)
      .orderBy(desc(marketIntelligenceReportsTable.generatedAt))
      .limit(limit);

    const healthHistory = await db
      .select()
      .from(marketHealthScoresTable)
      .orderBy(desc(marketHealthScoresTable.computedAt))
      .limit(limit);

    const opportunityHistory = await db
      .select()
      .from(marketOpportunityScoresTable)
      .orderBy(desc(marketOpportunityScoresTable.computedAt))
      .limit(limit);

    const riskHistory = await db
      .select()
      .from(marketRiskAssessmentsTable)
      .orderBy(desc(marketRiskAssessmentsTable.assessedAt))
      .limit(limit);

    res.json({
      success: true,
      pair,
      counts: {
        reports: reports.length,
        healthScores: healthHistory.length,
        opportunityScores: opportunityHistory.length,
        riskAssessments: riskHistory.length,
      },
      reports: reports.map(r => ({
        id: r.id,
        pair: r.pair,
        regime: r.regime,
        healthScore: r.healthScore,
        opportunityScore: r.opportunityScore,
        riskLevel: r.riskLevel,
        confidence: r.overallConfidence,
        generatedAt: r.generatedAt,
      })),
      healthHistory: healthHistory.map(h => ({
        id: h.id,
        pair: h.pair,
        score: h.overallScore,
        grade: h.grade,
        computedAt: h.computedAt,
      })),
      opportunityHistory: opportunityHistory.map(o => ({
        id: o.id,
        pair: o.pair,
        score: o.overallScore,
        label: o.label,
        computedAt: o.computedAt,
      })),
      riskHistory: riskHistory.map(r => ({
        id: r.id,
        pair: r.pair,
        overall: r.overallRisk,
        assessedAt: r.assessedAt,
      })),
    });
  } catch (err) {
    console.error("[market-intelligence] GET /market/history error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
