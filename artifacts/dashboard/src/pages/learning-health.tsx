import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, Activity, AlertTriangle, CheckCircle, XCircle,
  Clock, TrendingUp, TrendingDown, BarChart3, Cpu,
  RefreshCw, Play, ChevronDown, ChevronUp, Info,
  Award, Zap, Database, Target, Eye, Calendar,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTip,
  ResponsiveContainer, Cell,
} from "recharts";

const API = (path: string) => path;

// ─── Fetch helpers ────────────────────────────────────────────────────────────

function useLearningHealth() {
  return useQuery({
    queryKey: ["learning-health"],
    queryFn: () => fetch(API("/api/learning/health")).then(r => r.json()),
    refetchInterval: 60_000,
  });
}

function useLearningDrift() {
  return useQuery({
    queryKey: ["learning-drift"],
    queryFn: () => fetch(API("/api/learning/drift")).then(r => r.json()),
    refetchInterval: 60_000,
  });
}

function useLearningValidation() {
  return useQuery({
    queryKey: ["learning-validation"],
    queryFn: () => fetch(API("/api/learning/validation")).then(r => r.json()),
    refetchInterval: 120_000,
  });
}

function useLearningCertification() {
  return useQuery({
    queryKey: ["learning-certification"],
    queryFn: () => fetch(API("/api/learning/certification")).then(r => r.json()),
    refetchInterval: 120_000,
  });
}

function useLearningReports() {
  return useQuery({
    queryKey: ["learning-reports"],
    queryFn: () => fetch(API("/api/learning/reports")).then(r => r.json()),
    refetchInterval: 120_000,
  });
}

function useHealthHistory() {
  return useQuery({
    queryKey: ["learning-health-history"],
    queryFn: () => fetch(API("/api/learning/health/history?limit=30")).then(r => r.json()),
    refetchInterval: 300_000,
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 85) return "text-emerald-400";
  if (score >= 70) return "text-green-400";
  if (score >= 55) return "text-yellow-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 85) return "bg-emerald-500/20 border-emerald-500/40";
  if (score >= 70) return "bg-green-500/20 border-green-500/40";
  if (score >= 55) return "bg-yellow-500/20 border-yellow-500/40";
  if (score >= 40) return "bg-orange-500/20 border-orange-500/40";
  return "bg-red-500/20 border-red-500/40";
}

function gradeColor(g: string): string {
  return { A: "text-emerald-400", B: "text-green-400", C: "text-yellow-400", D: "text-orange-400", F: "text-red-400" }[g] ?? "text-gray-400";
}

function severityColor(s: string) {
  return { critical: "bg-red-500/20 text-red-400 border-red-500/40", high: "bg-orange-500/20 text-orange-400 border-orange-500/40", medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40", low: "bg-blue-500/20 text-blue-400 border-blue-500/40" }[s] ?? "bg-gray-500/20 text-gray-400";
}

function certColor(s: string) {
  return { certified: "text-emerald-400", conditional: "text-yellow-400", not_ready: "text-red-400" }[s] ?? "text-gray-400";
}

function certBadge(s: string) {
  return { certified: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40", conditional: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40", not_ready: "bg-red-500/20 text-red-400 border-red-500/40" }[s] ?? "bg-gray-500/20 text-gray-400";
}

function fmt(v: unknown, decimals = 1): string {
  const n = Number(v);
  return isNaN(n) ? "—" : n.toFixed(decimals);
}

function pct(v: unknown): string {
  const n = Number(v);
  return isNaN(n) ? "—" : `${(n * 100).toFixed(1)}%`;
}

// ─── Health Score Ring ────────────────────────────────────────────────────────

function HealthRing({ score, grade, size = 120 }: { score: number; grade: string; size?: number }) {
  const r = size / 2 - 10;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  const strokeColor = score >= 85 ? "#10b981" : score >= 70 ? "#22c55e" : score >= 55 ? "#eab308" : score >= 40 ? "#f97316" : "#ef4444";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#1e293b" strokeWidth="10" fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={strokeColor} strokeWidth="10" fill="none"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`text-2xl font-bold ${scoreColor(score)}`}>{score}</span>
        <span className={`text-sm font-semibold ${gradeColor(grade)}`}>Grade {grade}</span>
      </div>
    </div>
  );
}

// ─── Dimension Bar ────────────────────────────────────────────────────────────

function DimensionBar({ name, score, grade, detail }: { name: string; score: number; grade: string; detail: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-300">{name}</span>
          <Badge variant="outline" className={`text-xs px-1 py-0 ${gradeColor(grade)}`}>{grade}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-semibold ${scoreColor(score)}`}>{score}/100</span>
          {open ? <ChevronUp className="h-3 w-3 text-slate-500" /> : <ChevronDown className="h-3 w-3 text-slate-500" />}
        </div>
      </div>
      <Progress value={score} className="h-1.5" />
      <AnimatePresence>
        {open && (
          <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="text-xs text-slate-500 pl-1">
            {detail}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Health Score Tab ─────────────────────────────────────────────────────────

function HealthTab() {
  const { data, isLoading } = useLearningHealth();
  const { data: histData } = useHealthHistory();
  const health = data?.data;
  const history = histData?.data ?? [];

  const chartData = history.slice().reverse().map((s: Record<string, unknown>, i: number) => ({
    idx: i + 1,
    score: Number(s.overallScore ?? 0),
    date: s.snapshotAt ? new Date(String(s.snapshotAt)).toLocaleDateString() : `#${i + 1}`,
  }));

  if (isLoading) {
    return <div className="flex items-center justify-center h-40 text-slate-500">Computing health score…</div>;
  }

  if (!health) {
    return <div className="text-slate-500 text-sm text-center py-8">No health data yet. Run a learning cycle to generate your first snapshot.</div>;
  }

  const dims = health.dimensions ?? [];

  return (
    <div className="space-y-6">
      {/* Score overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-900/80 border-slate-700 flex flex-col items-center justify-center py-6">
          <HealthRing score={health.overallScore ?? 0} grade={health.grade ?? "F"} size={130} />
          <p className="mt-3 text-xs text-slate-500">Learning Health Score</p>
          <Badge variant="outline" className={`mt-2 ${certBadge(health.certificationStatus)}`}>
            {health.certificationStatus === "certified" ? "✓ Certified" :
             health.certificationStatus === "conditional" ? "⚠ Conditional" : "✗ Not Ready"}
          </Badge>
        </Card>

        <Card className="bg-slate-900/80 border-slate-700 col-span-2 p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Dimension Breakdown</h3>
          <div className="space-y-3">
            {dims.map((d: { name: string; score: number; grade: string; detail: string }) => (
              <DimensionBar key={d.name} name={d.name} score={d.score} grade={d.grade} detail={d.detail} />
            ))}
          </div>
        </Card>
      </div>

      {/* Supporting stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Cycles", value: health.totalCycles, icon: RefreshCw },
          { label: "Passed Cycles", value: health.passedCycles, icon: CheckCircle },
          { label: "Total Features", value: health.totalFeatures, icon: Database },
          { label: "Reliable Patterns", value: `${health.reliablePatterns}/${health.totalPatterns}`, icon: Target },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="bg-slate-900/80 border-slate-700 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Icon className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs text-slate-500">{label}</span>
            </div>
            <p className="text-lg font-bold text-white">{value ?? 0}</p>
          </Card>
        ))}
      </div>

      {/* Strengths & Weaknesses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-slate-900/80 border-slate-700 p-4">
          <h3 className="text-sm font-semibold text-emerald-400 mb-2 flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5" /> Strengths</h3>
          {(health.strengths ?? []).length === 0 ? (
            <p className="text-xs text-slate-500">No strengths identified yet.</p>
          ) : (
            <ul className="space-y-1">
              {(health.strengths ?? []).map((s: string, i: number) => (
                <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5"><span className="text-emerald-500 mt-0.5">•</span>{s}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="bg-slate-900/80 border-slate-700 p-4">
          <h3 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2"><XCircle className="h-3.5 w-3.5" /> Weaknesses</h3>
          {(health.weaknesses ?? []).length === 0 ? (
            <p className="text-xs text-slate-500">No weaknesses identified.</p>
          ) : (
            <ul className="space-y-1">
              {(health.weaknesses ?? []).map((s: string, i: number) => (
                <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5"><span className="text-red-500 mt-0.5">•</span>{s}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Trend chart */}
      {chartData.length > 1 && (
        <Card className="bg-slate-900/80 border-slate-700 p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Health Score Trend</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} />
              <RechartsTip contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 12 }} />
              <Area type="monotone" dataKey="score" stroke="#10b981" fill="url(#healthGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}

// ─── Drift Tab ────────────────────────────────────────────────────────────────

function DriftTab() {
  const { data, isLoading } = useLearningDrift();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const resolveMutation = useMutation({
    mutationFn: (driftId: string) =>
      fetch(`/api/learning/drift/resolve/${driftId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: "Resolved from dashboard" }) }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["learning-drift"] });
      toast({ title: "Drift event resolved" });
    },
  });

  const live = data?.data?.liveDetection;
  const stored = data?.data?.storedEvents ?? [];

  if (isLoading) return <div className="flex items-center justify-center h-40 text-slate-500">Running drift detection…</div>;

  return (
    <div className="space-y-6">
      {/* Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Active", value: data?.data?.summary?.totalActive ?? 0, color: "text-white" },
          { label: "Critical", value: data?.data?.summary?.criticalCount ?? 0, color: "text-red-400" },
          { label: "High", value: data?.data?.summary?.highCount ?? 0, color: "text-orange-400" },
          { label: "Live Detected", value: live?.totalEventsDetected ?? 0, color: "text-yellow-400" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="bg-slate-900/80 border-slate-700 p-3 text-center">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </Card>
        ))}
      </div>

      {/* Live detection summary */}
      {live && (
        <Card className={`border p-4 ${live.overallDriftSeverity === "none" ? "bg-emerald-950/30 border-emerald-800/40" : "bg-orange-950/30 border-orange-800/40"}`}>
          <div className="flex items-start gap-3">
            {live.overallDriftSeverity === "none"
              ? <CheckCircle className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
              : <AlertTriangle className="h-5 w-5 text-orange-400 mt-0.5 flex-shrink-0" />
            }
            <div>
              <p className="text-sm font-semibold text-slate-200">Live Detection: {live.overallDriftSeverity === "none" ? "No drift detected" : `${live.overallDriftSeverity?.toUpperCase()} drift`}</p>
              <p className="text-xs text-slate-400 mt-1">{live.summary}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Live events */}
      {(live?.events ?? []).length > 0 && (
        <Card className="bg-slate-900/80 border-slate-700 p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-400" /> Detected Drift Events
          </h3>
          <div className="space-y-3">
            {(live?.events ?? []).map((e: Record<string, unknown>) => (
              <div key={String(e.driftId)} className={`rounded-lg border p-3 ${severityColor(String(e.severity))}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wide">{String(e.driftType).replace("_", " ")} · {String(e.affectedWindow)}</span>
                  <Badge variant="outline" className={severityColor(String(e.severity))}>{String(e.severity)}</Badge>
                </div>
                <p className="text-xs text-slate-300">{String(e.description)}</p>
                <p className="text-xs text-slate-400 mt-1 italic">{String(e.recommendation)}</p>
                <div className="flex gap-3 mt-2 text-xs text-slate-500">
                  <span>Baseline: {fmt(e.baselineValue)}</span>
                  <span>Current: {fmt(e.currentValue)}</span>
                  <span>Δ: {fmt(e.deltaAbsolute)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Stored alerts */}
      <Card className="bg-slate-900/80 border-slate-700 p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-500" /> Historical Alerts
        </h3>
        {stored.length === 0 ? (
          <p className="text-xs text-slate-500">No stored drift alerts.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {stored.map((e: Record<string, unknown>) => (
              <div key={String(e.id)} className="flex items-center justify-between rounded border border-slate-700/50 px-3 py-2 bg-slate-800/40">
                <div>
                  <span className="text-xs font-medium text-slate-300">{String(e.driftType)} · {String(e.affectedWindow)}</span>
                  <p className="text-xs text-slate-500">{String(e.description).slice(0, 80)}…</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-xs ${severityColor(String(e.severity))}`}>{String(e.severity)}</Badge>
                  {!e.resolved && (
                    <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => resolveMutation.mutate(String(e.driftId))}>
                      Resolve
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Validation Tab ───────────────────────────────────────────────────────────

function ValidationTab() {
  const { data, isLoading } = useLearningValidation();
  const live = data?.data?.liveValidation;
  const history = data?.data?.history ?? [];
  const summary = data?.data?.summary;

  if (isLoading) return <div className="flex items-center justify-center h-40 text-slate-500">Running validation…</div>;

  const statusIcon = (s: string) => s === "passed"
    ? <CheckCircle className="h-4 w-4 text-emerald-400" />
    : s === "degraded"
    ? <AlertTriangle className="h-4 w-4 text-yellow-400" />
    : <XCircle className="h-4 w-4 text-red-400" />;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Validations", value: summary?.totalValidations ?? 0 },
          { label: "Passed", value: summary?.passedCount ?? 0 },
          { label: "Degraded", value: summary?.degradedCount ?? 0 },
          { label: "Failed", value: summary?.failedCount ?? 0 },
        ].map(({ label, value }) => (
          <Card key={label} className="bg-slate-900/80 border-slate-700 p-3 text-center">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className="text-xl font-bold text-white">{value}</p>
          </Card>
        ))}
      </div>

      {/* Live validation result */}
      {live && (
        <Card className={`border p-4 ${live.overallStatus === "passed" ? "bg-emerald-950/30 border-emerald-800/40" : live.overallStatus === "degraded" ? "bg-yellow-950/30 border-yellow-800/40" : "bg-red-950/30 border-red-800/40"}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {statusIcon(live.overallStatus)}
              <span className="text-sm font-semibold text-slate-200">Live Validation — {live.overallStatus.toUpperCase()}</span>
            </div>
            <span className={`text-2xl font-bold ${scoreColor(live.overallScore)}`}>{live.overallScore}/100</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-400 mb-3">
            <span>n = {live.sampleSize}</span>
            <span>Win Rate: {pct(live.observedWinRate)}</span>
            <span>95% CI: [{pct(live.ci95Lower)}, {pct(live.ci95Upper)}]</span>
            <span>p-value: {fmt(live.pValue, 4)}</span>
          </div>
          <div className="space-y-2">
            {(live.issues ?? []).map((issue: Record<string, unknown>, i: number) => (
              <div key={i} className={`flex items-start gap-2 text-xs p-2 rounded ${issue.passed ? "bg-emerald-900/20" : issue.severity === "error" ? "bg-red-900/20" : "bg-yellow-900/20"}`}>
                {issue.passed ? <CheckCircle className="h-3 w-3 text-emerald-400 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="h-3 w-3 text-yellow-400 mt-0.5 flex-shrink-0" />}
                <span className="text-slate-300">{String(issue.message)}</span>
              </div>
            ))}
          </div>
          {(live.recommendations ?? []).length > 0 && (
            <div className="mt-3 border-t border-slate-700 pt-3">
              <p className="text-xs font-semibold text-slate-400 mb-1">Recommendations:</p>
              {(live.recommendations ?? []).map((r: string, i: number) => (
                <p key={i} className="text-xs text-slate-400">• {r}</p>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* History */}
      <Card className="bg-slate-900/80 border-slate-700 p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Validation History</h3>
        {history.length === 0 ? (
          <p className="text-xs text-slate-500">No validation history yet.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {history.map((v: Record<string, unknown>) => (
              <div key={String(v.id)} className="flex items-center justify-between rounded border border-slate-700/50 px-3 py-2 bg-slate-800/40">
                <div className="flex items-center gap-2">
                  {statusIcon(String(v.overallStatus))}
                  <div>
                    <span className="text-xs font-medium text-slate-300 capitalize">{String(v.overallStatus)}</span>
                    <p className="text-xs text-slate-500">n={v.sampleSize} · Score: {v.overallScore}/100 · Checks: {v.passedChecks}/{v.totalChecks}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-500">{v.createdAt ? new Date(String(v.createdAt)).toLocaleDateString() : "—"}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Certification Tab ────────────────────────────────────────────────────────

function CertificationTab() {
  const { data, isLoading } = useLearningCertification();
  const cert = data?.data;

  if (isLoading) return <div className="flex items-center justify-center h-40 text-slate-500">Running audit…</div>;
  if (!cert) return <div className="text-slate-500 text-sm text-center py-8">Certification data unavailable.</div>;

  const checklist = cert.checklist ?? [];
  const critical = checklist.filter((c: Record<string, unknown>) => c.priority === "critical");
  const high = checklist.filter((c: Record<string, unknown>) => c.priority === "high");
  const medium = checklist.filter((c: Record<string, unknown>) => c.priority === "medium");
  const low = checklist.filter((c: Record<string, unknown>) => c.priority === "low");

  const ChecklistSection = ({ items, label, color }: { items: Record<string, unknown>[]; label: string; color: string }) => (
    items.length > 0 ? (
      <div>
        <h4 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${color}`}>{label}</h4>
        {items.map((c, i) => (
          <div key={i} className="flex items-center gap-2 py-1.5 border-b border-slate-800 last:border-0">
            {c.status ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />}
            <span className={`text-xs ${c.status ? "text-slate-300" : "text-slate-400"}`}>{String(c.item)}</span>
          </div>
        ))}
      </div>
    ) : null
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className={`border p-5 ${certBadge(cert.certificationStatus)}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Award className="h-8 w-8 text-current" />
            <div>
              <p className="text-sm font-bold text-slate-100">Production Certification</p>
              <p className={`text-xs font-semibold ${certColor(cert.certificationStatus)}`}>
                {cert.certificationStatus === "certified" ? "✓ CERTIFIED — Ready for Phase 4"
                  : cert.certificationStatus === "conditional" ? "⚠ CONDITIONAL — Partial readiness"
                  : "✗ NOT READY — Further validation required"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-bold ${scoreColor(cert.readinessScore)}`}>{cert.readinessScore}%</p>
            <p className="text-xs text-slate-500">Readiness</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-400">
          <span>Version: {cert.learningEngineVersion}</span>
          <span>Cycles: {cert.totalCycles}</span>
          <span>Features: {cert.totalFeatures}</span>
          <span>Drift Alerts: {cert.activeDriftAlerts}</span>
        </div>
      </Card>

      {/* Target */}
      <Card className="bg-slate-900/80 border-slate-700 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Eye className="h-4 w-4 text-slate-500" />
          <span className="text-xs text-slate-400">Phase Readiness</span>
        </div>
        <p className="text-sm font-semibold text-slate-200">{cert.phaseReadyFor}</p>
      </Card>

      {/* Checklist */}
      <Card className="bg-slate-900/80 border-slate-700 p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-400" /> Production Readiness Checklist
        </h3>
        <div className="space-y-4">
          <ChecklistSection items={critical} label="Critical" color="text-red-400" />
          <ChecklistSection items={high} label="High Priority" color="text-orange-400" />
          <ChecklistSection items={medium} label="Medium Priority" color="text-yellow-400" />
          <ChecklistSection items={low} label="Low Priority" color="text-blue-400" />
        </div>
      </Card>
    </div>
  );
}

// ─── Schedule Tab ─────────────────────────────────────────────────────────────

function ScheduleTab() {
  const { data: reportsData } = useLearningReports();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const runMutation = useMutation({
    mutationFn: (scheduleType: string) =>
      fetch("/api/learning/run-cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleType }),
      }).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: "Learning cycle started", description: `Run ID: ${data.data?.runId?.slice(0, 8)}…` });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["learning-reports"] });
        queryClient.invalidateQueries({ queryKey: ["learning-health"] });
        queryClient.invalidateQueries({ queryKey: ["learning-validation"] });
        queryClient.invalidateQueries({ queryKey: ["learning-drift"] });
      }, 5000);
    },
  });

  const scheduleStatus = reportsData?.data?.scheduleStatus ?? {};
  const schedulerHistory = reportsData?.data?.schedulerHistory ?? [];

  const scheduleTypes: { type: string; label: string; desc: string; icon: React.ElementType }[] = [
    { type: "daily", label: "Daily Cycle", desc: "Last 24 hours of trades", icon: Clock },
    { type: "weekly", label: "Weekly Cycle", desc: "Last 7 days of trades", icon: Calendar },
    { type: "monthly", label: "Monthly Cycle", desc: "Last 30 days of trades", icon: BarChart3 },
    { type: "manual", label: "Full History", desc: "All available trades", icon: Database },
  ];

  return (
    <div className="space-y-6">
      {/* Schedule cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scheduleTypes.map(({ type, label, desc, icon: Icon }) => {
          const status = scheduleStatus[type as keyof typeof scheduleStatus] as Record<string, unknown> | undefined;
          const isDue = status?.isDue ?? true;
          return (
            <Card key={type} className={`border p-4 ${isDue ? "border-yellow-700/50 bg-yellow-950/20" : "border-slate-700 bg-slate-900/80"}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-800">
                    <Icon className="h-4 w-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{label}</p>
                    <p className="text-xs text-slate-500">{desc}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-blue-600 text-blue-400 hover:bg-blue-900/30"
                  onClick={() => runMutation.mutate(type)}
                  disabled={runMutation.isPending}
                >
                  <Play className="h-3 w-3 mr-1" /> Run
                </Button>
              </div>
              {status?.lastRunAt && (
                <p className="text-xs text-slate-500 mt-2">Last: {new Date(String(status.lastRunAt)).toLocaleString()}</p>
              )}
              {isDue && (
                <Badge variant="outline" className="mt-2 text-xs text-yellow-400 border-yellow-700">Due Now</Badge>
              )}
            </Card>
          );
        })}
      </div>

      {/* Scheduler history */}
      <Card className="bg-slate-900/80 border-slate-700 p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-500" /> Scheduler History
        </h3>
        {schedulerHistory.length === 0 ? (
          <p className="text-xs text-slate-500">No scheduled runs yet. Click Run on any schedule type above.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {schedulerHistory.map((r: Record<string, unknown>) => (
              <div key={String(r.runId)} className="flex items-center justify-between rounded border border-slate-700/50 px-3 py-2 bg-slate-800/40">
                <div className="flex items-center gap-2">
                  {r.status === "complete" ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                    : r.status === "failed" ? <XCircle className="h-3.5 w-3.5 text-red-400" />
                    : <RefreshCw className="h-3.5 w-3.5 text-blue-400 animate-spin" />}
                  <div>
                    <span className="text-xs font-medium text-slate-300 capitalize">{String(r.scheduleType)}</span>
                    <p className="text-xs text-slate-500">
                      {r.tradesCollected} trades · {r.driftEventsFound} drift events · {r.durationMs ? `${r.durationMs}ms` : "—"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className={`text-xs ${r.status === "complete" ? "text-emerald-400 border-emerald-700" : r.status === "failed" ? "text-red-400 border-red-700" : "text-blue-400 border-blue-700"}`}>
                    {String(r.status)}
                  </Badge>
                  <p className="text-xs text-slate-500 mt-0.5">{r.createdAt ? new Date(String(r.createdAt)).toLocaleString() : "—"}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Recommendation Accuracy Tab ──────────────────────────────────────────────

function AccuracyTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["learning-recommendation-accuracy"],
    queryFn: () => fetch("/api/learning/recommendation-accuracy").then(r => r.json()),
    refetchInterval: 120_000,
  });

  const live = data?.data?.liveAccuracy;

  if (isLoading) return <div className="flex items-center justify-center h-40 text-slate-500">Evaluating accuracy…</div>;

  const metrics = live ? [
    { label: "Precision", value: live.precision, fmt: pct },
    { label: "Recall", value: live.recall, fmt: pct },
    { label: "F1 Score", value: live.f1Score, fmt: pct },
    { label: "Accuracy", value: live.accuracy, fmt: pct },
    { label: "Brier Score", value: live.brierScore, fmt: (v: unknown) => fmt(v, 4), note: "lower = better" },
    { label: "TIS Correlation", value: live.tisCorrelation, fmt: (v: unknown) => fmt(v, 3) },
    { label: "TIS Bias", value: live.tisBias, fmt: (v: unknown) => fmt(v, 3), note: ">0 = overconfident" },
    { label: "Calibration Error", value: live.calibrationError, fmt: pct },
  ] : [];

  const confMatrix = live ? [
    { label: "True Positives", value: live.truePositives, color: "text-emerald-400" },
    { label: "False Positives", value: live.falsePositives, color: "text-red-400" },
    { label: "True Negatives", value: live.trueNegatives, color: "text-emerald-400" },
    { label: "False Negatives", value: live.falseNegatives, color: "text-orange-400" },
  ] : [];

  const buckets = (live?.bucketBreakdown ?? []) as { confidenceRange: string; count: number; actualWinRate: number; avgPredictedConfidence: number; calibrationError: number }[];

  return (
    <div className="space-y-6">
      {!live ? (
        <Card className="bg-slate-900/80 border-slate-700 p-8 text-center">
          <p className="text-slate-500 text-sm">No recommendation accuracy data yet.</p>
          <p className="text-slate-600 text-xs mt-1">Accuracy tracking requires closed trades with TQI scores.</p>
        </Card>
      ) : (
        <>
          {/* Volume */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card className="bg-slate-900/80 border-slate-700 p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Total Recommendations</p>
              <p className="text-xl font-bold text-white">{live.totalRecommendations}</p>
            </Card>
            <Card className="bg-slate-900/80 border-slate-700 p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Evaluated (with outcomes)</p>
              <p className="text-xl font-bold text-white">{live.evaluated}</p>
            </Card>
            <Card className="bg-slate-900/80 border-slate-700 p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Overconfident %</p>
              <p className="text-xl font-bold text-orange-400">{fmt(live.overconfidentPct)}%</p>
            </Card>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {metrics.map(({ label, value, fmt: f, note }) => (
              <Card key={label} className="bg-slate-900/80 border-slate-700 p-3">
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className="text-lg font-bold text-white">{f(value)}</p>
                {note && <p className="text-xs text-slate-600">{note}</p>}
              </Card>
            ))}
          </div>

          {/* Confusion matrix */}
          <Card className="bg-slate-900/80 border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Confusion Matrix</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {confMatrix.map(({ label, value, color }) => (
                <div key={label} className="text-center p-3 rounded bg-slate-800">
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-slate-500 mt-1">{label}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Calibration chart */}
          {buckets.length > 0 && (
            <Card className="bg-slate-900/80 border-slate-700 p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Confidence Calibration by Bucket</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={buckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="confidenceRange" tick={{ fontSize: 9, fill: "#64748b" }} />
                  <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: "#64748b" }} />
                  <RechartsTip contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }} formatter={(v: number) => [(v * 100).toFixed(1) + "%"]} />
                  <Bar dataKey="actualWinRate" name="Actual Win Rate" fill="#10b981" opacity={0.85} />
                  <Bar dataKey="avgPredictedConfidence" name="Predicted Confidence" fill="#3b82f6" opacity={0.6} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LearningHealth() {
  const { data: healthData } = useLearningHealth();
  const { data: certData } = useLearningCertification();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const health = healthData?.data;
  const cert = certData?.data;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["learning-health"] });
    queryClient.invalidateQueries({ queryKey: ["learning-drift"] });
    queryClient.invalidateQueries({ queryKey: ["learning-validation"] });
    queryClient.invalidateQueries({ queryKey: ["learning-certification"] });
    queryClient.invalidateQueries({ queryKey: ["learning-reports"] });
    queryClient.invalidateQueries({ queryKey: ["learning-recommendation-accuracy"] });
    toast({ title: "Refreshed all learning data" });
  }

  return (
    <div className="p-4 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-400" /> Learning Health Monitor
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Phase 3 — Validation, Drift Detection & Continuous Learning</p>
        </div>
        <div className="flex items-center gap-2">
          {health && (
            <Badge variant="outline" className={`text-sm px-3 py-1 ${certBadge(health.certificationStatus)}`}>
              {health.certificationStatus === "certified" ? "✓ Certified" :
               health.certificationStatus === "conditional" ? "⚠ Conditional" : "✗ Not Ready"}
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={refresh} className="border-slate-700">
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Quick stats bar */}
      {(health || cert) && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {[
            { label: "Health Score", value: `${health?.overallScore ?? "—"}/100`, color: scoreColor(health?.overallScore ?? 0) },
            { label: "Grade", value: health?.grade ?? "—", color: gradeColor(health?.grade ?? "F") },
            { label: "Active Drift", value: cert?.activeDriftAlerts ?? 0, color: (cert?.activeDriftAlerts ?? 0) > 0 ? "text-orange-400" : "text-emerald-400" },
            { label: "Cycles", value: cert?.totalCycles ?? 0, color: "text-white" },
            { label: "Features", value: cert?.totalFeatures ?? 0, color: "text-white" },
            { label: "Patterns", value: cert?.totalPatterns ?? 0, color: "text-white" },
          ].map(({ label, value, color }) => (
            <Card key={label} className="bg-slate-900/80 border-slate-700 px-3 py-2 text-center">
              <p className="text-xs text-slate-500">{label}</p>
              <p className={`text-base font-bold ${color}`}>{value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Main tabs */}
      <Tabs defaultValue="health">
        <TabsList className="bg-slate-900 border border-slate-700">
          <TabsTrigger value="health" className="text-xs"><Activity className="h-3 w-3 mr-1" />Health</TabsTrigger>
          <TabsTrigger value="validation" className="text-xs"><CheckCircle className="h-3 w-3 mr-1" />Validation</TabsTrigger>
          <TabsTrigger value="drift" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Drift</TabsTrigger>
          <TabsTrigger value="accuracy" className="text-xs"><Target className="h-3 w-3 mr-1" />Accuracy</TabsTrigger>
          <TabsTrigger value="schedule" className="text-xs"><Calendar className="h-3 w-3 mr-1" />Schedule</TabsTrigger>
          <TabsTrigger value="certification" className="text-xs"><Award className="h-3 w-3 mr-1" />Certification</TabsTrigger>
        </TabsList>

        <TabsContent value="health"><HealthTab /></TabsContent>
        <TabsContent value="validation"><ValidationTab /></TabsContent>
        <TabsContent value="drift"><DriftTab /></TabsContent>
        <TabsContent value="accuracy"><AccuracyTab /></TabsContent>
        <TabsContent value="schedule"><ScheduleTab /></TabsContent>
        <TabsContent value="certification"><CertificationTab /></TabsContent>
      </Tabs>
    </div>
  );
}
