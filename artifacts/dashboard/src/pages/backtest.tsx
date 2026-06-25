import { useState } from "react";
import {
  useRunBatchBacktest,
  useListBacktests,
} from "@workspace/api-client-react";
import type {
  BacktestResult,
  BatchBacktestResult,
  MonthlyReturn,
  YearlyReturn,
  RegimeStats,
  SessionStats,
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

function fmt(n: number, decimals = 2) {
  return n.toFixed(decimals);
}
function fmtDollar(n: number) {
  return (n >= 0 ? "+" : "") + "$" + fmt(Math.abs(n));
}
function fmtPct(n: number) {
  return (n >= 0 ? "+" : "") + fmt(n) + "%";
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? "text-white"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
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

type ActiveTab = "overview" | "monthly" | "yearly" | "session" | "regime" | "equity";

export default function BacktestPage() {
  const [initialBalance, setInitialBalance] = useState(10000);
  const [riskPerTrade, setRiskPerTrade] = useState(1);
  const [startDate, setStartDate] = useState("2019-01-01");
  const [endDate, setEndDate] = useState("2024-12-31");
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [batchResult, setBatchResult] = useState<BatchBacktestResult | null>(null);
  const [selectedPair, setSelectedPair] = useState("all");

  const { mutateAsync: runBatch, isPending: batchRunning } = useRunBatchBacktest();
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

  const displayedResults: BacktestResult[] = batchResult?.results ?? [];

  const pairFilter = selectedPair === "all" ? displayedResults : displayedResults.filter(r => r.pair === selectedPair);

  // Merge monthly data
  const allMonthly = pairFilter.flatMap(r => r.monthlyReturns ?? []);
  const monthMap = new Map<string, MonthlyReturn>();
  for (const m of allMonthly) {
    const key = `${m.year}-${m.month}`;
    const ex = monthMap.get(key);
    if (ex) { ex.pnl += m.pnl; ex.returnPct += m.returnPct; ex.trades += m.trades; ex.winRate = (ex.winRate + m.winRate) / 2; }
    else monthMap.set(key, { ...m });
  }
  const monthlyData = [...monthMap.values()].sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

  // Merge yearly data
  const allYearly = pairFilter.flatMap(r => r.yearlyReturns ?? []);
  const yearMap = new Map<number, YearlyReturn>();
  for (const y of allYearly) {
    const ex = yearMap.get(y.year);
    if (ex) { ex.pnl += y.pnl; ex.returnPct += y.returnPct; ex.trades += y.trades; ex.winRate = (ex.winRate + y.winRate) / 2; ex.profitFactor = (ex.profitFactor + y.profitFactor) / 2; ex.maxDrawdown = Math.max(ex.maxDrawdown, y.maxDrawdown); ex.sharpeRatio = (ex.sharpeRatio + y.sharpeRatio) / 2; }
    else yearMap.set(y.year, { ...y });
  }
  const yearlyData = [...yearMap.values()].sort((a, b) => a.year - b.year);

  // Merge regime data
  const allRegime = pairFilter.flatMap(r => r.regimeStats ?? []);
  const regimeMap = new Map<string, RegimeStats>();
  for (const rg of allRegime) {
    const ex = regimeMap.get(rg.regime);
    if (ex) { ex.trades += rg.trades; ex.wins += rg.wins; ex.losses += rg.losses; ex.totalPnl += rg.totalPnl; ex.winRate = ex.trades > 0 ? (ex.wins / ex.trades) * 100 : 0; ex.avgPnl = ex.trades > 0 ? ex.totalPnl / ex.trades : 0; }
    else regimeMap.set(rg.regime, { ...rg });
  }
  const regimeData = [...regimeMap.values()].sort((a, b) => b.trades - a.trades);

  // Merge session data
  const allSession = pairFilter.flatMap(r => r.sessionStats ?? []);
  const sessMap = new Map<string, SessionStats>();
  for (const s of allSession) {
    const ex = sessMap.get(s.session);
    if (ex) { ex.trades += s.trades; ex.wins += s.wins; ex.losses += s.losses; ex.totalPnl += s.totalPnl; ex.winRate = ex.trades > 0 ? (ex.wins / ex.trades) * 100 : 0; ex.avgPnl = ex.trades > 0 ? ex.totalPnl / ex.trades : 0; }
    else sessMap.set(s.session, { ...s });
  }
  const sessionData = [...sessMap.values()];

  const combined = batchResult?.combinedStats;
  const TABS: { key: ActiveTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "equity", label: "Equity Curves" },
    { key: "monthly", label: "Monthly Returns" },
    { key: "yearly", label: "Yearly Returns" },
    { key: "session", label: "Session Analysis" },
    { key: "regime", label: "Regime Analysis" },
  ];

  const historyItems = history ?? [];

  return (
    <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Backtesting</h1>
          <p className="text-gray-400 text-sm mt-0.5">5-Year EUR/USD · GBP/USD · USD/JPY — 4H execution, Daily regime context</p>
        </div>
        {displayedResults.length > 0 && (
          <select value={selectedPair} onChange={e => setSelectedPair(e.target.value)}
            className="bg-gray-700 text-white text-sm rounded px-3 py-2 border border-gray-600">
            <option value="all">All Pairs</option>
            <option value="EURUSD">EUR/USD</option>
            <option value="GBPUSD">GBP/USD</option>
            <option value="USDJPY">USD/JPY</option>
          </select>
        )}
      </div>

      {/* Config */}
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

      {/* Combined stats banner */}
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

      {/* Per-pair cards */}
      {displayedResults.length > 0 && (
        <PairSummaryCards results={pairFilter.length > 0 ? pairFilter : displayedResults} />
      )}

      {/* Tabs + content */}
      {displayedResults.length > 0 && (
        <div className="space-y-0">
          <div className="flex gap-1 border-b border-gray-700">
            {TABS.map(tab => (
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

      {/* Running state */}
      {batchRunning && (
        <div className="bg-gray-800 rounded-lg border border-blue-700 p-10 text-center">
          <div className="flex justify-center mb-4">
            <svg className="animate-spin w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>
          <p className="text-white font-semibold">Running 5-year backtest on all 3 pairs…</p>
          <p className="text-gray-400 text-sm mt-2">Simulating 4H execution with Daily regime context across EUR/USD, GBP/USD, USD/JPY</p>
          <div className="flex justify-center gap-6 mt-4 text-sm text-gray-400">
            {["EURUSD","GBPUSD","USDJPY"].map(p => (
              <span key={p} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: PAIR_COLORS[p] }} />
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {displayedResults.length === 0 && !batchRunning && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-12 text-center">
          <div className="text-5xl mb-3">📊</div>
          <h3 className="text-lg font-semibold text-white mb-2">No backtest results yet</h3>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            Click <strong className="text-white">Run All 3 Pairs</strong> to run a complete 5-year backtest
            across EUR/USD, GBP/USD, and USD/JPY with Win Rate, Profit Factor, Sharpe, Drawdown,
            Expectancy, Monthly/Yearly Returns, and Regime Analysis.
          </p>
        </div>
      )}

      {/* History */}
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
    </div>
  );
}
