import { runWalkForward } from "../backtest/walkforward.js";
import type { StageResult, Finding } from "./types.js";

function yearsAgo(n: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runStage4(): Promise<StageResult> {
  const t0 = Date.now();
  const findings: Finding[] = [];
  const blockers: string[] = [];

  let wfResult: Awaited<ReturnType<typeof runWalkForward>> | null = null;

  try {
    wfResult = await runWalkForward({
      initialBalance: 10000,
      trainWindowYears: 0.5,
      testWindowYears: 0.25,
      overallStartDate: yearsAgo(2),
      overallEndDate: today(),
    });
  } catch (err) {
    findings.push({ level: "warn", message: `Walk-forward validation failed: ${String(err)}` });
    return {
      id: 4,
      name: "Walk-Forward Validation",
      status: "skip",
      score: 50,
      findings,
      blockers,
      durationMs: Date.now() - t0,
      details: { error: String(err) },
    };
  }

  const { summary, pairs } = wfResult;
  const windows = pairs.flatMap((p) => p.windows);

  findings.push({
    level: "info",
    message: `${windows.length} walk-forward window(s) evaluated`,
  });

  const { avgEfficiencyRatio, avgOverfitScore, stableParams, regimeSensitive, recommendation } = summary;

  if (recommendation === "Pass") {
    findings.push({ level: "info", message: `Recommendation: PASS — strategy generalises well to unseen data` });
  } else if (recommendation === "Marginal") {
    findings.push({ level: "warn", message: `Recommendation: MARGINAL — strategy shows some overfitting signs` });
  } else {
    findings.push({ level: "critical", message: `Recommendation: OVERFIT — strategy does not generalise to unseen data` });
    blockers.push("Walk-forward validation: strategy is overfitting — do not deploy without re-optimisation");
  }

  findings.push({
    level: avgEfficiencyRatio >= 0.7 ? "info" : avgEfficiencyRatio >= 0.5 ? "warn" : "critical",
    message: `Efficiency ratio: ${avgEfficiencyRatio.toFixed(2)} (train→test performance retention; ≥0.7 = good)`,
  });

  findings.push({
    level: avgOverfitScore <= 0.3 ? "info" : avgOverfitScore <= 0.6 ? "warn" : "critical",
    message: `Overfit score: ${avgOverfitScore.toFixed(2)} (≤0.3 = low overfit risk)`,
  });

  if (!stableParams) {
    findings.push({ level: "warn", message: "Optimal parameters are unstable across windows — strategy is parameter-sensitive" });
  } else {
    findings.push({ level: "info", message: "Optimal parameters are stable across windows" });
  }

  if (regimeSensitive) {
    findings.push({ level: "warn", message: "Strategy performance is regime-sensitive — ensure regime filter is active in production" });
  }

  const windowsOverfit = windows.filter((w) => w.overfit).length;
  if (windowsOverfit > 0) {
    findings.push({ level: "warn", message: `${windowsOverfit}/${windows.length} windows show overfit characteristics` });
  }

  let score: number;
  if (recommendation === "Pass") {
    score = Math.min(100, Math.round(avgEfficiencyRatio * 100));
  } else if (recommendation === "Marginal") {
    score = Math.min(70, Math.round(avgEfficiencyRatio * 80));
  } else {
    score = Math.max(0, Math.round(avgEfficiencyRatio * 40));
  }

  const status = recommendation === "Pass" ? "pass" : recommendation === "Marginal" ? "warn" : "fail";

  return {
    id: 4,
    name: "Walk-Forward Validation",
    status,
    score,
    findings,
    blockers,
    durationMs: Date.now() - t0,
    details: {
      windows: windows.length,
      avgEfficiencyRatio: Math.round(avgEfficiencyRatio * 1000) / 1000,
      avgOverfitScore: Math.round(avgOverfitScore * 1000) / 1000,
      stableParams,
      regimeSensitive,
      recommendation,
      windowsOverfit,
      windowDetail: windows.map((w) => ({
        id: w.windowId,
        trainStart: w.trainStart,
        testEnd: w.testEnd,
        efficiencyRatio: Math.round(w.efficiencyRatio * 1000) / 1000,
        overfit: w.overfit,
        testWinRate: Math.round(w.testStats.winRate * 10) / 10,
        testPF: Math.round(w.testStats.profitFactor * 100) / 100,
      })),
    },
  };
}
