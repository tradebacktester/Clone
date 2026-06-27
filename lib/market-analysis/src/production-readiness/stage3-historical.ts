import { runBacktest } from "../backtest/engine.js";
import type { Pair } from "../types.js";
import type { StageResult, Finding } from "./types.js";

const PAIRS: Pair[] = ["EURUSD", "GBPUSD", "USDJPY"];

function yearsAgo(n: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface PairBacktestSummary {
  pair: Pair;
  status: "ok" | "no-data" | "error";
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalPnl: number;
  dataSource: string;
  dataCoveragePct: number;
  dataWarnings: string[];
}

function detectDegradation(summaries: PairBacktestSummary[]): string[] {
  const issues: string[] = [];
  for (const s of summaries) {
    if (s.status !== "ok") continue;
    if (s.profitFactor < 1.0 && s.totalTrades > 5) {
      issues.push(`${s.pair}: Profit factor ${s.profitFactor.toFixed(2)} < 1.0 — strategy is losing money on historical data`);
    }
    if (s.winRate < 35 && s.totalTrades > 5) {
      issues.push(`${s.pair}: Win rate ${s.winRate.toFixed(1)}% is critically low`);
    }
    if (s.maxDrawdown > 25) {
      issues.push(`${s.pair}: Max drawdown ${s.maxDrawdown.toFixed(1)}% exceeds 25% threshold`);
    }
  }
  return issues;
}

export async function runStage3(): Promise<StageResult> {
  const t0 = Date.now();
  const findings: Finding[] = [];
  const blockers: string[] = [];

  const startDate = yearsAgo(2);
  const endDate = today();
  const summaries: PairBacktestSummary[] = [];

  await Promise.allSettled(
    PAIRS.map(async (pair) => {
      try {
        const result = await runBacktest({
          pair,
          startDate,
          endDate,
          initialBalance: 10000,
          riskPerTrade: 1,
          timeframe: "1h",
          sessions: ["london", "newyork"],
          enableNewsFilter: false,
          enableRL: false,
        });

        const hasData = !result.dataSynthetic && (result.dataCoveragePct ?? 0) > 10;

        summaries.push({
          pair,
          status: hasData ? "ok" : "no-data",
          totalTrades: result.totalTrades,
          winRate: result.winRate,
          profitFactor: result.profitFactor,
          sharpeRatio: result.sharpeRatio,
          maxDrawdown: result.maxDrawdown,
          totalPnl: result.totalPnl,
          dataSource: result.dataSource ?? "unknown",
          dataCoveragePct: result.dataCoveragePct ?? 0,
          dataWarnings: result.dataWarnings ?? [],
        });
      } catch (err) {
        summaries.push({
          pair,
          status: "error",
          totalTrades: 0,
          winRate: 0,
          profitFactor: 0,
          sharpeRatio: 0,
          maxDrawdown: 0,
          totalPnl: 0,
          dataSource: "error",
          dataCoveragePct: 0,
          dataWarnings: [String(err)],
        });
      }
    }),
  );

  const okPairs = summaries.filter((s) => s.status === "ok");
  const noDataPairs = summaries.filter((s) => s.status === "no-data");
  const errorPairs = summaries.filter((s) => s.status === "error");

  for (const s of okPairs) {
    const pf = s.totalTrades > 0 ? `PF ${s.profitFactor.toFixed(2)}, WR ${s.winRate.toFixed(1)}%, DD ${s.maxDrawdown.toFixed(1)}%` : "0 trades";
    findings.push({
      level: s.profitFactor >= 1.2 ? "info" : s.profitFactor >= 1.0 ? "warn" : "critical",
      message: `${s.pair}: ${pf} over ${s.dataCoveragePct.toFixed(0)}% coverage (${s.dataSource})`,
    });
  }

  for (const s of noDataPairs) {
    findings.push({
      level: "warn",
      message: `${s.pair}: Insufficient real data for backtesting. ${s.dataWarnings[0] ?? "Configure a data provider."}`,
    });
  }

  for (const s of errorPairs) {
    findings.push({ level: "critical", message: `${s.pair}: Backtest error — ${s.dataWarnings[0] ?? "unknown error"}` });
  }

  const degradationIssues = detectDegradation(summaries);
  for (const issue of degradationIssues) {
    findings.push({ level: "critical", message: issue });
    blockers.push(issue);
  }

  if (noDataPairs.length === PAIRS.length) {
    blockers.push("No historical data available for any supported pair — configure OANDA, Dukascopy, or upload HistData CSVs");
  }

  findings.push({
    level: "info",
    message: `${okPairs.length}/${PAIRS.length} pairs have sufficient real data for backtesting`,
  });

  const avgPF = okPairs.length > 0
    ? okPairs.reduce((s, r) => s + r.profitFactor, 0) / okPairs.length
    : 0;
  const dataScore = (okPairs.length / PAIRS.length) * 60;
  const perfScore = avgPF >= 1.5 ? 40 : avgPF >= 1.2 ? 30 : avgPF >= 1.0 ? 20 : avgPF > 0 ? 10 : 0;
  const score = Math.min(100, Math.round(dataScore + perfScore));

  const status = blockers.length > 0 ? "fail" : noDataPairs.length > 0 ? "warn" : "pass";

  return {
    id: 3,
    name: "Historical Validation",
    status,
    score,
    findings,
    blockers,
    durationMs: Date.now() - t0,
    details: {
      startDate,
      endDate,
      pairsTotal: PAIRS.length,
      pairsWithData: okPairs.length,
      pairsNoData: noDataPairs.length,
      pairsError: errorPairs.length,
      summaries,
      avgProfitFactor: Math.round(avgPF * 100) / 100,
      degradationIssues,
    },
  };
}
