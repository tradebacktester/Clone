import type { StageResult, CategoryScores, PipelineResult } from "./types.js";

const WEIGHTS: Record<keyof CategoryScores, number> = {
  architecture: 0.12,
  strategy: 0.20,
  testing: 0.15,
  dataQuality: 0.15,
  riskManagement: 0.15,
  performance: 0.13,
  reliability: 0.10,
};

function evaluateArchitecture(): number {
  return 90;
}

function stageScore(stages: StageResult[], id: number): number {
  return stages.find((s) => s.id === id)?.score ?? 50;
}

function avgScore(scores: number[]): number {
  if (scores.length === 0) return 50;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function computeScores(stages: StageResult[]): CategoryScores {
  return {
    architecture: evaluateArchitecture(),
    strategy: stageScore(stages, 2),
    testing: stageScore(stages, 1),
    dataQuality: stageScore(stages, 7),
    riskManagement: stageScore(stages, 6),
    performance: Math.round(avgScore([stageScore(stages, 3), stageScore(stages, 4)])),
    reliability: stageScore(stages, 5),
  };
}

export function computeOverallScore(cats: CategoryScores): number {
  let score = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    score += cats[key as keyof CategoryScores] * weight;
  }
  return Math.round(score);
}

export function computeVerdict(score: number): PipelineResult["verdict"] {
  if (score >= 80) return "production-ready";
  if (score >= 60) return "needs-work";
  return "not-ready";
}

export function collectBlockers(stages: StageResult[]): string[] {
  const seen = new Set<string>();
  const blockers: string[] = [];
  for (const s of stages) {
    for (const b of s.blockers) {
      if (!seen.has(b)) {
        seen.add(b);
        blockers.push(b);
      }
    }
  }
  return blockers;
}

export function generateRecommendations(
  stages: StageResult[],
  cats: CategoryScores,
  blockers: string[],
): string[] {
  const recs: string[] = [];

  if (cats.testing < 80) {
    recs.push("Expand test coverage — add integration tests for the bot engine, paper-engine, and order execution path");
  }

  if (cats.dataQuality < 70) {
    recs.push("Connect a premium data provider (OANDA or Dukascopy) for reliable multi-year historical data across all pairs");
  }

  if (cats.riskManagement < 80) {
    const riskStage = stages.find((s) => s.id === 6);
    const failedChecks = riskStage?.details?.checksFailed as number ?? 0;
    if (failedChecks > 0) {
      recs.push("Fix all failing risk checks before enabling live trading — review daily/weekly loss limits and position sizing");
    }
  }

  if (cats.performance < 60) {
    recs.push("Improve historical backtest performance — review zone detection parameters and entry/exit logic on available data");
  }

  if (cats.reliability < 70) {
    recs.push("Review Monte Carlo results — reduce risk per trade or improve win rate to bring ruin probability below 5%");
  }

  if (cats.strategy < 70) {
    recs.push("Address strategy rule violations — ensure every trade has a valid zone, setup score, and minimum R:R of 1.5:1");
  }

  const wfStage = stages.find((s) => s.id === 4);
  if (wfStage?.status === "fail") {
    recs.push("Walk-forward validation failed (overfitting detected) — reduce strategy parameters or use wider training windows");
  }

  recs.push("Before going live: connect broker account (OANDA/MT5), test one week in paper mode, verify all API endpoints respond under load");
  recs.push("Enable position monitoring alerts and set up an external watchdog to auto-halt on connectivity loss");

  if (blockers.length === 0) {
    recs.unshift("All critical checks pass — proceed with a 2-week paper trading validation period before enabling live execution");
  }

  return recs.slice(0, 8);
}
