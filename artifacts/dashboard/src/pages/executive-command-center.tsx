import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Brain, Zap, Shield, BarChart3, Activity, Clock, Eye,
  CheckCircle, XCircle, AlertTriangle, RefreshCw, TrendingUp,
  TrendingDown, Target, Layers, Scale, Info, ChevronRight,
  Database, Star, GitBranch,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, AreaChart, Area, BarChart, Bar,
} from "recharts";

const API = "/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function n(v: unknown, fallback = 0): number {
  const num = Number(v);
  return isFinite(num) ? num : fallback;
}

function decisionColor(d: string): string {
  switch (d) {
    case "trade":          return "text-emerald-400";
    case "wait":           return "text-sky-400";
    case "observe":        return "text-blue-400";
    case "reduce_risk":    return "text-yellow-400";
    case "pause_trading":  return "text-orange-400";
    case "emergency_halt": return "text-red-500";
    default:               return "text-gray-400";
  }
}

function decisionBg(d: string): string {
  switch (d) {
    case "trade":          return "bg-emerald-400/10 border-emerald-400/30";
    case "wait":           return "bg-sky-400/10 border-sky-400/30";
    case "observe":        return "bg-blue-400/10 border-blue-400/30";
    case "reduce_risk":    return "bg-yellow-400/10 border-yellow-400/30";
    case "pause_trading":  return "bg-orange-400/10 border-orange-400/30";
    case "emergency_halt": return "bg-red-500/15 border-red-500/40";
    default:               return "bg-gray-400/10 border-gray-400/30";
  }
}

function decisionBarColor(d: string): string {
  switch (d) {
    case "trade":          return "#34d399";
    case "wait":           return "#38bdf8";
    case "observe":        return "#60a5fa";
    case "reduce_risk":    return "#facc15";
    case "pause_trading":  return "#fb923c";
    case "emergency_halt": return "#ef4444";
    default:               return "#6b7280";
  }
}

function scoreColor(s: number): string {
  if (s >= 80) return "#34d399";
  if (s >= 65) return "#38bdf8";
  if (s >= 45) return "#facc15";
  if (s >= 30) return "#fb923c";
  return "#ef4444";
}

function positionColor(p: string): string {
  if (p === "supporting") return "text-emerald-400";
  if (p === "opposing")   return "text-red-400";
  return "text-gray-400";
}

function positionBadge(p: string): string {
  if (p === "supporting") return "bg-emerald-400/10 text-emerald-400 border border-emerald-400/30";
  if (p === "opposing")   return "bg-red-400/10 text-red-400 border border-red-400/30";
  return "bg-gray-400/10 text-gray-400 border border-gray-400/20";
}

function severityColor(s: string): string {
  if (s === "critical") return "text-red-500";
  if (s === "high")     return "text-orange-400";
  if (s === "moderate") return "text-yellow-400";
  return "text-blue-400";
}

function severityBg(s: string): string {
  if (s === "critical") return "bg-red-500/10 border-red-500/30";
  if (s === "high")     return "bg-orange-400/10 border-orange-400/30";
  if (s === "moderate") return "bg-yellow-400/10 border-yellow-400/30";
  return "bg-blue-400/10 border-blue-400/20";
}

// ─── Score Gauge ──────────────────────────────────────────────────────────────

function ScoreGauge({ score, label, size = 72 }: { score: number; label: string; size?: number }) {
  const r = (size / 2) - 6;
  const circ = 2 * Math.PI * r;
  const arc = circ * 0.75;
  const fill = arc * (score / 100);
  const color = scoreColor(score);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-[135deg]">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1f2937" strokeWidth="6"
          strokeDasharray={`${arc} ${circ}`} strokeLinecap="round" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }} />
      </svg>
      <span className="text-xs text-gray-400 -mt-2">{label}</span>
      <span className="text-sm font-bold" style={{ color }}>{score.toFixed(0)}</span>
    </div>
  );
}

// ─── Mini Bar ─────────────────────────────────────────────────────────────────

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-700/50 rounded-full h-1.5">
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs text-gray-400 w-8 text-right">{value.toFixed(0)}</span>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "decision",    label: "Decision",    icon: Brain },
  { id: "systems",     label: "Systems",     icon: Layers },
  { id: "conflicts",   label: "Conflicts",   icon: Scale },
  { id: "evidence",    label: "Evidence",    icon: Eye },
  { id: "timeline",    label: "Timeline",    icon: Clock },
  { id: "report",      label: "Report",      icon: BarChart3 },
  { id: "status",      label: "Status",      icon: Activity },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ExecutiveCommandCenter() {
  const [tab, setTab] = useState("decision");
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey(k => k + 1);

  const { data: status, isLoading: loadingStatus } = useQuery({
    queryKey: ["eai-status", refreshKey],
    queryFn: () => fetch(`${API}/executive-ai/status`).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const { data: decision, isLoading: loadingDecision, refetch: refetchDecision } = useQuery({
    queryKey: ["eai-decision", refreshKey],
    queryFn: () => fetch(`${API}/executive-ai/decision`).then(r => r.json()),
    refetchInterval: 60_000,
  });

  const { data: history } = useQuery({
    queryKey: ["eai-history", refreshKey],
    queryFn: () => fetch(`${API}/executive-ai/history?limit=60`).then(r => r.json()),
  });

  const { data: conflicts } = useQuery({
    queryKey: ["eai-conflicts", refreshKey],
    queryFn: () => fetch(`${API}/executive-ai/conflicts?limit=30`).then(r => r.json()),
  });

  const { data: evidence } = useQuery({
    queryKey: ["eai-evidence", refreshKey],
    queryFn: () => fetch(`${API}/executive-ai/evidence`).then(r => r.json()),
  });

  const { data: report } = useQuery({
    queryKey: ["eai-report", refreshKey],
    queryFn: () => fetch(`${API}/executive-ai/report`).then(r => r.json()),
  });

  const dec  = (decision?.data ?? {}) as any;
  const breakdown = dec.scoreBreakdown ?? {};
  const contributions: any[] = dec.contributingSystems ?? [];
  const decConflicts: any[] = dec.conflicts ?? [];
  const expl = dec.explainability ?? {};
  const conf = dec.executiveConfidence ?? {};

  const st  = status ?? {};
  const sb  = st.scoreBreakdown ?? {};

  const timelineRows: any[] = history?.decisions ?? [];
  const conflictRows: any[] = conflicts?.conflicts ?? [];
  const reportData  = report?.data ?? {};

  // Radar chart data
  const radarData = [
    { subject: "Strategy",  value: n(breakdown.strategy?.raw ?? sb.strategy) },
    { subject: "Market",    value: n(breakdown.market?.raw   ?? sb.market) },
    { subject: "Risk",      value: n(breakdown.risk?.raw     ?? sb.risk) },
    { subject: "Memory",    value: n(breakdown.memory?.raw   ?? sb.memory) },
    { subject: "Learning",  value: n(breakdown.learning?.raw ?? sb.learning) },
    { subject: "Identity",  value: n(breakdown.identity?.raw ?? sb.identity) },
    { subject: "Research",  value: n(breakdown.research?.raw ?? sb.research) },
  ];

  // Timeline chart
  const trendData = timelineRows.slice().reverse().map((r: any, i: number) => ({
    i,
    score:    n(r.executiveScore),
    conflict: r.hasConflicts ? 1 : 0,
    decision: r.decision,
  }));

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/30">
            <Brain className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-100">Executive AI Command Center</h1>
            <p className="text-xs text-gray-500">Phase 7 · Unified Decision Orchestrator · Advisory Only</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Live Status badge */}
          {st.decision && (
            <div className={`px-3 py-1 rounded-full border text-xs font-medium ${decisionBg(st.decision)}`}>
              <span className={decisionColor(st.decision)}>
                {st.decisionLabel ?? st.decision}
              </span>
            </div>
          )}
          <button onClick={refresh}
            className="p-1.5 rounded-lg bg-gray-800 border border-gray-700 hover:border-violet-500/50 transition-colors">
            <RefreshCw className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Status Banner */}
      {st.executiveSummary && (
        <div className="mb-4 px-4 py-2.5 bg-violet-500/5 border border-violet-500/20 rounded-lg">
          <p className="text-xs text-violet-300 font-mono">{st.executiveSummary}</p>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Executive Score",  value: n(st.executiveScore),  suffix: "/100", color: scoreColor(n(st.executiveScore)), icon: Star },
          { label: "Confidence",       value: n(st.confidence),      suffix: "%",    color: scoreColor(n(st.confidence)),     icon: CheckCircle },
          { label: "Conflicts",        value: n(st.conflictCount),   suffix: "",     color: n(st.conflictCount) > 0 ? "#fb923c" : "#34d399", icon: Scale },
          { label: "Total Decisions",  value: n(reportData.totalDecisions), suffix: "", color: "#a78bfa", icon: Database },
        ].map(kpi => (
          <div key={kpi.label} className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-800">
              <kpi.icon className="w-4 h-4" style={{ color: kpi.color }} />
            </div>
            <div>
              <p className="text-xs text-gray-500">{kpi.label}</p>
              <p className="text-lg font-bold" style={{ color: kpi.color }}>
                {kpi.value.toFixed(0)}{kpi.suffix}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              tab === t.id
                ? "bg-violet-500/15 text-violet-300 border border-violet-500/40"
                : "text-gray-500 hover:text-gray-300 border border-transparent"
            }`}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Decision Tab ─────────────────────────────────────────────────── */}
      {tab === "decision" && (
        <div className="space-y-4">
          {/* Main Decision Card */}
          <div className={`p-5 rounded-xl border-2 ${decisionBg(dec.decision ?? st.decision ?? "observe")}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Executive Decision</p>
                <h2 className={`text-2xl font-bold ${decisionColor(dec.decision ?? st.decision ?? "observe")}`}>
                  {dec.decisionLabel ?? st.decisionLabel ?? "Observe Only"}
                </h2>
                <p className="text-sm text-gray-400 mt-1">{dec.decisionDescription ?? ""}</p>
              </div>
              <div className="text-right">
                <p className="text-4xl font-mono font-bold" style={{ color: scoreColor(n(dec.executiveScore ?? st.executiveScore)) }}>
                  {n(dec.executiveScore ?? st.executiveScore).toFixed(1)}
                </p>
                <p className="text-xs text-gray-500">Executive Score</p>
              </div>
            </div>
            {expl.whyThisDecision && (
              <p className="text-sm text-gray-300 bg-black/20 rounded-lg p-3 border border-white/5">
                {expl.whyThisDecision}
              </p>
            )}
          </div>

          {/* Radar + Confidence */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <Target className="w-4 h-4 text-violet-400" /> 7-Dimension Score Radar
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#374151" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Score" dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.25} strokeWidth={2} />
                  <Tooltip formatter={(v: any) => [`${Number(v).toFixed(0)}/100`, "Score"]}
                    contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-sky-400" /> Executive Confidence
              </h3>
              <div className="space-y-3">
                {[
                  { label: "Overall",            value: n(conf.overall) },
                  { label: "Statistical",        value: n(conf.statistical) },
                  { label: "Data Quality",       value: n(conf.dataQuality) },
                  { label: "Historical",         value: n(conf.historicalReliability) },
                  { label: "Market Reliability", value: n(conf.marketReliability) },
                  { label: "System Reliability", value: n(conf.systemReliability) },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                      <span>{item.label}</span>
                    </div>
                    <MiniBar value={item.value} color={scoreColor(item.value)} />
                  </div>
                ))}
                <div className="mt-2 pt-2 border-t border-gray-700/50">
                  <p className="text-xs text-gray-500">Reliability Rating: <span className={`font-medium ${n(conf.overall) >= 75 ? "text-emerald-400" : n(conf.overall) >= 55 ? "text-yellow-400" : "text-orange-400"}`}>{conf.reliabilityRating ?? "–"}</span></p>
                  {conf.confidenceInterval && (
                    <p className="text-xs text-gray-500 mt-0.5">CI: [{n(conf.confidenceInterval?.lower).toFixed(1)}, {n(conf.confidenceInterval?.upper).toFixed(1)}]</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Score Gauges */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" /> Dimension Scores
            </h3>
            <div className="flex flex-wrap justify-around gap-4">
              {radarData.map(d => (
                <ScoreGauge key={d.subject} score={d.value} label={d.subject} size={76} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Systems Tab ──────────────────────────────────────────────────── */}
      {tab === "systems" && (
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
              <Layers className="w-4 h-4 text-violet-400" /> Contributing Systems (ranked by weighted contribution)
            </h3>
            <div className="space-y-3">
              {contributions.map((c: any, i: number) => (
                <div key={c.system} className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/40">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-400">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-200">{c.system}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${positionBadge(c.position)}`}>
                        {c.position}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mb-2">{c.keyFinding}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>Score: <strong className="text-gray-300">{n(c.score).toFixed(0)}</strong></span>
                      <span>Weight: <strong className="text-gray-300">{n(c.weight).toFixed(1)}%</strong></span>
                      <span>Contribution: <strong className="text-violet-300">{n(c.weightedContribution).toFixed(1)}</strong></span>
                    </div>
                    <div className="mt-2">
                      <MiniBar value={n(c.score)} color={scoreColor(n(c.score))} />
                    </div>
                  </div>
                </div>
              ))}
              {contributions.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-6">Trigger a decision to see contributing systems</p>
              )}
            </div>
          </div>

          {/* Agreement Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" /> Systems in Agreement
              </h3>
              <div className="space-y-1.5">
                {(expl.agreedSystems ?? []).map((s: string) => (
                  <div key={s} className="flex items-center gap-2 text-sm text-emerald-300">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    {s}
                  </div>
                ))}
                {(expl.agreedSystems?.length ?? 0) === 0 && <p className="text-xs text-gray-500">No data yet</p>}
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-400" /> Systems in Opposition
              </h3>
              <div className="space-y-1.5">
                {(expl.disagreedSystems ?? []).map((s: string) => (
                  <div key={s} className="flex items-center gap-2 text-sm text-red-300">
                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                    {s}
                  </div>
                ))}
                {(expl.disagreedSystems?.length ?? 0) === 0 && <p className="text-xs text-gray-500">No opposing systems</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Conflicts Tab ────────────────────────────────────────────────── */}
      {tab === "conflicts" && (
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <Scale className="w-4 h-4 text-yellow-400" /> Inter-System Conflicts
              </h3>
              <div className="flex gap-2">
                {Object.entries(conflicts?.summary?.bySeverity ?? {}).map(([sev, cnt]) => (
                  <span key={sev} className={`text-xs px-2 py-0.5 rounded-full border ${severityBg(sev)}`}>
                    <span className={severityColor(sev)}>{sev}: {cnt as number}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {conflictRows.map((c: any) => (
                <div key={c.conflictId} className={`p-3 rounded-lg border ${severityBg(c.severity)}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={`w-4 h-4 ${severityColor(c.severity)}`} />
                      <span className="text-sm font-medium text-gray-200">{c.conflictType?.replace(/_/g, " ")}</span>
                      <span className={`text-xs font-semibold uppercase ${severityColor(c.severity)}`}>{c.severity}</span>
                    </div>
                    <span className="text-xs text-gray-500">Δ {n(c.divergence).toFixed(0)} pts</span>
                  </div>
                  <div className="text-xs text-gray-400 space-y-1">
                    <p>⚔ {c.systemA} ({n(c.scoreA).toFixed(0)}) vs {c.systemB} ({n(c.scoreB).toFixed(0)})</p>
                    <p className="text-emerald-400">Winner: {c.winnerSystem} — {c.resolution}</p>
                    <p className="text-gray-500 mt-1">{c.finalJustification}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <p className="text-xs text-emerald-400 font-medium mb-1">Winning Evidence</p>
                      {(c.winningEvidence ?? []).slice(0, 3).map((e: string, i: number) => (
                        <p key={i} className="text-xs text-gray-400">• {e}</p>
                      ))}
                    </div>
                    <div>
                      <p className="text-xs text-red-400 font-medium mb-1">Rejected Evidence</p>
                      {(c.rejectedEvidence ?? []).slice(0, 3).map((e: string, i: number) => (
                        <p key={i} className="text-xs text-gray-400">• {e}</p>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              {conflictRows.length === 0 && (
                <div className="text-center py-8">
                  <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No conflicts recorded — all systems aligned</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Evidence Tab ─────────────────────────────────────────────────── */}
      {tab === "evidence" && (
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
              <Eye className="w-4 h-4 text-blue-400" /> Explainability Explorer
            </h3>

            {expl.executiveSummary && (
              <div className="mb-4 p-3 bg-violet-500/5 border border-violet-500/20 rounded-lg">
                <p className="text-xs font-mono text-violet-300">{expl.executiveSummary}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-medium text-emerald-400 mb-2 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Supporting Evidence
                </h4>
                <div className="space-y-2">
                  {(expl.topEvidence ?? []).map((e: string, i: number) => (
                    <div key={i} className="flex gap-2 text-xs text-gray-300 bg-gray-800/50 p-2 rounded-lg">
                      <ChevronRight className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{e}</span>
                    </div>
                  ))}
                  {(expl.topEvidence?.length ?? 0) === 0 && <p className="text-xs text-gray-500">Trigger a decision to see evidence</p>}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-medium text-red-400 mb-2 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> Contrary Evidence
                </h4>
                <div className="space-y-2">
                  {(expl.contraEvidence ?? []).map((e: string, i: number) => (
                    <div key={i} className="flex gap-2 text-xs text-gray-300 bg-gray-800/50 p-2 rounded-lg">
                      <ChevronRight className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      <span>{e}</span>
                    </div>
                  ))}
                  {(expl.contraEvidence?.length ?? 0) === 0 && <p className="text-xs text-gray-500">No contrary evidence recorded</p>}
                </div>
              </div>
            </div>

            {/* Historical References */}
            <div className="mt-4">
              <h4 className="text-xs font-medium text-gray-400 mb-2">Historical References &amp; Calibration</h4>
              <div className="space-y-1.5">
                {(expl.historicalReferences ?? []).map((r: string, i: number) => (
                  <p key={i} className="text-xs text-gray-500 flex items-start gap-1.5">
                    <Info className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" /> {r}
                  </p>
                ))}
              </div>
            </div>

            {/* Veto Status */}
            {breakdown.vetoApplied && (
              <div className="mt-4 p-3 bg-orange-400/10 border border-orange-400/30 rounded-lg">
                <p className="text-xs font-semibold text-orange-400 mb-1">⚠ Veto Applied</p>
                <p className="text-xs text-gray-400">{breakdown.vetoReason}</p>
              </div>
            )}
          </div>

          {/* Score Calculation Details */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-gray-400" /> Calculation Breakdown
            </h3>
            <div className="space-y-2">
              {Object.entries(breakdown).filter(([k]) => !["composite", "vetoApplied", "vetoReason"].includes(k)).map(([key, dim]: [string, any]) => (
                <div key={key} className="grid grid-cols-12 items-center gap-2 text-xs">
                  <span className="col-span-3 text-gray-400 capitalize">{key}</span>
                  <div className="col-span-5">
                    <MiniBar value={n(dim?.raw)} color={scoreColor(n(dim?.raw))} />
                  </div>
                  <span className="col-span-2 text-gray-500">×{((n(dim?.weight)) * 100).toFixed(0)}%</span>
                  <span className="col-span-2 text-violet-300 font-mono">=&nbsp;{n(dim?.weighted).toFixed(1)}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-700/50 flex justify-between">
                <span className="text-sm text-gray-300 font-medium">Composite</span>
                <span className="text-sm font-bold" style={{ color: scoreColor(n(breakdown.composite)) }}>
                  {n(breakdown.composite).toFixed(1)}/100
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Timeline Tab ─────────────────────────────────────────────────── */}
      {tab === "timeline" && (
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-violet-400" /> Decision Score Timeline
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData}>
                <CartesianGrid stroke="#1f2937" />
                <XAxis dataKey="i" tick={{ fill: "#4b5563", fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "#4b5563", fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any, name: string) => [Number(v).toFixed(0), name]} />
                <Area type="monotone" dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} strokeWidth={2} name="Score" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Recent Decisions</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-700/50">
                    {["Time", "Pair", "Decision", "Score", "Confidence", "Conflicts", "Regime"].map(h => (
                      <th key={h} className="text-left py-2 px-2 text-gray-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timelineRows.slice(0, 20).map((r: any) => (
                    <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                      <td className="py-1.5 px-2 text-gray-500">{new Date(r.recordedAt).toLocaleTimeString()}</td>
                      <td className="py-1.5 px-2 text-gray-300">{r.pair}</td>
                      <td className={`py-1.5 px-2 ${decisionColor(r.decision)}`}>{r.decision?.replace(/_/g, " ")}</td>
                      <td className="py-1.5 px-2 font-mono" style={{ color: scoreColor(n(r.executiveScore)) }}>{n(r.executiveScore).toFixed(0)}</td>
                      <td className="py-1.5 px-2 text-gray-400">{n(r.confidence).toFixed(0)}%</td>
                      <td className="py-1.5 px-2">{r.hasConflicts ? <AlertTriangle className="w-3.5 h-3.5 text-orange-400" /> : "–"}</td>
                      <td className="py-1.5 px-2 text-gray-500">{r.regime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {timelineRows.length === 0 && <p className="text-sm text-gray-500 text-center py-6">No decisions yet</p>}
            </div>
          </div>
        </div>
      )}

      {/* ─── Report Tab ───────────────────────────────────────────────────── */}
      {tab === "report" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Decisions",   value: n(reportData.totalDecisions) },
              { label: "Avg Score",         value: n(reportData.avgExecutiveScore) },
              { label: "Avg Confidence",    value: n(reportData.avgConfidence) },
              { label: "Conflict Rate",     value: n(reportData.conflictRate) },
            ].map(kpi => (
              <div key={kpi.label} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">{kpi.label}</p>
                <p className="text-2xl font-bold text-violet-300">{kpi.value.toFixed(0)}</p>
              </div>
            ))}
          </div>

          {/* Decision distribution */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Decision Distribution</h3>
            <div className="space-y-2">
              {Object.entries(reportData.decisionDistribution ?? {}).sort(([,a],[,b]) => (b as number) - (a as number)).map(([d, cnt]) => {
                const total = Object.values(reportData.decisionDistribution ?? {}).reduce((s, v) => s + (v as number), 0) || 1;
                const pct = ((cnt as number) / total) * 100;
                return (
                  <div key={d} className="flex items-center gap-2">
                    <span className={`text-xs w-28 ${decisionColor(d)}`}>{d.replace(/_/g, " ")}</span>
                    <div className="flex-1 bg-gray-700/50 rounded-full h-2">
                      <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: decisionBarColor(d) }} />
                    </div>
                    <span className="text-xs text-gray-400 w-12 text-right">{cnt as number} ({pct.toFixed(0)}%)</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent trend chart */}
          {(reportData.recentTrend ?? []).length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Score Trend (20 recent)</h3>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={reportData.recentTrend}>
                  <CartesianGrid stroke="#1f2937" />
                  <XAxis dataKey="time" tick={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: "#4b5563", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }} />
                  <Line type="monotone" dataKey="score" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ─── Status Tab ───────────────────────────────────────────────────── */}
      {tab === "status" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <Brain className="w-4 h-4 text-violet-400" /> Engine Status
              </h3>
              <div className="space-y-2 text-sm">
                {[
                  { label: "Engine Version",   value: st.engineVersion ?? "1.0.0" },
                  { label: "Decision Version", value: st.decisionVersion ?? "1.0.0" },
                  { label: "Advisory Only",    value: "Yes — no autonomous trades" },
                  { label: "Market Regime",    value: st.marketRegime ?? "–" },
                  { label: "Risk State",       value: st.riskState ?? "–" },
                  { label: "Crisis Status",    value: st.crisisStatus ?? "none" },
                ].map(item => (
                  <div key={item.label} className="flex justify-between items-center py-1.5 border-b border-gray-800/50">
                    <span className="text-gray-500">{item.label}</span>
                    <span className="text-gray-300 font-mono text-xs">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" /> Safety Constraints
              </h3>
              <div className="space-y-2">
                {[
                  "Executive AI is strictly advisory — no autonomous execution",
                  "All risk vetoes are enforced before any trade decision",
                  "Emergency halt triggered by ERB crisis or survival mode",
                  "All decisions are permanently logged and auditable",
                  "Subsystem weights are transparent and versioned",
                  "Conflict resolution always favours capital preservation",
                ].map((rule, i) => (
                  <div key={i} className="flex gap-2 text-xs text-gray-400">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{rule}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Live Score Breakdown</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(sb).map(([k, v]) => (
                <div key={k} className="text-center">
                  <p className="text-xs text-gray-500 capitalize mb-1">{k}</p>
                  <p className="text-xl font-bold" style={{ color: scoreColor(n(v)) }}>{n(v).toFixed(0)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
