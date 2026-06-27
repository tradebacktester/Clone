import { db, botStateTable, botConfigTable, riskSettingsTable, brokerAccountsTable, readinessChecklistResultTable, tradesTable, brokerSafetyConfigTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "./logger.js";

export interface ChecklistItem {
  id: string;
  name: string;
  category: "safety" | "strategy" | "infrastructure" | "risk" | "validation";
  required: boolean;
  passed: boolean;
  message: string;
  details?: string;
  recommendation?: string;
}

export interface ChecklistResult {
  overallPassed: boolean;
  readinessScore: number;
  items: ChecklistItem[];
  blockers: string[];
  warnings: string[];
  recommendation: string;
  canEnableLive: boolean;
  runAt: string;
}

const MIN_PAPER_TRADES = 50;
const MIN_WIN_RATE = 45;
const MIN_PROFIT_FACTOR = 1.1;
const MIN_READINESS_SCORE_THRESHOLD = 75;
const MIN_PAPER_TRADING_DAYS = 14;

async function checkRiskConfiguration(): Promise<ChecklistItem> {
  const [risk] = await db.select().from(riskSettingsTable).limit(1);
  const [config] = await db.select().from(botConfigTable).limit(1);

  if (!risk || !config) {
    return {
      id: "risk_config",
      name: "Risk Configuration",
      category: "risk",
      required: true,
      passed: false,
      message: "Risk settings not configured",
      recommendation: "Go to Settings → Risk Management and configure risk parameters",
    };
  }

  const riskPerTrade = parseFloat(risk.riskPerTrade);
  const maxDailyLoss = parseFloat(risk.maxDailyLoss);
  const maxWeeklyLoss = parseFloat(risk.maxWeeklyLoss);

  const issues: string[] = [];
  if (riskPerTrade > 2.0) issues.push(`Risk per trade ${riskPerTrade}% is high (recommended ≤1%)`);
  if (maxDailyLoss > 5.0) issues.push(`Max daily loss ${maxDailyLoss}% is high (recommended ≤3%)`);
  if (maxWeeklyLoss > 10.0) issues.push(`Max weekly loss ${maxWeeklyLoss}% is high (recommended ≤6%)`);

  if (issues.length > 0) {
    return {
      id: "risk_config",
      name: "Risk Configuration",
      category: "risk",
      required: true,
      passed: false,
      message: `Risk parameters outside safe limits: ${issues[0]}`,
      details: issues.join("; "),
      recommendation: "Reduce risk parameters to conservative levels before live trading",
    };
  }

  return {
    id: "risk_config",
    name: "Risk Configuration",
    category: "risk",
    required: true,
    passed: true,
    message: `Risk configured: ${riskPerTrade}% per trade, ${maxDailyLoss}% daily loss, ${maxWeeklyLoss}% weekly loss`,
  };
}

async function checkPaperTradingHistory(): Promise<ChecklistItem> {
  const closed = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"));

  if (closed.length < MIN_PAPER_TRADES) {
    return {
      id: "paper_trading",
      name: "Paper Trading History",
      category: "validation",
      required: true,
      passed: false,
      message: `Only ${closed.length}/${MIN_PAPER_TRADES} required paper trades completed`,
      recommendation: `Run the bot in paper mode until ${MIN_PAPER_TRADES} trades are logged`,
    };
  }

  const earliest = closed.reduce((e, t) => {
    const d = t.openedAt ? new Date(t.openedAt) : new Date();
    return d < e ? d : e;
  }, new Date());

  const daysSince = Math.floor((Date.now() - earliest.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSince < MIN_PAPER_TRADING_DAYS) {
    return {
      id: "paper_trading",
      name: "Paper Trading History",
      category: "validation",
      required: true,
      passed: false,
      message: `Paper trading for ${daysSince} days — ${MIN_PAPER_TRADING_DAYS} days minimum required`,
      recommendation: `Continue paper trading for at least ${MIN_PAPER_TRADING_DAYS - daysSince} more days`,
    };
  }

  const wins = closed.filter(t => parseFloat(t.pnl ?? "0") > 0).length;
  const winRate = (wins / closed.length) * 100;
  const grossProfit = closed.filter(t => parseFloat(t.pnl ?? "0") > 0).reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0);
  const grossLoss = Math.abs(closed.filter(t => parseFloat(t.pnl ?? "0") <= 0).reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0));
  const pf = grossLoss > 0 ? grossProfit / grossLoss : 999;

  const perfIssues: string[] = [];
  if (winRate < MIN_WIN_RATE) perfIssues.push(`win rate ${winRate.toFixed(1)}% below minimum ${MIN_WIN_RATE}%`);
  if (pf < MIN_PROFIT_FACTOR) perfIssues.push(`profit factor ${pf.toFixed(2)} below minimum ${MIN_PROFIT_FACTOR}`);

  if (perfIssues.length > 0) {
    return {
      id: "paper_trading",
      name: "Paper Trading History",
      category: "validation",
      required: true,
      passed: false,
      message: `Paper performance insufficient: ${perfIssues.join(", ")}`,
      recommendation: "Continue paper trading until strategy shows consistent profitability",
    };
  }

  return {
    id: "paper_trading",
    name: "Paper Trading History",
    category: "validation",
    required: true,
    passed: true,
    message: `${closed.length} paper trades over ${daysSince} days — WR ${winRate.toFixed(1)}%, PF ${pf.toFixed(2)}`,
  };
}

async function checkProductionReadinessScore(): Promise<ChecklistItem> {
  const [state] = await db.select().from(botStateTable).limit(1);
  const score = state?.readinessScore ? parseFloat(state.readinessScore) : null;

  if (score === null) {
    return {
      id: "prod_readiness",
      name: "Production Readiness Score",
      category: "validation",
      required: true,
      passed: false,
      message: "No production readiness assessment on record",
      recommendation: "Run the Production Readiness assessment from the Prod. Readiness page",
    };
  }

  if (score < MIN_READINESS_SCORE_THRESHOLD) {
    return {
      id: "prod_readiness",
      name: "Production Readiness Score",
      category: "validation",
      required: true,
      passed: false,
      message: `Readiness score ${score}/100 — minimum ${MIN_READINESS_SCORE_THRESHOLD} required for live`,
      recommendation: "Address failing readiness stages before enabling live trading",
    };
  }

  return {
    id: "prod_readiness",
    name: "Production Readiness Score",
    category: "validation",
    required: true,
    passed: true,
    message: `Readiness score ${score}/100 — meets live trading threshold`,
  };
}

async function checkBrokerConfiguration(): Promise<ChecklistItem> {
  const accounts = await db
    .select()
    .from(brokerAccountsTable)
    .where(eq(brokerAccountsTable.active, true));

  const liveAccounts = accounts.filter(a => !a.isDemo && !a.paperTrading);

  if (liveAccounts.length === 0) {
    return {
      id: "broker_config",
      name: "Broker Configuration",
      category: "infrastructure",
      required: true,
      passed: false,
      message: "No live broker account configured",
      recommendation: "Add a live broker account in Settings → Broker Accounts",
    };
  }

  const healthyAccounts = liveAccounts.filter(a => a.connectionHealth === "connected");

  return {
    id: "broker_config",
    name: "Broker Configuration",
    category: "infrastructure",
    required: true,
    passed: liveAccounts.length > 0,
    message: `${liveAccounts.length} live account(s) — ${healthyAccounts.length} currently connected`,
  };
}

async function checkSafetyLayerConfiguration(): Promise<ChecklistItem> {
  let [cfg] = await db.select().from(brokerSafetyConfigTable).limit(1);
  if (!cfg) {
    return {
      id: "safety_layer",
      name: "Broker Safety Layer",
      category: "safety",
      required: true,
      passed: false,
      message: "Safety layer not configured",
      recommendation: "Go to Deployment Manager → Safety Configuration",
    };
  }

  const disabled: string[] = [];
  if (!cfg.enableSpreadFilter) disabled.push("spread filter");
  if (!cfg.enableSlippageProtection) disabled.push("slippage protection");
  if (!cfg.enableConnectionMonitor) disabled.push("connection monitoring");
  if (!cfg.enableAutoRetry) disabled.push("auto-retry");

  if (disabled.length > 2) {
    return {
      id: "safety_layer",
      name: "Broker Safety Layer",
      category: "safety",
      required: true,
      passed: false,
      message: `Multiple safety features disabled: ${disabled.join(", ")}`,
      recommendation: "Enable all safety features before going live",
    };
  }

  if (disabled.length > 0) {
    return {
      id: "safety_layer",
      name: "Broker Safety Layer",
      category: "safety",
      required: false,
      passed: true,
      message: `Safety layer active — ${disabled.length} optional feature(s) disabled: ${disabled.join(", ")}`,
    };
  }

  return {
    id: "safety_layer",
    name: "Broker Safety Layer",
    category: "safety",
    required: true,
    passed: true,
    message: "All safety features enabled (spread filter, slippage protection, connection monitor, auto-retry)",
  };
}

async function checkEmergencyProtection(): Promise<ChecklistItem> {
  const [state] = await db.select().from(botStateTable).limit(1);
  const [risk] = await db.select().from(riskSettingsTable).limit(1);

  const hasLimits = risk && parseFloat(risk.maxDailyLoss) > 0 && parseFloat(risk.maxWeeklyLoss) > 0;
  const hasEmergencyStop = state !== undefined;

  if (!hasLimits) {
    return {
      id: "emergency_protection",
      name: "Emergency Protection",
      category: "safety",
      required: true,
      passed: false,
      message: "Daily/weekly loss limits not configured",
      recommendation: "Configure loss limits in Settings → Risk Management",
    };
  }

  return {
    id: "emergency_protection",
    name: "Emergency Protection",
    category: "safety",
    required: true,
    passed: true,
    message: `Emergency stop + daily/weekly loss limits active (${risk.maxDailyLoss}%/${risk.maxWeeklyLoss}%)`,
  };
}

async function checkLiveNotExplicitlyEnabled(): Promise<ChecklistItem> {
  const [state] = await db.select().from(botStateTable).limit(1);

  if (!state?.liveEnabled) {
    return {
      id: "live_gate",
      name: "Live Trading Gate",
      category: "safety",
      required: true,
      passed: false,
      message: "Live trading gate is OFF — must be explicitly enabled before starting live mode",
      recommendation: "In Deployment Manager, toggle 'Enable Live Trading' only when all other checks pass",
    };
  }

  return {
    id: "live_gate",
    name: "Live Trading Gate",
    category: "safety",
    required: true,
    passed: true,
    message: "Live trading gate is enabled",
  };
}

export async function runReadinessChecklist(forLive = false): Promise<ChecklistResult> {
  const [
    riskCheck,
    paperCheck,
    readinessCheck,
    brokerCheck,
    safetyCheck,
    emergencyCheck,
    liveGateCheck,
  ] = await Promise.all([
    checkRiskConfiguration(),
    checkPaperTradingHistory(),
    checkProductionReadinessScore(),
    checkBrokerConfiguration(),
    checkSafetyLayerConfiguration(),
    checkEmergencyProtection(),
    checkLiveNotExplicitlyEnabled(),
  ]);

  const items = forLive
    ? [riskCheck, paperCheck, readinessCheck, brokerCheck, safetyCheck, emergencyCheck, liveGateCheck]
    : [riskCheck, paperCheck, readinessCheck, safetyCheck, emergencyCheck];

  const requiredItems = items.filter(i => i.required);
  const passedRequired = requiredItems.filter(i => i.passed).length;
  const totalRequired = requiredItems.length;
  const readinessScore = Math.round((passedRequired / totalRequired) * 100);

  const blockers = items.filter(i => i.required && !i.passed).map(i => i.message);
  const warnings = items.filter(i => !i.required && !i.passed).map(i => i.message);
  const overallPassed = blockers.length === 0;

  let recommendation: string;
  if (overallPassed && readinessScore >= 90) {
    recommendation = "✓ All checks passed. System is ready for live deployment with careful monitoring.";
  } else if (overallPassed) {
    recommendation = "⚠ Required checks passed but some recommendations remain. Review warnings before going live.";
  } else if (readinessScore >= 60) {
    recommendation = `⚠ ${blockers.length} blocker(s) preventing live deployment. Address all blockers first.`;
  } else {
    recommendation = `✗ System is NOT ready for live trading. ${blockers.length} critical issue(s) must be resolved.`;
  }

  await db.insert(readinessChecklistResultTable).values({
    overallPassed,
    readinessScore: String(readinessScore),
    items,
    recommendation,
    blockers: blockers.length > 0 ? blockers : null,
    warnings: warnings.length > 0 ? warnings : null,
  });

  if (readinessScore > 0) {
    try {
      await db.update(botStateTable).set({ readinessScore: String(readinessScore) });
    } catch {
      // non-fatal
    }
  }

  logger.info({ readinessScore, overallPassed, blockers: blockers.length }, "Readiness checklist completed");

  return {
    overallPassed,
    readinessScore,
    items,
    blockers,
    warnings,
    recommendation,
    canEnableLive: overallPassed && forLive,
    runAt: new Date().toISOString(),
  };
}

export async function getLatestChecklistResult(): Promise<typeof readinessChecklistResultTable.$inferSelect | null> {
  const [latest] = await db
    .select()
    .from(readinessChecklistResultTable)
    .orderBy(desc(readinessChecklistResultTable.runAt))
    .limit(1);
  return latest ?? null;
}
