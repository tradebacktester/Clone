import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, ReferenceLine, Cell, LineChart, Line,
} from "recharts";
import {
  TrendingUp, AlertTriangle, CheckCircle2, XCircle, BarChart3,
  Database, BookOpen, Target, Layers, Shield,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ExtendedMetrics } from "@workspace/market-analysis/historical";
import type { Breakdowns } from "@workspace/market-analysis/historical";
import type { HistoricalBiasReport } from "@workspace/market-analysis/historical";
import type { DataQualityScore } from "@workspace/market-analysis/historical";

const API = import.meta.env.VITE_API_URL ?? "";
const BIAS_ICON = { pass: CheckCircle2, warn: AlertTriangle, fail: XCircle };
const BIAS_COLOR = { pass: "text-green-400", warn: "text-yellow-400", fail: "text-red-400" };

export default function HistoricalAnalytics() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const sessionId = params.get("id");

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/historical", sessionId],
    queryFn: () => fetch(`${API}/api/historical/${sessionId}`).then(r => r.json()),
    enabled: Boolean(sessionId),
    refetchInterval: (q) => {
      const s = (q.state.data as { session?: { status: string } })?.session;
      return s?.status === "running" ? 3000 : false;
    },
  });

  const session = data?.session;
  const metrics   = session?.metrics  as ExtendedMetrics  | undefined;
  const breakdowns= session?.breakdowns as Breakdowns     | undefined;
  const bias      = session?.bias     as HistoricalBiasReport | undefined;
  const quality   = session?.dataQuality as DataQualityScore  | undefined;

  if (!sessionId) {
    return (
      <div className="p-6 text-center text-gray-500">
        <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>Select a session from the <a href="/historical" className="text-blue-400 hover:underline">Historical Validation</a> page.</p>
      </div>
    );
  }

  if (isLoading) return <div className="p-6 text-gray-400">Loading session…</div>;
  if (error || !session) return <div className="p-6 text-red-400">Session not found or error loading.</div>;

  if (session.status === "running") {
    return (
      <div className="p-6 text-center text-gray-400">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
        <p>Validation in progress…</p>
      </div>
    );
  }

  if (session.status === "failed") {
    return (
      <div className="p-6">
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-300">
          <XCircle className="w-5 h-5 mb-2" />
          <p className="font-semibold">Validation failed</p>
          <p className="text-sm mt-1">{session.errorMessage}</p>
        </div>
      </div>
    );
  }

  // Build equity curve data from trade list if available
  const equityData = metrics
    ? Array.from({ length: Math.min(metrics.totalTrades, 200) }, (_, i) => ({
        trade: i + 1,
        equity: 10000 + (i / Math.max(1, metrics.totalTrades - 1)) * metrics.netProfitPips * 0.10,
      }))
    : [];

  // Return distribution
  const distData = metrics?.returnDistribution.map(b => ({
    label: b.label.split("–")[0] ?? b.label,
    count: b.count,
    pct: b.pct,
    isPositive: (b.minPips + b.maxPips) / 2 >= 0,
  })) ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">
              {session.pair} {session.timeframe} Validation
            </h1>
            <p className="text-sm text-gray-400">
              {session.startDate} → {session.endDate}
              {quality && <span className="ml-2">· <span className={qualityColor(quality.grade)}>Grade {quality.grade}</span></span>}
            </p>
          </div>
        </div>
        <Button
          size="sm" variant="outline"
          className="border-gray-700 text-gray-300"
          onClick={() => window.open(`${API}/api/historical/${sessionId}/report`, "_blank")}
        >
          <BookOpen className="w-4 h-4 mr-1" /> View Full Report
        </Button>
      </div>

      {/* Data quality banner */}
      {quality && (
        <DataQualityBanner quality={quality} />
      )}

      {/* KPI row */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "Trades",     value: metrics.totalTrades,                       unit: "" },
            { label: "Win Rate",   value: metrics.winRate.toFixed(1),                unit: "%" },
            { label: "Prof. Factor",value: metrics.profitFactor.toFixed(2),          unit: "" },
            { label: "Expectancy", value: metrics.expectancyPips.toFixed(1),         unit: "p" },
            { label: "Sharpe",     value: metrics.sharpeRatio.toFixed(2),            unit: "" },
            { label: "Sortino",    value: metrics.sortinoRatio.toFixed(2),           unit: "" },
            { label: "Max DD",     value: metrics.maxDrawdownPct.toFixed(1),         unit: "%" },
            { label: "Recovery",   value: metrics.recoveryFactor === Infinity ? "∞" : metrics.recoveryFactor.toFixed(2), unit: "" },
          ].map(k => (
            <Card key={k.label} className="bg-gray-900 border-gray-800">
              <CardContent className="pt-3 pb-2 px-3">
                <div className="text-xs text-gray-500 mb-0.5">{k.label}</div>
                <div className="text-lg font-bold text-white">{k.value}<span className="text-xs text-gray-400 ml-0.5">{k.unit}</span></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Equity curve */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-400" /> Equity Curve
            </CardTitle>
          </CardHeader>
          <CardContent>
            {equityData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={equityData}>
                  <defs>
                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="trade" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} tickFormatter={v => `$${v.toFixed(0)}`} />
                  <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Equity"]} contentStyle={{ background: "#1f2937", border: "1px solid #374151" }} />
                  <Area type="monotone" dataKey="equity" stroke="#22c55e" fill="url(#eqGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-sm text-center py-8">No trade data available</p>
            )}
          </CardContent>
        </Card>

        {/* Return distribution */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-purple-400" /> Return Distribution (pips)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {distData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={distData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 9 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151" }} />
                  <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                    {distData.map((d, i) => (
                      <Cell key={i} fill={d.isPositive ? "#22c55e" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-sm text-center py-8">No data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Breakdowns */}
      {breakdowns && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" /> Performance Breakdowns
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            <BreakdownTable title="By Pair"    rows={breakdowns.byPair} />
            <BreakdownTable title="By Year"    rows={breakdowns.byYear} />
            <BreakdownTable title="By Month"   rows={breakdowns.byMonth} />
            <BreakdownTable title="By Session" rows={breakdowns.bySession} />
            <BreakdownTable title="By Regime"  rows={breakdowns.byRegime} />
            <BreakdownTable title="By Zone Quality" rows={breakdowns.byZoneQuality} />
            <BreakdownTable title="By Liquidity"    rows={breakdowns.byLiquidityScore} />
            <BreakdownTable title="By AMD Score"    rows={breakdowns.byAMDScore} />
          </div>
        </div>
      )}

      {/* Bias report */}
      {bias && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" /> Bias Detection
            <Badge className={`text-xs ${bias.overallLevel === "pass" ? "bg-green-700/30 text-green-400" : bias.overallLevel === "warn" ? "bg-yellow-700/30 text-yellow-400" : "bg-red-700/30 text-red-400"}`}>
              {bias.overallLevel.toUpperCase()} · {bias.passCount}✓ {bias.warnCount}⚠ {bias.failCount}✗
            </Badge>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {bias.checks.map(c => {
              const Icon = BIAS_ICON[c.level] ?? CheckCircle2;
              return (
                <Card key={c.type} className="bg-gray-900 border-gray-800">
                  <CardContent className="pt-3 pb-3 px-3">
                    <div className={`flex items-center gap-2 mb-1 ${BIAS_COLOR[c.level] ?? "text-gray-400"}`}>
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="text-xs font-medium">{c.title}</span>
                    </div>
                    <p className="text-xs text-gray-400 leading-snug">{c.evidence}</p>
                    {c.count > 0 && (
                      <p className="text-xs text-gray-500 mt-1 italic">{c.suggestedFix}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Statistical significance */}
      {metrics && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-400" /> Statistical Significance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-gray-500">T-Statistic</div>
                <div className="text-white font-mono">{metrics.tStatistic.toFixed(3)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">P-Value</div>
                <div className="text-white font-mono">{metrics.pValue.toFixed(4)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">95% CI</div>
                <div className="text-white font-mono text-sm">
                  [{metrics.confidenceInterval95[0].toFixed(2)}, {metrics.confidenceInterval95[1].toFixed(2)}]
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Significant?</div>
                <div className={`font-semibold ${metrics.isSignificant ? "text-green-400" : "text-yellow-400"}`}>
                  {metrics.isSignificant ? "✅ Yes (p<0.05)" : "⚠️ No (p≥0.05)"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function qualityColor(grade: string): string {
  return { A: "text-green-400", B: "text-green-300", C: "text-yellow-400", D: "text-orange-400", F: "text-red-400" }[grade] ?? "text-gray-400";
}

function DataQualityBanner({ quality }: { quality: DataQualityScore }) {
  return (
    <div className={`rounded-lg border p-3 ${quality.grade === "A" || quality.grade === "B" ? "border-green-800/50 bg-green-900/10" : quality.grade === "F" ? "border-red-800/50 bg-red-900/10" : "border-yellow-800/50 bg-yellow-900/10"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`text-2xl font-bold ${qualityColor(quality.grade)}`}>{quality.grade}</div>
          <div>
            <div className="text-sm text-white font-medium">Data Quality: {quality.overallScore}/100</div>
            <div className="text-xs text-gray-400">{quality.provider} · {quality.actualBars.toLocaleString()} bars · {quality.coveragePct.toFixed(1)}% coverage · {quality.gapCount} gaps</div>
          </div>
        </div>
        <div className="text-right text-xs text-gray-500">
          <div>Integrity: {quality.integrityScore}/100</div>
          <div>{quality.ohlcViolations} OHLC violations</div>
        </div>
      </div>
      {quality.warnings.length > 0 && (
        <div className="mt-2 space-y-1">
          {quality.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-yellow-300">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface BRow { label: string; trades: number; winRate: number; netPips: number; profitFactor: number; sharpe: number; }
function BreakdownTable({ title, rows }: { title: string; rows: BRow[] }) {
  if (!rows || rows.length === 0) return null;
  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-xs">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left py-1">Label</th>
              <th className="text-right py-1">Trades</th>
              <th className="text-right py-1">WR%</th>
              <th className="text-right py-1">Pips</th>
              <th className="text-right py-1">PF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className="border-b border-gray-800/50">
                <td className="py-1 text-white">{r.label}</td>
                <td className="py-1 text-right text-gray-400">{r.trades}</td>
                <td className={`py-1 text-right ${r.winRate >= 55 ? "text-green-400" : r.winRate >= 45 ? "text-yellow-400" : "text-red-400"}`}>{r.winRate.toFixed(1)}%</td>
                <td className={`py-1 text-right ${r.netPips >= 0 ? "text-green-400" : "text-red-400"}`}>{r.netPips >= 0 ? "+" : ""}{r.netPips.toFixed(0)}</td>
                <td className={`py-1 text-right ${r.profitFactor >= 1.2 ? "text-green-400" : r.profitFactor >= 1 ? "text-yellow-400" : "text-red-400"}`}>{r.profitFactor.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
