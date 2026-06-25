import { useGetRegimeAnalytics, useGetRegimeWeights } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, Legend,
} from "recharts";

const REGIME_LABELS: Record<string, string> = {
  trending:      "Trending",
  ranging:       "Ranging",
  volatile:      "High Volatility",
  low_volatility: "Low Volatility",
};

const REGIME_COLORS: Record<string, string> = {
  trending:       "hsl(142, 76%, 36%)",
  ranging:        "hsl(217, 91%, 60%)",
  volatile:       "hsl(0, 84%, 60%)",
  low_volatility: "hsl(38, 92%, 50%)",
};

const REGIME_ICONS: Record<string, string> = {
  trending:       "↗",
  ranging:        "↔",
  volatile:       "⚡",
  low_volatility: "○",
};

function formatPct(v?: number) {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

function RegimeTag({ regime }: { regime: string }) {
  const color = REGIME_COLORS[regime] ?? "hsl(var(--muted-foreground))";
  const label = REGIME_LABELS[regime] ?? regime;
  const icon = REGIME_ICONS[regime] ?? "?";
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide"
      style={{ background: `${color}22`, color }}
    >
      {icon} {label}
    </span>
  );
}

export default function Regime() {
  const { data, isLoading } = useGetRegimeAnalytics();
  const { data: weights, isLoading: isLoadingWeights } = useGetRegimeWeights();

  const regimes = data?.regimes ?? [];
  const best = data?.bestRegime;
  const currentRegimes = data?.currentRegimes ?? {};

  const bestStat = regimes.find(r => r.regime === best);

  const componentBreakdown = regimes.map(r => ({
    name: REGIME_LABELS[r.regime] ?? r.regime,
    Zone:    r.zoneWinRate,
    Liquidity: r.liquidityWinRate,
    AMD:     r.amdWinRate,
    Confirmation: r.confirmationWinRate,
  }));

  const winRateData = regimes.map(r => ({
    name: REGIME_LABELS[r.regime] ?? r.regime,
    "Win Rate": r.winRate,
    "Profit Factor": Math.min(r.profitFactor, 5),
    regime: r.regime,
  }));

  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight">
            Market Regime Analytics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Adaptive regime detection — Trending · Ranging · High Volatility · Low Volatility
          </p>
        </div>
        <div className="flex gap-2">
          {Object.entries(currentRegimes).map(([pair, regime]) => (
            <div key={pair} className="text-right">
              <div className="text-xs text-muted-foreground font-mono">{pair}</div>
              <RegimeTag regime={regime} />
            </div>
          ))}
        </div>
      </div>

      {best && bestStat && (
        <div
          className="rounded-lg border p-4 flex items-center gap-4"
          style={{ borderColor: REGIME_COLORS[best] ?? "hsl(var(--border))", background: `${REGIME_COLORS[best]}11` }}
        >
          <div className="text-3xl">{REGIME_ICONS[best]}</div>
          <div>
            <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Best Performing Regime</div>
            <div className="text-lg font-bold" style={{ color: REGIME_COLORS[best] }}>
              {REGIME_LABELS[best] ?? best}
            </div>
            <div className="text-sm text-muted-foreground">
              {bestStat.totalTrades} trades · {formatPct(bestStat.winRate)} win rate · {bestStat.profitFactor.toFixed(2)} profit factor
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse bg-muted/20 rounded-lg" />
            ))
          : regimes.map(r => (
              <Card
                key={r.regime}
                className="border-card-border bg-card"
                style={{ borderColor: r.isBestRegime ? REGIME_COLORS[r.regime] : undefined }}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <RegimeTag regime={r.regime} />
                    {r.isBestRegime && (
                      <span className="text-xs text-yellow-400 font-semibold">BEST</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <div className="text-muted-foreground">Win Rate</div>
                    <div className="text-right font-mono font-medium">{formatPct(r.winRate)}</div>
                    <div className="text-muted-foreground">Prof. Factor</div>
                    <div className="text-right font-mono font-medium">{r.profitFactor.toFixed(2)}</div>
                    <div className="text-muted-foreground">Drawdown</div>
                    <div className="text-right font-mono font-medium">{formatPct(r.maxDrawdown)}</div>
                    <div className="text-muted-foreground">Trades</div>
                    <div className="text-right font-mono font-medium">{r.totalTrades}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-card-border bg-card">
          <CardHeader className="pb-2 border-b border-border/10 bg-muted/5">
            <CardTitle className="text-sm font-mono uppercase tracking-wide">Win Rate by Regime</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[260px]">
              {isLoading ? (
                <div className="w-full h-full animate-pulse bg-muted/20 rounded" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={winRateData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `${v}%`} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }}
                      formatter={(v: number, name: string) => [name === "Win Rate" ? `${v.toFixed(1)}%` : v.toFixed(2), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Win Rate" radius={[4, 4, 0, 0]}>
                      {winRateData.map(entry => (
                        <Cell key={entry.regime} fill={REGIME_COLORS[entry.regime] ?? "hsl(var(--primary))"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-card-border bg-card">
          <CardHeader className="pb-2 border-b border-border/10 bg-muted/5">
            <CardTitle className="text-sm font-mono uppercase tracking-wide">Component Win Rate per Regime</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[260px]">
              {isLoading ? (
                <div className="w-full h-full animate-pulse bg-muted/20 rounded" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={componentBreakdown} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `${v}%`} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }}
                      formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Zone" fill="hsl(142, 76%, 36%)" radius={[2,2,0,0]} />
                    <Bar dataKey="Liquidity" fill="hsl(217, 91%, 60%)" radius={[2,2,0,0]} />
                    <Bar dataKey="AMD" fill="hsl(280, 85%, 65%)" radius={[2,2,0,0]} />
                    <Bar dataKey="Confirmation" fill="hsl(38, 92%, 50%)" radius={[2,2,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-card-border bg-card">
        <CardHeader className="pb-2 border-b border-border/10 bg-muted/5">
          <CardTitle className="text-sm font-mono uppercase tracking-wide">Adaptive Weight Profiles</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {isLoadingWeights ? (
            <div className="h-12 animate-pulse bg-muted/20 rounded" />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {(weights ?? []).map(w => (
                <div key={w.regime} className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-semibold uppercase" style={{ color: REGIME_COLORS[w.regime] }}>
                      {REGIME_ICONS[w.regime]} {REGIME_LABELS[w.regime] ?? w.regime}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    {[
                      ["Zone", (w.zone * 100).toFixed(1)],
                      ["Liquidity", (w.liquidity * 100).toFixed(1)],
                      ["AMD", (w.amd * 100).toFixed(1)],
                      ["Confirmation", (w.confirmation * 100).toFixed(1)],
                    ].map(([label, val]) => (
                      <div key={label} className="flex items-center gap-2">
                        <div className="flex-1">
                          <div className="flex justify-between mb-0.5">
                            <span>{label}</span>
                            <span className="font-mono font-medium text-foreground">{val}%</span>
                          </div>
                          <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${val}%`, background: REGIME_COLORS[w.regime] ?? "hsl(var(--primary))" }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {w.sampleSize} samples
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-card-border bg-card">
        <CardHeader className="pb-2 border-b border-border/10 bg-muted/5">
          <CardTitle className="text-sm font-mono uppercase tracking-wide">Detailed Performance by Regime</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/20 bg-muted/5">
                  {["Regime", "Trades", "Win Rate", "Profit Factor", "Max DD", "Zone WR", "Liquidity WR", "AMD WR", "Confirm WR", "Best"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-mono uppercase tracking-wide text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/10">
                        {Array.from({ length: 10 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse bg-muted/20 rounded w-12" /></td>
                        ))}
                      </tr>
                    ))
                  : regimes.map(r => (
                      <tr
                        key={r.regime}
                        className={`border-b border-border/10 transition-colors hover:bg-muted/5 ${r.isBestRegime ? "bg-muted/5" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <RegimeTag regime={r.regime} />
                            {r.isBestRegime && <span className="text-xs text-yellow-400">★</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono">{r.totalTrades}</td>
                        <td className="px-4 py-3 font-mono font-medium" style={{ color: r.winRate >= 50 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)" }}>{formatPct(r.winRate)}</td>
                        <td className="px-4 py-3 font-mono">{r.profitFactor.toFixed(2)}</td>
                        <td className="px-4 py-3 font-mono text-red-400">{formatPct(r.maxDrawdown)}</td>
                        <td className="px-4 py-3 font-mono">{formatPct(r.zoneWinRate)}</td>
                        <td className="px-4 py-3 font-mono">{formatPct(r.liquidityWinRate)}</td>
                        <td className="px-4 py-3 font-mono">{formatPct(r.amdWinRate)}</td>
                        <td className="px-4 py-3 font-mono">{formatPct(r.confirmationWinRate)}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-1.5 py-0.5 bg-muted/20 rounded font-mono capitalize">{r.bestComponent}</span>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
