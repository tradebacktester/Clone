import { db, botStateTable, botConfigTable, brokerAccountsTable, riskSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";
import { logExecution } from "./broker-engine.js";

export type DeploymentMode = "paper" | "demo" | "live";

export interface DeploymentStatus {
  currentMode: DeploymentMode;
  liveEnabled: boolean;
  running: boolean;
  readinessScore: number | null;
  brokerAccountsConfigured: number;
  demoAccountsConfigured: number;
  liveAccountsConfigured: number;
  canSwitchToDemo: boolean;
  canSwitchToLive: boolean;
  blockers: string[];
  warnings: string[];
}

export interface ModeTransitionResult {
  success: boolean;
  previousMode: DeploymentMode;
  newMode: DeploymentMode;
  message: string;
  blockers: string[];
}

const MIN_READINESS_SCORE_FOR_LIVE = 75;
const MIN_PAPER_TRADES_FOR_DEMO = 10;
const MIN_PAPER_TRADES_FOR_LIVE = 50;
const MIN_READINESS_SCORE_FOR_DEMO = 50;

async function getReadinessScore(): Promise<number | null> {
  const [state] = await db.select({ readinessScore: botStateTable.readinessScore }).from(botStateTable).limit(1);
  if (!state?.readinessScore) return null;
  return parseFloat(state.readinessScore);
}

async function countClosedTrades(): Promise<number> {
  const { tradesTable } = await import("@workspace/db");
  const rows = await db.select().from(tradesTable).where(eq(tradesTable.status, "closed"));
  return rows.length;
}

async function getBrokerAccounts() {
  return db.select().from(brokerAccountsTable).where(eq(brokerAccountsTable.active, true));
}

async function checkModePrerequisites(mode: DeploymentMode): Promise<{ allowed: boolean; blockers: string[] }> {
  const blockers: string[] = [];

  if (mode === "paper") {
    return { allowed: true, blockers: [] };
  }

  const accounts = await getBrokerAccounts();
  const closedTrades = await countClosedTrades();
  const readinessScore = await getReadinessScore();

  if (mode === "demo") {
    const demoAccounts = accounts.filter(a => a.isDemo);
    if (demoAccounts.length === 0) {
      blockers.push("No demo broker account configured. Add a demo account in Settings → Broker Accounts.");
    }
    if (closedTrades < MIN_PAPER_TRADES_FOR_DEMO) {
      blockers.push(`Insufficient paper trades: ${closedTrades}/${MIN_PAPER_TRADES_FOR_DEMO} required before demo trading.`);
    }
    if (readinessScore !== null && readinessScore < MIN_READINESS_SCORE_FOR_DEMO) {
      blockers.push(`Readiness score too low: ${readinessScore}/${MIN_READINESS_SCORE_FOR_DEMO} required for demo mode. Run the production readiness suite.`);
    }
    return { allowed: blockers.length === 0, blockers };
  }

  if (mode === "live") {
    const [state] = await db.select().from(botStateTable).limit(1);
    if (!state?.liveEnabled) {
      blockers.push("Live trading is not enabled. Enable it explicitly in Settings → Broker Controls.");
    }
    const liveAccounts = accounts.filter(a => !a.isDemo && !a.paperTrading);
    if (liveAccounts.length === 0) {
      blockers.push("No live broker account configured. Add a live account in Settings → Broker Accounts.");
    }
    if (closedTrades < MIN_PAPER_TRADES_FOR_LIVE) {
      blockers.push(`Insufficient trading history: ${closedTrades}/${MIN_PAPER_TRADES_FOR_LIVE} closed trades required before live trading.`);
    }
    if (readinessScore === null || readinessScore < MIN_READINESS_SCORE_FOR_LIVE) {
      blockers.push(`Readiness score insufficient: ${readinessScore ?? 0}/${MIN_READINESS_SCORE_FOR_LIVE} required for live mode. Complete the production readiness checklist.`);
    }
    const [riskSettings] = await db.select().from(riskSettingsTable).limit(1);
    if (!riskSettings) {
      blockers.push("Risk settings not configured. Configure risk limits before enabling live trading.");
    }
    return { allowed: blockers.length === 0, blockers };
  }

  return { allowed: false, blockers: ["Unknown deployment mode"] };
}

export async function getDeploymentStatus(): Promise<DeploymentStatus> {
  const [state] = await db.select().from(botStateTable).limit(1);
  const accounts = await getBrokerAccounts();
  const closedTrades = await countClosedTrades();
  const readinessScore = state?.readinessScore ? parseFloat(state.readinessScore) : null;

  const demoAccounts = accounts.filter(a => a.isDemo);
  const liveAccounts = accounts.filter(a => !a.isDemo && !a.paperTrading);

  const blockers: string[] = [];
  const warnings: string[] = [];

  const demoCheck = await checkModePrerequisites("demo");
  const liveCheck = await checkModePrerequisites("live");

  if (closedTrades < MIN_PAPER_TRADES_FOR_LIVE) {
    warnings.push(`${MIN_PAPER_TRADES_FOR_LIVE - closedTrades} more paper trades recommended before live trading.`);
  }
  if (readinessScore !== null && readinessScore < MIN_READINESS_SCORE_FOR_LIVE) {
    warnings.push(`Production readiness score (${readinessScore}) is below the live threshold (${MIN_READINESS_SCORE_FOR_LIVE}).`);
  }

  return {
    currentMode: (state?.brokerMode ?? "paper") as DeploymentMode,
    liveEnabled: state?.liveEnabled ?? false,
    running: state?.running ?? false,
    readinessScore,
    brokerAccountsConfigured: accounts.length,
    demoAccountsConfigured: demoAccounts.length,
    liveAccountsConfigured: liveAccounts.length,
    canSwitchToDemo: demoCheck.allowed,
    canSwitchToLive: liveCheck.allowed,
    blockers,
    warnings,
  };
}

export async function switchDeploymentMode(newMode: DeploymentMode): Promise<ModeTransitionResult> {
  const [state] = await db.select().from(botStateTable).limit(1);
  const previousMode = (state?.brokerMode ?? "paper") as DeploymentMode;

  if (previousMode === newMode) {
    return {
      success: true,
      previousMode,
      newMode,
      message: `Already in ${newMode} mode.`,
      blockers: [],
    };
  }

  if (state?.running) {
    return {
      success: false,
      previousMode,
      newMode,
      message: "Cannot switch deployment mode while bot is running. Stop the bot first.",
      blockers: ["Bot is currently running — stop it before switching modes."],
    };
  }

  const { allowed, blockers } = await checkModePrerequisites(newMode);
  if (!allowed) {
    return {
      success: false,
      previousMode,
      newMode,
      message: `Cannot switch to ${newMode} mode: ${blockers[0]}`,
      blockers,
    };
  }

  await db.update(botStateTable).set({
    brokerMode: newMode,
    mode: newMode === "paper" ? "paper" : "live",
  });

  await logExecution({
    eventType: newMode === "live" ? "live_enabled" : "live_disabled",
    reason: `deployment mode changed from ${previousMode} to ${newMode}`,
    mode: newMode === "paper" ? "paper" : "live",
    meta: { previousMode, newMode },
  });

  logger.info({ previousMode, newMode }, "Deployment mode switched");

  return {
    success: true,
    previousMode,
    newMode,
    message: `Successfully switched to ${newMode} mode.`,
    blockers: [],
  };
}

export async function enableLiveMode(enabled: boolean): Promise<void> {
  await db.update(botStateTable).set({ liveEnabled: enabled });
  await logExecution({
    eventType: enabled ? "live_enabled" : "live_disabled",
    reason: enabled ? "live mode explicitly enabled by operator" : "live mode explicitly disabled by operator",
    mode: enabled ? "live" : "paper",
  });
  logger.warn({ liveEnabled: enabled }, "Live mode flag changed — operator action");
}
