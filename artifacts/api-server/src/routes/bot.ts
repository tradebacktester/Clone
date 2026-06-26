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
  EmergencyStopResponse,
  ResumeBotResponse,
} from "@workspace/api-zod";
import { startAnalysisScheduler, stopAnalysisScheduler } from "../lib/analyzer.js";
import { startPaperMonitor, stopPaperMonitor } from "../lib/paper-engine.js";
import {
  triggerEmergencyStop,
  resumeFromHalt,
  logBotStart,
  logBotStop,
} from "../lib/broker-engine.js";

const router: IRouter = Router();

async function ensureDefaults() {
  const [state] = await db.select().from(botStateTable).limit(1);
  if (!state) {
    await db.insert(botStateTable).values({
      running: false,
      mode: "paper",
      activePairs: [],
      liveEnabled: false,
      emergencyStop: false,
    });
  }
  const [config] = await db.select().from(botConfigTable).limit(1);
  if (!config) {
    await db.insert(botConfigTable).values({});
  }
}

function buildBotStatus(state: typeof botStateTable.$inferSelect, openTradesCount: number, dailyPnl: number, weeklyPnl: number) {
  return {
    running: state.running,
    mode: state.mode as "live" | "paper" | "backtest",
    activePairs: state.activePairs ?? [],
    openTrades: openTradesCount,
    dailyPnl,
    dailyLoss: Math.min(dailyPnl, 0),
    weeklyLoss: Math.min(weeklyPnl, 0),
    haltedDueToRisk: state.haltedDueToRisk ?? false,
    emergencyStop: state.emergencyStop ?? false,
    liveEnabled: state.liveEnabled ?? false,
    lastUpdated: state.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

router.get("/bot/status", async (req, res): Promise<void> => {
  await ensureDefaults();
  const [state] = await db.select().from(botStateTable).limit(1);
  const openTrades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "open"));

  const closedTrades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"));

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date();
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
  weekStart.setUTCHours(0, 0, 0, 0);

  const dailyPnl = closedTrades
    .filter(t => t.closedAt && new Date(t.closedAt) >= todayStart)
    .reduce((sum, t) => sum + parseFloat(t.pnl ?? "0"), 0);

  const weeklyPnl = closedTrades
    .filter(t => t.closedAt && new Date(t.closedAt) >= weekStart)
    .reduce((sum, t) => sum + parseFloat(t.pnl ?? "0"), 0);

  res.json(GetBotStatusResponse.parse(buildBotStatus(state!, openTrades.length, dailyPnl, weeklyPnl)));
});

router.post("/bot/start", async (req, res): Promise<void> => {
  const parsed = StartBotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureDefaults();

  const [state] = await db.select().from(botStateTable).limit(1);

  if (parsed.data.mode === "live" && !state?.liveEnabled) {
    res.status(403).json({ error: "Live trading is not enabled. Enable it in Settings → Broker Controls before starting in live mode." });
    return;
  }

  await db
    .update(botStateTable)
    .set({
      running: true,
      mode: parsed.data.mode,
      activePairs: parsed.data.pairs,
      haltedDueToRisk: false,
      emergencyStop: false,
    });

  logBotStart(parsed.data.mode as "paper" | "live", parsed.data.pairs).catch(() => {});

  startAnalysisScheduler(10);
  if (parsed.data.mode === "paper") {
    startPaperMonitor(30);
  }

  const [updatedState] = await db.select().from(botStateTable).limit(1);
  res.json(StartBotResponse.parse(buildBotStatus(updatedState!, 0, 0, 0)));
});

router.post("/bot/stop", async (_req, res): Promise<void> => {
  await ensureDefaults();

  const [state] = await db.select().from(botStateTable).limit(1);
  const mode = (state?.mode ?? "paper") as "paper" | "live";

  await db.update(botStateTable).set({ running: false, activePairs: [] });
  logBotStop(mode).catch(() => {});
  stopAnalysisScheduler();
  stopPaperMonitor();

  const [updatedState] = await db.select().from(botStateTable).limit(1);
  res.json(StopBotResponse.parse(buildBotStatus(updatedState!, 0, 0, 0)));
});

router.post("/bot/emergency-stop", async (_req, res): Promise<void> => {
  await ensureDefaults();
  stopAnalysisScheduler();
  stopPaperMonitor();

  const { tradesClosed } = await triggerEmergencyStop();

  res.json(EmergencyStopResponse.parse({
    stopped: true,
    tradesClosed,
    timestamp: new Date().toISOString(),
  }));
});

router.post("/bot/resume", async (_req, res): Promise<void> => {
  await ensureDefaults();
  await resumeFromHalt();

  const [state] = await db.select().from(botStateTable).limit(1);
  const openTrades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "open"));

  res.json(ResumeBotResponse.parse(buildBotStatus(state!, openTrades.length, 0, 0)));
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
