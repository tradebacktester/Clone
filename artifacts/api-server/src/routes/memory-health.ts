/**
 * Memory Health Routes
 *
 * API endpoints for the Memory Validation, Health Monitor, Replay,
 * Backup, Performance, and Certification subsystems.
 */

import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";
import {
  runFullValidation,
  runQuickValidation,
  getValidationHistory,
  getLatestValidationRun,
} from "../lib/memory-validation-engine.js";
import {
  searchReplayableExperiences,
  startReplaySession,
  getReplaySession,
  getCurrentStep,
  stepForward,
  stepBackward,
  seekToStep,
  pauseSession,
  resumeSession,
  setPlaybackSpeed,
  endReplaySession,
  getActiveSessions,
} from "../lib/memory-replay-engine.js";
import {
  runFullBackup,
  runIncrementalBackup,
  verifyBackup,
  testRestore,
  getBackupHistory,
  getLatestBackupJob,
} from "../lib/memory-backup.js";
import {
  runProductionCertification,
  getCertificationHistory,
  getLatestCertification,
} from "../lib/memory-certification.js";
import {
  runPerformanceBenchmarks,
  getHealthHistory,
  getLatestHealthSnapshot,
} from "../lib/memory-performance.js";

const router: IRouter = Router();

// ─── Memory Validation ───────────────────────────────────────────────────────

// POST /api/memory/validation/run — trigger a full validation run
router.post("/memory/validation/run", async (req, res): Promise<void> => {
  try {
    const { triggeredBy = "user", runType = "full" } = req.body ?? {};
    const report = await runFullValidation({ triggeredBy, runType });
    res.json(report);
  } catch (err) {
    logger.error({ err }, "POST /memory/validation/run error");
    res.status(500).json({ error: "Validation run failed" });
  }
});

// GET /api/memory/validation/quick — fast subset validation
router.get("/memory/validation/quick", async (_req, res): Promise<void> => {
  try {
    const result = await runQuickValidation();
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GET /memory/validation/quick error");
    res.status(500).json({ error: "Quick validation failed" });
  }
});

// GET /api/memory/validation/latest — most recent completed run
router.get("/memory/validation/latest", async (_req, res): Promise<void> => {
  try {
    const run = await getLatestValidationRun();
    res.json(run ?? { message: "No validation runs yet" });
  } catch (err) {
    logger.error({ err }, "GET /memory/validation/latest error");
    res.status(500).json({ error: "Failed to fetch latest validation" });
  }
});

// GET /api/memory/validation/history — list all validation runs
router.get("/memory/validation/history", async (req, res): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "20")), 100);
    const history = await getValidationHistory(limit);
    res.json({ history, count: history.length });
  } catch (err) {
    logger.error({ err }, "GET /memory/validation/history error");
    res.status(500).json({ error: "Failed to fetch validation history" });
  }
});

// ─── Memory Replay ───────────────────────────────────────────────────────────

// GET /api/memory/replay/search — find replayable experiences
router.get("/memory/replay/search", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string>;
    const filter = {
      pair:            q.pair,
      session:         q.session,
      outcome:         q.outcome,
      strategyVersion: q.strategyVersion,
      dateFrom:        q.dateFrom ? new Date(q.dateFrom) : undefined,
      dateTo:          q.dateTo   ? new Date(q.dateTo)   : undefined,
      hasScreenshots:  q.hasScreenshots === "true" ? true : q.hasScreenshots === "false" ? false : undefined,
      hasLessons:      q.hasLessons     === "true" ? true : q.hasLessons     === "false" ? false : undefined,
      limit:           q.limit  ? parseInt(q.limit)  : 50,
      offset:          q.offset ? parseInt(q.offset) : 0,
    };
    const result = await searchReplayableExperiences(filter);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GET /memory/replay/search error");
    res.status(500).json({ error: "Replay search failed" });
  }
});

// POST /api/memory/replay/start — start a replay session for a trade
router.post("/memory/replay/start", async (req, res): Promise<void> => {
  try {
    const { tradeId, playbackSpeed = 1 } = req.body ?? {};
    if (!tradeId || isNaN(parseInt(String(tradeId)))) {
      res.status(400).json({ error: "tradeId is required" });
      return;
    }
    const session = await startReplaySession(parseInt(String(tradeId)), { playbackSpeed });
    // Return session without all steps (just metadata + first step)
    const { steps: _steps, ...sessionMeta } = session;
    res.json({ ...sessionMeta, currentStepData: session.steps[0] ?? null });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "POST /memory/replay/start error");
    res.status(msg.includes("No experience") || msg.includes("No replayable") ? 404 : 500).json({ error: msg });
  }
});

// GET /api/memory/replay/session/:id — get session state
router.get("/memory/replay/session/:id", (req, res): void => {
  try {
    const session = getReplaySession(req.params.id!);
    if (!session) { res.status(404).json({ error: "Session not found or expired" }); return; }
    const { steps: _steps, ...meta } = session;
    res.json({ ...meta, currentStepData: session.steps[session.currentStep] ?? null });
  } catch (err) {
    logger.error({ err }, "GET /memory/replay/session/:id error");
    res.status(500).json({ error: "Failed to get session" });
  }
});

// GET /api/memory/replay/session/:id/step — get current step data
router.get("/memory/replay/session/:id/step", (req, res): void => {
  try {
    const step = getCurrentStep(req.params.id!);
    if (step === null) { res.status(404).json({ error: "Session not found" }); return; }
    res.json(step);
  } catch (err) {
    logger.error({ err }, "GET /memory/replay/session/:id/step error");
    res.status(500).json({ error: "Failed to get step" });
  }
});

// GET /api/memory/replay/session/:id/steps — get all steps (for the full timeline view)
router.get("/memory/replay/session/:id/steps", (req, res): void => {
  try {
    const session = getReplaySession(req.params.id!);
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    // Return steps without image data
    const steps = session.steps.map(s => ({ ...s, data: { ...s.data, imageData: undefined, thumbnailData: undefined } }));
    res.json({ steps, totalSteps: session.totalSteps, currentStep: session.currentStep });
  } catch (err) {
    logger.error({ err }, "GET /memory/replay/session/:id/steps error");
    res.status(500).json({ error: "Failed to get steps" });
  }
});

// POST /api/memory/replay/session/:id/forward — advance one step
router.post("/memory/replay/session/:id/forward", (req, res): void => {
  try {
    const result = stepForward(req.params.id!);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(msg.includes("not found") ? 404 : 400).json({ error: msg });
  }
});

// POST /api/memory/replay/session/:id/backward — go back one step
router.post("/memory/replay/session/:id/backward", (req, res): void => {
  try {
    const result = stepBackward(req.params.id!);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(msg.includes("not found") ? 404 : 400).json({ error: msg });
  }
});

// POST /api/memory/replay/session/:id/seek — jump to specific step
router.post("/memory/replay/session/:id/seek", (req, res): void => {
  try {
    const { stepIndex } = req.body ?? {};
    if (stepIndex === undefined || isNaN(parseInt(String(stepIndex)))) {
      res.status(400).json({ error: "stepIndex is required" }); return;
    }
    const result = seekToStep(req.params.id!, parseInt(String(stepIndex)));
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(404).json({ error: msg });
  }
});

// POST /api/memory/replay/session/:id/pause
router.post("/memory/replay/session/:id/pause", (req, res): void => {
  try {
    pauseSession(req.params.id!);
    res.json({ ok: true, status: "paused" });
  } catch (err: unknown) {
    res.status(404).json({ error: String(err) });
  }
});

// POST /api/memory/replay/session/:id/resume
router.post("/memory/replay/session/:id/resume", (req, res): void => {
  try {
    resumeSession(req.params.id!);
    res.json({ ok: true, status: "active" });
  } catch (err: unknown) {
    res.status(400).json({ error: String(err) });
  }
});

// PATCH /api/memory/replay/session/:id/speed
router.patch("/memory/replay/session/:id/speed", (req, res): void => {
  try {
    const { speed } = req.body ?? {};
    if (!speed || isNaN(parseFloat(String(speed)))) {
      res.status(400).json({ error: "speed (0.25–10) is required" }); return;
    }
    setPlaybackSpeed(req.params.id!, parseFloat(String(speed)));
    res.json({ ok: true, speed: parseFloat(String(speed)) });
  } catch (err: unknown) {
    res.status(404).json({ error: String(err) });
  }
});

// DELETE /api/memory/replay/session/:id
router.delete("/memory/replay/session/:id", (req, res): void => {
  endReplaySession(req.params.id!);
  res.json({ ok: true });
});

// GET /api/memory/replay/sessions — list active sessions (monitoring)
router.get("/memory/replay/sessions", (_req, res): void => {
  res.json({ sessions: getActiveSessions() });
});

// ─── Memory Backup ───────────────────────────────────────────────────────────

// POST /api/memory/backup/full — run a full backup
router.post("/memory/backup/full", async (req, res): Promise<void> => {
  try {
    const { includeImages = false } = req.body ?? {};
    const result = await runFullBackup({ triggeredBy: "user", includeImages });
    // Return result without the full payload (too large for API response)
    const { payload: _p, ...meta } = result;
    res.json({ ...meta, hasPayload: !!result.payload });
  } catch (err) {
    logger.error({ err }, "POST /memory/backup/full error");
    res.status(500).json({ error: "Full backup failed" });
  }
});

// POST /api/memory/backup/full/download — run backup and return full payload
router.post("/memory/backup/full/download", async (req, res): Promise<void> => {
  try {
    const result = await runFullBackup({ triggeredBy: "user", includeImages: false });
    if (result.status !== "completed" || !result.payload) {
      res.status(500).json({ error: result.error ?? "Backup failed" }); return;
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="memory-backup-${new Date().toISOString().slice(0,10)}.json"`);
    res.json(result.payload);
  } catch (err) {
    logger.error({ err }, "POST /memory/backup/full/download error");
    res.status(500).json({ error: "Backup download failed" });
  }
});

// POST /api/memory/backup/incremental — run an incremental backup
router.post("/memory/backup/incremental", async (req, res): Promise<void> => {
  try {
    const { sinceDate } = req.body ?? {};
    const since = sinceDate ? new Date(sinceDate) : new Date(Date.now() - 24 * 3600 * 1000);
    if (isNaN(since.getTime())) {
      res.status(400).json({ error: "Invalid sinceDate" }); return;
    }
    const result = await runIncrementalBackup(since, { triggeredBy: "user" });
    const { payload: _p, ...meta } = result;
    res.json({ ...meta, sinceDate: since.toISOString() });
  } catch (err) {
    logger.error({ err }, "POST /memory/backup/incremental error");
    res.status(500).json({ error: "Incremental backup failed" });
  }
});

// POST /api/memory/backup/verify — verify a backup payload
router.post("/memory/backup/verify", async (req, res): Promise<void> => {
  try {
    const payload = req.body;
    if (!payload?.manifest) {
      res.status(400).json({ error: "Request body must be a backup payload with a manifest" }); return;
    }
    const result = await verifyBackup(payload);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "POST /memory/backup/verify error");
    res.status(500).json({ error: "Backup verification failed" });
  }
});

// POST /api/memory/backup/test-restore — dry-run restore test
router.post("/memory/backup/test-restore", async (req, res): Promise<void> => {
  try {
    const payload = req.body;
    if (!payload?.manifest) {
      res.status(400).json({ error: "Request body must be a backup payload with a manifest" }); return;
    }
    const result = await testRestore(payload);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "POST /memory/backup/test-restore error");
    res.status(500).json({ error: "Restore test failed" });
  }
});

// GET /api/memory/backup/history
router.get("/memory/backup/history", async (req, res): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "20")), 100);
    const history = await getBackupHistory(limit);
    res.json({ history, count: history.length });
  } catch (err) {
    logger.error({ err }, "GET /memory/backup/history error");
    res.status(500).json({ error: "Failed to get backup history" });
  }
});

// GET /api/memory/backup/latest
router.get("/memory/backup/latest", async (_req, res): Promise<void> => {
  try {
    const job = await getLatestBackupJob();
    res.json(job ?? { message: "No backups yet" });
  } catch (err) {
    logger.error({ err }, "GET /memory/backup/latest error");
    res.status(500).json({ error: "Failed to get latest backup" });
  }
});

// ─── Performance ─────────────────────────────────────────────────────────────

// POST /api/memory/performance/benchmark — run full benchmark suite
router.post("/memory/performance/benchmark", async (_req, res): Promise<void> => {
  try {
    const report = await runPerformanceBenchmarks();
    res.json(report);
  } catch (err) {
    logger.error({ err }, "POST /memory/performance/benchmark error");
    res.status(500).json({ error: "Benchmark failed" });
  }
});

// GET /api/memory/performance/history — health snapshot history for charts
router.get("/memory/performance/history", async (req, res): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "48")), 200);
    const history = await getHealthHistory(limit);
    res.json({ history, count: history.length });
  } catch (err) {
    logger.error({ err }, "GET /memory/performance/history error");
    res.status(500).json({ error: "Failed to get performance history" });
  }
});

// GET /api/memory/performance/latest — most recent health snapshot
router.get("/memory/performance/latest", async (_req, res): Promise<void> => {
  try {
    const snap = await getLatestHealthSnapshot();
    res.json(snap ?? { message: "No snapshots yet — run a benchmark" });
  } catch (err) {
    logger.error({ err }, "GET /memory/performance/latest error");
    res.status(500).json({ error: "Failed to get latest snapshot" });
  }
});

// ─── Production Certification ─────────────────────────────────────────────────

// POST /api/memory/certification/run — run full production certification
router.post("/memory/certification/run", async (_req, res): Promise<void> => {
  try {
    const report = await runProductionCertification();
    res.json(report);
  } catch (err) {
    logger.error({ err }, "POST /memory/certification/run error");
    res.status(500).json({ error: "Certification failed" });
  }
});

// GET /api/memory/certification/latest — most recent certification
router.get("/memory/certification/latest", async (_req, res): Promise<void> => {
  try {
    const cert = await getLatestCertification();
    res.json(cert ?? { message: "No certifications yet — run certification first" });
  } catch (err) {
    logger.error({ err }, "GET /memory/certification/latest error");
    res.status(500).json({ error: "Failed to get latest certification" });
  }
});

// GET /api/memory/certification/history
router.get("/memory/certification/history", async (req, res): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "10")), 50);
    const history = await getCertificationHistory(limit);
    res.json({ history, count: history.length });
  } catch (err) {
    logger.error({ err }, "GET /memory/certification/history error");
    res.status(500).json({ error: "Failed to get certification history" });
  }
});

// ─── Unified Dashboard Summary ────────────────────────────────────────────────

// GET /api/memory/health-dashboard — all key metrics in one call
router.get("/memory/health-dashboard", async (_req, res): Promise<void> => {
  try {
    const [validation, certification, performance, backupJob] = await Promise.all([
      getLatestValidationRun().catch(() => null),
      getLatestCertification().catch(() => null),
      getLatestHealthSnapshot().catch(() => null),
      getLatestBackupJob().catch(() => null),
    ]);

    res.json({
      validation:   validation ?? null,
      certification: certification ?? null,
      performance:  performance ?? null,
      latestBackup: backupJob ?? null,
      summary: {
        validationScore:     (validation as { health_score?: number } | null)?.health_score ?? null,
        certificationScore:  (certification as { production_ready_score?: number } | null)?.production_ready_score ?? null,
        certificationLevel:  (certification as { certification_level?: string } | null)?.certification_level ?? "none",
        performanceScore:    (performance as { health_score?: number } | null)?.health_score ?? null,
        lastBackup:          (backupJob as { started_at?: string } | null)?.started_at ?? null,
        overallStatus:       deriveStatus(validation, certification, performance),
      },
    });
  } catch (err) {
    logger.error({ err }, "GET /memory/health-dashboard error");
    res.status(500).json({ error: "Dashboard summary failed" });
  }
});

function deriveStatus(
  validation: unknown,
  certification: unknown,
  performance: unknown,
): "healthy" | "degraded" | "critical" | "unchecked" {
  const v = (validation as { overall_health?: string } | null)?.overall_health;
  const p = (performance as { overall_health?: string } | null)?.overall_health;

  if (!v && !p) return "unchecked";
  if (v === "critical" || p === "critical") return "critical";
  if (v === "degraded" || p === "degraded") return "degraded";
  return "healthy";
}

export default router;
