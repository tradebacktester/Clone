import { writeFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { runStage1 } from "./stage1-code.js";
import { runStage2 } from "./stage2-strategy.js";
import { runStage3 } from "./stage3-historical.js";
import { runStage4 } from "./stage4-walkforward.js";
import { runStage5 } from "./stage5-montecarlo.js";
import { runStage6 } from "./stage6-risk.js";
import { runStage7 } from "./stage7-data.js";
import { computeScores, computeOverallScore, computeVerdict, collectBlockers, generateRecommendations } from "./stage8-score.js";
import { generateReport } from "./report.js";
import type { StageResult, PipelineResult, PipelineStatus, StageProgress } from "./types.js";

const REPORTS_DIR = join(process.cwd(), "reports", "production-readiness");
const LATEST_JSON = join(REPORTS_DIR, "latest.json");
const REPORT_MD = join(process.cwd(), "PRODUCTION_READINESS_REPORT.md");

const STAGE_NAMES = [
  "Code Validation",
  "Strategy Validation",
  "Historical Validation",
  "Walk-Forward Validation",
  "Monte Carlo Analysis",
  "Risk Validation",
  "Data Validation",
];

interface PipelineState {
  status: "idle" | "running" | "complete" | "failed";
  currentStage: number;
  startedAt?: string;
  completedAt?: string;
  stages: StageProgress[];
  result?: PipelineResult;
  error?: string;
}

const state: PipelineState = {
  status: "idle",
  currentStage: 0,
  stages: STAGE_NAMES.map((name, i) => ({ id: i + 1, name, status: "skip" })),
};

function setStageStatus(id: number, status: StageResult["status"]) {
  const idx = state.stages.findIndex((s) => s.id === id);
  if (idx >= 0) state.stages[idx].status = status;
}

async function runStage<T extends StageResult>(
  id: number,
  fn: () => Promise<T>,
): Promise<T> {
  state.currentStage = id;
  setStageStatus(id, "running");
  try {
    const result = await fn();
    setStageStatus(id, result.status);
    return result;
  } catch (err) {
    const errorResult: StageResult = {
      id,
      name: STAGE_NAMES[id - 1] ?? `Stage ${id}`,
      status: "fail",
      score: 0,
      findings: [{ level: "critical", message: `Stage crashed: ${String(err)}` }],
      blockers: [`Stage ${id} (${STAGE_NAMES[id - 1]}) failed to run: ${String(err)}`],
      durationMs: 0,
      details: { error: String(err) },
    };
    setStageStatus(id, "fail");
    return errorResult as T;
  }
}

export async function startPipeline(): Promise<void> {
  if (state.status === "running") {
    throw new Error("Pipeline already running");
  }

  if (!existsSync(REPORTS_DIR)) {
    await mkdir(REPORTS_DIR, { recursive: true });
  }

  const id = randomUUID();
  const startedAt = new Date().toISOString();

  state.status = "running";
  state.currentStage = 0;
  state.startedAt = startedAt;
  state.completedAt = undefined;
  state.error = undefined;
  state.result = undefined;
  state.stages = STAGE_NAMES.map((name, i) => ({ id: i + 1, name, status: "skip" }));

  setImmediate(async () => {
    const stageResults: StageResult[] = [];

    try {
      stageResults.push(await runStage(1, runStage1));
      stageResults.push(await runStage(2, runStage2));
      stageResults.push(await runStage(3, runStage3));
      stageResults.push(await runStage(4, runStage4));
      stageResults.push(await runStage(5, runStage5));
      stageResults.push(await runStage(6, runStage6));
      stageResults.push(await runStage(7, runStage7));

      const categoryScores = computeScores(stageResults);
      const overallScore = computeOverallScore(categoryScores);
      const verdict = computeVerdict(overallScore);
      const criticalBlockers = collectBlockers(stageResults);
      const recommendations = generateRecommendations(stageResults, categoryScores, criticalBlockers);
      const completedAt = new Date().toISOString();
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

      const result: PipelineResult = {
        id,
        startedAt,
        completedAt,
        durationMs,
        overallScore,
        verdict,
        stages: stageResults,
        categoryScores,
        criticalBlockers,
        recommendations,
        reportPath: REPORT_MD,
      };

      const markdown = generateReport(result);
      await writeFile(REPORT_MD, markdown, "utf-8");
      await writeFile(LATEST_JSON, JSON.stringify(result, null, 2), "utf-8");

      state.status = "complete";
      state.completedAt = completedAt;
      state.currentStage = 8;
      state.result = result;
    } catch (err) {
      state.status = "failed";
      state.error = String(err);
      state.completedAt = new Date().toISOString();
    }
  });
}

export function getPipelineStatus(): PipelineStatus {
  return {
    status: state.status,
    currentStage: state.currentStage,
    totalStages: STAGE_NAMES.length,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    stages: state.stages,
    error: state.error,
  };
}

export function getLatestResult(): PipelineResult | null {
  return state.result ?? null;
}

export async function loadLatestResultFromDisk(): Promise<PipelineResult | null> {
  try {
    const raw = await readFile(LATEST_JSON, "utf-8");
    return JSON.parse(raw) as PipelineResult;
  } catch {
    return null;
  }
}
