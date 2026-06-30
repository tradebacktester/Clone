// ─── Trader Identity & Strategy Consistency Dashboard ─────────────────────────
// Advisory-only dashboard — identity profile, similarity scoring, preferences,
// drift detection, identity timeline, and evidence explorer.

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";

const API = "/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RuleCheck {
  name: string; score: number; passed: boolean; weight: number; detail: string;
}

interface PreferenceGroup {
  type: string; value: string; label: string; sampleSize: number;
  winRate: number; avgRr: number; profitFactor: number; confidence: number;
  effect: "positive" | "negative" | "neutral"; effectSize: number;
  baselineWinRate: number; liftVsBaseline: number; isSignificant: boolean;
  explanation: string;
}

interface IdentityProfile {
  profileId: string; version: string; stage: string; stageLabel: string;
  sampleSize: number; minSampleRequired: number; confidenceScore: number;
  isAdaptiveActive: boolean;
  identity: {
    overallWinRate: number; overallAvgRr: number; overallPf: number;
    avgSetupScore: number; avgTqi: number; avgRrPlanned: number;
    preferredPairs: string[]; preferredSessions: string[];
    preferredRegimes: string[]; preferredVolatility: string | null;
    preferredTrend: string | null; discoveries: PreferenceGroup[];
  };
  ruleIdentity: { stage: string; description: string; ruleBaselineScore: number; rules: string[] };
  isAdvisoryOnly: boolean; generatedAt: string;
}

interface SimilarTrade {
  tradeId: string; pair: string; session: string; regime: string;
  outcome: string; rrActual: number; similarity: number; openedAt: string;
}

interface SimilarityReport {
  reportId: string; version: string; profileId: string; identityStage: string;
  stageLabel: string;
  setup: { pair: string; session: string; regime: string; trend: string; volatility: string; setupScore: number; tqi: number };
  similarity: {
    ruleSimilarityScore: number; historicalSimilarityScore: number;
    preferenceAlignmentScore: number; identitySimilarityScore: number;
    statisticalConfidence: number; historicalSampleSize: number;
  };
  consistency: { level: string; label: string; reason: string; evidence: string[] };
  ruleEvaluation: { score: number; details: RuleCheck[]; summary: string };
  historicalSimilarity: { score: number; sampleSize: number; similarTrades: SimilarTrade[]; summary: string };
  preferenceAlignment: {
    score: number; aligned: string[]; misaligned: string[]; neutral: string[];
    details: Array<{ dimension: string; score: number; reason: string }>;
    summary: string;
  };
  identityNarrative: string; isAdvisoryOnly: boolean; evaluatedAt: string;
}

interface DriftEvent {
  eventId: string; driftType: string; driftSeverity: string; driftScore: number;
  dimension: string; previousValue: string; currentValue: string;
  changePercent: number; sampleSizeBefore: number; sampleSizeAfter: number;
  isStatisticallySignificant: boolean; description: string;
}

interface DriftReport {
  hasActiveDrift: boolean; driftEvents: DriftEvent[];
  overallDriftScore: number; driftSummary: string; sampleSize: number;
}

interface IdentityReport {
  version: string; generatedAt: string; identityStage: string; stageLabel: string;
  sampleSize: number; minSampleRequired: number; confidenceScore: number;
  preferences: {
    preferredPairs: string[]; preferredSessions: string[]; preferredRegimes: string[];
    preferredVolatility: string | null; preferredTrend: string | null;
    significantCount: number; totalDiscovered: number;
  };
  performance: { overallWinRate: number; overallAvgRr: number; overallPf: number; avgSetupScore: number; avgTqi: number };
  consistencyStats: { reportsAnalyzed: number; avgIdentitySimilarity: number | null; consistencyBreakdown: Record<string, number> };
  drift: { hasActiveDrift: boolean; overallDriftScore: number; eventCount: number; significantEvents: number; summary: string };
}

interface Statistics {
  totalSimilarityReports: number; avgIdentitySimilarity: number;
  significantDriftEvents: number; adoptedPreferences: number;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function scoreColor(s: number): string {
  if (s >= 85) return "#a78bfa";
  if (s >= 70) return "#34d399";
  if (s >= 55) return "#22c55e";
  if (s >= 40) return "#facc15";
  return "#ef4444";
}

function consistencyColor(level: string): string {
  const m: Record<string, string> = {
    fully_consistent:    "#a78bfa",
    mostly_consistent:   "#34d399",
    partially_consistent:"#22c55e",
    weakly_consistent:   "#facc15",
    inconsistent:        "#ef4444",
  };
  return m[level] ?? "#94a3b8";
}

function driftSeverityColor(s: string): string {
  const m: Record<string, string> = { critical: "#ef4444", high: "#f97316", medium: "#facc15", low: "#34d399" };
  return m[s] ?? "#94a3b8";
}

function effectColor(e: string): string {
  return e === "positive" ? "#34d399" : e === "negative" ? "#ef4444" : "#94a3b8";
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function ScoreBar({ score, color }: { score: number; color?: string }) {
  const c = color ?? scoreColor(score);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "#1e293b", borderRadius: 3 }}>
        <div style={{ width: `${score}%`, height: "100%", background: c, borderRadius: 3, transition: "width .4s" }} />
      </div>
      <span style={{ color: c, fontWeight: 700, minWidth: 38, textAlign: "right", fontSize: 12 }}>{score.toFixed(0)}</span>
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: 20, ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>{children}</h3>;
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
      {label}
    </span>
  );
}

// ─── Stage progress bar ───────────────────────────────────────────────────────

function StageProgress({ sampleSize, minRequired }: { sampleSize: number; minRequired: number }) {
  const pct = Math.min((sampleSize / minRequired) * 100, 100);
  const done = sampleSize >= minRequired;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12, color: "#94a3b8" }}>
        <span>{done ? "Stage 2 Active" : `Stage 1 → Stage 2 (${sampleSize}/${minRequired} trades)`}</span>
        <span style={{ color: done ? "#a78bfa" : "#facc15" }}>{done ? "Adaptive Identity Unlocked" : `${minRequired - sampleSize} trades remaining`}</span>
      </div>
      <div style={{ height: 8, background: "#1e293b", borderRadius: 4 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: done ? "#a78bfa" : "#3b82f6", borderRadius: 4, transition: "width .6s" }} />
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "profile" | "similarity" | "preferences" | "drift" | "history" | "report";

const TABS: { id: Tab; label: string }[] = [
  { id: "profile",     label: "Identity Profile" },
  { id: "similarity",  label: "Similarity Score" },
  { id: "preferences", label: "Preference Discovery" },
  { id: "drift",       label: "Drift Detection" },
  { id: "history",     label: "Identity Timeline" },
  { id: "report",      label: "Full Report" },
];

// ─── Setup form defaults ──────────────────────────────────────────────────────

const DEFAULT_SETUP = {
  pair: "EURUSD", session: "london", regime: "trending", trend: "bullish", volatility: "medium", direction: "buy",
  supplyQuality: 75, demandQuality: 75, liquidityScore: 70, amdScore: 72,
  confirmationQuality: 68, setupScore: 72, tqi: 70, rrPlanned: 2.0, spreadPips: 1.2,
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TraderIdentityPage() {
  const [tab, setTab] = useState<Tab>("profile");
  const [form, setForm] = useState(DEFAULT_SETUP);

  const profileQ = useQuery<IdentityProfile>({
    queryKey: ["identity-profile"],
    queryFn:  () => fetch(`${API}/identity/profile`).then(r => r.json()),
    refetchInterval: 120000,
  });

  const reportQ = useQuery<IdentityReport>({
    queryKey: ["identity-report"],
    queryFn:  () => fetch(`${API}/identity/report`).then(r => r.json()),
    refetchInterval: 120000,
  });

  const statsQ = useQuery<Statistics>({
    queryKey: ["identity-statistics"],
    queryFn:  () => fetch(`${API}/identity/statistics`).then(r => r.json()),
    refetchInterval: 60000,
  });

  const prefsQ = useQuery({
    queryKey: ["identity-preferences"],
    queryFn:  () => fetch(`${API}/identity/preferences`).then(r => r.json()),
    refetchInterval: 120000,
    enabled: tab === "preferences",
  });

  const driftQ = useQuery<DriftReport>({
    queryKey: ["identity-drift"],
    queryFn:  () => fetch(`${API}/identity/drift`).then(r => r.json()),
    refetchInterval: 120000,
    enabled: tab === "drift",
  });

  const historyQ = useQuery({
    queryKey: ["identity-history"],
    queryFn:  () => fetch(`${API}/identity/history`).then(r => r.json()),
    enabled: tab === "history",
  });

  const similarityMut = useMutation<SimilarityReport, Error, typeof form>({
    mutationFn: (setup) =>
      fetch(`${API}/identity/similarity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setup),
      }).then(r => r.json()),
  });

  const profile = profileQ.data;
  const report  = reportQ.data;
  const stats   = statsQ.data;

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: "#020617", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "#1e1b4b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🪪</div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "#e2e8f0" }}>Trader Identity Engine</h1>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Dynamic identity model — advisory only · never modifies strategy</p>
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 16 }}>
          {[
            { label: "Similarity Reports", value: stats?.totalSimilarityReports ?? "—" },
            { label: "Avg Identity Score", value: stats ? `${stats.avgIdentitySimilarity.toFixed(1)}` : "—" },
            { label: "Adopted Preferences", value: stats?.adoptedPreferences ?? "—" },
            { label: "Drift Events", value: stats?.significantDriftEvents ?? "—" },
          ].map(s => (
            <Card key={s.label} style={{ padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#a78bfa" }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{s.label}</div>
            </Card>
          ))}
        </div>

        {/* Stage progress */}
        {profile && (
          <Card style={{ marginTop: 12, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <Badge label={profile.stageLabel} color="#a78bfa" />
              <Badge label={`v${profile.version}`} color="#64748b" />
            </div>
            <StageProgress sampleSize={profile.sampleSize} minRequired={profile.minSampleRequired} />
          </Card>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #1e293b", paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 16px", borderRadius: "6px 6px 0 0", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
            background: tab === t.id ? "#1e293b" : "transparent",
            color: tab === t.id ? "#a78bfa" : "#64748b",
            borderBottom: tab === t.id ? "2px solid #a78bfa" : "2px solid transparent",
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Tab: Identity Profile ── */}
      {tab === "profile" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Stage 1: Rule Identity */}
          <Card>
            <SectionTitle>Stage 1 — Rule Identity (Always Active)</SectionTitle>
            <p style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
              {profile?.ruleIdentity.description ?? "Core deterministic strategy rules form the permanent identity baseline."}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(profile?.ruleIdentity.rules ?? []).map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#1e293b", borderRadius: 6 }}>
                  <span style={{ color: "#34d399", fontSize: 14 }}>✓</span>
                  <span style={{ fontSize: 12, color: "#e2e8f0" }}>{r}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Stage 2: Adaptive Identity */}
          <Card>
            <SectionTitle>Stage 2 — Adaptive Identity</SectionTitle>
            {profile?.isAdaptiveActive ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  {[
                    { label: "Win Rate", value: `${((profile.identity.overallWinRate ?? 0) * 100).toFixed(1)}%` },
                    { label: "Avg R:R", value: profile.identity.overallAvgRr?.toFixed(2) ?? "—" },
                    { label: "Avg Setup Score", value: profile.identity.avgSetupScore?.toFixed(1) ?? "—" },
                    { label: "Avg TQI", value: profile.identity.avgTqi?.toFixed(1) ?? "—" },
                  ].map(m => (
                    <div key={m.label} style={{ padding: "10px 12px", background: "#1e293b", borderRadius: 8, textAlign: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#a78bfa" }}>{m.value}</div>
                      <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {profile.identity.preferredPairs.length > 0 && (
                    <div style={{ fontSize: 12 }}>
                      <span style={{ color: "#64748b" }}>Preferred Pairs: </span>
                      {profile.identity.preferredPairs.map(p => <Badge key={p} label={p} color="#3b82f6" />)}
                    </div>
                  )}
                  {profile.identity.preferredSessions.length > 0 && (
                    <div style={{ fontSize: 12 }}>
                      <span style={{ color: "#64748b" }}>Preferred Sessions: </span>
                      {profile.identity.preferredSessions.map(s => <Badge key={s} label={s} color="#6366f1" />)}
                    </div>
                  )}
                  {profile.identity.preferredRegimes.length > 0 && (
                    <div style={{ fontSize: 12 }}>
                      <span style={{ color: "#64748b" }}>Preferred Regimes: </span>
                      {profile.identity.preferredRegimes.map(r => <Badge key={r} label={r} color="#8b5cf6" />)}
                    </div>
                  )}
                  {profile.identity.preferredVolatility && (
                    <div style={{ fontSize: 12 }}><span style={{ color: "#64748b" }}>Preferred Volatility: </span><Badge label={profile.identity.preferredVolatility} color="#a78bfa" /></div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>Adaptive Identity Locked</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>
                  {profile ? `${profile.minSampleRequired - profile.sampleSize} more verified trades required to unlock Stage 2.` : "Loading…"}
                </div>
              </div>
            )}
          </Card>

          {/* Confidence score */}
          {profile && (
            <Card style={{ gridColumn: "1 / -1" }}>
              <SectionTitle>Identity Confidence</SectionTitle>
              <ScoreBar score={profile.confidenceScore} color="#a78bfa" />
              <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
                Confidence grows with verified trade history (saturates at ~200 trades). Current: {profile.sampleSize} trades.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* ── Tab: Similarity Score ── */}
      {tab === "similarity" && (
        <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16 }}>
          {/* Form */}
          <Card>
            <SectionTitle>Evaluate Setup</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { k: "pair", label: "Pair", type: "select", opts: ["EURUSD", "GBPUSD", "USDJPY"] },
                { k: "session", label: "Session", type: "select", opts: ["london", "new_york", "overlap"] },
                { k: "regime", label: "Regime", type: "select", opts: ["trending", "ranging", "volatile", "low_volatility"] },
                { k: "trend", label: "Trend", type: "select", opts: ["bullish", "bearish", "neutral", "mixed"] },
                { k: "volatility", label: "Volatility", type: "select", opts: ["low", "medium", "high"] },
                { k: "direction", label: "Direction", type: "select", opts: ["buy", "sell"] },
              ].map(f => (
                <div key={f.k}>
                  <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 3 }}>{f.label}</label>
                  <select
                    value={(form as Record<string, unknown>)[f.k] as string}
                    onChange={e => setForm(prev => ({ ...prev, [f.k]: e.target.value }))}
                    style={{ width: "100%", padding: "6px 8px", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#e2e8f0", fontSize: 12 }}
                  >
                    {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              {[
                { k: "supplyQuality", label: "Supply Quality" }, { k: "demandQuality", label: "Demand Quality" },
                { k: "liquidityScore", label: "Liquidity Score" }, { k: "amdScore", label: "AMD Score" },
                { k: "confirmationQuality", label: "Confirmation Quality" }, { k: "setupScore", label: "Setup Score" },
                { k: "tqi", label: "TQI" }, { k: "rrPlanned", label: "R:R Planned", max: 20 },
                { k: "spreadPips", label: "Spread (pips)", max: 10 },
              ].map(f => (
                <div key={f.k}>
                  <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 3 }}>
                    {f.label}: <span style={{ color: "#a78bfa" }}>{(form as Record<string, unknown>)[f.k] as number}</span>
                  </label>
                  <input
                    type="range" min={0} max={f.max ?? 100} step={0.5}
                    value={(form as Record<string, unknown>)[f.k] as number}
                    onChange={e => setForm(prev => ({ ...prev, [f.k]: parseFloat(e.target.value) }))}
                    style={{ width: "100%", accentColor: "#a78bfa" }}
                  />
                </div>
              ))}
              <button
                onClick={() => similarityMut.mutate(form)}
                disabled={similarityMut.isPending}
                style={{ padding: "10px 0", background: similarityMut.isPending ? "#1e293b" : "#a78bfa", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 14 }}
              >
                {similarityMut.isPending ? "Evaluating…" : "Evaluate Identity Similarity"}
              </button>
            </div>
          </Card>

          {/* Results */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {similarityMut.data && (() => {
              const r = similarityMut.data;
              const sim = r.similarity;
              const con = r.consistency;
              return (
                <>
                  {/* Main score */}
                  <Card>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 42, fontWeight: 900, color: scoreColor(sim.identitySimilarityScore) }}>
                          {sim.identitySimilarityScore.toFixed(1)}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>Identity Similarity Score</div>
                      </div>
                      <Badge label={con.label} color={consistencyColor(con.level)} />
                    </div>
                    <ScoreBar score={sim.identitySimilarityScore} />
                    <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 12, lineHeight: 1.6 }}>{con.reason}</p>
                    {con.evidence.map((ev, i) => (
                      <div key={i} style={{ fontSize: 11, color: "#64748b", padding: "4px 8px", background: "#1e293b", borderRadius: 4, marginTop: 4 }}>• {ev}</div>
                    ))}
                  </Card>

                  {/* Component scores */}
                  <Card>
                    <SectionTitle>Similarity Components</SectionTitle>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {[
                        { label: "Rule Similarity", score: sim.ruleSimilarityScore },
                        { label: "Historical Similarity", score: sim.historicalSimilarityScore },
                        { label: "Preference Alignment", score: sim.preferenceAlignmentScore },
                      ].map(c => (
                        <div key={c.label}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                            <span style={{ color: "#94a3b8" }}>{c.label}</span>
                          </div>
                          <ScoreBar score={c.score} />
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 12, fontSize: 11, color: "#64748b" }}>
                      Statistical Confidence: {sim.statisticalConfidence.toFixed(0)}% · Historical Sample: {sim.historicalSampleSize} trades
                    </div>
                  </Card>

                  {/* Rule checks */}
                  <Card>
                    <SectionTitle>Rule Evaluation — {r.ruleEvaluation.score.toFixed(0)}/100</SectionTitle>
                    <p style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>{r.ruleEvaluation.summary}</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {r.ruleEvaluation.details.map((c, i) => (
                        <div key={i} style={{ padding: "8px 10px", background: "#1e293b", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                              <span style={{ color: c.passed ? "#34d399" : "#ef4444", fontSize: 12 }}>{c.passed ? "✓" : "✗"}</span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{c.name}</span>
                            </div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>{c.detail}</div>
                          </div>
                          <span style={{ color: scoreColor(c.score), fontWeight: 700, fontSize: 13, minWidth: 30, textAlign: "right" }}>{c.score.toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  </Card>

                  {/* Similar trades */}
                  {r.historicalSimilarity.similarTrades.length > 0 && (
                    <Card>
                      <SectionTitle>Most Similar Historical Trades</SectionTitle>
                      <p style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>{r.historicalSimilarity.summary}</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {r.historicalSimilarity.similarTrades.slice(0, 5).map((t, i) => (
                          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: 10, padding: "8px 10px", background: "#1e293b", borderRadius: 6, alignItems: "center", fontSize: 12 }}>
                            <span style={{ color: "#e2e8f0" }}>{t.pair} / {t.session}</span>
                            <Badge label={t.regime} color="#475569" />
                            <Badge label={t.outcome} color={t.outcome === "win" ? "#34d399" : "#ef4444"} />
                            <span style={{ color: "#94a3b8" }}>RR: {t.rrActual.toFixed(2)}</span>
                            <span style={{ color: "#a78bfa", fontWeight: 700 }}>{t.similarity.toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Narrative */}
                  <Card>
                    <SectionTitle>Identity Narrative</SectionTitle>
                    <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.7 }}>{r.identityNarrative}</p>
                    <div style={{ marginTop: 8, padding: "6px 10px", background: "#1e293b", borderRadius: 6, fontSize: 11, color: "#64748b" }}>
                      Advisory Only — This analysis does not modify the trading strategy.
                    </div>
                  </Card>
                </>
              );
            })()}

            {!similarityMut.data && !similarityMut.isPending && (
              <Card style={{ padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                <div style={{ color: "#64748b", fontSize: 13 }}>Configure a setup and click Evaluate to analyse identity similarity.</div>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Preference Discovery ── */}
      {tab === "preferences" && (
        <div>
          {prefsQ.isLoading && <div style={{ color: "#64748b", padding: 40, textAlign: "center" }}>Loading preferences…</div>}
          {prefsQ.data && (() => {
            const prefs = prefsQ.data as {
              stage: string; sampleSize: number; significantCount: number; totalDiscovered: number;
              preferredPairs: string[]; preferredSessions: string[]; preferredRegimes: string[];
              positivePreferences: PreferenceGroup[]; negativePreferences: PreferenceGroup[];
              allDiscoveries: PreferenceGroup[];
            };
            return (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
                  {[
                    { label: "Trade Sample", value: prefs.sampleSize },
                    { label: "Discoveries", value: prefs.totalDiscovered },
                    { label: "Significant", value: prefs.significantCount },
                    { label: "Stage", value: prefs.stage === "adaptive_identity" ? "Adaptive" : "Rule" },
                  ].map(s => (
                    <Card key={s.label} style={{ padding: 14, textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#a78bfa" }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{s.label}</div>
                    </Card>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {/* Positive preferences */}
                  <Card>
                    <SectionTitle>Positive Preferences (Outperform Baseline)</SectionTitle>
                    {prefs.positivePreferences.length === 0 && (
                      <div style={{ color: "#64748b", fontSize: 12, padding: "20px 0", textAlign: "center" }}>
                        No statistically significant positive preferences discovered yet.<br/>
                        <span style={{ fontSize: 11 }}>Need {20 - prefs.sampleSize > 0 ? `${20 - prefs.sampleSize} more trades` : "more data within sub-groups (≥8 per group)"}</span>
                      </div>
                    )}
                    {prefs.positivePreferences.map((p, i) => (
                      <div key={i} style={{ padding: "10px 12px", background: "#1e293b", borderRadius: 8, marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{p.label}</span>
                          <span style={{ color: effectColor(p.effect), fontWeight: 700, fontSize: 12 }}>
                            {p.liftVsBaseline > 0 ? "+" : ""}{(p.liftVsBaseline * 100).toFixed(1)}pp lift
                          </span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 6 }}>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#34d399" }}>{(p.winRate * 100).toFixed(1)}%</div>
                            <div style={{ fontSize: 10, color: "#64748b" }}>Win Rate</div>
                          </div>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#a78bfa" }}>{p.avgRr.toFixed(2)}</div>
                            <div style={{ fontSize: 10, color: "#64748b" }}>Avg R:R</div>
                          </div>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#3b82f6" }}>{p.sampleSize}</div>
                            <div style={{ fontSize: 10, color: "#64748b" }}>Trades</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{p.explanation}</div>
                        <ScoreBar score={p.confidence} color="#34d399" />
                        <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>Confidence</div>
                      </div>
                    ))}
                  </Card>

                  {/* All discoveries summary */}
                  <Card>
                    <SectionTitle>All Discoveries ({prefs.allDiscoveries.length})</SectionTitle>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {prefs.allDiscoveries.map((p, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "#1e293b", borderRadius: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: effectColor(p.effect), flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{p.label}</div>
                            <div style={{ fontSize: 10, color: "#64748b" }}>{p.sampleSize} trades · {(p.winRate * 100).toFixed(1)}% WR</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                            {p.isSignificant && <Badge label="Significant" color="#34d399" />}
                            <span style={{ color: scoreColor(p.confidence), fontSize: 11, fontWeight: 700 }}>{p.confidence.toFixed(0)}%</span>
                          </div>
                        </div>
                      ))}
                      {prefs.allDiscoveries.length === 0 && (
                        <div style={{ color: "#64748b", fontSize: 12, padding: "20px 0", textAlign: "center" }}>
                          No discoveries yet — need more trades with sufficient sub-group sizes.
                        </div>
                      )}
                    </div>
                  </Card>
                </div>

                <Card style={{ marginTop: 16, padding: "10px 16px" }}>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    ⚠️ Observational only — preferences are never treated as execution rules. Minimum {8} trades per sub-group, confidence threshold 65% required for adoption.
                  </div>
                </Card>
              </>
            );
          })()}
        </div>
      )}

      {/* ── Tab: Drift Detection ── */}
      {tab === "drift" && (
        <div>
          {driftQ.isLoading && <div style={{ color: "#64748b", padding: 40, textAlign: "center" }}>Running drift analysis…</div>}
          {driftQ.data && (() => {
            const d = driftQ.data;
            return (
              <>
                {/* Overview */}
                <Card style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: d.hasActiveDrift ? "#ef4444" : "#34d399" }}>
                        {d.hasActiveDrift ? "⚠ Active Drift Detected" : "✓ No Significant Drift"}
                      </h2>
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>Sample size: {d.sampleSize} trades</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: d.hasActiveDrift ? "#f97316" : "#34d399" }}>
                        {d.overallDriftScore.toFixed(0)}
                      </div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>Drift Score</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>{d.driftSummary}</p>
                </Card>

                {/* Events */}
                {d.driftEvents.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {d.driftEvents.map((e, i) => (
                      <Card key={i}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <Badge label={e.driftSeverity.toUpperCase()} color={driftSeverityColor(e.driftSeverity)} />
                              <Badge label={e.driftType.replace(/_/g, " ")} color="#475569" />
                              {e.isStatisticallySignificant && <Badge label="Statistically Significant" color="#f97316" />}
                            </div>
                            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{e.dimension}</h3>
                          </div>
                          <div style={{ textAlign: "right", fontSize: 11, color: "#64748b" }}>
                            <div>Drift Score: <span style={{ color: driftSeverityColor(e.driftSeverity), fontWeight: 700 }}>{e.driftScore.toFixed(0)}</span></div>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center", marginBottom: 10, padding: "8px 12px", background: "#1e293b", borderRadius: 6 }}>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 11, color: "#64748b" }}>Before ({e.sampleSizeBefore} trades)</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: "#94a3b8" }}>{e.previousValue}</div>
                          </div>
                          <div style={{ fontSize: 18, color: "#f97316" }}>→</div>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 11, color: "#64748b" }}>After ({e.sampleSizeAfter} trades)</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>{e.currentValue}</div>
                          </div>
                        </div>
                        <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>{e.description}</p>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                          Change: {e.changePercent > 0 ? "+" : ""}{e.changePercent.toFixed(1)}%
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card style={{ padding: 40, textAlign: "center" }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
                    <div style={{ color: "#64748b", fontSize: 13 }}>
                      {d.sampleSize < 20
                        ? "Insufficient trade history for drift analysis. Need at least 20 trades."
                        : "No drift events detected. Trading behaviour is consistent with the identity baseline."}
                    </div>
                  </Card>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ── Tab: Identity Timeline ── */}
      {tab === "history" && (
        <Card>
          <SectionTitle>Identity Version Timeline</SectionTitle>
          {historyQ.isLoading && <div style={{ color: "#64748b", fontSize: 12, padding: 20, textAlign: "center" }}>Loading…</div>}
          {historyQ.data && (() => {
            const versions = (historyQ.data as { versions: Array<{ versionId: string; versionTag: string; stage: string; sampleSize: number; confidence: string; event: string; summary: string; createdAt: string }> }).versions;
            return versions.length === 0 ? (
              <div style={{ color: "#64748b", fontSize: 12, padding: 20, textAlign: "center" }}>No identity versions recorded yet. Load the Identity Profile tab to create the first version.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {versions.map((v, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center", padding: "10px 14px", background: "#1e293b", borderRadius: 8 }}>
                    <div style={{ textAlign: "center" }}>
                      <Badge label={`v${v.versionTag}`} color="#6366f1" />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{v.summary ?? `Stage: ${v.stage}`}</div>
                      <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                        {v.sampleSize} trades · Confidence {Number(v.confidence).toFixed(0)}% · {new Date(v.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <Badge label={v.event} color="#475569" />
                  </div>
                ))}
              </div>
            );
          })()}
        </Card>
      )}

      {/* ── Tab: Full Report ── */}
      {tab === "report" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {report && (
            <>
              {/* Summary */}
              <Card style={{ gridColumn: "1 / -1" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>Trader Identity Engine Report</h2>
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: "#64748b" }}>Generated {new Date(report.generatedAt).toLocaleString()} · v{report.version}</p>
                  </div>
                  <Badge label={report.stageLabel} color="#a78bfa" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
                  {[
                    { label: "Sample Size", value: report.sampleSize, color: "#3b82f6" },
                    { label: "Confidence", value: `${report.confidenceScore.toFixed(0)}%`, color: "#a78bfa" },
                    { label: "Win Rate", value: `${(report.performance.overallWinRate * 100).toFixed(1)}%`, color: "#34d399" },
                    { label: "Avg R:R", value: report.performance.overallAvgRr.toFixed(2), color: "#f59e0b" },
                    { label: "Profit Factor", value: report.performance.overallPf > 99 ? "∞" : report.performance.overallPf.toFixed(2), color: "#10b981" },
                  ].map(m => (
                    <div key={m.label} style={{ textAlign: "center", padding: "12px 8px", background: "#1e293b", borderRadius: 8 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: m.color }}>{m.value}</div>
                      <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Preferences */}
              <Card>
                <SectionTitle>Discovered Preferences</SectionTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { label: "Preferred Pairs", value: report.preferences.preferredPairs.join(", ") || "None yet" },
                    { label: "Preferred Sessions", value: report.preferences.preferredSessions.join(", ") || "None yet" },
                    { label: "Preferred Regimes", value: report.preferences.preferredRegimes.join(", ") || "None yet" },
                    { label: "Preferred Volatility", value: report.preferences.preferredVolatility ?? "None yet" },
                    { label: "Preferred Trend", value: report.preferences.preferredTrend ?? "None yet" },
                    { label: "Significant Discoveries", value: `${report.preferences.significantCount} / ${report.preferences.totalDiscovered}` },
                  ].map(f => (
                    <div key={f.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: "1px solid #1e293b" }}>
                      <span style={{ color: "#64748b" }}>{f.label}</span>
                      <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{f.value}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Consistency Stats */}
              <Card>
                <SectionTitle>Strategy Consistency</SectionTitle>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Average Identity Similarity</div>
                  <ScoreBar score={report.consistencyStats.avgIdentitySimilarity ?? 0} />
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>Consistency Breakdown ({report.consistencyStats.reportsAnalyzed} reports)</div>
                {Object.entries(report.consistencyStats.consistencyBreakdown).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "1px solid #1e293b" }}>
                    <span style={{ color: consistencyColor(k) }}>{k.replace(/_/g, " ")}</span>
                    <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{v as number}</span>
                  </div>
                ))}
                {Object.keys(report.consistencyStats.consistencyBreakdown).length === 0 && (
                  <div style={{ color: "#64748b", fontSize: 12, padding: "10px 0" }}>No evaluations yet — run similarity analysis from the Similarity Score tab.</div>
                )}
              </Card>

              {/* Drift summary */}
              <Card style={{ gridColumn: "1 / -1" }}>
                <SectionTitle>Drift Status</SectionTitle>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                  {[
                    { label: "Active Drift", value: report.drift.hasActiveDrift ? "YES" : "NO", color: report.drift.hasActiveDrift ? "#ef4444" : "#34d399" },
                    { label: "Drift Score", value: report.drift.overallDriftScore.toFixed(0), color: "#f97316" },
                    { label: "Total Events", value: report.drift.eventCount, color: "#94a3b8" },
                    { label: "Significant", value: report.drift.significantEvents, color: "#f97316" },
                  ].map(m => (
                    <div key={m.label} style={{ textAlign: "center", padding: "12px 8px", background: "#1e293b", borderRadius: 8 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: m.color }}>{m.value}</div>
                      <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 12 }}>{report.drift.summary}</p>
              </Card>
            </>
          )}
          {!report && (
            <div style={{ gridColumn: "1 / -1", padding: 40, textAlign: "center", color: "#64748b" }}>Loading report…</div>
          )}
        </div>
      )}
    </div>
  );
}
