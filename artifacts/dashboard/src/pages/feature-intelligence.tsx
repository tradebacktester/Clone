import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3, Brain, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle2, XCircle, Info, RefreshCw,
  Trophy, Target, Zap, Activity, Shield, ChevronDown, ChevronUp,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeatureResult {
  featureId: string;
  displayName: string;
  category: string;
  description: string;
  sampleSize: number;
  winRate: number;
  lossRate: number;
  avgRR: number;
  avgProfit: number;
  avgLoss: number;
  predictiveValue: number;
  reliabilityScore: number;
  confidenceScore: number;
  statisticalSignificance: number;
  correlationCoeff: number;
  isInsufficient: boolean;
  insufficientReason?: string;
  hasContradiction: boolean;
  contradictionNote?: string;
  isUnstable: boolean;
  instabilityNote?: string;
  overfittingRisk: string;
  confidenceExplanation: string;
  confidenceTrend: string;
  reliabilityRating: string;
  confidenceTier: string;
  bucketBreakdown: Array<{ label: string; sampleSize: number; wins: number; losses: number; winRate: number; avgRR: number }>;
}

interface InteractionResult {
  interactionId: string;
  featureA: string;
  featureB: string;
  displayName: string;
  description: string;
  sampleSize: number;
  winRate: number;
  avgRR: number;
  baselineWinRateA: number;
  baselineWinRateB: number;
  liftVsFeatureA: number;
  liftVsFeatureB: number;
  synergyScore: number;
  isSynergistic: boolean;
  statisticalSignificance: number;
  isInsufficient: boolean;
  insufficientReason?: string;
}

interface RankingItem {
  rank: number;
  featureId: string;
  displayName: string;
  category: string;
  predictiveValue: number;
  confidenceScore: number;
  reliabilityScore: number;
  sampleSize: number;
  winRate: number;
  isInsufficient: boolean;
  reliabilityRating: string;
}

interface ConfidenceData {
  hasData: boolean;
  overallConfidence: number;
  totalFeatures: number;
  sufficientFeatures: number;
  byTier: Record<string, number>;
  byTrend: Record<string, number>;
  features: Array<{
    featureId: string; displayName: string; confidenceScore: number;
    confidenceTier: string; confidenceTrend: string; reliabilityRating: string;
    sampleSize: number; confidenceExplanation: string;
  }>;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

// ─── Style constants ──────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: "rgba(139,92,246,0.04)",
  border: "1px solid rgba(139,92,246,0.15)",
  borderRadius: 10,
  padding: "16px 18px",
};

const BADGE = (color: string): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
  fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em",
  background: `${color}18`, border: `1px solid ${color}40`, color,
});

const SEC_TITLE: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: "0.15em",
  textTransform: "uppercase", color: "rgba(139,92,246,0.7)",
  fontFamily: "'JetBrains Mono', monospace", marginBottom: 12,
};

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };

// ─── Colour helpers ────────────────────────────────────────────────────────────

function tierColor(tier: string): string {
  if (tier === "very_high") return "hsl(142 68% 48%)";
  if (tier === "high") return "hsl(210 100% 60%)";
  if (tier === "moderate") return "hsl(38 92% 50%)";
  if (tier === "low") return "hsl(355 90% 60%)";
  return "rgba(255,255,255,0.3)";
}

function trendIcon(trend: string) {
  if (trend === "improving") return <TrendingUp style={{ width: 12, height: 12, color: "hsl(142 68% 48%)" }} />;
  if (trend === "declining") return <TrendingDown style={{ width: 12, height: 12, color: "hsl(355 90% 60%)" }} />;
  if (trend === "stable") return <Minus style={{ width: 12, height: 12, color: "rgba(255,255,255,0.5)" }} />;
  return null;
}

function categoryColor(cat: string): string {
  if (cat === "zone") return "hsl(262 80% 65%)";
  if (cat === "execution") return "hsl(210 100% 60%)";
  if (cat === "context") return "hsl(38 92% 50%)";
  if (cat === "risk") return "hsl(355 90% 60%)";
  return "rgba(255,255,255,0.5)";
}

function overfittingColor(risk: string): string {
  if (risk === "high") return "hsl(355 90% 60%)";
  if (risk === "medium") return "hsl(38 92% 50%)";
  if (risk === "low") return "hsl(210 100% 60%)";
  return "hsl(142 68% 48%)";
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${(value / max) * 100}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
      </div>
      <span style={{ ...MONO, fontSize: 10, color: "rgba(255,255,255,0.7)", minWidth: 32, textAlign: "right" }}>
        {value.toFixed(0)}
      </span>
    </div>
  );
}

// ─── Feature card ─────────────────────────────────────────────────────────────

function FeatureCard({ f, expanded, onToggle }: { f: FeatureResult; expanded: boolean; onToggle: () => void }) {
  const flags = [
    f.hasContradiction && { icon: <AlertTriangle style={{ width: 10, height: 10 }} />, label: "Contradiction", color: "hsl(355 90% 60%)" },
    f.isUnstable && { icon: <Activity style={{ width: 10, height: 10 }} />, label: "Unstable", color: "hsl(38 92% 50%)" },
    (f.overfittingRisk === "high" || f.overfittingRisk === "medium") && { icon: <AlertTriangle style={{ width: 10, height: 10 }} />, label: `Overfitting: ${f.overfittingRisk}`, color: overfittingColor(f.overfittingRisk) },
  ].filter(Boolean) as { icon: React.ReactNode; label: string; color: string }[];

  return (
    <div style={{ ...CARD, marginBottom: 8, opacity: f.isInsufficient ? 0.65 : 1 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }} onClick={onToggle}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{f.displayName}</span>
            <span style={{ ...BADGE(categoryColor(f.category)) }}>{f.category}</span>
            {f.isInsufficient && <span style={{ ...BADGE("rgba(255,255,255,0.4)") }}>⚠ Insufficient</span>}
            {flags.map((flag, i) => <span key={i} style={{ ...BADGE(flag.color) }}>{flag.icon} {flag.label}</span>)}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
              {trendIcon(f.confidenceTrend)}
              <span style={{ ...MONO, fontSize: 10, color: tierColor(f.confidenceTier) }}>
                {f.confidenceTier.replace("_", " ")}
              </span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ ...MONO, fontSize: 9, color: "rgba(139,92,246,0.6)", marginBottom: 2 }}>PREDICTIVE VALUE</div>
              <ScoreBar value={f.predictiveValue} color="hsl(262 80% 65%)" />
            </div>
            <div>
              <div style={{ ...MONO, fontSize: 9, color: "rgba(139,92,246,0.6)", marginBottom: 2 }}>CONFIDENCE</div>
              <ScoreBar value={f.confidenceScore} color={tierColor(f.confidenceTier)} />
            </div>
            <div>
              <div style={{ ...MONO, fontSize: 9, color: "rgba(139,92,246,0.6)", marginBottom: 2 }}>RELIABILITY</div>
              <ScoreBar value={f.reliabilityScore} color="hsl(210 100% 60%)" />
            </div>
          </div>
        </div>
        <div style={{ paddingTop: 2, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>
          {expanded ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(139,92,246,0.1)" }}>
          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 14 }}>
            {[
              ["Win Rate", `${(f.winRate * 100).toFixed(1)}%`, "hsl(142 68% 48%)"],
              ["Loss Rate", `${(f.lossRate * 100).toFixed(1)}%`, "hsl(355 90% 60%)"],
              ["Avg RR", f.avgRR.toFixed(2), "hsl(210 100% 60%)"],
              ["Correlation", f.correlationCoeff.toFixed(3), Math.abs(f.correlationCoeff) > 0.2 ? "hsl(38 92% 50%)" : "rgba(255,255,255,0.5)"],
              ["Sample", String(f.sampleSize), "rgba(255,255,255,0.7)"],
            ].map(([label, value, color]) => (
              <div key={label as string} style={{ textAlign: "center" }}>
                <div style={{ ...MONO, fontSize: 9, color: "rgba(139,92,246,0.6)", marginBottom: 3 }}>{label as string}</div>
                <div style={{ ...MONO, fontSize: 13, color: color as string, fontWeight: 700 }}>{value as string}</div>
              </div>
            ))}
          </div>

          {/* Bucket breakdown */}
          {f.bucketBreakdown && f.bucketBreakdown.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...MONO, fontSize: 9, color: "rgba(139,92,246,0.5)", marginBottom: 6 }}>BUCKET BREAKDOWN</div>
              <div style={{ display: "flex", gap: 8 }}>
                {f.bucketBreakdown.map(b => (
                  <div key={b.label} style={{ flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                    <div style={{ ...MONO, fontSize: 9, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>{b.label.toUpperCase()}</div>
                    <div style={{ ...MONO, fontSize: 13, fontWeight: 700, color: b.winRate >= 0.6 ? "hsl(142 68% 48%)" : b.winRate >= 0.45 ? "hsl(38 92% 50%)" : "hsl(355 90% 60%)" }}>
                      {(b.winRate * 100).toFixed(0)}%
                    </div>
                    <div style={{ ...MONO, fontSize: 9, color: "rgba(255,255,255,0.35)" }}>n={b.sampleSize}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Explanation */}
          <div style={{ background: "rgba(139,92,246,0.04)", borderRadius: 6, padding: "8px 10px", fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
            <Info style={{ width: 10, height: 10, display: "inline", marginRight: 4, color: "hsl(262 80% 65%)" }} />
            {f.confidenceExplanation}
          </div>

          {/* Flags */}
          {flags.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {f.contradictionNote && (
                <div style={{ fontSize: 11, color: "hsl(355 90% 60%)", padding: "4px 8px", background: "rgba(239,68,68,0.06)", borderRadius: 4, marginBottom: 4 }}>
                  ⚡ {f.contradictionNote}
                </div>
              )}
              {f.instabilityNote && (
                <div style={{ fontSize: 11, color: "hsl(38 92% 50%)", padding: "4px 8px", background: "rgba(245,158,11,0.06)", borderRadius: 4, marginBottom: 4 }}>
                  〰 {f.instabilityNote}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Interaction card ─────────────────────────────────────────────────────────

function InteractionCard({ i }: { i: InteractionResult }) {
  const synergyColor = i.synergyScore >= 70 ? "hsl(142 68% 48%)" : i.synergyScore >= 40 ? "hsl(210 100% 60%)" : "hsl(38 92% 50%)";
  return (
    <div style={{ ...CARD, marginBottom: 8, opacity: i.isInsufficient ? 0.6 : 1 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{i.displayName}</span>
            {i.isSynergistic && !i.isInsufficient && <span style={{ ...BADGE("hsl(142 68% 48%)") }}>⚡ Synergistic</span>}
            {i.isInsufficient && <span style={{ ...BADGE("rgba(255,255,255,0.4)") }}>⚠ Insufficient</span>}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>{i.description}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
            {[
              ["Synergy Score", `${i.synergyScore.toFixed(1)}/100`, synergyColor],
              ["Win Rate", `${(i.winRate * 100).toFixed(1)}%`, "hsl(142 68% 48%)"],
              ["Lift vs A", `${i.liftVsFeatureA.toFixed(2)}x`, i.liftVsFeatureA >= 1.1 ? "hsl(142 68% 48%)" : "hsl(355 90% 60%)"],
              ["Lift vs B", `${i.liftVsFeatureB.toFixed(2)}x`, i.liftVsFeatureB >= 1.1 ? "hsl(142 68% 48%)" : "hsl(355 90% 60%)"],
              ["Sample", String(i.sampleSize), "rgba(255,255,255,0.7)"],
            ].map(([label, value, color]) => (
              <div key={label as string} style={{ textAlign: "center" }}>
                <div style={{ ...MONO, fontSize: 9, color: "rgba(139,92,246,0.6)", marginBottom: 3 }}>{label as string}</div>
                <div style={{ ...MONO, fontSize: 12, color: color as string, fontWeight: 700 }}>{value as string}</div>
              </div>
            ))}
          </div>
          {i.isInsufficient && i.insufficientReason && (
            <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
              ⚠ {i.insufficientReason}
            </div>
          )}
        </div>
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${synergyColor}`, position: "relative" }}>
            <span style={{ ...MONO, fontSize: 11, color: synergyColor, fontWeight: 700 }}>{i.synergyScore.toFixed(0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Ranking row ──────────────────────────────────────────────────────────────

function RankingRow({ r }: { r: RankingItem }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.12)", marginBottom: 6, opacity: r.isInsufficient ? 0.6 : 1 }}>
      <div style={{ ...MONO, fontSize: 13, color: r.rank <= 3 ? "hsl(262 80% 65%)" : "rgba(255,255,255,0.5)", fontWeight: 700, minWidth: 24, textAlign: "center" }}>
        {r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : `#${r.rank}`}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ color: "#fff", fontWeight: 600, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.displayName}</span>
          <span style={{ ...BADGE(categoryColor(r.category)) }}>{r.category}</span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <span style={{ ...MONO, fontSize: 10, color: "rgba(255,255,255,0.5)" }}>PV: <span style={{ color: "hsl(262 80% 65%)" }}>{r.predictiveValue.toFixed(1)}</span></span>
          <span style={{ ...MONO, fontSize: 10, color: "rgba(255,255,255,0.5)" }}>Conf: <span style={{ color: tierColor(r.isInsufficient ? "insufficient" : r.confidenceScore >= 75 ? "very_high" : r.confidenceScore >= 50 ? "high" : "moderate") }}>{r.confidenceScore.toFixed(1)}%</span></span>
          <span style={{ ...MONO, fontSize: 10, color: "rgba(255,255,255,0.5)" }}>n={r.sampleSize}</span>
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>
        <span style={{ ...BADGE(r.isInsufficient ? "rgba(255,255,255,0.4)" : r.reliabilityRating === "institutional" ? "hsl(142 68% 48%)" : r.reliabilityRating === "strong" ? "hsl(210 100% 60%)" : r.reliabilityRating === "moderate" ? "hsl(38 92% 50%)" : "hsl(355 90% 60%)") }}>
          {r.isInsufficient ? "insufficient" : r.reliabilityRating}
        </span>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS = ["Rankings", "Features", "Interactions", "Confidence", "History"] as const;
type Tab = typeof TABS[number];

export default function FeatureIntelligencePage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("Rankings");
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState("predictive_value");

  const statusQ = useQuery({
    queryKey: ["fi-status"],
    queryFn: () => apiFetch<{ isLoaded: boolean; inMemoryFeatures: number; sufficientFeatures: number; overallConfidence: number; lastAnalyzedAt: string | null; sampleSize?: number }>("/api/learning/features/status"),
    refetchInterval: 30000,
  });

  const featuresQ = useQuery({
    queryKey: ["fi-features", categoryFilter, sortBy],
    queryFn: () => apiFetch<{ features: FeatureResult[]; total: number }>(`/api/learning/features?sortBy=${sortBy}${categoryFilter !== "all" ? `&category=${categoryFilter}` : ""}`),
    enabled: activeTab === "Features" || activeTab === "Rankings",
  });

  const rankingsQ = useQuery({
    queryKey: ["fi-rankings", sortBy],
    queryFn: () => apiFetch<{ rankings: RankingItem[]; overallConfidence: number; sampleSize: number }>(`/api/learning/feature-rankings?sortBy=${sortBy}`),
    enabled: activeTab === "Rankings",
  });

  const interactionsQ = useQuery({
    queryKey: ["fi-interactions"],
    queryFn: () => apiFetch<{ interactions: InteractionResult[]; synergisticCount: number }>("/api/learning/interactions"),
    enabled: activeTab === "Interactions",
  });

  const confidenceQ = useQuery({
    queryKey: ["fi-confidence"],
    queryFn: () => apiFetch<ConfidenceData>("/api/learning/confidence"),
    enabled: activeTab === "Confidence",
  });

  const historyQ = useQuery({
    queryKey: ["fi-history"],
    queryFn: () => apiFetch<{ history: Array<{ featureId: string; snapshotDate: string; confidenceScore: string; sampleSize: number; trendDirection: string }> }>("/api/learning/confidence-history?days=30"),
    enabled: activeTab === "History",
  });

  const analyzeMut = useMutation({
    mutationFn: () => fetch("/api/learning/features/analyze", { method: "POST", headers: { "Content-Type": "application/json" } }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fi-status"] });
      qc.invalidateQueries({ queryKey: ["fi-features"] });
      qc.invalidateQueries({ queryKey: ["fi-rankings"] });
      qc.invalidateQueries({ queryKey: ["fi-interactions"] });
      qc.invalidateQueries({ queryKey: ["fi-confidence"] });
    },
  });

  const status = statusQ.data;
  const features = featuresQ.data?.features ?? [];
  const rankings = rankingsQ.data?.rankings ?? [];
  const interactions = interactionsQ.data?.interactions ?? [];
  const confidence = confidenceQ.data;
  const history = historyQ.data?.history ?? [];

  const overallConf = status?.overallConfidence ?? 0;
  const confColor = overallConf >= 75 ? "hsl(142 68% 48%)" : overallConf >= 50 ? "hsl(210 100% 60%)" : overallConf >= 25 ? "hsl(38 92% 50%)" : "rgba(255,255,255,0.4)";

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Brain style={{ width: 20, height: 20, color: "hsl(262 80% 65%)" }} />
            <h1 style={{ color: "#fff", fontWeight: 800, fontSize: 20, margin: 0 }}>Feature Intelligence</h1>
            <span style={{ ...BADGE("hsl(262 80% 65%)") }}>ADVISORY ONLY</span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, margin: 0 }}>
            Evidence-backed analysis of which strategy components drive profitable outcomes.
          </p>
        </div>
        <button
          onClick={() => analyzeMut.mutate()}
          disabled={analyzeMut.isPending}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
            borderRadius: 8, cursor: analyzeMut.isPending ? "not-allowed" : "pointer",
            background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.15))",
            border: "1px solid rgba(139,92,246,0.4)", color: "hsl(262 80% 72%)",
            fontSize: 12, fontWeight: 600, opacity: analyzeMut.isPending ? 0.7 : 1,
          }}
        >
          <RefreshCw style={{ width: 13, height: 13, animation: analyzeMut.isPending ? "spin 1s linear infinite" : "none" }} />
          {analyzeMut.isPending ? "Analyzing…" : "Run Analysis"}
        </button>
      </div>

      {/* Stat strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Overall Confidence", value: `${overallConf.toFixed(1)}%`, color: confColor, icon: <Shield style={{ width: 14, height: 14 }} /> },
          { label: "Features Analyzed", value: String(status?.inMemoryFeatures ?? 0), color: "hsl(262 80% 65%)", icon: <BarChart3 style={{ width: 14, height: 14 }} /> },
          { label: "Sufficient Features", value: String(status?.sufficientFeatures ?? 0), color: "hsl(210 100% 60%)", icon: <CheckCircle2 style={{ width: 14, height: 14 }} /> },
          { label: "Last Analysis", value: status?.lastAnalyzedAt ? new Date(status.lastAnalyzedAt).toLocaleTimeString() : "—", color: "rgba(255,255,255,0.6)", icon: <Activity style={{ width: 14, height: 14 }} /> },
        ].map(({ label, value, color, icon }) => (
          <div key={label} style={{ ...CARD, textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginBottom: 6, color: "rgba(139,92,246,0.6)" }}>
              {icon}
              <span style={{ ...MONO, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</span>
            </div>
            <div style={{ ...MONO, fontSize: 20, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Analyze result message */}
      {analyzeMut.isSuccess && (analyzeMut.data as any)?.success === false && (
        <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "hsl(38 92% 50%)" }}>
          <AlertTriangle style={{ width: 13, height: 13, display: "inline", marginRight: 6 }} />
          {(analyzeMut.data as any)?.message}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 18, padding: "4px", background: "rgba(139,92,246,0.06)", borderRadius: 10, border: "1px solid rgba(139,92,246,0.15)" }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: "7px 10px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
              fontFamily: "'Inter', sans-serif", transition: "all 0.15s",
              background: activeTab === tab ? "rgba(139,92,246,0.25)" : "transparent",
              color: activeTab === tab ? "#fff" : "rgba(255,255,255,0.5)",
              boxShadow: activeTab === tab ? "0 0 12px rgba(139,92,246,0.2)" : "none",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Rankings tab ── */}
      {activeTab === "Rankings" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={SEC_TITLE}>Feature Rankings</div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 6, color: "#fff", fontSize: 11, padding: "5px 10px", cursor: "pointer" }}>
              <option value="predictive_value">Predictive Value</option>
              <option value="confidence_score">Confidence Score</option>
              <option value="reliability_score">Reliability Score</option>
              <option value="win_rate">Win Rate</option>
              <option value="sample_size">Sample Size</option>
            </select>
          </div>
          {rankingsQ.isLoading ? (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", padding: 40 }}>Loading rankings…</div>
          ) : rankings.length === 0 ? (
            <EmptyState />
          ) : (
            rankings.map(r => <RankingRow key={r.featureId} r={r} />)
          )}
        </div>
      )}

      {/* ── Features tab ── */}
      {activeTab === "Features" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ ...SEC_TITLE, marginBottom: 0 }}>All Features</div>
            <div style={{ display: "flex", gap: 6 }}>
              {["all", "zone", "execution", "context", "risk"].map(cat => (
                <button key={cat} onClick={() => setCategoryFilter(cat)}
                  style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${categoryFilter === cat ? categoryColor(cat) : "rgba(139,92,246,0.2)"}`, background: categoryFilter === cat ? `${categoryColor(cat)}18` : "transparent", color: categoryFilter === cat ? categoryColor(cat) : "rgba(255,255,255,0.5)", fontSize: 11, cursor: "pointer" }}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
          {featuresQ.isLoading ? (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", padding: 40 }}>Loading features…</div>
          ) : features.length === 0 ? (
            <EmptyState />
          ) : (
            features.map(f => (
              <FeatureCard
                key={f.featureId}
                f={f}
                expanded={expandedFeature === f.featureId}
                onToggle={() => setExpandedFeature(expandedFeature === f.featureId ? null : f.featureId)}
              />
            ))
          )}
        </div>
      )}

      {/* ── Interactions tab ── */}
      {activeTab === "Interactions" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={SEC_TITLE}>Feature Interaction Matrix</div>
            {interactionsQ.data && (
              <span style={{ ...MONO, fontSize: 10, color: "rgba(139,92,246,0.6)" }}>
                {interactionsQ.data.synergisticCount} synergistic / {interactions.length} total
              </span>
            )}
          </div>
          {interactionsQ.isLoading ? (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", padding: 40 }}>Loading interactions…</div>
          ) : interactions.length === 0 ? (
            <EmptyState />
          ) : (
            interactions.map(i => <InteractionCard key={i.interactionId} i={i} />)
          )}
        </div>
      )}

      {/* ── Confidence tab ── */}
      {activeTab === "Confidence" && (
        <div>
          <div style={SEC_TITLE}>Confidence State</div>
          {confidenceQ.isLoading ? (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", padding: 40 }}>Loading…</div>
          ) : !confidence?.hasData ? (
            <EmptyState />
          ) : (
            <>
              {/* Tier summary */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 16 }}>
                {Object.entries(confidence.byTier).map(([tier, count]) => (
                  <div key={tier} style={{ ...CARD, textAlign: "center" }}>
                    <div style={{ ...MONO, fontSize: 9, color: "rgba(139,92,246,0.5)", marginBottom: 6 }}>{tier.toUpperCase().replace("_", " ")}</div>
                    <div style={{ ...MONO, fontSize: 20, fontWeight: 700, color: tierColor(tier) }}>{count}</div>
                  </div>
                ))}
              </div>
              {/* Trend summary */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                {Object.entries(confidence.byTrend).map(([trend, count]) => (
                  <div key={trend} style={{ ...CARD, display: "flex", alignItems: "center", gap: 8 }}>
                    {trendIcon(trend)}
                    <span style={{ ...MONO, fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{trend}</span>
                    <span style={{ ...MONO, fontSize: 16, fontWeight: 700, color: "#fff", marginLeft: "auto" }}>{count}</span>
                  </div>
                ))}
              </div>
              {/* Per-feature confidence list */}
              <div style={SEC_TITLE}>Feature Confidence Details</div>
              {confidence.features.map(f => (
                <div key={f.featureId} style={{ ...CARD, marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ color: "#fff", fontWeight: 600, fontSize: 12 }}>{f.displayName}</span>
                    <span style={{ ...BADGE(tierColor(f.confidenceTier)) }}>{f.confidenceTier.replace("_", " ")}</span>
                    {trendIcon(f.confidenceTrend)}
                    <span style={{ ...MONO, fontSize: 10, color: "rgba(255,255,255,0.5)", marginLeft: "auto" }}>n={f.sampleSize}</span>
                  </div>
                  <ScoreBar value={f.confidenceScore} color={tierColor(f.confidenceTier)} />
                  <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{f.confidenceExplanation}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── History tab ── */}
      {activeTab === "History" && (
        <div>
          <div style={SEC_TITLE}>Confidence History (Last 30 Days)</div>
          {historyQ.isLoading ? (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", padding: 40 }}>Loading…</div>
          ) : history.length === 0 ? (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", padding: 40, fontSize: 12 }}>
              No history yet. Run multiple analysis cycles to build historical data.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["Feature", "Date", "Confidence", "Sample Size", "Trend"].map(h => (
                      <th key={h} style={{ ...MONO, fontSize: 9, color: "rgba(139,92,246,0.6)", textAlign: "left", padding: "6px 10px", borderBottom: "1px solid rgba(139,92,246,0.15)", fontWeight: 600, letterSpacing: "0.1em" }}>
                        {h.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 100).map((h, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(139,92,246,0.06)" }}>
                      <td style={{ padding: "7px 10px", color: "#fff", fontSize: 12 }}>{h.featureId.replace(/_/g, " ")}</td>
                      <td style={{ padding: "7px 10px", ...MONO, fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{new Date(h.snapshotDate).toLocaleDateString()}</td>
                      <td style={{ padding: "7px 10px", ...MONO, fontSize: 12, color: "hsl(262 80% 65%)" }}>{Number(h.confidenceScore).toFixed(1)}%</td>
                      <td style={{ padding: "7px 10px", ...MONO, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{h.sampleSize}</td>
                      <td style={{ padding: "7px 10px" }}>{trendIcon(h.trendDirection)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: "rgba(255,255,255,0.4)" }}>
      <Brain style={{ width: 36, height: 36, margin: "0 auto 12px", opacity: 0.3 }} />
      <div style={{ fontSize: 14, marginBottom: 6 }}>No analysis data yet</div>
      <div style={{ fontSize: 12 }}>
        Run a learning cycle first (<code style={{ fontSize: 11, background: "rgba(139,92,246,0.1)", padding: "1px 6px", borderRadius: 3 }}>POST /learning-engine/run</code>),
        then click <strong style={{ color: "hsl(262 80% 65%)" }}>Run Analysis</strong> above.
      </div>
    </div>
  );
}
