import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSupervisorStatus,
  useGetSupervisorAlerts,
  useAcknowledgeAlert,
  useRunSupervisorChecks,
} from "@workspace/api-client-react";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Bell,
  BellOff,
  Activity,
  TrendingDown,
  BarChart2,
  Wifi,
  WifiOff,
  Cpu,
  Globe2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type CheckStatus = "ok" | "warning" | "critical";
type OverallHealth = "healthy" | "degraded" | "critical";

const CHECK_ICONS: Record<string, React.ElementType> = {
  "Bot State": Cpu,
  "Daily Loss": TrendingDown,
  "Weekly Loss": TrendingDown,
  "Drawdown": BarChart2,
  "Win Rate": Activity,
  "Profit Factor": BarChart2,
  "Market Regime": Globe2,
  "Price Feed": Wifi,
  "Analysis Feed": Globe2,
};

function statusColor(s: CheckStatus) {
  if (s === "critical") return "text-red-400";
  if (s === "warning") return "text-yellow-400";
  return "text-emerald-400";
}

function statusBg(s: CheckStatus) {
  if (s === "critical") return "bg-red-500/10 border-red-500/30";
  if (s === "warning") return "bg-yellow-500/10 border-yellow-500/30";
  return "bg-emerald-500/10 border-emerald-500/30";
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "critical") return <XCircle className="w-4 h-4 text-red-400" />;
  if (status === "warning") return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
  return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
}

function HealthBadge({ health }: { health: OverallHealth }) {
  if (health === "critical") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-sm font-bold uppercase tracking-widest">
        <ShieldX className="w-4 h-4" />
        CRITICAL
      </div>
    );
  }
  if (health === "degraded") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-sm font-bold uppercase tracking-widest">
        <ShieldAlert className="w-4 h-4" />
        DEGRADED
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-sm font-bold uppercase tracking-widest">
      <ShieldCheck className="w-4 h-4" />
      HEALTHY
    </div>
  );
}

function severityColor(s: string) {
  if (s === "critical") return "text-red-400 bg-red-500/10 border-red-500/30";
  if (s === "warning") return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
  return "text-blue-400 bg-blue-500/10 border-blue-500/30";
}

function severityDot(s: string) {
  if (s === "critical") return "bg-red-500";
  if (s === "warning") return "bg-yellow-500";
  return "bg-blue-500";
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export default function Supervisor() {
  const qc = useQueryClient();
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  const { data: status, isLoading: statusLoading } = useGetSupervisorStatus({
    query: { refetchInterval: 30_000 },
  });
  const { data: alerts = [], isLoading: alertsLoading } = useGetSupervisorAlerts(
    { unacknowledgedOnly: showAcknowledged ? undefined : true },
    { query: { refetchInterval: 15_000 } },
  );

  const acknowledge = useAcknowledgeAlert({
    mutation: { onSuccess: () => qc.invalidateQueries() },
  });
  const runChecks = useRunSupervisorChecks({
    mutation: { onSuccess: () => qc.invalidateQueries() },
  });

  const checks = status?.checks ?? [];
  const criticalChecks = checks.filter(c => c.status === "critical");
  const warningChecks = checks.filter(c => c.status === "warning");
  const okChecks = checks.filter(c => c.status === "ok");

  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-widest">Supervisor</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Autonomous strategy health monitor and auto-pause controller
          </p>
        </div>
        <div className="flex items-center gap-3">
          {status && <HealthBadge health={status.overallHealth} />}
          <Button
            variant="outline"
            size="sm"
            onClick={() => runChecks.mutate({})}
            disabled={runChecks.isPending}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${runChecks.isPending ? "animate-spin" : ""}`} />
            Run Checks
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Overall</p>
          <p className={`text-xl font-bold ${
            status?.overallHealth === "critical" ? "text-red-400" :
            status?.overallHealth === "degraded" ? "text-yellow-400" : "text-emerald-400"
          }`}>
            {statusLoading ? "—" : (status?.overallHealth ?? "—").toUpperCase()}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Critical</p>
          <p className={`text-xl font-bold ${criticalChecks.length > 0 ? "text-red-400" : "text-foreground"}`}>
            {criticalChecks.length} <span className="text-sm font-normal text-muted-foreground">checks</span>
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Warnings</p>
          <p className={`text-xl font-bold ${warningChecks.length > 0 ? "text-yellow-400" : "text-foreground"}`}>
            {warningChecks.length} <span className="text-sm font-normal text-muted-foreground">checks</span>
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Active Alerts</p>
          <p className={`text-xl font-bold ${(status?.activeAlertCount ?? 0) > 0 ? "text-yellow-400" : "text-foreground"}`}>
            {status?.activeAlertCount ?? "—"}
          </p>
        </div>
      </div>

      {/* Health Checks Grid */}
      <div className="bg-card border border-border rounded-lg">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Health Checks
          </h2>
          {status?.lastCheckedAt && (
            <span className="text-xs text-muted-foreground">
              Last checked {formatTimeAgo(status.lastCheckedAt)}
            </span>
          )}
        </div>
        {statusLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading health checks…</div>
        ) : checks.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No checks yet — click Run Checks to start</div>
        ) : (
          <div className="grid grid-cols-3 gap-px bg-border">
            {checks.map(check => {
              const Icon = CHECK_ICONS[check.name] ?? Activity;
              return (
                <div
                  key={check.name}
                  className={`p-4 bg-card flex items-start gap-3 border ${statusBg(check.status as CheckStatus)}`}
                >
                  <div className={`mt-0.5 p-1.5 rounded-md ${
                    check.status === "critical" ? "bg-red-500/20" :
                    check.status === "warning" ? "bg-yellow-500/20" : "bg-emerald-500/20"
                  }`}>
                    <Icon className={`w-4 h-4 ${statusColor(check.status as CheckStatus)}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        {check.name}
                      </span>
                      <StatusIcon status={check.status as CheckStatus} />
                    </div>
                    <p className="text-sm text-foreground leading-snug">{check.message}</p>
                    {check.value != null && check.threshold != null && (
                      <div className="mt-2">
                        <div className="h-1 bg-border rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              check.status === "critical" ? "bg-red-500" :
                              check.status === "warning" ? "bg-yellow-500" : "bg-emerald-500"
                            }`}
                            style={{
                              width: `${Math.min(
                                100,
                                check.name === "Win Rate" || check.name === "Profit Factor"
                                  ? (check.value / Math.max(check.value, 100)) * 100
                                  : Math.abs(check.threshold) > 0
                                    ? Math.min(100, (Math.abs(check.value) / Math.abs(check.threshold)) * 100)
                                    : 0,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Alert Feed */}
      <div className="bg-card border border-border rounded-lg">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Alert Feed
            {(status?.activeAlertCount ?? 0) > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-bold">
                {status?.activeAlertCount}
              </span>
            )}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAcknowledged(v => !v)}
            className="gap-2 text-xs"
          >
            {showAcknowledged ? <BellOff className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
            {showAcknowledged ? "Hide acknowledged" : "Show all"}
          </Button>
        </div>

        {alertsLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading alerts…</div>
        ) : alerts.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No active alerts</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {alerts.map(alert => (
              <div key={alert.id} className={`p-4 flex items-start gap-3 ${alert.acknowledged ? "opacity-40" : ""}`}>
                <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${severityDot(alert.severity)}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className={`text-xs font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border ${severityColor(alert.severity)}`}>
                      {alert.severity}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                      {alert.alertType.replace(/_/g, " ")}
                    </span>
                    {alert.pair && (
                      <span className="text-xs text-blue-400">{alert.pair}</span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatTimeAgo(alert.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">{alert.message}</p>
                  {alert.metric && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {alert.metric}: <span className="font-mono text-foreground">{alert.value?.toFixed(2)}</span>
                      {alert.threshold != null && (
                        <> (threshold: <span className="font-mono">{alert.threshold?.toFixed(2)}</span>)</>
                      )}
                    </p>
                  )}
                </div>
                {!alert.acknowledged && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => acknowledge.mutate({ id: alert.id })}
                    disabled={acknowledge.isPending}
                    className="text-xs flex-shrink-0"
                  >
                    Dismiss
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auto-pause rules reference */}
      <div className="bg-card border border-border rounded-lg">
        <div className="p-4 border-b border-border">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Auto-Pause Rules
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-4 p-4">
          {[
            { trigger: "Daily loss limit reached", action: "Halts bot, logs daily_halt event", severity: "critical" },
            { trigger: "Weekly loss limit reached", action: "Halts bot, logs weekly_halt event", severity: "critical" },
            { trigger: "Rolling win rate ≤ 25%", action: "Halts bot, critical alert fired", severity: "critical" },
            { trigger: "Rolling win rate ≤ 35%", action: "Warning alert, bot continues", severity: "warning" },
            { trigger: "Profit factor ≤ 0.70", action: "Halts bot, critical alert fired", severity: "critical" },
            { trigger: "Profit factor ≤ 1.00", action: "Warning alert — strategy losing net", severity: "warning" },
            { trigger: "Max drawdown ≥ 15%", action: "Halts bot, critical alert fired", severity: "critical" },
            { trigger: "Max drawdown ≥ 8%", action: "Warning alert, bot continues", severity: "warning" },
            { trigger: "Price feed stale (≥2 pairs)", action: "Critical alert, bot may missize", severity: "critical" },
            { trigger: "2+ pairs in unfavorable regime", action: "Warning alert — consider pausing", severity: "warning" },
          ].map(rule => (
            <div key={rule.trigger} className="flex items-start gap-3 p-3 bg-background rounded border border-border">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                rule.severity === "critical" ? "bg-red-500" : "bg-yellow-500"
              }`} />
              <div>
                <p className="text-sm font-medium text-foreground">{rule.trigger}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{rule.action}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
