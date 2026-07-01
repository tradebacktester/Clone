// ─── Adaptive Risk Intelligence Engine — Dashboard ────────────────────────────
// Advisory only. Displays risk profile recommendations, evidence, and history.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Brain, Shield, TrendingUp, TrendingDown, Activity, BarChart2,
  Clock, RefreshCw, AlertTriangle, CheckCircle, ChevronRight,
  Target, Eye, Zap, Lock, BookOpen, Users, Globe, Layers,
} from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  LineChart, Line, Legend,
} from "recharts";

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchJson(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

type RiskProfile = "conservative" | "balanced" | "aggressive" | "observation" | "recovery" | "emergency";

interface EnvironmentStat {
  environment: string;
  environmentKey: string;
  sampleSize: number;
  winRate: number;
  expectancy: number;
  riskScore: number;
  riskRating: "favorable" | "neutral" | "unfavorable" | "avoid";
  maxDrawdown: number;
  profitFactor: number;
}

// ─── Color maps ───────────────────────────────────────────────────────────────

const PROFILE_COLOR: Record<string, string> = {
  aggressive:   "text-green-400",
  balanced:     "text-blue-400",
  conservative: "text-yellow-400",
  observation:  "text-orange-400",
  recovery:     "text-orange-500",
  emergency:    "text-red-500",
};
const PROFILE_BG: Record<string, string> = {
  aggressive:   "bg-green-900/30 border-green-700/40",
  balanced:     "bg-blue-900/30 border-blue-700/40",
  conservative: "bg-yellow-900/30 border-yellow-700/40",
  observation:  "bg-orange-900/30 border-orange-700/40",
  recovery:     "bg-orange-900/40 border-orange-600/50",
  emergency:    "bg-red-900/50 border-red-600/60",
};
const RATING_COLOR: Record<string, string> = {
  favorable:   "text-green-400",
  neutral:     "text-blue-400",
  unfavorable: "text-orange-400",
  avoid:       "text-red-400",
};
const RATING_BG: Record<string, string> = {
  favorable:   "bg-green-900/30",
  neutral:     "bg-blue-900/30",
  unfavorable: "bg-orange-900/30",
  avoid:       "bg-red-900/30",
};
const CONF_COLOR: Record<string, string> = {
  very_high:    "text-green-400",
  high:         "text-green-400",
  moderate:     "text-yellow-400",
  low:          "text-orange-400",
  very_low:     "text-orange-500",
  insufficient: "text-red-400",
};

function ProfileBadge({ p }: { p: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase ${PROFILE_COLOR[p] ?? "text-gray-400"}`}>
      {p.replace(/_/g, " ")}
    </span>
  );
}
function RatingBadge({ r }: { r: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase ${RATING_COLOR[r] ?? "text-gray-400"} ${RATING_BG[r] ?? ""}`}>
      {r}
    </span>
  );
}

function StatCard({ label, value, sub, color = "text-white" }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function ScoreBar({ value, max = 100, color = "bg-blue-500" }: { value: number; max?: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="w-full bg-muted rounded-full h-2">
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const TABS = [
  { id: "profile",      label: "Risk Profile",      icon: Shield },
  { id: "market",       label: "Market Analysis",   icon: Globe },
  { id: "performance",  label: "Performance",       icon: BarChart2 },
  { id: "pairs",        label: "Pair Rankings",     icon: Layers },
  { id: "sessions",     label: "Session Rankings",  icon: Clock },
  { id: "volatility",   label: "Volatility",        icon: Activity },
  { id: "history",      label: "Adaptation History",icon: BookOpen },
  { id: "evidence",     label: "Evidence Explorer", icon: Eye },
  { id: "explainability", label: "Explainability",  icon: Brain },
  { id: "report",       label: "Reports",           icon: Target },
];

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function AdaptiveRiskPage() {
  const [tab, setTab] = useState("profile");
  const [pair, setPair] = useState("EURUSD");

  const profileQ = useQuery({
    queryKey: ["ari-profile", pair],
    queryFn: () => fetchJson(`/api/adaptive-risk/profile?pair=${pair}`),
    refetchInterval: 60_000,
  });
  const performanceQ = useQuery({
    queryKey: ["ari-performance"],
    queryFn: () => fetchJson("/api/adaptive-risk/performance"),
    refetchInterval: 120_000,
  });
  const historyQ = useQuery({
    queryKey: ["ari-history"],
    queryFn: () => fetchJson("/api/adaptive-risk/history"),
    refetchInterval: 60_000,
  });
  const reportQ = useQuery({
    queryKey: ["ari-report", pair],
    queryFn: () => fetchJson(`/api/adaptive-risk/report?pair=${pair}`),
    refetchInterval: 120_000,
  });

  const profileData = profileQ.data?.data;
  const perfData    = performanceQ.data?.data;
  const histData    = historyQ.data?.data;
  const reportData  = reportQ.data?.data;

  const rec       = profileData?.recommendation;
  const profile   = rec?.recommendedProfile ?? "observation";
  const conf      = rec?.confidence;
  const params    = rec?.parameters;
  const market    = profileData?.marketAnalysis;
  const summary   = profileData?.summary;

  function refetchAll() {
    profileQ.refetch();
    performanceQ.refetch();
    historyQ.refetch();
    reportQ.refetch();
  }

  return (
    <div className="p-4 space-y-4 min-h-screen bg-background">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-900/40 border border-purple-700/40 flex items-center justify-center">
            <Brain className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Adaptive Risk Intelligence</h1>
            <p className="text-xs text-muted-foreground">Continuously learns market environments · Advisory only · NEVER modifies strategy</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="bg-card border border-border text-sm rounded px-3 py-1.5 text-white"
            value={pair}
            onChange={e => setPair(e.target.value)}
          >
            {["EURUSD", "GBPUSD", "USDJPY"].map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button
            onClick={refetchAll}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-card border border-border text-xs text-muted-foreground hover:text-white"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>
      </div>

      {/* ── Profile Status Banner ── */}
      {rec && (
        <div className={`rounded-xl border p-4 ${PROFILE_BG[profile] ?? "bg-card border-border"}`}>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Recommended Profile</div>
              <div className={`text-2xl font-bold ${PROFILE_COLOR[profile] ?? "text-white"}`}>
                {rec.recommendedProfileLabel ?? profile.replace(/_/g, " ").toUpperCase()}
              </div>
            </div>
            <div className="h-10 w-px bg-border hidden sm:block" />
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Confidence</div>
              <div className={`text-lg font-bold font-mono ${CONF_COLOR[conf?.label ?? ""] ?? "text-white"}`}>
                {conf?.score ?? 0}/100
                <span className="text-xs font-normal text-muted-foreground ml-1">({conf?.label})</span>
              </div>
            </div>
            <div className="h-10 w-px bg-border hidden sm:block" />
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Sample Size</div>
              <div className="text-lg font-bold font-mono text-white">{conf?.sampleSize ?? 0} trades</div>
            </div>
            <div className="h-10 w-px bg-border hidden sm:block" />
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Reliability</div>
              <div className="text-sm font-semibold text-white capitalize">{conf?.reliabilityRating}</div>
            </div>
            <div className="ml-auto text-right hidden lg:block">
              <div className="text-xs text-muted-foreground mb-1">Safe to Trade</div>
              {summary?.safeToTrade
                ? <span className="flex items-center gap-1 text-green-400 font-semibold"><CheckCircle className="w-4 h-4" /> Yes</span>
                : <span className="flex items-center gap-1 text-red-400 font-semibold"><AlertTriangle className="w-4 h-4" /> No</span>
              }
            </div>
          </div>
          {rec.primaryReason && (
            <div className="mt-3 text-sm text-muted-foreground border-t border-white/5 pt-3">
              <span className="text-white font-medium">Reason: </span>{rec.primaryReason}
            </div>
          )}
        </div>
      )}

      {/* ── Summary Cards ── */}
      {params && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <StatCard label="Max Risk/Trade" value={`${params.maxRiskPerTrade}%`} color="text-blue-400" />
          <StatCard label="Max Trades"     value={params.maxOpenTrades} color="text-blue-400" />
          <StatCard label="Daily Budget"   value={`${params.dailyRiskBudget}%`} color="text-yellow-400" />
          <StatCard label="Weekly Budget"  value={`${params.weeklyRiskBudget}%`} color="text-yellow-400" />
          <StatCard label="Size Multiplier" value={`${params.positionSizeMultiplier}x`} color="text-purple-400" />
          <StatCard label="Exposure Multi" value={`${params.exposureMultiplier}x`} color="text-purple-400" />
          <StatCard label="Max Pair Exp."  value={`${params.maxPairExposure}%`} color="text-orange-400" />
          <StatCard label="Correl. Exp."   value={`${params.maxCorrelationExposure}%`} color="text-orange-400" />
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 overflow-x-auto pb-1 border-b border-border">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-t text-xs font-medium whitespace-nowrap transition-colors ${
                tab === t.id
                  ? "bg-card border border-border border-b-transparent text-white"
                  : "text-muted-foreground hover:text-white"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ── */}
      <div className="space-y-4">
        {/* Profile Tab */}
        {tab === "profile" && rec && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Profile Radar */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Risk Profile Comparison</h3>
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={[
                  { dim: "Risk/Trade", val: (params?.maxRiskPerTrade ?? 0) * 50 },
                  { dim: "Trades",     val: (params?.maxOpenTrades ?? 0) * 20 },
                  { dim: "Daily Bdg",  val: (params?.dailyRiskBudget ?? 0) * 16 },
                  { dim: "Size",       val: (params?.positionSizeMultiplier ?? 0) * 75 },
                  { dim: "Exposure",   val: (params?.exposureMultiplier ?? 0) * 75 },
                  { dim: "Pair Exp",   val: (params?.maxPairExposure ?? 0) * 25 },
                ]}>
                  <PolarGrid stroke="#374151" />
                  <PolarAngleAxis dataKey="dim" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <Radar name="Profile" dataKey="val" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Supporting Reasons */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white">Supporting Reasons</h3>
              {(rec.supportingReasons ?? []).map((r: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <ChevronRight className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{r}</span>
                </div>
              ))}
              {(rec.expectedBenefits ?? []).length > 0 && (
                <>
                  <div className="text-xs font-semibold text-green-400 pt-2 border-t border-border">Expected Benefits</div>
                  {(rec.expectedBenefits ?? []).map((b: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span className="text-muted-foreground">{b}</span>
                    </div>
                  ))}
                </>
              )}
              {(rec.potentialRisks ?? []).length > 0 && (
                <>
                  <div className="text-xs font-semibold text-orange-400 pt-2 border-t border-border">Potential Risks</div>
                  {(rec.potentialRisks ?? []).map((r: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                      <span className="text-muted-foreground">{r}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* Market Analysis Tab */}
        {tab === "market" && market && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white">Current Market Context</h3>
              {[
                ["Pair",           market.currentContext?.pair],
                ["Session",        market.currentContext?.session],
                ["Regime",         market.currentContext?.regime],
                ["Volatility",     market.currentContext?.volatilityLevel],
                ["Liquidity",      market.currentContext?.liquidityLevel],
                ["Overall Risk Score", market.overallRiskScore ?? "—"],
                ["Favorability",   market.favorabilityLabel],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-white font-medium">{v ?? "—"}</span>
                </div>
              ))}
            </div>
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white">Dimension Risk Scores</h3>
              {[
                { label: "Regime",    stat: market.regimeStats },
                { label: "Volatility", stat: market.volatilityStats },
                { label: "Session",   stat: market.sessionStats },
                { label: "Liquidity", stat: market.liquidityStats },
                { label: "Pair",      stat: market.pairStats },
              ].map(({ label, stat }) => stat && (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{label} — {stat.environmentKey}</span>
                    <span className={RATING_COLOR[stat.riskRating]}>{stat.riskScore}/100 · {stat.riskRating}</span>
                  </div>
                  <ScoreBar
                    value={stat.riskScore}
                    color={stat.riskScore >= 70 ? "bg-green-500" : stat.riskScore >= 50 ? "bg-blue-500" : stat.riskScore >= 30 ? "bg-orange-500" : "bg-red-500"}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Performance Tab */}
        {tab === "performance" && perfData && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Performance by Regime</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={(perfData.byRegime ?? []).map((s: EnvironmentStat) => ({
                  name: s.environmentKey,
                  "Risk Score": s.riskScore,
                  "Win Rate %": Math.round(s.winRate * 100),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }} />
                  <Bar dataKey="Risk Score" fill="#8b5cf6" radius={[4,4,0,0]} />
                  <Bar dataKey="Win Rate %" fill="#10b981" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[
                { title: "By Regime",     data: perfData.byRegime },
                { title: "By Volatility", data: perfData.byVolatility },
                { title: "By Session",    data: perfData.bySession },
                { title: "By Condition",  data: perfData.byCondition },
              ].map(({ title, data }) => data?.length > 0 && (
                <div key={title} className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-muted-foreground mb-3">{title}</h3>
                  <div className="space-y-2">
                    {(data ?? []).map((s: EnvironmentStat) => (
                      <div key={s.environmentKey} className="flex items-center gap-2">
                        <div className="text-xs text-muted-foreground w-28 shrink-0">{s.environmentKey}</div>
                        <ScoreBar
                          value={s.riskScore}
                          color={s.riskScore >= 70 ? "bg-green-500" : s.riskScore >= 50 ? "bg-blue-500" : s.riskScore >= 30 ? "bg-orange-500" : "bg-red-500"}
                        />
                        <RatingBadge r={s.riskRating} />
                        <div className="text-xs text-muted-foreground w-8 shrink-0">{s.sampleSize}n</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pair Rankings Tab */}
        {tab === "pairs" && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-4">Pair Risk Rankings</h3>
            <div className="space-y-3">
              {(perfData?.byPair ?? []).map((s: EnvironmentStat, i: number) => (
                <div key={s.environmentKey} className="flex items-center gap-4 p-3 rounded-lg bg-background/40">
                  <div className="text-lg font-bold text-muted-foreground w-6">#{i + 1}</div>
                  <div className="w-20 font-mono font-semibold text-white">{s.environmentKey}</div>
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Risk Score</span>
                      <span className="text-white">{s.riskScore}/100</span>
                    </div>
                    <ScoreBar value={s.riskScore} color={s.riskScore >= 70 ? "bg-green-500" : s.riskScore >= 50 ? "bg-blue-500" : "bg-orange-500"} />
                  </div>
                  <div className="text-right">
                    <RatingBadge r={s.riskRating} />
                    <div className="text-xs text-muted-foreground mt-1">WR {(s.winRate * 100).toFixed(1)}% · {s.sampleSize}n</div>
                  </div>
                </div>
              ))}
              {(!perfData?.byPair || perfData.byPair.length === 0) && (
                <div className="text-center text-muted-foreground py-8">No pair data yet — trades needed</div>
              )}
            </div>
          </div>
        )}

        {/* Sessions Tab */}
        {tab === "sessions" && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-4">Session Risk Rankings</h3>
            <div className="space-y-3">
              {(perfData?.bySession ?? []).map((s: EnvironmentStat, i: number) => (
                <div key={s.environmentKey} className="flex items-center gap-4 p-3 rounded-lg bg-background/40">
                  <div className="text-lg font-bold text-muted-foreground w-6">#{i + 1}</div>
                  <div className="w-24 font-semibold text-white capitalize">{s.environmentKey.replace(/_/g, " ")}</div>
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Risk Score</span>
                      <span className="text-white">{s.riskScore}/100</span>
                    </div>
                    <ScoreBar value={s.riskScore} color={s.riskScore >= 70 ? "bg-green-500" : s.riskScore >= 50 ? "bg-blue-500" : "bg-orange-500"} />
                  </div>
                  <div className="text-right">
                    <RatingBadge r={s.riskRating} />
                    <div className="text-xs text-muted-foreground mt-1">
                      WR {(s.winRate * 100).toFixed(1)}% · E:{s.expectancy.toFixed(2)}R · {s.sampleSize}n
                    </div>
                  </div>
                </div>
              ))}
              {(!perfData?.bySession || perfData.bySession.length === 0) && (
                <div className="text-center text-muted-foreground py-8">No session data yet — trades needed</div>
              )}
            </div>
          </div>
        )}

        {/* Volatility Tab */}
        {tab === "volatility" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-4">Volatility Analysis</h3>
              {(perfData?.byVolatility ?? []).map((s: EnvironmentStat) => (
                <div key={s.environmentKey} className="mb-4 p-3 rounded-lg bg-background/40">
                  <div className="flex justify-between mb-2">
                    <div className="font-semibold text-white capitalize">{s.environmentKey}</div>
                    <RatingBadge r={s.riskRating} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      ["Risk Score", `${s.riskScore}/100`],
                      ["Win Rate",   `${(s.winRate * 100).toFixed(1)}%`],
                      ["Expectancy", `${s.expectancy.toFixed(2)}R`],
                      ["Max DD",     `${s.maxDrawdown?.toFixed(1) ?? "—"}%`],
                      ["Sample",     `${s.sampleSize} trades`],
                      ["P.Factor",   s.profitFactor?.toFixed(2) ?? "—"],
                    ].map(([k, v]) => (
                      <div key={String(k)}>
                        <span className="text-muted-foreground">{k}: </span>
                        <span className="text-white">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {(!perfData?.byVolatility || perfData.byVolatility.length === 0) && (
                <div className="text-center text-muted-foreground py-8">No volatility data yet</div>
              )}
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-4">Volatility vs Risk Score</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={(perfData?.byVolatility ?? []).map((s: EnvironmentStat) => ({
                  name: s.environmentKey,
                  score: s.riskScore,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }} />
                  <Bar dataKey="score" radius={[4,4,0,0]}>
                    {(perfData?.byVolatility ?? []).map((s: EnvironmentStat) => (
                      <Cell key={s.environmentKey} fill={
                        s.riskScore >= 70 ? "#10b981" : s.riskScore >= 50 ? "#3b82f6" : s.riskScore >= 30 ? "#f59e0b" : "#ef4444"
                      } />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* History Tab */}
        {tab === "history" && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">Showing last {histData?.events?.length ?? 0} adaptation events</div>
            {(histData?.events ?? []).map((ev: any) => (
              <div key={ev.event_id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="text-xs text-muted-foreground">{new Date(ev.occurred_at).toLocaleString()}</div>
                  <div className="ml-auto flex items-center gap-2">
                    <ProfileBadge p={ev.from_profile ?? "—"} />
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    <ProfileBadge p={ev.to_profile} />
                    <span className={`text-xs px-2 py-0.5 rounded ${ev.change_type === "escalation" ? "text-red-400 bg-red-900/20" : "text-green-400 bg-green-900/20"}`}>
                      {ev.change_type}
                    </span>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">{ev.change_reason}</div>
                <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                  <span>Regime: {ev.market_regime ?? "—"}</span>
                  <span>Session: {ev.session ?? "—"}</span>
                  <span>Confidence: {ev.confidence_score}/100</span>
                  <span>n={ev.sample_size}</span>
                </div>
              </div>
            ))}
            {(!histData?.events || histData.events.length === 0) && (
              <div className="text-center text-muted-foreground py-8 bg-card border border-border rounded-xl">
                No adaptation events yet — profile changes will be recorded here
              </div>
            )}
          </div>
        )}

        {/* Evidence Explorer Tab */}
        {tab === "evidence" && rec && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-4">Evidence Items ({(rec.evidence ?? []).length})</h3>
              {(rec.evidence ?? []).length === 0 ? (
                <div className="text-center text-muted-foreground py-6">
                  Insufficient evidence — {conf?.sampleSize ?? 0} trades (minimum 10 needed)
                </div>
              ) : (
                <div className="space-y-2">
                  {(rec.evidence ?? []).map((ev: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-background/40">
                      <div className="w-24 text-xs text-muted-foreground capitalize">{ev.dimension}</div>
                      <div className="w-28 text-sm font-medium text-white">{ev.key}</div>
                      <div className="flex-1 text-xs text-muted-foreground">{ev.stat}</div>
                      <div className="w-16 text-right">
                        <RatingBadge r={ev.riskRating} />
                      </div>
                      <div className="text-xs text-muted-foreground w-8">{ev.sampleSize}n</div>
                      <div className="w-16">
                        <ScoreBar value={ev.value} color={ev.value >= 70 ? "bg-green-500" : ev.value >= 50 ? "bg-blue-500" : "bg-orange-500"} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3">All Environment Stats</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border">
                      {["Dimension", "Key", "Score", "Rating", "Win%", "Expectancy", "MaxDD", "PF", "n"].map(h => (
                        <th key={h} className="text-left py-2 pr-4">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(profileData?.allEnvironmentStats ?? []).map((s: EnvironmentStat, i: number) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                        <td className="py-2 pr-4 text-muted-foreground capitalize">{s.environment}</td>
                        <td className="py-2 pr-4 font-medium text-white">{s.environmentKey}</td>
                        <td className="py-2 pr-4 font-mono">{s.riskScore}</td>
                        <td className="py-2 pr-4"><RatingBadge r={s.riskRating} /></td>
                        <td className="py-2 pr-4">{(s.winRate * 100).toFixed(1)}%</td>
                        <td className="py-2 pr-4">{s.expectancy.toFixed(2)}R</td>
                        <td className="py-2 pr-4">{s.maxDrawdown?.toFixed(1)}%</td>
                        <td className="py-2 pr-4">{s.profitFactor?.toFixed(2)}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{s.sampleSize}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Explainability Tab */}
        {tab === "explainability" && rec?.explainability && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 space-y-4">
              <div>
                <div className="text-xs font-semibold text-purple-400 mb-2">Why This Profile?</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{rec.explainability.whyThisProfile}</p>
              </div>
              <div>
                <div className="text-xs font-semibold text-blue-400 mb-2">Historical Support</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{rec.explainability.historicalSupport}</p>
              </div>
              <div>
                <div className="text-xs font-semibold text-green-400 mb-2">Expected Benefits</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{rec.explainability.expectedBenefits}</p>
              </div>
              <div>
                <div className="text-xs font-semibold text-orange-400 mb-2">Potential Risks</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{rec.explainability.potentialRisks}</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 space-y-4">
              <div>
                <div className="text-xs font-semibold text-yellow-400 mb-2">Market Influences</div>
                {(rec.explainability.marketInfluences ?? []).map((m: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 mb-2">
                    <ChevronRight className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                    <span className="text-sm text-muted-foreground">{m}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-xs font-semibold text-teal-400 mb-2 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Safety Mechanisms
                </div>
                {(rec.explainability.safetyMechanisms ?? []).map((s: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
                    <span className="text-sm text-muted-foreground">{s}</span>
                  </div>
                ))}
              </div>
              <div className="text-xs text-muted-foreground border-t border-border pt-2">
                Engine v{rec.explainability.engineVersion} · Reviewed {new Date(rec.explainability.reviewedAt).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {/* Reports Tab */}
        {tab === "report" && reportData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white">Engine Report</h3>
              {[
                ["Engine Version",  reportData.engineVersion],
                ["Total Trades",    reportData.tradeCount],
                ["Confidence",      `${reportData.report?.recommendation?.confidence?.score ?? 0}/100`],
                ["Sample Size",     reportData.report?.recommendation?.confidence?.sampleSize],
                ["Reliability",     reportData.report?.recommendation?.confidence?.reliabilityRating],
                ["Statistical Sig", reportData.report?.recommendation?.confidence?.statisticalSignificance?.toFixed(3)],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between text-sm border-b border-border/30 pb-2">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-white font-medium">{v ?? "—"}</span>
                </div>
              ))}
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Recent Profile History</h3>
              <div className="space-y-2">
                {(reportData.recentProfiles ?? []).slice(0, 8).map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{new Date(p.generated_at).toLocaleString()}</span>
                    <ProfileBadge p={p.recommended_profile} />
                    <span className="text-muted-foreground">{p.confidence_score}/100</span>
                  </div>
                ))}
                {(!reportData.recentProfiles || reportData.recentProfiles.length === 0) && (
                  <div className="text-muted-foreground text-center py-4">No profile history yet</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Loading state */}
        {(profileQ.isLoading || performanceQ.isLoading) && (
          <div className="text-center text-muted-foreground py-12 animate-pulse">
            Running adaptive risk analysis…
          </div>
        )}
        {profileQ.isError && (
          <div className="text-center text-red-400 py-8">
            Failed to load adaptive risk data. API server may still be starting.
          </div>
        )}
      </div>
    </div>
  );
}
