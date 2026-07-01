// ─── Executive Risk Brain — Main Engine ───────────────────────────────────────
// Unifies ALL Phase 6 Risk Intelligence subsystems into one centralized
// risk decision engine. Continuously supervises KRYTOS and provides a single
// authoritative assessment of trading safety.
// Advisory only. NEVER modifies strategy, positions, or bypasses approval workflow.

import { randomUUID } from "crypto";
import type {
  RunErbInput,
  ExecutiveRiskObject,
  ErbAccountIntelligence,
  ErbPositionIntelligence,
  ErbPortfolioIntelligence,
  ErbMarketIntelligence,
  ErbBrokerIntelligence,
  ErbInfrastructureIntelligence,
  ErbAdaptiveIntelligence,
  ErbCrisisIntelligence,
} from "./types.js";
import { ERB_ENGINE_VERSION, ERB_RISK_VERSION } from "./types.js";
import { computeAllScores }       from "./scorer.js";
import { buildRecommendationDetail, scoreToRecommendation } from "./recommender.js";
import { buildExplainability }    from "./explainer.js";
import { runErbCertification }    from "./certification.js";

// Re-exports
export { ERB_ENGINE_VERSION, ERB_RISK_VERSION }   from "./types.js";
export { runErbCertification }                     from "./certification.js";
export { scoreToRecommendation, buildRecommendationDetail, buildHistoricalComparison } from "./recommender.js";
export { computeAllScores, clamp, scoreAccountHealth, scorePositionSafety, scorePortfolioStability, scoreMarketSafety, scoreBrokerReliability, scoreSystemHealth, scoreCrisisSafety, scoreAdaptiveAlignment, computeSurvivalScore, computeCapitalHealthScore } from "./scorer.js";
export { buildExplainability, identifyTriggeringMetrics, identifyActiveProtections, identifyTopContributor, computeConfidenceInterval, computeReliabilityRating, buildHistoricalContext, buildSubsystemContributions } from "./explainer.js";
export type {
  ExecutiveRiskObject,
  RunErbInput,
  ErbRecommendation,
  ErbCertificationReport,
  ErbAuditContext,
  ErbScoreBreakdown,
  ErbExplainability,
  ErbRecommendationDetail,
} from "./types.js";

// ─── Default intelligence constructors ───────────────────────────────────────

export function defaultAccount(): ErbAccountIntelligence {
  return {
    balance: 10000, equity: 10000, freeMargin: 10000,
    marginLevel: 0, dailyPnl: 0, weeklyPnl: 0, monthlyPnl: 0,
    drawdownPct: 0, accountHealthScore: 80,
  };
}

export function defaultPortfolio(): ErbPortfolioIntelligence {
  return {
    openTrades: 0, currencyExposure: {}, pairExposure: {},
    correlationExposure: 0, directionalBias: 0, portfolioRiskScore: 20,
  };
}

export function defaultMarket(): ErbMarketIntelligence {
  return {
    marketHealth: 65, marketRegime: "trending", volatility: 40,
    liquidity: 70, correlation: 30, opportunityScore: 55, marketRiskScore: 35,
  };
}

export function defaultBroker(): ErbBrokerIntelligence {
  return {
    spread: 1.2, slippage: 0.2, latency: 45, executionTime: 120,
    connectionStability: 99, brokerReliabilityScore: 85,
  };
}

export function defaultInfra(): ErbInfrastructureIntelligence {
  return {
    cpuUsage: 25, memoryUsage: 40, dbHealth: 92, networkLatency: 30,
    apiStatus: 98, dataFeedHealth: 90, systemHealthScore: 88,
  };
}

export function defaultAdaptive(): ErbAdaptiveIntelligence {
  return {
    currentRiskProfile: "balanced", recommendedRiskProfile: "balanced",
    confidence: 65, historicalPerformance: {}, adaptationConfidence: 60,
  };
}

export function defaultCrisis(): ErbCrisisIntelligence {
  return {
    crisisStatus: "normal", crisisSeverity: "none",
    survivalModeActive: false, recoveryStage: "none", recoveryProgress: 100,
  };
}

// ─── Intelligence builders from raw DB/API results ───────────────────────────

export function buildAccountIntelligence(
  riResult: Record<string, unknown> | null,
  botState: Record<string, unknown> | null,
): ErbAccountIntelligence {
  const ri = riResult ?? {};
  const bot = botState ?? {};
  return {
    balance:            Number(ri.balance         ?? bot.balance         ?? 10000),
    equity:             Number(ri.equity          ?? bot.equity          ?? 10000),
    freeMargin:         Number(ri.freeMargin      ?? bot.freeMargin      ?? 10000),
    marginLevel:        Number(ri.marginLevel     ?? bot.marginLevel     ?? 0),
    dailyPnl:           Number(ri.dailyPnl        ?? 0),
    weeklyPnl:          Number(ri.weeklyPnl       ?? 0),
    monthlyPnl:         Number(ri.monthlyPnl      ?? 0),
    drawdownPct:        Number(ri.drawdownPct     ?? 0),
    accountHealthScore: Number(ri.accountHealthScore ?? 80),
  };
}

export function buildPortfolioIntelligence(riResult: Record<string, unknown> | null): ErbPortfolioIntelligence {
  const ri = riResult ?? {};
  return {
    openTrades:          Number(ri.openTrades         ?? 0),
    currencyExposure:    (ri.currencyExposure as Record<string, number>) ?? {},
    pairExposure:        (ri.pairExposure     as Record<string, number>) ?? {},
    correlationExposure: Number(ri.correlationExposure ?? 0),
    directionalBias:     Number(ri.directionalBias     ?? 0),
    portfolioRiskScore:  Number(ri.portfolioRiskScore  ?? 20),
  };
}

export function buildMarketIntelligence(riResult: Record<string, unknown> | null): ErbMarketIntelligence {
  const ri = riResult ?? {};
  return {
    marketHealth:    Number(ri.marketHealth    ?? 65),
    marketRegime:    String(ri.marketRegime    ?? ri.regime ?? "trending"),
    volatility:      Number(ri.volatility      ?? 40),
    liquidity:       Number(ri.liquidity       ?? 70),
    correlation:     Number(ri.correlation     ?? 30),
    opportunityScore: Number(ri.opportunityScore ?? 55),
    marketRiskScore: Number(ri.marketRiskScore ?? 35),
  };
}

export function buildBrokerIntelligence(riResult: Record<string, unknown> | null): ErbBrokerIntelligence {
  const ri = riResult ?? {};
  return {
    spread:               Number(ri.spread               ?? 1.2),
    slippage:             Number(ri.slippage             ?? 0.2),
    latency:              Number(ri.latency              ?? 45),
    executionTime:        Number(ri.executionTime        ?? 120),
    connectionStability:  Number(ri.connectionQuality   ?? ri.connectionStability ?? 99),
    brokerReliabilityScore: Number(ri.brokerReliabilityScore ?? 85),
  };
}

export function buildInfraIntelligence(riResult: Record<string, unknown> | null): ErbInfrastructureIntelligence {
  const ri = riResult ?? {};
  return {
    cpuUsage:       Number(ri.cpuUsage       ?? 25),
    memoryUsage:    Number(ri.memoryUsage    ?? 40),
    dbHealth:       Number(ri.dbHealth       ?? 92),
    networkLatency: Number(ri.networkLatency ?? 30),
    apiStatus:      Number(ri.apiHealth      ?? ri.apiStatus ?? 98),
    dataFeedHealth: Number(ri.dataFeedHealth ?? 90),
    systemHealthScore: Number(ri.systemHealthScore ?? 88),
  };
}

export function buildAdaptiveIntelligence(ariResult: Record<string, unknown> | null): ErbAdaptiveIntelligence {
  const ari = ariResult ?? {};
  const rec  = (ari.recommendation as Record<string, unknown>) ?? {};
  return {
    currentRiskProfile:     String(ari.currentProfile     ?? rec.previousProfile  ?? "balanced"),
    recommendedRiskProfile: String(rec.recommendedProfile ?? ari.recommendedProfile ?? "balanced"),
    confidence:             Number((rec.confidence as Record<string, unknown>)?.score ?? ari.confidence ?? 65),
    historicalPerformance:  (ari.historicalPerformance as Record<string, number>) ?? {},
    adaptationConfidence:   Number(rec.confidence          ?? ari.adaptationConfidence ?? 60),
  };
}

export function buildCrisisIntelligence(crisisResult: Record<string, unknown> | null): ErbCrisisIntelligence {
  const cr = crisisResult ?? {};
  const summary  = (cr.summary  as Record<string, unknown>) ?? {};
  const survival = (cr.survivalMode as Record<string, unknown>) ?? {};
  const recovery = (cr.recovery as Record<string, unknown>) ?? {};
  const classification = (cr.classification as Record<string, unknown>) ?? {};
  return {
    crisisStatus:      String(summary.currentMode     ?? survival.currentMode ?? "normal"),
    crisisSeverity:    String(classification.overallSeverity ?? summary.currentSeverity ?? "none"),
    survivalModeActive: Boolean(survival.currentMode && survival.currentMode !== "normal" && survival.currentMode !== "caution"),
    recoveryStage:     String(recovery.stage          ?? "none"),
    recoveryProgress:  Number(recovery.progressPct   ?? recovery.progress ?? 100),
  };
}

// ─── Main engine ──────────────────────────────────────────────────────────────

export async function runExecutiveRiskBrain(
  input: RunErbInput,
  historicalRows: Array<Record<string, unknown>> = [],
): Promise<ExecutiveRiskObject> {
  const reportId    = randomUUID();
  const evaluatedAt = new Date();

  // ── Build intelligence from subsystem results ──────────────────────────────
  const riRaw      = input.riResult      as Record<string, unknown> | null ?? null;
  const cpRaw      = input.cpResult      as Record<string, unknown> | null ?? null;
  const ariRaw     = input.ariResult     as Record<string, unknown> | null ?? null;
  const crisisRaw  = input.crisisResult  as Record<string, unknown> | null ?? null;

  const account   = buildAccountIntelligence(riRaw, null);
  const portfolio = buildPortfolioIntelligence(riRaw);
  const market    = buildMarketIntelligence(riRaw);
  const broker    = buildBrokerIntelligence(riRaw);
  const infra     = buildInfraIntelligence(riRaw);
  const adaptive  = buildAdaptiveIntelligence(ariRaw);
  const crisis    = buildCrisisIntelligence(crisisRaw);

  // Position (optional — only if active trade)
  const position: ErbPositionIntelligence | null = riRaw?.positionRiskScore != null ? {
    positionSize:      Number(riRaw.positionSize      ?? 0),
    riskPct:           Number(riRaw.riskPercentage    ?? 0),
    stopDistance:      Number(riRaw.stopLossDistance  ?? 0),
    expectedRR:        Number(riRaw.expectedRR        ?? 0),
    positionExposure:  Number(riRaw.tradeExposure     ?? 0),
    positionRiskScore: Number(riRaw.positionRiskScore ?? 0),
  } : null;

  // CP protection level for survival score
  const cpData = cpRaw ? {
    protectionLevel:  String((cpRaw.summary as Record<string, unknown>)?.protectionLevel ?? (cpRaw as Record<string, unknown>).protectionLevel ?? "normal"),
    recoveryProgress: Number((cpRaw.summary as Record<string, unknown>)?.recoveryProgress ?? 100),
  } : null;

  // ── Compute all 7 scores ──────────────────────────────────────────────────
  const scores = computeAllScores({
    account, position, portfolio, market, broker, infra, adaptive, crisis, cp: cpData,
    weights: input.weights,
  });

  // ── Recommendation ────────────────────────────────────────────────────────
  const allScores: Record<string, number> = {
    survivalScore:           scores.survivalScore,
    capitalHealthScore:      scores.capitalHealthScore,
    infrastructureScore:     scores.infrastructureScore,
    brokerReliabilityScore:  scores.brokerReliabilityScore,
    portfolioStabilityScore: scores.portfolioStabilityScore,
    recoveryConfidenceScore: scores.recoveryConfidenceScore,
  };

  const recommendationDetail = buildRecommendationDetail(
    scores.overallRiskScore,
    scores.scoreBreakdown,
    account,
    crisis,
    adaptive,
    allScores,
    historicalRows,
  );

  // ── Explainability ────────────────────────────────────────────────────────
  const explainability = buildExplainability(
    scores.overallRiskScore,
    recommendationDetail.recommendation,
    scores.scoreBreakdown,
    account,
    portfolio,
    market,
    broker,
    infra,
    crisis,
    adaptive,
    historicalRows,
  );

  return {
    reportId,
    engineVersion: ERB_ENGINE_VERSION,
    riskVersion:   ERB_RISK_VERSION,
    evaluatedAt,
    isAdvisoryOnly: true,

    pair:    input.pair,
    session: input.session,
    regime:  input.regime,

    account,
    position,
    portfolio,
    market,
    broker,
    infrastructure: infra,
    adaptive,
    crisis,

    overallRiskScore:        scores.overallRiskScore,
    survivalScore:           scores.survivalScore,
    capitalHealthScore:      scores.capitalHealthScore,
    infrastructureScore:     scores.infrastructureScore,
    brokerReliabilityScore:  scores.brokerReliabilityScore,
    portfolioStabilityScore: scores.portfolioStabilityScore,
    recoveryConfidenceScore: scores.recoveryConfidenceScore,

    scoreWeights:   scores.scoreWeights,
    scoreBreakdown: scores.scoreBreakdown,

    recommendationDetail,

    explainability,
  };
}
