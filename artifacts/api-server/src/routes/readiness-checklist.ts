import { Router } from "express";
import { db, readinessChecklistResultTable, botStateTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { runReadinessChecklist, getLatestChecklistResult } from "../lib/readiness-checklist.js";

const router = Router();

router.get("/readiness/checklist/latest", async (_req, res) => {
  const result = await getLatestChecklistResult();
  if (!result) {
    res.json({ hasResult: false, message: "No checklist run on record. Run the checklist to assess readiness." });
    return;
  }
  res.json({
    hasResult: true,
    id: result.id,
    runAt: result.runAt.toISOString(),
    overallPassed: result.overallPassed,
    readinessScore: parseFloat(result.readinessScore),
    items: result.items,
    blockers: result.blockers ?? [],
    warnings: result.warnings ?? [],
    recommendation: result.recommendation,
  });
});

router.post("/readiness/checklist/run", async (req, res) => {
  const forLive = req.body?.forLive === true;
  const result = await runReadinessChecklist(forLive);
  res.json(result);
});

router.get("/readiness/checklist/history", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "20")), 100);
  const history = await db
    .select()
    .from(readinessChecklistResultTable)
    .orderBy(desc(readinessChecklistResultTable.runAt))
    .limit(limit);

  res.json(history.map(r => ({
    id: r.id,
    runAt: r.runAt.toISOString(),
    overallPassed: r.overallPassed,
    readinessScore: parseFloat(r.readinessScore),
    recommendation: r.recommendation,
    blockerCount: Array.isArray(r.blockers) ? r.blockers.length : 0,
    warningCount: Array.isArray(r.warnings) ? r.warnings.length : 0,
  })));
});

export default router;
