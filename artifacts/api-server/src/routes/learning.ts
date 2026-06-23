import { Router, type IRouter } from "express";
import { db, rlAgentTable, setupScoresTable } from "@workspace/db";
import {
  GetLearningStatsResponse,
  GetSetupScoresResponseItem,
  ResetLearningResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function ensureRlAgent() {
  const [agent] = await db.select().from(rlAgentTable).limit(1);
  if (!agent) {
    await db.insert(rlAgentTable).values({});
  }
}

router.get("/learning/stats", async (_req, res): Promise<void> => {
  await ensureRlAgent();
  const [agent] = await db.select().from(rlAgentTable).limit(1);
  res.json(GetLearningStatsResponse.parse({
    episode: agent!.episode,
    totalReward: parseFloat(agent!.totalReward ?? "0"),
    avgReward: parseFloat(agent!.avgReward ?? "0"),
    epsilon: parseFloat(agent!.epsilon ?? "1"),
    learningRate: parseFloat(agent!.learningRate ?? "0.001"),
    tradesAnalyzed: agent!.tradesAnalyzed,
    modelVersion: agent!.modelVersion,
    lastTrained: agent!.lastTrained?.toISOString() ?? new Date().toISOString(),
  }));
});

router.get("/learning/setup-scores", async (_req, res): Promise<void> => {
  const scores = await db.select().from(setupScoresTable);
  res.json(scores.map(s => GetSetupScoresResponseItem.parse({
    pattern: s.pattern,
    avgScore: parseFloat(s.avgScore ?? "0"),
    confidence: parseFloat(s.confidence ?? "0"),
    trades: s.trades,
    winRate: parseFloat(s.winRate ?? "0"),
    avgPnl: parseFloat(s.avgPnl ?? "0"),
  })));
});

router.post("/learning/reset", async (_req, res): Promise<void> => {
  await ensureRlAgent();
  await db.update(rlAgentTable).set({
    episode: 0,
    totalReward: "0",
    avgReward: "0",
    epsilon: "1",
    tradesAnalyzed: 0,
    modelVersion: 1,
    lastTrained: new Date(),
  });
  const [agent] = await db.select().from(rlAgentTable).limit(1);
  res.json(ResetLearningResponse.parse({
    episode: agent!.episode,
    totalReward: parseFloat(agent!.totalReward ?? "0"),
    avgReward: parseFloat(agent!.avgReward ?? "0"),
    epsilon: parseFloat(agent!.epsilon ?? "1"),
    learningRate: parseFloat(agent!.learningRate ?? "0.001"),
    tradesAnalyzed: agent!.tradesAnalyzed,
    modelVersion: agent!.modelVersion,
    lastTrained: agent!.lastTrained?.toISOString() ?? new Date().toISOString(),
  }));
});

export default router;
