// ─── Risk Intelligence — Account Risk Evaluator ───────────────────────────────
// Evaluates account health across balance, equity, margin, and P/L dimensions.
// Advisory only. NEVER modifies account or positions.

import { randomUUID } from "crypto";
import type {
  AccountState,
  AccountRiskResult,
  RiskClassification,
  RiskAlert,
} from "./types.js";
import { scoreToRiskClassification } from "./scorer.js";

// ─── Limits (industry standard) ──────────────────────────────────────────────

const DAILY_LOSS_LIMIT_PCT    = 3.0;   // 3% daily max loss
const WEEKLY_LOSS_LIMIT_PCT   = 6.0;   // 6% weekly max loss
const MONTHLY_LOSS_LIMIT_PCT  = 12.0;  // 12% monthly max loss
const MAX_OPEN_RISK_PCT       = 5.0;   // 5% total open risk
const CRITICAL_MARGIN_LEVEL   = 110;   // % — below this = critical
const WARNING_MARGIN_LEVEL    = 150;   // % — below this = warning
const HEALTHY_MARGIN_LEVEL    = 500;   // % — above this = healthy

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, isFinite(v) ? v : 0));
}

// ─── Sub-scorers ──────────────────────────────────────────────────────────────

/** Score margin level: 0 = margin call, 100 = excellent margin */
function scoreMarginLevel(marginLevel: number): number {
  if (marginLevel <= 0)                             return 0;
  if (marginLevel < CRITICAL_MARGIN_LEVEL)          return 5;
  if (marginLevel < WARNING_MARGIN_LEVEL)           return 30;
  if (marginLevel < HEALTHY_MARGIN_LEVEL)           return 65;
  return clamp(65 + ((marginLevel - HEALTHY_MARGIN_LEVEL) / 2000) * 35);
}

/** Score daily P&L vs limit: 0 = blew daily limit, 100 = no loss */
function scoreDailyLoss(dailyPnl: number, balance: number): number {
  if (balance <= 0) return 50;
  const lossPct = (-dailyPnl / balance) * 100;
  if (lossPct <= 0)                                    return 100;
  if (lossPct >= DAILY_LOSS_LIMIT_PCT * 1.5)           return 0;
  return clamp(100 - (lossPct / (DAILY_LOSS_LIMIT_PCT * 1.5)) * 100);
}

function scoreWeeklyLoss(weeklyPnl: number, balance: number): number {
  if (balance <= 0) return 50;
  const lossPct = (-weeklyPnl / balance) * 100;
  if (lossPct <= 0)                                      return 100;
  if (lossPct >= WEEKLY_LOSS_LIMIT_PCT * 1.5)            return 0;
  return clamp(100 - (lossPct / (WEEKLY_LOSS_LIMIT_PCT * 1.5)) * 100);
}

/** Score open risk: 0 = way over limit, 100 = no open risk */
function scoreOpenRisk(openRiskPct: number): number {
  if (openRiskPct <= 0)                         return 100;
  if (openRiskPct >= MAX_OPEN_RISK_PCT * 2)     return 0;
  return clamp(100 - (openRiskPct / (MAX_OPEN_RISK_PCT * 2)) * 100);
}

/** Score equity vs balance drawdown */
function scoreEquityDrawdown(equity: number, balance: number): number {
  if (balance <= 0 || equity >= balance) return 100;
  const drawdownPct = ((balance - equity) / balance) * 100;
  if (drawdownPct >= 20) return 0;
  return clamp(100 - (drawdownPct / 20) * 100);
}

// ─── Alert builder ────────────────────────────────────────────────────────────

function buildAccountAlerts(
  state:       AccountState,
  metrics:     AccountRiskResult["metrics"],
  marginScore: number,
): RiskAlert[] {
  const alerts: RiskAlert[] = [];

  // Margin level
  if (state.marginLevel > 0 && state.marginLevel < CRITICAL_MARGIN_LEVEL) {
    alerts.push({
      alertId: randomUUID(), category: "account", severity: "critical",
      title: "Margin Level Critical",
      message: `Margin level at ${state.marginLevel.toFixed(1)}% — broker may issue margin call below ${CRITICAL_MARGIN_LEVEL}%`,
      evidence: [`Current margin level: ${state.marginLevel.toFixed(1)}%`, `Critical threshold: ${CRITICAL_MARGIN_LEVEL}%`],
      metrics: { marginLevel: state.marginLevel, criticalThreshold: CRITICAL_MARGIN_LEVEL },
    });
  } else if (state.marginLevel > 0 && state.marginLevel < WARNING_MARGIN_LEVEL) {
    alerts.push({
      alertId: randomUUID(), category: "account", severity: "warning",
      title: "Margin Level Warning",
      message: `Margin level at ${state.marginLevel.toFixed(1)}% — monitor for further decline`,
      evidence: [`Margin level: ${state.marginLevel.toFixed(1)}%`, `Warning threshold: ${WARNING_MARGIN_LEVEL}%`],
      metrics: { marginLevel: state.marginLevel, warningThreshold: WARNING_MARGIN_LEVEL },
    });
  }

  // Daily loss
  if (state.balance > 0) {
    const dailyLossPct = (-state.dailyPnl / state.balance) * 100;
    if (dailyLossPct >= DAILY_LOSS_LIMIT_PCT) {
      alerts.push({
        alertId: randomUUID(), category: "account", severity: "critical",
        title: "Daily Loss Limit Reached",
        message: `Daily loss of ${dailyLossPct.toFixed(2)}% has reached/exceeded the ${DAILY_LOSS_LIMIT_PCT}% daily limit`,
        evidence: [`Daily P/L: $${state.dailyPnl.toFixed(2)}`, `Daily loss %: ${dailyLossPct.toFixed(2)}%`, `Limit: ${DAILY_LOSS_LIMIT_PCT}%`],
        metrics: { dailyLossPct, dailyLossLimit: DAILY_LOSS_LIMIT_PCT },
      });
    } else if (dailyLossPct >= DAILY_LOSS_LIMIT_PCT * 0.8) {
      alerts.push({
        alertId: randomUUID(), category: "account", severity: "warning",
        title: "Approaching Daily Loss Limit",
        message: `Daily loss ${dailyLossPct.toFixed(2)}% approaching the ${DAILY_LOSS_LIMIT_PCT}% limit`,
        evidence: [`Daily P/L: $${state.dailyPnl.toFixed(2)}`, `Progress to limit: ${(dailyLossPct / DAILY_LOSS_LIMIT_PCT * 100).toFixed(0)}%`],
        metrics: { dailyLossPct, dailyLossLimit: DAILY_LOSS_LIMIT_PCT },
      });
    }

    // Open risk
    if (state.openRisk >= MAX_OPEN_RISK_PCT) {
      alerts.push({
        alertId: randomUUID(), category: "account", severity: "warning",
        title: "Open Risk Elevated",
        message: `Total open risk ${state.openRisk.toFixed(2)}% exceeds the ${MAX_OPEN_RISK_PCT}% guideline`,
        evidence: [`Open risk: ${state.openRisk.toFixed(2)}%`, `Guideline: ${MAX_OPEN_RISK_PCT}%`],
        metrics: { openRisk: state.openRisk, guideline: MAX_OPEN_RISK_PCT },
      });
    }

    // Equity drawdown
    if (state.equity < state.balance * 0.9) {
      const dd = ((state.balance - state.equity) / state.balance * 100);
      alerts.push({
        alertId: randomUUID(), category: "account", severity: "warning",
        title: "Equity Drawdown Elevated",
        message: `Account equity drawdown at ${dd.toFixed(2)}%`,
        evidence: [`Balance: $${state.balance.toFixed(2)}`, `Equity: $${state.equity.toFixed(2)}`, `Drawdown: ${dd.toFixed(2)}%`],
        metrics: { equityDrawdownPct: dd },
      });
    }
  }

  return alerts;
}

// ─── Main evaluator ───────────────────────────────────────────────────────────

export function evaluateAccountRisk(state: AccountState): AccountRiskResult {
  const marginScore    = scoreMarginLevel(state.marginLevel);
  const dailyScore     = scoreDailyLoss(state.dailyPnl, state.balance);
  const weeklyScore    = scoreWeeklyLoss(state.weeklyPnl, state.balance);
  const openRiskScore  = scoreOpenRisk(state.openRisk);
  const equityScore    = scoreEquityDrawdown(state.equity, state.balance);

  // Equity drawdown %
  const equityDrawdownPct = state.balance > 0
    ? ((state.balance - state.equity) / state.balance) * 100 : 0;
  const balanceDrawdownPct = state.balance > 0
    ? (Math.max(0, state.balance - state.equity) / state.balance) * 100 : 0;

  const metrics: AccountRiskResult["metrics"] = {
    balanceDrawdownPct: clamp(balanceDrawdownPct),
    equityDrawdownPct:  clamp(equityDrawdownPct),
    marginLevelScore:   marginScore,
    dailyLossScore:     dailyScore,
    weeklyLossScore:    weeklyScore,
    openRiskScore,
  };

  // Weighted account health: margin is most critical
  const accountHealthScore = clamp(
    marginScore    * 0.30 +
    dailyScore     * 0.25 +
    weeklyScore    * 0.15 +
    openRiskScore  * 0.20 +
    equityScore    * 0.10,
  );

  const riskClassification = scoreToRiskClassification(100 - accountHealthScore);

  const evidence: string[] = [
    `Balance: $${state.balance.toFixed(2)}, Equity: $${state.equity.toFixed(2)}`,
    `Free Margin: $${state.freeMargin.toFixed(2)}, Margin Level: ${state.marginLevel > 0 ? state.marginLevel.toFixed(1) + "%" : "N/A"}`,
    `Daily P/L: $${state.dailyPnl >= 0 ? "+" : ""}${state.dailyPnl.toFixed(2)} (${state.balance > 0 ? ((state.dailyPnl / state.balance) * 100).toFixed(2) : 0}%)`,
    `Weekly P/L: $${state.weeklyPnl >= 0 ? "+" : ""}${state.weeklyPnl.toFixed(2)}, Monthly P/L: $${state.monthlyPnl >= 0 ? "+" : ""}${state.monthlyPnl.toFixed(2)}`,
    `Open Risk: ${state.openRisk.toFixed(2)}% (limit: ${MAX_OPEN_RISK_PCT}%), Closed Risk (daily): ${state.closedRisk.toFixed(2)}%`,
    `Account Health Score: ${accountHealthScore.toFixed(1)}/100 (${RISK_CLASSIFICATION_LABELS[riskClassification]})`,
    `Margin score: ${marginScore.toFixed(1)}, Daily loss score: ${dailyScore.toFixed(1)}, Open risk score: ${openRiskScore.toFixed(1)}`,
  ];

  const alerts = buildAccountAlerts(state, metrics, marginScore);

  return { accountHealthScore, riskClassification, metrics, evidence, alerts };
}

import { RISK_CLASSIFICATION_LABELS } from "./types.js";
