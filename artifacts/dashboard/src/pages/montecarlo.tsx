import { useState } from "react";
import { useRunMonteCarlo, type MonteCarloRequest, type MonteCarloResult } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, ReferenceLine,
} from "recharts";

function fmt$(v: number) {
  return v >= 0
    ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : `-$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtPct(v: number, decimals = 1) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}

const CURVE_COLORS = {
  best:   "hsl(142, 76%, 36%)",
  p90:    "hsl(142, 60%, 50%)",
  median: "hsl(217, 91%, 60%)",
  p10:    "hsl(38, 92%, 50%)",
  worst:  "hsl(0, 84%, 60%)",
};

interface ParamFieldProps {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
  min?: string;
  max?: string;
}

function ParamField({ label, hint, value, onChange, step = "1", min, max }: ParamFieldProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-mono uppercase tracking-wide text-muted-foreground">{label}</label>
        <span className="text-xs text-muted-foreground/60">{hint}</span>
      </div>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}

function RuinGauge({ pct }: { pct: number }) {
  const color = pct < 5 ? "hsl(142, 76%, 36%)" : pct < 20 ? "hsl(38, 92%, 50%)" : "hsl(0, 84%, 60%)";
  const label = pct < 5 ? "Low Risk" : pct < 20 ? "Moderate" : "High Risk";
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-32 h-16 overflow-hidden">
        <div className="absolute inset-0 top-auto h-16 w-32">
          <svg viewBox="0 0 100 50" className="w-full h-full">
            <path d="M5,50 A45,45 0 0,1 95,50" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" strokeLinecap="round"/>
            <path
              d="M5,50 A45,45 0 0,1 95,50"
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * 141.4} 141.4`}
            />
          </svg>
        </div>
      </div>
      <div className="text-center -mt-2">
        <div className="text-3xl font-bold font-mono" style={{ color }}>{pct.toFixed(1)}%</div>
        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>{label}</div>
      </div>
    </div>
  );
}

function StatCard({ title, value, sub, color }: { title: string; value: string; sub?: string; color?: string }) {
  return (
    <Card className="border-card-border bg-card">
      <CardContent className="p-4">
        <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-1">{title}</div>
        <div className="text-xl font-bold font-mono" style={{ color }}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function ResultsView({ r }: { r: MonteCarloResult }) {
  // Build equity curve chart data
  const curveData = r.equityCurves.labels.map((tradeNum, i) => ({
    trade: tradeNum,
    best:   r.equityCurves.best[i]   ?? 0,
    p90:    r.equityCurves.p90[i]    ?? 0,
    median: r.equityCurves.median[i] ?? 0,
    p10:    r.equityCurves.p10[i]    ?? 0,
    worst:  r.equityCurves.worst[i]  ?? 0,
  }));

  const histMax = Math.max(...r.histogram.map(b => b.count));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-card-border bg-card col-span-2 md:col-span-1">
          <CardContent className="p-4 flex flex-col items-center justify-center h-full">
            <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-2">
              Probability of Ruin
            </div>
            <RuinGauge pct={r.probabilityOfRuin} />
            <div className="text-xs text-muted-foreground mt-1">
              At {Math.round(r.ruinThreshold * 100)}% capital loss
            </div>
          </CardContent>
        </Card>

        <div className="col-span-2 md:col-span-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            title="Expected Return"
            value={fmt$(r.expectedReturn - r.startingCapital)}
            sub={fmtPct(r.expectedReturnPct) + " on capital"}
            color={r.expectedReturn >= r.startingCapital ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"}
          />
          <StatCard
            title="Expected Monthly"
            value={fmt$(r.expectedMonthlyReturn)}
            sub={`Median ${fmt$(r.medianMonthlyReturn)}`}
            color={r.expectedMonthlyReturn >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"}
          />
          <StatCard
            title="Expected Drawdown"
            value={`${r.expectedDrawdown.toFixed(1)}%`}
            sub={`Worst ${r.worstDrawdown.toFixed(1)}%`}
            color="hsl(38, 92%, 50%)"
          />
          <StatCard
            title="Worst Losing Streak"
            value={`${r.worstLosingStreak} trades`}
            sub={`Avg ${r.expectedLosingStreak.toFixed(1)}`}
            color="hsl(0, 84%, 60%)"
          />
          <StatCard
            title="Best Case (+95th %)"
            value={fmt$(r.bestCaseReturn - r.startingCapital)}
            sub={fmtPct(r.bestCaseReturnPct)}
            color="hsl(142, 76%, 36%)"
          />
          <StatCard
            title="Worst Case (5th %)"
            value={fmt$(r.worstCaseReturn - r.startingCapital)}
            sub={fmtPct(r.worstCaseReturnPct)}
            color="hsl(0, 84%, 60%)"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-card-border bg-card">
          <CardHeader className="pb-2 border-b border-border/10 bg-muted/5">
            <CardTitle className="text-sm font-mono uppercase tracking-wide">
              Equity Curves — {r.numSimulations.toLocaleString()} Simulations
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-3">
              {([
                ["Best (98th %)", CURVE_COLORS.best],
                ["90th %",        CURVE_COLORS.p90],
                ["Median",        CURVE_COLORS.median],
                ["10th %",        CURVE_COLORS.p10],
                ["Worst (2nd %)", CURVE_COLORS.worst],
              ] as [string, string][]).map(([label, color]) => (
                <span key={label} className="flex items-center gap-1">
                  <span className="w-3 h-0.5 inline-block rounded" style={{ background: color }} />
                  <span className="text-muted-foreground">{label}</span>
                </span>
              ))}
            </div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={curveData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="trade"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    stroke="hsl(var(--muted-foreground))"
                    label={{ value: "Trade #", position: "insideBottom", offset: -2, fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                    width={52}
                  />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }}
                    formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]}
                    labelFormatter={v => `Trade ${v}`}
                  />
                  <ReferenceLine y={r.startingCapital} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeWidth={1} />
                  {(["best", "p90", "median", "p10", "worst"] as const).map(key => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={CURVE_COLORS[key]}
                      strokeWidth={key === "median" ? 2.5 : 1.5}
                      dot={false}
                      strokeDasharray={key === "worst" ? "4 2" : key === "best" ? "4 2" : undefined}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-card-border bg-card">
          <CardHeader className="pb-2 border-b border-border/10 bg-muted/5">
            <CardTitle className="text-sm font-mono uppercase tracking-wide">
              Final Equity Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="h-[310px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r.histogram} barCategoryGap="10%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="rangeLabel"
                    fontSize={9}
                    tickLine={false}
                    axisLine={false}
                    stroke="hsl(var(--muted-foreground))"
                    interval={3}
                    tickFormatter={v => `$${Number(v) >= 1000 ? `${(Number(v)/1000).toFixed(0)}k` : v}`}
                  />
                  <YAxis
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={v => `${v}`}
                  />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }}
                    formatter={(v: number, name: string) => [name === "count" ? `${v} runs` : `${v}%`, name === "count" ? "Count" : "Freq"]}
                    labelFormatter={v => `Equity ≈ $${Number(v).toLocaleString()}`}
                  />
                  <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                    {r.histogram.map((b, i) => {
                      const equity = parseFloat(b.rangeLabel);
                      const color =
                        equity >= r.startingCapital * 1.2  ? "hsl(142, 76%, 36%)" :
                        equity >= r.startingCapital        ? "hsl(142, 60%, 55%)" :
                        equity >= r.startingCapital * 0.7  ? "hsl(38, 92%, 50%)"  :
                        "hsl(0, 84%, 60%)";
                      return <Cell key={i} fill={color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-card-border bg-card">
          <CardHeader className="pb-2 border-b border-border/10 bg-muted/5">
            <CardTitle className="text-sm font-mono uppercase tracking-wide">Outcome Percentiles</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-3">
              {[
                { label: "95th (Best Case)",  value: r.bestCaseReturn,  pct: r.bestCaseReturnPct },
                { label: "90th Percentile",   value: r.percentile90,    pct: ((r.percentile90 - r.startingCapital) / r.startingCapital) * 100 },
                { label: "75th Percentile",   value: r.percentile75,    pct: ((r.percentile75 - r.startingCapital) / r.startingCapital) * 100 },
                { label: "Median (50th)",      value: r.medianReturn,    pct: ((r.medianReturn  - r.startingCapital) / r.startingCapital) * 100 },
                { label: "25th Percentile",   value: r.percentile25,    pct: ((r.percentile25 - r.startingCapital) / r.startingCapital) * 100 },
                { label: "10th Percentile",   value: r.percentile10,    pct: ((r.percentile10 - r.startingCapital) / r.startingCapital) * 100 },
                { label: "5th (Worst Case)",   value: r.worstCaseReturn, pct: r.worstCaseReturnPct },
              ].map(({ label, value, pct }) => {
                const isPos = value >= r.startingCapital;
                return (
                  <div key={label} className="flex items-center gap-3">
                    <div className="w-36 text-xs text-muted-foreground shrink-0">{label}</div>
                    <div className="flex-1 h-2 bg-muted/20 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, Math.abs(pct) / 2 + 50)}%`,
                          background: isPos ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)",
                        }}
                      />
                    </div>
                    <div className="w-24 text-right font-mono text-sm" style={{ color: isPos ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)" }}>
                      {fmt$(value)}
                    </div>
                    <div className="w-16 text-right font-mono text-xs text-muted-foreground">
                      {fmtPct(pct, 0)}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-card-border bg-card">
          <CardHeader className="pb-2 border-b border-border/10 bg-muted/5">
            <CardTitle className="text-sm font-mono uppercase tracking-wide">Risk Summary</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  ["Simulations Run",       r.numSimulations.toLocaleString()],
                  ["Trades per Sim",        r.numTrades.toString()],
                  ["Win Rate",              `${(r.winRate * 100).toFixed(1)}%`],
                  ["Avg Win",               fmt$(r.avgWin)],
                  ["Avg Loss",              fmt$(r.avgLoss)],
                  ["Risk/Reward Ratio",     `1 : ${(r.avgWin / r.avgLoss).toFixed(2)}`],
                  ["Starting Capital",      fmt$(r.startingCapital)],
                  ["Ruin Threshold",        `${Math.round(r.ruinThreshold * 100)}% loss`],
                  ["Expected Drawdown",     `${r.expectedDrawdown.toFixed(1)}%`],
                  ["90th % Drawdown",       `${r.drawdownPercentile90.toFixed(1)}%`],
                  ["Worst Drawdown",        `${r.worstDrawdown.toFixed(1)}%`],
                  ["Worst Losing Streak",   `${r.worstLosingStreak} in a row`],
                  ["Avg Losing Streak",     `${r.expectedLosingStreak.toFixed(1)} in a row`],
                  ["Expected Monthly",      fmt$(r.expectedMonthlyReturn)],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between gap-2 border-b border-border/10 pb-1">
                    <span className="text-muted-foreground text-xs">{label}</span>
                    <span className="font-mono font-medium text-xs">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const DEFAULTS = {
  numSimulations: "10000",
  numTrades: "100",
  startingCapital: "10000",
  ruinThreshold: "0.5",
  tradesPerMonth: "20",
};

export default function MonteCarlo() {
  const [params, setParams] = useState({ ...DEFAULTS });
  const [overrideStats, setOverrideStats] = useState(false);
  const [manualWinRate, setManualWinRate] = useState("55");
  const [manualAvgWin, setManualAvgWin] = useState("150");
  const [manualAvgLoss, setManualAvgLoss] = useState("80");
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const { mutate, isPending } = useRunMonteCarlo({
    mutation: {
      onSuccess: (data) => { setResult(data); setHasRun(true); },
      onError: (err) => console.error("Monte Carlo failed", err),
    },
  });

  function handleRun() {
    const body: MonteCarloRequest = {
      numSimulations:  parseInt(params.numSimulations),
      numTrades:       parseInt(params.numTrades),
      startingCapital: parseFloat(params.startingCapital),
      ruinThreshold:   parseFloat(params.ruinThreshold),
      tradesPerMonth:  parseInt(params.tradesPerMonth),
      useHistoricalData: !overrideStats,
    };
    if (overrideStats) {
      body.winRate = parseFloat(manualWinRate) / 100;
      body.avgWin  = parseFloat(manualAvgWin);
      body.avgLoss = parseFloat(manualAvgLoss);
    }
    mutate({ data: body });
  }

  function set(key: keyof typeof DEFAULTS) {
    return (v: string) => setParams(p => ({ ...p, [key]: v }));
  }

  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight">Monte Carlo Simulation</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Run {parseInt(params.numSimulations).toLocaleString()} strategy simulations to model probability of ruin, drawdown, and return distributions.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="border-card-border bg-card lg:col-span-1">
          <CardHeader className="pb-2 border-b border-border/10 bg-muted/5">
            <CardTitle className="text-sm font-mono uppercase tracking-wide">Parameters</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <ParamField label="Simulations" hint="100–50,000" value={params.numSimulations} onChange={set("numSimulations")} min="100" max="50000" />
            <ParamField label="Trades / Sim" hint="10–1,000" value={params.numTrades} onChange={set("numTrades")} min="10" max="1000" />
            <ParamField label="Starting Capital ($)" hint="USD" value={params.startingCapital} onChange={set("startingCapital")} step="100" min="1000" />
            <ParamField label="Ruin Threshold" hint="0–1 (e.g. 0.5 = 50%)" value={params.ruinThreshold} onChange={set("ruinThreshold")} step="0.05" min="0.05" max="0.99" />
            <ParamField label="Trades / Month" hint="for monthly calc" value={params.tradesPerMonth} onChange={set("tradesPerMonth")} min="1" />

            <div className="border-t border-border/20 pt-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={overrideStats}
                  onChange={e => setOverrideStats(e.target.checked)}
                  className="accent-primary"
                />
                <span className="text-muted-foreground">Override trade stats</span>
              </label>
              {overrideStats && (
                <div className="space-y-3 pl-1">
                  <ParamField label="Win Rate (%)" hint="0–100" value={manualWinRate} onChange={setManualWinRate} step="0.5" min="1" max="99" />
                  <ParamField label="Avg Win ($)" hint="USD" value={manualAvgWin} onChange={setManualAvgWin} step="10" min="1" />
                  <ParamField label="Avg Loss ($)" hint="USD" value={manualAvgLoss} onChange={setManualAvgLoss} step="10" min="1" />
                </div>
              )}
            </div>

            {!overrideStats && (
              <p className="text-xs text-muted-foreground">
                Using historical trade statistics from your journal. Check "Override" to enter custom values.
              </p>
            )}

            <button
              onClick={handleRun}
              disabled={isPending}
              className="w-full py-2 rounded-md font-mono text-sm font-semibold uppercase tracking-wide bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? "Simulating..." : "Run Simulation"}
            </button>
          </CardContent>
        </Card>

        <div className="lg:col-span-3">
          {isPending && (
            <div className="h-64 flex flex-col items-center justify-center gap-4 text-muted-foreground">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <div className="text-sm font-mono">Running {parseInt(params.numSimulations).toLocaleString()} simulations…</div>
            </div>
          )}
          {!isPending && !hasRun && (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-muted-foreground border border-dashed border-border/40 rounded-lg">
              <div className="text-4xl">◎</div>
              <div className="text-sm font-mono">Configure parameters and click Run Simulation</div>
              <div className="text-xs opacity-60">Uses your historical trade statistics by default</div>
            </div>
          )}
          {!isPending && result && hasRun && <ResultsView r={result} />}
        </div>
      </div>
    </div>
  );
}
