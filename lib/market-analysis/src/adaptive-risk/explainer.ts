// ─── Explainer ────────────────────────────────────────────────────────────────
// Generates full, human-readable explainability for every recommendation.
// No black-box decisions.

import type {
  RiskProfile, MarketContext, EnvironmentStats, ConfidenceResult,
  ProfileExplainability, RiskParameters,
} from "./types.js";
import { RISK_PROFILE_LABELS } from "./types.js";
import { ARI_ENGINE_VERSION } from "./types.js";

export function buildExplainability(
  profile:    RiskProfile,
  score:      number,
  context:    MarketContext,
  stats:      EnvironmentStats[],
  confidence: ConfidenceResult,
  params:     RiskParameters,
): ProfileExplainability {
  const label = RISK_PROFILE_LABELS[profile];

  const whyThisProfile = buildWhyProfile(profile, score, context, confidence);
  const historicalSupport = buildHistoricalSupport(stats, confidence);
  const marketInfluences  = buildMarketInfluences(context, stats);
  const expectedBenefits  = buildExpectedBenefits(profile, params);
  const potentialRisks    = buildPotentialRisks(profile, context);
  const safetyMechanisms  = buildSafetyMechanisms(params);

  return {
    whyThisProfile,
    historicalSupport,
    marketInfluences,
    expectedBenefits,
    potentialRisks,
    safetyMechanisms,
    reviewedAt:    new Date().toISOString(),
    engineVersion: ARI_ENGINE_VERSION,
  };
}

// ─── Builders ─────────────────────────────────────────────────────────────────

function buildWhyProfile(
  profile:    RiskProfile,
  score:      number,
  context:    MarketContext,
  confidence: ConfidenceResult,
): string {
  const label = RISK_PROFILE_LABELS[profile];
  if (!confidence.hasMinimumEvidence) {
    return `${label} selected because only ${confidence.sampleSize} historical trades exist. ` +
      `A minimum of 10 trades is required for evidence-based recommendations. ` +
      `This conservative stance protects capital while the system learns.`;
  }
  const envDesc = `${context.regime} regime, ${context.volatilityLevel} volatility, ${context.session} session`;
  return `${label} profile selected based on a composite risk score of ${score}/100 ` +
    `evaluated across ${envDesc}. ` +
    (score >= 65
      ? `Conditions are favourable — historical performance supports increased exposure.`
      : score >= 45
      ? `Conditions are neutral — balanced approach is statistically optimal.`
      : `Conditions are unfavourable — reduced exposure protects capital.`);
}

function buildHistoricalSupport(stats: EnvironmentStats[], confidence: ConfidenceResult): string {
  if (!confidence.hasMinimumEvidence || stats.length === 0) {
    return `Insufficient historical data for statistical support (${confidence.sampleSize} trades). ` +
      `At least 10 trades required.`;
  }
  const top = stats.sort((a, b) => b.sampleSize - a.sampleSize).slice(0, 3);
  const lines = top.map(s =>
    `${s.environment}="${s.environmentKey}": ${(s.winRate * 100).toFixed(1)}% win rate, ` +
    `expectancy ${s.expectancy.toFixed(2)}R (n=${s.sampleSize}, ${s.riskRating})`
  );
  return `Based on ${confidence.sampleSize} historical trades. Key evidence: ${lines.join("; ")}.`;
}

function buildMarketInfluences(context: MarketContext, stats: EnvironmentStats[]): string[] {
  const influences: string[] = [];
  influences.push(`Market regime: ${context.regime} — ${regimeInfluenceText(context.regime)}`);
  influences.push(`Volatility: ${context.volatilityLevel} (score: ${context.volatilityScore}/100)`);
  influences.push(`Session: ${context.session} — ${sessionInfluenceText(context.session)}`);
  influences.push(`Liquidity: ${context.liquidityLevel} (score: ${context.liquidityScore}/100)`);
  if (context.newsRisk > 50) influences.push(`News risk: ${context.newsRisk}% — caution applied`);
  const favorable = stats.filter(s => s.riskRating === "favorable").length;
  const avoid     = stats.filter(s => s.riskRating === "avoid").length;
  if (favorable > 0) influences.push(`${favorable} dimensions rated favourable historically`);
  if (avoid > 0)     influences.push(`${avoid} dimensions rated avoid — weighting reduced risk`);
  return influences;
}

function regimeInfluenceText(regime: string): string {
  const map: Record<string, string> = {
    trending:      "directional momentum supports controlled risk taking",
    ranging:       "mean-reversion environment, tighter targets recommended",
    volatile:      "high unpredictability warrants reduced exposure",
    low_volatility:"compressed ranges may limit opportunity",
    transition:    "regime change in progress, elevated uncertainty",
    expansion:     "expanding ranges offer opportunity but increase risk",
    compression:   "pre-breakout compression, high-risk inflection point",
  };
  return map[regime] ?? "regime analysis in progress";
}

function sessionInfluenceText(session: string): string {
  const map: Record<string, string> = {
    london:    "primary session with highest liquidity",
    new_york:  "secondary session, strong trend continuation",
    asian:     "lower liquidity, tighter ranges preferred",
    overlap:   "highest volume, elevated volatility",
    off_hours: "minimal liquidity, risk elevated",
  };
  return map[session] ?? "session classification pending";
}

function buildExpectedBenefits(profile: RiskProfile, params: RiskParameters): string {
  const map: Record<RiskProfile, string> = {
    aggressive:   `Higher exposure (${params.maxRiskPerTrade}% per trade, ${params.maxOpenTrades} trades) to maximise returns in favourable conditions`,
    balanced:     `Balanced risk (${params.maxRiskPerTrade}% per trade) optimises Sharpe ratio in current conditions`,
    conservative: `Reduced risk (${params.maxRiskPerTrade}% per trade) limits drawdown while preserving capital`,
    observation:  `Minimal exposure (${params.maxRiskPerTrade}% per trade) while monitoring conditions for improvement`,
    recovery:     `Gradual re-engagement (${params.maxRiskPerTrade}% per trade) following adverse performance`,
    emergency:    `Near-zero exposure (${params.maxRiskPerTrade}% per trade) with max ${params.maxOpenTrades} trades to halt further losses`,
  };
  return map[profile];
}

function buildPotentialRisks(profile: RiskProfile, context: MarketContext): string {
  const base: Record<RiskProfile, string> = {
    aggressive:   "Higher exposure amplifies potential losses if conditions deteriorate",
    balanced:     "Moderate exposure may underperform in strongly trending conditions",
    conservative: "Reduced sizing may limit returns if conditions are highly favourable",
    observation:  "Very low activity; opportunity cost if conditions improve unexpectedly",
    recovery:     "Gradual re-entry may miss early recovery opportunities",
    emergency:    "Near-halt prevents all upside participation",
  };
  let risk = base[profile];
  if (context.newsRisk > 70) risk += ". Elevated news risk may cause sudden slippage.";
  if (context.volatilityLevel === "high" || context.volatilityLevel === "extreme")
    risk += " High volatility may widen spreads significantly.";
  return risk;
}

function buildSafetyMechanisms(params: RiskParameters): string[] {
  return [
    `Max risk per trade: ${params.maxRiskPerTrade}% — Capital Protection Engine enforces hard stop`,
    `Daily budget: ${params.dailyRiskBudget}% — halts new trades when reached`,
    `Weekly budget: ${params.weeklyRiskBudget}% — escalates to Recovery profile if breached`,
    `Max open trades: ${params.maxOpenTrades} — prevents over-leveraging`,
    `Position size multiplier: ${params.positionSizeMultiplier}x — scales base lot size`,
    "Capital Protection Engine overrides take precedence — this engine NEVER bypasses them",
    "Recommendations are advisory only — execution engine applies final safety checks",
  ];
}

// ─── Narrative helpers for lists ─────────────────────────────────────────────

export function buildExpectedBenefitsList(profile: RiskProfile, params: RiskParameters): string[] {
  const common = [
    `Risk per trade limited to ${params.maxRiskPerTrade}%`,
    `Max ${params.maxOpenTrades} concurrent positions to control correlation risk`,
    `Daily risk budget of ${params.dailyRiskBudget}% provides controlled daily loss ceiling`,
  ];
  const specific: Record<RiskProfile, string[]> = {
    aggressive:   ["Maximise returns in currently favourable conditions", "Higher position multiplier captures trend momentum"],
    balanced:     ["Optimal risk-adjusted return in neutral conditions", "Diversified exposure across pairs"],
    conservative: ["Capital preservation in uncertain environment", "Reduced drawdown probability"],
    observation:  ["Near-zero drawdown risk", "Capital fully preserved while monitoring conditions"],
    recovery:     ["Gradual confidence rebuild after adverse performance", "Prevents over-correction or premature aggression"],
    emergency:    ["Halts runaway losses immediately", "Preserves remaining capital for future recovery"],
  };
  return [...common, ...(specific[profile] ?? [])];
}

export function buildPotentialRisksList(profile: RiskProfile, context: MarketContext): string[] {
  const risks: string[] = [];
  if (profile === "aggressive") risks.push("Higher exposure increases drawdown risk if conditions shift");
  if (profile === "observation" || profile === "emergency") risks.push("Opportunity cost during any positive market moves");
  if (context.volatilityLevel === "high" || context.volatilityLevel === "extreme") risks.push("Elevated spread risk in high volatility");
  if (context.newsRisk > 50) risks.push("News events may cause unexpected slippage");
  if (context.liquidityLevel === "low") risks.push("Wide spreads possible in low-liquidity periods");
  if (risks.length === 0) risks.push("Current conditions present standard trading risks");
  return risks;
}
