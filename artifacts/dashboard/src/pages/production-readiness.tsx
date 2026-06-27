import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, AlertTriangle, SkipForward, Clock, Play, RefreshCw, Download, ChevronDown, ChevronUp } from "lucide-react";

type StageStatus = "pass" | "warn" | "fail" | "skip" | "running";
type Verdict = "production-ready" | "needs-work" | "not-ready";

interface Finding {
  level: "critical" | "warn" | "info";
  message: string;
}

interface StageResult {
  id: number;
  name: string;
  status: StageStatus;
  score: number;
  findings: Finding[];
  blockers: string[];
  durationMs: number;
  details: Record<string, unknown>;
}

interface CategoryScores {
  architecture: number;
  strategy: number;
  testing: number;
  dataQuality: number;
  riskManagement: number;
  performance: number;
  reliability: number;
}

interface PipelineResult {
  id: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  overallScore: number;
  verdict: Verdict;
  stages: StageResult[];
  categoryScores: CategoryScores;
  criticalBlockers: string[];
  recommendations: string[];
}

interface PipelineStatus {
  status: "idle" | "running" | "complete" | "failed";
  currentStage: number;
  totalStages: number;
  startedAt?: string;
  completedAt?: string;
  stages: Array<{ id: number; name: string; status: StageStatus }>;
  error?: string;
}

const API = "/api";

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function StageIcon({ status }: { status: StageStatus }) {
  const cls = "w-5 h-5 flex-shrink-0";
  switch (status) {
    case "pass": return <CheckCircle2 className={`${cls} text-emerald-500`} />;
    case "fail": return <XCircle className={`${cls} text-red-500`} />;
    case "warn": return <AlertTriangle className={`${cls} text-amber-500`} />;
    case "skip": return <SkipForward className={`${cls} text-muted-foreground`} />;
    case "running": return <RefreshCw className={`${cls} text-blue-400 animate-spin`} />;
    default: return <Clock className={`${cls} text-muted-foreground`} />;
  }
}

function statusColor(status: StageStatus): string {
  switch (status) {
    case "pass": return "border-emerald-500/40 bg-emerald-950/20";
    case "fail": return "border-red-500/40 bg-red-950/20";
    case "warn": return "border-amber-500/40 bg-amber-950/20";
    case "running": return "border-blue-500/40 bg-blue-950/20";
    default: return "border-border bg-card";
  }
}

function ScoreRing({ score, verdict }: { score: number; verdict: Verdict }) {
  const color = verdict === "production-ready" ? "#10b981" : verdict === "needs-work" ? "#f59e0b" : "#ef4444";
  const r = 54;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="12" />
        <circle
          cx="70" cy="70" r={r} fill="none"
          stroke={color} strokeWidth="12"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
        />
        <text x="70" y="65" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="28" fontWeight="bold">{score}</text>
        <text x="70" y="88" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="10">/100</text>
      </svg>
      <span style={{ color }} className="font-semibold text-sm uppercase tracking-wide">
        {verdict === "production-ready" ? "Production Ready" : verdict === "needs-work" ? "Needs Work" : "Not Ready"}
      </span>
    </div>
  );
}

function CategoryBar({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">{score}</span>
      </div>
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function StageCard({ stage }: { stage: StageResult }) {
  const [open, setOpen] = useState(false);
  const criticals = stage.findings.filter((f) => f.level === "critical");
  const warns = stage.findings.filter((f) => f.level === "warn");
  const infos = stage.findings.filter((f) => f.level === "info");

  return (
    <div className={`rounded-lg border p-4 transition-colors ${statusColor(stage.status)}`}>
      <button className="w-full text-left" onClick={() => setOpen((p) => !p)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StageIcon status={stage.status} />
            <div>
              <span className="font-medium text-sm">Stage {stage.id}: {stage.name}</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground font-mono">{stage.score}/100</span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">{fmtDuration(stage.durationMs)}</span>
                {stage.blockers.length > 0 && (
                  <span className="text-xs text-red-400">{stage.blockers.length} blocker{stage.blockers.length !== 1 ? "s" : ""}</span>
                )}
              </div>
            </div>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="mt-4 space-y-3 text-sm">
          {stage.blockers.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">Blockers</p>
              {stage.blockers.map((b, i) => (
                <p key={i} className="text-red-300 text-xs flex gap-2">
                  <span>🚫</span><span>{b}</span>
                </p>
              ))}
            </div>
          )}
          {criticals.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">Critical</p>
              {criticals.map((f, i) => (
                <p key={i} className="text-red-300 text-xs flex gap-2"><span>❌</span><span>{f.message}</span></p>
              ))}
            </div>
          )}
          {warns.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Warnings</p>
              {warns.map((f, i) => (
                <p key={i} className="text-amber-300 text-xs flex gap-2"><span>⚠️</span><span>{f.message}</span></p>
              ))}
            </div>
          )}
          {infos.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Info</p>
              {infos.map((f, i) => (
                <p key={i} className="text-muted-foreground text-xs flex gap-2"><span>ℹ️</span><span>{f.message}</span></p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProgressStages({ stages }: { stages: PipelineStatus["stages"] }) {
  return (
    <div className="space-y-2">
      {stages.map((s) => (
        <div key={s.id} className="flex items-center gap-3">
          <StageIcon status={s.status} />
          <span className="text-sm text-muted-foreground">Stage {s.id}: {s.name}</span>
          <span className={`ml-auto text-xs uppercase tracking-wide font-mono ${
            s.status === "pass" ? "text-emerald-400" :
            s.status === "fail" ? "text-red-400" :
            s.status === "warn" ? "text-amber-400" :
            s.status === "running" ? "text-blue-400" :
            "text-muted-foreground/40"
          }`}>{s.status}</span>
        </div>
      ))}
    </div>
  );
}

export default function ProductionReadiness() {
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/production-readiness/status`);
      if (!res.ok) return;
      const data: PipelineStatus = await res.json();
      setPipelineStatus(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  const fetchResult = useCallback(async () => {
    try {
      const res = await fetch(`${API}/production-readiness/latest`);
      if (res.ok) {
        setResult(await res.json());
      }
    } catch { /* no result yet */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchResult();
  }, [fetchStatus, fetchResult]);

  useEffect(() => {
    if (pipelineStatus?.status !== "running") return;
    const interval = setInterval(async () => {
      const status = await fetchStatus();
      if (status?.status === "complete" || status?.status === "failed") {
        clearInterval(interval);
        if (status.status === "complete") await fetchResult();
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [pipelineStatus?.status, fetchStatus, fetchResult]);

  const handleRun = async () => {
    setIsStarting(true);
    setError(null);
    try {
      const res = await fetch(`${API}/production-readiness/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to start pipeline");
      } else {
        await fetchStatus();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setIsStarting(false);
    }
  };

  const handleDownloadReport = async () => {
    const res = await fetch(`${API}/production-readiness/report`);
    if (!res.ok) return;
    const text = await res.text();
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "PRODUCTION_READINESS_REPORT.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const isRunning = pipelineStatus?.status === "running";
  const isComplete = pipelineStatus?.status === "complete" || pipelineStatus?.status === "failed";
  const cats = result?.categoryScores;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Production Readiness</h1>
          <p className="text-muted-foreground text-sm mt-1">
            8-stage automated validation — code, strategy, historical, walk-forward, Monte Carlo, risk, data, and scoring
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {result && (
            <button
              onClick={handleDownloadReport}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-sidebar-accent/50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Report
            </button>
          )}
          <button
            onClick={handleRun}
            disabled={isRunning || isStarting}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Running…</>
            ) : (
              <><Play className="w-4 h-4" /> Run Pipeline</>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/20 p-3 text-sm text-red-400">{error}</div>
      )}

      {isRunning && pipelineStatus && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
              Pipeline running — Stage {pipelineStatus.currentStage} of {pipelineStatus.totalStages}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ProgressStages stages={pipelineStatus.stages} />
          </CardContent>
        </Card>
      )}

      {!isRunning && !result && pipelineStatus?.status === "idle" && (
        <Card>
          <CardContent className="pt-12 pb-12 text-center space-y-3">
            <p className="text-muted-foreground">No pipeline results yet.</p>
            <p className="text-sm text-muted-foreground/60">
              Click <strong>Run Pipeline</strong> to validate your system across all 8 stages.
              The first run takes 5–15 minutes depending on data availability.
            </p>
          </CardContent>
        </Card>
      )}

      {pipelineStatus?.status === "failed" && (
        <Card className="border-red-500/40 bg-red-950/20">
          <CardContent className="pt-4 pb-4">
            <p className="text-red-400 text-sm">Pipeline failed: {pipelineStatus.error}</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="md:col-span-1 flex items-center justify-center py-6">
              <ScoreRing score={result.overallScore} verdict={result.verdict} />
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Score by Category</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {cats && (
                  <>
                    <CategoryBar label="Architecture" score={cats.architecture} />
                    <CategoryBar label="Strategy" score={cats.strategy} />
                    <CategoryBar label="Testing" score={cats.testing} />
                    <CategoryBar label="Data Quality" score={cats.dataQuality} />
                    <CategoryBar label="Risk Management" score={cats.riskManagement} />
                    <CategoryBar label="Performance" score={cats.performance} />
                    <CategoryBar label="Reliability" score={cats.reliability} />
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {result.criticalBlockers.length > 0 && (
            <Card className="border-red-500/40 bg-red-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-red-400 uppercase tracking-wide flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  Critical Blockers — must be fixed before deployment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.criticalBlockers.map((b, i) => (
                  <div key={i} className="flex gap-2 text-sm text-red-300">
                    <span>🚫</span>
                    <span>{b}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {result.criticalBlockers.length === 0 && (
            <Card className="border-emerald-500/40 bg-emerald-950/20">
              <CardContent className="pt-4 pb-4">
                <p className="text-emerald-400 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  No critical blockers detected — all mandatory checks passed
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Stage Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {result.stages.map((stage) => (
                <StageCard key={stage.id} stage={stage} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Recommendations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {result.recommendations.map((rec, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <span className="text-muted-foreground font-mono text-xs mt-0.5">{String(i + 1).padStart(2, "0")}</span>
                  <span>{rec}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="text-xs text-muted-foreground/50 text-center">
            Last run: {new Date(result.completedAt).toLocaleString()} · Duration: {fmtDuration(result.durationMs)} · ID: {result.id.slice(0, 8)}
          </div>
        </>
      )}
    </div>
  );
}
