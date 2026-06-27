import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Shield, 
  Server, 
  Zap, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Activity,
  ToggleLeft,
  ToggleRight,
  Lock,
  Unlock,
  Wifi,
  WifiOff,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const API = "/api";

type DeploymentMode = "paper" | "demo" | "live";

interface DeploymentStatus {
  currentMode: DeploymentMode;
  liveEnabled: boolean;
  running: boolean;
  readinessScore: number | null;
  brokerAccountsConfigured: number;
  demoAccountsConfigured: number;
  liveAccountsConfigured: number;
  canSwitchToDemo: boolean;
  canSwitchToLive: boolean;
  blockers: string[];
  warnings: string[];
}

interface SafetyConfig {
  maxSpreadPips: number;
  maxSlippagePips: number;
  connectionTimeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  partialFillThresholdPct: number;
  reconciliationIntervalSec: number;
  enableSpreadFilter: boolean;
  enableSlippageProtection: boolean;
  enableConnectionMonitor: boolean;
  enableAutoRetry: boolean;
  enablePartialFillHandling: boolean;
  enableReconciliation: boolean;
  updatedAt: string;
}

interface HealthMetric {
  name: string;
  value: number | null;
  status: "healthy" | "degraded" | "critical" | "insufficient_data";
  message: string;
  threshold?: number;
}

interface StrategyHealthReport {
  overallScore: number;
  status: "healthy" | "degraded" | "critical";
  metrics: HealthMetric[];
  alerts: string[];
  snapshotAt: string;
  totalTrades: number;
  openTrades: number;
}

interface ConnectionHealth {
  status: "connected" | "degraded" | "disconnected" | "unknown";
  latencyMs: number | null;
  lastChecked: string;
  consecutiveFailures: number;
  message: string;
}

function modeColor(mode: DeploymentMode) {
  if (mode === "live") return "text-red-400 border-red-400/40 bg-red-400/10";
  if (mode === "demo") return "text-yellow-400 border-yellow-400/40 bg-yellow-400/10";
  return "text-emerald-400 border-emerald-400/40 bg-emerald-400/10";
}

function statusBadge(status: HealthMetric["status"]) {
  if (status === "healthy") return <span className="text-xs px-2 py-0.5 rounded bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">Healthy</span>;
  if (status === "degraded") return <span className="text-xs px-2 py-0.5 rounded bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">Degraded</span>;
  if (status === "critical") return <span className="text-xs px-2 py-0.5 rounded bg-red-400/10 text-red-400 border border-red-400/20">Critical</span>;
  return <span className="text-xs px-2 py-0.5 rounded bg-zinc-700 text-zinc-400 border border-zinc-600">No Data</span>;
}

function connHealthIcon(status: ConnectionHealth["status"]) {
  if (status === "connected") return <Wifi className="w-4 h-4 text-emerald-400" />;
  if (status === "degraded") return <Activity className="w-4 h-4 text-yellow-400" />;
  return <WifiOff className="w-4 h-4 text-red-400" />;
}

export default function DeploymentPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [safetyEditing, setSafetyEditing] = useState(false);
  const [safetyDraft, setSafetyDraft] = useState<Partial<SafetyConfig>>({});

  const { data: status, isLoading: statusLoading } = useQuery<DeploymentStatus>({
    queryKey: ["/api/deployment/status"],
    queryFn: () => fetch(`${API}/deployment/status`).then(r => r.json()),
    refetchInterval: 10_000,
  });

  const { data: health } = useQuery<StrategyHealthReport>({
    queryKey: ["/api/deployment/strategy-health"],
    queryFn: () => fetch(`${API}/deployment/strategy-health`).then(r => r.json()),
    refetchInterval: 60_000,
  });

  const { data: connHealth, refetch: refetchConn } = useQuery<ConnectionHealth>({
    queryKey: ["/api/deployment/connection-health"],
    queryFn: () => fetch(`${API}/deployment/connection-health`).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const { data: safetyCfg } = useQuery<SafetyConfig>({
    queryKey: ["/api/deployment/safety-config"],
    queryFn: () => fetch(`${API}/deployment/safety-config`).then(r => r.json()),
  });

  const { data: snapshots } = useQuery<any[]>({
    queryKey: ["/api/deployment/strategy-health/snapshots"],
    queryFn: () => fetch(`${API}/deployment/strategy-health/snapshots?limit=24`).then(r => r.json()),
    refetchInterval: 120_000,
  });

  const { data: recoveryLog } = useQuery<any[]>({
    queryKey: ["/api/deployment/recovery-log"],
    queryFn: () => fetch(`${API}/deployment/recovery-log?limit=20`).then(r => r.json()),
  });

  const switchMode = useMutation({
    mutationFn: (mode: DeploymentMode) =>
      fetch(`${API}/deployment/mode`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: `Switched to ${data.newMode} mode`, description: data.message });
        qc.invalidateQueries({ queryKey: ["/api/deployment/status"] });
      } else {
        toast({ title: "Mode switch blocked", description: data.blockers?.[0] ?? data.message, variant: "destructive" });
      }
    },
  });

  const toggleLiveGate = useMutation({
    mutationFn: (enabled: boolean) =>
      fetch(`${API}/deployment/live-gate`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      }).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: data.liveEnabled ? "Live gate ENABLED" : "Live gate disabled", description: data.liveEnabled ? "Live trading is now armed. Use with care." : "Live trading is now safely disabled." });
      qc.invalidateQueries({ queryKey: ["/api/deployment/status"] });
    },
  });

  const reconcile = useMutation({
    mutationFn: () => fetch(`${API}/deployment/reconcile`, { method: "POST" }).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: data.reconciled ? "Positions reconciled" : "Reconciliation found discrepancies", description: data.actionsTaken?.[0] });
      qc.invalidateQueries({ queryKey: ["/api/deployment/status"] });
    },
  });

  const updateSafety = useMutation({
    mutationFn: (cfg: Partial<SafetyConfig>) =>
      fetch(`${API}/deployment/safety-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Safety config updated" });
      setSafetyEditing(false);
      setSafetyDraft({});
      qc.invalidateQueries({ queryKey: ["/api/deployment/safety-config"] });
    },
  });

  const snapData = (snapshots ?? []).slice().reverse().map(s => ({
    time: new Date(s.snapshotAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    score: s.overallHealthScore,
    winRate: s.winRateRolling20,
    drawdown: s.maxDrawdownPct,
  }));

  if (statusLoading) {
    return <div className="p-8 text-zinc-400">Loading deployment status…</div>;
  }

  const cfg = safetyCfg ?? ({} as SafetyConfig);
  const draft = { ...cfg, ...safetyDraft };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6 border-b border-border flex items-center gap-3">
        <Server className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Deployment Manager</h1>
          <p className="text-xs text-muted-foreground">Mode control, broker safety, strategy health monitoring</p>
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-6xl">
        {/* Mode Selector */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Deployment Mode</h2>
          <div className="grid grid-cols-3 gap-4">
            {(["paper", "demo", "live"] as DeploymentMode[]).map(mode => {
              const isActive = status?.currentMode === mode;
              const canSwitch = mode === "paper" || (mode === "demo" && status?.canSwitchToDemo) || (mode === "live" && status?.canSwitchToLive);
              return (
                <button
                  key={mode}
                  onClick={() => !isActive && switchMode.mutate(mode)}
                  disabled={isActive || switchMode.isPending || status?.running}
                  className={`relative p-4 rounded-lg border text-left transition-all ${
                    isActive
                      ? `${modeColor(mode)} font-semibold`
                      : canSwitch
                      ? "border-border hover:border-primary/50 hover:bg-muted/40 cursor-pointer"
                      : "border-border opacity-40 cursor-not-allowed"
                  }`}
                >
                  {isActive && (
                    <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-widest opacity-70">Active</span>
                  )}
                  <div className="text-base font-bold capitalize mb-1">{mode}</div>
                  <div className="text-xs text-muted-foreground">
                    {mode === "paper" && "Simulated orders, no real money"}
                    {mode === "demo" && "Real broker, demo account"}
                    {mode === "live" && "Real broker, real capital"}
                  </div>
                  {mode === "live" && !canSwitch && (
                    <div className="flex items-center gap-1 mt-2 text-[11px] text-red-400">
                      <Lock className="w-3 h-3" /> Locked — requirements not met
                    </div>
                  )}
                  {mode === "live" && canSwitch && (
                    <div className="flex items-center gap-1 mt-2 text-[11px] text-emerald-400">
                      <Unlock className="w-3 h-3" /> Requirements met
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Blockers / warnings */}
          {(status?.blockers?.length ?? 0) > 0 && (
            <div className="mt-3 space-y-1">
              {status!.blockers.map((b, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-red-400 bg-red-400/5 border border-red-400/20 rounded p-2">
                  <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {b}
                </div>
              ))}
            </div>
          )}
          {(status?.warnings?.length ?? 0) > 0 && (
            <div className="mt-3 space-y-1">
              {status!.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-yellow-400 bg-yellow-400/5 border border-yellow-400/20 rounded p-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {w}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Live Gate + Stats */}
        <div className="grid grid-cols-2 gap-4">
          <section className="bg-card border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" /> Live Trading Gate
            </h2>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-2xl font-bold ${status?.liveEnabled ? "text-red-400" : "text-emerald-400"}`}>
                  {status?.liveEnabled ? "ARMED" : "SAFE"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {status?.liveEnabled ? "Live trading is explicitly enabled" : "Live trading is disabled (safe default)"}
                </div>
              </div>
              <button
                onClick={() => toggleLiveGate.mutate(!status?.liveEnabled)}
                disabled={toggleLiveGate.isPending}
                className="p-2 hover:bg-muted rounded"
              >
                {status?.liveEnabled
                  ? <ToggleRight className="w-8 h-8 text-red-400" />
                  : <ToggleLeft className="w-8 h-8 text-zinc-500" />
                }
              </button>
            </div>
            {status?.liveEnabled && (
              <div className="mt-3 text-[11px] text-red-400/80 bg-red-400/5 border border-red-400/20 rounded p-2">
                ⚠ Live gate is armed. Real capital will be at risk if live mode is activated.
              </div>
            )}
          </section>

          <section className="bg-card border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Wifi className="w-4 h-4 text-primary" /> Broker Connection
            </h2>
            <div className="flex items-center gap-2 mb-2">
              {connHealth && connHealthIcon(connHealth.status)}
              <span className={`text-lg font-bold capitalize ${connHealth?.status === "connected" ? "text-emerald-400" : connHealth?.status === "degraded" ? "text-yellow-400" : "text-red-400"}`}>
                {connHealth?.status ?? "—"}
              </span>
              <button onClick={() => refetchConn()} className="ml-auto p-1 hover:bg-muted rounded">
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            <div className="text-xs text-muted-foreground">{connHealth?.message}</div>
            <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
              <span>Latency: {connHealth?.latencyMs != null ? `${connHealth.latencyMs}ms` : "—"}</span>
              <span>Failures: {connHealth?.consecutiveFailures ?? 0}</span>
            </div>
            <button
              onClick={() => reconcile.mutate()}
              disabled={reconcile.isPending}
              className="mt-3 w-full text-xs py-1.5 rounded border border-border hover:bg-muted transition-colors"
            >
              {reconcile.isPending ? "Reconciling…" : "Reconcile Positions"}
            </button>
          </section>
        </div>

        {/* Strategy Health */}
        {health && (
          <section className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> Strategy Health
              </h2>
              <div className={`text-2xl font-bold ${health.status === "healthy" ? "text-emerald-400" : health.status === "degraded" ? "text-yellow-400" : "text-red-400"}`}>
                {health.overallScore}/100
              </div>
            </div>

            {health.alerts.length > 0 && (
              <div className="mb-4 space-y-1">
                {health.alerts.map((a, i) => (
                  <div key={i} className="text-xs text-yellow-400 bg-yellow-400/5 border border-yellow-400/20 rounded px-2 py-1.5">{a}</div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 mb-4">
              {health.metrics.map(m => (
                <div key={m.name} className="flex items-start justify-between p-2 rounded bg-muted/30 border border-border/50">
                  <div>
                    <div className="text-xs font-medium">{m.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{m.message}</div>
                  </div>
                  <div className="ml-2 flex-shrink-0">{statusBadge(m.status)}</div>
                </div>
              ))}
            </div>

            {snapData.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-2">Health Score History</div>
                <ResponsiveContainer width="100%" height={100}>
                  <LineChart data={snapData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#888" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#888" }} />
                    <Tooltip contentStyle={{ background: "#1c1c1c", border: "1px solid #333", fontSize: 11 }} />
                    <Line type="monotone" dataKey="score" stroke="#10b981" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        )}

        {/* Safety Config */}
        <section className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Broker Safety Layer
            </h2>
            {!safetyEditing ? (
              <button onClick={() => setSafetyEditing(true)} className="text-xs px-3 py-1 rounded border border-border hover:bg-muted">Edit</button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => { setSafetyEditing(false); setSafetyDraft({}); }} className="text-xs px-3 py-1 rounded border border-border hover:bg-muted">Cancel</button>
                <button onClick={() => updateSafety.mutate(draft)} disabled={updateSafety.isPending} className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90">Save</button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Thresholds</div>
              {[
                { label: "Max Spread (pips)", key: "maxSpreadPips", type: "number" },
                { label: "Max Slippage (pips)", key: "maxSlippagePips", type: "number" },
                { label: "Min Fill %", key: "partialFillThresholdPct", type: "number" },
                { label: "Max Retries", key: "maxRetries", type: "number" },
                { label: "Retry Delay (ms)", key: "retryDelayMs", type: "number" },
                { label: "Reconcile Interval (s)", key: "reconciliationIntervalSec", type: "number" },
              ].map(({ label, key }) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground text-xs">{label}</span>
                  {safetyEditing ? (
                    <input
                      type="number"
                      value={(draft as any)[key] ?? ""}
                      onChange={e => setSafetyDraft(d => ({ ...d, [key]: parseFloat(e.target.value) }))}
                      className="w-24 text-right bg-muted border border-border rounded px-2 py-0.5 text-xs"
                    />
                  ) : (
                    <span className="font-mono text-xs">{(cfg as any)[key] ?? "—"}</span>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Protections</div>
              {[
                { label: "Spread Filter", key: "enableSpreadFilter" },
                { label: "Slippage Protection", key: "enableSlippageProtection" },
                { label: "Connection Monitor", key: "enableConnectionMonitor" },
                { label: "Auto-Retry", key: "enableAutoRetry" },
                { label: "Partial Fill Handling", key: "enablePartialFillHandling" },
                { label: "Position Reconciliation", key: "enableReconciliation" },
              ].map(({ label, key }) => {
                const val = (draft as any)[key];
                return (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    {safetyEditing ? (
                      <button
                        onClick={() => setSafetyDraft(d => ({ ...d, [key]: !val }))}
                        className={`px-2 py-0.5 rounded text-[11px] border ${val ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10" : "text-zinc-500 border-zinc-600"}`}
                      >
                        {val ? "ON" : "OFF"}
                      </button>
                    ) : (
                      val ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-zinc-600" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Recovery Log */}
        {(recoveryLog?.length ?? 0) > 0 && (
          <section className="bg-card border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> Recovery Log
            </h2>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {recoveryLog!.map(e => (
                <div key={e.id} className={`flex items-start gap-2 text-xs px-2 py-1.5 rounded ${e.success ? "text-zinc-300" : "text-red-400 bg-red-400/5"}`}>
                  {e.success ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-400 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                  <span className="flex-1">{e.event}</span>
                  {e.error && <span className="text-red-400/70 truncate max-w-[200px]">{e.error}</span>}
                  <span className="text-muted-foreground flex-shrink-0">{new Date(e.createdAt).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
