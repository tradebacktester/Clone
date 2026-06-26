import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, brokerAccountsTable, riskSettingsTable, botStateTable } from "@workspace/db";
import {
  ListBrokerAccountsResponseItem,
  AddBrokerAccountBody,
  DeleteBrokerAccountParams,
  GetRiskSettingsResponse,
  UpdateRiskSettingsBody,
  UpdateRiskSettingsResponse,
  SetLiveModeBody,
  SetLiveModeResponse,
  GetExecutionLogQueryParams,
  GetExecutionLogResponse,
} from "@workspace/api-zod";
import { setLiveMode, getExecutionLog } from "../lib/broker-engine.js";

const router: IRouter = Router();

async function ensureRiskSettings() {
  const [rs] = await db.select().from(riskSettingsTable).limit(1);
  if (!rs) {
    await db.insert(riskSettingsTable).values({});
  }
}

function mapBroker(b: typeof brokerAccountsTable.$inferSelect) {
  return ListBrokerAccountsResponseItem.parse({
    id: b.id,
    broker: b.broker as "oanda" | "mt5" | "tradelocker",
    accountId: b.accountId,
    accountName: b.accountName,
    active: b.active ?? true,
    paperTrading: b.paperTrading ?? true,
    balance: b.balance != null ? parseFloat(b.balance) : null,
    createdAt: b.createdAt?.toISOString() ?? new Date().toISOString(),
  });
}

router.get("/broker/accounts", async (_req, res): Promise<void> => {
  const accounts = await db.select().from(brokerAccountsTable);
  res.json(accounts.map(mapBroker));
});

router.post("/broker/accounts", async (req, res): Promise<void> => {
  const parsed = AddBrokerAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [account] = await db
    .insert(brokerAccountsTable)
    .values({
      broker: parsed.data.broker,
      accountId: parsed.data.accountId,
      accountName: parsed.data.accountName,
      apiKey: parsed.data.apiKey,
      apiSecret: parsed.data.apiSecret ?? null,
      paperTrading: parsed.data.paperTrading ?? true,
    })
    .returning();

  res.status(201).json(mapBroker(account!));
});

router.delete("/broker/accounts/:id", async (req, res): Promise<void> => {
  const params = DeleteBrokerAccountParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(brokerAccountsTable).where(eq(brokerAccountsTable.id, params.data.id));
  res.sendStatus(204);
});

router.put("/broker/live-mode", async (req, res): Promise<void> => {
  const parsed = SetLiveModeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await setLiveMode(parsed.data.enabled);

  const [state] = await db.select().from(botStateTable).limit(1);
  res.json(SetLiveModeResponse.parse({
    liveEnabled: state?.liveEnabled ?? false,
    updatedAt: state?.updatedAt?.toISOString() ?? new Date().toISOString(),
  }));
});

router.get("/broker/execution-log", async (req, res): Promise<void> => {
  const parsed = GetExecutionLogQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { limit, offset, eventType } = parsed.data;
  const { entries, total } = await getExecutionLog({
    limit: limit ?? 50,
    offset: offset ?? 0,
    eventType: eventType ?? undefined,
  });

  const mapped = entries.map(e => ({
    id: e.id,
    eventType: e.eventType,
    tradeId: e.tradeId ?? null,
    pair: e.pair ?? null,
    direction: e.direction ?? null,
    price: e.price != null ? parseFloat(e.price) : null,
    slippagePips: e.slippagePips != null ? parseFloat(e.slippagePips) : null,
    pnl: e.pnl != null ? parseFloat(e.pnl) : null,
    reason: e.reason,
    mode: e.mode as "paper" | "live",
    createdAt: e.createdAt.toISOString(),
  }));

  res.json(GetExecutionLogResponse.parse({ entries: mapped, total }));
});

router.get("/risk/settings", async (_req, res): Promise<void> => {
  await ensureRiskSettings();
  const [rs] = await db.select().from(riskSettingsTable).limit(1);
  res.json(GetRiskSettingsResponse.parse({
    id: rs!.id,
    riskPerTrade: parseFloat(rs!.riskPerTrade ?? "0.75"),
    maxDailyLoss: parseFloat(rs!.maxDailyLoss ?? "3"),
    maxWeeklyLoss: parseFloat(rs!.maxWeeklyLoss ?? "6"),
    maxOpenTrades: rs!.maxOpenTrades ?? 3,
    useTrailingStop: rs!.useTrailingStop ?? true,
    trailingStopAt: parseFloat(rs!.trailingStopAt ?? "1"),
    breakEvenAt: parseFloat(rs!.breakEvenAt ?? "0.5"),
    updatedAt: rs!.updatedAt?.toISOString() ?? new Date().toISOString(),
  }));
});

router.put("/risk/settings", async (req, res): Promise<void> => {
  const parsed = UpdateRiskSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureRiskSettings();
  const updates: Record<string, unknown> = {};
  if (parsed.data.riskPerTrade !== undefined) updates.riskPerTrade = String(parsed.data.riskPerTrade);
  if (parsed.data.maxDailyLoss !== undefined) updates.maxDailyLoss = String(parsed.data.maxDailyLoss);
  if (parsed.data.maxWeeklyLoss !== undefined) updates.maxWeeklyLoss = String(parsed.data.maxWeeklyLoss);
  if (parsed.data.maxOpenTrades !== undefined) updates.maxOpenTrades = parsed.data.maxOpenTrades;
  if (parsed.data.useTrailingStop !== undefined) updates.useTrailingStop = parsed.data.useTrailingStop;
  if (parsed.data.trailingStopAt !== undefined) updates.trailingStopAt = String(parsed.data.trailingStopAt);
  if (parsed.data.breakEvenAt !== undefined) updates.breakEvenAt = String(parsed.data.breakEvenAt);

  await db.update(riskSettingsTable).set(updates);
  const [rs] = await db.select().from(riskSettingsTable).limit(1);
  res.json(UpdateRiskSettingsResponse.parse({
    id: rs!.id,
    riskPerTrade: parseFloat(rs!.riskPerTrade ?? "0.75"),
    maxDailyLoss: parseFloat(rs!.maxDailyLoss ?? "3"),
    maxWeeklyLoss: parseFloat(rs!.maxWeeklyLoss ?? "6"),
    maxOpenTrades: rs!.maxOpenTrades ?? 3,
    useTrailingStop: rs!.useTrailingStop ?? true,
    trailingStopAt: parseFloat(rs!.trailingStopAt ?? "1"),
    breakEvenAt: parseFloat(rs!.breakEvenAt ?? "0.5"),
    updatedAt: rs!.updatedAt?.toISOString() ?? new Date().toISOString(),
  }));
});

export default router;
