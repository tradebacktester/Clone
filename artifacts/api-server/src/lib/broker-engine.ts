import { db, executionLogTable, tradesTable, botStateTable } from "@workspace/db";
import { eq, desc, and, isNull, isNotNull } from "drizzle-orm";
import { getCurrentPrice } from "./price-feed.js";
import { logger } from "./logger.js";
import type { Pair } from "@workspace/market-analysis";
import { closeTradeMemory } from "./memory-engine.js";

const INITIAL_PAPER_BALANCE = 10_000;

function getPipSize(pair: string): number {
  return pair.includes("JPY") ? 0.01 : 0.0001;
}

function applyExitSlippage(
  pair: string,
  direction: string,
  price: number,
): { price: number; pips: number } {
  const pipSize = getPipSize(pair);
  const slippagePips = 0.3 + Math.random() * 0.7;
  const slippagePrice = slippagePips * pipSize;
  const adjusted = direction === "buy" ? price - slippagePrice : price + slippagePrice;
  return {
    price: Math.round(adjusted * 1_000_000) / 1_000_000,
    pips: Math.round(slippagePips * 10) / 10,
  };
}

export type ExecutionEventType =
  | "trade_opened"
  | "trade_closed"
  | "emergency_stop"
  | "daily_halt"
  | "weekly_halt"
  | "manual_close"
  | "live_enabled"
  | "live_disabled"
  | "resume"
  | "bot_started"
  | "bot_stopped";

export async function logExecution(event: {
  eventType: ExecutionEventType;
  tradeId?: number | null;
  pair?: string | null;
  direction?: string | null;
  price?: number | null;
  slippagePips?: number | null;
  pnl?: number | null;
  reason?: string;
  mode?: "paper" | "live";
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.insert(executionLogTable).values({
      eventType: event.eventType,
      tradeId: event.tradeId ?? null,
      pair: event.pair ?? null,
      direction: event.direction ?? null,
      price: event.price != null ? String(event.price) : null,
      slippagePips: event.slippagePips != null ? String(event.slippagePips) : null,
      pnl: event.pnl != null ? String(event.pnl) : null,
      reason: event.reason ?? "",
      mode: event.mode ?? "paper",
      meta: event.meta ?? null,
    });
  } catch (err) {
    logger.warn({ err, eventType: event.eventType }, "Failed to write execution log entry");
  }
}

export async function triggerEmergencyStop(): Promise<{ tradesClosed: number }> {
  const [state] = await db.select().from(botStateTable).limit(1);
  const mode = (state?.mode ?? "paper") as "paper" | "live";

  await db.update(botStateTable).set({
    running: false,
    emergencyStop: true,
    haltedDueToRisk: true,
    activePairs: [],
  });

  const openTrades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "open"));

  let tradesClosed = 0;

  for (const trade of openTrades) {
    const pair = trade.pair as Pair;
    const priceEntry = getCurrentPrice(pair);
    const midPrice = priceEntry?.mid ?? parseFloat(trade.currentPrice ?? trade.entryPrice);

    const { price: closePrice, pips: exitSlippage } = applyExitSlippage(
      trade.pair,
      trade.direction,
      midPrice,
    );

    const entryPrice = parseFloat(trade.entryPrice);
    const lotSize = parseFloat(trade.lotSize);
    const pipSize = getPipSize(trade.pair);
    const priceDiff = trade.direction === "buy"
      ? closePrice - entryPrice
      : entryPrice - closePrice;
    const pips = priceDiff / pipSize;
    const pnl = Math.round(pips * lotSize * 10 * 100) / 100;
    const pnlPercent = (pnl / INITIAL_PAPER_BALANCE) * 100;

    await db.update(tradesTable).set({
      status: "closed",
      closedPrice: String(closePrice),
      currentPrice: String(closePrice),
      pnl: String(pnl),
      pnlPercent: String(Math.round(pnlPercent * 1000) / 1000),
      closedAt: new Date(),
      closeReason: "emergency_stop",
      exitSlippagePips: String(exitSlippage),
    }).where(eq(tradesTable.id, trade.id));

    closeTradeMemory(
      trade.id,
      pnl > 0 ? "win" : "loss",
      pnl,
      pnlPercent,
      "emergency_stop",
      0,
      exitSlippage,
      trade.openedAt ?? new Date(),
      parseFloat(trade.slippagePips ?? "0"),
    ).catch(() => {});

    await logExecution({
      eventType: "trade_closed",
      tradeId: trade.id,
      pair: trade.pair,
      direction: trade.direction,
      price: closePrice,
      slippagePips: exitSlippage,
      pnl,
      reason: "emergency_stop",
      mode,
    });

    tradesClosed++;
  }

  await logExecution({
    eventType: "emergency_stop",
    reason: "manual emergency stop triggered",
    mode,
    meta: { tradesClosed },
  });

  logger.warn({ tradesClosed }, "Emergency stop triggered — all positions closed");
  return { tradesClosed };
}

export async function resumeFromHalt(): Promise<void> {
  const [state] = await db.select().from(botStateTable).limit(1);
  const mode = (state?.mode ?? "paper") as "paper" | "live";

  await db.update(botStateTable).set({
    haltedDueToRisk: false,
    emergencyStop: false,
  });

  await logExecution({
    eventType: "resume",
    reason: "manual resume from halt",
    mode,
  });

  logger.info("Bot halt cleared — ready to resume");
}

export async function setLiveMode(enabled: boolean): Promise<void> {
  const [state] = await db.select().from(botStateTable).limit(1);
  const currentMode = (state?.mode ?? "paper") as "paper" | "live";

  await db.update(botStateTable).set({ liveEnabled: enabled });

  await logExecution({
    eventType: enabled ? "live_enabled" : "live_disabled",
    reason: enabled ? "live trading enabled by user" : "live trading disabled by user",
    mode: currentMode,
  });

  logger.info({ liveEnabled: enabled }, "Live mode updated");
}

export async function logBotStart(mode: "paper" | "live", pairs: string[]): Promise<void> {
  await logExecution({
    eventType: "bot_started",
    reason: `bot started in ${mode} mode`,
    mode,
    meta: { pairs },
  });
}

export async function logBotStop(mode: "paper" | "live"): Promise<void> {
  await logExecution({
    eventType: "bot_stopped",
    reason: "bot stopped by user",
    mode,
  });
}

export async function logTradeOpened(params: {
  tradeId: number;
  pair: string;
  direction: string;
  price: number;
  slippagePips: number;
  mode: "paper" | "live";
}): Promise<void> {
  await logExecution({
    eventType: "trade_opened",
    tradeId: params.tradeId,
    pair: params.pair,
    direction: params.direction,
    price: params.price,
    slippagePips: params.slippagePips,
    reason: "signal executed",
    mode: params.mode,
  });
}

export async function logTradeClosed(params: {
  tradeId: number;
  pair: string;
  direction: string;
  price: number;
  slippagePips: number;
  pnl: number;
  reason: string;
  mode: "paper" | "live";
}): Promise<void> {
  await logExecution({
    eventType: "trade_closed",
    tradeId: params.tradeId,
    pair: params.pair,
    direction: params.direction,
    price: params.price,
    slippagePips: params.slippagePips,
    pnl: params.pnl,
    reason: params.reason,
    mode: params.mode,
  });
}

export async function logDailyHalt(pair: string, dailyLoss: number, mode: "paper" | "live"): Promise<void> {
  await logExecution({
    eventType: "daily_halt",
    pair,
    reason: "daily loss limit reached",
    mode,
    meta: { dailyLoss },
  });
}

export async function logWeeklyHalt(pair: string, weeklyLoss: number, mode: "paper" | "live"): Promise<void> {
  await logExecution({
    eventType: "weekly_halt",
    pair,
    reason: "weekly loss limit reached",
    mode,
    meta: { weeklyLoss },
  });
}

export async function logManualClose(params: {
  tradeId: number;
  pair: string;
  direction: string;
  price: number;
  pnl: number;
  mode: "paper" | "live";
}): Promise<void> {
  await logExecution({
    eventType: "manual_close",
    tradeId: params.tradeId,
    pair: params.pair,
    direction: params.direction,
    price: params.price,
    pnl: params.pnl,
    reason: "manual override by user",
    mode: params.mode,
  });
}

export async function getExecutionLog(opts: {
  limit: number;
  offset: number;
  eventType?: string;
}): Promise<{ entries: typeof executionLogTable.$inferSelect[]; total: number }> {
  const conditions = [];
  if (opts.eventType) {
    conditions.push(eq(executionLogTable.eventType, opts.eventType));
  }

  const [entries, total] = await Promise.all([
    db
      .select()
      .from(executionLogTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(executionLogTable.createdAt))
      .limit(opts.limit)
      .offset(opts.offset),
    db.$count(executionLogTable, conditions.length ? and(...conditions) : undefined),
  ]);

  return { entries, total };
}
