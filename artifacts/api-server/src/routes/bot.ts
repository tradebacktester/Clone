import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, botConfigTable, botStateTable, tradesTable } from "@workspace/db";
import {
  GetBotStatusResponse,
  StartBotBody,
  StartBotResponse,
  StopBotResponse,
  GetBotConfigResponse,
  UpdateBotConfigBody,
  UpdateBotConfigResponse,
} from "@workspace/api-zod";
import { startAnalysisScheduler, stopAnalysisScheduler } from "../lib/analyzer.js";

const router: IRouter = Router();

async function ensureDefaults() {
  const [state] = await db.select().from(botStateTable).limit(1);
  if (!state) {
    await db.insert(botStateTable).values({ running: false, mode: "paper", activePairs: [] });
  }
  const [config] = await db.select().from(botConfigTable).limit(1);
  if (!config) {
    await db.insert(botConfigTable).values({});
  }
}

router.get("/bot/status", async (req, res): Promise<void> => {
  await ensureDefaults();
  const [state] = await db.select().from(botStateTable).limit(1);
  const openTrades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "open"));

  const closedToday = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"));

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTrades = closedToday.filter(
    t => t.closedAt && new Date(t.closedAt) >= todayStart,
  );

  const dailyPnl = todayTrades.reduce((sum, t) => sum + parseFloat(t.pnl ?? "0"), 0);
  const dailyLoss = Math.min(dailyPnl, 0);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekTrades = closedToday.filter(
    t => t.closedAt && new Date(t.closedAt) >= weekStart,
  );
  const weeklyPnl = weekTrades.reduce((sum, t) => sum + parseFloat(t.pnl ?? "0"), 0);
  const weeklyLoss = Math.min(weeklyPnl, 0);

  const payload = {
    running: state!.running,
    mode: state!.mode as "live" | "paper" | "backtest",
    activePairs: state!.activePairs ?? [],
    openTrades: openTrades.length,
    dailyPnl,
    dailyLoss,
    weeklyLoss,
    haltedDueToRisk: state!.haltedDueToRisk ?? false,
    lastUpdated: state!.updatedAt?.toISOString() ?? new Date().toISOString(),
  };

  res.json(GetBotStatusResponse.parse(payload));
});

router.post("/bot/start", async (req, res): Promise<void> => {
  const parsed = StartBotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureDefaults();
  await db
    .update(botStateTable)
    .set({ running: true, mode: parsed.data.mode, activePairs: parsed.data.pairs, haltedDueToRisk: false });

  startAnalysisScheduler(10);

  const [state] = await db.select().from(botStateTable).limit(1);
  const payload = {
    running: true,
    mode: state!.mode as "live" | "paper" | "backtest",
    activePairs: state!.activePairs ?? [],
    openTrades: 0,
    dailyPnl: 0,
    dailyLoss: 0,
    weeklyLoss: 0,
    haltedDueToRisk: false,
    lastUpdated: new Date().toISOString(),
  };
  res.json(StartBotResponse.parse(payload));
});

router.post("/bot/stop", async (_req, res): Promise<void> => {
  await ensureDefaults();
  await db.update(botStateTable).set({ running: false, activePairs: [] });
  stopAnalysisScheduler();
  const payload = {
    running: false,
    mode: "paper" as const,
    activePairs: [],
    openTrades: 0,
    dailyPnl: 0,
    dailyLoss: 0,
    weeklyLoss: 0,
    haltedDueToRisk: false,
    lastUpdated: new Date().toISOString(),
  };
  res.json(StopBotResponse.parse(payload));
});

router.get("/bot/config", async (_req, res): Promise<void> => {
  await ensureDefaults();
  const [config] = await db.select().from(botConfigTable).limit(1);
  const payload = {
    id: config!.id,
    pairs: config!.pairs ?? [],
    sessions: config!.sessions ?? [],
    riskPerTrade: parseFloat(config!.riskPerTrade ?? "0.75"),
    maxDailyLoss: parseFloat(config!.maxDailyLoss ?? "3"),
    maxWeeklyLoss: parseFloat(config!.maxWeeklyLoss ?? "6"),
    newsFilterEnabled: config!.newsFilterEnabled ?? true,
    trailingStopEnabled: config!.trailingStopEnabled ?? true,
    confirmationRequired: config!.confirmationRequired ?? false,
    createdAt: config!.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: config!.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
  res.json(GetBotConfigResponse.parse(payload));
});

router.put("/bot/config", async (req, res): Promise<void> => {
  const parsed = UpdateBotConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureDefaults();
  const updates: Record<string, unknown> = {};
  if (parsed.data.pairs !== undefined) updates.pairs = parsed.data.pairs;
  if (parsed.data.sessions !== undefined) updates.sessions = parsed.data.sessions;
  if (parsed.data.riskPerTrade !== undefined) updates.riskPerTrade = String(parsed.data.riskPerTrade);
  if (parsed.data.maxDailyLoss !== undefined) updates.maxDailyLoss = String(parsed.data.maxDailyLoss);
  if (parsed.data.maxWeeklyLoss !== undefined) updates.maxWeeklyLoss = String(parsed.data.maxWeeklyLoss);
  if (parsed.data.newsFilterEnabled !== undefined) updates.newsFilterEnabled = parsed.data.newsFilterEnabled;
  if (parsed.data.trailingStopEnabled !== undefined) updates.trailingStopEnabled = parsed.data.trailingStopEnabled;
  if (parsed.data.confirmationRequired !== undefined) updates.confirmationRequired = parsed.data.confirmationRequired;

  await db.update(botConfigTable).set(updates);
  const [config] = await db.select().from(botConfigTable).limit(1);
  const payload = {
    id: config!.id,
    pairs: config!.pairs ?? [],
    sessions: config!.sessions ?? [],
    riskPerTrade: parseFloat(config!.riskPerTrade ?? "0.75"),
    maxDailyLoss: parseFloat(config!.maxDailyLoss ?? "3"),
    maxWeeklyLoss: parseFloat(config!.maxWeeklyLoss ?? "6"),
    newsFilterEnabled: config!.newsFilterEnabled ?? true,
    trailingStopEnabled: config!.trailingStopEnabled ?? true,
    confirmationRequired: config!.confirmationRequired ?? false,
    createdAt: config!.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: config!.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
  res.json(UpdateBotConfigResponse.parse(payload));
});

export default router;
