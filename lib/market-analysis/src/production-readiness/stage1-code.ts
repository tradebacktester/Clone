import { spawn } from "child_process";
import { existsSync } from "fs";
import type { StageResult, Finding } from "./types.js";

const TSX_BIN =
  "/home/runner/workspace/node_modules/.pnpm/node_modules/.bin/tsx";
const CWD = "/home/runner/workspace";

const TEST_FILES = [
  "lib/market-analysis/src/market_regime/__tests__/regime.test.ts",
  "lib/market-analysis/src/replay/__tests__/replay-engine.test.ts",
  "lib/market-analysis/src/replay/__tests__/rule-evaluator.test.ts",
  "lib/market-analysis/src/replay/__tests__/bias-detector.test.ts",
  "lib/market-analysis/src/backtest/__tests__/montecarlo.test.ts",
  "lib/market-analysis/src/tests/v2-correlation.test.ts",
  "lib/market-analysis/src/tests/v2-dynamic-sizing.test.ts",
  "lib/market-analysis/src/tests/v2-mtf.test.ts",
  "lib/market-analysis/src/tests/v2-tqi.test.ts",
];

interface TestFileResult {
  file: string;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

function runTestFile(filePath: string): Promise<TestFileResult> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const chunks: string[] = [];
    const proc = spawn(TSX_BIN, ["--test", filePath], {
      cwd: CWD,
      env: { ...process.env, NODE_ENV: "test" },
    });
    proc.stdout.on("data", (d: Buffer) => chunks.push(d.toString()));
    proc.stderr.on("data", (d: Buffer) => chunks.push(d.toString()));
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
    }, 45000);
    proc.on("close", () => {
      clearTimeout(timer);
      const out = chunks.join("");
      const passMatch = out.match(/# pass (\d+)/);
      const failMatch = out.match(/# fail (\d+)/);
      const skipMatch = out.match(/# skip (\d+)/);
      resolve({
        file: filePath.split("/").pop() ?? filePath,
        passed: passMatch ? parseInt(passMatch[1]) : 0,
        failed: failMatch ? parseInt(failMatch[1]) : 0,
        skipped: skipMatch ? parseInt(skipMatch[1]) : 0,
        durationMs: Date.now() - t0,
      });
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve({ file: filePath.split("/").pop() ?? filePath, passed: 0, failed: 0, skipped: 0, durationMs: Date.now() - t0 });
    });
  });
}

export async function runStage1(): Promise<StageResult> {
  const t0 = Date.now();
  const findings: Finding[] = [];
  const blockers: string[] = [];

  const existingFiles = TEST_FILES.filter((f) => existsSync(`${CWD}/${f}`));
  const missingFiles = TEST_FILES.filter((f) => !existsSync(`${CWD}/${f}`));

  if (missingFiles.length > 0) {
    findings.push({
      level: "warn",
      message: `${missingFiles.length} test file(s) not found: ${missingFiles.map((f) => f.split("/").pop()).join(", ")}`,
    });
  }

  const fileResults: TestFileResult[] = [];
  for (const file of existingFiles) {
    const r = await runTestFile(file);
    fileResults.push(r);
    if (r.failed > 0) {
      findings.push({ level: "critical", message: `${r.file}: ${r.failed} test(s) FAILING` });
    } else if (r.passed === 0) {
      findings.push({ level: "warn", message: `${r.file}: no tests detected in output` });
    } else {
      findings.push({ level: "info", message: `${r.file}: ${r.passed} tests passing` });
    }
  }

  const totalPassed = fileResults.reduce((s, r) => s + r.passed, 0);
  const totalFailed = fileResults.reduce((s, r) => s + r.failed, 0);
  const totalTests = totalPassed + totalFailed;
  const passRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;

  if (totalFailed > 0) {
    blockers.push(`${totalFailed} test(s) failing — all tests must pass before deployment`);
  }
  if (existingFiles.length === 0) {
    blockers.push("No test suites found — test coverage cannot be verified");
  }

  findings.push({
    level: totalFailed === 0 && totalTests > 0 ? "info" : "warn",
    message: `Overall: ${totalPassed}/${totalTests} tests passing across ${existingFiles.length} suites`,
  });

  const coveragePenalty = missingFiles.length * 3;
  const score = totalTests === 0
    ? 0
    : Math.max(0, Math.min(100, Math.round(passRate - coveragePenalty)));

  const status = totalFailed > 0 ? "fail" : totalTests === 0 ? "warn" : "pass";

  return {
    id: 1,
    name: "Code Validation",
    status,
    score,
    findings,
    blockers,
    durationMs: Date.now() - t0,
    details: {
      totalPassed,
      totalFailed,
      totalTests,
      passRate: Math.round(passRate * 10) / 10,
      suitesFound: existingFiles.length,
      suitesMissing: missingFiles.length,
      fileResults,
    },
  };
}
