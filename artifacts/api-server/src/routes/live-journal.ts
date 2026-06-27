import { Router } from "express";
import { db, liveJournalTable, tradesTable, botStateTable } from "@workspace/db";
import { eq, desc, and, gte, lte } from "drizzle-orm";

const router = Router();

router.get("/live-journal", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
  const offset = parseInt(String(req.query.offset ?? "0"));
  const pair = req.query.pair as string | undefined;
  const mode = req.query.mode as string | undefined;

  const conditions = [];
  if (pair) conditions.push(eq(liveJournalTable.pair, pair));
  if (mode) conditions.push(eq(liveJournalTable.mode, mode));

  const [entries, total] = await Promise.all([
    db.select()
      .from(liveJournalTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(liveJournalTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.$count(liveJournalTable, conditions.length ? and(...conditions) : undefined),
  ]);

  res.json({
    entries: entries.map(e => ({
      id: e.id,
      tradeId: e.tradeId,
      pair: e.pair,
      direction: e.direction,
      entryReason: e.entryReason,
      exitReason: e.exitReason,
      ruleEvaluation: e.ruleEvaluation,
      confidenceScores: e.confidenceScores,
      marketRegime: e.marketRegime,
      regimeConfidence: e.regimeConfidence != null ? parseFloat(e.regimeConfidence) : null,
      brokerExecution: e.brokerExecution,
      screenshots: e.screenshots,
      notes: e.notes,
      mode: e.mode,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    })),
    total,
    limit,
    offset,
  });
});

router.get("/live-journal/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [entry] = await db.select().from(liveJournalTable).where(eq(liveJournalTable.id, id)).limit(1);
  if (!entry) { res.status(404).json({ error: "Journal entry not found" }); return; }

  let trade = null;
  if (entry.tradeId) {
    const [t] = await db.select().from(tradesTable).where(eq(tradesTable.id, entry.tradeId)).limit(1);
    trade = t ?? null;
  }

  res.json({
    id: entry.id,
    tradeId: entry.tradeId,
    pair: entry.pair,
    direction: entry.direction,
    entryReason: entry.entryReason,
    exitReason: entry.exitReason,
    ruleEvaluation: entry.ruleEvaluation,
    confidenceScores: entry.confidenceScores,
    marketRegime: entry.marketRegime,
    regimeConfidence: entry.regimeConfidence != null ? parseFloat(entry.regimeConfidence) : null,
    brokerExecution: entry.brokerExecution,
    screenshots: entry.screenshots,
    notes: entry.notes,
    mode: entry.mode,
    trade: trade ? {
      entryPrice: parseFloat(trade.entryPrice),
      closedPrice: trade.closedPrice != null ? parseFloat(trade.closedPrice) : null,
      pnl: trade.pnl != null ? parseFloat(trade.pnl) : null,
      status: trade.status,
      closeReason: trade.closeReason,
      openedAt: trade.openedAt?.toISOString(),
      closedAt: trade.closedAt?.toISOString(),
      tqi: trade.tqi != null ? parseFloat(trade.tqi) : null,
      tqiGrade: trade.tqiGrade,
      mtfScore: trade.mtfScore != null ? parseFloat(trade.mtfScore) : null,
      regime: trade.regime,
    } : null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  });
});

router.post("/live-journal", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  if (!body.pair || !body.direction) {
    res.status(400).json({ error: "pair and direction are required" });
    return;
  }

  const [state] = await db.select({ brokerMode: botStateTable.brokerMode }).from(botStateTable).limit(1);

  const [entry] = await db.insert(liveJournalTable).values({
    tradeId: body.tradeId != null ? Number(body.tradeId) : null,
    pair: String(body.pair),
    direction: String(body.direction),
    entryReason: body.entryReason != null ? String(body.entryReason) : null,
    exitReason: body.exitReason != null ? String(body.exitReason) : null,
    ruleEvaluation: body.ruleEvaluation as Record<string, unknown> ?? null,
    confidenceScores: body.confidenceScores as Record<string, unknown> ?? null,
    marketRegime: body.marketRegime != null ? String(body.marketRegime) : null,
    regimeConfidence: body.regimeConfidence != null ? String(body.regimeConfidence) : null,
    brokerExecution: body.brokerExecution as Record<string, unknown> ?? null,
    screenshots: body.screenshots ?? null,
    notes: body.notes != null ? String(body.notes) : null,
    mode: body.mode != null ? String(body.mode) : (state?.brokerMode ?? "paper"),
  }).returning();

  res.status(201).json({ id: entry.id, createdAt: entry.createdAt.toISOString() });
});

router.put("/live-journal/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = req.body as Record<string, unknown>;
  const updates: Partial<typeof liveJournalTable.$inferInsert> = {};

  if (body.entryReason !== undefined) updates.entryReason = body.entryReason != null ? String(body.entryReason) : null;
  if (body.exitReason !== undefined) updates.exitReason = body.exitReason != null ? String(body.exitReason) : null;
  if (body.ruleEvaluation !== undefined) updates.ruleEvaluation = body.ruleEvaluation as Record<string, unknown>;
  if (body.confidenceScores !== undefined) updates.confidenceScores = body.confidenceScores as Record<string, unknown>;
  if (body.brokerExecution !== undefined) updates.brokerExecution = body.brokerExecution as Record<string, unknown>;
  if (body.notes !== undefined) updates.notes = body.notes != null ? String(body.notes) : null;
  if (body.screenshots !== undefined) updates.screenshots = body.screenshots;

  const [updated] = await db.update(liveJournalTable).set(updates).where(eq(liveJournalTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Journal entry not found" }); return; }

  res.json({ id: updated.id, updatedAt: updated.updatedAt.toISOString() });
});

export async function createJournalEntryForTrade(params: {
  tradeId: number;
  pair: string;
  direction: string;
  entryReason: string;
  ruleEvaluation: Record<string, unknown>;
  confidenceScores: Record<string, unknown>;
  marketRegime: string | null;
  regimeConfidence: number | null;
  brokerExecution: Record<string, unknown>;
  mode: string;
}): Promise<void> {
  await db.insert(liveJournalTable).values({
    tradeId: params.tradeId,
    pair: params.pair,
    direction: params.direction,
    entryReason: params.entryReason,
    ruleEvaluation: params.ruleEvaluation,
    confidenceScores: params.confidenceScores,
    marketRegime: params.marketRegime,
    regimeConfidence: params.regimeConfidence != null ? String(params.regimeConfidence) : null,
    brokerExecution: params.brokerExecution,
    mode: params.mode,
  });
}

export default router;
