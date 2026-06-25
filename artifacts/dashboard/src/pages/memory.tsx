import { useState } from "react";
import {
  useGetMemorySummary,
  useGetMemoryTrades,
  useGetMissedOpportunities,
  useGetConfidenceProfiles,
  useGetTopSetups,
} from "@workspace/api-client-react";
import { Brain, TrendingUp, TrendingDown, AlertCircle, Star, BarChart3, Target } from "lucide-react";

type Tab = "overview" | "trades" | "missed" | "profiles" | "clusters";

function ScoreBadge({ value, label }: { value: string | number | null | undefined; label?: string }) {
  const v = parseFloat(String(value ?? 0));
  const color = v >= 80 ? "text-emerald-400 bg-emerald-400/10" : v >= 70 ? "text-amber-400 bg-amber-400/10" : "text-red-400 bg-red-400/10";
  return (
    <span className={`inline-flex flex-col items-center rounded px-2 py-0.5 text-xs font-bold ${color}`}>
      {v.toFixed(0)}
      {label && <span className="text-[9px] font-normal opacity-70">{label}</span>}
    </span>
  );
}

function AdjBadge({ value }: { value: string | null | undefined }) {
  const v = parseFloat(String(value ?? 0));
  if (Math.abs(v) < 0.1) return <span className="text-slate-400 text-xs">—</span>;
  const color = v > 0 ? "text-emerald-400" : "text-red-400";
  return <span className={`text-xs font-bold ${color}`}>{v > 0 ? "+" : ""}{v.toFixed(1)}</span>;
}

function OutcomePill({ outcome }: { outcome: string | null | undefined }) {
  if (!outcome) return <span className="text-slate-500 text-xs">open</span>;
  const map: Record<string, string> = {
    win: "bg-emerald-500/20 text-emerald-400",
    loss: "bg-red-500/20 text-red-400",
    open: "bg-blue-500/20 text-blue-400",
  };
  return <span className={`text-xs font-medium rounded px-2 py-0.5 ${map[outcome] ?? "bg-slate-700 text-slate-300"}`}>{outcome}</span>;
}

function RejectionPill({ reason }: { reason: string }) {
  const map: Record<string, string> = {
    below_confidence:  "bg-amber-500/20 text-amber-400",
    max_open_trades:   "bg-blue-500/20 text-blue-400",
    pair_already_open: "bg-indigo-500/20 text-indigo-400",
    daily_loss_limit:  "bg-red-500/20 text-red-400",
    weekly_loss_limit: "bg-red-600/20 text-red-500",
    bot_halted:        "bg-slate-500/20 text-slate-400",
  };
  const label = reason.replace(/_/g, " ");
  return <span className={`text-xs font-medium rounded px-2 py-0.5 ${map[reason] ?? "bg-slate-700 text-slate-300"}`}>{label}</span>;
}

function AftermathPill({ outcome }: { outcome: string | null | undefined }) {
  if (!outcome) return <span className="text-slate-500 text-xs">pending</span>;
  const map: Record<string, string> = {
    would_win:  "bg-emerald-500/20 text-emerald-400",
    would_lose: "bg-red-500/20 text-red-400",
    unknown:    "bg-slate-500/20 text-slate-400",
  };
  const labels: Record<string, string> = {
    would_win: "would win", would_lose: "would lose", unknown: "unknown",
  };
  return <span className={`text-xs rounded px-2 py-0.5 ${map[outcome] ?? "bg-slate-700 text-slate-300"}`}>{labels[outcome] ?? outcome}</span>;
}

function BucketTag({ label, value }: { label: string; value: string }) {
  const color = value === "90+" ? "bg-emerald-900/40 text-emerald-400" :
    value === "80-89" ? "bg-blue-900/40 text-blue-400" :
    value === "70-79" ? "bg-amber-900/40 text-amber-400" : "bg-red-900/40 text-red-400";
  return (
    <span className={`inline-flex flex-col items-center rounded px-2 py-1 text-[10px] ${color}`}>
      <span className="opacity-60">{label}</span>
      <span className="font-bold">{value}</span>
    </span>
  );
}

export default function MemoryPage() {
  const [tab, setTab] = useState<Tab>("overview");

  const { data: summary } = useGetMemorySummary();
  const { data: trades } = useGetMemoryTrades({ limit: 100 });
  const { data: missed } = useGetMissedOpportunities({ limit: 100 });
  const { data: profiles } = useGetConfidenceProfiles();
  const { data: topSetups } = useGetTopSetups();

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "overview",  label: "Overview",           icon: Brain },
    { id: "trades",    label: "Trade Records",       icon: BarChart3 },
    { id: "missed",    label: "Missed Opportunities",icon: AlertCircle },
    { id: "profiles",  label: "Confidence Profiles", icon: Target },
    { id: "clusters",  label: "Top/Worst Clusters",  icon: Star },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800">
        <Brain className="w-6 h-6 text-violet-400" />
        <div>
          <h1 className="text-lg font-semibold">Trade Memory Engine</h1>
          <p className="text-xs text-slate-400">Records every trade with component scores · clusters setups · adjusts confidence dynamically</p>
        </div>
      </div>

      {/* Summary Strip */}
      {summary && (
        <div className="grid grid-cols-4 gap-px bg-slate-800 border-b border-slate-800">
          {[
            { label: "Recorded Trades", value: summary.totalRecorded ?? 0, suffix: "" },
            { label: "Win Rate",         value: `${summary.winRate ?? 0}`, suffix: "%" },
            { label: "Active Clusters",  value: summary.totalClusters ?? 0, suffix: "" },
            { label: "Missed Opps",      value: summary.missedOpportunities ?? 0, suffix: "" },
          ].map(item => (
            <div key={item.label} className="bg-slate-900 px-6 py-3 flex flex-col gap-0.5">
              <span className="text-xs text-slate-400">{item.label}</span>
              <span className="text-xl font-bold text-white">{item.value}{item.suffix}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-3 border-b border-slate-800">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t transition-colors ${
              tab === t.id
                ? "bg-slate-800 text-violet-400 border-b-2 border-violet-400"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* ── Overview ── */}
        {tab === "overview" && summary && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-800/60 rounded-xl p-5 border border-slate-700/40">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-medium text-slate-300">Memory Stats</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-400">Total recorded</span><span className="font-bold">{summary.totalRecorded}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Closed trades</span><span className="font-bold">{summary.closedTrades}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Win rate</span><span className={`font-bold ${(summary.winRate ?? 0) >= 55 ? "text-emerald-400" : "text-red-400"}`}>{summary.winRate}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Clusters discovered</span><span className="font-bold">{summary.totalClusters}</span></div>
                </div>
              </div>

              <div className="bg-slate-800/60 rounded-xl p-5 border border-slate-700/40">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4 text-violet-400" />
                  <span className="text-xs font-medium text-slate-300">Confidence Adjustment</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-400">Avg adjustment</span><AdjBadge value={String(summary.avgConfAdjustment)} /></div>
                  <div className="flex justify-between"><span className="text-slate-400">Best cluster</span><span className="font-mono text-[10px] text-violet-300 max-w-[140px] truncate">{summary.bestClusterKey ?? "—"}</span></div>
                </div>
                <p className="text-[11px] text-slate-500 mt-3">
                  Min 10 trades required. Adjustment = (WR−55)×0.5, capped ±30. Rolling 10-trade WR&lt;40% adds −10.
                </p>
              </div>

              <div className="bg-slate-800/60 rounded-xl p-5 border border-slate-700/40">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-medium text-slate-300">Missed Opportunities</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-400">Total missed</span><span className="font-bold">{summary.missedOpportunities}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Would have won</span><span className="font-bold text-emerald-400">{summary.missedWouldWin}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Would have lost</span><span className="font-bold text-red-400">{summary.missedWouldLose}</span></div>
                </div>
              </div>
            </div>

            {/* Best cluster key display */}
            {summary.bestClusterKey && (
              <div className="bg-slate-800/60 rounded-xl p-5 border border-violet-700/30">
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-medium">Best Performing Cluster</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {summary.bestClusterKey.split("|").map(part => {
                    const [k, v] = part.split(":");
                    const labelMap: Record<string, string> = { z: "Zone", l: "Liq", a: "AMD", c: "Conf", s: "Session" };
                    return <BucketTag key={part} label={labelMap[k!] ?? k!} value={v!} />;
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Trade Records ── */}
        {tab === "trades" && (
          <div>
            <p className="text-xs text-slate-400 mb-3">Every executed trade with full component scores — feeds cluster learning.</p>
            {!trades?.length ? (
              <div className="text-slate-500 text-sm text-center py-16">No trade memory records yet. Start the bot to record trades.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700">
                      <th className="text-left py-2 pr-3">Pair</th>
                      <th className="text-left py-2 pr-3">Dir</th>
                      <th className="text-center py-2 pr-3">Zone</th>
                      <th className="text-center py-2 pr-3">Liq</th>
                      <th className="text-center py-2 pr-3">AMD</th>
                      <th className="text-center py-2 pr-3">Conf</th>
                      <th className="text-center py-2 pr-3">Final</th>
                      <th className="text-left py-2 pr-3">Outcome</th>
                      <th className="text-right py-2 pr-3">PnL</th>
                      <th className="text-right py-2 pr-3">R:R</th>
                      <th className="text-right py-2 pr-3">Time</th>
                      <th className="text-left py-2">Session</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map(t => (
                      <tr key={t.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                        <td className="py-2 pr-3 font-mono font-bold">{t.pair}</td>
                        <td className="py-2 pr-3">
                          <span className={t.direction === "buy" ? "text-emerald-400" : "text-red-400"}>{t.direction}</span>
                        </td>
                        <td className="py-2 pr-3 text-center"><ScoreBadge value={t.zoneScore} /></td>
                        <td className="py-2 pr-3 text-center"><ScoreBadge value={t.liquidityScore} /></td>
                        <td className="py-2 pr-3 text-center"><ScoreBadge value={t.amdScore} /></td>
                        <td className="py-2 pr-3 text-center"><ScoreBadge value={t.confirmationScore} /></td>
                        <td className="py-2 pr-3 text-center"><ScoreBadge value={t.finalScore} /></td>
                        <td className="py-2 pr-3"><OutcomePill outcome={t.outcome} /></td>
                        <td className={`py-2 pr-3 text-right font-bold ${parseFloat(t.pnl ?? "0") >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {t.pnl ? `$${parseFloat(t.pnl).toFixed(2)}` : "—"}
                        </td>
                        <td className="py-2 pr-3 text-right">{t.riskRewardActual ? parseFloat(t.riskRewardActual).toFixed(2) : "—"}</td>
                        <td className="py-2 pr-3 text-right text-slate-400">{t.timeInTradeMins ? `${t.timeInTradeMins}m` : "—"}</td>
                        <td className="py-2 text-slate-400">{t.session}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Missed Opportunities ── */}
        {tab === "missed" && (
          <div>
            <p className="text-xs text-slate-400 mb-3">Signals the bot rejected — aftermath tracking shows what would have happened.</p>
            {!missed?.length ? (
              <div className="text-slate-500 text-sm text-center py-16">No missed opportunities recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700">
                      <th className="text-left py-2 pr-3">Pair</th>
                      <th className="text-left py-2 pr-3">Dir</th>
                      <th className="text-left py-2 pr-3">Reason</th>
                      <th className="text-center py-2 pr-3">Confidence</th>
                      <th className="text-center py-2 pr-3">Zone</th>
                      <th className="text-center py-2 pr-3">AMD</th>
                      <th className="text-left py-2 pr-3">R:R</th>
                      <th className="text-left py-2 pr-3">Aftermath</th>
                      <th className="text-right py-2 pr-3">Est. Pips</th>
                      <th className="text-left py-2">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missed.map(m => (
                      <tr key={m.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                        <td className="py-2 pr-3 font-mono font-bold">{m.pair}</td>
                        <td className="py-2 pr-3">
                          <span className={m.direction === "buy" ? "text-emerald-400" : "text-red-400"}>{m.direction}</span>
                        </td>
                        <td className="py-2 pr-3"><RejectionPill reason={m.rejectionReason} /></td>
                        <td className="py-2 pr-3 text-center"><ScoreBadge value={m.confidence} /></td>
                        <td className="py-2 pr-3 text-center"><ScoreBadge value={m.zoneScore} /></td>
                        <td className="py-2 pr-3 text-center"><ScoreBadge value={m.amdScore} /></td>
                        <td className="py-2 pr-3">{m.riskReward ? `${parseFloat(m.riskReward).toFixed(1)}R` : "—"}</td>
                        <td className="py-2 pr-3"><AftermathPill outcome={m.outcomeIfTaken} /></td>
                        <td className={`py-2 pr-3 text-right font-bold ${parseFloat(m.estimatedPipsIfTaken ?? "0") >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {m.estimatedPipsIfTaken ? parseFloat(m.estimatedPipsIfTaken).toFixed(1) : "—"}
                        </td>
                        <td className="py-2 text-slate-400">{new Date(m.createdAt).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Confidence Profiles ── */}
        {tab === "profiles" && (
          <div>
            <p className="text-xs text-slate-400 mb-3">
              Each cluster gets a dynamic confidence adjustment (±30 pts) applied on top of the raw signal confidence.
              Only applied after 10+ trades.
            </p>
            {!profiles?.length ? (
              <div className="text-slate-500 text-sm text-center py-16">No profiles built yet — needs trade history to cluster.</div>
            ) : (
              <div className="space-y-3">
                {profiles.map(p => (
                  <div key={p.id} className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/40">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex gap-1.5 flex-wrap">
                        <BucketTag label="Zone"    value={p.zoneScoreBucket} />
                        <BucketTag label="Liq"     value={p.liquidityScoreBucket} />
                        <BucketTag label="AMD"     value={p.amdScoreBucket} />
                        <BucketTag label="Confirm" value={p.confirmationScoreBucket} />
                        <BucketTag label="Session" value={p.session} />
                      </div>
                      <div className="flex items-center gap-4 text-sm shrink-0">
                        <div className="text-right">
                          <div className="text-slate-400 text-xs">Adj</div>
                          <AdjBadge value={p.confidenceAdjustment} />
                        </div>
                        <div className="text-right">
                          <div className="text-slate-400 text-xs">WR</div>
                          <span className={`font-bold text-sm ${parseFloat(p.winRate) >= 55 ? "text-emerald-400" : "text-red-400"}`}>
                            {parseFloat(p.winRate).toFixed(0)}%
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-slate-400 text-xs">PF</div>
                          <span className="font-bold text-sm">{parseFloat(p.profitFactor).toFixed(2)}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-slate-400 text-xs">Trades</div>
                          <span className="font-bold text-sm">{p.totalTrades}</span>
                        </div>
                        {p.rank && (
                          <div className="text-right">
                            <div className="text-slate-400 text-xs">Rank</div>
                            <span className="font-bold text-sm text-amber-400">#{p.rank}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {p.last10WinRate && (
                      <div className="mt-2 text-xs text-slate-500">
                        Rolling 10-trade WR: <span className={parseFloat(p.last10WinRate) < 40 ? "text-red-400 font-bold" : "text-slate-300"}>{parseFloat(p.last10WinRate).toFixed(0)}%</span>
                        {p.last10Pnl && <> · PnL: <span className={parseFloat(p.last10Pnl) >= 0 ? "text-emerald-400" : "text-red-400"}>${parseFloat(p.last10Pnl).toFixed(2)}</span></>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Top / Worst Clusters ── */}
        {tab === "clusters" && (
          <div className="grid grid-cols-2 gap-6">
            {[
              { title: "Top Clusters", icon: TrendingUp, color: "text-emerald-400", data: topSetups?.top },
              { title: "Worst Clusters", icon: TrendingDown, color: "text-red-400", data: topSetups?.worst },
            ].map(section => (
              <div key={section.title}>
                <div className="flex items-center gap-2 mb-3">
                  <section.icon className={`w-4 h-4 ${section.color}`} />
                  <span className="text-sm font-medium">{section.title}</span>
                </div>
                {!section.data?.length ? (
                  <div className="text-slate-500 text-xs text-center py-8">Not enough data yet</div>
                ) : (
                  <div className="space-y-2">
                    {section.data.map((p, i) => (
                      <div key={p.id} className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-slate-400">#{i + 1}</span>
                          <div className="flex items-center gap-3 text-xs">
                            <span className={parseFloat(p.winRate) >= 55 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                              {parseFloat(p.winRate).toFixed(0)}% WR
                            </span>
                            <span className="text-slate-400">{p.totalTrades} trades</span>
                            <AdjBadge value={p.confidenceAdjustment} />
                          </div>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          <BucketTag label="Zone"    value={p.zoneScoreBucket} />
                          <BucketTag label="Liq"     value={p.liquidityScoreBucket} />
                          <BucketTag label="AMD"     value={p.amdScoreBucket} />
                          <BucketTag label="Confirm" value={p.confirmationScoreBucket} />
                          <BucketTag label="Session" value={p.session} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
