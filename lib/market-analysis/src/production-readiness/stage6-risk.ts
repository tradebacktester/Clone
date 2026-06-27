import { db } from "@workspace/db";
import { botConfigTable, riskSettingsTable, botStateTable } from "@workspace/db/schema";
import type { StageResult, Finding } from "./types.js";

interface RiskCheck {
  name: string;
  value: string | number | boolean;
  status: "pass" | "warn" | "fail";
  message: string;
}

export async function runStage6(): Promise<StageResult> {
  const t0 = Date.now();
  const findings: Finding[] = [];
  const blockers: string[] = [];
  const checks: RiskCheck[] = [];

  let config: Record<string, unknown> = {};
  let riskSettings: Record<string, unknown> = {};
  let botState: Record<string, unknown> = {};

  try {
    const [cfg] = await db.select().from(botConfigTable).limit(1);
    if (cfg) config = cfg as unknown as Record<string, unknown>;
  } catch { /* no config yet */ }

  try {
    const [rs] = await db.select().from(riskSettingsTable).limit(1);
    if (rs) riskSettings = rs as unknown as Record<string, unknown>;
  } catch { /* no risk settings yet */ }

  try {
    const [bs] = await db.select().from(botStateTable).limit(1);
    if (bs) botState = bs as unknown as Record<string, unknown>;
  } catch { /* no bot state yet */ }

  const riskPerTrade = parseFloat(String(config.riskPerTrade ?? "0.75"));
  const maxDailyLoss = parseFloat(String(config.maxDailyLoss ?? "3"));
  const maxWeeklyLoss = parseFloat(String(config.maxWeeklyLoss ?? "6"));
  const trailingEnabled = Boolean(config.trailingStopEnabled ?? true);
  const newsFilterEnabled = Boolean(config.newsFilterEnabled ?? true);
  const emergencyStop = Boolean(botState.emergencyStop ?? false);
  const haltedDueToRisk = Boolean(botState.haltedDueToRisk ?? false);
  const breakEvenAt = parseFloat(String(riskSettings.breakEvenAt ?? "0.5"));
  const trailingStopAt = parseFloat(String(riskSettings.trailingStopAt ?? "1.0"));
  const maxOpenTrades = parseInt(String(riskSettings.maxOpenTrades ?? "3"));

  checks.push({
    name: "Risk Per Trade",
    value: `${riskPerTrade}%`,
    status: riskPerTrade > 0 && riskPerTrade <= 2 ? "pass" : riskPerTrade <= 3 ? "warn" : "fail",
    message: riskPerTrade <= 2 ? `${riskPerTrade}% — within safe bounds (≤2%)` : riskPerTrade <= 3 ? `${riskPerTrade}% — elevated; recommended ≤2%` : `${riskPerTrade}% — too high; must be ≤2% for live trading`,
  });

  checks.push({
    name: "Daily Loss Limit",
    value: `${maxDailyLoss}%`,
    status: maxDailyLoss > 0 && maxDailyLoss <= 5 ? "pass" : maxDailyLoss <= 7 ? "warn" : "fail",
    message: maxDailyLoss <= 5 ? `${maxDailyLoss}% daily limit — within safe bounds (≤5%)` : `${maxDailyLoss}% exceeds recommended 5% daily limit`,
  });

  checks.push({
    name: "Weekly Loss Limit",
    value: `${maxWeeklyLoss}%`,
    status: maxWeeklyLoss > 0 && maxWeeklyLoss <= 10 ? "pass" : maxWeeklyLoss <= 15 ? "warn" : "fail",
    message: maxWeeklyLoss <= 10 ? `${maxWeeklyLoss}% weekly limit — within safe bounds (≤10%)` : `${maxWeeklyLoss}% exceeds recommended 10% weekly limit`,
  });

  checks.push({
    name: "Trailing Stop",
    value: trailingEnabled,
    status: trailingEnabled ? "pass" : "warn",
    message: trailingEnabled ? "Trailing stop is enabled — profit protection active" : "Trailing stop is disabled — open trades have no downside protection after move",
  });

  checks.push({
    name: "Break-Even Logic",
    value: `${breakEvenAt}%`,
    status: breakEvenAt > 0 ? "pass" : "warn",
    message: breakEvenAt > 0 ? `Break-even triggered at +${breakEvenAt}% — risk-free zone active` : "Break-even not configured — trades stay at full risk even when in profit",
  });

  checks.push({
    name: "News Filter",
    value: newsFilterEnabled,
    status: newsFilterEnabled ? "pass" : "warn",
    message: newsFilterEnabled ? "News filter enabled — high-impact events blocked" : "News filter disabled — trades may execute during high-volatility news events",
  });

  checks.push({
    name: "Emergency Stop",
    value: emergencyStop,
    status: emergencyStop ? "fail" : "pass",
    message: emergencyStop ? "EMERGENCY STOP IS ACTIVE — bot will not trade" : "Emergency stop is not triggered — bot can operate normally",
  });

  checks.push({
    name: "Risk Halt Active",
    value: haltedDueToRisk,
    status: haltedDueToRisk ? "warn" : "pass",
    message: haltedDueToRisk ? "Bot is halted due to risk limit breach — will auto-resume next session" : "No active risk halt",
  });

  checks.push({
    name: "Max Open Trades",
    value: maxOpenTrades,
    status: maxOpenTrades > 0 && maxOpenTrades <= 5 ? "pass" : maxOpenTrades <= 8 ? "warn" : "fail",
    message: maxOpenTrades <= 5 ? `Maximum ${maxOpenTrades} concurrent positions — within safe concurrency` : `${maxOpenTrades} concurrent positions may increase correlated drawdown`,
  });

  checks.push({
    name: "Trailing Stop Trigger",
    value: `+${trailingStopAt}%`,
    status: trailingStopAt > 0 ? "pass" : "warn",
    message: trailingStopAt > 0 ? `Trailing stop activates at +${trailingStopAt}% — adequate trigger level` : "Trailing stop trigger not configured",
  });

  for (const check of checks) {
    findings.push({
      level: check.status === "pass" ? "info" : check.status === "warn" ? "warn" : "critical",
      message: `[${check.name}] ${check.message}`,
    });
    if (check.status === "fail") {
      blockers.push(`Risk check failed: ${check.name} — ${check.message}`);
    }
  }

  const passed = checks.filter((c) => c.status === "pass").length;
  const warned = checks.filter((c) => c.status === "warn").length;
  const failed = checks.filter((c) => c.status === "fail").length;

  const score = Math.max(0, Math.min(100, Math.round((passed / checks.length) * 100 - warned * 5)));
  const status = failed > 0 ? "fail" : warned > 2 ? "warn" : "pass";

  return {
    id: 6,
    name: "Risk Validation",
    status,
    score,
    findings,
    blockers,
    durationMs: Date.now() - t0,
    details: {
      checksTotal: checks.length,
      checksPassed: passed,
      checksWarned: warned,
      checksFailed: failed,
      checks,
      config: {
        riskPerTrade,
        maxDailyLoss,
        maxWeeklyLoss,
        trailingEnabled,
        newsFilterEnabled,
        breakEvenAt,
        trailingStopAt,
        maxOpenTrades,
        emergencyStop,
        haltedDueToRisk,
      },
    },
  };
}
