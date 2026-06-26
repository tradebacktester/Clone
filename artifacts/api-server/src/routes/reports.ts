import { Router } from "express";
import { generateReport, listReports, getReport } from "../lib/report-engine.js";

const router = Router();

router.get("/reports", async (req, res) => {
  const type = req.query.type as "daily" | "weekly" | "monthly" | undefined;
  const limit = Math.min(parseInt(String(req.query.limit ?? "20")), 100);
  const reports = await listReports(type, limit);
  res.json(
    reports.map(r => ({
      id: r.id,
      type: r.type,
      periodStart: r.periodStart.toISOString(),
      periodEnd: r.periodEnd.toISOString(),
      summary: (r.content as Record<string, unknown>)?.summary ?? null,
      generatedAt: r.generatedAt.toISOString(),
    })),
  );
});

router.post("/reports/generate", async (req, res) => {
  const { type } = req.body as { type?: string };
  if (!type || !["daily", "weekly", "monthly"].includes(type)) {
    res.status(400).json({ error: "type must be daily, weekly, or monthly" });
    return;
  }
  const report = await generateReport(type as "daily" | "weekly" | "monthly");
  res.json({
    id: report.id,
    type: report.type,
    periodStart: report.periodStart.toISOString(),
    periodEnd: report.periodEnd.toISOString(),
    summary: (report.content as Record<string, unknown>)?.summary ?? null,
    generatedAt: report.generatedAt.toISOString(),
  });
});

router.get("/reports/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const report = await getReport(id);
  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  res.json({
    id: report.id,
    type: report.type,
    periodStart: report.periodStart.toISOString(),
    periodEnd: report.periodEnd.toISOString(),
    content: report.content,
    generatedAt: report.generatedAt.toISOString(),
  });
});

export default router;
