// ─── Market World Model Types ──────────────────────────────────────────────────
// Shared type definitions for the world model engines.
// Observational only — no trade execution, no strategy modification.

export const WORLD_MODEL_VERSION = "1.0.0";

// ─── Component Names ──────────────────────────────────────────────────────────

export type WorldModelComponent =
  | "regime"
  | "trend"
  | "volatility"
  | "liquidity"
  | "correlation"
  | "news"
  | "session"
  | "spread"
  | "market_structure"
  | "supply_demand"
  | "liquidity_sweeps"
  | "amd_completion"
  | "confirmation_quality";

export const ALL_COMPONENTS: WorldModelComponent[] = [
  "regime", "trend", "volatility", "liquidity", "correlation",
  "news", "session", "spread", "market_structure", "supply_demand",
  "liquidity_sweeps", "amd_completion", "confirmation_quality",
];

export const COMPONENT_LABELS: Record<WorldModelComponent, string> = {
  regime: "Market Regime",
  trend: "Trend",
  volatility: "Volatility",
  liquidity: "Liquidity",
  correlation: "Correlation",
  news: "News Context",
  session: "Session",
  spread: "Spread",
  market_structure: "Market Structure",
  supply_demand: "Supply/Demand Quality",
  liquidity_sweeps: "Liquidity Sweeps",
  amd_completion: "AMD Completion",
  confirmation_quality: "Confirmation Quality",
};

// ─── Relationship Types ────────────────────────────────────────────────────────

export type RelationshipType =
  | "leads_to"       // A tends to precede B
  | "correlates_with"// A and B move together
  | "amplifies"      // A increases the magnitude of B
  | "suppresses";    // A decreases the magnitude of B

export interface ComponentRelationship {
  sourceComponent: WorldModelComponent;
  targetComponent: WorldModelComponent;
  relationshipType: RelationshipType;
  strength: number;        // -1 to 1 (negative = inverse)
  confidence: number;      // 0 to 100
  sampleSize: number;
  reliabilityScore: number; // 0 to 100
  lagBars: number;          // 0 = contemporaneous, >0 = lagged
  pValue: number;           // statistical significance
  isCausal: boolean;
  evidenceSummary: string;
  historicalEvidence: EvidenceDataPoint[];
  computedAt: Date;
}

export interface EvidenceDataPoint {
  pair: string;
  session: string;
  regime: string;
  sourceValue: number;
  targetValue: number;
  lag: number;
  weight: number;
}

// ─── Transition Types ─────────────────────────────────────────────────────────

export type TransitionCategory = "regime" | "volatility" | "liquidity";

export type RegimeState = "trending" | "ranging" | "volatile" | "low_volatility";
export type VolatilityState = "compression" | "expansion" | "stable";
export type LiquidityState = "high" | "low" | "normal";

export interface MarketTransitionStats {
  fromState: string;
  toState: string;
  transitionCategory: TransitionCategory;
  transitionProbability: number; // 0 to 1
  avgDurationBars: number;
  medianDurationBars: number;
  historicalFrequency: number;
  confidence: number;            // 0 to 100
  avgOutcomeQuality: number;     // 0 to 100 — trade quality after transition
  supportingEvidence: TransitionEvidence[];
  computedAt: Date;
}

export interface TransitionEvidence {
  pair: string;
  observedAt: string;
  durationBars: number;
  outcomeQuality: number;
  triggers: string[];
}

// ─── Influence Graph Types ─────────────────────────────────────────────────────

export type InfluenceDirection = "positive" | "negative" | "mixed";

export interface InfluenceEdge {
  sourceNode: WorldModelComponent;
  targetNode: WorldModelComponent;
  influenceStrength: number;    // 0 to 1
  influenceDirection: InfluenceDirection;
  confidence: number;           // 0 to 100
  sampleSize: number;
  propagationDepth: number;     // 1 = direct
  explanation: string;
  supportingEvidence: EvidenceDataPoint[];
}

export interface InfluenceGraph {
  nodes: InfluenceNode[];
  edges: InfluenceEdge[];
  computedAt: Date;
  version: string;
  totalSampleSize: number;
}

export interface InfluenceNode {
  component: WorldModelComponent;
  label: string;
  inDegree: number;   // how many nodes influence this one
  outDegree: number;  // how many nodes this one influences
  centralityScore: number; // 0 to 100 — how central in the graph
}

// ─── Scenario Simulation Types ─────────────────────────────────────────────────

export type ScenarioType =
  | "volatility_impact"
  | "correlation_shift"
  | "regime_transition"
  | "liquidity_shock"
  | "news_event"
  | "session_change";

export interface ScenarioQuery {
  scenarioType: ScenarioType;
  triggerComponent: WorldModelComponent;
  triggerMagnitude: number;   // % change or categorical shift
  affectedComponent: WorldModelComponent;
}

export interface ScenarioResult {
  query: ScenarioQuery;
  historicalResponseMean: number;
  historicalResponseStd: number;
  historicalResponseMin: number;
  historicalResponseMax: number;
  sampleSize: number;
  confidence: number;
  responseTimeBars: number;
  narrativeExplanation: string;
  evidenceBreakdown: ScenarioEvidenceItem[];
  computedAt: Date;
}

export interface ScenarioEvidenceItem {
  pair: string;
  session: string;
  triggerValue: number;
  responseValue: number;
  responseBars: number;
  weight: number;
}

// ─── Market Memory Types ───────────────────────────────────────────────────────

export interface MarketWorldState {
  pair: string;
  regime: string;
  trend: string;
  volatilityClass: string;
  liquidityQuality: string;
  correlationRisk: string;
  newsEnvironment: string;
  session: string;
  spreadCategory: string;
  marketStructure: string;
  supplyDemandQuality: string;
  liquiditySweeps: string;
  amdCompletion: string;
  confirmationQuality: string;
  marketContextScore: number;
  stabilityScore: number;
  regimeConfidence: number;
  activeTransitions: ActiveTransition[];
  worldModelVersion: string;
  capturedAt: Date;
}

export interface ActiveTransition {
  category: TransitionCategory;
  fromState: string;
  toState: string;
  progressPercent: number;   // 0..100
  barsInProgress: number;
  probability: number;
}

// ─── World Model Summary ───────────────────────────────────────────────────────

export interface WorldModelSummary {
  pair: string;
  currentState: MarketWorldState;
  activeRelationships: ComponentRelationship[];
  activeTransitions: MarketTransitionStats[];
  influenceGraph: InfluenceGraph;
  recentMemoryCount: number;
  modelHealth: ModelHealth;
  computedAt: Date;
  version: string;
}

export interface ModelHealth {
  overallScore: number;         // 0 to 100
  dataAdequacy: number;         // 0 to 100
  relationshipCoverage: number; // 0 to 100
  transitionCoverage: number;   // 0 to 100
  memoryDepth: number;          // number of historical states
  lastUpdated: Date;
  issues: string[];
}

// ─── Feature Row (from DB learning features for analysis) ─────────────────────

export interface WorldModelFeatureRow {
  tradeId: string;
  pair: string;
  session: string;
  marketRegime: string;
  trend: string;
  supplyQuality: number;
  demandQuality: number;
  liquidityScore: number;
  amdScore: number;
  confirmationQuality: number;
  setupScore: number;
  tqi: number;
  spreadPips: number;
  volatility: string;
  outcome: string;
  pnl: number;
  confidence: number;
  patternType: string;
  entryTime: Date;
}

// ─── Report Types ─────────────────────────────────────────────────────────────

export interface WorldModelReport {
  title: string;
  generatedAt: Date;
  version: string;
  sections: ReportSection[];
  summary: string;
  limitations: string[];
}

export interface ReportSection {
  heading: string;
  content: string;
  data?: unknown;
}
