import { db, pilotConfigTable, pilotEventsTable, tradesTable } from "@workspace/db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { logger } from "./logger.js";

const PILOT_INITIAL_BALANCE = 1000; // small real-money account

async function getPilotConfig() {
  const [cfg] = await db.select().from(pilotConfigTable).limit(1);
  return cfg ?? null;
}

async function upsertPilotConfig(data: Partial<typeof pilotConfigTable.$inferInsert>) {
  const existing = await getPilotConfig();
  if (existing) {
    const [updated] = await db
      .update(pilotConfigTable)
      .set(data)
      .where(eq(pilotConfigTable.id, existing.id))
      .returning();
    return updated!;
  }
  const [inserted] = await db.insert(pilotConfigTable).values(data as typeof pilotConfigTable.$inferInsert).returning();
  return inserted!;
}

async function logEvent(
  eventType: string,
  data: {
    pair?: string;
    direction?: string;
    tradeId?: number;
    pnl?: number;
    riskPct?: number;
    notes?: string;
  } = {},
) {
  await db.insert(pilotEventsTable).values({
    eventType,
    pair: data.pair,
    direction: data.direction,
    tradeId: data.tradeId,
    pnl: data.pnl != null ? String(data.pnl) : undefined,
    riskPct: data.riskPct != null ? String(data.riskPct) : undefined,
    notes: data.notes,
  });
}

export interface PilotStatusResult {
  enabled: boolean;
  halted: boolean;
  haltReason: string | null;
  consecLosses: number;
  shutdownThreshold: number;
  maxRiskPerTradePct: number;
  maxDailyLossPct: number;
  maxWeeklyLossPct: number;
  maxOpenTrades: number;
  manualConfirmRequired: boolean;
  requireCertification: boolean;
  totalTrades: number;
  totalPnl: number;
  brokerAccountId: number | null;
  startedAt: string | null;
  stoppedAt: string | null;
  updatedAt: string;
  dailyPnl: number;
  weeklyPnl: number;
  currentOpenTrades: number;
  canTrade: boolean;
  blockReason: string | null;
}

export async function getPilotStatus(): Promise<PilotStatusResult> {
  const cfg = await getPilotConfig();

  if (!cfg) {
    return {
      enabled: false,
      halted: false,
      haltReason: null,
      consecLosses: 0,
      shutdownThreshold: 3,
      maxRiskPerTradePct: 0.25,
      maxDailyLossPct: 1.0,
      maxWeeklyLossPct: 2.0,
      maxOpenTrades: 1,
      manualConfirmRequired: true,
      requireCertification: true,
      totalTrades: 0,
      totalPnl: 0,
      brokerAccountId: null,
      startedAt: null,
      stoppedAt: null,
      updatedAt: new Date().toISOString(),
      dailyPnl: 0,
      weeklyPnl: 0,
      currentOpenTrades: 0,
      canTrade: false,
      blockReason: "Pilot mode not configured",
    };
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
  weekStart.setUTCHours(0, 0, 0, 0);

  const [agg] = await db
    .select({
      dailyPnl: sql<string>`COALESCE(SUM(pnl) FILTER (WHERE closed_at >= ${todayStart.toISOString()} AND status = 'closed'), 0)`,
      weeklyPnl: sql<string>`COALESCE(SUM(pnl) FILTER (WHERE closed_at >= ${weekStart.toISOString()} AND status = 'closed'), 0)`,
      openCount: sql<string>`COUNT(*) FILTER (WHERE status = 'open')`,
    })
    .from(tradesTable);

  const dailyPnl = parseFloat(agg?.dailyPnl ?? "0");
  const weeklyPnl = parseFloat(agg?.weeklyPnl ?? "0");
  const currentOpenTrades = parseInt(agg?.openCount ?? "0", 10);
  const maxRisk = parseFloat(cfg.maxRiskPerTradePct);
  const maxDaily = parseFloat(cfg.maxDailyLossPct);
  const maxWeekly = parseFloat(cfg.maxWeeklyLossPct);

  let blockReason: string | null = null;
  if (!cfg.enabled) blockReason = "Pilot mode is disabled";
  else if (cfg.halted) blockReason = cfg.haltReason ?? "Pilot mode is halted";
  else if (dailyPnl <= -(PILOT_INITIAL_BALANCE * maxDaily) / 100) blockReason = `Daily loss limit reached (${dailyPnl.toFixed(2)})`;
  else if (weeklyPnl <= -(PILOT_INITIAL_BALANCE * maxWeekly) / 100) blockReason = `Weekly loss limit reached (${weeklyPnl.toFixed(2)})`;
  else if (currentOpenTrades >= parseInt(String(cfg.maxOpenTrades))) blockReason = `Max open trades reached (${currentOpenTrades})`;

  return {
    enabled: cfg.enabled,
    halted: cfg.halted,
    haltReason: cfg.haltReason,
    consecLosses: cfg.consecLosses,
    shutdownThreshold: cfg.shutdownOnNConsecLosses,
    maxRiskPerTradePct: maxRisk,
    maxDailyLossPct: maxDaily,
    maxWeeklyLossPct: maxWeekly,
    maxOpenTrades: cfg.maxOpenTrades,
    manualConfirmRequired: cfg.manualConfirmRequired,
    requireCertification: cfg.requireCertification,
    totalTrades: cfg.totalTrades,
    totalPnl: parseFloat(cfg.totalPnl),
    brokerAccountId: cfg.brokerAccountId,
    startedAt: cfg.startedAt?.toISOString() ?? null,
    stoppedAt: cfg.stoppedAt?.toISOString() ?? null,
    updatedAt: cfg.updatedAt.toISOString(),
    dailyPnl: Math.round(dailyPnl * 100) / 100,
    weeklyPnl: Math.round(weeklyPnl * 100) / 100,
    currentOpenTrades,
    canTrade: blockReason === null,
    blockReason,
  };
}

export async function enablePilotMode(brokerAccountId?: number): Promise<{ success: boolean; message: string }> {
  const existing = await getPilotConfig();
  if (existing?.halted) {
    return { success: false, message: "Pilot mode is halted due to consecutive losses. Clear the halt before enabling." };
  }

  await upsertPilotConfig({
    enabled: true,
    halted: false,
    haltReason: null,
    brokerAccountId: brokerAccountId ?? null,
    startedAt: new Date(),
    stoppedAt: null,
  });

  await logEvent("started", { notes: brokerAccountId ? `Broker account ${brokerAccountId}` : undefined });
  logger.info({ brokerAccountId }, "Pilot mode enabled");
  return { success: true, message: "Pilot mode enabled. All trades capped at configured risk limits." };
}

export async function disablePilotMode(reason?: string): Promise<{ success: boolean; message: string }> {
  await upsertPilotConfig({
    enabled: false,
    stoppedAt: new Date(),
  });
  await logEvent("stopped", { notes: reason });
  logger.info({ reason }, "Pilot mode disabled");
  return { success: true, message: "Pilot mode disabled." };
}

export async function clearPilotHalt(): Promise<{ success: boolean; message: string }> {
  const cfg = await getPilotConfig();
  if (!cfg) return { success: false, message: "Pilot mode not configured" };
  await upsertPilotConfig({ halted: false, haltReason: null, consecLosses: 0 });
  await logEvent("started", { notes: "Halt cleared manually" });
  return { success: true, message: "Halt cleared. Consecutive loss counter reset." };
}

export async function updatePilotConfig(data: {
  maxRiskPerTradePct?: number;
  maxDailyLossPct?: number;
  maxWeeklyLossPct?: number;
  maxOpenTrades?: number;
  manualConfirmRequired?: boolean;
  shutdownOnNConsecLosses?: number;
  requireCertification?: boolean;
}): Promise<{ success: boolean; config: PilotStatusResult }> {
  const updateData: Partial<typeof pilotConfigTable.$inferInsert> = {};
  if (data.maxRiskPerTradePct !== undefined) {
    const clamped = Math.min(Math.max(data.maxRiskPerTradePct, 0.1), 0.5);
    updateData.maxRiskPerTradePct = String(clamped);
  }
  if (data.maxDailyLossPct !== undefined) updateData.maxDailyLossPct = String(data.maxDailyLossPct);
  if (data.maxWeeklyLossPct !== undefined) updateData.maxWeeklyLossPct = String(data.maxWeeklyLossPct);
  if (data.maxOpenTrades !== undefined) updateData.maxOpenTrades = Math.min(data.maxOpenTrades, 2);
  if (data.manualConfirmRequired !== undefined) updateData.manualConfirmRequired = data.manualConfirmRequired;
  if (data.shutdownOnNConsecLosses !== undefined) updateData.shutdownOnNConsecLosses = data.shutdownOnNConsecLosses;
  if (data.requireCertification !== undefined) updateData.requireCertification = data.requireCertification;

  await upsertPilotConfig(updateData);
  const status = await getPilotStatus();
  return { success: true, config: status };
}

export async function recordPilotTradeResult(tradeId: number, pnl: number, pair: string, direction: string): Promise<void> {
  const cfg = await getPilotConfig();
  if (!cfg) return;

  const isLoss = pnl < 0;
  const newConsecLosses = isLoss ? cfg.consecLosses + 1 : 0;
  const newTotalTrades = cfg.totalTrades + 1;
  const newTotalPnl = parseFloat(cfg.totalPnl) + pnl;

  const updates: Partial<typeof pilotConfigTable.$inferInsert> = {
    consecLosses: newConsecLosses,
    totalTrades: newTotalTrades,
    totalPnl: String(Math.round(newTotalPnl * 10000) / 10000),
  };

  if (newConsecLosses >= cfg.shutdownOnNConsecLosses) {
    updates.halted = true;
    updates.haltReason = `${newConsecLosses} consecutive losses — automatic halt triggered`;
    await logEvent("consec_loss_halt", {
      pair,
      direction,
      tradeId,
      pnl,
      notes: updates.haltReason,
    });
    logger.warn({ consecLosses: newConsecLosses, tradeId }, "Pilot mode: consecutive loss halt triggered");
  } else {
    await logEvent(pnl >= 0 ? "trade_closed" : "trade_closed", { pair, direction, tradeId, pnl });
  }

  await upsertPilotConfig(updates);
}

export async function getPilotEvents(limit = 50, offset = 0) {
  const events = await db
    .select()
    .from(pilotEventsTable)
    .orderBy(desc(pilotEventsTable.createdAt))
    .limit(Math.min(limit, 200))
    .offset(offset);

  return events.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    pair: e.pair,
    direction: e.direction,
    tradeId: e.tradeId,
    pnl: e.pnl != null ? parseFloat(e.pnl) : null,
    riskPct: e.riskPct != null ? parseFloat(e.riskPct) : null,
    notes: e.notes,
    createdAt: e.createdAt.toISOString(),
  }));
}
