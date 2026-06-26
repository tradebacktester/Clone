import { useState } from "react";
import {
  useRunBatchBacktest,
  useListBacktests,
  useRunWalkForward,
} from "@workspace/api-client-react";
import type {
  BacktestResult,
  BatchBacktestResult,
  MonthlyReturn,
  YearlyReturn,
  RegimeStats,
  SessionStats,
  WalkForwardResult,
  WFPairResult,
  WFWindow,
  WFWindowStats,
} from "@workspace/api-client-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
} from "recharts";

const PAIR_COLORS: Record<string, string> = {
  EURUSD: "#3b82f6",
  GBPUSD: "#8b5cf6",
  USDJPY: "#f59e0b",
};

const REGIME_LABELS: Record<string, { label: string; color: string }> = {
  trending: { label: "Trending", color: "#10b981" },
  ranging: { label: "Ranging", color: "#3b82f6" },
  volatile: { label: "Volatile", color: "#ef4444" },
  low_volatility: { label: "Low Vol", color: "#6b7280" },
  unknown: { label: "Unknown", color: "#9ca3af" },
};

const RECOMMENDATION_META: Record<string, { color: string; bg: string; icon: string; desc: string }> = {
  Pass:     { color: "text-green-400",  bg: "bg-green-900/30 border-green-700",  icon: "✓", desc: "Strategy generalises well. OOS performance is consistent with IS." },
  Marginal: { color: "text-yellow-400", bg: "bg-yellow-900/30 border-yellow-700", icon: "⚠", desc: "Some degradation between IS and OOS. Use with caution." },
  Overfit:  { color: "text-red-400",    bg: "bg-red-900/30 border-red-700",       icon: "✗", desc: "Significant IS/OOS gap detected. Results are likely curve-fitted." },
};

function fmt(n: number, decimals = 2) { return n.toFixed(decimals); }
function fmtDollar(n: number) { return (n >= 0 ? "+" : "") + "$" + fmt(Math.abs(n)); }
function fmtPct(n: number) { return (n >= 0 ? "+" : "") + fmt(n) + "%"; }
function fmtPctRaw(n: number) { return fmt(n) + "%"; }

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? "text-white"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function SmallStatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-gray-900/60 rounded p-3 border border-gray-700">
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={`text-base font-bold ${color ?? "text-white"}`}>{value}</p>
    </div>
  );
}

function MonthlyHeatmap({ data }: { data: MonthlyReturn[] }) {
  if (!data.length) return <p className="text-gray-500 text-sm">No monthly data</p>;
  const years = [...new Set(data.map(d => d.year))].sort();
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const byKey = new Map(data.map(d => [`${d.year}-${d.month}`, d]));
  const maxAbs = Math.max(...data.map(d => Math.abs(d.returnPct)), 0.01);

  function cellColor(pct: number) {
    const intensity = Math.min(Math.abs(pct) / maxAbs, 1);
    if (pct > 0) return `rgb(0, ${Math.round(100 + intensity * 155)}, 80)`;
    if (pct < 0) return `rgb(${Math.round(100 + intensity * 155)}, 0, 0)`;
    return "#374151";
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full">
        <thead>
          <tr>
            <th className="text-gray-400 text-left p-1 w-12">Year</th>
            {months.map(m => <th key={m} className="text-gray-400 text-center p-1 w-14">{m}</th>)}
            <th className="text-gray-400 text-right p-1 w-16">Total</th>
          </tr>
        </thead>
        <tbody>
          {years.map(year => {
            const yearData = data.filter(d => d.year === year);
            const yearTotal = yearData.reduce((s, d) => s + d.returnPct, 0);
            return (
              <tr key={year}>
                <td className="text-gray-300 p-1 font-medium">{year}</td>
                {months.map((_, mi) => {
                  const d = byKey.get(`${year}-${mi + 1}`);
                  return (
                    <td key={mi} className="p-0.5 text-center">
                      <div
                        className="rounded text-white font-medium flex items-center justify-center"
                        style={{ backgroundColor: d ? cellColor(d.returnPct) : "#1f2937", height: "28px", minWidth: "44px" }}
                        title={d ? `${d.label}: ${fmtPct(d.returnPct)} (${d.trades} trades)` : "No trades"}
                      >
                        {d ? fmtPct(d.returnPct) : "–"}
                      </div>
                    </td>
                  );
                })}
                <td className="p-1 text-right">
                  <span className={yearTotal >= 0 ? "text-green-400" : "text-red-400"}>
                    {fmtPct(Math.round(yearTotal * 100) / 100)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function YearlyBarChart({ data }: { data: YearlyReturn[] }) {
  if (!data.length) return <p className="text-gray-500 text-sm">No yearly data</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="year" tick={{ fill: "#9ca3af", fontSize: 12 }} />
        <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} tickFormatter={v => `${v}%`} />
        <Tooltip
          contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", color: "#f3f4f6" }}
          formatter={(val: number, name: string) => {
            if (name === "returnPct") return [fmtPct(val), "Annual Return"];
            if (name === "maxDrawdown") return [`-${fmt(val)}%`, "Max Drawdown"];
            return [val, name];
          }}
        />
        <Legend formatter={v => v === "returnPct" ? "Annual Return" : "Max Drawdown"} />
        <ReferenceLine y={0} stroke="#6b7280" />
        <Bar dataKey="returnPct" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.returnPct >= 0 ? "#10b981" : "#ef4444"} />)}
        </Bar>
        <Bar dataKey="maxDrawdown" fill="#ef444466" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function EquityChart({ results }: { results: BacktestResult[] }) {
  const filtered = results.filter(r => r.equityCurve && r.equityCurve.length > 1);
  if (!filtered.length) return <p className="text-gray-500 text-sm">Run the batch backtest to see equity curves.</p>;

  const maxLen = Math.max(...filtered.map(r => r.equityCurve.length));
  const merged: Array<Record<string, number>> = Array.from({ length: maxLen }, (_, i) => ({ idx: i }));

  for (const r of filtered) {
    const step = (r.equityCurve.length - 1) / (maxLen - 1 || 1);
    r.equityCurve.forEach((pt, i) => {
      const idx = Math.min(Math.round(i / step), maxLen - 1);
      merged[idx]![r.pair] = pt.balance;
    });
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={merged} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="idx" hide />
        <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} tickFormatter={v => `$${v.toLocaleString()}`} />
        <Tooltip
          contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", color: "#f3f4f6" }}
          formatter={(val: number, name: string) => [`$${Number(val).toLocaleString()}`, name]}
        />
        <Legend />
        {filtered.map(r => (
          <Line key={r.pair} type="monotone" dataKey={r.pair}
            stroke={PAIR_COLORS[r.pair] ?? "#9ca3af"} dot={false} strokeWidth={2} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function RegimeTable({ data }: { data: RegimeStats[] }) {
  if (!data.length) return <p className="text-gray-500 text-sm">No regime data</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-gray-400 text-xs uppercase">
          {["Regime","Trades","Win%","PF","Expect","Total P&L","Avg RR"].map(h => (
            <th key={h} className={`py-2 ${h === "Regime" ? "text-left" : "text-right"}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-700">
        {data.map(r => {
          const meta = REGIME_LABELS[r.regime] ?? { label: r.regime, color: "#9ca3af" };
          return (
            <tr key={r.regime} className="hover:bg-gray-700/30">
              <td className="py-2">
                <span className="inline-flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                  <span className="text-gray-200">{meta.label}</span>
                </span>
              </td>
              <td className="text-right text-gray-300">{r.trades}</td>
              <td className={`text-right font-medium ${r.winRate >= 50 ? "text-green-400" : "text-red-400"}`}>{fmt(r.winRate)}%</td>
              <td className={`text-right ${r.profitFactor >= 1 ? "text-green-400" : "text-red-400"}`}>{fmt(r.profitFactor)}</td>
              <td className={`text-right ${r.expectancy >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtDollar(r.expectancy)}</td>
              <td className={`text-right ${r.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtDollar(r.totalPnl)}</td>
              <td className="text-right text-gray-300">{fmt(r.avgRR)}R</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SessionTable({ data }: { data: SessionStats[] }) {
  if (!data.length) return <p className="text-gray-500 text-sm">No session data</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-gray-400 text-xs uppercase">
          {["Session","Trades","Win%","PF","Expect","Total P&L","Avg RR"].map(h => (
            <th key={h} className={`py-2 ${h === "Session" ? "text-left" : "text-right"}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-700">
        {data.map(s => (
          <tr key={s.session} className="hover:bg-gray-700/30">
            <td className="py-2 text-gray-200 capitalize">{s.session}</td>
            <td className="text-right text-gray-300">{s.trades}</td>
            <td className={`text-right font-medium ${s.winRate >= 50 ? "text-green-400" : "text-red-400"}`}>{fmt(s.winRate)}%</td>
            <td className={`text-right ${s.profitFactor >= 1 ? "text-green-400" : "text-red-400"}`}>{fmt(s.profitFactor)}</td>
            <td className={`text-right ${s.expectancy >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtDollar(s.expectancy)}</td>
            <td className={`text-right ${s.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtDollar(s.totalPnl)}</td>
            <td className="text-right text-gray-300">{fmt(s.avgRR)}R</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PairSummaryCards({ results }: { results: BacktestResult[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {results.map(r => (
        <div key={r.pair} className="bg-gray-800 rounded-lg border p-4" style={{ borderColor: PAIR_COLORS[r.pair] ?? "#374151" }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-white text-lg">{r.pair}</h3>
            <span className={`text-sm font-medium px-2 py-0.5 rounded ${r.totalPnl >= 0 ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"}`}>
              {fmtDollar(r.totalPnl)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {[
              { label: "Win Rate", val: `${fmt(r.winRate)}%`, color: r.winRate >= 50 ? "text-green-400" : "text-red-400" },
              { label: "Trades", val: String(r.totalTrades), color: "text-white" },
              { label: "Profit Factor", val: fmt(r.profitFactor), color: r.profitFactor >= 1 ? "text-green-400" : "text-red-400" },
              { label: "Sharpe", val: fmt(r.sharpeRatio), color: r.sharpeRatio >= 1 ? "text-green-400" : "text-yellow-400" },
              { label: "Max DD", val: `-${fmt(r.maxDrawdown)}%`, color: "text-red-400" },
              { label: "Expectancy", val: fmtDollar(r.expectancy), color: r.expectancy >= 0 ? "text-green-400" : "text-red-400" },
              { label: "Avg R:R", val: `${fmt(r.avgRR)}R`, color: "text-white" },
              { label: "Final Balance", val: `$${r.finalBalance.toLocaleString()}`, color: "text-white" },
            ].map(({ label, val, color }) => (
              <div key={label}>
                <span className="text-gray-400 text-xs">{label}</span>
                <p className={`font-semibold ${color}`}>{val}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Walk-Forward Components ────────────────────────────────────────────────────

function EfficiencyGauge({ value, label }: { value: number; label: string }) {
  const pct = Math.min(Math.max(value * 100, 0), 150);
  const color = value >= 0.75 ? "#10b981" : value >= 0.5 ? "#f59e0b" : "#ef4444";
  const circumference = 2 * Math.PI * 36;
  const strokeDash = (pct / 150) * circumference;
  return (
    <div className="flex flex-col items-center">
      <svg width="100" height="60" viewBox="0 0 100 60">
        <path d="M10,55 A40,40 0 0,1 90,55" fill="none" stroke="#374151" strokeWidth="8" strokeLinecap="round" />
        <path
          d="M10,55 A40,40 0 0,1 90,55"
          fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${(pct / 150) * 125.6} 125.6`}
          style={{ transition: "stroke-dasharray 0.5s ease" }}
        />
        <text x="50" y="48" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">{fmt(value, 2)}</text>
      </svg>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  );
}

function WFWindowsTable({ windows }: { windows: WFWindow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-400 uppercase tracking-wide border-b border-gray-700">
            <th className="py-2 text-left">Window</th>
            <th className="py-2 text-left">Train Period</th>
            <th className="py-2 text-left">Test Period</th>
            <th className="py-2 text-center">Best Risk%</th>
            <th className="py-2 text-right">IS Trades</th>
            <th className="py-2 text-right">IS WR%</th>
            <th className="py-2 text-right">IS PF</th>
            <th className="py-2 text-right">OOS Trades</th>
            <th className="py-2 text-right">OOS WR%</th>
            <th className="py-2 text-right">OOS PF</th>
            <th className="py-2 text-right">Eff. Ratio</th>
            <th className="py-2 text-center">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700/50">
          {windows.map(w => (
            <tr key={w.windowId} className={`hover:bg-gray-700/20 ${w.overfit ? "bg-red-900/10" : ""}`}>
              <td className="py-2 text-gray-300 font-medium">W{w.windowId}</td>
              <td className="py-2 text-gray-400">{w.trainStart} → {w.trainEnd}</td>
              <td className="py-2 text-gray-400">{w.testStart} → {w.testEnd}</td>
              <td className="py-2 text-center text-blue-300">{w.bestParams.riskPerTrade}%</td>
              <td className="py-2 text-right text-gray-300">{w.trainStats.trades}</td>
              <td className={`py-2 text-right ${w.trainStats.winRate >= 50 ? "text-green-400" : "text-red-400"}`}>{fmtPctRaw(w.trainStats.winRate)}</td>
              <td className={`py-2 text-right ${w.trainStats.profitFactor >= 1 ? "text-green-400" : "text-red-400"}`}>{fmt(w.trainStats.profitFactor)}</td>
              <td className="py-2 text-right text-gray-300">{w.testStats.trades}</td>
              <td className={`py-2 text-right ${w.testStats.winRate >= 50 ? "text-green-400" : "text-red-400"}`}>{fmtPctRaw(w.testStats.winRate)}</td>
              <td className={`py-2 text-right ${w.testStats.profitFactor >= 1 ? "text-green-400" : "text-red-400"}`}>{fmt(w.testStats.profitFactor)}</td>
              <td className={`py-2 text-right font-semibold ${w.efficiencyRatio >= 0.75 ? "text-green-400" : w.efficiencyRatio >= 0.5 ? "text-yellow-400" : "text-red-400"}`}>
                {fmt(w.efficiencyRatio)}
              </td>
              <td className="py-2 text-center">
                {w.overfit
                  ? <span className="px-1.5 py-0.5 rounded text-xs bg-red-900/50 text-red-400 font-medium">Overfit</span>
                  : <span className="px-1.5 py-0.5 rounded text-xs bg-green-900/50 text-green-400 font-medium">OK</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ParamStabilityChart({ pair }: { pair: WFPairResult }) {
  const stab = pair.parameterStability[0];
  if (!stab || stab.values.length === 0) return null;
  const data = stab.values.map((v, i) => ({ window: `W${i + 1}`, riskPct: v }));
  const color = stab.stable ? "#10b981" : "#f59e0b";
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h4 className="text-sm font-medium text-gray-200">Optimal Risk% per Window</h4>
        <span className={`text-xs px-1.5 py-0.5 rounded ${stab.stable ? "bg-green-900/40 text-green-400" : "bg-yellow-900/40 text-yellow-400"}`}>
          {stab.stable ? "Stable" : "Unstable"} — CV: {fmt(stab.variationCoeff, 3)}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={data} margin={{ top: 0, right: 5, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="window" tick={{ fill: "#9ca3af", fontSize: 11 }} />
          <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickFormatter={v => `${v}%`} domain={[0, 3]} />
          <Tooltip
            contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", fontSize: 12 }}
            formatter={(v: number) => [`${v}%`, "Risk Per Trade"]}
          />
          <ReferenceLine y={stab.mean} stroke="#6b7280" strokeDasharray="4 2" label={{ value: `μ=${stab.mean}%`, fill: "#9ca3af", fontSize: 10 }} />
          <Bar dataKey="riskPct" fill={color} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-500 mt-1">Mean: {stab.mean}%  ·  Std Dev: {stab.stdDev}%  ·  {stab.stable ? "Parameters are stable across windows" : "Parameter drift detected — potential instability"}</p>
    </div>
  );
}

function RegimeSensitivityChart({ windows }: { windows: WFWindow[] }) {
  // Aggregate regime sensitivity across all windows
  const regimeMap = new Map<string, { train: number[]; test: number[] }>();
  for (const w of windows) {
    for (const rs of w.regimeSensitivity) {
      if (!regimeMap.has(rs.regime)) regimeMap.set(rs.regime, { train: [], test: [] });
      regimeMap.get(rs.regime)!.train.push(rs.trainWinRate);
      regimeMap.get(rs.regime)!.test.push(rs.testWinRate);
    }
  }

  if (regimeMap.size === 0) return <p className="text-gray-500 text-sm">No regime sensitivity data</p>;

  const data = [...regimeMap.entries()].map(([regime, { train, test }]) => ({
    regime: REGIME_LABELS[regime]?.label ?? regime,
    isWR: Math.round(train.reduce((s, v) => s + v, 0) / train.length * 10) / 10,
    oosWR: Math.round(test.reduce((s, v) => s + v, 0) / test.length * 10) / 10,
    sensitivity: Math.round(Math.abs(
      train.reduce((s, v) => s + v, 0) / train.length -
      test.reduce((s, v) => s + v, 0) / test.length
    ) * 10) / 10,
  })).sort((a, b) => b.sensitivity - a.sensitivity);

  return (
    <div>
      <h4 className="text-sm font-medium text-gray-200 mb-3">Win Rate: In-Sample vs Out-of-Sample by Regime</h4>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 0, right: 5, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="regime" tick={{ fill: "#9ca3af", fontSize: 11 }} />
          <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
          <Tooltip
            contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", fontSize: 12 }}
            formatter={(v: number, name: string) => [`${v}%`, name === "isWR" ? "In-Sample WR" : "Out-of-Sample WR"]}
          />
          <Legend formatter={v => v === "isWR" ? "In-Sample WR" : "Out-of-Sample WR"} />
          <Bar dataKey="isWR" fill="#3b82f6" radius={[3, 3, 0, 0]} />
          <Bar dataKey="oosWR" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <table className="w-full text-xs mt-3">
        <thead>
          <tr className="text-gray-400 uppercase">
            <th className="py-1 text-left">Regime</th>
            <th className="py-1 text-right">IS Win%</th>
            <th className="py-1 text-right">OOS Win%</th>
            <th className="py-1 text-right">Sensitivity</th>
            <th className="py-1 text-center">Assessment</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700/50">
          {data.map(d => (
            <tr key={d.regime}>
              <td className="py-1 text-gray-200">{d.regime}</td>
              <td className="py-1 text-right text-blue-300">{fmtPctRaw(d.isWR)}</td>
              <td className="py-1 text-right text-purple-300">{fmtPctRaw(d.oosWR)}</td>
              <td className={`py-1 text-right font-medium ${d.sensitivity > 20 ? "text-red-400" : d.sensitivity > 10 ? "text-yellow-400" : "text-green-400"}`}>
                {fmtPctRaw(d.sensitivity)}
              </td>
              <td className="py-1 text-center">
                {d.sensitivity > 20
                  ? <span className="text-red-400 text-xs">High sensitivity</span>
                  : d.sensitivity > 10
                  ? <span className="text-yellow-400 text-xs">Moderate</span>
                  : <span className="text-green-400 text-xs">Robust</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WFOOSStats({ stats }: { stats: WFWindowStats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <SmallStatCard label="OOS Trades" value={String(stats.trades)} />
      <SmallStatCard label="OOS Win Rate" value={fmtPctRaw(stats.winRate)} color={stats.winRate >= 50 ? "text-green-400" : "text-red-400"} />
      <SmallStatCard label="OOS Profit Factor" value={fmt(stats.profitFactor)} color={stats.profitFactor >= 1 ? "text-green-400" : "text-red-400"} />
      <SmallStatCard label="OOS Sharpe" value={fmt(stats.sharpeRatio)} color={stats.sharpeRatio >= 1 ? "text-green-400" : "text-yellow-400"} />
      <SmallStatCard label="OOS Max DD" value={`-${fmtPctRaw(stats.maxDrawdown)}`} color="text-red-400" />
      <SmallStatCard label="OOS Expectancy" value={fmtDollar(stats.expectancy)} color={stats.expectancy >= 0 ? "text-green-400" : "text-red-400"} />
      <SmallStatCard label="OOS Total P&L" value={fmtDollar(stats.totalPnl)} color={stats.totalPnl >= 0 ? "text-green-400" : "text-red-400"} />
      <SmallStatCard label="OOS Final Balance" value={`$${stats.finalBalance.toLocaleString()}`} />
    </div>
  );
}

function WFPairCard({ pair }: { pair: WFPairResult }) {
  const [expanded, setExpanded] = useState(false);
  const meta = RECOMMENDATION_META[pair.recommendation] ?? RECOMMENDATION_META.Marginal!;
  const erColor = pair.overallEfficiencyRatio >= 0.75 ? "text-green-400" : pair.overallEfficiencyRatio >= 0.5 ? "text-yellow-400" : "text-red-400";

  return (
    <div className={`rounded-lg border p-4 ${meta.bg}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold"
            style={{ backgroundColor: PAIR_COLORS[pair.pair] + "33", color: PAIR_COLORS[pair.pair] }}>
            {pair.pair.slice(0, 2)}
          </div>
          <div>
            <h3 className="font-semibold text-white">{pair.pair}</h3>
            <p className="text-xs text-gray-400">{pair.windows.length} rolling windows</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-gray-400">Efficiency Ratio</p>
            <p className={`text-xl font-bold ${erColor}`}>{fmt(pair.overallEfficiencyRatio)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Overfit Score</p>
            <p className={`text-xl font-bold ${pair.overfitScore <= 25 ? "text-green-400" : pair.overfitScore >= 75 ? "text-red-400" : "text-yellow-400"}`}>
              {pair.overfitScore}%
            </p>
          </div>
          <div className={`px-3 py-1.5 rounded-lg border font-semibold text-sm ${meta.bg} ${meta.color}`}>
            {meta.icon} {pair.recommendation}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <WFOOSStats stats={pair.combinedTestStats} />
      </div>

      <button onClick={() => setExpanded(!expanded)}
        className="mt-3 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
        {expanded ? "▲ Hide details" : "▼ Show windows, parameter stability & regime sensitivity"}
      </button>

      {expanded && (
        <div className="mt-4 space-y-6 border-t border-gray-700/50 pt-4">
          <div>
            <h4 className="text-sm font-medium text-gray-200 mb-3">Rolling Windows — IS vs OOS</h4>
            <WFWindowsTable windows={pair.windows} />
          </div>
          <ParamStabilityChart pair={pair} />
          <RegimeSensitivityChart windows={pair.windows} />
        </div>
      )}
    </div>
  );
}

function OverfitRadarChart({ pairs }: { pairs: WFPairResult[] }) {
  if (!pairs.length) return null;
  const data = [
    { metric: "Efficiency", ...Object.fromEntries(pairs.map(p => [p.pair, Math.round(p.overallEfficiencyRatio * 100)])) },
    { metric: "Stability", ...Object.fromEntries(pairs.map(p => [p.pair, p.parameterStability[0]?.stable ? 85 : 40])) },
    { metric: "OOS WR%", ...Object.fromEntries(pairs.map(p => [p.pair, p.combinedTestStats.winRate])) },
    { metric: "OOS PF×33", ...Object.fromEntries(pairs.map(p => [p.pair, Math.min(p.combinedTestStats.profitFactor * 33, 100)])) },
    { metric: "Low Overfit", ...Object.fromEntries(pairs.map(p => [p.pair, Math.max(100 - p.overfitScore, 0)])) },
    { metric: "Sharpe×25", ...Object.fromEntries(pairs.map(p => [p.pair, Math.min(Math.max(p.combinedTestStats.sharpeRatio * 25, 0), 100)])) },
  ];
  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={data}>
        <PolarGrid stroke="#374151" />
        <PolarAngleAxis dataKey="metric" tick={{ fill: "#9ca3af", fontSize: 11 }} />
        {pairs.map(p => (
          <Radar key={p.pair} name={p.pair} dataKey={p.pair}
            stroke={PAIR_COLORS[p.pair] ?? "#9ca3af"}
            fill={PAIR_COLORS[p.pair] ?? "#9ca3af"} fillOpacity={0.15} />
        ))}
        <Legend />
        <Tooltip
          contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", fontSize: 12 }}
          formatter={(v: number, name: string) => [`${v}`, name]}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function EfficiencyTimeline({ pairs }: { pairs: WFPairResult[] }) {
  if (!pairs.length || !pairs[0]?.windows.length) return null;
  const data = pairs[0].windows.map((_, wi) => ({
    window: `W${wi + 1}`,
    ...Object.fromEntries(pairs.map(p => [p.pair, p.windows[wi]?.efficiencyRatio ?? 0])),
  }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="window" tick={{ fill: "#9ca3af", fontSize: 11 }} />
        <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} domain={[0, 1.5]} tickFormatter={v => fmt(v)} />
        <Tooltip
          contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", fontSize: 12 }}
          formatter={(v: number, name: string) => [fmt(v), name]}
        />
        <Legend />
        <ReferenceLine y={0.65} stroke="#10b981" strokeDasharray="4 2" label={{ value: "Pass threshold (0.65)", fill: "#10b981", fontSize: 10 }} />
        <ReferenceLine y={0.5} stroke="#ef4444" strokeDasharray="4 2" label={{ value: "Fail threshold (0.50)", fill: "#ef4444", fontSize: 10 }} />
        {pairs.map(p => (
          <Line key={p.pair} type="monotone" dataKey={p.pair}
            stroke={PAIR_COLORS[p.pair] ?? "#9ca3af"} dot={{ r: 4 }} strokeWidth={2} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function WalkForwardResults({ result }: { result: WalkForwardResult }) {
  const { pairs, summary } = result;
  const summaryMeta = RECOMMENDATION_META[summary.recommendation] ?? RECOMMENDATION_META.Marginal!;

  return (
    <div className="space-y-6">
      {/* Summary banner */}
      <div className={`rounded-lg border p-5 ${summaryMeta.bg}`}>
        <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-2xl font-bold ${summaryMeta.color}`}>{summaryMeta.icon} {summary.recommendation}</span>
              <span className="text-gray-400 text-sm">— Walk-Forward Verdict</span>
            </div>
            <p className="text-sm text-gray-300 max-w-lg">{summaryMeta.desc}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Avg Efficiency</p>
              <p className={`text-xl font-bold ${summary.avgEfficiencyRatio >= 0.65 ? "text-green-400" : summary.avgEfficiencyRatio >= 0.5 ? "text-yellow-400" : "text-red-400"}`}>
                {fmt(summary.avgEfficiencyRatio)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Overfit Score</p>
              <p className={`text-xl font-bold ${summary.avgOverfitScore <= 25 ? "text-green-400" : summary.avgOverfitScore >= 65 ? "text-red-400" : "text-yellow-400"}`}>
                {fmt(summary.avgOverfitScore, 0)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Param Stability</p>
              <p className={`text-xl font-bold ${summary.stableParams ? "text-green-400" : "text-yellow-400"}`}>
                {summary.stableParams ? "Stable" : "Drifting"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Regime Sensitive</p>
              <p className={`text-xl font-bold ${summary.regimeSensitive ? "text-red-400" : "text-green-400"}`}>
                {summary.regimeSensitive ? "Yes" : "No"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Radar + Efficiency timeline */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-3">Strategy Robustness Radar</h3>
          <OverfitRadarChart pairs={pairs} />
        </div>
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-3">Efficiency Ratio by Window</h3>
          <p className="text-xs text-gray-400 mb-2">OOS / IS profit factor across rolling periods. Above 0.65 = acceptable OOS degradation.</p>
          <EfficiencyTimeline pairs={pairs} />
        </div>
      </div>

      {/* Per-pair cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">Per-Pair Walk-Forward Results</h3>
        {pairs.map(p => <WFPairCard key={p.pair} pair={p} />)}
      </div>

      <p className="text-xs text-gray-500">
        Walk-forward completed at {new Date(result.ranAt).toLocaleString()} ·
        {pairs[0]?.windows.length ?? 0} rolling windows per pair ·
        Parameters tested: risk 0.5%, 1.0%, 1.5%, 2.0% per trade
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type ActiveTab = "overview" | "monthly" | "yearly" | "session" | "regime" | "equity";
type MainTab = "batch" | "walkforward";

export default function BacktestPage() {
  const [mainTab, setMainTab] = useState<MainTab>("batch");

  // Batch state
  const [initialBalance, setInitialBalance] = useState(10000);
  const [riskPerTrade, setRiskPerTrade] = useState(1);
  const [startDate, setStartDate] = useState("2019-01-01");
  const [endDate, setEndDate] = useState("2024-12-31");
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [batchResult, setBatchResult] = useState<BatchBacktestResult | null>(null);
  const [selectedPair, setSelectedPair] = useState("all");

  // Walk-forward state
  const [wfBalance, setWfBalance] = useState(10000);
  const [wfTrainYears, setWfTrainYears] = useState(2);
  const [wfTestYears, setWfTestYears] = useState(1);
  const [wfStartDate, setWfStartDate] = useState("2018-01-01");
  const [wfEndDate, setWfEndDate] = useState("2023-12-31");
  const [wfResult, setWfResult] = useState<WalkForwardResult | null>(null);

  const { mutateAsync: runBatch, isPending: batchRunning } = useRunBatchBacktest();
  const { mutateAsync: runWF, isPending: wfRunning } = useRunWalkForward();
  const { data: history } = useListBacktests();

  const handleRunBatch = async () => {
    try {
      const result = await runBatch({ data: { initialBalance, riskPerTrade, startDate, endDate } });
      setBatchResult(result);
      setActiveTab("overview");
    } catch (err) {
      console.error("Batch backtest failed", err);
    }
  };

  const handleRunWalkForward = async () => {
    try {
      const result = await runWF({
        data: {
          initialBalance: wfBalance,
          trainWindowYears: wfTrainYears,
          testWindowYears: wfTestYears,
          overallStartDate: wfStartDate,
          overallEndDate: wfEndDate,
        },
      });
      setWfResult(result);
    } catch (err) {
      console.error("Walk-forward failed", err);
    }
  };

  const displayedResults: BacktestResult[] = batchResult?.results ?? [];
  const pairFilter = selectedPair === "all" ? displayedResults : displayedResults.filter(r => r.pair === selectedPair);

  const allMonthly = pairFilter.flatMap(r => r.monthlyReturns ?? []);
  const monthMap = new Map<string, MonthlyReturn>();
  for (const m of allMonthly) {
    const key = `${m.year}-${m.month}`;
    const ex = monthMap.get(key);
    if (ex) { ex.pnl += m.pnl; ex.returnPct += m.returnPct; ex.trades += m.trades; ex.winRate = (ex.winRate + m.winRate) / 2; }
    else monthMap.set(key, { ...m });
  }
  const monthlyData = [...monthMap.values()].sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

  const allYearly = pairFilter.flatMap(r => r.yearlyReturns ?? []);
  const yearMap = new Map<number, YearlyReturn>();
  for (const y of allYearly) {
    const ex = yearMap.get(y.year);
    if (ex) { ex.pnl += y.pnl; ex.returnPct += y.returnPct; ex.trades += y.trades; ex.winRate = (ex.winRate + y.winRate) / 2; ex.profitFactor = (ex.profitFactor + y.profitFactor) / 2; ex.maxDrawdown = Math.max(ex.maxDrawdown, y.maxDrawdown); ex.sharpeRatio = (ex.sharpeRatio + y.sharpeRatio) / 2; }
    else yearMap.set(y.year, { ...y });
  }
  const yearlyData = [...yearMap.values()].sort((a, b) => a.year - b.year);

  const allRegime = pairFilter.flatMap(r => r.regimeStats ?? []);
  const regimeMap = new Map<string, RegimeStats>();
  for (const rg of allRegime) {
    const ex = regimeMap.get(rg.regime);
    if (ex) { ex.trades += rg.trades; ex.wins += rg.wins; ex.losses += rg.losses; ex.totalPnl += rg.totalPnl; ex.winRate = ex.trades > 0 ? (ex.wins / ex.trades) * 100 : 0; ex.avgPnl = ex.trades > 0 ? ex.totalPnl / ex.trades : 0; }
    else regimeMap.set(rg.regime, { ...rg });
  }
  const regimeData = [...regimeMap.values()].sort((a, b) => b.trades - a.trades);

  const allSession = pairFilter.flatMap(r => r.sessionStats ?? []);
  const sessMap = new Map<string, SessionStats>();
  for (const s of allSession) {
    const ex = sessMap.get(s.session);
    if (ex) { ex.trades += s.trades; ex.wins += s.wins; ex.losses += s.losses; ex.totalPnl += s.totalPnl; ex.winRate = ex.trades > 0 ? (ex.wins / ex.trades) * 100 : 0; ex.avgPnl = ex.trades > 0 ? ex.totalPnl / ex.trades : 0; }
    else sessMap.set(s.session, { ...s });
  }
  const sessionData = [...sessMap.values()];

  const combined = batchResult?.combinedStats;
  const ANALYSIS_TABS: { key: ActiveTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "equity", label: "Equity Curves" },
    { key: "monthly", label: "Monthly Returns" },
    { key: "yearly", label: "Yearly Returns" },
    { key: "session", label: "Session Analysis" },
    { key: "regime", label: "Regime Analysis" },
  ];

  const historyItems = history ?? [];

  const windowCount = wfResult?.pairs?.[0]?.windows?.length ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Backtesting</h1>
          <p className="text-gray-400 text-sm mt-0.5">5-Year EUR/USD · GBP/USD · USD/JPY — 4H execution, Daily regime context</p>
        </div>
        {mainTab === "batch" && displayedResults.length > 0 && (
          <select value={selectedPair} onChange={e => setSelectedPair(e.target.value)}
            className="bg-gray-700 text-white text-sm rounded px-3 py-2 border border-gray-600">
            <option value="all">All Pairs</option>
            <option value="EURUSD">EUR/USD</option>
            <option value="GBPUSD">GBP/USD</option>
            <option value="USDJPY">USD/JPY</option>
          </select>
        )}
      </div>

      {/* Main Tab switcher */}
      <div className="flex gap-1 border-b border-gray-700">
        {([
          { key: "batch" as MainTab, label: "📊 Batch Backtest" },
          { key: "walkforward" as MainTab, label: "🔁 Walk-Forward Analysis" },
        ]).map(t => (
          <button key={t.key} onClick={() => setMainTab(t.key)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors ${mainTab === t.key ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-400 hover:text-gray-200"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ─────────── BATCH BACKTEST ─────────── */}
      {mainTab === "batch" && (
        <>
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
            <h2 className="text-sm font-semibold text-gray-200 mb-4 uppercase tracking-wide">Batch Backtest Configuration</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Initial Balance ($)", value: initialBalance, setter: setInitialBalance, min: 1000, step: 1000 },
                { label: "Risk Per Trade (%)", value: riskPerTrade, setter: setRiskPerTrade, min: 0.1, step: 0.1 },
              ].map(({ label, value, setter, min, step }) => (
                <div key={label}>
                  <label className="text-xs text-gray-400 block mb-1">{label}</label>
                  <input type="number" value={value} onChange={e => setter(Number(e.target.value))}
                    className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500"
                    min={min} step={step} />
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Start Date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">End Date</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <button onClick={handleRunBatch} disabled={batchRunning}
              className={`mt-4 px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors ${batchRunning ? "bg-gray-600 text-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-500 text-white"}`}>
              {batchRunning ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Running all 3 pairs…
                </span>
              ) : "▶ Run All 3 Pairs"}
            </button>
          </div>

          {combined && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <StatCard label="Total Trades" value={String(combined.totalTrades)} sub="All 3 pairs" />
              <StatCard label="Win Rate" value={`${fmt(combined.winRate)}%`} color={combined.winRate >= 50 ? "text-green-400" : "text-red-400"} />
              <StatCard label="Total P&L" value={fmtDollar(combined.totalPnl)} color={combined.totalPnl >= 0 ? "text-green-400" : "text-red-400"} />
              <StatCard label="Profit Factor" value={fmt(combined.profitFactor)} color={combined.profitFactor >= 1 ? "text-green-400" : "text-red-400"} />
              <StatCard label="Sharpe Ratio" value={fmt(combined.sharpeRatio)} color={combined.sharpeRatio >= 1 ? "text-green-400" : "text-yellow-400"} />
              <StatCard label="Max Drawdown" value={`-${fmt(combined.maxDrawdown)}%`} color="text-red-400" />
              <StatCard label="Expectancy" value={fmtDollar(combined.expectancy)} color={combined.expectancy >= 0 ? "text-green-400" : "text-red-400"} />
            </div>
          )}

          {displayedResults.length > 0 && (
            <PairSummaryCards results={pairFilter.length > 0 ? pairFilter : displayedResults} />
          )}

          {displayedResults.length > 0 && (
            <div className="space-y-0">
              <div className="flex gap-1 border-b border-gray-700">
                {ANALYSIS_TABS.map(tab => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === tab.key ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-400 hover:text-gray-200"}`}>
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="bg-gray-800 rounded-b-lg border border-t-0 border-gray-700 p-5">
                {activeTab === "overview" && (
                  <div className="space-y-6">
                    <h2 className="text-base font-semibold text-white">Annual Performance Summary</h2>
                    <YearlyBarChart data={yearlyData} />
                    {yearlyData.length > 0 && (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-400 text-xs uppercase">
                            {["Year","Trades","Win%","P&L","Return%","PF","Sharpe","Max DD"].map(h => (
                              <th key={h} className={`py-2 ${h === "Year" ? "text-left" : "text-right"}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                          {yearlyData.map(y => (
                            <tr key={y.year} className="hover:bg-gray-700/30">
                              <td className="py-2 text-gray-200 font-medium">{y.year}</td>
                              <td className="text-right text-gray-300">{y.trades}</td>
                              <td className={`text-right font-medium ${y.winRate >= 50 ? "text-green-400" : "text-red-400"}`}>{fmt(y.winRate)}%</td>
                              <td className={`text-right ${y.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtDollar(y.pnl)}</td>
                              <td className={`text-right ${y.returnPct >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtPct(y.returnPct)}</td>
                              <td className={`text-right ${y.profitFactor >= 1 ? "text-green-400" : "text-red-400"}`}>{fmt(y.profitFactor)}</td>
                              <td className={`text-right ${y.sharpeRatio >= 1 ? "text-green-400" : "text-yellow-400"}`}>{fmt(y.sharpeRatio)}</td>
                              <td className="text-right text-red-400">-{fmt(y.maxDrawdown)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
                {activeTab === "equity" && (
                  <div>
                    <h2 className="text-base font-semibold text-white mb-4">Equity Curves by Pair</h2>
                    <EquityChart results={pairFilter.length > 0 ? pairFilter : displayedResults} />
                  </div>
                )}
                {activeTab === "monthly" && (
                  <div>
                    <h2 className="text-base font-semibold text-white mb-4">Monthly Returns Heatmap</h2>
                    <p className="text-gray-400 text-sm mb-3">Green = profitable month, Red = losing month. Intensity = magnitude.</p>
                    <MonthlyHeatmap data={monthlyData} />
                  </div>
                )}
                {activeTab === "yearly" && (
                  <div>
                    <h2 className="text-base font-semibold text-white mb-3">Yearly Returns & Drawdown</h2>
                    <YearlyBarChart data={yearlyData} />
                  </div>
                )}
                {activeTab === "session" && (
                  <div>
                    <h2 className="text-base font-semibold text-white mb-4">Session Analysis</h2>
                    <p className="text-gray-400 text-sm mb-3">Performance breakdown by London, New York, and other trading sessions.</p>
                    <SessionTable data={sessionData} />
                  </div>
                )}
                {activeTab === "regime" && (
                  <div>
                    <h2 className="text-base font-semibold text-white mb-4">Market Regime Analysis</h2>
                    <p className="text-gray-400 text-sm mb-3">
                      Strategy performance in each detected regime. Trending markets typically yield the best results for SMC/AMD setups.
                    </p>
                    <RegimeTable data={regimeData} />
                  </div>
                )}
              </div>
            </div>
          )}

          {batchRunning && (
            <div className="bg-gray-800 rounded-lg border border-blue-700 p-10 text-center">
              <div className="flex justify-center mb-4">
                <svg className="animate-spin w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              </div>
              <p className="text-white font-semibold">Running 5-year backtest on all 3 pairs…</p>
              <p className="text-gray-400 text-sm mt-2">Simulating 4H execution with Daily regime context</p>
            </div>
          )}

          {displayedResults.length === 0 && !batchRunning && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-12 text-center">
              <div className="text-5xl mb-3">📊</div>
              <h3 className="text-lg font-semibold text-white mb-2">No backtest results yet</h3>
              <p className="text-gray-400 text-sm max-w-md mx-auto">
                Click <strong className="text-white">Run All 3 Pairs</strong> to run a complete backtest
                across EUR/USD, GBP/USD, and USD/JPY.
              </p>
            </div>
          )}

          {historyItems.length > 0 && displayedResults.length === 0 && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
              <h2 className="text-sm font-semibold text-gray-200 mb-4 uppercase tracking-wide">Past Backtest Runs</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 text-xs uppercase">
                    {["Pair","Period","Trades","Win%","P&L","Max DD","Date"].map(h => (
                      <th key={h} className={`py-2 ${h === "Pair" ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {historyItems.map(bt => (
                    <tr key={bt.id} className="hover:bg-gray-700/30">
                      <td className="py-2">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PAIR_COLORS[bt.pair] ?? "#9ca3af" }} />
                          <span className="text-gray-200 font-medium">{bt.pair}</span>
                        </span>
                      </td>
                      <td className="text-right text-gray-400 text-xs">{bt.startDate} → {bt.endDate}</td>
                      <td className="text-right text-gray-300">{bt.totalTrades}</td>
                      <td className={`text-right font-medium ${bt.winRate >= 50 ? "text-green-400" : "text-red-400"}`}>{fmt(bt.winRate)}%</td>
                      <td className={`text-right ${bt.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtDollar(bt.totalPnl)}</td>
                      <td className="text-right text-red-400">-{fmt(bt.maxDrawdown)}%</td>
                      <td className="text-right text-gray-500 text-xs">{new Date(bt.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ─────────── WALK-FORWARD ─────────── */}
      {mainTab === "walkforward" && (
        <>
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
            <h2 className="text-sm font-semibold text-gray-200 mb-1 uppercase tracking-wide">Walk-Forward Configuration</h2>
            <p className="text-xs text-gray-400 mb-4">
              Each window trains over <em>N</em> years, picks the best risk parameter, then tests on the next <em>M</em> years out-of-sample.
              The efficiency ratio (OOS PF / IS PF) detects overfitting. Results roll forward across the full date range.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Initial Balance ($)</label>
                <input type="number" value={wfBalance} onChange={e => setWfBalance(Number(e.target.value))}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500"
                  min={1000} step={1000} />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Train Window (Years)</label>
                <input type="number" value={wfTrainYears} onChange={e => setWfTrainYears(Number(e.target.value))}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500"
                  min={1} max={4} step={1} />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Test Window (Years)</label>
                <input type="number" value={wfTestYears} onChange={e => setWfTestYears(Number(e.target.value))}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500"
                  min={1} max={2} step={1} />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Overall Start</label>
                <input type="date" value={wfStartDate} onChange={e => setWfStartDate(e.target.value)}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Overall End</label>
                <input type="date" value={wfEndDate} onChange={e => setWfEndDate(e.target.value)}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-4">
              <button onClick={handleRunWalkForward} disabled={wfRunning}
                className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors ${wfRunning ? "bg-gray-600 text-gray-400 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-500 text-white"}`}>
                {wfRunning ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Analysing…
                  </span>
                ) : "🔁 Run Walk-Forward Analysis"}
              </button>
              <div className="text-xs text-gray-400">
                <span className="font-medium text-gray-300">
                  {Math.floor((new Date(wfEndDate).getFullYear() - new Date(wfStartDate).getFullYear() - wfTrainYears) / wfTestYears + 1)} windows
                </span>
                {" "}× 3 pairs × 4 risk params = {" "}
                <span className="font-medium text-gray-300">
                  {Math.floor((new Date(wfEndDate).getFullYear() - new Date(wfStartDate).getFullYear() - wfTrainYears) / wfTestYears + 1) * 3 * 4} backtests
                </span>
              </div>
            </div>
          </div>

          {wfRunning && (
            <div className="bg-gray-800 rounded-lg border border-purple-700 p-10 text-center">
              <div className="flex justify-center mb-4">
                <svg className="animate-spin w-10 h-10 text-purple-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              </div>
              <p className="text-white font-semibold">Running Walk-Forward Analysis…</p>
              <p className="text-gray-400 text-sm mt-2">
                Optimising parameters in-sample, validating out-of-sample across all 3 pairs.
              </p>
              <div className="flex justify-center gap-3 mt-4 flex-wrap text-xs text-gray-400">
                {["EURUSD","GBPUSD","USDJPY"].flatMap(p =>
                  ["risk 0.5%","risk 1.0%","risk 1.5%","risk 2.0%"].map(r => (
                    <span key={`${p}-${r}`} className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: PAIR_COLORS[p] }} />
                      {p} {r}
                    </span>
                  ))
                )}
              </div>
            </div>
          )}

          {!wfResult && !wfRunning && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-12 text-center">
              <div className="text-5xl mb-3">🔁</div>
              <h3 className="text-lg font-semibold text-white mb-2">Walk-Forward Analysis</h3>
              <p className="text-gray-400 text-sm max-w-lg mx-auto">
                Tests whether in-sample performance holds up out-of-sample. Detects overfitting,
                parameter instability, and regime sensitivity across rolling {wfTrainYears}-year train
                / {wfTestYears}-year test windows.
              </p>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl mx-auto text-left">
                {[
                  { icon: "📉", title: "Overfitting", desc: "Efficiency ratio OOS÷IS < 0.5 signals curve-fitting" },
                  { icon: "🔧", title: "Param Instability", desc: "Optimal risk% varies across windows → fragile edge" },
                  { icon: "🌊", title: "Regime Sensitivity", desc: ">15% WR gap between regimes in IS vs OOS" },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="bg-gray-700/40 rounded-lg p-3 border border-gray-600">
                    <p className="text-base mb-1">{icon} <span className="text-gray-200 font-medium">{title}</span></p>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {wfResult && !wfRunning && <WalkForwardResults result={wfResult} />}
        </>
      )}
    </div>
  );
}
