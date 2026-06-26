import { useState } from "react";
import { useGetTimePerformance } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from "recharts";

type Dimension = "weekday" | "hour" | "session" | "pair" | "regime" | "setup" | "volatility";

const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: "weekday", label: "By Day" },
  { key: "hour", label: "By Hour" },
  { key: "session", label: "By Session" },
  { key: "pair", label: "By Pair" },
  { key: "regime", label: "By Regime" },
  { key: "setup", label: "By Setup" },
  { key: "volatility", label: "By Volatility" },
];

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm">
      <p className="font-medium text-white mb-1">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="text-slate-300">
          {p.name}: <span className="font-semibold">{p.name === "winRate" ? `${p.value}%` : p.name.includes("Pnl") ? `$${p.value.toFixed(2)}` : p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function TimePerformance() {
  const [dimension, setDimension] = useState<Dimension>("weekday");
  const { data, isLoading } = useGetTimePerformance({ dimension });

  const chartData = data?.rows ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Time Performance</h1>
        <p className="text-slate-400 text-sm mt-1">
          Win rate and P&L broken down by time dimensions
          {data && <span className="ml-1">({data.totalTrades} total trades)</span>}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {DIMENSIONS.map(d => (
          <Button
            key={d.key}
            size="sm"
            variant={dimension === d.key ? "default" : "outline"}
            onClick={() => setDimension(d.key)}
            className="border-slate-600 text-slate-300 text-xs"
          >{d.label}</Button>
        ))}
      </div>

      {isLoading ? (
        <Card className="bg-slate-800/60 border-slate-700">
          <CardContent className="py-12 text-center text-slate-500">Loading...</CardContent>
        </Card>
      ) : chartData.length === 0 ? (
        <Card className="bg-slate-800/60 border-slate-700">
          <CardContent className="py-12 text-center">
            <p className="text-slate-500">No trade data available. Run the bot and close some trades first.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader>
              <CardTitle className="text-sm text-slate-200">Win Rate {dimension.charAt(0).toUpperCase() + dimension.slice(1)}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => `${v}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="winRate" name="winRate" radius={[3, 3, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.winRate >= 55 ? "#10b981" : entry.winRate >= 45 ? "#3b82f6" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader>
              <CardTitle className="text-sm text-slate-200">Net P&L</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => `$${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="totalPnl" name="totalPnl" radius={[3, 3, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.totalPnl >= 0 ? "#10b981" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/60 border-slate-700 xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm text-slate-200">Detailed Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      {["Label", "Trades", "Wins", "Losses", "Win Rate", "Net P&L", "Avg P&L"].map(h => (
                        <th key={h} className="text-left py-2 px-3 text-xs text-slate-400 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((row, i) => (
                      <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                        <td className="py-2 px-3 text-slate-200 font-medium capitalize">{row.label}</td>
                        <td className="py-2 px-3 text-slate-300">{row.trades}</td>
                        <td className="py-2 px-3 text-emerald-400">{row.wins}</td>
                        <td className="py-2 px-3 text-red-400">{row.losses}</td>
                        <td className="py-2 px-3">
                          <span className={`font-semibold ${row.winRate >= 55 ? "text-emerald-400" : row.winRate >= 45 ? "text-blue-400" : "text-red-400"}`}>
                            {row.winRate}%
                          </span>
                        </td>
                        <td className={`py-2 px-3 font-semibold ${row.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {row.totalPnl >= 0 ? "+" : ""}${row.totalPnl.toFixed(2)}
                        </td>
                        <td className={`py-2 px-3 ${row.avgPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {row.avgPnl >= 0 ? "+" : ""}${row.avgPnl.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
