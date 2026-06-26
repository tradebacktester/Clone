import { useGetMtfAlignment, useGetTqiScores, useGetCorrelationMatrix } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const PAIRS = ["EURUSD", "GBPUSD", "USDJPY"] as const;
type Pair = typeof PAIRS[number];

const TF_LABELS: Record<string, string> = {
  "1d": "Daily", "4h": "4H", "1h": "1H", "15m": "15M",
};

const ROLE_LABELS: Record<string, string> = {
  "macro": "Macro Trend", "structure": "Market Structure", "bias": "Directional Bias", "execution": "Execution Timing",
};

const GRADE_COLORS: Record<string, string> = {
  "A": "bg-emerald-500", "B": "bg-blue-500", "C": "bg-yellow-500", "D": "bg-orange-500", "F": "bg-red-500",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "aligned") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Aligned</Badge>;
  if (status === "opposed") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Opposed</Badge>;
  if (status === "neutral") return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Neutral</Badge>;
  return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">Unavailable</Badge>;
}

function MtfCard({ pair }: { pair: Pair }) {
  const { data } = useGetMtfAlignment(pair);
  if (!data) return (
    <Card className="bg-slate-800/60 border-slate-700">
      <CardHeader><CardTitle className="text-sm text-slate-400">{pair}</CardTitle></CardHeader>
      <CardContent><p className="text-slate-500 text-xs">Loading MTF data...</p></CardContent>
    </Card>
  );

  return (
    <Card className={`bg-slate-800/60 border-slate-700 ${data.aligned ? "border-emerald-500/30" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-white">{pair}</CardTitle>
          <div className="flex items-center gap-2">
            {data.direction && (
              <Badge className={data.direction === "buy" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}>
                {data.direction.toUpperCase()}
              </Badge>
            )}
            <Badge className={data.aligned ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-500/20 text-slate-400"}>
              {data.alignedCount}/{data.totalCount} TFs
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Progress value={data.score} className="h-1.5 flex-1" />
          <span className="text-xs text-slate-400 min-w-[3rem] text-right">{data.score}%</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-1.5">
          {data.timeframes.map(tf => (
            <div key={tf.timeframe} className={`rounded-lg p-2 ${tf.available ? "bg-slate-700/50" : "bg-slate-800/30"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-300">{TF_LABELS[tf.timeframe]}</span>
                <span className="text-xs text-slate-500">{ROLE_LABELS[tf.role]?.split(" ")[0]}</span>
              </div>
              {tf.available ? (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${tf.bullishBias ? "bg-emerald-400" : tf.bearishBias ? "bg-red-400" : "bg-slate-400"}`} />
                    <span className="text-xs text-slate-400 capitalize">{tf.trend ?? "neutral"}</span>
                  </div>
                  <p className="text-xs text-slate-500">{tf.structure ?? "—"}</p>
                </div>
              ) : (
                <p className="text-xs text-slate-600">No data</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TqiCard({ pair }: { pair: Pair }) {
  const { data: tqiList } = useGetTqiScores(pair);
  if (!tqiList || tqiList.length === 0) return (
    <Card className="bg-slate-800/60 border-slate-700">
      <CardHeader><CardTitle className="text-sm text-slate-400">{pair} — TQI</CardTitle></CardHeader>
      <CardContent><p className="text-slate-500 text-xs">No active signals</p></CardContent>
    </Card>
  );

  const best = tqiList.reduce((a, b) => a.tqi >= b.tqi ? a : b);

  return (
    <Card className="bg-slate-800/60 border-slate-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-white">{pair} — TQI</CardTitle>
          <div className="flex items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${GRADE_COLORS[best.grade]}`}>{best.grade}</span>
            <span className="text-lg font-bold text-white">{best.tqi.toFixed(0)}</span>
            <span className="text-slate-500 text-xs">/100</span>
          </div>
        </div>
        <Progress value={best.tqi} className="h-2 mt-1" />
        <p className="text-xs text-slate-500 mt-0.5">{best.tradeable ? "✓ Tradeable" : "✗ Below threshold"}</p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-1.5">
          {best.components.map(c => (
            <div key={c.name} className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-32 shrink-0">{c.name}</span>
              <div className="flex-1">
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${c.score / c.maxScore >= 0.8 ? "bg-emerald-500" : c.score / c.maxScore >= 0.5 ? "bg-blue-500" : "bg-red-500"}`}
                    style={{ width: `${(c.score / c.maxScore) * 100}%` }}
                  />
                </div>
              </div>
              <span className="text-xs text-slate-400 min-w-[2rem] text-right">{c.score}/{c.maxScore}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CorrelationMatrix() {
  const { data } = useGetCorrelationMatrix();
  if (!data) return null;

  const getCorrColor = (corr: number) => {
    if (corr >= 0.7) return "text-red-400";
    if (corr >= 0.4) return "text-orange-400";
    if (corr >= 0) return "text-slate-300";
    if (corr >= -0.4) return "text-blue-400";
    return "text-purple-400";
  };

  return (
    <Card className="bg-slate-800/60 border-slate-700">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-white">Pair Correlation Matrix</CardTitle>
        <p className="text-xs text-slate-500">Red = high positive corr (overexposure risk), Purple = inverse corr (natural hedge)</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {data.matrix.map(entry => (
            <div key={`${entry.pair1}-${entry.pair2}`} className="flex items-center justify-between bg-slate-700/30 rounded-lg p-2.5">
              <span className="text-sm text-slate-300">{entry.pair1} / {entry.pair2}</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-slate-600 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${entry.correlation >= 0 ? "bg-red-500" : "bg-blue-500"}`}
                    style={{ width: `${Math.abs(entry.correlation) * 100}%`, marginLeft: entry.correlation >= 0 ? "0" : `${(1 + entry.correlation) * 50}%` }}
                  />
                </div>
                <span className={`text-sm font-mono font-semibold min-w-[4rem] text-right ${getCorrColor(entry.correlation)}`}>
                  {entry.correlation >= 0 ? "+" : ""}{(entry.correlation * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
        {data.openExposure.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-700">
            <p className="text-xs text-slate-400 mb-2">Open Position Exposure:</p>
            <div className="flex flex-wrap gap-1.5">
              {data.openExposure.map((p, i) => (
                <Badge key={i} className={p.direction === "buy" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}>
                  {p.pair} {p.direction.toUpperCase()}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Insights() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">V2 Insights</h1>
        <p className="text-slate-400 text-sm mt-1">Multi-Timeframe alignment, Trade Quality Index, and Correlation exposure</p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Multi-Timeframe Confirmation</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PAIRS.map(pair => <MtfCard key={pair} pair={pair} />)}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Trade Quality Index (TQI)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PAIRS.map(pair => <TqiCard key={pair} pair={pair} />)}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Pair Correlations</h2>
        <div className="max-w-xl">
          <CorrelationMatrix />
        </div>
      </div>
    </div>
  );
}
