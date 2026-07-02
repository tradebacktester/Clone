// ─── Executive Planning & Mission Control Routes ───────────────────────────────
// Phase 7.4 · GET /executive/mission|goals|plans|progress|priorities|report

import { Router }   from "express";
import { db }       from "@workspace/db";
import {
  epMissionsTable,
  epGoalsTable,
  epPlansTable,
  epTimelineTable,
  esbReportsTable,
  erbReportsTable,
} from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import {
  runExecutiveMission,
  EP_ENGINE_VERSION,
} from "@workspace/market-analysis";

export const executivePlanningRouter = Router();

function n(v: unknown, fallback = 0): number {
  const num = Number(v);
  return isFinite(num) ? num : fallback;
}

async function fetchSubsystemData() {
  const [latestEsb, latestErb] = await Promise.all([
    db.select().from(esbReportsTable).orderBy(desc(esbReportsTable.evaluatedAt)).limit(1),
    db.select().from(erbReportsTable).orderBy(desc(erbReportsTable.evaluatedAt)).limit(1),
  ]);
  const strategyResult = latestEsb[0]?.fullPayload
    ? (typeof latestEsb[0].fullPayload === "string"
        ? JSON.parse(latestEsb[0].fullPayload)
        : latestEsb[0].fullPayload)
    : null;
  const erbResult = latestErb[0]?.fullPayload
    ? (typeof latestErb[0].fullPayload === "string"
        ? JSON.parse(latestErb[0].fullPayload)
        : latestErb[0].fullPayload)
    : null;
  return { strategyResult, erbResult };
}

// ─── GET /executive/mission ────────────────────────────────────────────────────
// Run full mission cycle + persist

executivePlanningRouter.get("/executive/mission", async (req, res) => {
  try {
    const pair      = String(req.query.pair      ?? "EURUSD");
    const timeframe = String(req.query.timeframe ?? "15m");

    const { strategyResult, erbResult } = await fetchSubsystemData();

    const mission = await runExecutiveMission({
      pair,
      timeframe,
      strategyResult,
      erbResult,
    });

    // Persist mission
    await db.insert(epMissionsTable).values({
      missionId:       mission.missionId,
      evaluatedAt:     new Date(mission.evaluatedAt),
      pair:            mission.pair,
      timeframe:       mission.timeframe,
      healthScore:     mission.missionHealth.overallScore,
      healthStatus:    mission.missionHealth.status,
      level1Adherence: mission.missionHealth.level1Adherence,
      goalAchievement: mission.missionHealth.goalAchievement,
      conflictCount:   mission.conflicts.length,
      confidence:      mission.confidence,
      totalGoals:      mission.goals.length,
      activeGoals:     mission.activeGoals.length,
      completedGoals:  mission.goals.filter(g => g.status === "completed").length,
      immediateAction: mission.immediatePlan.title,
      executiveScore:  mission.intelligenceSnapshot.executiveScore,
      riskScore:       mission.intelligenceSnapshot.riskScore,
      drawdownPct:     mission.intelligenceSnapshot.drawdownPct,
      crisisStatus:    mission.intelligenceSnapshot.crisisStatus,
      durationMs:      mission.durationMs,
      engineVersion:   mission.engineVersion,
      fullPayload:     mission as unknown as Record<string, unknown>,
      isAdvisoryOnly:  true,
    }).onConflictDoNothing();

    // Persist goals (top 15)
    for (const g of mission.goals.slice(0, 15)) {
      await db.insert(epGoalsTable).values({
        missionId:  mission.missionId,
        goalId:     g.goalId,
        recordedAt: new Date(mission.evaluatedAt),
        level:      g.level,
        levelName:  g.levelName,
        category:   g.category,
        title:      g.title,
        priority:   g.priority,
        importance: g.importance,
        urgency:    g.urgency,
        progress:   g.progress,
        status:     g.status,
        confidence: g.confidence,
        metric:     g.metric,
        target:     g.target,
        current:    g.current,
      }).onConflictDoNothing();
    }

    // Persist plans
    for (const p of mission.plans) {
      await db.insert(epPlansTable).values({
        missionId:    mission.missionId,
        planId:       p.planId,
        recordedAt:   new Date(mission.evaluatedAt),
        horizon:      p.horizon,
        horizonLabel: p.horizonLabel,
        title:        p.title,
        summary:      p.summary,
        confidence:   p.confidence,
        actionCount:  p.actions.length,
        fullPayload:  p as unknown as Record<string, unknown>,
      }).onConflictDoNothing();
    }

    // Timeline
    await db.insert(epTimelineTable).values({
      missionId:       mission.missionId,
      recordedAt:      new Date(mission.evaluatedAt),
      pair:            mission.pair,
      healthScore:     mission.missionHealth.overallScore,
      healthStatus:    mission.missionHealth.status,
      confidence:      mission.confidence,
      activeGoals:     mission.activeGoals.length,
      conflictCount:   mission.conflicts.length,
      immediateAction: mission.immediatePlan.title,
      engineVersion:   mission.engineVersion,
    }).onConflictDoNothing();

    res.json({ success: true, data: mission });
  } catch (err: any) {
    res.status(500).json({ error: "Mission cycle failed", detail: err?.message });
  }
});

// ─── GET /executive/goals ──────────────────────────────────────────────────────
// List goal history + latest active goals

executivePlanningRouter.get("/executive/goals", async (req, res) => {
  try {
    const level = req.query.level ? Number(req.query.level) : null;

    const latestMission = await db
      .select()
      .from(epMissionsTable)
      .orderBy(desc(epMissionsTable.evaluatedAt))
      .limit(1);

    const payload = latestMission[0]?.fullPayload as any;
    const latestGoals = payload?.goals ?? [];
    const filtered = level ? latestGoals.filter((g: any) => g.level === level) : latestGoals;

    // Historical goal stats per category
    const categoryStats = await db
      .select({
        category:   epGoalsTable.category,
        avgProgress: sql<number>`avg(${epGoalsTable.progress})`,
        avgPriority: sql<number>`avg(${epGoalsTable.priority})`,
        count:       sql<number>`count(*)`,
      })
      .from(epGoalsTable)
      .groupBy(epGoalsTable.category)
      .orderBy(sql`avg(${epGoalsTable.priority}) desc`);

    res.json({
      success: true,
      data: {
        latestGoals:    filtered,
        categoryStats,
        totalGoals:     latestGoals.length,
        activeGoals:    latestGoals.filter((g: any) => g.status === "active").length,
        completedGoals: latestGoals.filter((g: any) => g.status === "completed").length,
        missionId:      latestMission[0]?.missionId ?? null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch goals", detail: err?.message });
  }
});

// ─── GET /executive/plans ──────────────────────────────────────────────────────
// Latest 4-horizon plans

executivePlanningRouter.get("/executive/plans", async (req, res) => {
  try {
    const latestMission = await db
      .select()
      .from(epMissionsTable)
      .orderBy(desc(epMissionsTable.evaluatedAt))
      .limit(1);

    const payload = latestMission[0]?.fullPayload as any;
    const plans   = payload?.plans ?? [];

    // Historical plan confidence by horizon
    const planStats = await db
      .select({
        horizon:    epPlansTable.horizon,
        avgConf:    sql<number>`avg(${epPlansTable.confidence})`,
        avgActions: sql<number>`avg(${epPlansTable.actionCount})`,
        count:      sql<number>`count(*)`,
      })
      .from(epPlansTable)
      .groupBy(epPlansTable.horizon)
      .orderBy(sql`avg(${epPlansTable.confidence}) desc`);

    res.json({
      success: true,
      data: {
        latestPlans:    plans,
        planStats,
        missionId:      latestMission[0]?.missionId ?? null,
        immediateTitle: latestMission[0]?.immediateAction ?? null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch plans", detail: err?.message });
  }
});

// ─── GET /executive/progress ───────────────────────────────────────────────────
// Goal progress reports

executivePlanningRouter.get("/executive/progress", async (req, res) => {
  try {
    const latestMission = await db
      .select()
      .from(epMissionsTable)
      .orderBy(desc(epMissionsTable.evaluatedAt))
      .limit(1);

    const payload = latestMission[0]?.fullPayload as any;
    const reports = payload?.progressReports ?? [];
    const health  = payload?.missionHealth   ?? null;

    // Progress trend from timeline
    const timeline = await db
      .select({
        recordedAt:   epTimelineTable.recordedAt,
        healthScore:  epTimelineTable.healthScore,
        activeGoals:  epTimelineTable.activeGoals,
      })
      .from(epTimelineTable)
      .orderBy(desc(epTimelineTable.recordedAt))
      .limit(30);

    res.json({
      success: true,
      data: {
        progressReports: reports,
        missionHealth:   health,
        healthTrend:     timeline.reverse(),
        missionId:       latestMission[0]?.missionId ?? null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch progress", detail: err?.message });
  }
});

// ─── GET /executive/priorities ────────────────────────────────────────────────
// Goal priority rankings + conflict list

executivePlanningRouter.get("/executive/priorities", async (req, res) => {
  try {
    const latestMission = await db
      .select()
      .from(epMissionsTable)
      .orderBy(desc(epMissionsTable.evaluatedAt))
      .limit(1);

    const payload   = latestMission[0]?.fullPayload as any;
    const rankings  = payload?.priorityRankings ?? [];
    const conflicts = payload?.conflicts        ?? [];

    // Historical priority distribution
    const priorityDist = await db
      .select({
        level:       epGoalsTable.level,
        avgPriority: sql<number>`avg(${epGoalsTable.priority})`,
        count:       sql<number>`count(*)`,
      })
      .from(epGoalsTable)
      .groupBy(epGoalsTable.level)
      .orderBy(epGoalsTable.level);

    res.json({
      success: true,
      data: {
        priorityRankings: rankings,
        conflicts,
        conflictCount:    conflicts.length,
        priorityDist,
        missionId:        latestMission[0]?.missionId ?? null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch priorities", detail: err?.message });
  }
});

// ─── GET /executive/report ────────────────────────────────────────────────────
// Aggregated mission report

executivePlanningRouter.get("/executive/report", async (req, res) => {
  try {
    const [
      totalRows,
      healthDist,
      avgMetrics,
      recentTimeline,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(epMissionsTable),
      db.select({
        status: epMissionsTable.healthStatus,
        count:  sql<number>`count(*)`,
      }).from(epMissionsTable)
        .groupBy(epMissionsTable.healthStatus)
        .orderBy(sql`count(*) desc`),
      db.select({
        avgHealth:       sql<number>`avg(${epMissionsTable.healthScore})`,
        avgConf:         sql<number>`avg(${epMissionsTable.confidence})`,
        avgL1Adherence:  sql<number>`avg(${epMissionsTable.level1Adherence})`,
        avgGoalAchieve:  sql<number>`avg(${epMissionsTable.goalAchievement})`,
        avgConflicts:    sql<number>`avg(${epMissionsTable.conflictCount})`,
      }).from(epMissionsTable),
      db.select()
        .from(epTimelineTable)
        .orderBy(desc(epTimelineTable.recordedAt))
        .limit(20),
    ]);

    const total = n(totalRows[0]?.count);
    const avg   = avgMetrics[0] ?? {};

    res.json({
      success: true,
      data: {
        totalMissions:      total,
        avgHealthScore:     n(avg.avgHealth),
        avgConfidence:      n(avg.avgConf),
        avgLevel1Adherence: n(avg.avgL1Adherence),
        avgGoalAchievement: n(avg.avgGoalAchieve),
        avgConflicts:       n(avg.avgConflicts),
        healthDistribution: healthDist,
        recentTimeline:     recentTimeline.reverse().map(t => ({
          time:         t.recordedAt,
          health:       t.healthScore,
          status:       t.healthStatus,
          activeGoals:  t.activeGoals,
          conflicts:    t.conflictCount,
        })),
        engineVersion: EP_ENGINE_VERSION,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to generate report", detail: err?.message });
  }
});
