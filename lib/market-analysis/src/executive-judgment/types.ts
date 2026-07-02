// ─── Executive Judgment & Decision Simulation Engine — Types ─────────────────
// Phase 7.3

export const EJ_ENGINE_VERSION = "1.0.0";

// ─── Decision Types ───────────────────────────────────────────────────────────

export type DecisionType =
  | "execute_trade"
  | "wait_one_candle"
  | "wait_confirmation"
  | "reduce_position"
  | "observation_mode"
  | "skip_trade"
  | "emergency_pause";

export const DECISION_TYPE_LABELS: Record<DecisionType, string> = {
  execute_trade:     "Execute Trade",
  wait_one_candle:   "Wait One Candle",
  wait_confirmation: "Wait for Confirmation",
  reduce_position:   "Reduce Position Size",
  observation_mode:  "Observation Mode",
  skip_trade:        "Skip Trade",
  emergency_pause:   "Emergency Pause",
};

export const DECISION_TYPE_DESCRIPTIONS: Record<DecisionType, string> = {
  execute_trade:     "Proceed with the trade setup as planned at full position size.",
  wait_one_candle:   "Defer the entry by one candle to gather more market information.",
  wait_confirmation: "Wait for an additional confirmation signal before entering.",
  reduce_position:   "Enter with a reduced position size to limit downside exposure.",
  observation_mode:  "Monitor the market without committing capital to this setup.",
  skip_trade:        "Skip this particular setup entirely and look for the next opportunity.",
  emergency_pause:   "Halt all trading activity due to elevated risk or crisis conditions.",
};

// ─── Stage 1: Decision Simulation ────────────────────────────────────────────

export interface DecisionSimulation {
  decisionType:           DecisionType;
  decisionLabel:          string;
  decisionDescription:    string;

  // Multi-scenario metrics
  expectedProbability:    number;  // 0-100: probability of a successful outcome
  expectedRisk:           number;  // 0-100: risk exposure score
  historicalWinRate:      number;  // 0-100: historical win rate for this action type
  historicalDrawdown:     number;  // 0-100: expected max drawdown %
  expectedRR:             number;  // expected risk-reward ratio (can be 0 for no-trade)
  confidence:             number;  // 0-100: confidence in this simulation
  sampleSize:             number;  // supporting historical sample count
  similarCases:           string[]; // narrative of similar historical situations

  // Expected value
  expectedValue:          number;  // EV = p*RR - (1-p)*1.0

  // Positional data
  isTradeAction:          boolean; // true if this involves opening a position
  capitalAtRisk:          number;  // 0-100: % of capital at risk
  opportunityCost:        number;  // 0-100: opportunity cost if this decision were not taken
}

// ─── Stage 2: Opportunity Cost ────────────────────────────────────────────────

export interface OpportunityCostScenario {
  action:           "trade" | "skip";
  expectedBenefit:  number;   // upside if taken
  potentialDownside: number;  // downside if taken
  netExpectedValue: number;   // benefit*p - downside*(1-p)
  probabilityOfSuccess: number;
  description:      string;
}

export interface OpportunityCostAnalysis {
  analysisId:            string;
  ifTrade:               OpportunityCostScenario;
  ifSkip:                OpportunityCostScenario;
  opportunityCostScore:  number;  // -100 to 100; positive = trade better; negative = skip better
  recommendation:        "trade" | "skip" | "wait" | "reduce";
  confidence:            number;
  reasoning:             string;
  riskAvoidedBySkipping: number;  // 0-100
  opportunityMissedBySkipping: number; // 0-100
}

// ─── Stage 3: Decision Rankings ───────────────────────────────────────────────

export interface DecisionRanking {
  decisionType:           DecisionType;
  decisionLabel:          string;
  rank:                   number;  // 1 = best
  overallScore:           number;  // 0-100
  expectedValue:          number;
  confidence:             number;
  riskScore:              number;  // 0-100 (higher = more risk)
  historicalEvidence:     number;  // 0-100 (higher = more evidence)
  statisticalReliability: number;  // 0-100
  rankingReason:          string;  // explanation for this rank
}

// ─── Stage 4: Judgment ────────────────────────────────────────────────────────

export interface JudgmentExplainability {
  whyBestRankedHighest:        string;
  whyAlternativesRejected:     string[];  // one per rejected candidate
  mostInfluentialEvidence:     string[];  // top 5 evidence items
  historicalReferences:        string[];  // similar past scenarios
  confidenceInterval:          { lower: number; upper: number };
  statisticalReliabilityNote:  string;
  keyRisks:                    string[];
}

// ─── Stage 5: Counterfactual ──────────────────────────────────────────────────

export interface CounterfactualResult {
  decisionType:        DecisionType;
  decisionLabel:       string;
  hypotheticalOutcome: "win" | "loss" | "neutral" | "avoided_loss";
  hypotheticalPnL:     number;  // simulated PnL in R units
  hypotheticalRR:      number;  // simulated risk-reward
  comparedToActual:    number;  // difference vs actual outcome in R
  description:         string;
  reliability:         number;  // 0-100: how reliable this counterfactual is
}

export interface CounterfactualAnalysis {
  analysisId:          string;
  judgmentId:          string;
  tradeId:             string | null;
  completedAt:         string;
  actualDecision:      DecisionType;
  actualOutcome:       "win" | "loss" | "neutral";
  actualPnL:           number;
  actualRR:            number;
  alternatives:        CounterfactualResult[];
  bestAlternative:     CounterfactualResult | null;
  worstAlternative:    CounterfactualResult | null;
  learningInsight:     string;
  decisionQualityScore: number;  // 0-100: how good was the actual decision in hindsight?
}

// ─── Master Executive Judgment Object ─────────────────────────────────────────

export interface ExecutiveJudgment {
  judgmentId:           string;
  evaluatedAt:          string;
  pair:                 string;
  timeframe:            string;

  // Input intelligence snapshot
  intelligenceSnapshot: {
    executiveScore:    number;
    strategyScore:     number;
    riskScore:         number;
    marketScore:       number;
    memoryWinRate:     number;
    identityScore:     number;
    crisisStatus:      string;
    survivalMode:      boolean;
  };

  // Stage 1: All simulations
  simulations:          DecisionSimulation[];

  // Stage 2: Opportunity cost
  opportunityCost:      OpportunityCostAnalysis;

  // Stage 3: Rankings
  rankings:             DecisionRanking[];

  // Stage 4: Top 3 + Judgment
  bestDecision:         DecisionRanking;
  secondBestDecision:   DecisionRanking;
  thirdBestDecision:    DecisionRanking;
  finalDecision:        DecisionType;
  finalDecisionLabel:   string;
  finalScore:           number;
  finalConfidence:      number;

  // Explainability
  explainability:       JudgmentExplainability;

  // Stage 5: Counterfactual (populated post-trade)
  counterfactual:       CounterfactualAnalysis | null;

  // Meta
  isAdvisoryOnly:       true;
  engineVersion:        string;
  durationMs:           number;
}

// ─── Orchestrator Input ────────────────────────────────────────────────────────

export interface RunJudgmentInput {
  pair?:           string;
  timeframe?:      string;
  strategyResult?: Record<string, unknown> | null;
  erbResult?:      Record<string, unknown> | null;
  riResult?:       Record<string, unknown> | null;
  tradeId?:        string | null;  // if set, enables counterfactual persistence
}
