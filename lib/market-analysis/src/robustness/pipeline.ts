/**
 * Robustness Pipeline Orchestrator
 * Runs all 7 sub-engines sequentially, builds the composite score,
 * and stores the result in the database.
 */
import { runParameterSensitivity } from "./parameter-sensitivity.js";
import { runMarketStressTests } from "./market-stress.js";
import { runExecutionStressTests } from "./execution-stress.js";
import { runRiskStressTests } from "./risk-stress.js";
import { runWalkForwardRobustness } from "./walk-forward-robustness.js";
import { runOOSValidation } from "./out-of-sample.js";
import { runConfidenceStability } from "./confidence-stability.js";
import { computeRobustnessScore } from "./robustness-score.js";
import type {
  RobustnessPipelineConfig,
  RobustnessPipelineResult,
  PipelineStatus,
} from "./types.js";

let _status: PipelineStatus = { status: "idle", stage: "", progress: 0 };
let _latestResult: RobustnessPipelineResult | null = null;

export function getRobustnessPipelineStatus(): PipelineStatus {
  return { ..._status };
}

export function getLatestRobustnessResult(): RobustnessPipelineResult | null {
  return _latestResult;
}

function setStatus(status: PipelineStatus["status"], stage: string, progress: number, error?: string) {
  _status = { status, stage, progress, startedAt: _status.startedAt, completedAt: _status.completedAt, error };
  if (status === "running" && !_status.startedAt) {
    _status.startedAt = new Date().toISOString();
  }
}

function buildFindings(result: Omit<RobustnessPipelineResult, "findings" | "recommendations" | "score">): string[] {
  const findings: string[] = [];
  findings.push(...result.sensitivity.findings);
  findings.push(...result.marketStress.findings);
  findings.push(...result.executionStress.findings);
  findings.push(...result.riskStress.findings);
  findings.push(...result.walkForward.findings);
  findings.push(...result.oos.findings);
  findings.push(...result.confidenceStability.findings);
  return findings;
}

function buildRecommendations(result: RobustnessPipelineResult): string[] {
  const recs: string[] = [];
  const score = result.score;

  if (score.breakdown.stability < 50) {
    recs.push("Stability: Widen parameter ranges or reduce the number of optimized parameters — over-optimization is causing instability");
    const sensitive = result.sensitivity.sensitiveParameters;
    if (sensitive.length > 0) {
      recs.push(`Focus stability efforts on: ${sensitive.join(", ")} (most sensitive parameters)`);
    }
  }

  if (score.breakdown.generalization < 55) {
    recs.push("Generalization: Reduce parameter optimization on in-sample data; use regularization or simpler rules to improve OOS performance");
  }

  if (score.breakdown.riskResilience < 55) {
    recs.push("Risk resilience: Review max consecutive loss limits and drawdown halt thresholds; consider lowering risk per trade to 0.5%");
    if (result.riskStress.dailyLimitBreaches > 3) {
      recs.push("Daily loss limit triggered frequently — tighten daily limit or reduce position size");
    }
  }

  if (score.breakdown.executionResilience < 55) {
    const worst = result.executionStress.worstImperfection;
    recs.push(`Execution resilience: Worst case is ${worst} — add protection (spread filter, slippage buffer, or partial fill handling)`);
  }

  if (score.breakdown.dataQuality < 55) {
    recs.push("Data quality: Improve market data coverage and add a real data provider (OANDA API / HistData CSV) for more reliable signals");
  }

  const worst = result.marketStress.worstCondition;
  recs.push(`Worst market condition: ${worst} — consider a regime filter that reduces position size or pauses trading in this environment`);

  if (score.overall >= 75) {
    recs.push("Overall: Strategy is robust — proceed to live demo trading with full readiness checklist completed");
  } else if (score.overall >= 55) {
    recs.push("Overall: Strategy is acceptable — continue paper trading and address the highlighted issues before live trading");
  } else {
    recs.push("Overall: Strategy needs significant work before live deployment — focus on the critical findings above");
  }

  return recs;
}

export async function runRobustnessPipeline(config: RobustnessPipelineConfig = {}): Promise<RobustnessPipelineResult> {
  if (_status.status === "running") {
    throw new Error("Robustness pipeline is already running");
  }

  const t0 = Date.now();
  const pair = config.pair ?? "ALL";
  const baseWinRate = config.baseWinRate ?? 52;
  const baseRR = config.baseRR ?? 2.0;
  const numSimTrades = config.numSimTrades ?? 400;
  const riskPerTrade = config.riskPerTrade ?? 0.75;
  const id = `rob_${Date.now()}`;

  _status = { status: "running", stage: "Initializing", progress: 0, startedAt: new Date().toISOString() };

  try {
    const simConfig = { baseWinRate, baseRR, numTrades: numSimTrades, riskPerTrade };

    setStatus("running", "Parameter Sensitivity Analysis", 5);
    const sensitivity = await runParameterSensitivity(simConfig);

    setStatus("running", "Market Stress Testing", 20);
    const marketStress = await runMarketStressTests(simConfig);

    setStatus("running", "Execution Stress Testing", 35);
    const executionStress = await runExecutionStressTests(simConfig);

    setStatus("running", "Risk Stress Testing", 50);
    const riskStress = await runRiskStressTests(simConfig);

    setStatus("running", "Walk-Forward Robustness", 65);
    const walkForward = config.skipWalkForward
      ? await runWalkForwardRobustness({ ...simConfig, numWindows: 3 })
      : await runWalkForwardRobustness({ ...simConfig, numWindows: 6 });

    setStatus("running", "Out-of-Sample Validation", 78);
    const oos = await runOOSValidation(simConfig);

    setStatus("running", "Confidence Stability", 88);
    const confidenceStability = await runConfidenceStability(simConfig);

    setStatus("running", "Computing Robustness Score", 95);
    const score = computeRobustnessScore(
      sensitivity, marketStress, executionStress,
      riskStress, walkForward, oos, confidenceStability,
    );

    const partial = {
      id, runAt: new Date().toISOString(), pair, config,
      sensitivity, marketStress, executionStress, riskStress,
      walkForward, oos, confidenceStability, score,
      durationMs: Date.now() - t0,
    };
    const findings = buildFindings(partial as any);
    const result: RobustnessPipelineResult = {
      ...partial,
      findings,
      recommendations: [],
    };
    result.recommendations = buildRecommendations(result);

    _latestResult = result;
    _status = {
      status: "complete",
      stage: "Complete",
      progress: 100,
      startedAt: _status.startedAt,
      completedAt: new Date().toISOString(),
    };

    return result;
  } catch (err) {
    _status = {
      status: "failed",
      stage: _status.stage,
      progress: _status.progress,
      startedAt: _status.startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
    throw err;
  }
}
