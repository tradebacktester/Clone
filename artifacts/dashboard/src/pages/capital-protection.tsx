import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert, ShieldCheck, ShieldOff, AlertTriangle, TrendingDown,
  Activity, Server, Wifi, BarChart2, RefreshCw, Settings, Clock,
  CheckCircle, XCircle, ChevronDown, ChevronUp, Zap, Lock,
} from "lucide-react";

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchJson(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function postJson(url: string, body: any) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ProtectionLevel =
  | "normal" | "caution" | "restricted" | "observation_mode"
  | "protected_mode" | "emergency_mode" | "trading_halt";

// ─── Colours ──────────────────────────────────────────────────────────────────

const LEVEL_COLOR: Record<string, string> = {
  normal:           "text-green-400",
  caution:          "text-yellow-400",
  restricted:       "text-orange-400",
  observation_mode: "text-orange-500",
  protected_mode:   "text-red-400",
  emergency_mode:   "text-red-500",
  trading_halt:     "text-red-700",
};
const LEVEL_BG: Record<string, string> = {
  normal:           "bg-green-900/30 border-green-700/40",
  caution:          "bg-yellow-900/30 border-yellow-700/40",
  restricted:       "bg-orange-900/30 border-orange-700/40",
  observation_mode: "bg-orange-900/40 border-orange-600/50",
  protected_mode:   "bg-red-900/30 border-red-700/40",
  emergency_mode:   "bg-red-900/50 border-red-600/60",
  trading_halt:     "bg-red-950/60 border-red-700/70",
};
const SEV_COLOR: Record<string, string> = {
  normal:    "text-green-400",
  caution:   "text-yellow-400",
  warning:   "text-orange-400",
  critical:  "text-red-400",
  emergency: "text-red-600",
};

function SevBadge({ s }: { s: string }) {
  return (
    <span className={`text-xs font-semibold uppercase px-2 py-0.5 rounded ${SEV_COLOR[s] ?? "text-gray-400"} bg-zinc-800 border border-zinc-700`}>
      {s}
    </span>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",    label: "Overview",    icon: ShieldAlert },
  { id: "monitors",   label: "Monitors",    icon: Activity },
  { id: "drawdown",   label: "Drawdown",    icon: TrendingDown },
  { id: "exposure",   label: "Exposure",    icon: BarChart2 },
  { id: "margin",     label: "Margin",      icon: Lock },
  { id: "broker",     label: "Broker",      icon: Wifi },
  { id: "history",    label: "History",     icon: Clock },
  { id: "config",     label: "Config",      icon: Settings },
  { id: "recovery",   label: "Recovery",    icon: RefreshCw },
  { id: "report",     label: "Report",      icon: CheckCircle },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color = "text-white" }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

function MonitorRow({ label, data }: { label: string; data: any }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const health = typeof data.healthScore === "number" ? data.healthScore : 0;
  const barColor = health >= 80 ? "bg-green-500" : health >= 50 ? "bg-yellow-500" : health >= 25 ? "bg-orange-500" : "bg-red-600";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-3">
          <SevBadge s={data.severity} />
          <span className="text-sm font-medium text-zinc-200">{label}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className={`text-sm font-mono font-bold ${SEV_COLOR[data.severity] ?? "text-white"}`}>
              {health.toFixed(0)}
            </div>
            <div className="text-xs text-zinc-500">health</div>
          </div>
          <div className="w-24 h-2 bg-zinc-700 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${health}%` }} />
          </div>
          {open ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
        </div>
      </div>
      {open && (
        <div className="mt-3 pt-3 border-t border-zinc-800 space-y-1">
          {data.evidence?.map((e: string, i: number) => (
            <div key={i} className="text-xs text-zinc-400 font-mono">• {e}</div>
          ))}
          {(data.triggeredLimits ?? data.criticalFailures ?? data.triggeredChecks ?? []).map((t: string, i: number) => (
            <div key={i} className="text-xs text-red-400 font-mono">⚠ {t}</div>
          ))}
          {data.actions?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {data.actions.map((a: string, i: number) => (
                <span key={i} className="text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-zinc-300">
                  {a.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionCard({ action }: { action: any }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-start justify-between cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div>
          <div className="flex items-center gap-2">
            <SevBadge s={action.severity} />
            <span className="text-sm font-semibold text-zinc-100">{action.label}</span>
          </div>
          <div className="text-xs text-zinc-500 mt-1">Trigger: {action.trigger}</div>
        </div>
        <div className="flex items-center gap-2">
          {action.isReversible
            ? <span className="text-xs text-green-400">Reversible</span>
            : <span className="text-xs text-red-400">Permanent</span>}
          {open ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
        </div>
      </div>
      {open && (
        <div className="mt-3 pt-3 border-t border-zinc-800 space-y-2 text-xs text-zinc-400 font-mono">
          <div><span className="text-zinc-300">Threshold:</span> {action.thresholdCrossed}</div>
          <div><span className="text-zinc-300">Benefit:</span> {action.expectedBenefit}</div>
          {action.parameterChange && (
            <div>
              <span className="text-zinc-300">Parameter change:</span>{" "}
              {action.parameterChange.parameter}: {String(action.parameterChange.from)} → {String(action.parameterChange.to)}
            </div>
          )}
          <div>
            <span className="text-zinc-300">Recovery:</span>{" "}
            {action.recoveryRequirements?.hoursRequired}h required
          </div>
          {action.recoveryRequirements?.criteriaRequired?.map((c: string, i: number) => (
            <div key={i} className="text-zinc-500">  • {c}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CapitalProtection() {
  const [tab, setTab]   = useState("overview");
  const [pair, setPair] = useState("EURUSD");
  const qc = useQueryClient();

  const { data: protData, isLoading: protLoading, refetch: refetchProt } = useQuery({
    queryKey: ["cp-protection", pair],
    queryFn: () => fetchJson(`/api/risk/protection?pair=${pair}&session=london`),
    refetchInterval: 60_000,
  });

  const { data: histData } = useQuery({
    queryKey: ["cp-history"],
    queryFn: () => fetchJson("/api/risk/protection/history?limit=20"),
    refetchInterval: 120_000,
  });

  const { data: actData } = useQuery({
    queryKey: ["cp-actions"],
    queryFn: () => fetchJson("/api/risk/protection/actions?limit=20"),
    refetchInterval: 120_000,
  });

  const { data: statusData } = useQuery({
    queryKey: ["cp-status"],
    queryFn: () => fetchJson("/api/risk/protection/status"),
    refetchInterval: 30_000,
  });

  const { data: reportData } = useQuery({
    queryKey: ["cp-report", pair],
    queryFn: () => fetchJson(`/api/risk/protection/report?pair=${pair}&session=london`),
    enabled: tab === "report",
  });

  const cfgMutation = useMutation({
    mutationFn: (cfg: any) => postJson("/api/risk/protection/config", cfg),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cp-protection"] }); },
  });

  const prot  = protData?.data;
  const mon   = prot?.monitors;
  const level = prot?.protectionLevel ?? statusData?.data?.protectionLevel ?? "normal";
  const levelLabel = prot?.protectionLevelLabel ?? statusData?.data?.protectionLevelLabel ?? "Normal";

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldAlert className="text-red-400" size={24} />
            <div>
              <h1 className="text-lg font-bold">Capital Protection & Survival Engine</h1>
              <p className="text-xs text-zinc-500">Automatic capital protection — advisory only, never modifies strategy</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm"
              value={pair}
              onChange={e => setPair(e.target.value)}
            >
              <option value="EURUSD">EUR/USD</option>
              <option value="GBPUSD">GBP/USD</option>
              <option value="USDJPY">USD/JPY</option>
            </select>
            <button
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-4 py-1.5 rounded text-sm transition-colors"
              onClick={() => refetchProt()}
              disabled={protLoading}
            >
              <RefreshCw size={14} className={protLoading ? "animate-spin" : ""} />
              Evaluate
            </button>
          </div>
        </div>

        {/* Protection level banner */}
        <div className={`mt-4 rounded-lg border p-4 ${LEVEL_BG[level] ?? "bg-zinc-900 border-zinc-800"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {level === "normal" ? <ShieldCheck size={28} className="text-green-400" /> :
               level === "trading_halt" ? <ShieldOff size={28} className="text-red-700" /> :
               <ShieldAlert size={28} className={LEVEL_COLOR[level]} />}
              <div>
                <div className={`text-xl font-bold ${LEVEL_COLOR[level]}`}>
                  {levelLabel.toUpperCase()}
                </div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  {prot?.explainability?.summary ?? "Run evaluation to see current protection status"}
                </div>
              </div>
            </div>
            <div className="text-right text-xs text-zinc-500">
              <div>{prot?.activeActions?.length ?? 0} active protective action{(prot?.activeActions?.length ?? 0) !== 1 ? "s" : ""}</div>
              <div className="mt-1">
                {prot?.evaluatedAt ? new Date(prot.evaluatedAt).toLocaleTimeString() : "—"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-800 px-6 flex gap-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.id
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={12} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* ── Overview ── */}
        {tab === "overview" && (
          <>
            {/* Key metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                label="Protection Level"
                value={levelLabel}
                color={LEVEL_COLOR[level]}
                sub={`Score: ${prot?.protectionLevelScore ?? 0}/6`}
              />
              <MetricCard
                label="Active Actions"
                value={prot?.activeActions?.length ?? 0}
                color={(prot?.activeActions?.length ?? 0) > 0 ? "text-orange-400" : "text-green-400"}
                sub="protective measures"
              />
              <MetricCard
                label="Drawdown"
                value={`${(mon?.drawdown?.currentDrawdownPct ?? 0).toFixed(2)}%`}
                color={(mon?.drawdown?.currentDrawdownPct ?? 0) > 10 ? "text-red-400" : "text-zinc-200"}
                sub={`Max: ${(mon?.drawdown?.maxDrawdownPct ?? 0).toFixed(2)}%`}
              />
              <MetricCard
                label="Consecutive Losses"
                value={mon?.consecutiveLoss?.consecutiveLosses ?? 0}
                color={(mon?.consecutiveLoss?.consecutiveLosses ?? 0) >= 5 ? "text-red-400" : "text-zinc-200"}
                sub={`${mon?.consecutiveLoss?.consecutiveWins ?? 0} consecutive wins`}
              />
            </div>

            {/* Active protection actions */}
            {prot?.activeActions?.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                  <Zap size={14} className="text-orange-400" /> Active Protective Actions
                </h2>
                <div className="space-y-3">
                  {prot.activeActions.map((a: any) => <ActionCard key={a.actionId} action={a} />)}
                </div>
              </div>
            )}

            {/* Explainability */}
            {prot?.explainability && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-3">
                <h2 className="text-sm font-semibold text-zinc-300">Level Justification</h2>
                <p className="text-sm text-zinc-400">{prot.explainability.levelJustification}</p>
                <div className="text-xs text-zinc-500 font-mono border-t border-zinc-800 pt-3">
                  Primary trigger: {prot.explainability.primaryTrigger}
                </div>
              </div>
            )}

            {/* Monitor summary grid */}
            {mon && (
              <div>
                <h2 className="text-sm font-semibold text-zinc-300 mb-3">Monitor Summary</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { k: "account",        label: "Account" },
                    { k: "consecutiveLoss",label: "Consec. Loss" },
                    { k: "drawdown",       label: "Drawdown" },
                    { k: "exposure",       label: "Exposure" },
                    { k: "margin",         label: "Margin" },
                    { k: "broker",         label: "Broker" },
                    { k: "system",         label: "System" },
                  ].map(({ k, label }) => {
                    const m = (mon as any)[k];
                    if (!m) return null;
                    return (
                      <div key={k} className="bg-zinc-900 border border-zinc-800 rounded p-3">
                        <div className="text-xs text-zinc-500 mb-1">{label}</div>
                        <div className={`text-sm font-bold ${SEV_COLOR[m.severity]}`}>
                          {m.severity.toUpperCase()}
                        </div>
                        <div className="text-xs text-zinc-400 mt-1">
                          Health: {m.healthScore?.toFixed(0) ?? "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Monitors ── */}
        {tab === "monitors" && mon && (
          <div className="space-y-3">
            <MonitorRow label="Account Protection"  data={mon.account} />
            <MonitorRow label="Consecutive Loss"    data={mon.consecutiveLoss} />
            <MonitorRow label="Drawdown Protection" data={mon.drawdown} />
            <MonitorRow label="Exposure Protection" data={mon.exposure} />
            <MonitorRow label="Margin Protection"   data={mon.margin} />
            <MonitorRow label="Broker Protection"   data={mon.broker} />
            <MonitorRow label="System Protection"   data={mon.system} />
          </div>
        )}

        {/* ── Drawdown ── */}
        {tab === "drawdown" && mon?.drawdown && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard label="Current Drawdown" value={`${mon.drawdown.currentDrawdownPct.toFixed(2)}%`}
                color={mon.drawdown.currentDrawdownPct > 12 ? "text-red-400" : mon.drawdown.currentDrawdownPct > 5 ? "text-orange-400" : "text-green-400"} />
              <MetricCard label="Max Drawdown" value={`${mon.drawdown.maxDrawdownPct.toFixed(2)}%`} />
              <MetricCard label="Velocity" value={`${mon.drawdown.drawdownVelocity.toFixed(3)}%/h`}
                color={mon.drawdown.drawdownVelocity > 0.5 ? "text-orange-400" : "text-zinc-200"} sub="% per hour" />
              <MetricCard label="Recovery Rate" value={`${mon.drawdown.recoveryRate.toFixed(3)}%/h`}
                color={mon.drawdown.recoveryRate > 0 ? "text-green-400" : "text-zinc-200"} sub="% per hour" />
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <h3 className="text-sm font-semibold mb-3">Threshold Status</h3>
              {[
                { label: "Warning",   pct: prot?.config?.drawdownWarningPercent   ?? 5 },
                { label: "Elevated",  pct: prot?.config?.drawdownElevatedPercent  ?? 8 },
                { label: "Critical",  pct: prot?.config?.drawdownCriticalPercent  ?? 12 },
                { label: "Emergency", pct: prot?.config?.drawdownEmergencyPercent ?? 15 },
              ].map(({ label, pct }) => {
                const dd = mon.drawdown.currentDrawdownPct;
                const hit = dd >= pct;
                return (
                  <div key={label} className="flex items-center gap-3 mb-2">
                    {hit ? <XCircle size={14} className="text-red-400" /> : <CheckCircle size={14} className="text-green-400" />}
                    <span className="text-xs text-zinc-400 w-20">{label}</span>
                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${hit ? "bg-red-500" : "bg-green-500"}`}
                        style={{ width: `${Math.min(100, (dd / pct) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-zinc-500">{dd.toFixed(2)}% / {pct}%</span>
                  </div>
                );
              })}
              <div className="mt-3 pt-3 border-t border-zinc-800">
                <div className="text-xs text-zinc-400 font-mono">
                  Threshold crossed: <span className="text-zinc-200">{mon.drawdown.thresholdCrossed}</span>
                </div>
              </div>
            </div>
            <MonitorRow label="Drawdown Detail" data={mon.drawdown} />
          </div>
        )}

        {/* ── Exposure ── */}
        {tab === "exposure" && mon?.exposure && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard label="Total Open Risk" value={`${mon.exposure.totalOpenRiskPct.toFixed(2)}%`}
                color={mon.exposure.totalOpenRiskPct > (prot?.config?.maxOpenRiskPercent ?? 6) ? "text-red-400" : "text-zinc-200"} />
              <MetricCard label="Max Pair Exposure" value={`${mon.exposure.maxPairExposurePct.toFixed(2)}%`} />
              <MetricCard label="Correlation" value={`${(mon.exposure.correlationScore * 100).toFixed(1)}%`}
                color={mon.exposure.correlationScore > 0.7 ? "text-orange-400" : "text-zinc-200"} />
              <MetricCard label="Directional Bias" value={`${mon.exposure.directionalBias.toFixed(1)}%`}
                color={mon.exposure.directionalBias > 70 ? "text-orange-400" : "text-zinc-200"} sub="50% = balanced" />
            </div>
            <MetricCard label="Concentration Risk" value={`${mon.exposure.concentrationRisk.toFixed(1)}%`} />
            <MonitorRow label="Exposure Detail" data={mon.exposure} />
          </div>
        )}

        {/* ── Margin ── */}
        {tab === "margin" && mon?.margin && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard label="Margin Level" value={`${mon.margin.marginLevel.toFixed(1)}%`}
                color={mon.margin.marginLevel < (prot?.config?.marginCriticalLevel ?? 200) ? "text-red-400" : "text-zinc-200"} />
              <MetricCard label="Free Margin" value={`${mon.margin.freeMarginPct.toFixed(1)}%`} sub="of equity" />
              <MetricCard label="Margin Call Risk" value={`${mon.margin.marginCallRisk.toFixed(0)}/100`}
                color={mon.margin.marginCallRisk > 50 ? "text-red-400" : "text-zinc-200"} />
              <MetricCard label="Leverage Util." value={`${mon.margin.leverageUtilization.toFixed(1)}%`} />
            </div>
            <MonitorRow label="Margin Detail" data={mon.margin} />
          </div>
        )}

        {/* ── Broker ── */}
        {tab === "broker" && mon?.broker && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard label="Spread Ratio" value={`${mon.broker.spreadRatio.toFixed(2)}×`}
                color={mon.broker.spreadRatio > 3 ? "text-red-400" : "text-zinc-200"} sub="current / baseline" />
              <MetricCard label="Slippage" value={`${mon.broker.slippagePips.toFixed(2)} pips`} />
              <MetricCard label="Execution" value={`${mon.broker.executionMs.toFixed(0)}ms`} />
              <MetricCard label="Connection" value={`${mon.broker.connectionQuality.toFixed(1)}%`}
                color={mon.broker.connectionQuality < 90 ? "text-orange-400" : "text-green-400"} />
            </div>
            <MetricCard label="Rejection Rate" value={`${mon.broker.rejectionRatePct.toFixed(1)}%`}
              color={mon.broker.rejectionRatePct > 10 ? "text-red-400" : "text-zinc-200"} />
            <MonitorRow label="Broker Detail" data={mon.broker} />
          </div>
        )}

        {/* ── History ── */}
        {tab === "history" && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-zinc-300">Level Change Events</h2>
            {histData?.data?.events?.length === 0 && (
              <div className="text-sm text-zinc-500">No level changes recorded yet</div>
            )}
            <div className="space-y-2">
              {histData?.data?.events?.map((ev: any) => (
                <div key={ev.eventId} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-start gap-3">
                  <div className={`text-xs font-bold uppercase pt-0.5 ${ev.eventType === "escalation" ? "text-red-400" : "text-green-400"}`}>
                    {ev.eventType}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-zinc-300 font-mono">
                      {ev.fromLevel ?? "—"} → {ev.toLevel ?? "—"}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">{ev.trigger}</div>
                  </div>
                  <div className="text-xs text-zinc-600">
                    {ev.occurredAt ? new Date(ev.occurredAt).toLocaleString() : "—"}
                  </div>
                </div>
              ))}
            </div>

            <h2 className="text-sm font-semibold text-zinc-300 mt-4">Recent Actions</h2>
            <div className="space-y-2">
              {actData?.data?.actions?.map((a: any) => (
                <div key={a.actionId} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-center gap-3">
                  <SevBadge s={a.severity} />
                  <div className="flex-1">
                    <div className="text-xs text-zinc-300 font-semibold">{a.label}</div>
                    <div className="text-xs text-zinc-500">{a.trigger}</div>
                  </div>
                  <div className="text-xs text-zinc-600">{a.appliedAt ? new Date(a.appliedAt).toLocaleString() : "—"}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Config ── */}
        {tab === "config" && (
          <ConfigPanel config={prot?.config} onSave={(cfg: any) => cfgMutation.mutate(cfg)} saving={cfgMutation.isPending} />
        )}

        {/* ── Recovery ── */}
        {tab === "recovery" && prot?.recovery && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <MetricCard label="Status" value={prot.recovery.isInRecovery ? "In Recovery" : "Not In Recovery"}
                color={prot.recovery.isInRecovery ? "text-yellow-400" : "text-green-400"} />
              <MetricCard label="Progress" value={`${prot.recovery.progressPercent}%`} />
              <MetricCard label="Can Step Down" value={prot.recovery.canStepDown ? "Yes" : "No"}
                color={prot.recovery.canStepDown ? "text-green-400" : "text-orange-400"} />
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-3 text-xs font-mono text-zinc-400">
              <div><span className="text-zinc-300">Current level:</span> {prot.recovery.currentLevel}</div>
              <div><span className="text-zinc-300">Target level:</span> {prot.recovery.targetLevel}</div>
              <div><span className="text-zinc-300">Hours at level:</span> {prot.recovery.hoursAtCurrentLevel.toFixed(1)}h</div>
              <div><span className="text-zinc-300">Required:</span> {prot.recovery.hoursRequiredForRecovery.toFixed(0)}h</div>
              <div><span className="text-zinc-300">Criteria met:</span> {prot.recovery.sustainedCriteriaCount}/{prot.recovery.sustainedCriteriaRequired}</div>
              {prot.recovery.stepDownBlockReason && (
                <div className="text-orange-400">Blocked: {prot.recovery.stepDownBlockReason}</div>
              )}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <h3 className="text-sm font-semibold mb-2">Recovery Path</h3>
              <p className="text-xs text-zinc-400 font-mono">{prot.explainability?.recoveryPath}</p>
            </div>
          </div>
        )}

        {/* ── Report ── */}
        {tab === "report" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
            {!reportData ? (
              <div className="text-sm text-zinc-500">Loading report…</div>
            ) : (
              <div className="space-y-4 text-sm font-mono text-zinc-300">
                <div className="text-lg font-bold text-white">Capital Protection Report</div>
                <div className="text-xs text-zinc-500">{reportData.data?.generatedAt}</div>
                <div className="border-t border-zinc-800 pt-4">
                  <div className="text-xs text-zinc-400 uppercase mb-1">Protection Level</div>
                  <div className={`text-xl font-bold ${LEVEL_COLOR[reportData.data?.protectionLevel?.toLowerCase().replace(/ /g, "_")] ?? ""}`}>
                    {reportData.data?.protectionLevel}
                  </div>
                </div>
                <div><span className="text-zinc-400">Summary:</span> {reportData.data?.summary}</div>
                <div><span className="text-zinc-400">Primary trigger:</span> {reportData.data?.primaryTrigger}</div>
                {Object.entries(reportData.data?.monitors ?? {}).map(([k, v]: any) => (
                  <div key={k} className="border-t border-zinc-800 pt-2">
                    <div className="text-xs text-zinc-400 uppercase">{k}</div>
                    <div className="text-xs mt-1">
                      Severity: <span className={SEV_COLOR[v.severity]}>{v.severity}</span> | Health: {v.health?.toFixed(0)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {protLoading && (
          <div className="text-center py-12 text-zinc-500 text-sm animate-pulse">
            Evaluating capital protection status…
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Config Panel ─────────────────────────────────────────────────────────────

function ConfigPanel({ config, onSave, saving }: { config: any; onSave: (c: any) => void; saving: boolean }) {
  const defaults = config ?? {};
  const [form, setForm] = useState<Record<string, number>>({
    maxDailyLossPercent:     defaults.maxDailyLossPercent    ?? 2.0,
    maxWeeklyLossPercent:    defaults.maxWeeklyLossPercent   ?? 5.0,
    maxMonthlyLossPercent:   defaults.maxMonthlyLossPercent  ?? 10.0,
    drawdownWarningPercent:  defaults.drawdownWarningPercent ?? 5.0,
    drawdownElevatedPercent: defaults.drawdownElevatedPercent ?? 8.0,
    drawdownCriticalPercent: defaults.drawdownCriticalPercent ?? 12.0,
    drawdownEmergencyPercent: defaults.drawdownEmergencyPercent ?? 15.0,
    consecutiveLossCaution:  defaults.consecutiveLossCaution  ?? 3,
    consecutiveLossWarning:  defaults.consecutiveLossWarning  ?? 5,
    consecutiveLossCritical: defaults.consecutiveLossCritical ?? 7,
    maxOpenRiskPercent:      defaults.maxOpenRiskPercent      ?? 6.0,
    maxPairExposurePercent:  defaults.maxPairExposurePercent  ?? 3.0,
    maxSpreadPips:           defaults.maxSpreadPips           ?? 3.0,
    maxSlippagePips:         defaults.maxSlippagePips         ?? 1.0,
    marginWarningLevel:      defaults.marginWarningLevel      ?? 300,
    marginCriticalLevel:     defaults.marginCriticalLevel     ?? 200,
    marginEmergencyLevel:    defaults.marginEmergencyLevel    ?? 150,
    recoveryGracePeriodHours: defaults.recoveryGracePeriodHours ?? 4,
  });

  function Field({ label, k, min, max, step = 0.1 }: { label: string; k: string; min: number; max: number; step?: number }) {
    return (
      <div>
        <label className="block text-xs text-zinc-400 mb-1">{label}</label>
        <input
          type="number" min={min} max={max} step={step}
          value={form[k]}
          onChange={e => setForm(f => ({ ...f, [k]: parseFloat(e.target.value) }))}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm font-mono"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Account Loss Limits (%)</h3>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Max Daily Loss %" k="maxDailyLossPercent" min={0.1} max={10} />
          <Field label="Max Weekly Loss %" k="maxWeeklyLossPercent" min={0.5} max={25} />
          <Field label="Max Monthly Loss %" k="maxMonthlyLossPercent" min={1} max={50} />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Drawdown Thresholds (%)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Warning %" k="drawdownWarningPercent" min={0.5} max={20} />
          <Field label="Elevated %" k="drawdownElevatedPercent" min={1} max={30} />
          <Field label="Critical %" k="drawdownCriticalPercent" min={2} max={40} />
          <Field label="Emergency %" k="drawdownEmergencyPercent" min={3} max={50} />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Consecutive Loss Thresholds</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Caution (trades)" k="consecutiveLossCaution" min={1} max={10} step={1} />
          <Field label="Warning (trades)" k="consecutiveLossWarning" min={2} max={15} step={1} />
          <Field label="Critical (trades)" k="consecutiveLossCritical" min={3} max={20} step={1} />
          <Field label="Max Open Risk %" k="maxOpenRiskPercent" min={0.5} max={20} />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Broker Limits</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Max Spread (pips)" k="maxSpreadPips" min={0.1} max={20} />
          <Field label="Max Slippage (pips)" k="maxSlippagePips" min={0.1} max={10} />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Margin Thresholds (%)</h3>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Warning %" k="marginWarningLevel" min={100} max={1000} step={10} />
          <Field label="Critical %" k="marginCriticalLevel" min={100} max={500} step={10} />
          <Field label="Emergency %" k="marginEmergencyLevel" min={100} max={300} step={10} />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Recovery</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Grace Period (hours)" k="recoveryGracePeriodHours" min={0.5} max={72} step={0.5} />
        </div>
      </div>
      <button
        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50"
        onClick={() => onSave(form)}
        disabled={saving}
      >
        {saving ? "Saving…" : "Save Configuration"}
      </button>
    </div>
  );
}
