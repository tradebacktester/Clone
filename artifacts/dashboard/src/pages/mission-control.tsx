import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

// ─── API helpers ──────────────────────────────────────────────────────────────

const BASE = "/api";
const fetcher = (url: string) => fetch(url).then(r => r.json());

function useMission() {
  return useQuery({
    queryKey: ["executive-mission"],
    queryFn: () => fetcher(`${BASE}/executive/mission`).then(d => d.data),
    refetchInterval: 60_000,
  });
}
function useGoals(level?: number) {
  return useQuery({
    queryKey: ["executive-goals", level],
    queryFn: () => fetcher(`${BASE}/executive/goals${level ? `?level=${level}` : ""}`).then(d => d.data),
    refetchInterval: 60_000,
  });
}
function usePlans() {
  return useQuery({
    queryKey: ["executive-plans"],
    queryFn: () => fetcher(`${BASE}/executive/plans`).then(d => d.data),
    refetchInterval: 60_000,
  });
}
function useProgress() {
  return useQuery({
    queryKey: ["executive-progress"],
    queryFn: () => fetcher(`${BASE}/executive/progress`).then(d => d.data),
    refetchInterval: 60_000,
  });
}
function usePriorities() {
  return useQuery({
    queryKey: ["executive-priorities"],
    queryFn: () => fetcher(`${BASE}/executive/priorities`).then(d => d.data),
    refetchInterval: 60_000,
  });
}
function useReport() {
  return useQuery({
    queryKey: ["executive-report"],
    queryFn: () => fetcher(`${BASE}/executive/report`).then(d => d.data),
    refetchInterval: 90_000,
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function pct(v: number | undefined) { return `${(v ?? 0).toFixed(1)}%`; }
function num(v: number | undefined, d = 1) { return (v ?? 0).toFixed(d); }
function clamp(v: number) { return Math.min(100, Math.max(0, v)); }

function HealthBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    optimal:  "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    healthy:  "bg-green-500/20 text-green-300 border-green-500/30",
    degraded: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    critical: "bg-red-500/20 text-red-300 border-red-500/30",
    violated: "bg-red-700/30 text-red-200 border-red-700/40",
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${map[status] ?? "bg-slate-700 text-slate-300 border-slate-600"}`}>
      {(status ?? "unknown").replace(/_/g, " ").toUpperCase()}
    </span>
  );
}

function LevelBadge({ level }: { level: number }) {
  const map: Record<number, string> = {
    1: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    2: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    3: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    4: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  };
  const labels: Record<number, string> = {
    1: "L1 — Permanent",
    2: "L2 — Strategic",
    3: "L3 — Operational",
    4: "L4 — Immediate",
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-mono rounded border ${map[level] ?? "bg-slate-700 text-slate-300 border-slate-600"}`}>
      {labels[level] ?? `L${level}`}
    </span>
  );
}

function ProgressBar({ value, color = "bg-emerald-500" }: { value: number; color?: string }) {
  return (
    <div className="w-full bg-slate-700 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${clamp(value)}%` }} />
    </div>
  );
}

function ScoreRing({ score, label, size = 80 }: { score: number; label: string; size?: number }) {
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - clamp(score) / 100);
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : score >= 40 ? "#f97316" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#334155" strokeWidth="6"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}/>
        <text x={size/2} y={size/2+5} textAnchor="middle" fill={color} fontSize="14" fontWeight="bold">{score.toFixed(0)}</text>
      </svg>
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  );
}

function Card({ title, children, className = "" }: { title?: string; children: any; className?: string }) {
  return (
    <div className={`bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 ${className}`}>
      {title && <h3 className="text-sm font-semibold text-slate-300 mb-3">{title}</h3>}
      {children}
    </div>
  );
}

function Spinner() {
  return <div className="flex items-center justify-center py-16 text-slate-500 text-sm">Loading...</div>;
}

// ─── Tab: Current Mission ─────────────────────────────────────────────────────

function TabCurrentMission() {
  const { data, isLoading } = useMission();
  if (isLoading || !data) return <Spinner />;

  const health = data.missionHealth ?? {};
  const snap   = data.intelligenceSnapshot ?? {};

  return (
    <div className="space-y-4">
      {/* Health rings */}
      <Card title="Mission Health">
        <div className="flex flex-wrap gap-6 justify-center mb-4">
          <ScoreRing score={health.overallScore ?? 0}       label="Overall" />
          <ScoreRing score={health.level1Adherence ?? 0}    label="L1 Adherence" />
          <ScoreRing score={health.goalAchievement ?? 0}    label="Goal Achievement" />
          <ScoreRing score={health.planConsistency ?? 0}    label="Plan Consistency" />
          <ScoreRing score={health.conflictResolution ?? 0} label="Conflict Res." />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-sm">Status:</span>
          <HealthBadge status={health.status ?? "unknown"} />
          <span className="text-slate-400 text-sm ml-4">Confidence:</span>
          <span className="text-white font-mono font-bold">{data.confidence ?? 0}/100</span>
        </div>
        <div className="mt-3 space-y-1">
          {(health.breakdown ?? []).map((b: string) => (
            <div className="text-xs text-slate-400 font-mono">• {b}</div>
          ))}
        </div>
      </Card>

      {/* Intelligence Snapshot */}
      <Card title="Intelligence Snapshot">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Executive Score", value: num(snap.executiveScore, 0), unit: "/100" },
            { label: "Risk Score",      value: num(snap.riskScore, 0),      unit: "/100" },
            { label: "Drawdown",        value: pct(snap.drawdownPct),       unit: "" },
            { label: "Win Rate",        value: pct(snap.winRate),           unit: "" },
            { label: "Profit Factor",   value: num(snap.profitFactor, 2),   unit: "x" },
            { label: "Open Positions",  value: String(snap.openPositions ?? 0), unit: "" },
            { label: "Crisis",          value: String(snap.crisisStatus ?? "none"), unit: "" },
            { label: "Survival Mode",   value: snap.survivalMode ? "ACTIVE" : "OFF", unit: "" },
          ].map(({ label, value, unit }) => (
            <div className="bg-slate-900/50 rounded-lg p-3 text-center">
              <div className="text-xs text-slate-400 mb-1">{label}</div>
              <div className="text-white font-mono font-bold">{value}{unit}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Immediate Action */}
      <Card title="Immediate Action">
        <div className="text-emerald-300 font-semibold mb-2">{data.immediatePlan?.title ?? "—"}</div>
        <div className="text-slate-400 text-sm mb-3">{data.immediatePlan?.summary ?? ""}</div>
        <div className="space-y-2">
          {(data.immediatePlan?.actions ?? []).map((a: any) => (
            <div className="flex items-start gap-2">
              <span className="text-emerald-400 text-xs mt-0.5">▶</span>
              <div>
                <div className="text-sm text-white">{a.description}</div>
                <div className="text-xs text-slate-500">{a.rationale}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Supporting Evidence */}
      <Card title="Supporting Evidence">
        <div className="space-y-1">
          {(data.supportingEvidence ?? []).map((e: string) => (
            <div className="text-xs text-slate-300 font-mono bg-slate-900/40 px-2 py-1 rounded">• {e}</div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Tab: Active Goals ────────────────────────────────────────────────────────

function TabActiveGoals() {
  const { data, isLoading } = useGoals();
  if (isLoading || !data) return <Spinner />;

  const goals = (data.latestGoals ?? []).filter((g: any) => g.status === "active");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Goals",     value: data.totalGoals     ?? 0 },
          { label: "Active Goals",    value: data.activeGoals    ?? 0 },
          { label: "Completed Goals", value: data.completedGoals ?? 0 },
        ].map(({ label, value }) => (
          <Card>
            <div className="text-xs text-slate-400">{label}</div>
            <div className="text-2xl font-bold text-white font-mono mt-1">{value}</div>
          </Card>
        ))}
      </div>

      {goals.map((g: any) => (
        <Card key={g.goalId}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <LevelBadge level={g.level} />
              <span className="text-white font-semibold ml-2">{g.title}</span>
            </div>
            <span className="text-slate-400 text-xs font-mono whitespace-nowrap">P: {num(g.priority, 0)}</span>
          </div>
          <div className="text-sm text-slate-400 mb-2">{g.description}</div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs text-slate-500">Progress: {num(g.progress, 0)}%</span>
            <span className="text-xs text-slate-500">Target: {g.target}{g.unit}</span>
            <span className="text-xs text-slate-500">Current: {num(g.current, 1)}{g.unit}</span>
          </div>
          <ProgressBar value={g.progress} color={g.progress >= 80 ? "bg-emerald-500" : g.progress >= 50 ? "bg-amber-500" : "bg-red-500"} />
          <div className="mt-2 text-xs text-slate-500 italic">{g.whyThisRank}</div>
        </Card>
      ))}
    </div>
  );
}

// ─── Tab: Goal Rankings ───────────────────────────────────────────────────────

function TabGoalRankings() {
  const { data, isLoading } = usePriorities();
  if (isLoading || !data) return <Spinner />;

  const rankings = data.priorityRankings ?? [];

  return (
    <div className="space-y-3">
      <Card title="Priority Distribution by Level">
        <div className="space-y-2">
          {(data.priorityDist ?? []).map((d: any) => (
            <div className="flex items-center gap-3">
              <LevelBadge level={d.level} />
              <div className="flex-1">
                <ProgressBar value={d.avgPriority} color="bg-blue-500" />
              </div>
              <span className="text-xs text-slate-400 font-mono w-12 text-right">{num(d.avgPriority, 0)}/100</span>
              <span className="text-xs text-slate-500 w-16 text-right">({d.count} goals)</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-2">
        {rankings.slice(0, 20).map((g: any, i: number) => (
          <div key={g.goalId} className="bg-slate-800/60 border border-slate-700/40 rounded-lg p-3 flex items-center gap-3">
            <span className="text-slate-500 font-mono text-sm w-6">#{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <LevelBadge level={g.level} />
                <span className="text-sm text-white truncate">{g.title}</span>
              </div>
              <ProgressBar value={g.priority} color={g.level === 1 ? "bg-purple-500" : g.level === 2 ? "bg-blue-500" : g.level === 3 ? "bg-cyan-500" : "bg-amber-500"} />
            </div>
            <div className="text-right min-w-[48px]">
              <div className="text-white font-mono font-bold text-sm">{num(g.priority, 0)}</div>
              <div className="text-slate-500 text-xs">priority</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Executive Plan ──────────────────────────────────────────────────────

function TabExecutivePlan() {
  const { data, isLoading } = usePlans();
  if (isLoading || !data) return <Spinner />;

  const plans = data.latestPlans ?? [];
  const horizonColors: Record<string, string> = {
    immediate:   "border-l-emerald-500",
    short_term:  "border-l-blue-500",
    medium_term: "border-l-amber-500",
    long_term:   "border-l-purple-500",
  };

  return (
    <div className="space-y-4">
      {plans.map((p: any) => (
        <div key={p.planId} className={`bg-slate-800/60 border border-slate-700/40 rounded-xl p-4 border-l-4 ${horizonColors[p.horizon] ?? ""}`}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-xs text-slate-400 font-mono uppercase tracking-wider">{p.horizonLabel} · {p.timeframe}</span>
              <h3 className="text-white font-semibold mt-0.5">{p.title}</h3>
            </div>
            <div className="text-right">
              <div className="text-white font-mono font-bold">{num(p.confidence, 0)}</div>
              <div className="text-slate-500 text-xs">confidence</div>
            </div>
          </div>
          <p className="text-sm text-slate-400 mb-3">{p.summary}</p>
          <div className="space-y-2">
            {(p.actions ?? []).map((a: any) => (
              <div key={a.actionId} className="flex gap-2">
                <span className="text-slate-500 font-mono text-xs mt-0.5 w-5">{a.priority.toFixed(0)}</span>
                <div>
                  <div className="text-sm text-white">{a.description}</div>
                  <div className="text-xs text-slate-500">{a.rationale}</div>
                </div>
              </div>
            ))}
          </div>
          {(p.risks ?? []).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {p.risks.map((r: string) => (
                <span className="text-xs bg-red-500/10 text-red-300 border border-red-500/20 rounded px-2 py-0.5">{r}</span>
              ))}
            </div>
          )}
          {(p.expectedBenefits ?? []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {p.expectedBenefits.map((b: string) => (
                <span className="text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded px-2 py-0.5">{b}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Tab: Progress Dashboard ──────────────────────────────────────────────────

function TabProgressDashboard() {
  const { data, isLoading } = useProgress();
  if (isLoading || !data) return <Spinner />;

  const reports = data.progressReports ?? [];
  const health  = data.missionHealth   ?? {};

  return (
    <div className="space-y-4">
      <Card title="Mission Health Overview">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Overall Score",    value: num(health.overallScore, 1), color: "text-emerald-300" },
            { label: "L1 Adherence",     value: num(health.level1Adherence, 1), color: "text-purple-300" },
            { label: "Goal Achievement", value: num(health.goalAchievement, 1), color: "text-blue-300" },
            { label: "Plan Consistency", value: num(health.planConsistency, 1), color: "text-amber-300" },
          ].map(({ label, value, color }) => (
            <div className="bg-slate-900/50 rounded-lg p-3 text-center">
              <div className="text-xs text-slate-400">{label}</div>
              <div className={`text-2xl font-bold font-mono mt-1 ${color}`}>{value}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-2">
        {reports.map((r: any) => (
          <Card key={r.goalId}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <LevelBadge level={r.level} />
                <span className="text-sm text-white">{r.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded border ${
                  r.trend === "improving" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" :
                  r.trend === "declining" ? "bg-red-500/20 text-red-300 border-red-500/30" :
                  "bg-slate-600 text-slate-300 border-slate-500"
                }`}>{r.trend}</span>
                <HealthBadge status={r.health} />
              </div>
            </div>
            <div className="flex items-center gap-4 mb-2">
              <ProgressBar
                value={r.progress}
                color={r.health === "healthy" ? "bg-emerald-500" : r.health === "at_risk" ? "bg-amber-500" : "bg-red-500"}
              />
              <span className="text-xs text-slate-400 font-mono whitespace-nowrap">{num(r.progress, 0)}%</span>
            </div>
            <div className="text-xs text-slate-500 italic">{r.nextMilestone}</div>
            {r.obstacles.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {r.obstacles.map((o: string) => (
                  <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded px-1.5 py-0.5">{o}</span>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Mission Health ──────────────────────────────────────────────────────

function TabMissionHealth() {
  const { data: rptData, isLoading } = useReport();
  if (isLoading || !rptData) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Total Missions",    value: String(rptData.totalMissions ?? 0) },
          { label: "Avg Health Score",  value: num(rptData.avgHealthScore, 1) },
          { label: "Avg Confidence",    value: num(rptData.avgConfidence, 1) },
          { label: "L1 Adherence Avg",  value: num(rptData.avgLevel1Adherence, 1) },
          { label: "Goal Achievement Avg", value: num(rptData.avgGoalAchievement, 1) },
          { label: "Avg Conflicts",     value: num(rptData.avgConflicts, 1) },
        ].map(({ label, value }) => (
          <Card>
            <div className="text-xs text-slate-400">{label}</div>
            <div className="text-2xl font-bold font-mono text-white mt-1">{value}</div>
          </Card>
        ))}
      </div>

      <Card title="Health Distribution">
        <div className="space-y-2">
          {(rptData.healthDistribution ?? []).map((h: any) => (
            <div className="flex items-center gap-3">
              <HealthBadge status={h.status} />
              <div className="flex-1">
                <ProgressBar value={(h.count / Math.max(1, rptData.totalMissions)) * 100} />
              </div>
              <span className="text-xs text-slate-400 font-mono w-8 text-right">{h.count}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Tab: Priority Timeline ───────────────────────────────────────────────────

function TabPriorityTimeline() {
  const { data, isLoading } = useProgress();
  if (isLoading || !data) return <Spinner />;

  const timeline = data.healthTrend ?? [];

  return (
    <div className="space-y-4">
      <Card title="Mission Health Timeline">
        {timeline.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-8">No timeline data yet — run mission cycles to populate.</div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {[...timeline].reverse().map((t: any, i: number) => (
              <div key={i} className="flex items-center gap-3 p-2 bg-slate-900/40 rounded-lg">
                <div className="w-20 text-xs text-slate-500 font-mono">{new Date(t.time ?? t.recordedAt).toLocaleTimeString()}</div>
                <div className="flex-1">
                  <ProgressBar value={t.health ?? t.healthScore} color={
                    (t.health ?? t.healthScore) >= 80 ? "bg-emerald-500" :
                    (t.health ?? t.healthScore) >= 60 ? "bg-amber-500" : "bg-red-500"
                  } />
                </div>
                <div className="w-12 text-xs font-mono text-white text-right">{num(t.health ?? t.healthScore, 0)}</div>
                <HealthBadge status={t.status ?? t.healthStatus} />
                <div className="text-xs text-slate-500 w-16 text-right">{t.activeGoals ?? 0} goals</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Tab: Goal History ────────────────────────────────────────────────────────

function TabGoalHistory() {
  const { data, isLoading } = useGoals();
  if (isLoading || !data) return <Spinner />;

  return (
    <div className="space-y-4">
      <Card title="Category Performance">
        <div className="space-y-3">
          {(data.categoryStats ?? []).map((s: any) => (
            <div key={s.category}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-mono">{s.category.replace(/_/g, " ")}</span>
                <span className="text-slate-400">{s.count} entries · avg priority {num(s.avgPriority, 0)}</span>
              </div>
              <ProgressBar value={s.avgProgress} color="bg-blue-500" />
              <div className="text-xs text-slate-500 mt-0.5">Avg progress: {num(s.avgProgress, 0)}%</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Tab: Evidence Explorer ───────────────────────────────────────────────────

function TabEvidenceExplorer() {
  const { data, isLoading } = useMission();
  if (isLoading || !data) return <Spinner />;

  const conflicts = data.conflicts ?? [];

  return (
    <div className="space-y-4">
      {/* Permanent Mission */}
      <Card title="Permanent Mission (Level 1) — Immutable Objectives">
        <div className="space-y-3">
          {(data.permanentMission ?? []).map((g: any) => (
            <div key={g.goalId} className="border border-purple-500/20 rounded-lg p-3 bg-purple-500/5">
              <div className="font-semibold text-purple-200 text-sm mb-1">{g.title}</div>
              <div className="text-xs text-slate-400 mb-2">{g.description}</div>
              <div className="flex flex-wrap gap-1">
                {(g.evidence ?? []).map((e: string) => (
                  <span className="text-xs bg-slate-800 text-slate-300 border border-slate-600 rounded px-2 py-0.5">{e}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Conflict Explorer */}
      <Card title={`Goal Conflicts (${conflicts.length})`}>
        {conflicts.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-4">No conflicts detected in current mission cycle.</div>
        ) : (
          <div className="space-y-4">
            {conflicts.map((c: any) => (
              <div key={c.conflictId} className="border border-amber-500/20 rounded-lg p-3 bg-amber-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded px-2 py-0.5">{c.conflictType.replace(/_/g, " ")}</span>
                  <span className="text-xs text-slate-400 font-mono">{c.conflictId}</span>
                </div>
                <div className="text-sm text-slate-300 mb-2">{c.conflictSummary}</div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-2 mb-2">
                  <div className="text-xs text-emerald-400 font-semibold mb-1">Resolution</div>
                  <div className="text-xs text-slate-300">{c.resolution}</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(c.supportingEvidence ?? []).map((e: string) => (
                    <span className="text-xs bg-slate-800 text-slate-300 border border-slate-600 rounded px-2 py-0.5">{e}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Tab: Reports ─────────────────────────────────────────────────────────────

function TabReports() {
  const { data, isLoading } = useReport();
  if (isLoading || !data) return <Spinner />;

  const docs = [
    { title: "Executive Planning Engine Architecture", file: "EXECUTIVE_PLANNING_ENGINE.md", badge: "Architecture" },
    { title: "Goal Management Methodology",            file: "GOAL_MANAGEMENT_REPORT.md",   badge: "Methodology" },
    { title: "Mission Control Framework",              file: "MISSION_CONTROL_REPORT.md",    badge: "Framework" },
    { title: "Phase 7.4 Certification",               file: "PHASE_7_EXECUTIVE_PLANNING_CERTIFICATION.md", badge: "Certification" },
  ];

  return (
    <div className="space-y-4">
      <Card title="Report Summary">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Total Mission Cycles",     value: String(data.totalMissions ?? 0) },
            { label: "Avg Health Score",         value: num(data.avgHealthScore, 1) + "/100" },
            { label: "Avg Confidence",           value: num(data.avgConfidence, 1) + "/100" },
            { label: "Avg L1 Adherence",         value: num(data.avgLevel1Adherence, 1) + "/100" },
            { label: "Avg Goal Achievement",     value: num(data.avgGoalAchievement, 1) + "/100" },
            { label: "Avg Conflicts per Mission", value: num(data.avgConflicts, 1) },
          ].map(({ label, value }) => (
            <div className="bg-slate-900/50 rounded-lg p-3">
              <div className="text-xs text-slate-400">{label}</div>
              <div className="text-white font-mono font-bold mt-1">{value}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Documentation">
        <div className="space-y-2">
          {docs.map(d => (
            <div className="flex items-center justify-between p-3 bg-slate-900/40 rounded-lg border border-slate-700/40">
              <div>
                <div className="text-sm text-white">{d.title}</div>
                <div className="text-xs text-slate-500 font-mono">{d.file}</div>
              </div>
              <span className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded px-2 py-0.5">{d.badge}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Engine Information">
        <div className="space-y-2 font-mono text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Engine Version</span>
            <span className="text-white">{data.engineVersion}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">isAdvisoryOnly</span>
            <span className="text-emerald-400">true</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Mission Hierarchy</span>
            <span className="text-white">4 levels</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Plan Horizons</span>
            <span className="text-white">Immediate / Short / Medium / Long</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "mission",    label: "Current Mission" },
  { id: "goals",      label: "Active Goals" },
  { id: "rankings",   label: "Goal Rankings" },
  { id: "plan",       label: "Executive Plan" },
  { id: "progress",   label: "Progress Dashboard" },
  { id: "health",     label: "Mission Health" },
  { id: "timeline",   label: "Priority Timeline" },
  { id: "history",    label: "Goal History" },
  { id: "evidence",   label: "Evidence Explorer" },
  { id: "reports",    label: "Reports" },
];

export default function MissionControl() {
  const [tab, setTab] = useState("mission");

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Mission Control</h1>
            <p className="text-xs text-slate-400 mt-0.5">Executive Planning, Goal Management & Mission Control Engine — Phase 7.4</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded px-2 py-1 font-mono">ADVISORY ONLY</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 py-2 border-b border-slate-700/30 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap transition-colors ${
              tab === t.id
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {tab === "mission"   && <TabCurrentMission />}
        {tab === "goals"     && <TabActiveGoals />}
        {tab === "rankings"  && <TabGoalRankings />}
        {tab === "plan"      && <TabExecutivePlan />}
        {tab === "progress"  && <TabProgressDashboard />}
        {tab === "health"    && <TabMissionHealth />}
        {tab === "timeline"  && <TabPriorityTimeline />}
        {tab === "history"   && <TabGoalHistory />}
        {tab === "evidence"  && <TabEvidenceExplorer />}
        {tab === "reports"   && <TabReports />}
      </div>
    </div>
  );
}
