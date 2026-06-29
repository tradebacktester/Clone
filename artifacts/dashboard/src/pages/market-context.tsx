import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from "recharts";
import { Brain, TrendingUp, AlertTriangle, Shield, Clock, Activity, BarChart2, Target, Info } from "lucide-react";

const API = "/api";
const PAIRS = ["EURUSD", "GBPUSD", "USDJPY"] as const;
type Pair = typeof PAIRS[number];

function useMarketContext(pair: Pair) {
  return useQuery({
    queryKey: ["market-context", pair],
    queryFn: () => fetch(`${API}/market/context?pair=${pair}`).then(r => r.json()),
    refetchInterval: 60000,
  });
}

function useContextHistory(pair: Pair) {
  return useQuery({
    queryKey: ["market-context-history", pair],
    queryFn: () => fetch(`${API}/market/context-history?pair=${pair}&limit=30`).then(r => r.json()),
    refetchInterval: 60000,
  });
}

function useContextAnalysis(pair: Pair) {
  return useQuery({
    queryKey: ["market-context-analysis", pair],
    queryFn: () => fetch(`${API}/market/context-analysis?pair=${pair}`).then(r => r.json()),
    refetchInterval: 120000,
  });
}

function useStability(pair: Pair) {
  return useQuery({
    queryKey: ["market-stability", pair],
    queryFn: () => fetch(`${API}/market/stability?pair=${pair}`).then(r => r.json()),
    refetchInterval: 60000,
  });
}

function useComparison(pair: Pair) {
  return useQuery({
    queryKey: ["market-context-comparison", pair],
    queryFn: () => fetch(`${API}/market/context-comparison?pair=${pair}`).then(r => r.json()),
    refetchInterval: 120000,
  });
}

const ENV_COLORS: Record<string, string> = {
  excellent: "#10b981",
  good: "#22c55e",
  neutral: "#eab308",
  difficult: "#f97316",
  dangerous: "#ef4444",
};

const STABILITY_COLORS: Record<string, string> = {
  very_stable: "#10b981",
  stable: "#22c55e",
  unstable: "#f97316",
  very_unstable: "#ef4444",
};

function GaugeArc({ score, color }: { score: number; color: string }) {
  const r = 70;
  const cx = 90;
  const cy = 90;
  const startAngle = -200;
  const endAngle = 20;
  const totalDeg = endAngle - startAngle;
  const filled = (score / 100) * totalDeg;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const pathArc = (sa: number, ea: number, col: string) => {
    const lf = ea - sa > 180 ? 1 : 0;
    const x1 = cx + r * Math.cos(toRad(sa));
    const y1 = cy + r * Math.sin(toRad(sa));
    const x2 = cx + r * Math.cos(toRad(ea));
    const y2 = cy + r * Math.sin(toRad(ea));
    return <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${lf} 1 ${x2} ${y2}`} fill="none" stroke={col} strokeWidth="14" strokeLinecap="round" />;
  };
  return (
    <svg width="180" height="120" viewBox="0 0 180 130">
      {pathArc(startAngle, endAngle, "rgba(255,255,255,0.08)")}
      {score > 0 && pathArc(startAngle, startAngle + filled, color)}
      <text x={cx} y={cy + 5} textAnchor="middle" fill="white" fontSize="28" fontWeight="bold">{score}</text>
      <text x={cx} y={cy + 22} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="11">/ 100</text>
    </svg>
  );
}

function MCSCard({ pair }: { pair: Pair }) {
  const { data, isLoading } = useMarketContext(pair);
  const ctx = data?.data;
  const mcs = ctx?.mcs;
  if (isLoading) return <LoadingCard title="Market Context Score" />;
  if (!mcs) return <ErrorCard title="Market Context Score" />;
  const color = ENV_COLORS[mcs.label] ?? "#8b5cf6";
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Brain size={16} style={{ color: "#8b5cf6" }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(255,255,255,0.9)" }}>Market Context Score</span>
        <span style={{ marginLeft: "auto", fontSize: 11, padding: "2px 8px", borderRadius: 99, background: `${color}22`, color, border: `1px solid ${color}44`, textTransform: "uppercase", fontWeight: 700 }}>{mcs.label}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <GaugeArc score={mcs.score} color={color} />
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textAlign: "center", marginBottom: 16 }}>
        Confidence: {mcs.confidence}% · Sample: {mcs.sampleSize} trades
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {mcs.components.map((c: any) => (
          <div key={c.dimension} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "6px 8px" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>{c.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)" }}>
                <div style={{ width: `${c.score}%`, height: "100%", borderRadius: 2, background: c.score >= 65 ? "#22c55e" : c.score >= 45 ? "#eab308" : "#ef4444" }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.8)", width: 24 }}>{c.score}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClassificationCard({ pair }: { pair: Pair }) {
  const { data } = useMarketContext(pair);
  const ctx = data?.data;
  if (!ctx) return <ErrorCard title="Environment Classification" />;
  const color = ENV_COLORS[ctx.classification] ?? "#8b5cf6";
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Target size={16} style={{ color: "#8b5cf6" }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(255,255,255,0.9)" }}>Environment Classification</span>
      </div>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 32, fontWeight: 900, color, textTransform: "uppercase", letterSpacing: "0.1em" }}>{ctx.classification}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Adjusted Score: {ctx.adjustedScore}/100</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(ctx.classificationEvidence ?? []).map((ev: string, i: number) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <Info size={12} style={{ color: "#8b5cf6", marginTop: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>{ev}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StabilityCard({ pair }: { pair: Pair }) {
  const { data, isLoading } = useStability(pair);
  const stability = data?.data?.stability;
  if (isLoading) return <LoadingCard title="Market Stability" />;
  if (!stability) return <ErrorCard title="Market Stability" />;
  const color = STABILITY_COLORS[stability.label] ?? "#8b5cf6";
  const measures = [stability.regime, stability.trend, stability.volatility, stability.liquidity];
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Shield size={16} style={{ color: "#8b5cf6" }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(255,255,255,0.9)" }}>Market Stability</span>
        <span style={{ marginLeft: "auto", fontSize: 11, padding: "2px 8px", borderRadius: 99, background: `${color}22`, color, border: `1px solid ${color}44`, textTransform: "uppercase", fontWeight: 700 }}>{stability.label.replace("_", " ")}</span>
      </div>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 40, fontWeight: 900, color }}>{stability.overallStability}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Overall Stability Score</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {measures.map((m: any) => (
          <div key={m.name}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {m.warning && <AlertTriangle size={11} style={{ color: "#f97316" }} />}
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{m.name}</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: m.score >= 60 ? "#22c55e" : m.score >= 40 ? "#eab308" : "#ef4444" }}>{m.score}</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)" }}>
              <div style={{ width: `${m.score}%`, height: "100%", borderRadius: 2, background: m.score >= 60 ? "#22c55e" : m.score >= 40 ? "#eab308" : "#ef4444" }} />
            </div>
          </div>
        ))}
      </div>
      {stability.warnings.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
          {stability.warnings.map((w: string, i: number) => (
            <div key={i} style={{ fontSize: 10, color: "#f97316", padding: "4px 8px", background: "rgba(249,115,22,0.08)", borderRadius: 4, border: "1px solid rgba(249,115,22,0.2)" }}>
              ⚠ {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoricalComparisonCard({ pair }: { pair: Pair }) {
  const { data, isLoading } = useComparison(pair);
  const matches = data?.data?.matches ?? [];
  if (isLoading) return <LoadingCard title="Historical Comparison" />;
  const OUTCOME_COLOR: Record<string, string> = { profitable: "#22c55e", losing: "#ef4444", neutral: "#eab308", unknown: "#6b7280" };
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Clock size={16} style={{ color: "#8b5cf6" }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(255,255,255,0.9)" }}>Historical Comparison</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{data?.data?.snapshotPool ?? 0} snapshots</span>
      </div>
      {matches.length === 0 ? (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "20px 0" }}>No similar historical periods found yet</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" }}>
          {matches.map((m: any, i: number) => (
            <div key={m.id} style={{ display: "grid", gridTemplateColumns: "16px 80px 1fr 1fr 50px", gap: 8, alignItems: "center", padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.02)" }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{i + 1}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontFamily: "monospace" }}>{m.date}</span>
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{m.regime} / {m.session}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{m.trendDirection} / {m.volatilityClassification}</div>
              </div>
              <div style={{ fontSize: 10, color: OUTCOME_COLOR[m.outcome] ?? "#6b7280", textTransform: "capitalize" }}>{m.outcome}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#8b5cf6" }}>{m.similarityScore}%</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContextTimelineCard({ pair }: { pair: Pair }) {
  const { data, isLoading } = useContextHistory(pair);
  const history = (data?.data?.history ?? []).slice().reverse();
  if (isLoading) return <LoadingCard title="Context Timeline" />;
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Activity size={16} style={{ color: "#8b5cf6" }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(255,255,255,0.9)" }}>Context Timeline</span>
      </div>
      {history.length === 0 ? (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "20px 0" }}>No context history yet — check back after visiting this page</div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={history}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="createdAt" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} tickFormatter={(v: string) => v ? new Date(v).toLocaleDateString() : ""} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
            <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 8 }} labelStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }} />
            <Line type="monotone" dataKey="score" stroke="#8b5cf6" strokeWidth={2} dot={false} name="MCS" />
            <Line type="monotone" dataKey="stabilityScore" stroke="#22c55e" strokeWidth={1.5} dot={false} strokeDasharray="4 4" name="Stability" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function PerformanceByDimensionCard({ pair }: { pair: Pair }) {
  const { data, isLoading } = useContextAnalysis(pair);
  const [activeDim, setActiveDim] = useState("regime");

  const allStats: any[] = data?.data?.performanceByDimension ?? [];

  const DIMS: Record<string, string> = {
    regime: "Regime",
    session: "Session",
    trend: "Trend",
    volatility: "Volatility",
    news: "News",
    day_of_week: "Day",
    month: "Month",
  };

  const filtered = allStats.filter((s: any) => s.dimension === activeDim);

  const radarData = filtered.map((s: any) => ({
    condition: s.condition,
    winRate: s.winRate,
    rr: Math.max(0, s.avgRR * 50),
    confidence: s.confidenceScore,
  }));

  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <BarChart2 size={16} style={{ color: "#8b5cf6" }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(255,255,255,0.9)" }}>Historical Performance by Condition</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{data?.data?.tradeCount ?? 0} trades</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {Object.entries(DIMS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveDim(key)}
            style={{
              fontSize: 11, padding: "4px 10px", borderRadius: 99,
              border: `1px solid ${activeDim === key ? "#8b5cf6" : "rgba(255,255,255,0.12)"}`,
              background: activeDim === key ? "rgba(139,92,246,0.2)" : "transparent",
              color: activeDim === key ? "#c4b5fd" : "rgba(255,255,255,0.5)",
              cursor: "pointer",
            }}
          >{label}</button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "20px 0" }}>No data for this dimension yet</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={filtered} margin={{ left: -20, right: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="condition" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
              <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="winRate" fill="#8b5cf6" name="Win Rate %" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12, maxHeight: 200, overflowY: "auto" }}>
            {filtered.map((s: any) => (
              <div key={s.condition} style={{ display: "grid", gridTemplateColumns: "1fr 48px 48px 48px 48px 52px", gap: 6, alignItems: "center", padding: "5px 8px", borderRadius: 6, background: "rgba(255,255,255,0.02)", fontSize: 11 }}>
                <span style={{ color: "rgba(255,255,255,0.8)", textTransform: "capitalize" }}>{s.condition.replace("_", " ")}</span>
                <span style={{ color: "#22c55e", textAlign: "right" }}>{s.winRate.toFixed(0)}%</span>
                <span style={{ color: "#8b5cf6", textAlign: "right" }}>{s.avgRR.toFixed(2)}R</span>
                <span style={{ color: "#eab308", textAlign: "right" }}>{s.profitFactor.toFixed(2)}</span>
                <span style={{ color: "rgba(255,255,255,0.4)", textAlign: "right" }}>{s.sampleSize}n</span>
                <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
                  <div style={{ width: `${s.confidenceScore}%`, height: "100%", borderRadius: 2, background: "#6b7280" }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ pair }: { pair: Pair }) {
  const { data } = useMarketContext(pair);
  const ctx = data?.data;
  if (!ctx) return null;
  return (
    <div style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 10, padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
      <Brain size={14} style={{ color: "#8b5cf6", marginTop: 1, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>{ctx.summary}</span>
    </div>
  );
}

function LoadingCard({ title }: { title: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 12 }}>{title}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "20px 0" }} className="animate-pulse">Loading…</div>
    </div>
  );
}

function ErrorCard({ title }: { title: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 12 }}>{title}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "20px 0" }}>No data available</div>
    </div>
  );
}

export default function MarketContextPage() {
  const [pair, setPair] = useState<Pair>("EURUSD");
  const { data: ctxData } = useMarketContext(pair);
  const ctx = ctxData?.data;
  const score = ctx?.mcs?.score ?? 0;
  const classification = ctx?.classification ?? "neutral";
  const color = ENV_COLORS[classification] ?? "#8b5cf6";

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.02em" }}>
            Market Context Intelligence
          </h1>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
            Historical evidence-based market environment analysis
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {PAIRS.map(p => (
            <button
              key={p}
              onClick={() => setPair(p)}
              style={{
                fontSize: 12, padding: "6px 14px", borderRadius: 8,
                border: `1px solid ${pair === p ? "#8b5cf6" : "rgba(255,255,255,0.12)"}`,
                background: pair === p ? "rgba(139,92,246,0.2)" : "transparent",
                color: pair === p ? "#c4b5fd" : "rgba(255,255,255,0.5)",
                cursor: "pointer", fontWeight: pair === p ? 700 : 400,
              }}
            >{p}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "MCS Score", value: score, unit: "/100", color },
          { label: "Classification", value: classification.toUpperCase(), color },
          { label: "Stability", value: ctx?.stability?.overallStability ?? "—", unit: "/100", color: STABILITY_COLORS[ctx?.stability?.label ?? ""] ?? "#8b5cf6" },
          { label: "Sample Size", value: ctx?.mcs?.sampleSize ?? 0, unit: " trades", color: "#8b5cf6" },
        ].map(({ label, value, unit, color: c }) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: c }}>{value}<span style={{ fontSize: 13, fontWeight: 400, color: "rgba(255,255,255,0.4)" }}>{unit}</span></div>
          </div>
        ))}
      </div>

      <SummaryCard pair={pair} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <MCSCard pair={pair} />
        <ClassificationCard pair={pair} />
        <StabilityCard pair={pair} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ContextTimelineCard pair={pair} />
        <HistoricalComparisonCard pair={pair} />
      </div>

      <PerformanceByDimensionCard pair={pair} />
    </div>
  );
}
