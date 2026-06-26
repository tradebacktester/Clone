import { Router } from "express";
import { db, supervisorAlertsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import {
  runAllChecks,
  getSupervisorStatus,
} from "../lib/supervisor-engine.js";

const router = Router();

router.get("/supervisor/status", async (_req, res) => {
  const status = await getSupervisorStatus();
  res.json(status);
});

router.get("/supervisor/alerts", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
  const unacknowledgedOnly = req.query.unacknowledgedOnly === "true";
  const severity = req.query.severity as string | undefined;

  let query = db
    .select()
    .from(supervisorAlertsTable)
    .orderBy(desc(supervisorAlertsTable.createdAt))
    .limit(limit);

  const rows = await query;

  let filtered = rows;
  if (unacknowledgedOnly) filtered = filtered.filter(r => !r.acknowledged);
  if (severity) filtered = filtered.filter(r => r.severity === severity);

  res.json(
    filtered.map(r => ({
      id: r.id,
      alertType: r.alertType,
      severity: r.severity,
      message: r.message,
      pair: r.pair,
      metric: r.metric,
      value: r.value != null ? parseFloat(r.value) : null,
      threshold: r.threshold != null ? parseFloat(r.threshold) : null,
      acknowledged: r.acknowledged,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

router.post("/supervisor/alerts/:id/acknowledge", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const existing = await db
    .select()
    .from(supervisorAlertsTable)
    .where(eq(supervisorAlertsTable.id, id))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }

  const [updated] = await db
    .update(supervisorAlertsTable)
    .set({ acknowledged: true })
    .where(eq(supervisorAlertsTable.id, id))
    .returning();

  res.json({
    id: updated.id,
    alertType: updated.alertType,
    severity: updated.severity,
    message: updated.message,
    pair: updated.pair,
    metric: updated.metric,
    value: updated.value != null ? parseFloat(updated.value) : null,
    threshold: updated.threshold != null ? parseFloat(updated.threshold) : null,
    acknowledged: updated.acknowledged,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.post("/supervisor/checks/run", async (_req, res) => {
  const status = await runAllChecks();
  res.json(status);
});

export default router;
