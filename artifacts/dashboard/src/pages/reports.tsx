import { useState } from "react";
import { useListReports, useGenerateReport, useGetReport } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQueryClient } from "@tanstack/react-query";

type ReportType = "daily" | "weekly" | "monthly";
const REPORT_TYPES: ReportType[] = ["daily", "weekly", "monthly"];

const TYPE_COLORS: Record<string, string> = {
  daily: "bg-blue-500/20 text-blue-400",
  weekly: "bg-purple-500/20 text-purple-400",
  monthly: "bg-amber-500/20 text-amber-400",
};

function StatRow({ label, value, positive }: { label: string; value: string; positive?: boolean | null }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-slate-700/50 last:border-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={`text-sm font-semibold ${positive === true ? "text-emerald-400" : positive === false ? "text-red-400" : "text-white"}`}>
        {value}
      </span>
    </div>
  );
}

function GroupStats({ title, data }: { title: string; data: Record<string, { trades: number; wins: number; pnl: number; winRate: number }> }) {
  const entries = Object.entries(data).sort((a, b) => b[1].winRate - a[1].winRate);
  if (entries.length === 0) return null;

  return (
    <div>
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">{title}</p>
      <div className="space-y-1">
        {entries.map(([label, s]) => (
          <div key={label} className="flex items-center gap-2 bg-slate-700/30 rounded px-2.5 py-1.5">
            <span className="text-xs text-slate-300 w-24 truncate capitalize">{label}</span>
            <div className="flex-1 h-1.5 bg-slate-600 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${s.winRate}%` }} />
            </div>
            <span className="text-xs text-slate-400 min-w-[2rem]">{s.winRate}%</span>
            <span className="text-xs text-slate-500">({s.trades})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportDetail({ id }: { id: number }) {
  const { data: report, isLoading } = useGetReport(id);
  if (isLoading) return <div className="text-slate-500 text-sm p-4">Loading report...</div>;
  if (!report) return <div className="text-slate-500 text-sm p-4">Report not found</div>;

  const content = report.content as Record<string, unknown>;
  const stats = content.stats as Record<string, unknown> | undefined;
  const suggestions = content.suggestions as string[] | undefined;

  return (
    <div className="space-y-4 mt-4">
      <p className="text-sm text-slate-300 font-medium">{content.summary as string}</p>

      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-slate-700/40 border-slate-600">
            <CardHeader className="pb-2"><CardTitle className="text-xs text-slate-400">Performance</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <StatRow label="Total Trades" value={String(stats.totalTrades)} />
              <StatRow label="Win Rate" value={`${stats.winRate}%`} positive={(stats.winRate as number) >= 50 ? true : false} />
              <StatRow label="Net P&L" value={`$${(stats.totalPnl as number).toFixed(2)}`} positive={(stats.totalPnl as number) >= 0 ? true : false} />
              <StatRow label="Profit Factor" value={String(stats.profitFactor)} positive={(stats.profitFactor as number) >= 1 ? true : false} />
              <StatRow label="Avg Setup Score" value={String(stats.avgSetupScore)} />
            </CardContent>
          </Card>
          <Card className="bg-slate-700/40 border-slate-600">
            <CardHeader className="pb-2"><CardTitle className="text-xs text-slate-400">Extremes</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <StatRow label="Best Trade" value={`$${(stats.maxWin as number).toFixed(2)}`} positive />
              <StatRow label="Worst Trade" value={`$${(stats.maxLoss as number).toFixed(2)}`} positive={false} />
              <StatRow label="Wins" value={String(stats.wins)} />
              <StatRow label="Losses" value={String(stats.losses)} />
            </CardContent>
          </Card>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GroupStats title="By Pair" data={stats.byPair as Record<string, { trades: number; wins: number; pnl: number; winRate: number }>} />
          <GroupStats title="By Session" data={stats.bySession as Record<string, { trades: number; wins: number; pnl: number; winRate: number }>} />
          <GroupStats title="By Regime" data={stats.byRegime as Record<string, { trades: number; wins: number; pnl: number; winRate: number }>} />
          <GroupStats title="By Day" data={stats.byWeekday as Record<string, { trades: number; wins: number; pnl: number; winRate: number }>} />
        </div>
      )}

      {suggestions && suggestions.length > 0 && (
        <Card className="bg-blue-950/30 border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-400">Strategy Suggestions</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1.5">
            {suggestions.map((s, i) => (
              <div key={i} className="flex gap-2 text-sm text-slate-300">
                <span className="text-blue-400 shrink-0">→</span>
                <span>{s}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function Reports() {
  const [selectedType, setSelectedType] = useState<ReportType | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const queryClient = useQueryClient();

  const { data: reports, isLoading } = useListReports({ type: selectedType });
  const { mutateAsync: generate } = useGenerateReport();

  async function handleGenerate(type: ReportType) {
    setGenerating(true);
    try {
      await generate({ data: { type } });
      queryClient.invalidateQueries();
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-slate-400 text-sm mt-1">Daily, weekly, and monthly performance reports with strategy insights</p>
        </div>
        <div className="flex gap-2">
          {REPORT_TYPES.map(type => (
            <Button
              key={type}
              size="sm"
              variant="outline"
              disabled={generating}
              onClick={() => handleGenerate(type)}
              className="border-slate-600 text-slate-300 hover:bg-slate-700 capitalize"
            >
              {generating ? "Generating..." : `+ ${type}`}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={!selectedType ? "default" : "outline"}
          onClick={() => setSelectedType(undefined)}
          className="text-xs"
        >All</Button>
        {REPORT_TYPES.map(type => (
          <Button
            key={type}
            size="sm"
            variant={selectedType === type ? "default" : "outline"}
            onClick={() => setSelectedType(type)}
            className="text-xs capitalize border-slate-600"
          >{type}</Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-slate-500 text-sm">Loading reports...</p>
      ) : !reports || reports.length === 0 ? (
        <Card className="bg-slate-800/60 border-slate-700">
          <CardContent className="py-12 text-center">
            <p className="text-slate-500">No reports yet. Click one of the generate buttons above to create your first report.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map(report => (
            <Card
              key={report.id}
              className={`bg-slate-800/60 border-slate-700 cursor-pointer transition-colors hover:border-slate-500 ${selectedId === report.id ? "border-blue-500/50" : ""}`}
              onClick={() => setSelectedId(selectedId === report.id ? null : report.id)}
            >
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={TYPE_COLORS[report.type] ?? "bg-slate-500/20 text-slate-400"}>
                      {report.type}
                    </Badge>
                    <span className="text-sm text-white">
                      {new Date(report.periodStart).toLocaleDateString()} — {new Date(report.periodEnd).toLocaleDateString()}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    Generated {new Date(report.generatedAt).toLocaleString()}
                  </span>
                </div>
                {report.summary && (
                  <p className="text-xs text-slate-400 mt-1">{report.summary}</p>
                )}
              </CardHeader>
              {selectedId === report.id && (
                <CardContent className="pt-0 border-t border-slate-700">
                  <ReportDetail id={report.id} />
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
