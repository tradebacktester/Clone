import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ScatterChart, Scatter, Cell, ReferenceLine,
} from "recharts";
import {
  Activity, AlertTriangle, CheckCircle2, XCircle,
  TrendingUp, TrendingDown, BarChart3, Shield, GitBranch,
  RefreshCw, ChevronDown, ChevronUp, Loader2, Clock,
  Zap, ArrowUpDown, Info, Target, Layers,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "";

function apiFetch(path: string) {
  return fetch(`${API}/api${path}`).then(r => r.json());
}

function apiPost(path: string, body?: unknown) {
  return fetch(`${API}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json());
}

// ─── Shared Components ────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, color = "text-white",
  icon: Icon, trend,
}: {
  label: string; value: string | number; sub?: string;
  color?: string; icon?: React.ElementType; trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{label}</span>
        {Icon && <Icon className="w-4 h-4 text-gray-500" />}
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {sub && (
        <div className="flex items-center gap-1 text-xs text-gray-500">
          {trend === "up" && <TrendingUp className="w-3 h-3 text-green-400" />}
          {trend === "down" && <TrendingDown className="w-3 h-3 text-red-400" />}
          {sub}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
    </div>
  );
}

function StatusPill({ status, size = "sm" }: { status: string; size?: "sm" | "xs" }) {
  const colors: Record<string, string> = {
    well_calibrated: "bg-green-500/20 text-green-400 border-green-500/30",
    overconfident:   "bg-red-500/20 text-red-400 border-red-500/30",
    underconfident:  "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    mixed:           "bg-orange-500/20 text-orange-400 border-orange-500/30",
    uncalibrated:    "bg-gray-500/20 text-gray-400 border-gray-500/30",
    improving:       "bg-green-500/20 text-green-400 border-green-500/30",
    stable:          "bg-blue-500/20 text-blue-400 border-blue-500/30",
    degrading:       "bg-red-500/20 text-red-400 border-red-500/30",
    passed:          "bg-green-500/20 text-green-400 border-green-500/30",
    degraded:        "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    failed:          "bg-red-500/20 text-red-400 border-red-500/30",
    critical:        "bg-red-500/20 text-red-400 border-red-500/30",
    high:            "bg-orange-500/20 text-orange-400 border-orange-500/30",
    medium:          "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    low:             "bg-blue-500/20 text-blue-400 border-blue-500/30",
    improved:        "bg-green-500/20 text-green-400 border-green-500/30",
    A: "bg-green-500/20 text-green-400 border-green-500/30",
    B: "bg-teal-500/20 text-teal-400 border-teal-500/30",
    C: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    D: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    F: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  const cls = colors[status] ?? "bg-gray-500/20 text-gray-400 border-gray-500/30";
  return (
    <span className={`inline-flex items-center border rounded px-2 py-0.5 font-medium ${size === "xs" ? "text-xs" : "text-xs"} ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─── Tab: Calibration ─────────────────────────────────────────────────────────

function CalibrationTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["enhancement-calibration"],
    queryFn: () => apiFetch("/learning/enhancement/calibration"),
    refetchInterval: 60_000,
  });
  const { data: history } = useQuery({
    queryKey: ["enhancement-calibration-history"],
    queryFn: () => apiFetch("/learning/enhancement/calibration/history"),
  });

  const runMutation = useMutation({
    mutationFn: (window: string) => apiPost("/learning/enhancement/run-calibration", { window }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["enhancement-calibration"] });
      qc.invalidateQueries({ queryKey: ["enhancement-calibration-history"] });
    },
  });

  const cal = data?.data?.live;
  const buckets = cal?.buckets ?? [];

  // Reliability diagram data
  const diagramData = buckets
    .filter((b: Record<string, unknown>) => b.status !== "empty")
    .map((b: Record<string, unknown>) => ({
      label: b.bucketLabel,
      predicted: Math.round(Number(b.predictedAvg) * 100),
      actual: Math.round(Number(b.actualRate) * 100),
      count: b.count,
      error: Math.round(Number(b.calibrationError) * 100),
      status: b.status,
    }));

  // Colors per bucket status
  const bucketColor = (status: string) =>
    status === "well_calibrated" ? "#22c55e" : status === "overconfident" ? "#ef4444" : "#eab308";

  const histData = (history?.data ?? []).slice(0, 20).reverse().map((h: Record<string, unknown>, i: number) => ({
    idx: i + 1,
    ece: Math.round(Number(h.ece) * 1000) / 10,
    brier: Math.round(Number(h.brierScore) * 1000) / 10,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader
          title="Confidence Calibration Engine"
          desc="Verifies whether confidence scores accurately reflect actual trade outcomes. Advisory only."
        />
        <div className="flex gap-2">
          {["7d", "30d", "all"].map(w => (
            <button
              key={w}
              onClick={() => runMutation.mutate(w)}
              disabled={runMutation.isPending}
              className="px-3 py-1.5 text-xs bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-600/30 disabled:opacity-50"
            >
              {runMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : `Run ${w}`}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading calibration data…
        </div>
      ) : cal ? (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard
              label="Calibration Grade" value={cal.calibrationGrade ?? "—"}
              icon={Target}
              color={cal.calibrationGrade === "A" ? "text-green-400" : cal.calibrationGrade === "B" ? "text-teal-400" : "text-red-400"}
            />
            <MetricCard
              label="ECE" value={`${(Number(cal.ece) * 100).toFixed(1)}%`}
              sub="Expected Calibration Error (lower = better)" icon={Activity}
              color={Number(cal.ece) < 0.05 ? "text-green-400" : Number(cal.ece) < 0.10 ? "text-yellow-400" : "text-red-400"}
            />
            <MetricCard
              label="Brier Score" value={Number(cal.brierScore).toFixed(3)}
              sub="0=perfect, 0.25=random, 1=worst" icon={BarChart3}
              color={Number(cal.brierScore) < 0.15 ? "text-green-400" : Number(cal.brierScore) < 0.22 ? "text-yellow-400" : "text-red-400"}
            />
            <MetricCard
              label="MCE" value={`${(Number(cal.mce) * 100).toFixed(1)}%`}
              sub="Maximum Calibration Error" icon={AlertTriangle}
              color={Number(cal.mce) < 0.10 ? "text-green-400" : "text-red-400"}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Well Calibrated Buckets" value={cal.wellCalibratedBuckets ?? 0} icon={CheckCircle2} color="text-green-400" />
            <MetricCard label="Overconfident Buckets" value={cal.overconfidentBuckets ?? 0} icon={TrendingUp} color="text-red-400" />
            <MetricCard label="Underconfident Buckets" value={cal.underconfidentBuckets ?? 0} icon={TrendingDown} color="text-yellow-400" />
          </div>

          {/* Status and Summary */}
          <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-white">Status</span>
                  <StatusPill status={cal.calibrationStatus ?? "uncalibrated"} />
                  <StatusPill status={cal.calibrationTrend ?? "stable"} />
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">{cal.summary}</p>
              </div>
              <div className="text-right text-xs text-gray-500">
                <div>n={cal.totalSamples}</div>
              </div>
            </div>
          </div>

          {/* Reliability Diagram */}
          {diagramData.length > 0 && (
            <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-white mb-3">Reliability Diagram</h4>
              <p className="text-xs text-gray-400 mb-4">Ideal calibration: predicted confidence = actual win rate (bars on the diagonal). Red = overconfident, Yellow = underconfident, Green = well calibrated.</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={diagramData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} domain={[0, 100]} unit="%" />
                  <Tooltip
                    contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                    labelStyle={{ color: "#f9fafb", fontSize: 11 }}
                    formatter={(v: number, name: string) => [`${v}%`, name === "predicted" ? "Predicted" : "Actual"]}
                  />
                  <Legend />
                  <ReferenceLine y={50} stroke="#6b7280" strokeDasharray="4 4" label={{ value: "Perfect", position: "right", fill: "#6b7280", fontSize: 10 }} />
                  <Bar dataKey="predicted" name="Predicted" fill="#3b82f6" radius={[2, 2, 0, 0]}>
                    {diagramData.map((d: Record<string, unknown>, i: number) => (
                      <Cell key={i} fill={bucketColor(d.status as string)} />
                    ))}
                  </Bar>
                  <Bar dataKey="actual" name="Actual" fill="#6b7280" opacity={0.6} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Calibration Trend */}
          {histData.length > 1 && (
            <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-white mb-3">Calibration Trend</h4>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={histData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="idx" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
                  <Legend />
                  <Line dataKey="ece" name="ECE %" stroke="#ef4444" dot={false} strokeWidth={2} />
                  <Line dataKey="brier" name="Brier ×100" stroke="#f59e0b" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      ) : (
        <div className="text-center text-gray-500 py-12">No calibration data yet. Run a calibration above.</div>
      )}
    </div>
  );
}

// ─── Tab: Regime Transitions ──────────────────────────────────────────────────

function RegimeTab() {
  const qc = useQueryClient();
  const { data: transitions, isLoading } = useQuery({
    queryKey: ["regime-transitions"],
    queryFn: () => apiFetch("/learning/enhancement/regime/transitions"),
    refetchInterval: 60_000,
  });
  const { data: state } = useQuery({
    queryKey: ["regime-state"],
    queryFn: () => apiFetch("/learning/enhancement/regime/state"),
    refetchInterval: 60_000,
  });

  const runMutation = useMutation({
    mutationFn: () => apiPost("/learning/enhancement/run-regime-analysis"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["regime-transitions"] });
      qc.invalidateQueries({ queryKey: ["regime-state"] });
    },
  });

  const regimeState = state?.data?.state;
  const transitionList: Record<string, unknown>[] = transitions?.data?.transitions ?? [];
  const history: Record<string, unknown>[] = transitions?.data?.history ?? [];

  const REGIME_COLOR: Record<string, string> = {
    trending: "#22c55e",
    ranging: "#3b82f6",
    volatile: "#ef4444",
    low_volatility: "#8b5cf6",
    expansion: "#f59e0b",
    compression: "#6b7280",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader
          title="Market Regime Transition Detection"
          desc="Statistical detection of regime transitions using Hurst exponent, CUSUM, ATR, and volatility analysis. Advisory only."
        />
        <button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="px-3 py-1.5 text-xs bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded hover:bg-purple-600/30 disabled:opacity-50 flex items-center gap-1"
        >
          {runMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          Analyze Now
        </button>
      </div>

      {/* Current Regime State */}
      {regimeState && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 col-span-2 md:col-span-1">
            <div className="text-xs text-gray-400 mb-1">Current Regime</div>
            <div className="text-xl font-bold" style={{ color: REGIME_COLOR[regimeState.currentRegime] ?? "#fff" }}>
              {(regimeState.currentRegime as string).replace("_", " ").toUpperCase()}
            </div>
            <div className="text-xs text-gray-400 mt-1">Confidence: {regimeState.regimeConfidence}%</div>
          </div>
          <MetricCard label="Hurst Exponent" value={Number(regimeState.hurstExponent).toFixed(3)}
            sub={Number(regimeState.hurstExponent) > 0.55 ? "Trending" : Number(regimeState.hurstExponent) < 0.45 ? "Mean-reverting" : "Random walk"}
            icon={Activity}
            color={Number(regimeState.hurstExponent) > 0.55 ? "text-green-400" : Number(regimeState.hurstExponent) < 0.45 ? "text-blue-400" : "text-gray-400"}
          />
          <MetricCard label="Trend Strength (ADX)" value={`${Number(regimeState.trendStrength).toFixed(0)}/100`}
            icon={TrendingUp}
            color={Number(regimeState.trendStrength) > 40 ? "text-green-400" : "text-gray-400"}
          />
          <MetricCard label="Rolling Volatility" value={`${(Number(regimeState.rollingVolatility) * 100).toFixed(1)}%`}
            icon={BarChart3}
            color={Number(regimeState.rollingVolatility) > 0.3 ? "text-red-400" : "text-blue-400"}
          />
        </div>
      )}

      {/* Transition History */}
      {isLoading ? (
        <div className="flex items-center justify-center h-20 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
        </div>
      ) : transitionList.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-white">Transition History</h4>
          {transitionList.map((t: Record<string, unknown>) => (
            <div key={t.transitionId as string} className="bg-gray-800/40 border border-gray-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: REGIME_COLOR[(t.fromRegime as string)] }}>
                    {(t.fromRegime as string).replace("_", " ")}
                  </span>
                  <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  <span className="text-sm font-semibold" style={{ color: REGIME_COLOR[(t.toRegime as string)] }}>
                    {(t.toRegime as string).replace("_", " ")}
                  </span>
                  <StatusPill status={t.transitionType as string} size="xs" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{new Date(t.detectedAt as string).toLocaleDateString()}</span>
                  {t.confirmed ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                  ) : (
                    <Clock className="w-4 h-4 text-yellow-400" />
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-300 mb-2">{t.description as string}</p>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>Confidence: {t.transitionConfidence as number}%</span>
                <span>ATR Δ: {Number(t.atrChangePct).toFixed(1)}%</span>
                <span>Hurst: {Number(t.hurstBefore).toFixed(2)} → {Number(t.hurstAfter).toFixed(2)}</span>
              </div>
              {(t.evidence as string[])?.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {(t.evidence as string[]).map((e, i) => (
                    <li key={i} className="text-xs text-gray-400">• {e}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-8 text-center">
          <Layers className="w-8 h-8 text-gray-600 mx-auto mb-2" />
          <div className="text-sm text-gray-400">No regime transitions detected yet.</div>
          <div className="text-xs text-gray-500 mt-1">Click "Analyze Now" to run regime transition detection.</div>
        </div>
      )}

      {/* Regime Timeline */}
      {history.length > 0 && (
        <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-white mb-3">Regime Timeline</h4>
          <div className="flex gap-1 h-8 rounded overflow-hidden">
            {history.map((h: Record<string, unknown>, i: number) => (
              <div
                key={i}
                title={`${h.regime}: ${Number(h.durationDays).toFixed(0)}d (${h.regimeConfidence}% conf)`}
                style={{
                  flex: Math.max(1, Number(h.durationDays)),
                  background: REGIME_COLOR[(h.regime as string)] ?? "#6b7280",
                  opacity: 0.8,
                }}
                className="rounded cursor-pointer hover:opacity-100"
              />
            ))}
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {Object.entries(REGIME_COLOR).map(([r, c]) => (
              <div key={r} className="flex items-center gap-1 text-xs text-gray-400">
                <div className="w-2 h-2 rounded" style={{ background: c }} />
                {r.replace("_", " ")}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Versions ────────────────────────────────────────────────────────────

function VersionsTab() {
  const qc = useQueryClient();
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [comparison, setComparison] = useState<Record<string, unknown> | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);

  const { data: versions, isLoading } = useQuery({
    queryKey: ["learning-versions"],
    queryFn: () => apiFetch("/learning/enhancement/versions"),
  });
  const { data: changelog } = useQuery({
    queryKey: ["versions-changelog"],
    queryFn: () => apiFetch("/learning/enhancement/versions/changelog"),
    enabled: showChangelog,
  });

  const createMutation = useMutation({
    mutationFn: (opts: { versionTag?: string; changelogNotes?: string }) =>
      apiPost("/learning/enhancement/create-version", opts),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["learning-versions"] }),
  });

  const compareMutation = useMutation({
    mutationFn: () => apiPost("/learning/enhancement/versions/compare", { versionAId: compareA, versionBId: compareB }),
    onSuccess: (data) => setComparison(data?.data ?? null),
  });

  const versionList: Record<string, unknown>[] = versions?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader
          title="Learning Version Control"
          desc="Semantic versioning for every learning cycle. Track, compare, and audit system evolution. Advisory only."
        />
        <div className="flex gap-2">
          <button
            onClick={() => createMutation.mutate({ versionTag: "manual" })}
            disabled={createMutation.isPending}
            className="px-3 py-1.5 text-xs bg-green-600/20 text-green-400 border border-green-500/30 rounded hover:bg-green-600/30 disabled:opacity-50 flex items-center gap-1"
          >
            {createMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitBranch className="w-3 h-3" />}
            Create Version
          </button>
          <button
            onClick={() => setShowChangelog(v => !v)}
            className="px-3 py-1.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
          >
            {showChangelog ? "Hide" : "Show"} Changelog
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-20 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
        </div>
      ) : versionList.length === 0 ? (
        <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-8 text-center">
          <GitBranch className="w-8 h-8 text-gray-600 mx-auto mb-2" />
          <div className="text-sm text-gray-400">No versions created yet.</div>
          <div className="text-xs text-gray-500 mt-1">Click "Create Version" to snapshot the current learning state.</div>
        </div>
      ) : (
        <>
          {/* Version List */}
          <div className="space-y-2">
            {versionList.map((v: Record<string, unknown>) => (
              <div key={v.versionId as string} className={`bg-gray-800/40 border rounded-xl p-4 ${v.isActive ? "border-blue-500/40" : "border-gray-700"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold font-mono text-blue-400">{v.semver as string}</span>
                    {v.isActive && <StatusPill status="stable" size="xs" />}
                    {v.isBaseline && <span className="text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded px-1.5 py-0.5">baseline</span>}
                    {v.versionTag && <span className="text-xs text-gray-500">{v.versionTag as string}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{v.tradeCount as number} trades</span>
                    <span>{new Date(v.createdAt as string).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3 mt-3">
                  <div className="text-xs">
                    <div className="text-gray-400">Win Rate</div>
                    <div className="text-white font-semibold">{(Number(v.winRate) * 100).toFixed(1)}%</div>
                  </div>
                  <div className="text-xs">
                    <div className="text-gray-400">Confidence</div>
                    <div className="text-white font-semibold">{Number(v.avgConfidence).toFixed(0)}/100</div>
                  </div>
                  <div className="text-xs">
                    <div className="text-gray-400">Health</div>
                    <div className="text-white font-semibold">{Number(v.healthScore).toFixed(0)} ({v.healthGrade as string})</div>
                  </div>
                  <div className="text-xs">
                    <div className="text-gray-400">Validation</div>
                    <StatusPill status={v.validationStatus as string} size="xs" />
                  </div>
                </div>
                {v.changeFromPrev && (
                  <div className="mt-2 text-xs text-gray-400 border-t border-gray-700 pt-2">
                    {(v.changeFromPrev as Record<string, unknown>).summary as string}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Version Comparison */}
          {versionList.length >= 2 && (
            <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-white mb-3">Version Comparison</h4>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 mb-1 block">From Version</label>
                  <select
                    value={compareA}
                    onChange={e => setCompareA(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 text-white text-xs rounded px-2 py-1.5"
                  >
                    <option value="">Select…</option>
                    {versionList.map((v: Record<string, unknown>) => (
                      <option key={v.versionId as string} value={v.versionId as string}>{v.semver as string}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-400 mb-1 block">To Version</label>
                  <select
                    value={compareB}
                    onChange={e => setCompareB(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 text-white text-xs rounded px-2 py-1.5"
                  >
                    <option value="">Select…</option>
                    {versionList.map((v: Record<string, unknown>) => (
                      <option key={v.versionId as string} value={v.versionId as string}>{v.semver as string}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => compareMutation.mutate()}
                  disabled={!compareA || !compareB || compareMutation.isPending}
                  className="px-3 py-1.5 text-xs bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded disabled:opacity-50"
                >
                  {compareMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Compare"}
                </button>
              </div>

              {comparison && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <StatusPill status={comparison.overallImpact as string} />
                    <StatusPill status={comparison.changeType as string} />
                    {comparison.breakingChanges && <StatusPill status="critical" />}
                  </div>
                  <p className="text-xs text-gray-300">{comparison.summary as string}</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Win Rate Δ", value: `${(Number(comparison.winRateDelta) * 100) > 0 ? "+" : ""}${(Number(comparison.winRateDelta) * 100).toFixed(1)}pp` },
                      { label: "Health Δ", value: `${Number(comparison.healthScoreDelta) > 0 ? "+" : ""}${Number(comparison.healthScoreDelta).toFixed(0)} pts` },
                      { label: "Trade Count Δ", value: `+${comparison.tradeCountDelta as number}` },
                    ].map(m => (
                      <div key={m.label} className="text-xs bg-gray-900/50 rounded p-2">
                        <div className="text-gray-400">{m.label}</div>
                        <div className="text-white font-semibold">{m.value}</div>
                      </div>
                    ))}
                  </div>
                  {(comparison.recommendations as string[])?.length > 0 && (
                    <ul className="space-y-1">
                      {(comparison.recommendations as string[]).map((r, i) => (
                        <li key={i} className="text-xs text-gray-300">• {r}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Changelog */}
          {showChangelog && changelog?.data?.changelog && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
              <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                {changelog.data.changelog}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Tab: Quality Monitor ─────────────────────────────────────────────────────

function QualityTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["quality-snapshot"],
    queryFn: () => apiFetch("/learning/enhancement/quality"),
    refetchInterval: 60_000,
  });
  const { data: alerts } = useQuery({
    queryKey: ["quality-alerts"],
    queryFn: () => apiFetch("/learning/enhancement/quality/alerts"),
    refetchInterval: 30_000,
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/learning/enhancement/quality/alerts/${id}/resolve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quality-alerts"] }),
  });

  const snapshot = data?.data;
  const alertList: Record<string, unknown>[] = alerts?.data ?? [];

  const SCEV: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };
  const sortedAlerts = [...alertList].sort((a, b) => (SCEV[b.severity as string] ?? 0) - (SCEV[a.severity as string] ?? 0));

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Learning Quality Monitor"
        desc="8-dimension quality score for the learning system. Generates advisory-only alerts for the operator."
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-20 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
        </div>
      ) : snapshot ? (
        <>
          {/* Quality Score Ring */}
          <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-6">
            <div className="flex items-center gap-8">
              <div className="text-center">
                <div className="text-5xl font-bold" style={{
                  color: snapshot.qualityScore >= 70 ? "#22c55e" : snapshot.qualityScore >= 55 ? "#eab308" : "#ef4444"
                }}>
                  {snapshot.qualityScore}
                </div>
                <div className="text-xs text-gray-400 mt-1">Quality Score</div>
                <StatusPill status={snapshot.qualityGrade} />
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2">
                {(snapshot.dimensions as Record<string, unknown>[])?.map((d: Record<string, unknown>) => (
                  <div key={d.name as string} className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 truncate">{d.name as string}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${d.score as number}%`,
                            background: (d.score as number) >= 70 ? "#22c55e" : (d.score as number) >= 55 ? "#eab308" : "#ef4444",
                          }}
                        />
                      </div>
                      <span className="text-xs font-mono" style={{
                        color: (d.score as number) >= 70 ? "#22c55e" : (d.score as number) >= 55 ? "#eab308" : "#ef4444"
                      }}>
                        {d.score as number}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Total Trades" value={snapshot.totalTrades ?? 0} icon={Activity} />
            <MetricCard label="Missing Features" value={snapshot.missingFeatures ?? 0}
              icon={AlertTriangle} color={(snapshot.missingFeatures ?? 0) > 0 ? "text-red-400" : "text-green-400"} />
            <MetricCard label="Duplicate Records" value={snapshot.duplicateRecords ?? 0}
              icon={XCircle} color={(snapshot.duplicateRecords ?? 0) > 0 ? "text-red-400" : "text-green-400"} />
          </div>

          {/* Alert Center */}
          <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                Alert Center
                {snapshot.criticalAlerts > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{snapshot.criticalAlerts}</span>
                )}
              </h4>
              <span className="text-xs text-gray-500">{sortedAlerts.length} active alert{sortedAlerts.length !== 1 ? "s" : ""}</span>
            </div>

            {sortedAlerts.length === 0 ? (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <CheckCircle2 className="w-4 h-4" /> No active quality alerts
              </div>
            ) : (
              <div className="space-y-2">
                {sortedAlerts.slice(0, 10).map((alert: Record<string, unknown>) => (
                  <div key={alert.alertId as string} className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusPill status={alert.severity as string} size="xs" />
                          <span className="text-xs font-semibold text-white">{alert.title as string}</span>
                        </div>
                        <p className="text-xs text-gray-400">{alert.description as string}</p>
                        <p className="text-xs text-blue-400 mt-1">→ {alert.recommendation as string}</p>
                      </div>
                      <button
                        onClick={() => resolveMutation.mutate(alert.alertId as string)}
                        className="ml-3 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded px-2 py-0.5"
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Strengths/Weaknesses */}
          {((snapshot.strengths as string[])?.length > 0 || (snapshot.weaknesses as string[])?.length > 0) && (
            <div className="grid grid-cols-2 gap-4">
              {(snapshot.strengths as string[])?.length > 0 && (
                <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
                  <h5 className="text-xs font-semibold text-green-400 mb-2 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Strengths
                  </h5>
                  {(snapshot.strengths as string[]).map((s, i) => (
                    <div key={i} className="text-xs text-gray-300 mb-1">• {s}</div>
                  ))}
                </div>
              )}
              {(snapshot.weaknesses as string[])?.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                  <h5 className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Weaknesses
                  </h5>
                  {(snapshot.weaknesses as string[]).map((w, i) => (
                    <div key={i} className="text-xs text-gray-300 mb-1">• {w}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="text-center text-gray-500 py-12">No quality snapshot available.</div>
      )}
    </div>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["enhancement-overview"],
    queryFn: () => apiFetch("/learning/enhancement/overview"),
    refetchInterval: 60_000,
  });

  const d = data?.data;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Learning System Enhancement — Overview"
        desc="4-component enhancement dashboard: Calibration, Regime Transitions, Versioning, Quality. Advisory only."
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-24 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading overview…
        </div>
      ) : d ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard
              label="Calibration Grade"
              value={d.calibration?.calibrationGrade ?? "—"}
              sub={d.calibration?.calibrationStatus?.replace(/_/g, " ")}
              icon={Target}
              color={d.calibration?.calibrationGrade === "A" ? "text-green-400" : d.calibration?.calibrationGrade === "B" ? "text-teal-400" : "text-red-400"}
            />
            <MetricCard
              label="Current Regime"
              value={(d.regimeState?.currentRegime ?? "—").replace(/_/g, " ")}
              sub={`${d.regimeState?.regimeConfidence ?? 0}% confidence`}
              icon={Activity}
            />
            <MetricCard
              label="Quality Score"
              value={`${d.qualityScore ?? 0}/100`}
              sub={`Grade ${d.qualityGrade ?? "—"}`}
              icon={Shield}
              color={(d.qualityScore ?? 0) >= 70 ? "text-green-400" : (d.qualityScore ?? 0) >= 55 ? "text-yellow-400" : "text-red-400"}
            />
            <MetricCard
              label="Active Version"
              value={d.activeVersion?.semver ?? "None"}
              sub={`${d.versionCount ?? 0} total versions`}
              icon={GitBranch}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-white mb-3">Calibration Summary</h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-400">Brier Score</span><span className="text-white">{Number(d.calibration?.brierScore ?? 0).toFixed(3)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">ECE</span><span className="text-white">{(Number(d.calibration?.ece ?? 0) * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Status</span><StatusPill status={d.calibration?.calibrationStatus ?? "uncalibrated"} size="xs" /></div>
                <div className="flex justify-between"><span className="text-gray-400">Samples</span><span className="text-white">{d.calibration?.totalSamples ?? 0}</span></div>
              </div>
            </div>

            <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-white mb-3">System Status</h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-400">Feature Count</span><span className="text-white">{d.featureCount ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Active Alerts</span>
                  <span className={(d.activeAlertCount ?? 0) > 0 ? "text-red-400" : "text-green-400"}>{d.activeAlertCount ?? 0}</span>
                </div>
                <div className="flex justify-between"><span className="text-gray-400">Hurst Exponent</span><span className="text-white">{Number(d.regimeState?.hurstExponent ?? 0.5).toFixed(3)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Trend Strength</span><span className="text-white">{Number(d.regimeState?.trendStrength ?? 0).toFixed(0)}/100</span></div>
              </div>
            </div>
          </div>

          <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-gray-300 leading-relaxed">
                <strong className="text-blue-400">Advisory only.</strong> All four enhancement engines (Calibration, Regime Transitions, Versioning, Quality) are monitoring and reporting systems. They do not modify trading parameters, risk settings, execution behavior, or learning methodology.
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center text-gray-500 py-12">No overview data yet.</div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",     label: "Overview",    icon: Shield },
  { id: "calibration",  label: "Calibration", icon: Target },
  { id: "regime",       label: "Regime",      icon: Activity },
  { id: "versions",     label: "Versions",    icon: GitBranch },
  { id: "quality",      label: "Quality",     icon: BarChart3 },
] as const;

type TabId = typeof TABS[number]["id"];

export default function LearningEnhancementPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-400" />
            Learning System Enhancement
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Reliability, Versioning & Calibration — institutional-grade monitoring. Advisory only.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800/40 p-1 rounded-xl border border-gray-700">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all flex-1 justify-center ${
                activeTab === tab.id
                  ? "bg-gray-700 text-white shadow"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === "overview"    && <OverviewTab />}
        {activeTab === "calibration" && <CalibrationTab />}
        {activeTab === "regime"      && <RegimeTab />}
        {activeTab === "versions"    && <VersionsTab />}
        {activeTab === "quality"     && <QualityTab />}
      </div>
    </div>
  );
}
