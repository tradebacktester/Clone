import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, ShieldAlert, ShieldX, RefreshCw, Download, Play, Pause,
  ChevronRight, ChevronLeft, Database, Zap, AlertTriangle, CheckCircle2,
  Clock, BarChart2, Archive, Award, SkipForward, SkipBack, Activity,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

const API = "/api";

// ─── Fetch Helpers ────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(`${API}${url}`).then(r => r.json());

const poster = (url: string, body?: object) =>
  fetch(`${API}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json());

// ─── Score Badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score, size = "md" }: { score: number | null; size?: "sm" | "md" | "lg" }) {
  if (score === null) return <Badge variant="outline" className="text-muted-foreground">—</Badge>;
  const color = score >= 80 ? "text-emerald-400" : score >= 50 ? "text-yellow-400" : "text-red-400";
  const sz = size === "lg" ? "text-4xl font-black" : size === "md" ? "text-2xl font-bold" : "text-sm font-semibold";
  return <span className={`${sz} ${color} tabular-nums`}>{score}<span className="text-xs text-muted-foreground font-normal">/100</span></span>;
}

function HealthBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="outline">unchecked</Badge>;
  const map: Record<string, string> = {
    healthy: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    degraded: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    critical: "bg-red-500/15 text-red-400 border-red-500/30",
    production: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    staging: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    development: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    none: "bg-red-500/15 text-red-400 border-red-500/30",
    unchecked: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  };
  const cls = map[status] ?? map.unchecked;
  return (
    <Badge variant="outline" className={cls}>
      {status.toUpperCase()}
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: "bg-red-500/15 text-red-400 border-red-500/30",
    warning: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    info: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  };
  return <Badge variant="outline" className={map[severity] ?? ""}>{severity}</Badge>;
}

// ─── Dashboard Overview Tab ───────────────────────────────────────────────────

function OverviewTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: dash, isLoading } = useQuery({
    queryKey: ["memory-health-dashboard"],
    queryFn: () => fetcher("/memory/health-dashboard"),
    refetchInterval: 60_000,
  });

  const { data: perfHistory } = useQuery({
    queryKey: ["memory-perf-history"],
    queryFn: () => fetcher("/memory/performance/history?limit=24"),
  });

  const runValidation = useMutation({
    mutationFn: () => poster("/memory/validation/run", { triggeredBy: "user" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["memory-health-dashboard"] }); toast({ title: "Validation complete" }); },
    onError: () => toast({ title: "Validation failed", variant: "destructive" }),
  });

  const runCert = useMutation({
    mutationFn: () => poster("/memory/certification/run"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["memory-health-dashboard"] }); toast({ title: "Certification complete" }); },
    onError: () => toast({ title: "Certification failed", variant: "destructive" }),
  });

  const runBenchmark = useMutation({
    mutationFn: () => poster("/memory/performance/benchmark"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["memory-health-dashboard"] }); toast({ title: "Benchmark complete" }); },
    onError: () => toast({ title: "Benchmark failed", variant: "destructive" }),
  });

  const summary = dash?.summary ?? {};
  const historyRows = (perfHistory?.history ?? []).map((h: Record<string, unknown>) => ({
    time: new Date(h.capturedAt as string).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    health: h.healthScore,
    perf: h.performanceScore,
  })).reverse();

  const radarData = [
    { dim: "Integrity", score: summary.validationScore ?? 0 },
    { dim: "Certification", score: summary.certificationScore ?? 0 },
    { dim: "Performance", score: summary.performanceScore ?? 0 },
    { dim: "Coverage", score: 80 },
    { dim: "Reliability", score: summary.certificationScore ? Math.round(summary.certificationScore * 0.9) : 0 },
  ];

  if (isLoading) return <div className="text-muted-foreground text-sm animate-pulse p-8">Loading dashboard…</div>;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Validation Score", score: summary.validationScore, icon: ShieldCheck, sub: "Integrity checks" },
          { label: "Cert. Score", score: summary.certificationScore, icon: Award, sub: `Level: ${summary.certificationLevel ?? "none"}` },
          { label: "Performance", score: summary.performanceScore, icon: Zap, sub: "Query benchmarks" },
          { label: "Last Backup", score: null, icon: Archive, sub: summary.lastBackup ? new Date(summary.lastBackup).toLocaleDateString() : "Never" },
        ].map(({ label, score, icon: Icon, sub }) => (
          <Card key={label} className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <Icon size={16} className="text-muted-foreground mt-1" />
                <ScoreBadge score={score} size="md" />
              </div>
              <div className="text-sm font-medium">{label}</div>
              <div className="text-xs text-muted-foreground">{sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Status + Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity size={14} />
              Overall System Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <HealthBadge status={summary.overallStatus} />
              <span className="text-muted-foreground text-xs">
                {summary.overallStatus === "healthy" && "All memory subsystems operating normally"}
                {summary.overallStatus === "degraded" && "Some issues detected — review findings below"}
                {summary.overallStatus === "critical" && "Critical issues require immediate attention"}
                {summary.overallStatus === "unchecked" && "Run validation and certification to assess system health"}
              </span>
            </div>
            {historyRows.length > 0 && (
              <ResponsiveContainer width="100%" height={100}>
                <LineChart data={historyRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} width={25} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, fontSize: 11 }} />
                  <Line type="monotone" dataKey="health" stroke="#34d399" dot={false} strokeWidth={2} name="Health" />
                  <Line type="monotone" dataKey="perf" stroke="#60a5fa" dot={false} strokeWidth={2} name="Perf" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button size="sm" variant="outline" className="w-full justify-start gap-2"
              onClick={() => runValidation.mutate()} disabled={runValidation.isPending}>
              {runValidation.isPending ? <RefreshCw size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
              Run Validation
            </Button>
            <Button size="sm" variant="outline" className="w-full justify-start gap-2"
              onClick={() => runCert.mutate()} disabled={runCert.isPending}>
              {runCert.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Award size={13} />}
              Certify System
            </Button>
            <Button size="sm" variant="outline" className="w-full justify-start gap-2"
              onClick={() => runBenchmark.mutate()} disabled={runBenchmark.isPending}>
              {runBenchmark.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
              Benchmark
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Radar chart */}
      {radarData.some(d => d.score > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">System Quality Radar</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#1e293b" />
                <PolarAngleAxis dataKey="dim" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="score" stroke="#818cf8" fill="#818cf8" fillOpacity={0.2} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Validation Tab ───────────────────────────────────────────────────────────

function ValidationTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: latest } = useQuery({
    queryKey: ["memory-validation-latest"],
    queryFn: () => fetcher("/memory/validation/latest"),
  });

  const { data: history } = useQuery({
    queryKey: ["memory-validation-history"],
    queryFn: () => fetcher("/memory/validation/history?limit=10"),
  });

  const runFull = useMutation({
    mutationFn: () => poster("/memory/validation/run", { triggeredBy: "user" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["memory-validation-latest"] }); qc.invalidateQueries({ queryKey: ["memory-validation-history"] }); toast({ title: "Validation complete" }); },
    onError: () => toast({ title: "Validation failed", variant: "destructive" }),
  });

  const findings = (latest?.findings ?? latest?.report?.findings ?? []) as Array<{
    id: string; severity: string; category: string; check: string; message: string; count: number; repaired: boolean; repairNote?: string; sqlHint?: string;
  }>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ScoreBadge score={latest?.healthScore ?? latest?.health_score ?? null} size="lg" />
          <div>
            <HealthBadge status={latest?.overallHealth ?? latest?.overall_health ?? null} />
            <div className="text-xs text-muted-foreground mt-1">
              {latest?.totalChecks ?? latest?.total_checks ?? 0} checks · {latest?.criticalCount ?? latest?.critical_count ?? 0} critical · {latest?.warningCount ?? latest?.warning_count ?? 0} warnings
            </div>
          </div>
        </div>
        <Button size="sm" onClick={() => runFull.mutate()} disabled={runFull.isPending} className="gap-2">
          {runFull.isPending ? <RefreshCw size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
          Run Full Validation
        </Button>
      </div>

      {/* Findings */}
      {findings.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Findings ({findings.length})</div>
          {findings.map((f) => (
            <Card key={f.id} className={`border-l-2 ${f.severity === "critical" ? "border-l-red-500" : f.severity === "warning" ? "border-l-yellow-500" : "border-l-blue-500"}`}>
              <CardContent className="p-3">
                <div className="flex items-start gap-2">
                  <SeverityBadge severity={f.severity} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-foreground">[{f.id}] {f.check}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{f.message}</div>
                    {f.repairNote && <div className="text-xs text-blue-400 mt-1">💡 {f.repairNote}</div>}
                    {f.sqlHint && <div className="text-xs font-mono bg-muted/30 rounded px-2 py-1 mt-1 text-slate-300 truncate">{f.sqlHint}</div>}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">{f.count} record{f.count !== 1 ? "s" : ""}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 size={18} className="text-emerald-400" />
            <div className="text-sm text-emerald-300">
              {latest ? "No issues found — memory system is clean" : "No validation data yet — run a validation to start"}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {((latest?.recommendations ?? []) as string[]).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {(latest.recommendations as string[]).map((r: string, i: number) => (
              <div key={i} className="text-xs text-foreground flex gap-2">
                <span className="text-muted-foreground shrink-0">→</span>
                <span>{r}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* History */}
      {(history?.history ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {(history.history as Array<Record<string, unknown>>).map((h) => (
                <div key={String(h.id)} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                  <div className="flex items-center gap-2">
                    <HealthBadge status={String(h.overall_health ?? "—")} />
                    <span className="text-muted-foreground">{new Date(h.started_at as string).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-red-400">{String(h.critical_count ?? 0)} crit</span>
                    <span className="text-yellow-400">{String(h.warning_count ?? 0)} warn</span>
                    <span className="tabular-nums text-muted-foreground">{Number(h.health_score ?? 0)}/100</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Replay Tab ───────────────────────────────────────────────────────────────

function ReplayTab() {
  const { toast } = useToast();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<Record<string, unknown> | null>(null);
  const [stepData, setStepData] = useState<Record<string, unknown> | null>(null);
  const [pair, setPair] = useState("");

  const { data: searchResults, refetch: doSearch, isLoading: searching } = useQuery({
    queryKey: ["replay-search", pair],
    queryFn: () => fetcher(`/memory/replay/search${pair ? `?pair=${pair}` : ""}&limit=20`),
    enabled: true,
  });

  const handleStart = async (tradeId: number) => {
    try {
      const res = await poster("/memory/replay/start", { tradeId, playbackSpeed: 1 });
      if (res.error) { toast({ title: res.error, variant: "destructive" }); return; }
      setSessionId(res.sessionId);
      setSessionData(res);
      setStepData(res.currentStepData);
    } catch { toast({ title: "Failed to start replay", variant: "destructive" }); }
  };

  const handleForward = async () => {
    if (!sessionId) return;
    try {
      const res = await poster(`/memory/replay/session/${sessionId}/forward`);
      setStepData(res.step);
      if (res.completed) setSessionData(prev => prev ? { ...prev, status: "completed" } : prev);
    } catch {}
  };

  const handleBackward = async () => {
    if (!sessionId) return;
    try {
      const res = await poster(`/memory/replay/session/${sessionId}/backward`);
      setStepData(res.step);
    } catch {}
  };

  const handlePause = async () => {
    if (!sessionId) return;
    const res = await poster(`/memory/replay/session/${sessionId}/pause`);
    setSessionData(prev => prev ? { ...prev, status: res.status } : prev);
  };

  const handleResume = async () => {
    if (!sessionId) return;
    const res = await poster(`/memory/replay/session/${sessionId}/resume`);
    setSessionData(prev => prev ? { ...prev, status: res.status } : prev);
  };

  const handleEnd = async () => {
    if (!sessionId) return;
    await fetch(`${API}/memory/replay/session/${sessionId}`, { method: "DELETE" });
    setSessionId(null);
    setSessionData(null);
    setStepData(null);
  };

  const results = searchResults?.results ?? [];
  const stepType = String(stepData?.type ?? "");
  const stepPhaseColor: Record<string, string> = {
    pre_trade: "text-blue-400",
    in_trade: "text-yellow-400",
    post_trade: "text-emerald-400",
  };

  return (
    <div className="space-y-4">
      {!sessionId ? (
        <>
          <div className="flex gap-2">
            <select
              value={pair}
              onChange={e => setPair(e.target.value)}
              className="bg-muted border border-border rounded px-3 py-1.5 text-sm flex-1"
            >
              <option value="">All Pairs</option>
              {["EURUSD", "GBPUSD", "USDJPY"].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={() => doSearch()} disabled={searching}>
              {searching ? <RefreshCw size={13} className="animate-spin" /> : "Search"}
            </Button>
          </div>

          <div className="space-y-2">
            {results.length === 0 && (
              <Card><CardContent className="p-4 text-sm text-muted-foreground text-center">No replayable experiences found — trades with events are required for replay</CardContent></Card>
            )}
            {results.map((r: Record<string, unknown>) => (
              <Card key={String(r.tradeId)} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => handleStart(Number(r.tradeId))}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{String(r.pair ?? "—")}</div>
                    <div className="text-xs">
                      <span className={r.direction === "long" ? "text-emerald-400" : "text-red-400"}>
                        {String(r.direction ?? "—").toUpperCase()}
                      </span>
                      {r.outcome && <span className="ml-2 text-muted-foreground">→ {String(r.outcome).toUpperCase()}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.eventCount ? `${r.eventCount} events` : "no events"} · {r.screenshotCount ? `${r.screenshotCount} shots` : "no shots"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.openedAt && <div className="text-xs text-muted-foreground">{new Date(r.openedAt as string).toLocaleDateString()}</div>}
                    <Play size={13} className="text-primary" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {/* Session header */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="font-mono text-sm bg-muted px-2 py-1 rounded">{String(sessionData?.pair ?? "")}</div>
                  <HealthBadge status={String(sessionData?.status ?? "")} />
                </div>
                <Button size="sm" variant="ghost" onClick={handleEnd}>End Replay</Button>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Step {Number(sessionData?.currentStep ?? 0) + 1} of {Number(sessionData?.totalSteps ?? 0)}</span>
                  <span>{Math.round(((Number(sessionData?.currentStep ?? 0) + 1) / Math.max(1, Number(sessionData?.totalSteps ?? 1))) * 100)}%</span>
                </div>
                <Progress value={((Number(sessionData?.currentStep ?? 0) + 1) / Math.max(1, Number(sessionData?.totalSteps ?? 1))) * 100} />
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={handleBackward}><SkipBack size={13} /></Button>
                {sessionData?.status === "paused"
                  ? <Button size="sm" variant="outline" onClick={handleResume}><Play size={13} /></Button>
                  : <Button size="sm" variant="outline" onClick={handlePause}><Pause size={13} /></Button>
                }
                <Button size="sm" variant="outline" onClick={handleForward} disabled={sessionData?.status === "completed"}><SkipForward size={13} /></Button>
              </div>
            </CardContent>
          </Card>

          {/* Current step */}
          {stepData && (
            <Card className={`border-l-2 ${stepPhaseColor[String(stepData.phase)] === "text-blue-400" ? "border-l-blue-500" : stepPhaseColor[String(stepData.phase)] === "text-yellow-400" ? "border-l-yellow-500" : "border-l-emerald-500"}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">{String(stepData.type ?? "").replace(/_/g, " ")}</div>
                    <div className="font-medium text-sm mt-0.5">{String(stepData.title ?? "")}</div>
                  </div>
                  <span className={`text-xs font-medium ${stepPhaseColor[String(stepData.phase)] ?? "text-muted-foreground"}`}>
                    {String(stepData.phase ?? "").replace(/_/g, " ")}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">{String(stepData.description ?? "")}</div>
                {stepData.hasVisual && (
                  <div className="mt-2 text-xs text-blue-400 flex items-center gap-1">
                    <Activity size={11} /> Visual available (ID: {String(stepData.visualRef)})
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-2">
                  {new Date(stepData.timestamp as string).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          )}

          {sessionData?.status === "completed" && (
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="p-4 text-center text-sm text-emerald-300">
                Replay complete — all {Number(sessionData.totalSteps)} steps reviewed
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Backup Tab ───────────────────────────────────────────────────────────────

function BackupTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: history } = useQuery({
    queryKey: ["memory-backup-history"],
    queryFn: () => fetcher("/memory/backup/history?limit=10"),
  });

  const { data: latest } = useQuery({
    queryKey: ["memory-backup-latest"],
    queryFn: () => fetcher("/memory/backup/latest"),
  });

  const runFull = useMutation({
    mutationFn: () => poster("/memory/backup/full", { includeImages: false }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["memory-backup-history"] }); qc.invalidateQueries({ queryKey: ["memory-backup-latest"] }); toast({ title: "Backup complete" }); },
    onError: () => toast({ title: "Backup failed", variant: "destructive" }),
  });

  const runIncremental = useMutation({
    mutationFn: () => poster("/memory/backup/incremental"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["memory-backup-history"] }); toast({ title: "Incremental backup complete" }); },
    onError: () => toast({ title: "Incremental backup failed", variant: "destructive" }),
  });

  const hasLatest = latest && !latest.message;

  return (
    <div className="space-y-4">
      {/* Latest backup status */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm font-medium mb-1">Latest Backup</div>
              {hasLatest ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <HealthBadge status={String(latest.status ?? "—")} />
                    <span className="text-xs text-muted-foreground">{String(latest.backup_type ?? latest.backupType ?? "—")}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {Number(latest.records_exported ?? latest.recordsExported ?? 0).toLocaleString()} records · {new Date(latest.started_at ?? latest.startedAt ?? "").toLocaleString()}
                  </div>
                  {latest.checksum && (
                    <div className="text-xs font-mono text-slate-500 truncate max-w-xs">SHA256: {String(latest.checksum).slice(0, 20)}…</div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">No backups yet</div>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => runIncremental.mutate()} disabled={runIncremental.isPending} className="gap-2">
                {runIncremental.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Archive size={13} />}
                Incremental
              </Button>
              <Button size="sm" onClick={() => runFull.mutate()} disabled={runFull.isPending} className="gap-2">
                {runFull.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Database size={13} />}
                Full Backup
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Download button */}
      <Button size="sm" variant="outline" className="gap-2 w-full"
        onClick={() => {
          window.location.href = `${API}/memory/backup/full/download`;
        }}>
        <Download size={13} /> Download Full Backup (JSON)
      </Button>

      {/* Backup history */}
      {(history?.history ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Backup History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {(history.history as Array<Record<string, unknown>>).map((h) => (
                <div key={String(h.id)} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{String(h.backup_type ?? "—")}</span>
                    <HealthBadge status={String(h.status ?? "—")} />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{Number(h.records_exported ?? 0).toLocaleString()} rec</span>
                    <span className="text-muted-foreground">{new Date(h.started_at as string).toLocaleDateString()}</span>
                    {h.duration_ms && <span className="text-muted-foreground">{Number(h.duration_ms)}ms</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Performance Tab ──────────────────────────────────────────────────────────

function PerformanceTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: report, isLoading } = useQuery({
    queryKey: ["memory-perf-latest-full"],
    queryFn: () => fetcher("/memory/performance/latest"),
  });

  const runBench = useMutation({
    mutationFn: () => poster("/memory/performance/benchmark"),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ["memory-perf-latest-full"] }); qc.setQueryData(["memory-perf-latest-full"], data); toast({ title: "Benchmark complete" }); },
    onError: () => toast({ title: "Benchmark failed", variant: "destructive" }),
  });

  const benchmarks = (runBench.data?.benchmarks ?? report?.benchmarks ?? []) as Array<Record<string, unknown>>;
  const score = runBench.data?.performanceScore ?? report?.health_score ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ScoreBadge score={score} size="lg" />
          <div className="text-xs text-muted-foreground">
            {benchmarks.length > 0 && `${benchmarks.filter(b => b.passed).length}/${benchmarks.length} benchmarks pass`}
          </div>
        </div>
        <Button size="sm" onClick={() => runBench.mutate()} disabled={runBench.isPending} className="gap-2">
          {runBench.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
          Run Benchmark Suite
        </Button>
      </div>

      {benchmarks.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Query Benchmarks</div>
          {benchmarks.map((b, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5 border-b border-border last:border-0 text-xs">
              <div className={`w-4 h-4 rounded-full flex items-center justify-center ${b.passed ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
                {b.passed ? <CheckCircle2 size={10} className="text-emerald-400" /> : <AlertTriangle size={10} className="text-red-400" />}
              </div>
              <div className="flex-1 truncate">{String(b.name)}</div>
              <div className="text-muted-foreground">{String(b.queryType)}</div>
              <div className={`tabular-nums font-medium ${b.passed ? "text-emerald-400" : "text-red-400"}`}>
                {Number(b.durationMs)}ms
              </div>
              <div className="text-muted-foreground">/{Number(b.target)}ms</div>
            </div>
          ))}
        </div>
      )}

      {/* Recommendations */}
      {(runBench.data?.recommendations ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {(runBench.data.recommendations as string[]).map((r: string, i: number) => (
              <div key={i} className="text-xs flex gap-2">
                <span className="text-muted-foreground shrink-0">→</span>
                <span>{r}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Scale projections */}
      {runBench.data?.projections && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scale Projection (1 Year)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {[
                { label: "Est. Records", value: Number(runBench.data.projections.recordsAt1Year).toLocaleString() },
                { label: "Est. Storage", value: String(runBench.data.projections.storageAt1Year) },
                { label: "Est. Query Time", value: String(runBench.data.projections.queryTimeAt1Year) },
                { label: "Indexes Adequate", value: runBench.data.projections.indexesAdequate ? "✓ Yes" : "✗ No" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className="text-muted-foreground">{label}</div>
                  <div className="font-medium">{value}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Certification Tab ────────────────────────────────────────────────────────

function CertificationTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: latest } = useQuery({
    queryKey: ["memory-cert-latest"],
    queryFn: () => fetcher("/memory/certification/latest"),
  });

  const { data: history } = useQuery({
    queryKey: ["memory-cert-history"],
    queryFn: () => fetcher("/memory/certification/history"),
  });

  const runCert = useMutation({
    mutationFn: () => poster("/memory/certification/run"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["memory-cert-latest"] }); qc.invalidateQueries({ queryKey: ["memory-cert-history"] }); toast({ title: "Certification complete" }); },
    onError: () => toast({ title: "Certification failed", variant: "destructive" }),
  });

  const certData = runCert.data ?? latest;
  const hasData = certData && !certData.message;
  const checks = (certData?.checks ?? []) as Array<{
    name: string; dimension: string; passed: boolean; score: number; details: string; recommendation?: string;
  }>;
  const dims = [...new Set(checks.map(c => c.dimension))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <ScoreBadge score={hasData ? (certData.productionReadyScore ?? certData.production_ready_score ?? null) : null} size="lg" />
          {hasData && <HealthBadge status={String(certData.certificationLevel ?? certData.certification_level ?? "none")} />}
        </div>
        <Button size="sm" onClick={() => runCert.mutate()} disabled={runCert.isPending} className="gap-2">
          {runCert.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Award size={13} />}
          Run Certification
        </Button>
      </div>

      {/* Dimension summary */}
      {hasData && (
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Data Consistency", key: "dataConsistency" },
            { label: "Relationship Graph", key: "relationshipConsistency" },
            { label: "Replay Accuracy", key: "replayAccuracy" },
            { label: "Recovery Accuracy", key: "recoveryAccuracy" },
            { label: "Performance", key: "performanceTargets" },
            { label: "Scalability", key: "scalabilityCheck" },
            { label: "Reliability", key: "reliabilityCheck" },
          ].map(({ label, key }) => {
            const passed = Boolean(certData[key] ?? certData[key.replace(/([A-Z])/g, "_$1").toLowerCase()]);
            return (
              <div key={key} className="flex items-center gap-2 text-xs py-1">
                {passed
                  ? <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                  : <ShieldX size={13} className="text-red-400 shrink-0" />}
                <span className={passed ? "text-foreground" : "text-muted-foreground"}>{label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Detailed checks */}
      {checks.length > 0 && (
        <div className="space-y-3">
          {dims.map(dim => (
            <div key={dim}>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{dim}</div>
              {checks.filter(c => c.dimension === dim).map((c, i) => (
                <div key={i} className="flex items-start gap-2 py-1 border-b border-border last:border-0 text-xs">
                  {c.passed
                    ? <CheckCircle2 size={12} className="text-emerald-400 mt-0.5 shrink-0" />
                    : <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />}
                  <div className="flex-1">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-muted-foreground">{c.details}</div>
                    {c.recommendation && <div className="text-blue-400 mt-0.5">→ {c.recommendation}</div>}
                  </div>
                  <div className="tabular-nums text-muted-foreground">{c.score}/100</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Strengths / Weaknesses */}
      {hasData && ((certData.strengths ?? []) as string[]).length > 0 && (
        <Card>
          <CardContent className="p-3 space-y-2">
            {((certData.strengths ?? []) as string[]).map((s: string, i: number) => (
              <div key={i} className="text-xs flex gap-2 text-emerald-300">
                <CheckCircle2 size={11} className="shrink-0 mt-0.5" />{s}
              </div>
            ))}
            {((certData.weaknesses ?? []) as string[]).map((w: string, i: number) => (
              <div key={i} className="text-xs flex gap-2 text-red-300">
                <AlertTriangle size={11} className="shrink-0 mt-0.5" />{w}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!hasData && (
        <Card><CardContent className="p-4 text-sm text-muted-foreground text-center">No certification data — run certification to assess production readiness</CardContent></Card>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MemoryHealth() {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="p-6 max-w-5xl mx-auto w-full space-y-4">
        <div className="flex items-center gap-3">
          <ShieldCheck size={20} className="text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Memory Health</h1>
            <p className="text-xs text-muted-foreground">Validation · Replay · Backup · Performance · Certification</p>
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="h-8">
            <TabsTrigger value="overview"  className="text-xs h-6">Overview</TabsTrigger>
            <TabsTrigger value="validation" className="text-xs h-6">Validation</TabsTrigger>
            <TabsTrigger value="replay"    className="text-xs h-6">Replay</TabsTrigger>
            <TabsTrigger value="backup"    className="text-xs h-6">Backup</TabsTrigger>
            <TabsTrigger value="performance" className="text-xs h-6">Performance</TabsTrigger>
            <TabsTrigger value="certification" className="text-xs h-6">Certification</TabsTrigger>
          </TabsList>

          <TabsContent value="overview"     className="mt-4"><OverviewTab /></TabsContent>
          <TabsContent value="validation"   className="mt-4"><ValidationTab /></TabsContent>
          <TabsContent value="replay"       className="mt-4"><ReplayTab /></TabsContent>
          <TabsContent value="backup"       className="mt-4"><BackupTab /></TabsContent>
          <TabsContent value="performance"  className="mt-4"><PerformanceTab /></TabsContent>
          <TabsContent value="certification" className="mt-4"><CertificationTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
