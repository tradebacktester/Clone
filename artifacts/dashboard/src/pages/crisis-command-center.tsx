import { useState } from "react";
import { useQuery }  from "@tanstack/react-query";
import {
  AlertTriangle, Shield, Activity, Server, Database, BarChart2,
  RefreshCw, Wifi, WifiOff, CheckCircle, XCircle, Clock, Zap,
  AlertOctagon, Eye, TrendingDown, ArrowRight, Info,
} from "lucide-react";

const API = "/api";
const fetchJson = (url: string) => fetch(url).then(r => r.json()).then(d => d.data ?? d);

// ─── Severity colour mapping ──────────────────────────────────────────────────

function severityColor(s?: string) {
  switch (s) {
    case "catastrophic": return "text-purple-400";
    case "critical":     return "text-red-400";
    case "major":        return "text-orange-400";
    case "moderate":     return "text-yellow-400";
    case "minor":        return "text-blue-400";
    default:             return "text-emerald-400";
  }
}
function severityBg(s?: string) {
  switch (s) {
    case "catastrophic": return "bg-purple-500/20 border-purple-500/40";
    case "critical":     return "bg-red-500/20 border-red-500/40";
    case "major":        return "bg-orange-500/20 border-orange-500/40";
    case "moderate":     return "bg-yellow-500/20 border-yellow-500/40";
    case "minor":        return "bg-blue-500/20 border-blue-500/40";
    default:             return "bg-emerald-500/20 border-emerald-500/40";
  }
}
function modeBg(m?: string) {
  switch (m) {
    case "emergency":   return "bg-purple-500/20 border-purple-500/50 text-purple-300";
    case "survival":    return "bg-red-500/20 border-red-500/50 text-red-300";
    case "observation": return "bg-orange-500/20 border-orange-500/50 text-orange-300";
    case "defensive":   return "bg-yellow-500/20 border-yellow-500/50 text-yellow-300";
    case "caution":     return "bg-blue-500/20 border-blue-500/50 text-blue-300";
    default:            return "bg-emerald-500/20 border-emerald-500/50 text-emerald-300";
  }
}

function healthColor(score?: number) {
  if (!score && score !== 0) return "text-slate-400";
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-yellow-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className={healthColor(score)}>{score}/100</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function Card({ title, icon: Icon, children, className = "" }: any) {
  return (
    <div className={`bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 ${className}`}>
      {title && (
        <div className="flex items-center gap-2 mb-4">
          <Icon className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-200">{title}</span>
        </div>
      )}
      {children}
    </div>
  );
}

const TABS = [
  "Status", "Survival Mode", "Market Health", "Broker Health",
  "Infrastructure", "Data Integrity", "Strategy", "Recovery", "Timeline", "Explainability",
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CrisisCommandCenter() {
  const [tab, setTab] = useState("Status");
  const [pair, setPair]   = useState("EURUSD");

  const statusQ = useQuery({
    queryKey: ["crisis-status", pair],
    queryFn:  () => fetchJson(`${API}/crisis/status?pair=${pair}`),
    refetchInterval: 30000,
  });
  const historyQ = useQuery({
    queryKey: ["crisis-history"],
    queryFn:  () => fetchJson(`${API}/crisis/history?limit=50`),
    refetchInterval: 60000,
  });
  const eventsQ = useQuery({
    queryKey: ["crisis-events"],
    queryFn:  () => fetchJson(`${API}/crisis/events?limit=30`),
    refetchInterval: 60000,
  });
  const recoveryQ = useQuery({
    queryKey: ["crisis-recovery", pair],
    queryFn:  () => fetchJson(`${API}/crisis/recovery?pair=${pair}`),
    refetchInterval: 30000,
  });
  const healthQ = useQuery({
    queryKey: ["crisis-health"],
    queryFn:  () => fetchJson(`${API}/crisis/system-health`),
    refetchInterval: 30000,
  });

  const report   = statusQ.data?.report;
  const cls      = report?.classification;
  const mode     = report?.survivalMode;
  const recovery = recoveryQ.data?.recovery;
  const health   = healthQ.data?.latest;
  const history  = historyQ.data?.history ?? [];
  const events   = eventsQ.data?.events ?? [];

  const isLoading = statusQ.isLoading;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <AlertOctagon className="w-7 h-7 text-red-400" />
            Crisis Command Center
          </h1>
          <p className="text-sm text-slate-400 mt-1">Crisis Intelligence & Survival Engine — Advisory Only</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={pair} onChange={e => setPair(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
          >
            {["EURUSD","GBPUSD","USDJPY"].map(p => <option key={p}>{p}</option>)}
          </select>
          <button onClick={() => statusQ.refetch()}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-1.5 text-sm transition-colors">
            <RefreshCw className={`w-4 h-4 ${statusQ.isFetching ? "animate-spin text-cyan-400" : "text-slate-400"}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Quick Status Banner */}
      {!isLoading && cls && (
        <div className={`rounded-xl border p-4 mb-6 flex flex-wrap gap-4 items-center ${severityBg(cls.overallSeverity)}`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className={`w-5 h-5 ${severityColor(cls.overallSeverity)}`} />
            <span className={`font-bold text-lg uppercase ${severityColor(cls.overallSeverity)}`}>
              {cls.overallSeverity}
            </span>
            <span className="text-slate-400 text-sm">({cls.overallScore}/100)</span>
          </div>
          <div className={`px-3 py-1 rounded-full border text-xs font-bold uppercase ${modeBg(mode?.currentMode)}`}>
            {mode?.currentMode} mode
          </div>
          {report.summary.safeToTrade ? (
            <span className="flex items-center gap-1 text-emerald-400 text-sm"><CheckCircle className="w-4 h-4" /> Safe to Trade</span>
          ) : (
            <span className="flex items-center gap-1 text-red-400 text-sm"><XCircle className="w-4 h-4" /> Trading Restricted</span>
          )}
          <span className="text-slate-400 text-xs ml-auto">{new Date(cls.timestamp).toLocaleTimeString()}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-6 bg-slate-900/50 rounded-xl p-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === t ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Tab: Status ── */}
      {tab === "Status" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Current Severity */}
          <Card title="Current Severity" icon={AlertTriangle}>
            {isLoading ? <div className="text-slate-400 text-sm">Loading…</div> : cls ? (
              <div className="space-y-3">
                <div className={`text-3xl font-black uppercase ${severityColor(cls.overallSeverity)}`}>
                  {cls.overallSeverity}
                </div>
                <div className="text-slate-300 text-sm">Score: {cls.overallScore}/100</div>
                <div className="text-slate-400 text-xs">Confidence: {cls.confidence}%</div>
                {cls.dominantCrisisType && (
                  <div className="text-xs text-orange-400">
                    Dominant: {cls.dominantCrisisType.replace("_", " ")}
                  </div>
                )}
              </div>
            ) : <div className="text-slate-500 text-sm">No data</div>}
          </Card>

          {/* System Health */}
          <Card title="System Health" icon={Activity}>
            {health ? (
              <div className="space-y-2">
                <div className={`text-xl font-bold uppercase ${healthColor(health.healthScore)}`}>
                  {health.overallHealth}
                </div>
                <ScoreBar score={health.healthScore} label="Overall" />
                <ScoreBar score={health.marketHealth} label="Market" />
                <ScoreBar score={health.brokerHealth} label="Broker" />
                <ScoreBar score={health.infrastructureHealth} label="Infrastructure" />
              </div>
            ) : <div className="text-slate-500 text-sm">Loading…</div>}
          </Card>

          {/* Active Alerts */}
          <Card title="Active Alerts" icon={Zap}>
            {mode?.activeAlerts?.length > 0 ? (
              <div className="space-y-2">
                {mode.activeAlerts.map((a: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                    <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                    <span className="text-red-300">{a}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <CheckCircle className="w-4 h-4" /> No active alerts
              </div>
            )}
          </Card>

          {/* Component Scores */}
          <Card title="Component Scores" icon={BarChart2} className="md:col-span-2">
            {cls ? (
              <div className="grid grid-cols-2 gap-3">
                <ScoreBar score={cls.marketSignal.crisisScore}        label="Market Crisis" />
                <ScoreBar score={cls.brokerSignal.crisisScore}        label="Broker Crisis" />
                <ScoreBar score={cls.infrastructureSignal.crisisScore} label="Infrastructure" />
                <ScoreBar score={cls.dataIntegritySignal.crisisScore}  label="Data Integrity" />
                <ScoreBar score={cls.strategySignal.crisisScore}       label="Strategy" />
              </div>
            ) : <div className="text-slate-500 text-sm">Loading…</div>}
          </Card>

          {/* Expected Impact */}
          <Card title="Expected Impact" icon={Info}>
            {cls ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-300">{cls.expectedImpact}</p>
                <p className="text-xs text-slate-400 mt-2 border-t border-slate-700/50 pt-2">{cls.recommendedResponse}</p>
              </div>
            ) : <div className="text-slate-500 text-sm">Loading…</div>}
          </Card>
        </div>
      )}

      {/* ── Tab: Survival Mode ── */}
      {tab === "Survival Mode" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Survival Mode" icon={Shield}>
            {mode ? (
              <div className="space-y-3">
                <div className={`inline-flex px-4 py-2 rounded-xl border font-bold text-xl uppercase ${modeBg(mode.currentMode)}`}>
                  {mode.currentMode}
                </div>
                <p className="text-sm text-slate-300">{mode.description}</p>
                {mode.previousMode && (
                  <div className="text-xs text-slate-400">
                    Previous: <span className="text-slate-300">{mode.previousMode}</span>
                    <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                      mode.modeChangeType === "escalation" ? "bg-red-500/20 text-red-400" :
                      mode.modeChangeType === "de-escalation" ? "bg-emerald-500/20 text-emerald-400" :
                      "bg-slate-500/20 text-slate-400"
                    }`}>{mode.modeChangeType}</span>
                  </div>
                )}
                {mode.modeChangedReason && (
                  <div className="text-xs bg-slate-700/50 rounded-lg p-3 text-slate-300">
                    {mode.modeChangedReason}
                  </div>
                )}
              </div>
            ) : <div className="text-slate-500">Loading…</div>}
          </Card>

          <Card title="Mode Restrictions" icon={AlertTriangle}>
            {mode ? (
              <div className="space-y-2 text-sm">
                {[
                  ["Allow New Trades",         mode.restrictions?.allowNewTrades,            true],
                  ["Protect Open Positions",   mode.restrictions?.protectOpenPositions,       false],
                  ["Extra Confirmation",       mode.restrictions?.requiresExtraConfirmation,  false],
                ] .map(([label, val, goodIfTrue]: any) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-slate-400">{label}</span>
                    <span className={val === goodIfTrue ? "text-emerald-400" : "text-red-400"}>
                      {val ? "✓ Yes" : "✗ No"}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Max Exposure</span>
                  <span className="text-cyan-400">{((mode.restrictions?.maxExposureMultiplier ?? 1) * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Monitor Interval</span>
                  <span className="text-cyan-400">{mode.restrictions?.monitoringFrequencyMinutes}min</span>
                </div>
              </div>
            ) : <div className="text-slate-500">Loading…</div>}
          </Card>

          {/* Mode scale */}
          <Card title="Survival Mode Scale" icon={TrendingDown} className="md:col-span-2">
            <div className="flex items-center gap-1 flex-wrap">
              {["normal","caution","defensive","observation","survival","emergency"].map((m, i, arr) => (
                <div key={m} className="flex items-center gap-1">
                  <div className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase border ${
                    mode?.currentMode === m ? modeBg(m) + " ring-2 ring-white/20" : "bg-slate-800 border-slate-700 text-slate-400"
                  }`}>{m}</div>
                  {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-slate-600" />}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ── Tab: Market Health ── */}
      {tab === "Market Health" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Market Crisis Signals" icon={Activity}>
            {cls?.marketSignal ? (
              <div className="space-y-2 text-sm">
                {[
                  ["Flash Crash",          cls.marketSignal.flashCrash],
                  ["Extreme Volatility",   cls.marketSignal.extremeVolatility],
                  ["Liquidity Collapse",   cls.marketSignal.liquidityCollapse],
                  ["Price Gap",            cls.marketSignal.priceGap],
                  ["Spread Expansion",     cls.marketSignal.spreadExpansion],
                  ["Trading Halt",         cls.marketSignal.tradingHalt],
                  ["Exchange Instability", cls.marketSignal.exchangeInstability],
                  ["Unexpected Behavior",  cls.marketSignal.unexpectedBehavior],
                ].map(([label, val]: any) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-slate-400">{label}</span>
                    <span className={val ? "text-red-400" : "text-emerald-400"}>{val ? "⚠ DETECTED" : "✓ Clear"}</span>
                  </div>
                ))}
              </div>
            ) : <div className="text-slate-500">Loading…</div>}
          </Card>
          <Card title="Market Score" icon={BarChart2}>
            {cls?.marketSignal ? (
              <div className="space-y-3">
                <div className={`text-4xl font-black ${severityColor(cls.marketSignal.severity)}`}>
                  {cls.marketSignal.crisisScore}/100
                </div>
                <ScoreBar score={Math.max(0, 100 - cls.marketSignal.crisisScore)} label="Market Health" />
                <div className="text-xs text-slate-400">Liquidity: {cls.marketSignal.liquidityScore}/100</div>
                <div className="text-xs text-slate-400">Spread: {cls.marketSignal.spreadMultiplier?.toFixed(1)}× normal</div>
                <div className={`text-sm font-semibold uppercase ${severityColor(cls.marketSignal.severity)}`}>
                  {cls.marketSignal.severity} severity
                </div>
              </div>
            ) : <div className="text-slate-500">Loading…</div>}
          </Card>
        </div>
      )}

      {/* ── Tab: Broker Health ── */}
      {tab === "Broker Health" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Broker Crisis Signals" icon={Wifi}>
            {cls?.brokerSignal ? (
              <div className="space-y-2 text-sm">
                {[
                  ["Connection",         !cls.brokerSignal.connectionLoss, "Connected", "Disconnected"],
                  ["Order Rejections",   !cls.brokerSignal.orderRejections, "Normal", "High"],
                  ["Execution Speed",    !cls.brokerSignal.delayedExecution, "Normal", "Delayed"],
                  ["Slippage",           !cls.brokerSignal.highSlippage, "Normal", "High"],
                  ["API Reliability",    !cls.brokerSignal.apiFailures, "Normal", "Failures"],
                  ["Order Responses",    !cls.brokerSignal.incorrectOrderResponse, "Normal", "Errors"],
                  ["Price Feed",         !cls.brokerSignal.priceFeedInconsistency, "Stable", "Inconsistent"],
                  ["Server",             !cls.brokerSignal.serverDowntime, "Online", "Downtime"],
                ].map(([label, ok, good, bad]: any) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-slate-400">{label}</span>
                    {ok ? (
                      <span className="flex items-center gap-1 text-emerald-400 text-xs"><Wifi className="w-3 h-3" />{good}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-400 text-xs"><WifiOff className="w-3 h-3" />{bad}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : <div className="text-slate-500">Loading…</div>}
          </Card>
          <Card title="Broker Reliability" icon={BarChart2}>
            {cls?.brokerSignal ? (
              <div className="space-y-3">
                <div className={`text-4xl font-black ${healthColor(cls.brokerSignal.reliabilityScore)}`}>
                  {cls.brokerSignal.reliabilityScore}/100
                </div>
                <ScoreBar score={cls.brokerSignal.reliabilityScore} label="Reliability Score" />
                <ScoreBar score={cls.brokerSignal.executionQuality} label="Execution Quality" />
                <div className={`text-sm font-semibold uppercase ${severityColor(cls.brokerSignal.severity)}`}>
                  {cls.brokerSignal.severity} severity
                </div>
              </div>
            ) : <div className="text-slate-500">Loading…</div>}
          </Card>
        </div>
      )}

      {/* ── Tab: Infrastructure ── */}
      {tab === "Infrastructure" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Infrastructure Signals" icon={Server}>
            {cls?.infrastructureSignal ? (
              <div className="space-y-2 text-sm">
                {[
                  ["Internet",     !cls.infrastructureSignal.internetConnectivity],
                  ["VPS",          !cls.infrastructureSignal.vpsAvailability],
                  ["CPU",          !cls.infrastructureSignal.cpuOverload],
                  ["Memory",       !cls.infrastructureSignal.memoryExhaustion],
                  ["Database",     !cls.infrastructureSignal.databaseFailure],
                  ["Disk Space",   !cls.infrastructureSignal.diskSpace],
                  ["Network",      !cls.infrastructureSignal.networkLatency],
                  ["Service",      !cls.infrastructureSignal.serviceCrash],
                ].map(([label, ok]: any) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-slate-400">{label}</span>
                    <span className={ok ? "text-emerald-400 text-xs" : "text-red-400 text-xs"}>
                      {ok ? "✓ OK" : "⚠ Issue"}
                    </span>
                  </div>
                ))}
              </div>
            ) : <div className="text-slate-500">Loading…</div>}
          </Card>
          <Card title="Health Score" icon={BarChart2}>
            {cls?.infrastructureSignal ? (
              <div className="space-y-3">
                <div className={`text-4xl font-black ${healthColor(cls.infrastructureSignal.healthScore)}`}>
                  {cls.infrastructureSignal.healthScore}/100
                </div>
                <ScoreBar score={cls.infrastructureSignal.healthScore} label="Infrastructure Health" />
                <div className="text-xs text-slate-400">Latency: {cls.infrastructureSignal.latencyMs}ms</div>
              </div>
            ) : <div className="text-slate-500">Loading…</div>}
          </Card>
        </div>
      )}

      {/* ── Tab: Data Integrity ── */}
      {tab === "Data Integrity" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Data Integrity Signals" icon={Database}>
            {cls?.dataIntegritySignal ? (
              <div className="space-y-2 text-sm">
                {[
                  ["Missing Candles",       cls.dataIntegritySignal.missingCandles],
                  ["Duplicate Candles",     cls.dataIntegritySignal.duplicateCandles],
                  ["Corrupted OHLC",        cls.dataIntegritySignal.corruptedOHLC],
                  ["Incorrect Timestamps",  cls.dataIntegritySignal.incorrectTimestamps],
                  ["Feed Desynchronization",cls.dataIntegritySignal.feedDesynchronization],
                  ["Indicator Errors",      cls.dataIntegritySignal.indicatorErrors],
                  ["Incomplete Data",       cls.dataIntegritySignal.incompleteMarketData],
                ].map(([label, val]: any) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-slate-400">{label}</span>
                    <span className={val ? "text-red-400 text-xs" : "text-emerald-400 text-xs"}>{val ? "⚠ Issue" : "✓ Clean"}</span>
                  </div>
                ))}
              </div>
            ) : <div className="text-slate-500">Loading…</div>}
          </Card>
          <Card title="Integrity Score" icon={BarChart2}>
            {cls?.dataIntegritySignal ? (
              <div className="space-y-3">
                <div className={`text-4xl font-black ${healthColor(cls.dataIntegritySignal.integrityScore)}`}>
                  {cls.dataIntegritySignal.integrityScore}/100
                </div>
                <ScoreBar score={cls.dataIntegritySignal.integrityScore} label="Data Integrity" />
                <div className="text-xs text-slate-400">Gap Count: {cls.dataIntegritySignal.gapCount}</div>
              </div>
            ) : <div className="text-slate-500">Loading…</div>}
          </Card>
        </div>
      )}

      {/* ── Tab: Strategy ── */}
      {tab === "Strategy" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Strategy Stability Signals" icon={TrendingDown}>
            {cls?.strategySignal ? (
              <div className="space-y-2 text-sm">
                {[
                  ["Win Rate Decline",     cls.strategySignal.winRateDecline],
                  ["Drawdown Acceleration",cls.strategySignal.drawdownAcceleration],
                  ["Loss Clusters",        cls.strategySignal.unexpectedLossClusters],
                  ["Performance Drift",    cls.strategySignal.performanceDrift],
                  ["Confidence Collapse",  cls.strategySignal.confidenceCollapse],
                  ["Strategy Degradation", cls.strategySignal.strategyDegradation],
                ].map(([label, val]: any) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-slate-400">{label}</span>
                    <span className={val ? "text-red-400 text-xs" : "text-emerald-400 text-xs"}>{val ? "⚠ Detected" : "✓ Stable"}</span>
                  </div>
                ))}
              </div>
            ) : <div className="text-slate-500">Loading…</div>}
          </Card>
          <Card title="Strategy Metrics" icon={BarChart2}>
            {cls?.strategySignal ? (
              <div className="space-y-3">
                <ScoreBar score={cls.strategySignal.stabilityScore} label="Stability Score" />
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Current Win Rate</span>
                  <span className="text-slate-200">{(cls.strategySignal.currentWinRate * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Baseline Win Rate</span>
                  <span className="text-slate-200">{(cls.strategySignal.baselineWinRate * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Drawdown</span>
                  <span className={cls.strategySignal.drawdownPercent > 5 ? "text-red-400" : "text-emerald-400"}>
                    {cls.strategySignal.drawdownPercent?.toFixed(2)}%
                  </span>
                </div>
              </div>
            ) : <div className="text-slate-500">Loading…</div>}
          </Card>
        </div>
      )}

      {/* ── Tab: Recovery ── */}
      {tab === "Recovery" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Recovery State" icon={RefreshCw}>
            {recovery ? (
              <div className="space-y-3">
                <div>
                  <span className="text-slate-400 text-xs">Current Stage</span>
                  <div className={`mt-1 inline-flex px-3 py-1 rounded-lg border text-sm font-bold uppercase ${modeBg(recovery.currentStage)}`}>
                    {recovery.currentStage}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {recovery.stagesCompleted?.map((s: string) => (
                    <div key={s} className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded text-xs text-emerald-400">{s}</div>
                  ))}
                  <ArrowRight className="w-3 h-3 text-slate-600" />
                  {recovery.stagesRemaining?.map((s: string) => (
                    <div key={s} className="px-2 py-0.5 bg-slate-700 border border-slate-600 rounded text-xs text-slate-400">{s}</div>
                  ))}
                </div>
                <div className="text-xs text-slate-400">
                  Estimated: ~{recovery.estimatedRecoveryMinutes} minutes if conditions stable
                </div>
              </div>
            ) : <div className="text-slate-500">Loading…</div>}
          </Card>
          <Card title="Recovery Requirements" icon={CheckCircle}>
            {recovery ? (
              <div className="space-y-2 text-sm">
                {[
                  ["Infrastructure Stable", recovery.stableInfrastructure],
                  ["Broker Stable",         recovery.stableBroker],
                  ["Market Stable",         recovery.stableMarket],
                  ["Confirmations (5+)",    recovery.sufficientConfirmation],
                ].map(([label, ok]: any) => (
                  <div key={label} className="flex items-center gap-2">
                    {ok ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                    <span className={ok ? "text-emerald-300" : "text-slate-400"}>{label}</span>
                  </div>
                ))}
                {recovery.nextStageRequirements?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50">
                    <p className="text-xs text-slate-500 mb-2">Remaining requirements:</p>
                    {recovery.nextStageRequirements.map((r: string, i: number) => (
                      <div key={i} className="text-xs text-yellow-400 flex items-start gap-1">
                        <span>•</span><span>{r}</span>
                      </div>
                    ))}
                  </div>
                )}
                {recovery.readyForNextStage && (
                  <div className="mt-2 flex items-center gap-2 text-emerald-400 text-sm font-semibold">
                    <CheckCircle className="w-4 h-4" /> Ready for de-escalation
                  </div>
                )}
              </div>
            ) : <div className="text-slate-500">Loading…</div>}
          </Card>
        </div>
      )}

      {/* ── Tab: Timeline ── */}
      {tab === "Timeline" && (
        <div className="space-y-3">
          <div className="text-xs text-slate-400 mb-2">Most recent {history.length} crisis timeline entries</div>
          {history.length === 0 ? (
            <div className="text-slate-500 text-sm p-4 bg-slate-800/50 rounded-xl">No timeline data yet — status checks will populate this.</div>
          ) : history.map((h: any) => (
            <div key={h.id} className={`flex items-start gap-3 p-3 rounded-xl border ${severityBg(h.severity)}`}>
              <div className="shrink-0">
                <Clock className={`w-4 h-4 ${severityColor(h.severity)}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold uppercase ${severityColor(h.severity)}`}>{h.severity}</span>
                  <span className="text-slate-400 text-xs">{h.overallScore}/100</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${modeBg(h.survivalMode)}`}>{h.survivalMode}</span>
                  {h.modeChanged && (
                    <span className="text-xs text-yellow-400">mode changed ({h.modeChangeType})</span>
                  )}
                </div>
                {h.narrative && <p className="text-xs text-slate-400 mt-1 truncate">{h.narrative}</p>}
                <div className="text-xs text-slate-600 mt-1">{new Date(h.recordedAt).toLocaleString()}</div>
              </div>
              <div className="text-xs text-slate-500 shrink-0">H:{h.healthScore}</div>
            </div>
          ))}

          {events.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mt-6 mb-2">Emergency Events</h3>
              {events.map((e: any) => (
                <div key={e.id} className={`p-3 rounded-xl border mb-2 ${severityBg(e.severity)}`}>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <AlertOctagon className={`w-4 h-4 ${severityColor(e.severity)}`} />
                    <span className={`text-xs font-bold uppercase ${severityColor(e.severity)}`}>{e.severity}</span>
                    <span className="text-slate-400 text-xs">{e.crisisType}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${modeBg(e.survivalModeTriggered)}`}>{e.survivalModeTriggered}</span>
                  </div>
                  <p className="text-xs text-slate-300">{e.trigger}</p>
                  <div className="text-xs text-slate-600 mt-1">{new Date(e.occurredAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Explainability ── */}
      {tab === "Explainability" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { key: "whatHappened", label: "What Happened", icon: Eye },
            { key: "whyDetected",  label: "Why Detected",  icon: Activity },
          ].map(({ key, label, icon: Icon }) => (
            <Card key={key} title={label} icon={Icon}>
              <p className="text-sm text-slate-300">{report?.explainability?.[key] ?? "Loading…"}</p>
            </Card>
          ))}

          {[
            { key: "protectiveActions",  label: "Protective Actions",   color: "text-blue-400" },
            { key: "expectedBenefits",   label: "Expected Benefits",    color: "text-emerald-400" },
            { key: "risksIfIgnored",     label: "Risks If Ignored",     color: "text-red-400" },
            { key: "recoveryRequirements", label: "Recovery Requirements", color: "text-yellow-400" },
          ].map(({ key, label, color }) => (
            <Card key={key} title={label} icon={Info}>
              {report?.explainability?.[key]?.length > 0 ? (
                <ul className="space-y-1">
                  {report.explainability[key].map((item: string, i: number) => (
                    <li key={i} className={`text-xs flex items-start gap-2 ${color}`}>
                      <span className="mt-0.5">•</span><span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : <div className="text-slate-500 text-sm">Loading…</div>}
            </Card>
          ))}

          <Card title="Full Narrative" icon={Info} className="md:col-span-2">
            <p className="text-sm text-slate-300 leading-relaxed">
              {report?.explainability?.narrative ?? "Loading…"}
            </p>
          </Card>

          {cls?.supportingEvidence?.length > 0 && (
            <Card title="Supporting Evidence" icon={Database} className="md:col-span-2">
              <div className="space-y-1">
                {cls.supportingEvidence.map((e: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs bg-slate-700/50 rounded p-2">
                    <span className="text-slate-500 shrink-0">{i + 1}.</span>
                    <span className="text-slate-300">{e}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
