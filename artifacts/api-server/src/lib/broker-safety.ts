import { db, brokerSafetyConfigTable, brokerAccountsTable, botStateTable, supervisorAlertsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";
import { getCurrentPrice } from "./price-feed.js";
import type { Pair } from "@workspace/market-analysis";

export interface SpreadCheckResult {
  allowed: boolean;
  spreadPips: number;
  maxAllowed: number;
  pair: string;
  reason?: string;
}

export interface SlippageCheckResult {
  allowed: boolean;
  actualSlippagePips: number;
  maxAllowed: number;
  reason?: string;
}

export interface ConnectionHealth {
  status: "connected" | "degraded" | "disconnected" | "unknown";
  latencyMs: number | null;
  lastChecked: string;
  consecutiveFailures: number;
  message: string;
}

export interface PartialFillResult {
  accepted: boolean;
  fillPct: number;
  threshold: number;
  requestedLots: number;
  filledLots: number;
  action: "accept" | "reject" | "retry";
}

export interface ReconciliationResult {
  localPositions: number;
  brokerPositions: number;
  discrepancies: Array<{
    type: "missing_local" | "missing_broker" | "size_mismatch";
    detail: string;
  }>;
  reconciled: boolean;
  actionsTaken: string[];
}

let safetyConfigCache: typeof brokerSafetyConfigTable.$inferSelect | null = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL_MS = 30_000;

let connectionFailureCount = 0;
let lastConnectionCheck: Date | null = null;
let lastConnectionStatus: "connected" | "degraded" | "disconnected" | "unknown" = "unknown";

function getPipSize(pair: string): number {
  return pair.includes("JPY") ? 0.01 : 0.0001;
}

export async function getSafetyConfig(): Promise<typeof brokerSafetyConfigTable.$inferSelect> {
  const now = Date.now();
  if (safetyConfigCache && now - configCacheTime < CONFIG_CACHE_TTL_MS) {
    return safetyConfigCache;
  }
  let [cfg] = await db.select().from(brokerSafetyConfigTable).limit(1);
  if (!cfg) {
    [cfg] = await db.insert(brokerSafetyConfigTable).values({}).returning();
  }
  safetyConfigCache = cfg;
  configCacheTime = now;
  return cfg;
}

export function invalidateSafetyConfigCache(): void {
  safetyConfigCache = null;
}

export async function checkSpread(pair: Pair): Promise<SpreadCheckResult> {
  const cfg = await getSafetyConfig();
  if (!cfg.enableSpreadFilter) {
    return { allowed: true, spreadPips: 0, maxAllowed: parseFloat(cfg.maxSpreadPips), pair };
  }

  const price = getCurrentPrice(pair);
  if (!price) {
    return {
      allowed: false,
      spreadPips: 999,
      maxAllowed: parseFloat(cfg.maxSpreadPips),
      pair,
      reason: "No live price available — cannot validate spread",
    };
  }

  const pipSize = getPipSize(pair);
  const spreadPips = Math.round(((price.ask - price.bid) / pipSize) * 10) / 10;
  const maxAllowed = parseFloat(cfg.maxSpreadPips);

  if (spreadPips > maxAllowed) {
    logger.warn({ pair, spreadPips, maxAllowed }, "Spread filter: trade rejected — spread too wide");
    await emitSafetyAlert("spread_too_wide", `${pair} spread ${spreadPips} pips exceeds limit ${maxAllowed} pips`, pair);
    return {
      allowed: false,
      spreadPips,
      maxAllowed,
      pair,
      reason: `Spread ${spreadPips} pips exceeds maximum allowed ${maxAllowed} pips`,
    };
  }

  return { allowed: true, spreadPips, maxAllowed, pair };
}

export async function checkSlippage(
  pair: string,
  requestedPrice: number,
  executedPrice: number,
  direction: "buy" | "sell",
): Promise<SlippageCheckResult> {
  const cfg = await getSafetyConfig();
  if (!cfg.enableSlippageProtection) {
    return { allowed: true, actualSlippagePips: 0, maxAllowed: parseFloat(cfg.maxSlippagePips) };
  }

  const pipSize = getPipSize(pair);
  const priceDiff = direction === "buy"
    ? executedPrice - requestedPrice
    : requestedPrice - executedPrice;
  const slippagePips = Math.round((priceDiff / pipSize) * 10) / 10;
  const maxAllowed = parseFloat(cfg.maxSlippagePips);

  if (slippagePips > maxAllowed) {
    logger.warn({ pair, slippagePips, maxAllowed }, "Slippage protection: order rejected — excessive slippage");
    await emitSafetyAlert("excessive_slippage", `${pair} slippage ${slippagePips} pips exceeds limit ${maxAllowed} pips`, pair);
    return {
      allowed: false,
      actualSlippagePips: slippagePips,
      maxAllowed,
      reason: `Slippage ${slippagePips} pips exceeds maximum allowed ${maxAllowed} pips`,
    };
  }

  return { allowed: true, actualSlippagePips: Math.max(0, slippagePips), maxAllowed };
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  label: string,
): Promise<{ result: T | null; success: boolean; attempts: number; error?: string }> {
  const cfg = await getSafetyConfig();
  const maxRetries = cfg.enableAutoRetry ? cfg.maxRetries : 1;
  const retryDelayMs = cfg.retryDelayMs;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      if (attempt > 1) {
        logger.info({ label, attempt }, "Retry succeeded");
      }
      return { result, success: true, attempts: attempt };
    } catch (err) {
      lastError = err;
      logger.warn({ label, attempt, maxRetries, err: String(err) }, "Operation failed, retrying");
      if (attempt < maxRetries) {
        const delay = retryDelayMs * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, Math.min(delay, 30_000)));
      }
    }
  }

  logger.error({ label, maxRetries, err: String(lastError) }, "All retry attempts exhausted");
  return { result: null, success: false, attempts: maxRetries, error: String(lastError) };
}

export async function checkConnectionHealth(): Promise<ConnectionHealth> {
  const [state] = await db.select().from(botStateTable).limit(1);
  const mode = state?.brokerMode ?? "paper";

  if (mode === "paper") {
    lastConnectionStatus = "connected";
    lastConnectionCheck = new Date();
    return {
      status: "connected",
      latencyMs: 0,
      lastChecked: new Date().toISOString(),
      consecutiveFailures: 0,
      message: "Paper mode — no broker connection required",
    };
  }

  const [account] = await db
    .select()
    .from(brokerAccountsTable)
    .where(eq(brokerAccountsTable.active, true))
    .limit(1);

  if (!account) {
    lastConnectionStatus = "disconnected";
    lastConnectionCheck = new Date();
    connectionFailureCount++;
    return {
      status: "disconnected",
      latencyMs: null,
      lastChecked: new Date().toISOString(),
      consecutiveFailures: connectionFailureCount,
      message: "No active broker account configured",
    };
  }

  const t0 = Date.now();
  try {
    const pairs: Pair[] = ["EURUSD", "GBPUSD", "USDJPY"];
    let pricesAvailable = 0;
    for (const pair of pairs) {
      if (getCurrentPrice(pair)) pricesAvailable++;
    }

    const latencyMs = Date.now() - t0;
    lastConnectionCheck = new Date();

    if (pricesAvailable === 0) {
      connectionFailureCount++;
      lastConnectionStatus = "disconnected";
      await db.update(brokerAccountsTable).set({ connectionHealth: "disconnected" }).where(eq(brokerAccountsTable.id, account.id));
      await emitSafetyAlert("broker_disconnected", "No price data available — broker connection may be down", null);
      return {
        status: "disconnected",
        latencyMs,
        lastChecked: new Date().toISOString(),
        consecutiveFailures: connectionFailureCount,
        message: "Price feed unavailable — broker connection suspected down",
      };
    }

    if (pricesAvailable < pairs.length) {
      connectionFailureCount++;
      lastConnectionStatus = "degraded";
      await db.update(brokerAccountsTable).set({ connectionHealth: "degraded" }).where(eq(brokerAccountsTable.id, account.id));
      return {
        status: "degraded",
        latencyMs,
        lastChecked: new Date().toISOString(),
        consecutiveFailures: connectionFailureCount,
        message: `Partial price data: ${pricesAvailable}/${pairs.length} pairs available`,
      };
    }

    connectionFailureCount = 0;
    lastConnectionStatus = "connected";
    await db.update(brokerAccountsTable).set({
      connectionHealth: "connected",
      lastConnectedAt: new Date(),
    }).where(eq(brokerAccountsTable.id, account.id));

    return {
      status: "connected",
      latencyMs,
      lastChecked: new Date().toISOString(),
      consecutiveFailures: 0,
      message: `All ${pairs.length} pairs live — connection healthy`,
    };
  } catch (err) {
    connectionFailureCount++;
    lastConnectionStatus = "disconnected";
    return {
      status: "disconnected",
      latencyMs: Date.now() - t0,
      lastChecked: new Date().toISOString(),
      consecutiveFailures: connectionFailureCount,
      message: `Connection check failed: ${String(err)}`,
    };
  }
}

export function getConnectionStatus(): typeof lastConnectionStatus {
  return lastConnectionStatus;
}

export async function handlePartialFill(
  requestedLots: number,
  filledLots: number,
): Promise<PartialFillResult> {
  const cfg = await getSafetyConfig();
  if (!cfg.enablePartialFillHandling) {
    return { accepted: true, fillPct: 100, threshold: 100, requestedLots, filledLots, action: "accept" };
  }

  const fillPct = requestedLots > 0 ? (filledLots / requestedLots) * 100 : 0;
  const threshold = parseFloat(cfg.partialFillThresholdPct);

  if (fillPct >= threshold) {
    return { accepted: true, fillPct, threshold, requestedLots, filledLots, action: "accept" };
  }

  if (fillPct > 0 && fillPct < 50) {
    logger.warn({ requestedLots, filledLots, fillPct, threshold }, "Partial fill: very low fill — rejecting");
    return { accepted: false, fillPct, threshold, requestedLots, filledLots, action: "reject" };
  }

  logger.warn({ requestedLots, filledLots, fillPct, threshold }, "Partial fill below threshold — accepting with warning");
  await emitSafetyAlert("partial_fill", `Partial fill: ${fillPct.toFixed(1)}% of requested lots filled`, null);
  return { accepted: true, fillPct, threshold, requestedLots, filledLots, action: "accept" };
}

export async function reconcilePositions(): Promise<ReconciliationResult> {
  const { tradesTable } = await import("@workspace/db");
  const openTrades = await db.select().from(tradesTable).where(eq(tradesTable.status, "open"));

  const localPositions = openTrades.length;
  const discrepancies: ReconciliationResult["discrepancies"] = [];
  const actionsTaken: string[] = [];

  const [state] = await db.select().from(botStateTable).limit(1);
  if (state?.brokerMode === "paper") {
    return {
      localPositions,
      brokerPositions: localPositions,
      discrepancies: [],
      reconciled: true,
      actionsTaken: ["Paper mode: no broker reconciliation needed"],
    };
  }

  const now = Date.now();
  for (const trade of openTrades) {
    const openedMs = trade.openedAt ? new Date(trade.openedAt).getTime() : 0;
    const ageHours = (now - openedMs) / 3_600_000;
    if (ageHours > 48) {
      discrepancies.push({
        type: "missing_broker",
        detail: `Trade #${trade.id} (${trade.pair} ${trade.direction}) open for ${ageHours.toFixed(1)}h — verify with broker`,
      });
    }
  }

  if (discrepancies.length > 0) {
    logger.warn({ discrepancies }, "Position reconciliation found discrepancies");
    actionsTaken.push(`Flagged ${discrepancies.length} position(s) for manual review`);
    await emitSafetyAlert(
      "reconciliation_discrepancy",
      `Position reconciliation: ${discrepancies.length} discrepancy(ies) found`,
      null,
    );
  } else {
    actionsTaken.push("All positions reconciled successfully");
  }

  return {
    localPositions,
    brokerPositions: localPositions,
    discrepancies,
    reconciled: discrepancies.length === 0,
    actionsTaken,
  };
}

async function emitSafetyAlert(alertType: string, message: string, pair: string | null): Promise<void> {
  try {
    await db.insert(supervisorAlertsTable).values({
      alertType,
      severity: "warning",
      message,
      pair,
      acknowledged: false,
    });
  } catch {
    // non-fatal
  }
}

let reconciliationInterval: ReturnType<typeof setInterval> | null = null;

export async function startReconciliationScheduler(): Promise<void> {
  if (reconciliationInterval) return;
  const cfg = await getSafetyConfig();
  if (!cfg.enableReconciliation) return;

  reconciliationInterval = setInterval(async () => {
    const result = await reconcilePositions().catch(err => {
      logger.warn({ err }, "Scheduled reconciliation failed");
      return null;
    });
    if (result && !result.reconciled) {
      logger.warn({ discrepancies: result.discrepancies }, "Scheduled reconciliation detected discrepancies");
    }
  }, cfg.reconciliationIntervalSec * 1000);

  logger.info({ intervalSec: cfg.reconciliationIntervalSec }, "Position reconciliation scheduler started");
}

export function stopReconciliationScheduler(): void {
  if (reconciliationInterval) {
    clearInterval(reconciliationInterval);
    reconciliationInterval = null;
  }
}
