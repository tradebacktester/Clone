// ─── Market Intelligence Center ───────────────────────────────────────────────
// Advisory only dashboard. Displays the Unified Market Intelligence Report.

import { useQuery } from "@tanstack/react-query";
import {
  Activity, Shield, TrendingUp, AlertTriangle, BarChart3, Globe2,
  Brain, Clock, Zap, CheckCircle, XCircle, RefreshCw, Eye,
  ChevronRight, Info, Target, Database,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MarketSummary {
  regime: string;
  trendDirection: string;
  trendStrength: number;
  trendAge: number;
  volatilityLevel: string;
  liquidityQuality: string;
  correlationState: string;
  newsContext: string;
  session: string;
  spread: string;
  marketStability: number;
}

interface HealthComponent {
  score: number;
  weight: number;
  label: string;
}

interface HealthScore {
  overall: number;
  grade: string;
  interpretation: string;
  components: Record<string, HealthComponent>;
}

interface RiskDimension {
  level: string;
  score: number;
  evidence: string;
  metric: string | number;
}

interface RiskAssessment {
  overall: string;
  overallScore: number;
  dimensions: Record<string, RiskDimension>;
  evidence: string[];
}

interface OpportunityFactor {
  score: number;
  weight: number;
  description: string;
}

interface OpportunityScore {
  overall: number;
  label: string;
  reasoning: string;
  factors: Record<string, OpportunityFactor>;
  note: string;
}

interface HistoricalContext {
  similarityScore: number;
  similarMarketsCount: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  drawdown: number;
  confidence: number;
  sampleSize: number;
  matches: Array<{
    regime: string;
    trendDirection: string;
    volatilityLevel: string;
    winRate: number;
    profitFactor: number;
    similarityScore: number;
    sampleSize: number;
  }>;
}

interface OutlookScenario {
  description: string;
  probability: number;
  historicalBasis: string;
  confidence: number;
  triggerConditions: string[];
}

interface MarketOutlook {
  primary: OutlookScenario;
  alternative: OutlookScenario;
  transitionProbability: number;
  expectedDurationBars: number;
  confidence: number;
  supportingEvidence: string[];
  historicalBasis: string;
}

interface UnifiedMarketState {
  timestamp: string;
  version: string;
  pair: string;
  marketSummary: MarketSummary;
  historicalContext: HistoricalContext;
  healthScore: HealthScore;
  opportunityScore: OpportunityScore;
  riskAssessment: RiskAssessment;
  outlook: MarketOutlook;
  overallConfidence: number;
  dataPoints: number;
  evidenceReferences: string[];
}

interface IntelligenceReport {
  report: {
    id: string;
    generatedAt: string;
    pair: string;
    engineVersion: string;
    unifiedState: UnifiedMarketState;
    regime: string;
    healthScore: number;
    opportunityScore: number;
    riskLevel: string;
    confidence: number;
    reportSummary: string;
    keyFindings: string[];
    dataQuality: string;
    readinessForPhase5: boolean;
  };
  featureCount: number;
  version: string;
}

interface HistoryResponse {
  reports: Array<{
    id: string;
    pair: string;
    regime: string;
    healthScore: number;
    opportunityScore: number;
    riskLevel: string;
    confidence: number;
    generatedAt: string;
  }>;
  healthHistory: Array<{ id: number; score: number; grade: string; computedAt: string }>;
  opportunityHistory: Array<{ id: number; score: number; label: string; computedAt: string }>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  Low: "#22c55e",
  Moderate: "#f59e0b",
  Elevated: "#f97316",
  High: "#ef4444",
  Extreme: "#dc2626",
};

const RISK_BG: Record<string, string> = {
  Low: "rgba(34,197,94,0.12)",
  Moderate: "rgba(245,158,11,0.12)",
  Elevated: "rgba(249,115,22,0.12)",
  High: "rgba(239,68,68,0.12)",
  Extreme: "rgba(220,38,38,0.12)",
};

const GRADE_COLORS: Record<string, string> = {
  A: "#22c55e", B: "#84cc16", C: "#f59e0b", D: "#f97316", F: "#ef4444",
};

const OPPORTUNITY_COLORS: Record<string, string> = {
  "Very Low": "#ef4444",
  Low: "#f97316",
  Moderate: "#f59e0b",
  Good: "#84cc16",
  High: "#22c55e",
  Excellent: "#10b981",
};

function scoreBar(score: number, color = "#8b5cf6") {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
      <div style={{
        flex: 1, height: 6, borderRadius: 3,
        background: "rgba(255,255,255,0.08)",
        overflow: "hidden",
      }}>
        <div style={{
          width: `${Math.min(100, score)}%`,
          height: "100%",
          background: color,
          borderRadius: 3,
          transition: "width 0.4s ease",
        }} />
      </div>
      <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 28, textAlign: "right" }}>
        {score}
      </span>
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return iso; }
}

function badge(text: string, color: string, bg: string) {
  return (
    <span style={{
      fontSize: 10, fontFamily: "monospace", color,
      background: bg, borderRadius: 4, padding: "2px 7px",
      border: `1px solid ${color}30`, fontWeight: 600, letterSpacing: 0.5,
      textTransform: "uppercase",
    }}>{text}</span>
  );
}

// ─── Sub-panels ────────────────────────────────────────────────────────────────

function MarketSummaryPanel({ s }: { s: MarketSummary }) {
  const rows = [
    ["Regime", s.regime],
    ["Trend Direction", s.trendDirection],
    ["Trend Strength", `${s.trendStrength}/100`],
    ["Trend Age", `${s.trendAge} bars`],
    ["Volatility", s.volatilityLevel],
    ["Liquidity", s.liquidityQuality],
    ["Correlation State", s.correlationState],
    ["News Context", s.newsContext],
    ["Session", s.session],
    ["Spread", s.spread],
    ["Stability", `${s.marketStability}/100`],
  ];

  return (
    <div style={cardStyle}>
      <div style={cardHeader}>
        <Globe2 size={14} color="#8b5cf6" />
        <span>Market Summary</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <span style={{ fontSize: 11, color: "#64748b" }}>{k}</span>
            <span style={{ fontSize: 11, color: "#e2e8f0", fontFamily: "monospace", textTransform: "capitalize" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HealthPanel({ h }: { h: HealthScore }) {
  const gradeColor = GRADE_COLORS[h.grade] ?? "#8b5cf6";
  return (
    <div style={cardStyle}>
      <div style={cardHeader}>
        <Shield size={14} color="#22c55e" />
        <span>Market Health Score</span>
        <span style={{ marginLeft: "auto", fontSize: 22, fontWeight: 700, color: gradeColor, fontFamily: "monospace" }}>
          {h.overall}
        </span>
        <span style={{
          fontSize: 13, fontWeight: 700, color: gradeColor,
          background: `${gradeColor}20`, borderRadius: 4, padding: "1px 8px",
          marginLeft: 6, fontFamily: "monospace",
        }}>{h.grade}</span>
      </div>
      <p style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10, lineHeight: 1.5 }}>{h.interpretation}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {Object.entries(h.components).map(([k, c]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: "#64748b", minWidth: 130 }}>{c.label}</span>
            {scoreBar(c.score, "#22c55e")}
            <span style={{ fontSize: 9, color: "#475569", minWidth: 30 }}>{(c.weight * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OpportunityPanel({ o }: { o: OpportunityScore }) {
  const oppColor = OPPORTUNITY_COLORS[o.label] ?? "#8b5cf6";
  return (
    <div style={cardStyle}>
      <div style={cardHeader}>
        <Target size={14} color="#f59e0b" />
        <span>Opportunity Score</span>
        <span style={{ marginLeft: "auto", fontSize: 22, fontWeight: 700, color: oppColor, fontFamily: "monospace" }}>
          {o.overall}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 600, color: oppColor,
          background: `${oppColor}20`, borderRadius: 4, padding: "1px 7px",
          marginLeft: 6, fontFamily: "monospace", textTransform: "uppercase",
        }}>{o.label}</span>
      </div>
      <div style={{
        fontSize: 10, color: "#f59e0b", background: "rgba(245,158,11,0.08)",
        borderRadius: 4, padding: "5px 8px", marginBottom: 8, lineHeight: 1.5,
      }}>
        <Info size={10} style={{ display: "inline", marginRight: 4 }} />
        {o.note}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {Object.entries(o.factors).map(([k, f]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: "#64748b", minWidth: 80, textTransform: "capitalize" }}>{k}</span>
            {scoreBar(f.score, oppColor)}
            <span style={{ fontSize: 9, color: "#475569", minWidth: 30 }}>{(f.weight * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RiskPanel({ r }: { r: RiskAssessment }) {
  const rColor = RISK_COLORS[r.overall] ?? "#8b5cf6";
  const rBg = RISK_BG[r.overall] ?? "rgba(139,92,246,0.1)";
  return (
    <div style={cardStyle}>
      <div style={cardHeader}>
        <AlertTriangle size={14} color={rColor} />
        <span>Risk Assessment</span>
        <span style={{
          marginLeft: "auto", fontSize: 11, fontWeight: 700, color: rColor,
          background: rBg, borderRadius: 4, padding: "2px 8px",
          border: `1px solid ${rColor}30`, fontFamily: "monospace", textTransform: "uppercase",
        }}>{r.overall}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {Object.entries(r.dimensions).map(([k, d]) => {
          const c = RISK_COLORS[d.level] ?? "#8b5cf6";
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: "#64748b", minWidth: 90, textTransform: "capitalize" }}>{k}</span>
              {scoreBar(d.score, c)}
              <span style={{
                fontSize: 9, fontWeight: 600, color: c,
                minWidth: 56, textAlign: "right", textTransform: "uppercase",
              }}>{d.level}</span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>Evidence</div>
        {r.evidence.slice(0, 3).map((e, i) => (
          <div key={i} style={{ fontSize: 9, color: "#475569", lineHeight: 1.4, marginBottom: 2 }}>• {e}</div>
        ))}
      </div>
    </div>
  );
}

function HistoricalPanel({ h }: { h: HistoricalContext }) {
  return (
    <div style={cardStyle}>
      <div style={cardHeader}>
        <Database size={14} color="#06b6d4" />
        <span>Historical Context</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#06b6d4" }}>
          {h.similarMarketsCount} similar periods
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", marginBottom: 10 }}>
        {[
          ["Similarity Score", `${h.similarityScore.toFixed(1)}%`],
          ["Confidence", `${h.confidence}/100`],
          ["Win Rate", `${(h.winRate * 100).toFixed(1)}%`],
          ["Profit Factor", h.profitFactor.toFixed(2)],
          ["Expectancy", `${h.expectancy.toFixed(4)} R`],
          ["Max Drawdown", `${h.drawdown.toFixed(1)}%`],
        ].map(([k, v]) => (
          <div key={k} style={{ padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ fontSize: 9, color: "#475569" }}>{k}</div>
            <div style={{ fontSize: 12, color: "#e2e8f0", fontFamily: "monospace", fontWeight: 600 }}>{v}</div>
          </div>
        ))}
      </div>
      {h.matches.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>Top Matches</div>
          {h.matches.slice(0, 3).map((m, i) => (
            <div key={i} style={{
              display: "flex", gap: 8, alignItems: "center",
              padding: "4px 6px", marginBottom: 2,
              background: "rgba(255,255,255,0.03)", borderRadius: 4,
            }}>
              <span style={{ fontSize: 9, color: "#64748b", minWidth: 16 }}>#{i + 1}</span>
              <span style={{ fontSize: 9, color: "#94a3b8", textTransform: "capitalize" }}>{m.regime}/{m.volatilityLevel}</span>
              <span style={{ fontSize: 9, color: "#22c55e", marginLeft: "auto" }}>
                WR {(m.winRate * 100).toFixed(0)}% | Sim {m.similarityScore.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OutlookPanel({ o }: { o: MarketOutlook }) {
  return (
    <div style={cardStyle}>
      <div style={cardHeader}>
        <Eye size={14} color="#a78bfa" />
        <span>Market Outlook</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#64748b" }}>
          Confidence: {o.confidence}/100
        </span>
      </div>
      <div style={{ fontSize: 9, color: "#f59e0b", background: "rgba(245,158,11,0.06)", borderRadius: 4, padding: "4px 8px", marginBottom: 8 }}>
        ⚠️ Statistical outlook only. No price levels are forecast.
      </div>

      {/* Primary */}
      <div style={{ background: "rgba(34,197,94,0.05)", borderRadius: 6, padding: "8px", marginBottom: 6, border: "1px solid rgba(34,197,94,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 600 }}>PRIMARY</span>
          <span style={{ fontSize: 10, color: "#22c55e", fontFamily: "monospace" }}>{(o.primary.probability * 100).toFixed(0)}%</span>
        </div>
        <p style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.5, margin: 0 }}>{o.primary.description}</p>
      </div>

      {/* Alternative */}
      <div style={{ background: "rgba(249,115,22,0.05)", borderRadius: 6, padding: "8px", marginBottom: 8, border: "1px solid rgba(249,115,22,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: "#f97316", fontWeight: 600 }}>ALTERNATIVE</span>
          <span style={{ fontSize: 10, color: "#f97316", fontFamily: "monospace" }}>{(o.alternative.probability * 100).toFixed(0)}%</span>
        </div>
        <p style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.5, margin: 0 }}>{o.alternative.description}</p>
      </div>

      {/* Transition timeline */}
      <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 9, color: "#475569" }}>Transition Prob.</div>
          <div style={{ fontSize: 14, color: "#f97316", fontFamily: "monospace", fontWeight: 700 }}>
            {(o.transitionProbability * 100).toFixed(0)}%
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "#475569" }}>Expected Remaining</div>
          <div style={{ fontSize: 14, color: "#e2e8f0", fontFamily: "monospace", fontWeight: 700 }}>
            {o.expectedDurationBars} bars
          </div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
        <div style={{ fontSize: 9, color: "#64748b", marginBottom: 4 }}>Supporting Evidence</div>
        {o.supportingEvidence.slice(0, 3).map((e, i) => (
          <div key={i} style={{ fontSize: 9, color: "#475569", lineHeight: 1.4, marginBottom: 2 }}>• {e}</div>
        ))}
      </div>
    </div>
  );
}

function EvidencePanel({ refs }: { refs: string[] }) {
  return (
    <div style={cardStyle}>
      <div style={cardHeader}>
        <Info size={14} color="#64748b" />
        <span>Evidence References</span>
      </div>
      {refs.map((r, i) => (
        <div key={i} style={{
          display: "flex", gap: 8, alignItems: "flex-start",
          padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}>
          <ChevronRight size={10} color="#8b5cf6" style={{ marginTop: 2, flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: "#64748b", lineHeight: 1.5 }}>{r}</span>
        </div>
      ))}
    </div>
  );
}

function HistoryTimelinePanel({ history }: { history: HistoryResponse }) {
  const reports = history.reports ?? [];
  return (
    <div style={cardStyle}>
      <div style={cardHeader}>
        <Clock size={14} color="#8b5cf6" />
        <span>Intelligence History</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#475569" }}>{reports.length} reports</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
        {reports.map(r => {
          const rColor = RISK_COLORS[r.riskLevel] ?? "#8b5cf6";
          return (
            <div key={r.id} style={{
              display: "flex", gap: 8, alignItems: "center",
              padding: "5px 8px", background: "rgba(255,255,255,0.02)",
              borderRadius: 4, borderLeft: `2px solid ${rColor}`,
            }}>
              <span style={{ fontSize: 9, color: "#475569", minWidth: 55 }}>{formatDate(r.generatedAt)}</span>
              <span style={{ fontSize: 9, color: "#94a3b8", textTransform: "capitalize", flex: 1 }}>{r.regime}</span>
              <span style={{ fontSize: 9, color: "#22c55e" }}>H:{r.healthScore}</span>
              <span style={{ fontSize: 9, color: "#f59e0b" }}>O:{r.opportunityScore}</span>
              <span style={{ fontSize: 9, color: rColor, fontWeight: 600 }}>{r.riskLevel}</span>
            </div>
          );
        })}
        {reports.length === 0 && (
          <div style={{ fontSize: 11, color: "#475569", textAlign: "center", padding: 16 }}>
            No history yet. Trigger a report to begin.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(139,92,246,0.12)",
  borderRadius: 8,
  padding: 14,
};

const cardHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontSize: 12,
  fontWeight: 600,
  color: "#e2e8f0",
  marginBottom: 10,
};

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function MarketIntelligenceCenter() {
  const { data: intel, isLoading, refetch, isFetching } = useQuery<IntelligenceReport>({
    queryKey: ["market-intelligence"],
    queryFn: async () => {
      const res = await fetch("/api/market/intelligence");
      if (!res.ok) throw new Error("Failed to fetch market intelligence");
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: history } = useQuery<HistoryResponse>({
    queryKey: ["market-intelligence-history"],
    queryFn: async () => {
      const res = await fetch("/api/market/history?limit=20");
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    refetchInterval: 120_000,
  });

  const report = intel?.report;
  const us = report?.unifiedState;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0a1a 0%, #0d0d2b 50%, #0a0a1a 100%)",
      padding: "20px 24px",
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Brain size={20} color="#8b5cf6" />
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>
            Market Intelligence Center
          </h1>
          <span style={{
            fontSize: 9, color: "#8b5cf6", background: "rgba(139,92,246,0.12)",
            borderRadius: 3, padding: "2px 6px", fontFamily: "monospace",
            border: "1px solid rgba(139,92,246,0.2)", fontWeight: 600,
          }}>ADVISORY ONLY</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <p style={{ fontSize: 11, color: "#475569", margin: 0 }}>
            Unified Market Intelligence Report — single source of truth for all intelligence modules.
            No trade execution. No strategy modification.
          </p>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              fontSize: 10, color: "#8b5cf6",
              background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)",
              borderRadius: 4, padding: "4px 10px", cursor: "pointer",
              marginLeft: "auto", flexShrink: 0,
            }}
          >
            <RefreshCw size={10} style={{ animation: isFetching ? "spin 1s linear infinite" : "none" }} />
            Refresh
          </button>
        </div>
      </div>

      {isLoading && (
        <div style={{ textAlign: "center", padding: 60, color: "#475569", fontFamily: "monospace" }}>
          <Activity size={24} color="#8b5cf6" style={{ marginBottom: 8 }} />
          <div>Generating Market Intelligence Report…</div>
        </div>
      )}

      {!isLoading && report && us && (
        <>
          {/* Top stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
            {[
              {
                label: "Health Score", value: `${report.healthScore}`, sub: us.healthScore.grade,
                color: GRADE_COLORS[us.healthScore.grade] ?? "#8b5cf6",
                icon: <Shield size={14} />,
              },
              {
                label: "Opportunity", value: `${report.opportunityScore}`, sub: us.opportunityScore.label,
                color: OPPORTUNITY_COLORS[us.opportunityScore.label] ?? "#8b5cf6",
                icon: <Target size={14} />,
              },
              {
                label: "Risk Level", value: report.riskLevel, sub: `Score: ${us.riskAssessment.overallScore}`,
                color: RISK_COLORS[report.riskLevel] ?? "#8b5cf6",
                icon: <AlertTriangle size={14} />,
              },
              {
                label: "Confidence", value: `${report.confidence}%`, sub: report.dataQuality,
                color: "#a78bfa",
                icon: <Activity size={14} />,
              },
              {
                label: "Phase 5 Ready", value: report.readinessForPhase5 ? "YES" : "NO", sub: `${intel?.featureCount ?? 0} data points`,
                color: report.readinessForPhase5 ? "#22c55e" : "#f97316",
                icon: report.readinessForPhase5 ? <CheckCircle size={14} /> : <XCircle size={14} />,
              },
            ].map(item => (
              <div key={item.label} style={{
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${item.color}20`,
                borderRadius: 8, padding: "12px 14px",
                borderLeft: `3px solid ${item.color}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: item.color, marginBottom: 6 }}>
                  {item.icon}
                  <span style={{ fontSize: 10, color: "#64748b" }}>{item.label}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: item.color, fontFamily: "monospace" }}>{item.value}</div>
                <div style={{ fontSize: 9, color: "#475569", marginTop: 2, textTransform: "capitalize" }}>{item.sub}</div>
              </div>
            ))}
          </div>

          {/* Report summary */}
          <div style={{
            background: "rgba(139,92,246,0.05)", borderRadius: 8, padding: "10px 14px",
            border: "1px solid rgba(139,92,246,0.12)", marginBottom: 16,
          }}>
            <div style={{ fontSize: 10, color: "#8b5cf6", fontWeight: 600, marginBottom: 4 }}>REPORT SUMMARY</div>
            <p style={{ fontSize: 11, color: "#94a3b8", margin: 0, lineHeight: 1.6 }}>{report.reportSummary}</p>
          </div>

          {/* Key Findings */}
          <div style={{
            background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "10px 14px",
            border: "1px solid rgba(255,255,255,0.06)", marginBottom: 16,
          }}>
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, marginBottom: 6 }}>KEY FINDINGS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {report.keyFindings.map((f, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 10, color: "#8b5cf6", marginTop: 1 }}>›</span>
                  <span style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.5 }}>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Main grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <MarketSummaryPanel s={us.marketSummary} />
            <HealthPanel h={us.healthScore} />
            <OpportunityPanel o={us.opportunityScore} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <RiskPanel r={us.riskAssessment} />
            <HistoricalPanel h={us.historicalContext} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <OutlookPanel o={us.outlook} />
            <EvidencePanel refs={us.evidenceReferences} />
          </div>

          {history && (
            <HistoryTimelinePanel history={history} />
          )}

          {/* Footer */}
          <div style={{
            marginTop: 16, padding: "8px 14px", borderRadius: 6,
            background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.12)",
            fontSize: 9, color: "#64748b", textAlign: "center",
          }}>
            🛡️ ADVISORY ONLY — This dashboard provides market intelligence for informational purposes only.
            No trade execution, strategy modification, or risk management decisions are derived from this output.
            Generated at: {formatDate(report.generatedAt)} · Engine v{report.engineVersion}
          </div>
        </>
      )}
    </div>
  );
}
