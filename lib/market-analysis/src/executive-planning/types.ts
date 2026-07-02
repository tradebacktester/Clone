// ─── Executive Planning, Goal Management & Mission Control — Types ─────────────
// Phase 7.4

export const EP_ENGINE_VERSION = "1.0.0";

// ─── Mission Hierarchy ────────────────────────────────────────────────────────

export type GoalLevel = 1 | 2 | 3 | 4;
export type GoalLevelName =
  | "permanent_mission"   // Level 1 — never changes
  | "strategic"           // Level 2 — quarterly timescale
  | "operational"         // Level 3 — daily/weekly timescale
  | "immediate";          // Level 4 — per-trade timescale

export const GOAL_LEVEL_NAMES: Record<GoalLevel, GoalLevelName> = {
  1: "permanent_mission",
  2: "strategic",
  3: "operational",
  4: "immediate",
};

export const GOAL_LEVEL_LABELS: Record<GoalLevel, string> = {
  1: "Permanent Mission",
  2: "Strategic Goal",
  3: "Operational Goal",
  4: "Immediate Goal",
};

export type GoalStatus = "active" | "completed" | "paused" | "violated" | "pending";

export type GoalCategory =
  | "capital_preservation"
  | "risk_management"
  | "execution_quality"
  | "profitability"
  | "drawdown_control"
  | "trade_quality"
  | "exposure_control"
  | "market_observation"
  | "portfolio_management"
  | "recovery"
  | "compliance";

// ─── Goal Object ─────────────────────────────────────────────────────────────

export interface Goal {
  goalId:              string;
  level:               GoalLevel;
  levelName:           GoalLevelName;
  levelLabel:          string;
  category:            GoalCategory;
  title:               string;
  description:         string;

  // Measurability
  metric:              string;    // e.g. "drawdownPct", "winRate", "profitFactor"
  target:              number;    // target value
  current:             number;    // current value
  unit:                string;    // e.g. "%", "R", "ratio"
  higherIsBetter:      boolean;   // direction of improvement

  // Prioritization
  priority:            number;    // 0-100 composite priority score
  importance:          number;    // 0-100 strategic importance
  urgency:             number;    // 0-100 time pressure
  expectedImpact:      number;    // 0-100 if achieved
  riskIfUnmet:         number;    // 0-100 consequence of failure
  confidence:          number;    // 0-100 confidence in assessment

  // Status
  status:              GoalStatus;
  progress:            number;    // 0-100 completion %
  estimatedCompletion: string;    // ISO string estimate
  obstacles:           string[];
  evidence:            string[];  // supporting intelligence evidence
  whyThisRank:         string;    // explainability
}

// ─── Goal Conflict ────────────────────────────────────────────────────────────

export type ConflictType =
  | "opportunity_vs_risk"
  | "expansion_vs_consolidation"
  | "speed_vs_quality"
  | "short_vs_long_term"
  | "exposure_vs_opportunity"
  | "aggressive_vs_defensive";

export interface GoalConflict {
  conflictId:        string;
  conflictType:      ConflictType;
  goalA:             Goal;
  goalB:             Goal;
  conflictSummary:   string;
  resolution:        string;    // which goal wins and why
  winnerGoalId:      string;
  supportingEvidence: string[];
  historicalRefs:    string[];
  confidence:        number;    // 0-100
}

// ─── Planning ─────────────────────────────────────────────────────────────────

export type PlanHorizon = "immediate" | "short_term" | "medium_term" | "long_term";

export interface PlanAction {
  actionId:    string;
  description: string;
  goalId:      string;   // linked goal
  horizon:     PlanHorizon;
  priority:    number;   // 0-100
  rationale:   string;
}

export interface ExecutivePlan {
  planId:       string;
  horizon:      PlanHorizon;
  horizonLabel: string;
  timeframe:    string;  // e.g. "next trade", "next 4h", "next week"
  title:        string;
  summary:      string;
  actions:      PlanAction[];
  linkedGoals:  string[];  // goalIds
  confidence:   number;
  risks:        string[];
  expectedBenefits: string[];
}

// ─── Progress Tracking ────────────────────────────────────────────────────────

export interface GoalProgress {
  goalId:      string;
  title:       string;
  level:       GoalLevel;
  progress:    number;   // 0-100
  trend:       "improving" | "stable" | "declining";
  velocity:    number;   // rate of change per cycle
  obstacles:   string[];
  confidence:  number;
  health:      "healthy" | "at_risk" | "critical" | "violated";
  nextMilestone: string;
}

// ─── Mission Health ───────────────────────────────────────────────────────────

export type MissionHealthStatus = "optimal" | "healthy" | "degraded" | "critical" | "violated";

export interface MissionHealth {
  overallScore:       number;   // 0-100
  status:             MissionHealthStatus;
  level1Adherence:    number;   // permanent mission adherence 0-100
  goalAchievement:    number;   // active goals on track 0-100
  planConsistency:    number;   // plan alignment 0-100
  conflictResolution: number;   // conflict resolution quality 0-100
  breakdown:          string[];
}

// ─── Master Executive Mission Object ──────────────────────────────────────────

export interface ExecutiveMission {
  missionId:         string;
  evaluatedAt:       string;
  pair:              string;
  timeframe:         string;

  // Intelligence snapshot
  intelligenceSnapshot: {
    executiveScore:  number;
    riskScore:       number;
    drawdownPct:     number;
    winRate:         number;
    profitFactor:    number;
    openPositions:   number;
    crisisStatus:    string;
    survivalMode:    boolean;
  };

  // Goals (all 4 levels)
  goals:             Goal[];
  activeGoals:       Goal[];
  permanentMission:  Goal[];

  // Priority rankings
  priorityRankings:  Goal[];  // sorted by priority descending

  // Conflicts
  conflicts:         GoalConflict[];

  // Plans (4 horizons)
  plans:             ExecutivePlan[];
  immediatePlan:     ExecutivePlan;
  shortTermPlan:     ExecutivePlan;
  mediumTermPlan:    ExecutivePlan;
  longTermPlan:      ExecutivePlan;

  // Progress
  progressReports:   GoalProgress[];

  // Health
  missionHealth:     MissionHealth;
  confidence:        number;
  supportingEvidence: string[];

  // Meta
  isAdvisoryOnly:    true;
  engineVersion:     string;
  durationMs:        number;
}

// ─── Orchestrator Input ───────────────────────────────────────────────────────

export interface RunMissionInput {
  pair?:            string;
  timeframe?:       string;
  strategyResult?:  Record<string, unknown> | null;
  erbResult?:       Record<string, unknown> | null;
  tradeMetrics?:    {
    drawdownPct?:   number;
    winRate?:       number;
    profitFactor?:  number;
    openPositions?: number;
    dailyPnL?:      number;
  };
}
