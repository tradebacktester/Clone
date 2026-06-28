import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import {
  Sparkles, AlertCircle, TrendingUp, TrendingDown, Minus,
  RefreshCw, Download, Play, Filter, ChevronDown, ChevronUp,
} from "lucide-react";

const API = "/api";
const fetcher = (url: string) => fetch(`${API}${url}`).then(r => r.json());
const poster = (url: string, body?: unknown) =>
  fetch(`${API}${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }).then(r => r.json());

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatternSummary {
  id: string;
  category: string;
  key: string;
  description: string;
  conditions: Record<string, string>;
  sampleSize: number;
  winRate: number;
  lossRate: number;
  avgRR: number;
  expectancy: number;
  profitFactor: number;
  maxDrawdownPct: number;
  confidence: number;
  isInsufficient: boolean;
  insufficientReason?: string;
  trendDirection: string;
  trendConfidence: number;
  lastValidationDate: string;
  version: string;
}

interface PatternStats {
  hasData: boolean;
  version?: string;
  totalPatterns?: number;
  sufficientPatterns?: number;
  byCategory?: Record<string, { total: number; sufficient: number; avgWinRate: number }>;
  topByWinRate?: { id: string; description: string; winRate: number; sampleSize: number; confidence: number }[];
  bottomByWinRate?: { id: string; description: string; winRate: number; sampleSize: number; confidence: number }[];
  topByConfidence?: { id: string; description: string; confidence: number; winRate: number; sampleSize: number }[];
  topByExpectancy?: { id: string; description: string; expectancy: number; winRate: number; sampleSize: number }[];
}

interface TrendData {
  trends: {
    id: string; description: string; direction: string; directionConfidence: number;
    explanation: string; winRate30: number | null; winRate100: number | null;
    winRate500: number | null; sampleSize: number; isInsufficient: boolean;
  }[];
  improving: number; stable: number; declining: number; insufficient: number;
}

interface EvidenceData {
  hasData: boolean;
  totalPatterns?: number; sufficientPatterns?: number; insufficientPatterns?: number;
  sampleSizeBuckets?: Record<string, number>;
  confidenceBuckets?: Record<string, number>;
  byCategoryEvidence?: Record<string, { total: number; sufficient: number; avgSampleSize: number; avgConfidence: number }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "pair", "session", "regime", "zone_quality", "liquidity", "amd",
  "confirmation", "volatility", "risk_profile", "pair_session", "pair_regime", "session_regime",
];

function TrendBadge({ direction }: { direction: string }) {
  if (direction === "improving") return (
    <span className="flex items-center gap-1 text-green-400 text-xs font-mono">
      <TrendingUp className="w-3 h-3" /> Improving
    </span>
  );
  if (direction === "declining") return (
    <span className="flex items-center gap-1 text-red-400 text-xs font-mono">
      <TrendingDown className="w-3 h-3" /> Declining
    </span>
  );
  if (direction === "stable") return (
    <span className="flex items-center gap-1 text-yellow-400 text-xs font-mono">
      <Minus className="w-3 h-3" /> Stable
    </span>
  );
  return <span className="text-zinc-500 text-xs font-mono">Insufficient data</span>;
}

function InsufficientBadge() {
  return (
    <span className="text-xs bg-zinc-800 text-zinc-500 border border-zinc-700 px-2 py-0.5 rounded font-mono">
      Insufficient evidence
    </span>
  );
}

function fmtPct(v: number) { return `${(v * 100).toFixed(1)}%`; }
function fmtN(v: number, d = 2) { return v.toFixed(d); }

function WinRateBar({ winRate, n }: { winRate: number; n: number }) {
  const pct = Math.round(winRate * 100);
  const color = pct >= 55 ? "bg-green-500" : pct >= 45 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-zinc-300 w-10 text-right">{pct}%</span>
      <span className="text-xs text-zinc-500 font-mono w-8 text-right">n={n}</span>
    </div>
  );
}

function ConfidenceBar({ confidence, n }: { confidence: number; n: number }) {
  const pct = Math.round(confidence);
  const color = pct >= 60 ? "bg-emerald-500" : pct >= 35 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-zinc-300 w-10 text-right">{pct}</span>
      <span className="text-xs text-zinc-500 font-mono w-8 text-right">n={n}</span>
    </div>
  );
}

// ─── Pattern Row ──────────────────────────────────────────────────────────────

function PatternRow({ p, expanded, onToggle }: { p: PatternSummary; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr
        className="border-b border-zinc-800 hover:bg-zinc-800/50 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-3 py-2">
          <span className="text-xs font-mono text-zinc-500 bg-zinc-800 rounded px-1.5 py-0.5">
            {p.category}
          </span>
        </td>
        <td className="px-3 py-2 text-sm text-zinc-200">{p.description}</td>
        <td className="px-3 py-2">
          {p.isInsufficient ? <InsufficientBadge /> : <WinRateBar winRate={p.winRate} n={p.sampleSize} />}
        </td>
        <td className="px-3 py-2 text-xs font-mono text-zinc-300">
          {p.isInsufficient ? "—" : fmtN(p.avgRR)}
        </td>
        <td className="px-3 py-2">
          {p.isInsufficient ? <InsufficientBadge /> : <ConfidenceBar confidence={p.confidence} n={p.sampleSize} />}
        </td>
        <td className="px-3 py-2"><TrendBadge direction={p.trendDirection} /></td>
        <td className="px-3 py-2 text-zinc-600">
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-zinc-800 bg-zinc-900/60">
          <td colSpan={7} className="px-4 py-3">
            {p.isInsufficient ? (
              <div className="flex items-start gap-2 text-zinc-500 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{p.insufficientReason}</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                <div>
                  <div className="text-zinc-500 mb-1">Sample Size</div>
                  <div className="text-zinc-200">{p.sampleSize}</div>
                </div>
                <div>
                  <div className="text-zinc-500 mb-1">Win Rate</div>
                  <div className="text-zinc-200">{fmtPct(p.winRate)}</div>
                </div>
                <div>
                  <div className="text-zinc-500 mb-1">Avg R:R</div>
                  <div className="text-zinc-200">{fmtN(p.avgRR)}</div>
                </div>
                <div>
                  <div className="text-zinc-500 mb-1">Expectancy</div>
                  <div className={p.expectancy >= 0 ? "text-green-400" : "text-red-400"}>{fmtN(p.expectancy, 4)}</div>
                </div>
                <div>
                  <div className="text-zinc-500 mb-1">Profit Factor</div>
                  <div className={p.profitFactor >= 1 ? "text-green-400" : "text-red-400"}>{fmtN(p.profitFactor)}</div>
                </div>
                <div>
                  <div className="text-zinc-500 mb-1">Max Drawdown</div>
                  <div className="text-red-400">{fmtN(p.maxDrawdownPct)}%</div>
                </div>
                <div>
                  <div className="text-zinc-500 mb-1">Statistical Confidence</div>
                  <div className="text-zinc-200">{fmtN(p.confidence, 1)}/100</div>
                </div>
                <div>
                  <div className="text-zinc-500 mb-1">Conditions</div>
                  <div className="text-zinc-400">{Object.entries(p.conditions).map(([k, v]) => `${k}=${v}`).join(", ")}</div>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "library" | "win-rate" | "confidence" | "evidence" | "trends" | "breakdown";

const TABS: { key: Tab; label: string }[] = [
  { key: "library", label: "Pattern Library" },
  { key: "win-rate", label: "Win Rate Charts" },
  { key: "confidence", label: "Confidence Charts" },
  { key: "evidence", label: "Evidence Counts" },
  { key: "trends", label: "Trend Analysis" },
  { key: "breakdown", label: "Performance Breakdown" },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LearningPatterns() {
  const [tab, setTab] = useState<Tab>("library");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sufficientOnly, setSufficientOnly] = useState(false);
  const [sortBy, setSortBy] = useState("win_rate");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: statusData } = useQuery({
    queryKey: ["pattern-status"],
    queryFn: () => fetcher("/learning/patterns/status"),
    refetchInterval: 30_000,
  });

  const { data: patternsData, isLoading: patternsLoading } = useQuery({
    queryKey: ["patterns", categoryFilter, sufficientOnly, sortBy],
    queryFn: () => {
      const params = new URLSearchParams({ sortBy, limit: "200" });
      if (categoryFilter) params.set("category", categoryFilter);
      if (sufficientOnly) params.set("sufficientOnly", "true");
      return fetcher(`/learning/patterns?${params}`);
    },
    refetchInterval: 60_000,
  });

  const { data: statsData } = useQuery<PatternStats>({
    queryKey: ["pattern-stats"],
    queryFn: () => fetcher("/learning/statistics"),
    refetchInterval: 60_000,
  });

  const { data: trendsData } = useQuery<TrendData>({
    queryKey: ["pattern-trends"],
    queryFn: () => fetcher("/learning/trends?days=90"),
    refetchInterval: 60_000,
  });

  const { data: evidenceData } = useQuery<EvidenceData>({
    queryKey: ["pattern-evidence"],
    queryFn: () => fetcher("/learning/evidence"),
    refetchInterval: 60_000,
  });

  const analyzeMutation = useMutation({
    mutationFn: () => poster("/learning/patterns/analyze", { dataQuality: 80 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patterns"] });
      qc.invalidateQueries({ queryKey: ["pattern-stats"] });
      qc.invalidateQueries({ queryKey: ["pattern-trends"] });
      qc.invalidateQueries({ queryKey: ["pattern-evidence"] });
      qc.invalidateQueries({ queryKey: ["pattern-status"] });
    },
  });

  const patterns: PatternSummary[] = patternsData?.patterns ?? [];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-screen-xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-emerald-400" />
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Pattern Performance Engine</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Advisory only — learns from history, never modifies trading behavior
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-mono rounded-md"
          >
            {analyzeMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            Run Analysis
          </button>
          <a
            href="/api/learning/patterns/report?format=markdown"
            target="_blank"
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs font-mono rounded-md"
          >
            <Download className="w-3 h-3" />
            Download Report
          </a>
        </div>
      </div>

      {analyzeMutation.data && !analyzeMutation.data.success && (
        <div className="flex items-start gap-2 bg-amber-950/40 border border-amber-800/40 rounded-lg p-3 text-amber-300 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{analyzeMutation.data.message}</span>
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Patterns", value: statusData?.inMemoryPatterns ?? 0 },
          { label: "Sufficient Evidence", value: statusData?.sufficientInMemory ?? 0 },
          { label: "In Database", value: statusData?.dbPatterns ?? 0 },
          { label: "Engine Version", value: statusData?.version ?? "—" },
        ].map(card => (
          <div key={card.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="text-xs text-zinc-500 font-mono mb-1">{card.label}</div>
            <div className="text-lg font-bold text-zinc-100 font-mono">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-xs font-mono whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Library Tab ─────────────────────────────────────────────────────── */}
      {tab === "library" && (
        <div className="flex flex-col gap-4">
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <Filter className="w-4 h-4 text-zinc-500" />
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-mono rounded px-2 py-1"
            >
              <option value="">All categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-mono rounded px-2 py-1"
            >
              <option value="win_rate">Sort: Win Rate</option>
              <option value="confidence">Sort: Confidence</option>
              <option value="expectancy">Sort: Expectancy</option>
              <option value="sample_size">Sort: Sample Size</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-zinc-400 font-mono cursor-pointer">
              <input
                type="checkbox"
                checked={sufficientOnly}
                onChange={e => setSufficientOnly(e.target.checked)}
                className="rounded"
              />
              Sufficient evidence only
            </label>
          </div>

          {patternsLoading ? (
            <div className="text-zinc-500 text-sm font-mono py-8 text-center">Loading patterns…</div>
          ) : patterns.length === 0 ? (
            <div className="text-zinc-500 text-sm font-mono py-8 text-center">
              No patterns yet. Click "Run Analysis" to begin.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 border-b border-zinc-800">
                  <tr>
                    {["Category", "Pattern", "Win Rate", "Avg R:R", "Confidence", "Trend", ""].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs text-zinc-500 font-mono font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {patterns.map(p => (
                    <PatternRow
                      key={p.id}
                      p={p}
                      expanded={expandedId === p.id}
                      onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Win Rate Charts Tab ─────────────────────────────────────────────── */}
      {tab === "win-rate" && (
        <div className="flex flex-col gap-6">
          {statsData?.hasData ? (
            <>
              <SectionCard title="Top 5 Patterns by Win Rate (sufficient evidence only)">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={(statsData.topByWinRate ?? []).map(p => ({
                      name: p.description.length > 30 ? p.description.slice(0, 28) + "…" : p.description,
                      winRate: Math.round(p.winRate * 1000) / 10,
                      n: p.sampleSize,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#71717a" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#71717a" }} unit="%" domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 11 }}
                      formatter={(v, _, props) => [`${v}% (n=${props.payload?.n})`, "Win Rate"]}
                    />
                    <Bar dataKey="winRate" fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </SectionCard>

              <SectionCard title="Bottom 5 Patterns by Win Rate (sufficient evidence only)">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={(statsData.bottomByWinRate ?? []).map(p => ({
                      name: p.description.length > 30 ? p.description.slice(0, 28) + "…" : p.description,
                      winRate: Math.round(p.winRate * 1000) / 10,
                      n: p.sampleSize,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#71717a" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#71717a" }} unit="%" domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 11 }}
                      formatter={(v, _, props) => [`${v}% (n=${props.payload?.n})`, "Win Rate"]}
                    />
                    <Bar dataKey="winRate" fill="#ef4444" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </SectionCard>

              <SectionCard title="Win Rate by Category (avg, sufficient patterns only)">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={Object.entries(statsData.byCategory ?? {})
                      .filter(([, v]) => v.sufficient > 0)
                      .map(([cat, v]) => ({ cat, winRate: Math.round(v.avgWinRate * 1000) / 10, n: v.sufficient }))
                    }
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="cat" tick={{ fontSize: 10, fill: "#71717a" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#71717a" }} unit="%" domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 11 }}
                      formatter={(v, _, props) => [`${v}% (${props.payload?.n} patterns)`, "Avg Win Rate"]}
                    />
                    <Bar dataKey="winRate" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </SectionCard>
            </>
          ) : <NoDataPlaceholder />}
        </div>
      )}

      {/* ── Confidence Charts Tab ───────────────────────────────────────────── */}
      {tab === "confidence" && (
        <div className="flex flex-col gap-6">
          {statsData?.hasData ? (
            <>
              <SectionCard title="Top 5 Patterns by Statistical Confidence">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={(statsData.topByConfidence ?? []).map(p => ({
                      name: p.description.length > 30 ? p.description.slice(0, 28) + "…" : p.description,
                      confidence: Math.round(p.confidence * 10) / 10,
                      winRate: Math.round(p.winRate * 1000) / 10,
                      n: p.sampleSize,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#71717a" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#71717a" }} domain={[0, 100]} />
                    <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 11 }} />
                    <Bar dataKey="confidence" fill="#06b6d4" name="Confidence" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </SectionCard>

              <SectionCard title="Confidence Distribution across all patterns">
                {evidenceData?.hasData && (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={Object.entries(evidenceData.confidenceBuckets ?? {}).map(([label, count]) => ({ label, count }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#71717a" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#71717a" }} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 11 }} />
                      <Bar dataKey="count" fill="#8b5cf6" name="# Patterns" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </SectionCard>

              <SectionCard title="Top 5 by Expectancy">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={(statsData.topByExpectancy ?? []).map(p => ({
                      name: p.description.length > 28 ? p.description.slice(0, 26) + "…" : p.description,
                      expectancy: Math.round(p.expectancy * 10000) / 10000,
                      n: p.sampleSize,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#71717a" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#71717a" }} />
                    <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 11 }} />
                    <Bar dataKey="expectancy" fill="#f59e0b" name="Expectancy" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </SectionCard>
            </>
          ) : <NoDataPlaceholder />}
        </div>
      )}

      {/* ── Evidence Counts Tab ─────────────────────────────────────────────── */}
      {tab === "evidence" && (
        <div className="flex flex-col gap-6">
          {evidenceData?.hasData ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total Patterns", value: evidenceData.totalPatterns ?? 0, color: "text-zinc-200" },
                  { label: "Sufficient Evidence", value: evidenceData.sufficientPatterns ?? 0, color: "text-green-400" },
                  { label: "Insufficient Evidence", value: evidenceData.insufficientPatterns ?? 0, color: "text-amber-400" },
                ].map(c => (
                  <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                    <div className="text-xs text-zinc-500 font-mono">{c.label}</div>
                    <div className={`text-2xl font-bold font-mono mt-1 ${c.color}`}>{c.value}</div>
                  </div>
                ))}
              </div>

              <SectionCard title="Sample Size Distribution">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={Object.entries(evidenceData.sampleSizeBuckets ?? {}).map(([label, count]) => ({ label, count }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#71717a" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#71717a" }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 11 }} />
                    <Bar dataKey="count" fill="#10b981" name="# Patterns" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </SectionCard>

              <SectionCard title="Evidence by Category">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        {["Category", "Total", "Sufficient", "Avg Sample", "Avg Confidence"].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-zinc-500 font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(evidenceData.byCategoryEvidence ?? {}).map(([cat, ev]) => (
                        <tr key={cat} className="border-b border-zinc-800/50">
                          <td className="px-3 py-1.5 text-zinc-400">{cat}</td>
                          <td className="px-3 py-1.5 text-zinc-300">{ev.total}</td>
                          <td className="px-3 py-1.5 text-green-400">{ev.sufficient}</td>
                          <td className="px-3 py-1.5 text-zinc-300">{ev.avgSampleSize}</td>
                          <td className="px-3 py-1.5 text-zinc-300">{ev.avgConfidence.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </>
          ) : <NoDataPlaceholder />}
        </div>
      )}

      {/* ── Trends Tab ──────────────────────────────────────────────────────── */}
      {tab === "trends" && (
        <div className="flex flex-col gap-6">
          {trendsData?.trends && trendsData.trends.length > 0 ? (
            <>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Improving", value: trendsData.improving, color: "text-green-400" },
                  { label: "Stable", value: trendsData.stable, color: "text-yellow-400" },
                  { label: "Declining", value: trendsData.declining, color: "text-red-400" },
                  { label: "Insufficient", value: trendsData.insufficient, color: "text-zinc-500" },
                ].map(c => (
                  <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                    <div className="text-xs text-zinc-500 font-mono">{c.label}</div>
                    <div className={`text-2xl font-bold font-mono mt-1 ${c.color}`}>{c.value}</div>
                  </div>
                ))}
              </div>

              <SectionCard title="Win Rate — Last 30 vs Last 100 Trades">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart
                    data={trendsData.trends
                      .filter(t => !t.isInsufficient && t.winRate30 !== null && t.winRate100 !== null)
                      .slice(0, 15)
                      .map(t => ({
                        name: t.description.length > 20 ? t.description.slice(0, 18) + "…" : t.description,
                        last30: Math.round((t.winRate30 ?? 0) * 1000) / 10,
                        last100: Math.round((t.winRate100 ?? 0) * 1000) / 10,
                      }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#71717a" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#71717a" }} unit="%" domain={[0, 100]} />
                    <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="last30" fill="#10b981" name="Last 30" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="last100" fill="#6366f1" name="Last 100" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </SectionCard>

              <SectionCard title="Trend Direction by Pattern">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        {["Pattern", "Direction", "Confidence", "30-trade WR", "100-trade WR", "Explanation"].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-zinc-500 font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trendsData.trends.filter(t => !t.isInsufficient).map(t => (
                        <tr key={t.id} className="border-b border-zinc-800/50">
                          <td className="px-3 py-1.5 text-zinc-300">{t.description}</td>
                          <td className="px-3 py-1.5"><TrendBadge direction={t.direction} /></td>
                          <td className="px-3 py-1.5 text-zinc-400">{t.directionConfidence}%</td>
                          <td className="px-3 py-1.5 text-zinc-300">{t.winRate30 !== null ? fmtPct(t.winRate30) : "—"}</td>
                          <td className="px-3 py-1.5 text-zinc-300">{t.winRate100 !== null ? fmtPct(t.winRate100) : "—"}</td>
                          <td className="px-3 py-1.5 text-zinc-500 max-w-xs truncate">{t.explanation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </>
          ) : <NoDataPlaceholder />}
        </div>
      )}

      {/* ── Breakdown Tab ───────────────────────────────────────────────────── */}
      {tab === "breakdown" && (
        <div className="flex flex-col gap-6">
          {statsData?.hasData ? (
            <>
              {["pair", "session", "regime", "zone_quality", "liquidity", "amd", "confirmation", "volatility", "risk_profile"].map(cat => {
                const catPatterns = patterns.filter(p => p.category === cat && !p.evidence.isInsufficient);
                if (catPatterns.length === 0) return null;
                return (
                  <SectionCard key={cat} title={`${cat.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} Performance`}>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart
                        data={catPatterns.map(p => ({
                          name: p.key,
                          winRate: Math.round(p.winRate * 1000) / 10,
                          confidence: Math.round(p.confidence * 10) / 10,
                          n: p.sampleSize,
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#71717a" }} />
                        <YAxis tick={{ fontSize: 10, fill: "#71717a" }} unit="%" domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 11 }}
                          formatter={(v, name, props) => [
                            name === "winRate" ? `${v}% (n=${props.payload?.n})` : `${v}`,
                            name === "winRate" ? "Win Rate" : "Confidence",
                          ]}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="winRate" fill="#10b981" name="Win Rate" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="confidence" fill="#6366f1" name="Confidence" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </SectionCard>
                );
              })}
            </>
          ) : <NoDataPlaceholder />}
        </div>
      )}
    </div>
  );
}

// ─── Utility Components ───────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-xs font-mono text-zinc-400 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function NoDataPlaceholder() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-zinc-500">
      <AlertCircle className="w-8 h-8" />
      <div className="text-sm font-mono">No pattern data yet</div>
      <div className="text-xs">Run a learning cycle then click "Run Analysis" to populate the pattern knowledge base.</div>
    </div>
  );
}
