import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Brain, Shield, TrendingUp, History, Award, FlaskConical,
  ChevronDown, ChevronUp, CheckCircle, AlertTriangle, XCircle,
  BarChart3, Target, Activity, Zap, Clock, RefreshCw, Scale
} from "lucide-react";

// ─── API helpers ──────────────────────────────────────────────────────────────

const API = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface EsbReport {
  reportId: string;
  pair: string;
  session: string;
  regime: string;
  executiveScore: number | string;
  recommendation: string;
  recommendationLabel: string;
  recommendationRationale: string;
  strategyStrength: number | string;
  overallQualityScore: number | string;
  rulePassRate: number | string;
  ruleQualityScore: number | string;
  histWinRate: number | string;
  histSampleSize: number;
  marketHealth: number | string;
  opportunityScore: number | string;
  identitySimilarity: number | string;
  driftStatus: string;
  activeHypotheses: number;
  pendingDeployments: number;
  scoreWeights: Record<string, number>;
  scoreBreakdown: Record<string, { raw: number; weighted: number; weight: number }>;
  supportingRules: string[];
  supportingHistoricalEvidence: string[];
  supportingMarketEvidence: string[];
  supportingStats: string[];
  evaluatedAt: string;
  isAdvisoryOnly: boolean;
}

interface SummaryData {
  totalReports: number;
  avgExecutiveScore: number;
  avgStrategyStrength: number;
  avgRuleQuality: number;
  avgQualityScore: number;
  avgMarketHealth: number;
  recommendationDistribution: Record<string, number>;
  topPairs: { pair: string; avgScore: number; count: number }[];
  recentTrend: { evaluatedAt: string; executiveScore: number; recommendation: string; pair: string }[];
}

interface TimelineEntry {
  id: number;
  reportId: string;
  pair: string;
  session: string;
  recommendation: string;
  executiveScore: number | string;
  strategyStrength: number | string;
  qualityScore: number | string;
  evaluatedAt: string;
  tradeOutcome?: string;
}

interface CertReport {
  certId: string;
  overallScore: number;
  certificationStatus: string;
  grade: string;
  subsystemReadiness: Record<string, number>;
  criticalIssues: string[];
  warnings: string[];
  recommendations: string[];
  technicalDebt: string[];
  phase6Readiness: number;
  phase6ReadinessLabel: string;
  certifiedAt: string;
}

interface VersionData {
  executiveBrain: string;
  strategyReasoning: string;
  strategyQuality: string;
  traderIdentity: string;
  researchLab: string;
  marketIntelligence: string;
  phase: string;
  nextPhase: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function n(v: number | string | undefined | null, decimals = 1): string {
  const num = Number(v ?? 0);
  return isFinite(num) ? num.toFixed(decimals) : "0.0";
}

function recColor(rec: string): string {
  switch (rec) {
    case "elite":       return "text-yellow-400";
    case "very_strong": return "text-green-400";
    case "strong":      return "text-emerald-400";
    case "acceptable":  return "text-blue-400";
    case "borderline":  return "text-orange-400";
    case "weak":        return "text-red-400";
    case "reject":      return "text-red-600";
    default:            return "text-slate-400";
  }
}

function recBg(rec: string): string {
  switch (rec) {
    case "elite":       return "bg-yellow-400/15 border-yellow-400/40";
    case "very_strong": return "bg-green-400/15 border-green-400/40";
    case "strong":      return "bg-emerald-400/15 border-emerald-400/40";
    case "acceptable":  return "bg-blue-400/15 border-blue-400/40";
    case "borderline":  return "bg-orange-400/15 border-orange-400/40";
    case "weak":        return "bg-red-400/15 border-red-400/40";
    case "reject":      return "bg-red-700/15 border-red-700/40";
    default:            return "bg-slate-700/40 border-slate-600";
  }
}

function recLabel(rec: string): string {
  const map: Record<string, string> = {
    elite: "Elite Trade", very_strong: "Very Strong", strong: "Strong",
    acceptable: "Acceptable", borderline: "Borderline", weak: "Weak", reject: "Reject",
  };
  return map[rec] ?? rec;
}

function scoreBar(score: number, max = 100, color = "bg-blue-500") {
  const pct = Math.min(100, Math.max(0, (score / max) * 100));
  return (
    <div className="w-full bg-slate-700 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function certStatusColor(status: string): string {
  switch (status) {
    case "certified":   return "text-green-400";
    case "conditional": return "text-yellow-400";
    default:            return "text-red-400";
  }
}

function certGradeColor(grade: string): string {
  if (grade.startsWith("A")) return "text-green-400";
  if (grade.startsWith("B")) return "text-blue-400";
  if (grade.startsWith("C")) return "text-yellow-400";
  return "text-red-400";
}

// ─── Components ───────────────────────────────────────────────────────────────

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const color = score >= 80 ? "text-green-400" : score >= 60 ? "text-blue-400" : score >= 40 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`text-3xl font-bold tabular-nums ${color}`}>{n(score, 1)}</span>
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  );
}

function EvidenceSection({ title, items, icon: Icon, color }: {
  title: string; items: string[]; icon: React.ElementType; color: string;
}) {
  const [open, setOpen] = useState(false);
  if (!items?.length) return null;
  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-3 hover:bg-slate-700/40 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className={`flex items-center gap-2 ${color}`}>
          <Icon className="h-4 w-4" />
          <span className="text-sm font-medium">{title}</span>
          <span className="text-xs text-slate-500">({items.length})</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
      </button>
      {open && (
        <div className="p-3 pt-0 space-y-1 border-t border-slate-700">
          {items.map((item, i) => (
            <p key={i} className="text-xs text-slate-300 pl-2 border-l border-slate-600">{item}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function SubsystemRow({ name, score }: { name: string; score: number }) {
  const color = score >= 80 ? "text-green-400" : score >= 60 ? "text-yellow-400" : "text-red-400";
  const bg    = score >= 80 ? "bg-green-500"   : score >= 60 ? "bg-yellow-500"   : "bg-red-500";
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-400 w-48 shrink-0">{name.replace(/([A-Z])/g, " $1").trim()}</span>
      <div className="flex-1">
        {scoreBar(score, 100, bg)}
      </div>
      <span className={`text-xs font-mono w-8 text-right ${color}`}>{score}</span>
    </div>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  { id: "executive",    label: "Executive Score",      icon: Brain },
  { id: "timeline",     label: "Strategy Timeline",    icon: History },
  { id: "quality",      label: "Quality & Identity",   icon: Award },
  { id: "research",     label: "Research Status",      icon: FlaskConical },
  { id: "certification",label: "Certification",         icon: Shield },
  { id: "versions",     label: "Version Explorer",     icon: BarChart3 },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StrategyCommandCenter() {
  const [activeTab, setActiveTab] = useState("executive");
  const [showRationale, setShowRationale] = useState(false);
  const qc = useQueryClient();

  const { data: latestData, isLoading: latestLoading } = useQuery({
    queryKey: ["esb-latest"],
    queryFn: () => apiFetch("/strategy/executive?limit=1"),
    refetchInterval: 30_000,
  });

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ["esb-summary"],
    queryFn: () => apiFetch("/strategy/summary"),
    refetchInterval: 60_000,
  });

  const { data: timelineData, isLoading: timelineLoading } = useQuery({
    queryKey: ["esb-timeline"],
    queryFn: () => apiFetch("/strategy/timeline?limit=50"),
    refetchInterval: 60_000,
  });

  const { data: certData, isLoading: certLoading } = useQuery({
    queryKey: ["esb-cert"],
    queryFn: () => apiFetch("/strategy/certification"),
  });

  const { data: versionsData } = useQuery({
    queryKey: ["esb-versions"],
    queryFn: () => apiFetch("/strategy/versions"),
  });

  const { data: readinessData } = useQuery({
    queryKey: ["esb-readiness"],
    queryFn: () => apiFetch("/strategy/readiness"),
  });

  const generateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/strategy/executive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["esb-latest"] });
      qc.invalidateQueries({ queryKey: ["esb-summary"] });
      qc.invalidateQueries({ queryKey: ["esb-timeline"] });
    },
  });

  const latest: EsbReport | undefined = latestData?.data?.[0];
  const summary: SummaryData | undefined = summaryData?.data;
  const timeline: TimelineEntry[] = timelineData?.data ?? [];
  const cert: CertReport | undefined = certData?.data;
  const versions: VersionData | undefined = versionsData?.data;
  const readiness = readinessData?.data;

  const score = Number(latest?.executiveScore ?? 0);
  const scoreColor = score >= 80 ? "text-green-400" : score >= 60 ? "text-blue-400" : score >= 40 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Brain className="h-7 w-7 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Strategy Command Center</h1>
              <p className="text-sm text-slate-400">Executive Strategy Brain — Phase 5 Unified Intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded-full text-xs text-yellow-400">
              Advisory Only
            </div>
            <button
              onClick={() => generateMutation.mutate({ pair: "EURUSD", session: "london", regime: "trending", trend: "bullish", volatility: "medium" })}
              disabled={generateMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${generateMutation.isPending ? "animate-spin" : ""}`} />
              Generate Report
            </button>
          </div>
        </div>

        {/* Summary KPI Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { label: "Avg Exec Score",    value: n(summary?.avgExecutiveScore),     icon: Brain,      color: "text-blue-400" },
            { label: "Avg Strength",      value: n(summary?.avgStrategyStrength),   icon: TrendingUp, color: "text-green-400" },
            { label: "Avg Rule Quality",  value: n(summary?.avgRuleQuality),        icon: Scale,      color: "text-purple-400" },
            { label: "Avg Quality Score", value: n(summary?.avgQualityScore),       icon: Award,      color: "text-yellow-400" },
            { label: "Avg Market Health", value: n(summary?.avgMarketHealth),       icon: Activity,   color: "text-cyan-400" },
            { label: "Total Reports",     value: String(summary?.totalReports ?? 0), icon: BarChart3,  color: "text-slate-300" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-xs text-slate-400 truncate">{label}</span>
              </div>
              <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-800/40 p-1 rounded-xl border border-slate-700 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/60"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Executive Score ─────────────────────────────────── */}
        {activeTab === "executive" && (
          <div className="space-y-4">
            {latestLoading ? (
              <div className="text-center py-12 text-slate-500">Loading executive intelligence...</div>
            ) : !latest ? (
              <div className="text-center py-12">
                <Brain className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400 mb-4">No reports yet. Generate your first executive report.</p>
                <button
                  onClick={() => generateMutation.mutate({ pair: "EURUSD", session: "london", regime: "trending", trend: "bullish", volatility: "medium" })}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium"
                >
                  Generate Report
                </button>
              </div>
            ) : (
              <>
                {/* Main score card */}
                <div className={`border rounded-2xl p-6 ${recBg(latest.recommendation)}`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <div className={`text-6xl font-black tabular-nums ${scoreColor}`}>{n(score, 1)}</div>
                        <div className="text-sm text-slate-400 mt-1">Executive Score</div>
                      </div>
                      <div>
                        <div className={`text-2xl font-bold ${recColor(latest.recommendation)}`}>
                          {recLabel(latest.recommendation)}
                        </div>
                        <div className="text-sm text-slate-400 mt-1">{latest.pair} · {latest.session} · {latest.regime}</div>
                        <div className="text-xs text-slate-500 mt-1">{new Date(latest.evaluatedAt).toLocaleString()}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <ScoreGauge score={Number(latest.strategyStrength ?? 0)} label="Strategy Strength" />
                      <ScoreGauge score={Number(latest.overallQualityScore ?? 0)} label="Quality Score" />
                      <ScoreGauge score={Number(latest.marketHealth ?? 0)} label="Market Health" />
                    </div>
                  </div>
                </div>

                {/* Score Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                      <Scale className="h-4 w-4 text-blue-400" />
                      Score Breakdown (Transparent Weights)
                    </h3>
                    <div className="space-y-3">
                      {latest.scoreBreakdown && Object.entries(latest.scoreBreakdown).filter(([k]) => k !== "total").map(([key, val]) => {
                        const v = val as { raw: number; weighted: number; weight: number };
                        return (
                          <div key={key} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-400 capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                              <span className="text-slate-300 tabular-nums">
                                {n(v.raw, 1)} × {((v.weight ?? 0) * 100).toFixed(0)}% = <span className="text-blue-400">{n(v.weighted, 1)}</span>
                              </span>
                            </div>
                            {scoreBar(v.raw, 100, v.raw >= 70 ? "bg-green-500" : v.raw >= 50 ? "bg-blue-500" : "bg-red-500")}
                          </div>
                        );
                      })}
                      <div className="pt-2 border-t border-slate-600 flex justify-between text-sm font-semibold">
                        <span className="text-slate-300">Total</span>
                        <span className={scoreColor}>{n(score, 1)} / 100</span>
                      </div>
                    </div>
                  </div>

                  {/* Component Intelligence */}
                  <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                      <Target className="h-4 w-4 text-purple-400" />
                      Component Intelligence
                    </h3>
                    <div className="space-y-3">
                      {[
                        { label: "Rule Pass Rate",      value: Number(latest.rulePassRate ?? 0),       suffix: "%" },
                        { label: "Win Rate (hist.)",    value: Number(latest.histWinRate ?? 0) * 100,  suffix: "%" },
                        { label: "Opportunity Score",   value: Number(latest.opportunityScore ?? 0),   suffix: "/100" },
                        { label: "Identity Similarity", value: Number(latest.identitySimilarity ?? 0), suffix: "%" },
                      ].map(({ label, value, suffix }) => (
                        <div key={label} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-400">{label}</span>
                            <span className="text-slate-300 tabular-nums">{n(value, 1)}{suffix}</span>
                          </div>
                          {scoreBar(value, 100, value >= 60 ? "bg-blue-500" : "bg-slate-500")}
                        </div>
                      ))}
                      <div className="pt-2 border-t border-slate-600 space-y-1 text-xs text-slate-400">
                        <div className="flex justify-between"><span>Historical Sample Size</span><span className="text-slate-300">{latest.histSampleSize ?? 0} trades</span></div>
                        <div className="flex justify-between"><span>Drift Status</span><span className={latest.driftStatus === "stable" ? "text-green-400" : "text-yellow-400"}>{latest.driftStatus ?? "—"}</span></div>
                        <div className="flex justify-between"><span>Active Research Hypotheses</span><span className="text-slate-300">{latest.activeHypotheses ?? 0}</span></div>
                        <div className="flex justify-between"><span>Pending Deployments</span><span className="text-slate-300">{latest.pendingDeployments ?? 0}</span></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recommendation Rationale */}
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
                  <button
                    className="w-full flex items-center justify-between"
                    onClick={() => setShowRationale(r => !r)}
                  >
                    <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-400" />
                      Recommendation Rationale
                    </h3>
                    {showRationale ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                  </button>
                  {showRationale && (
                    <pre className="mt-3 text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                      {latest.recommendationRationale}
                    </pre>
                  )}
                </div>

                {/* Evidence Explorer */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    Evidence Explorer
                  </h3>
                  <EvidenceSection title="Supporting Rules"             items={latest.supportingRules ?? []}            icon={Scale}       color="text-purple-400" />
                  <EvidenceSection title="Historical Evidence"          items={latest.supportingHistoricalEvidence ?? []} icon={History}    color="text-blue-400" />
                  <EvidenceSection title="Market Evidence"              items={latest.supportingMarketEvidence ?? []}    icon={Activity}    color="text-cyan-400" />
                  <EvidenceSection title="Statistical Evidence"         items={latest.supportingStats ?? []}             icon={BarChart3}   color="text-yellow-400" />
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Tab: Strategy Timeline ───────────────────────────────── */}
        {activeTab === "timeline" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <History className="h-5 w-5 text-blue-400" />
                Strategy Intelligence Timeline
              </h2>
              <span className="text-xs text-slate-500">{timeline.length} entries</span>
            </div>

            {/* Summary trend */}
            {summary?.recentTrend && summary.recentTrend.length > 0 && (
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">Recent Score Trend</h3>
                <div className="flex items-end gap-1 h-16">
                  {summary.recentTrend.map((entry, i) => {
                    const h = Math.max(4, (Number(entry.executiveScore) / 100) * 64);
                    return (
                      <div key={i} title={`${entry.pair} ${n(entry.executiveScore, 1)} — ${recLabel(entry.recommendation)}`}
                        className="flex-1 rounded-sm cursor-pointer"
                        style={{ height: h, backgroundColor: entry.executiveScore >= 80 ? "#22c55e" : entry.executiveScore >= 60 ? "#3b82f6" : entry.executiveScore >= 40 ? "#f59e0b" : "#ef4444" }}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between text-xs text-slate-600 mt-1">
                  <span>Older</span><span>Recent</span>
                </div>
              </div>
            )}

            {timelineLoading ? (
              <div className="text-center py-8 text-slate-500">Loading timeline...</div>
            ) : (
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-800/80">
                      <th className="text-left p-3 text-xs font-semibold text-slate-400">Time</th>
                      <th className="text-left p-3 text-xs font-semibold text-slate-400">Pair</th>
                      <th className="text-left p-3 text-xs font-semibold text-slate-400">Session</th>
                      <th className="text-right p-3 text-xs font-semibold text-slate-400">Score</th>
                      <th className="text-left p-3 text-xs font-semibold text-slate-400">Recommendation</th>
                      <th className="text-right p-3 text-xs font-semibold text-slate-400">Quality</th>
                      <th className="text-left p-3 text-xs font-semibold text-slate-400">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeline.map(row => (
                      <tr key={row.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                        <td className="p-3 text-xs text-slate-500">{new Date(row.evaluatedAt).toLocaleString()}</td>
                        <td className="p-3 font-mono text-xs text-slate-300">{row.pair}</td>
                        <td className="p-3 text-xs text-slate-400 capitalize">{row.session}</td>
                        <td className={`p-3 text-right font-bold tabular-nums ${Number(row.executiveScore) >= 70 ? "text-green-400" : Number(row.executiveScore) >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                          {n(row.executiveScore, 1)}
                        </td>
                        <td className={`p-3 text-xs font-medium ${recColor(row.recommendation)}`}>{recLabel(row.recommendation)}</td>
                        <td className="p-3 text-right text-xs text-slate-400">{n(row.qualityScore, 1)}</td>
                        <td className="p-3 text-xs">
                          {row.tradeOutcome
                            ? <span className={row.tradeOutcome === "win" ? "text-green-400" : "text-red-400"}>{row.tradeOutcome}</span>
                            : <span className="text-slate-600">—</span>
                          }
                        </td>
                      </tr>
                    ))}
                    {timeline.length === 0 && (
                      <tr><td colSpan={7} className="p-8 text-center text-slate-500">No timeline entries yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Quality & Identity ──────────────────────────────── */}
        {activeTab === "quality" && latest && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Award className="h-4 w-4 text-yellow-400" />
                Strategy Quality
              </h3>
              <div className="space-y-3">
                {[
                  { label: "Overall Quality", value: Number(latest.overallQualityScore ?? 0) },
                  { label: "Rule Quality",     value: Number(latest.ruleQualityScore ?? 0) },
                  { label: "Strategy Strength",value: Number(latest.strategyStrength ?? 0) },
                  { label: "Market Health",    value: Number(latest.marketHealth ?? 0) },
                ].map(({ label, value }) => (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">{label}</span>
                      <span className="text-slate-300">{n(value, 1)} / 100</span>
                    </div>
                    {scoreBar(value, 100, value >= 70 ? "bg-green-500" : value >= 50 ? "bg-blue-500" : "bg-red-500")}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Target className="h-4 w-4 text-blue-400" />
                Trader Identity
              </h3>
              <div className="space-y-3">
                {[
                  { label: "Identity Similarity",    value: Number(latest.identitySimilarity ?? 0) },
                  { label: "Historical Consistency",  value: Number(latest.histWinRate ?? 0) * 100 },
                  { label: "Opportunity Score",       value: Number(latest.opportunityScore ?? 0) },
                ].map(({ label, value }) => (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">{label}</span>
                      <span className="text-slate-300">{n(value, 1)}</span>
                    </div>
                    {scoreBar(value, 100, value >= 60 ? "bg-blue-500" : "bg-slate-500")}
                  </div>
                ))}
                <div className="pt-2 border-t border-slate-600 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Drift Status</span>
                    <span className={latest.driftStatus === "stable" ? "text-green-400" : "text-yellow-400"}>
                      {latest.driftStatus ?? "stable"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Pair</span>
                    <span className="text-slate-300">{latest.pair}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Historical Comparison */}
            <div className="lg:col-span-2 bg-slate-800/60 border border-slate-700 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <History className="h-4 w-4 text-cyan-400" />
                Historical Intelligence
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Sample Size",  value: `${latest.histSampleSize ?? 0} trades`, color: "text-slate-300" },
                  { label: "Win Rate",     value: `${n(Number(latest.histWinRate ?? 0) * 100, 1)}%`, color: "text-green-400" },
                  { label: "Market Pair",  value: latest.pair, color: "text-blue-400" },
                  { label: "Session",      value: latest.session, color: "text-purple-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-700/40 rounded-lg p-3 text-center">
                    <p className={`text-lg font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-slate-500 mt-1">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Research Status ─────────────────────────────────── */}
        {activeTab === "research" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
              <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0" />
              <p className="text-sm text-yellow-300">
                Research Lab is <strong>advisory only</strong> and sandboxed. No automatic deployments. All changes require explicit approval.
              </p>
            </div>

            {readiness && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-purple-400" />
                    Research Status
                  </h3>
                  <div className="space-y-2 text-sm">
                    {readiness.subsystems && Object.entries(readiness.subsystems).map(([k, v]) => {
                      const sub = v as { ready: boolean; reports?: number; profiles?: number; sandboxed?: boolean; operational?: boolean; unified?: boolean };
                      return (
                        <div key={k} className="flex items-center justify-between py-1 border-b border-slate-700/50">
                          <span className="text-slate-400 text-xs capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                          <span className={`text-xs font-medium ${sub.ready ? "text-green-400" : "text-red-400"}`}>
                            {sub.ready ? "Operational" : "Offline"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-400" />
                    Phase 6 Readiness
                  </h3>
                  <div className="text-center mb-4">
                    <div className={`text-4xl font-black tabular-nums ${readiness.phase6Readiness >= 80 ? "text-green-400" : readiness.phase6Readiness >= 60 ? "text-yellow-400" : "text-red-400"}`}>
                      {readiness.phase6Readiness}
                    </div>
                    <p className="text-sm text-slate-400 mt-2">{readiness.phase6ReadinessLabel}</p>
                  </div>
                  {scoreBar(readiness.phase6Readiness, 100, readiness.phase6Readiness >= 80 ? "bg-green-500" : "bg-yellow-500")}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Certification ───────────────────────────────────── */}
        {activeTab === "certification" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-400" />
                Institutional Certification
              </h2>
              {cert && (
                <div className="flex items-center gap-3">
                  <span className={`text-2xl font-black ${certGradeColor(cert.grade)}`}>{cert.grade}</span>
                  <span className={`text-sm font-semibold ${certStatusColor(cert.certificationStatus)}`}>
                    {cert.certificationStatus.toUpperCase()}
                  </span>
                  <span className="text-sm text-slate-400">{cert.overallScore}/100</span>
                </div>
              )}
            </div>

            {certLoading ? (
              <div className="text-center py-8 text-slate-500">Running certification audit...</div>
            ) : cert ? (
              <>
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4">Subsystem Readiness</h3>
                  <div className="space-y-2">
                    {Object.entries(cert.subsystemReadiness).map(([name, score]) => (
                      <SubsystemRow key={name} name={name} score={score} />
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {cert.criticalIssues.length > 0 && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-red-400 flex items-center gap-2 mb-2">
                        <XCircle className="h-4 w-4" /> Critical Issues
                      </h4>
                      {cert.criticalIssues.map((issue, i) => (
                        <p key={i} className="text-xs text-red-300 mt-1">{issue}</p>
                      ))}
                    </div>
                  )}
                  {cert.warnings.length > 0 && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-yellow-400 flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4" /> Warnings
                      </h4>
                      {cert.warnings.slice(0, 5).map((w, i) => (
                        <p key={i} className="text-xs text-yellow-300 mt-1">{w}</p>
                      ))}
                    </div>
                  )}
                  <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-2">
                      <CheckCircle className="h-4 w-4 text-green-400" /> Phase 6 Readiness
                    </h4>
                    <div className="text-2xl font-bold text-green-400 mb-2">{cert.phase6Readiness}/100</div>
                    <p className="text-xs text-slate-400">{cert.phase6ReadinessLabel}</p>
                  </div>
                </div>

                {cert.technicalDebt.length > 0 && (
                  <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-slate-300 mb-2">Technical Debt</h4>
                    <ul className="space-y-1">
                      {cert.technicalDebt.map((d, i) => (
                        <li key={i} className="text-xs text-slate-400 flex items-start gap-2">
                          <span className="text-slate-600 mt-0.5">•</span>
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-slate-500">No certification data available.</div>
            )}
          </div>
        )}

        {/* ── Tab: Version Explorer ────────────────────────────────── */}
        {activeTab === "versions" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-400" />
              Version Explorer
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {versions && Object.entries(versions)
                .filter(([k]) => !["phase", "nextPhase", "isAdvisoryOnly"].includes(k))
                .map(([key, version]) => (
                  <div key={key} className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-slate-300 capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Engine module</p>
                    </div>
                    <span className="font-mono text-sm text-blue-400 bg-blue-400/10 px-3 py-1 rounded-full">v{version}</span>
                  </div>
                ))}
              {versions && (
                <div className="md:col-span-2 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-blue-300">{versions.phase}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Next: {versions.nextPhase}</p>
                  </div>
                  <span className="text-xs text-blue-400 bg-blue-400/10 px-3 py-1 rounded-full">Advisory Only</span>
                </div>
              )}
            </div>

            {/* Recommendation distribution */}
            {summary?.recommendationDistribution && Object.keys(summary.recommendationDistribution).length > 0 && (
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">Historical Recommendation Distribution</h3>
                <div className="space-y-2">
                  {Object.entries(summary.recommendationDistribution)
                    .sort((a, b) => b[1] - a[1])
                    .map(([rec, count]) => {
                      const total = Object.values(summary.recommendationDistribution).reduce((s, v) => s + v, 0);
                      const pct = total > 0 ? (count / total) * 100 : 0;
                      return (
                        <div key={rec} className="flex items-center gap-3">
                          <span className={`text-xs w-28 ${recColor(rec)}`}>{recLabel(rec)}</span>
                          <div className="flex-1 bg-slate-700 rounded-full h-2">
                            <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: rec === "elite" ? "#fbbf24" : rec === "very_strong" ? "#22c55e" : rec === "strong" ? "#10b981" : rec === "acceptable" ? "#3b82f6" : rec === "borderline" ? "#f97316" : "#ef4444" }} />
                          </div>
                          <span className="text-xs text-slate-400 w-12 text-right">{count} ({pct.toFixed(0)}%)</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Top pairs */}
            {summary?.topPairs && summary.topPairs.length > 0 && (
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">Top Pairs by Executive Score</h3>
                <div className="space-y-2">
                  {summary.topPairs.map(({ pair, avgScore, count }) => (
                    <div key={pair} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-slate-300 w-20">{pair}</span>
                      <div className="flex-1">{scoreBar(avgScore, 100, "bg-blue-500")}</div>
                      <span className="text-xs text-blue-400 w-14 text-right">{n(avgScore, 1)} avg</span>
                      <span className="text-xs text-slate-500 w-14 text-right">{count} reports</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
