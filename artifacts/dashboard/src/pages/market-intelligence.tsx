import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Activity, TrendingUp, TrendingDown, Minus, Zap, Droplets,
  Link, Newspaper, RefreshCw, Globe2, ArrowUpDown, BarChart3,
  AlertTriangle, CheckCircle, Clock, Shield,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis } from "recharts";

const API = "/api";

function api(path: string) {
  return fetch(`${API}${path}`).then(r => r.json());
}

type Pair = "EURUSD" | "GBPUSD" | "USDJPY";
const PAIRS: Pair[] = ["EURUSD", "GBPUSD", "USDJPY"];

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold ${color}`}>
      {children}
    </span>
  );
}

function trendColor(d: string) {
  if (d === "strong_bullish") return "text-emerald-400 bg-emerald-400/10";
  if (d === "bullish") return "text-green-400 bg-green-400/10";
  if (d === "strong_bearish") return "text-red-500 bg-red-500/10";
  if (d === "bearish") return "text-red-400 bg-red-400/10";
  return "text-zinc-400 bg-zinc-400/10";
}

function regimeColor(r: string) {
  if (r === "trending") return "text-blue-400 bg-blue-400/10";
  if (r === "ranging") return "text-yellow-400 bg-yellow-400/10";
  if (r === "expansion") return "text-purple-400 bg-purple-400/10";
  if (r === "compression") return "text-orange-400 bg-orange-400/10";
  if (r === "transitioning") return "text-cyan-400 bg-cyan-400/10";
  return "text-zinc-400 bg-zinc-400/10";
}

function volColor(c: string) {
  if (c === "extreme") return "text-red-500 bg-red-500/10";
  if (c === "high") return "text-orange-400 bg-orange-400/10";
  if (c === "normal") return "text-green-400 bg-green-400/10";
  if (c === "low") return "text-blue-400 bg-blue-400/10";
  return "text-zinc-400 bg-zinc-400/10";
}

function liqColor(q: string) {
  if (q === "excellent") return "text-emerald-400 bg-emerald-400/10";
  if (q === "good") return "text-green-400 bg-green-400/10";
  if (q === "fair") return "text-yellow-400 bg-yellow-400/10";
  return "text-red-400 bg-red-400/10";
}

function newsColor(e: string) {
  if (e === "safe") return "text-green-400 bg-green-400/10";
  if (e === "cautious") return "text-yellow-400 bg-yellow-400/10";
  return "text-red-400 bg-red-400/10";
}

function Meter({ label, value, max = 100, color = "bg-blue-500" }: {
  label: string; value: number; max?: number; color?: string;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span className="font-mono">{value}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ConfidenceRing({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? "#10b981" : score >= 45 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="26" fill="none" stroke="#27272a" strokeWidth="6" />
          <circle cx="32" cy="32" r="26" fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${(score / 100) * 163} 163`}
            strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-mono font-bold" style={{ color }}>{score}</span>
        </div>
      </div>
      <span className="text-xs text-zinc-500 text-center">{label}</span>
    </div>
  );
}

function TrendIcon({ direction }: { direction: string }) {
  if (direction === "strong_bullish" || direction === "bullish")
    return <TrendingUp className="w-4 h-4 text-emerald-400" />;
  if (direction === "strong_bearish" || direction === "bearish")
    return <TrendingDown className="w-4 h-4 text-red-400" />;
  return <Minus className="w-4 h-4 text-zinc-400" />;
}

function corrColor(r: number) {
  if (r >= 0.7) return "bg-emerald-500/30 text-emerald-300";
  if (r <= -0.7) return "bg-red-500/30 text-red-300";
  if (Math.abs(r) >= 0.4) return "bg-yellow-500/20 text-yellow-300";
  return "bg-zinc-700 text-zinc-400";
}

function PairStateCard({ pair, onSelect, selected }: { pair: Pair; onSelect: () => void; selected: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["market-state", pair],
    queryFn: () => api(`/market/state?pair=${pair}&save=false`),
    refetchInterval: 60000,
  });

  const state = data?.data;

  return (
    <button
      onClick={onSelect}
      className={`text-left p-4 rounded-xl border transition-all ${
        selected ? "border-blue-500/50 bg-blue-500/5" : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-600"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-mono font-bold text-white">{pair}</span>
        {state && <Badge color={newsColor(state.newsContext?.environment ?? "safe")}>
          {state.newsContext?.environment?.toUpperCase() ?? "—"}
        </Badge>}
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-3 bg-zinc-800 rounded animate-pulse" />)}
        </div>
      ) : state ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <TrendIcon direction={state.trend?.direction} />
            <Badge color={trendColor(state.trend?.direction ?? "neutral")}>
              {(state.trend?.direction ?? "neutral").replace(/_/g, " ")}
            </Badge>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge color={regimeColor(state.regime?.regime ?? "ranging")}>
              {state.regime?.regime ?? "—"}
            </Badge>
            <Badge color={volColor(state.volatility?.classification ?? "normal")}>
              {(state.volatility?.classification ?? "normal").replace(/_/g, " ")}
            </Badge>
          </div>
          <Meter label="Confidence" value={state.confidenceScore ?? 0} color="bg-blue-500" />
        </div>
      ) : (
        <div className="text-xs text-zinc-500">No data</div>
      )}
    </button>
  );
}

function TrendSection({ pair }: { pair: Pair }) {
  const { data } = useQuery({
    queryKey: ["market-trend", pair],
    queryFn: () => api(`/market/trend?pair=${pair}`),
    refetchInterval: 60000,
  });
  const trend = data?.data?.trend;
  if (!trend) return <div className="text-zinc-500 text-sm">Loading trend data…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <TrendIcon direction={trend.direction} />
        <Badge color={trendColor(trend.direction)}>
          {trend.direction.replace(/_/g, " ").toUpperCase()}
        </Badge>
        <span className="text-xs text-zinc-500">ADX {trend.adx}</span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-zinc-900 rounded-lg p-3">
          <div className="text-xs text-zinc-500 mb-1">Strength</div>
          <div className="text-xl font-mono font-bold text-white">{trend.strength}</div>
          <div className="mt-1 h-1 bg-zinc-800 rounded">
            <div className="h-1 bg-blue-500 rounded" style={{ width: `${trend.strength}%` }} />
          </div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-3">
          <div className="text-xs text-zinc-500 mb-1">Persistence</div>
          <div className="text-xl font-mono font-bold text-white">{trend.persistence}</div>
          <div className="mt-1 h-1 bg-zinc-800 rounded">
            <div className="h-1 bg-purple-500 rounded" style={{ width: `${trend.persistence}%` }} />
          </div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-3">
          <div className="text-xs text-zinc-500 mb-1">Age (candles)</div>
          <div className="text-xl font-mono font-bold text-white">{trend.age}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Meter label="+DI" value={trend.plusDI} color="bg-emerald-500" />
        <Meter label="-DI" value={trend.minusDI} color="bg-red-500" />
        <Meter label="Structure Score" value={trend.structureScore} color="bg-blue-500" />
        <Meter label="Confidence" value={trend.confidence} color="bg-violet-500" />
      </div>
    </div>
  );
}

function RegimeSection({ pair }: { pair: Pair }) {
  const { data } = useQuery({
    queryKey: ["market-regime-perception", pair],
    queryFn: () => api(`/market/regime/perception?pair=${pair}`),
    refetchInterval: 60000,
  });
  const regime = data?.data?.regime;
  if (!regime) return <div className="text-zinc-500 text-sm">Loading regime data…</div>;

  const radarData = Object.entries(regime.scores ?? {}).map(([name, value]) => ({
    subject: name.charAt(0).toUpperCase() + name.slice(1),
    value,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge color={regimeColor(regime.regime)}>{regime.regime.toUpperCase()}</Badge>
        {regime.isTransitioning && (
          <Badge color="text-cyan-400 bg-cyan-400/10">TRANSITIONING</Badge>
        )}
        <span className="text-xs text-zinc-500">Confidence {regime.confidence}%</span>
      </div>
      {radarData.length > 0 && (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid stroke="#3f3f46" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: "#71717a", fontSize: 11 }} />
              <Radar dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(regime.scores ?? {}).map(([name, score]) => (
          <Meter key={name} label={name.charAt(0).toUpperCase() + name.slice(1)} value={score as number} color="bg-blue-500" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="bg-zinc-900 rounded-lg p-2">
          <div className="text-zinc-500">ADX</div>
          <div className="font-mono text-white">{regime.adx}</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-2">
          <div className="text-zinc-500">Vol %ile</div>
          <div className="font-mono text-white">{regime.volatilityPercentile}</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-2">
          <div className="text-zinc-500">Compression</div>
          <div className="font-mono text-white">{regime.rangeCompression}</div>
        </div>
      </div>
    </div>
  );
}

function VolatilitySection({ pair }: { pair: Pair }) {
  const { data } = useQuery({
    queryKey: ["market-volatility", pair],
    queryFn: () => api(`/market/volatility/detail?pair=${pair}`),
    refetchInterval: 60000,
  });
  const vol = data?.data?.volatility;
  if (!vol) return <div className="text-zinc-500 text-sm">Loading volatility data…</div>;

  const trendArrow = vol.volatilityTrend === "rising" ? "↑" : vol.volatilityTrend === "falling" ? "↓" : "→";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge color={volColor(vol.classification)}>
          {vol.classification.replace(/_/g, " ").toUpperCase()}
        </Badge>
        <span className="text-xs text-zinc-500">
          Trend {trendArrow} | Percentile {vol.volatilityPercentile}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900 rounded-lg p-3">
          <div className="text-xs text-zinc-500 mb-1">ATR</div>
          <div className="text-lg font-mono font-bold text-white">{vol.atr.toFixed(5)}</div>
          <div className="text-xs text-zinc-600">{vol.atrPercent.toFixed(3)}%</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-3">
          <div className="text-xs text-zinc-500 mb-1">Annualized HV</div>
          <div className="text-lg font-mono font-bold text-white">{vol.annualizedHV.toFixed(1)}%</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-3">
          <div className="text-xs text-zinc-500 mb-1">Historical Vol</div>
          <div className="text-lg font-mono font-bold text-white">{(vol.historicalVolatility * 10000).toFixed(1)}bps</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-3">
          <div className="text-xs text-zinc-500 mb-1">Realized Vol</div>
          <div className="text-lg font-mono font-bold text-white">{(vol.realizedVolatility * 10000).toFixed(1)}bps</div>
        </div>
      </div>
      <Meter label="Vol Percentile" value={vol.volatilityPercentile} color="bg-orange-500" />
      <Meter label="Range Compression" value={vol.rangeCompression} color="bg-purple-500" />
      <Meter label="Confidence" value={vol.confidence} color="bg-blue-500" />
    </div>
  );
}

function LiquiditySection({ pair }: { pair: Pair }) {
  const { data } = useQuery({
    queryKey: ["market-liquidity", pair],
    queryFn: () => api(`/market/liquidity?pair=${pair}`),
    refetchInterval: 60000,
  });
  const liq = data?.data?.liquidity;
  if (!liq) return <div className="text-zinc-500 text-sm">Loading liquidity data…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge color={liqColor(liq.quality)}>{liq.quality.toUpperCase()}</Badge>
        <Badge color={liq.sessionLiquidity === "high" ? "text-emerald-400 bg-emerald-400/10" : liq.sessionLiquidity === "medium" ? "text-yellow-400 bg-yellow-400/10" : "text-red-400 bg-red-400/10"}>
          {liq.sessionLiquidity.toUpperCase()} SESSION
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900 rounded-lg p-3">
          <div className="text-xs text-zinc-500 mb-1">Relative Volume</div>
          <div className="text-xl font-mono font-bold text-white">{liq.relativeVolume.toFixed(2)}×</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-3">
          <div className="text-xs text-zinc-500 mb-1">Candle Efficiency</div>
          <div className="text-xl font-mono font-bold text-white">{(liq.candleEfficiency * 100).toFixed(0)}%</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-3">
          <div className="text-xs text-zinc-500 mb-1">Spread (H-L avg)</div>
          <div className="text-xl font-mono font-bold text-white">{(liq.spread * 10000).toFixed(1)}</div>
          <div className="text-xs text-zinc-600">pips equiv</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-3">
          <div className="text-xs text-zinc-500 mb-1">Gap Frequency</div>
          <div className="text-xl font-mono font-bold text-white">{(liq.gapFrequency * 100).toFixed(0)}%</div>
        </div>
      </div>
      <Meter label="Liquidity Score" value={liq.score} color="bg-emerald-500" />
      <Meter label="Confidence" value={liq.confidence} color="bg-blue-500" />
    </div>
  );
}

function CorrelationSection() {
  const { data } = useQuery({
    queryKey: ["market-correlation"],
    queryFn: () => api("/market/correlation"),
    refetchInterval: 90000,
  });
  const corr = data?.data?.correlation;
  if (!corr) return <div className="text-zinc-500 text-sm">Loading correlation data…</div>;

  const pairs = [
    { key: "eurusd_gbpusd", a: "EUR/USD", b: "GBP/USD", data: corr.eurusd_gbpusd },
    { key: "eurusd_usdjpy", a: "EUR/USD", b: "USD/JPY", data: corr.eurusd_usdjpy },
    { key: "gbpusd_usdjpy", a: "GBP/USD", b: "USD/JPY", data: corr.gbpusd_usdjpy },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge color={corr.overallCorrelationRisk === "high" ? "text-red-400 bg-red-400/10" : corr.overallCorrelationRisk === "medium" ? "text-yellow-400 bg-yellow-400/10" : "text-green-400 bg-green-400/10"}>
          {corr.overallCorrelationRisk.toUpperCase()} CORRELATION RISK
        </Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 border-b border-zinc-800">
              <th className="text-left py-2 pr-4">Pair A</th>
              <th className="text-left py-2 pr-4">Pair B</th>
              <th className="text-right py-2 pr-4">Correlation</th>
              <th className="text-right py-2 pr-4">Status</th>
              <th className="text-right py-2">Samples</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map(p => (
              <tr key={p.key} className="border-b border-zinc-800/50">
                <td className="py-2 pr-4 font-mono text-white">{p.a}</td>
                <td className="py-2 pr-4 font-mono text-white">{p.b}</td>
                <td className="py-2 pr-4 text-right">
                  <span className={`px-2 py-0.5 rounded font-mono font-bold ${corrColor(p.data?.correlation ?? 0)}`}>
                    {(p.data?.correlation ?? 0).toFixed(3)}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right text-zinc-400">
                  {(p.data?.status ?? "normal").replace(/_/g, " ")}
                </td>
                <td className="py-2 text-right text-zinc-500">{p.data?.sampleSize ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pairs.map(p => p.data?.rollingCorrelations?.length > 0 && (
        <div key={p.key}>
          <div className="text-xs text-zinc-500 mb-1">{p.a} / {p.b} — Rolling</div>
          <div className="h-12">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={(p.data?.rollingCorrelations ?? []).map((v: number, i: number) => ({ i, v }))}>
                <Area dataKey="v" stroke="#3b82f6" fill="#3b82f620" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}

function NewsSection() {
  const { data } = useQuery({
    queryKey: ["market-news-context"],
    queryFn: () => api("/market/news-context"),
    refetchInterval: 120000,
  });
  const ctx = data?.data?.newsContext;
  if (!ctx) return <div className="text-zinc-500 text-sm">Loading news context…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge color={newsColor(ctx.environment)}>{ctx.environment.toUpperCase()}</Badge>
        {ctx.nextEventMinutes !== null && (
          <span className="text-xs text-zinc-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Next: {ctx.nextEventMinutes}min — {ctx.nextEventTitle ?? "—"}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900 rounded-lg p-3 text-center">
          <div className="text-xs text-zinc-500 mb-1">Recovery Phase</div>
          <div className={`text-sm font-mono font-bold ${ctx.recoveryPhase === "blocked" ? "text-red-400" : ctx.recoveryPhase === "recovering" ? "text-yellow-400" : "text-green-400"}`}>
            {ctx.recoveryPhase.toUpperCase()}
          </div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-3 text-center">
          <div className="text-xs text-zinc-500 mb-1">Recent Impact</div>
          <div className="text-xl font-mono font-bold text-white">{ctx.recentImpactScore}</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-3 text-center">
          <div className="text-xs text-zinc-500 mb-1">Upcoming Events</div>
          <div className="text-xl font-mono font-bold text-white">{ctx.upcomingHighImpact?.length ?? 0}</div>
        </div>
      </div>
      {ctx.upcomingHighImpact?.length > 0 && (
        <div>
          <div className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">Upcoming High Impact</div>
          <div className="space-y-2">
            {ctx.upcomingHighImpact.slice(0, 5).map((e: { title: string; currency: string; impact: string; minutesUntil: number; isBlocking: boolean }, i: number) => (
              <div key={i} className="flex items-center justify-between bg-zinc-900 rounded-lg px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  {e.isBlocking ? <AlertTriangle className="w-3 h-3 text-red-400" /> : <Clock className="w-3 h-3 text-zinc-500" />}
                  <span className="text-white font-mono">{e.currency}</span>
                  <span className="text-zinc-300">{e.title}</span>
                </div>
                <Badge color={e.impact === "high" ? "text-red-400 bg-red-400/10" : "text-yellow-400 bg-yellow-400/10"}>
                  {e.minutesUntil}m
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
      {ctx.recentEvents?.length > 0 && (
        <div>
          <div className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">Recent Events</div>
          <div className="space-y-1">
            {ctx.recentEvents.slice(0, 3).map((e: { title: string; currency: string; minutesSince: number; impactScore: number }, i: number) => (
              <div key={i} className="flex items-center justify-between bg-zinc-900/50 rounded px-3 py-1.5 text-xs">
                <span className="text-zinc-400">{e.currency} — {e.title}</span>
                <span className="text-zinc-500">{e.minutesSince}min ago</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {ctx.affectedPairs?.length > 0 && (
        <div className="text-xs text-zinc-500">
          Pairs affected: {ctx.affectedPairs.join(", ")}
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: "overview", label: "Overview", icon: Globe2 },
  { id: "trend", label: "Trend", icon: TrendingUp },
  { id: "regime", label: "Regime", icon: ArrowUpDown },
  { id: "volatility", label: "Volatility", icon: Zap },
  { id: "liquidity", label: "Liquidity", icon: Droplets },
  { id: "correlation", label: "Correlation", icon: Link },
  { id: "news", label: "News", icon: Newspaper },
];

export default function MarketIntelligence() {
  const [selectedPair, setSelectedPair] = useState<Pair>("EURUSD");
  const [activeTab, setActiveTab] = useState("overview");
  const qc = useQueryClient();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["market-state"] });
    qc.invalidateQueries({ queryKey: ["market-trend"] });
    qc.invalidateQueries({ queryKey: ["market-regime-perception"] });
    qc.invalidateQueries({ queryKey: ["market-volatility"] });
    qc.invalidateQueries({ queryKey: ["market-liquidity"] });
    qc.invalidateQueries({ queryKey: ["market-correlation"] });
    qc.invalidateQueries({ queryKey: ["market-news-context"] });
  };

  const { data: stateData } = useQuery({
    queryKey: ["market-state", selectedPair],
    queryFn: () => api(`/market/state?pair=${selectedPair}&save=false`),
    refetchInterval: 60000,
  });
  const state = stateData?.data;

  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Globe2 className="w-6 h-6 text-blue-400" />
            Market Intelligence
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Real-time market perception — advisory only
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {PAIRS.map(p => (
          <PairStateCard
            key={p}
            pair={p}
            selected={p === selectedPair}
            onSelect={() => setSelectedPair(p)}
          />
        ))}
      </div>

      {state && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Market State — {selectedPair}</span>
            <div className="flex items-center gap-2">
              <Badge color={newsColor(state.newsContext?.environment ?? "safe")}>
                {state.newsContext?.environment?.toUpperCase()}
              </Badge>
              <span className="text-xs text-zinc-600 font-mono">
                {new Date(state.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
          <p className="text-xs font-mono text-zinc-400">{state.summary}</p>
          <div className="flex gap-4 mt-3">
            <ConfidenceRing score={state.trend?.confidence ?? 0} label="Trend" />
            <ConfidenceRing score={state.regime?.confidence ?? 0} label="Regime" />
            <ConfidenceRing score={state.volatility?.confidence ?? 0} label="Vol" />
            <ConfidenceRing score={state.liquidity?.confidence ?? 0} label="Liq" />
            <ConfidenceRing score={state.correlation?.confidence ?? 0} label="Corr" />
            <ConfidenceRing score={state.newsContext?.confidence ?? 0} label="News" />
            <ConfidenceRing score={state.confidenceScore ?? 0} label="Overall" />
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-zinc-800">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
        {activeTab === "overview" && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-white">Full Market State Overview</h2>
            {state ? (
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="text-xs text-zinc-500 uppercase tracking-wider">Trend</div>
                  <div className="flex items-center gap-2">
                    <TrendIcon direction={state.trend?.direction ?? "neutral"} />
                    <Badge color={trendColor(state.trend?.direction ?? "neutral")}>
                      {(state.trend?.direction ?? "neutral").replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <Meter label="Strength" value={state.trend?.strength ?? 0} color="bg-blue-500" />
                  <Meter label="Persistence" value={state.trend?.persistence ?? 0} color="bg-purple-500" />
                  <div className="text-xs text-zinc-500 mt-3 uppercase tracking-wider">Regime</div>
                  <Badge color={regimeColor(state.regime?.regime ?? "ranging")}>
                    {state.regime?.regime?.toUpperCase() ?? "—"}
                  </Badge>
                  <Meter label="Regime Confidence" value={state.regime?.confidence ?? 0} color="bg-indigo-500" />
                </div>
                <div className="space-y-3">
                  <div className="text-xs text-zinc-500 uppercase tracking-wider">Volatility</div>
                  <Badge color={volColor(state.volatility?.classification ?? "normal")}>
                    {(state.volatility?.classification ?? "normal").replace(/_/g, " ").toUpperCase()}
                  </Badge>
                  <Meter label="Vol Percentile" value={state.volatility?.volatilityPercentile ?? 50} color="bg-orange-500" />
                  <div className="text-xs text-zinc-500 mt-3 uppercase tracking-wider">Liquidity</div>
                  <Badge color={liqColor(state.liquidity?.quality ?? "fair")}>
                    {(state.liquidity?.quality ?? "fair").toUpperCase()}
                  </Badge>
                  <Meter label="Liquidity Score" value={state.liquidity?.score ?? 0} color="bg-emerald-500" />
                  <div className="text-xs text-zinc-500 mt-3 uppercase tracking-wider">Session</div>
                  <Badge color="text-blue-400 bg-blue-400/10">{(state.session ?? "").replace(/_/g, " ").toUpperCase()}</Badge>
                </div>
              </div>
            ) : (
              <div className="text-zinc-500 text-sm">Select a pair to view market state</div>
            )}
          </div>
        )}
        {activeTab === "trend" && <TrendSection pair={selectedPair} />}
        {activeTab === "regime" && <RegimeSection pair={selectedPair} />}
        {activeTab === "volatility" && <VolatilitySection pair={selectedPair} />}
        {activeTab === "liquidity" && <LiquiditySection pair={selectedPair} />}
        {activeTab === "correlation" && <CorrelationSection />}
        {activeTab === "news" && <NewsSection />}
      </div>
    </div>
  );
}
