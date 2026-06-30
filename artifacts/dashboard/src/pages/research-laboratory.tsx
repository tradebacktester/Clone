// ─── Autonomous Research & Self-Evolution Laboratory Dashboard ────────────────
// Sandboxed research environment. Advisory only.
// Production KRYTOS is never touched here.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API = "/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  projectId: string; title: string; description: string; objective: string;
  weaknessTarget: string; status: string; priority: string;
  hypothesisCount: number; experimentCount: number; createdAt: string;
}

interface Hypothesis {
  hypothesisId: string; projectId: string; title: string; description: string;
  rationale: string; hypothesisType: string; targetComponent: string;
  expectedImprovement: string; confidenceScore: string; status: string; createdAt: string;
}

interface Experiment {
  experimentId: string; name: string; description: string;
  parentVersion: string; strategyVersion: string;
  status: string; approvalStatus: string; deploymentStatus: string;
  statisticalConfidence: string | null;
  validationResults: Record<string, unknown> | null;
  isSandboxed: boolean; createdAt: string;
}

interface CodeChange {
  changeId: string; experimentId: string; changeType: string; targetModule: string;
  changeTitle: string; description: string; rationale: string;
  linesAdded: number; linesRemoved: number; testsPassed: boolean;
  staticAnalysis: boolean; securityCheck: boolean; perfBenchmark: boolean;
  pseudoCode: string | null; createdAt: string;
}

interface Comparison {
  comparisonId: string; experimentId: string; productionVersion: string;
  experimentVersion: string; sampleSize: number; testPeriodDays: number;
  prodWinRate: string; prodAvgRr: string; prodProfitFactor: string; prodSharpe: string;
  expWinRate: string; expAvgRr: string; expProfitFactor: string; expSharpe: string;
  isStatSignificant: boolean; overallVerdict: string; verdictScore: string;
  summary: string; createdAt: string;
}

interface Recommendation {
  recommendationId: string; experimentId: string; title: string; summary: string;
  performanceSummary: string; riskAssessment: string;
  statisticalSignificance: string; confidenceScore: string;
  validationEvidence: string[]; potentialDrawbacks: string[];
  rollbackPlan: string; recommendationType: string; status: string; createdAt: string;
}

interface ApprovalQueueItem {
  queueId: string; recommendationId: string; experimentId: string;
  title: string; summary: string; priority: string;
  requestedAt: string; decidedAt: string | null; decision: string | null;
  decisionReason: string | null; status: string; expiresAt: string | null;
}

interface Weakness {
  id: string; category: string; title: string; description: string;
  severity: string; metric: string; currentValue: number; targetValue: number;
  evidence: string[];
}

interface Statistics {
  totalProjects: number; totalExperiments: number; totalHypotheses: number;
  pendingApprovals: number; totalRecommendations: number;
  deployedVersions: number; historyEvents: number;
}

interface ValidationStage {
  stage: string; passed: boolean; score: number; sampleSize: number; summary: string;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function statusColor(s: string): string {
  const m: Record<string, string> = {
    active: "#3b82f6", completed: "#34d399", failed: "#ef4444", paused: "#f59e0b",
    archived: "#64748b", running: "#3b82f6", building: "#6366f1", validating: "#f59e0b",
    pending: "#f59e0b", approved: "#34d399", rejected: "#ef4444", decided: "#64748b",
    superior: "#a78bfa", equivalent: "#94a3b8", inferior: "#ef4444",
    deploy: "#a78bfa", continue_testing: "#3b82f6", archive: "#64748b", rollback: "#ef4444",
  };
  return m[s] ?? "#94a3b8";
}

function priorityColor(p: string): string {
  const m: Record<string, string> = { critical: "#ef4444", high: "#f97316", medium: "#facc15", low: "#34d399" };
  return m[p] ?? "#94a3b8";
}

function severityColor(s: string): string { return priorityColor(s); }

function scoreColor(n: number): string {
  if (n >= 80) return "#a78bfa";
  if (n >= 65) return "#34d399";
  if (n >= 50) return "#facc15";
  return "#ef4444";
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: 18, ...style }}>{children}</div>;
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
      {label}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>{children}</h3>;
}

function ScoreBar({ score, color }: { score: number; color?: string }) {
  const c = color ?? scoreColor(score);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: "#1e293b", borderRadius: 3 }}>
        <div style={{ width: `${Math.min(score, 100)}%`, height: "100%", background: c, borderRadius: 3, transition: "width .4s" }} />
      </div>
      <span style={{ color: c, fontWeight: 700, fontSize: 11, minWidth: 32, textAlign: "right" }}>{score.toFixed(0)}</span>
    </div>
  );
}

function CheckBadge({ pass }: { pass: boolean }) {
  return <span style={{ color: pass ? "#34d399" : "#ef4444", fontSize: 13 }}>{pass ? "✓" : "✗"}</span>;
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 13 }}>{text}</div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "overview" | "projects" | "experiments" | "validation" | "comparisons" | "approval" | "history" | "weaknesses";

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "overview",    label: "Overview",          emoji: "🧬" },
  { id: "weaknesses",  label: "Weakness Analysis",  emoji: "🔍" },
  { id: "projects",    label: "Research Projects",  emoji: "📁" },
  { id: "experiments", label: "Experiments",        emoji: "⚗️" },
  { id: "validation",  label: "Validation Pipeline",emoji: "✅" },
  { id: "comparisons", label: "Comparisons",        emoji: "📊" },
  { id: "approval",    label: "Approval Queue",     emoji: "⏳" },
  { id: "history",     label: "Research History",   emoji: "📜" },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ResearchLaboratoryPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [approvalReason, setApprovalReason] = useState("");
  const queryClient = useQueryClient();

  const statsQ = useQuery<Statistics>({
    queryKey: ["rl-statistics"],
    queryFn:  () => fetch(`${API}/research/statistics`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const projectsQ = useQuery<{ projects: Project[]; count: number }>({
    queryKey: ["rl-projects"],
    queryFn:  () => fetch(`${API}/research/projects`).then(r => r.json()),
    enabled:  tab === "projects" || tab === "overview",
  });

  const experimentsQ = useQuery<{ experiments: Experiment[]; count: number }>({
    queryKey: ["rl-experiments"],
    queryFn:  () => fetch(`${API}/research/experiments`).then(r => r.json()),
    enabled:  tab === "experiments" || tab === "overview" || tab === "validation",
  });

  const comparisonsQ = useQuery<{ comparisons: Comparison[]; count: number }>({
    queryKey: ["rl-comparisons"],
    queryFn:  () => fetch(`${API}/research/comparisons`).then(r => r.json()),
    enabled:  tab === "comparisons",
  });

  const approvalQ = useQuery<{ queue: ApprovalQueueItem[]; pendingCount: number; count: number }>({
    queryKey: ["rl-approval-queue"],
    queryFn:  () => fetch(`${API}/research/approval-queue`).then(r => r.json()),
    enabled:  tab === "approval" || tab === "overview",
    refetchInterval: 15000,
  });

  const recsQ = useQuery<{ recommendations: Recommendation[]; count: number }>({
    queryKey: ["rl-recommendations"],
    queryFn:  () => fetch(`${API}/research/recommendations`).then(r => r.json()),
    enabled:  tab === "approval",
  });

  const historyQ = useQuery<{ history: Array<{ historyId: string; eventType: string; entityType: string; title: string; description: string; createdAt: string }> }>({
    queryKey: ["rl-history"],
    queryFn:  () => fetch(`${API}/research/history`).then(r => r.json()),
    enabled:  tab === "history",
  });

  const weaknessQ = useQuery<{ weaknesses: Weakness[]; count: number; sampleSize: number }>({
    queryKey: ["rl-weaknesses"],
    queryFn:  () => fetch(`${API}/research/weaknesses`).then(r => r.json()),
    enabled:  tab === "weaknesses" || tab === "overview",
  });

  const runCycleMut = useMutation({
    mutationFn: () => fetch(`${API}/research/run-cycle`, { method: "POST" }).then(r => r.json()),
    onSuccess:  () => {
      queryClient.invalidateQueries({ queryKey: ["rl-statistics"] });
      queryClient.invalidateQueries({ queryKey: ["rl-projects"] });
      queryClient.invalidateQueries({ queryKey: ["rl-experiments"] });
      queryClient.invalidateQueries({ queryKey: ["rl-approval-queue"] });
      queryClient.invalidateQueries({ queryKey: ["rl-recommendations"] });
    },
  });

  const approveMut = useMutation({
    mutationFn: (queueId: string) =>
      fetch(`${API}/research/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId, reason: approvalReason }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rl-approval-queue"] });
      queryClient.invalidateQueries({ queryKey: ["rl-statistics"] });
      setApprovalReason("");
    },
  });

  const rejectMut = useMutation({
    mutationFn: ({ queueId, decision }: { queueId: string; decision: string }) =>
      fetch(`${API}/research/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId, decision, reason: approvalReason }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rl-approval-queue"] });
      queryClient.invalidateQueries({ queryKey: ["rl-statistics"] });
      setApprovalReason("");
    },
  });

  const stats        = statsQ.data;
  const pendingQueue = (approvalQ.data?.queue ?? []).filter(q => q.status === "pending");
  const latestCycle  = runCycleMut.data as { cycle?: { validationPassed?: boolean; overallVerdict?: string; recommendationType?: string; weaknessesDetected?: number } } | undefined;

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: "#020617", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: "#1e1b4b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🧬</div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Research &amp; Self-Evolution Laboratory</h1>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Autonomous research sandbox · Production KRYTOS is never modified</p>
            </div>
          </div>
          <button
            onClick={() => runCycleMut.mutate()}
            disabled={runCycleMut.isPending}
            style={{ padding: "10px 20px", background: runCycleMut.isPending ? "#1e293b" : "#7c3aed", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            {runCycleMut.isPending ? "🔬 Running Cycle…" : "🔬 Run Research Cycle"}
          </button>
        </div>

        {/* Isolation warning */}
        <div style={{ marginTop: 12, padding: "8px 14px", background: "#0c1a0c", border: "1px solid #16a34a44", borderRadius: 6, fontSize: 11, color: "#4ade80" }}>
          🔒 SANDBOXED RESEARCH ENVIRONMENT — All experiments are isolated. No production code or trades are modified. Human approval required for any deployment.
        </div>

        {/* Last cycle result */}
        {latestCycle?.cycle && (
          <div style={{ marginTop: 10, padding: "8px 14px", background: "#0f172a", border: "1px solid #334155", borderRadius: 6, fontSize: 12, color: "#94a3b8" }}>
            Last cycle: {latestCycle.cycle.weaknessesDetected} weaknesses detected · Validation {latestCycle.cycle.validationPassed ? "✓ PASSED" : "✗ FAILED"} · Verdict: <span style={{ color: statusColor(latestCycle.cycle.overallVerdict ?? "") }}>{latestCycle.cycle.overallVerdict}</span> · Recommendation: <span style={{ color: statusColor(latestCycle.cycle.recommendationType ?? "") }}>{latestCycle.cycle.recommendationType?.replace(/_/g, " ")}</span>
          </div>
        )}

        {/* Stats bar */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 10, marginTop: 14 }}>
          {[
            { label: "Projects", value: stats?.totalProjects ?? "—" },
            { label: "Hypotheses", value: stats?.totalHypotheses ?? "—" },
            { label: "Experiments", value: stats?.totalExperiments ?? "—" },
            { label: "Recommendations", value: stats?.totalRecommendations ?? "—" },
            { label: "Pending Approvals", value: stats?.pendingApprovals ?? "—", alert: (stats?.pendingApprovals ?? 0) > 0 },
            { label: "Deployed", value: stats?.deployedVersions ?? "—" },
            { label: "History Events", value: stats?.historyEvents ?? "—" },
          ].map(s => (
            <Card key={s.label} style={{ padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: ("alert" in s && s.alert) ? "#f97316" : "#a78bfa" }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{s.label}</div>
            </Card>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 3, marginBottom: 18, borderBottom: "1px solid #1e293b", overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "7px 14px", borderRadius: "6px 6px 0 0", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
            background: tab === t.id ? "#1e293b" : "transparent",
            color:      tab === t.id ? "#a78bfa" : "#64748b",
            borderBottom: tab === t.id ? "2px solid #a78bfa" : "2px solid transparent",
          }}>{t.emoji} {t.label}</button>
        ))}
      </div>

      {/* ── Tab: Overview ── */}
      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Active projects */}
          <Card>
            <SectionTitle>Active Research Projects</SectionTitle>
            {(projectsQ.data?.projects ?? []).filter(p => p.status === "active" || p.status === "completed").slice(0, 5).map((p, i) => (
              <div key={i} style={{ padding: "10px 12px", background: "#1e293b", borderRadius: 8, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{p.title}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <Badge label={p.status} color={statusColor(p.status)} />
                    <Badge label={p.priority} color={priorityColor(p.priority)} />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{p.hypothesisCount} hypotheses · {p.experimentCount} experiments</div>
              </div>
            ))}
            {(projectsQ.data?.projects ?? []).length === 0 && (
              <Empty icon="📁" text="No research projects yet. Click 'Run Research Cycle' to start." />
            )}
          </Card>

          {/* Pending approvals */}
          <Card>
            <SectionTitle>Pending Approvals ({pendingQueue.length})</SectionTitle>
            {pendingQueue.slice(0, 4).map((q, i) => (
              <div key={i} style={{ padding: "10px 12px", background: "#1e293b", borderRadius: 8, marginBottom: 8, border: `1px solid ${priorityColor(q.priority)}33` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>{q.title.slice(0, 55)}{q.title.length > 55 ? "…" : ""}</span>
                  <Badge label={q.priority} color={priorityColor(q.priority)} />
                </div>
                <div style={{ fontSize: 10, color: "#64748b" }}>{new Date(q.requestedAt).toLocaleString()}</div>
              </div>
            ))}
            {pendingQueue.length === 0 && <Empty icon="✅" text="No pending approvals." />}
          </Card>

          {/* Weakness summary */}
          <Card>
            <SectionTitle>Detected Weaknesses ({weaknessQ.data?.count ?? 0})</SectionTitle>
            {(weaknessQ.data?.weaknesses ?? []).slice(0, 5).map((w, i) => (
              <div key={i} style={{ padding: "8px 10px", background: "#1e293b", borderRadius: 6, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{w.title}</div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>{w.category.replace(/_/g, " ")} · current: {w.currentValue < 1 ? `${(w.currentValue * 100).toFixed(1)}%` : w.currentValue.toFixed(2)}</div>
                </div>
                <Badge label={w.severity} color={severityColor(w.severity)} />
              </div>
            ))}
            {!weaknessQ.data && <Empty icon="🔍" text="Click 'Weakness Analysis' tab to run analysis." />}
          </Card>

          {/* Pipeline architecture */}
          <Card>
            <SectionTitle>Self-Evolution Pipeline</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                "1. Observe Live Performance", "2. Detect Weakness", "3. Generate Hypothesis",
                "4. Modify Research Code", "5. Build Experimental Strategy", "6. Offline Training",
                "7. Historical Backtest", "8. Walk-Forward Validation", "9. Monte Carlo Simulation",
                "10. Sensitivity Analysis", "11. Cross-Pair Validation", "12. Paper Trading Simulation",
                "13. Compare with Production", "14. Generate Evidence", "15. Deployment Recommendation",
                "16. Request Human Approval", "17. → If Approved: Deploy New Production Version",
              ].map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", background: i === 16 ? "#1e1b4b" : "#1e293b", borderRadius: 4 }}>
                  <span style={{ fontSize: 10, color: i === 16 ? "#a78bfa" : "#64748b" }}>{step}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ── Tab: Weakness Analysis ── */}
      {tab === "weaknesses" && (
        <div>
          {weaknessQ.isLoading && <div style={{ color: "#64748b", textAlign: "center", padding: 40 }}>Analyzing performance data…</div>}
          {weaknessQ.data && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: "#94a3b8" }}>
                  Analyzed <strong style={{ color: "#e2e8f0" }}>{weaknessQ.data.sampleSize}</strong> historical trades — found <strong style={{ color: weaknessQ.data.count > 0 ? "#f97316" : "#34d399" }}>{weaknessQ.data.count}</strong> weakness{weaknessQ.data.count !== 1 ? "es" : ""}
                </div>
              </div>
              {weaknessQ.data.weaknesses.length === 0 ? (
                <Card style={{ padding: 40, textAlign: "center" }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                  <div style={{ color: "#34d399", fontSize: 14, fontWeight: 700 }}>No Weaknesses Detected</div>
                  <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>All key metrics are within target ranges. Run more trades to refine analysis.</div>
                </Card>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {weaknessQ.data.weaknesses.map((w, i) => (
                    <Card key={i}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <Badge label={w.severity.toUpperCase()} color={severityColor(w.severity)} />
                            <Badge label={w.category.replace(/_/g, " ")} color="#475569" />
                          </div>
                          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>{w.title}</h3>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 20, fontWeight: 800, color: severityColor(w.severity) }}>
                            {w.currentValue < 1 ? `${(w.currentValue * 100).toFixed(1)}%` : w.currentValue.toFixed(2)}
                          </div>
                          <div style={{ fontSize: 10, color: "#64748b" }}>
                            Target: {w.targetValue < 1 ? `${(w.targetValue * 100).toFixed(1)}%` : w.targetValue.toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 12px" }}>{w.description}</p>
                      <div>
                        {w.evidence.map((e, j) => (
                          <div key={j} style={{ fontSize: 11, color: "#64748b", padding: "3px 8px", background: "#1e293b", borderRadius: 4, marginBottom: 4 }}>• {e}</div>
                        ))}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Tab: Research Projects ── */}
      {tab === "projects" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(projectsQ.data?.projects ?? []).length === 0 ? (
            <Empty icon="📁" text="No research projects. Click 'Run Research Cycle' to generate the first project automatically." />
          ) : (
            (projectsQ.data?.projects ?? []).map((p, i) => (
              <Card key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                      <Badge label={p.status} color={statusColor(p.status)} />
                      <Badge label={p.priority} color={priorityColor(p.priority)} />
                    </div>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{p.title}</h3>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Target: {p.weaknessTarget.replace(/_/g, " ")}</div>
                  </div>
                  <div style={{ fontSize: 10, color: "#64748b", textAlign: "right" }}>
                    <div>{new Date(p.createdAt).toLocaleString()}</div>
                    <div>{p.hypothesisCount} hypotheses · {p.experimentCount} experiments</div>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 8px" }}>{p.description}</p>
                <div style={{ fontSize: 11, color: "#64748b", padding: "6px 10px", background: "#1e293b", borderRadius: 6 }}>
                  <strong>Objective:</strong> {p.objective.slice(0, 200)}{p.objective.length > 200 ? "…" : ""}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── Tab: Experiments ── */}
      {tab === "experiments" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(experimentsQ.data?.experiments ?? []).length === 0 ? (
            <Empty icon="⚗️" text="No experiments yet. Run a research cycle to generate the first experiment." />
          ) : (
            (experimentsQ.data?.experiments ?? []).map((e, i) => (
              <Card key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                      <Badge label={e.status} color={statusColor(e.status)} />
                      <Badge label={e.approvalStatus} color={statusColor(e.approvalStatus)} />
                      {e.isSandboxed && <Badge label="SANDBOXED" color="#34d399" />}
                    </div>
                    <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{e.name}</h3>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                      {e.parentVersion} → {e.strategyVersion}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 11, color: "#64748b" }}>
                    {e.statisticalConfidence !== null && (
                      <div style={{ fontSize: 16, fontWeight: 800, color: scoreColor(Number(e.statisticalConfidence)) }}>
                        {Number(e.statisticalConfidence).toFixed(0)}%
                      </div>
                    )}
                    <div>Confidence</div>
                    <div style={{ marginTop: 4 }}>{new Date(e.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 8px" }}>{e.description.slice(0, 180)}</p>
                <div style={{ fontSize: 11, color: "#64748b" }}><strong>Research Objective:</strong> {e.researchObjective.slice(0, 150)}</div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── Tab: Validation Pipeline ── */}
      {tab === "validation" && (
        <div>
          {(experimentsQ.data?.experiments ?? []).length === 0 ? (
            <Empty icon="✅" text="No experiments to validate. Run a research cycle first." />
          ) : (
            (experimentsQ.data?.experiments ?? []).slice(0, 3).map((exp, ei) => {
              const vr = exp.validationResults as { stages?: ValidationStage[]; passed?: boolean; overallScore?: number } | null;
              if (!vr?.stages) return null;
              return (
                <Card key={ei} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{exp.name.slice(0, 60)}</h3>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>v{exp.strategyVersion}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Badge label={vr.passed ? "ALL STAGES PASSED" : "PIPELINE FAILED"} color={vr.passed ? "#34d399" : "#ef4444"} />
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: scoreColor(vr.overallScore ?? 0) }}>{(vr.overallScore ?? 0).toFixed(0)}</div>
                        <div style={{ fontSize: 9, color: "#64748b" }}>Overall</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {vr.stages.map((s: ValidationStage, si: number) => (
                      <div key={si} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center", padding: "8px 12px", background: "#1e293b", borderRadius: 6 }}>
                        <CheckBadge pass={s.passed} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>
                            {s.stage.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                          </div>
                          {s.summary && <div style={{ fontSize: 10, color: "#64748b" }}>{s.summary.slice(0, 100)}</div>}
                        </div>
                        <div>
                          <ScoreBar score={s.score} />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ── Tab: Comparisons ── */}
      {tab === "comparisons" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(comparisonsQ.data?.comparisons ?? []).length === 0 ? (
            <Empty icon="📊" text="No comparisons yet. Run a research cycle to generate performance comparisons." />
          ) : (
            (comparisonsQ.data?.comparisons ?? []).map((c, i) => (
              <Card key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{c.productionVersion} → {c.experimentVersion}</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: statusColor(c.overallVerdict) }}>
                      {c.overallVerdict.toUpperCase()}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {c.isStatSignificant && <Badge label="Statistically Significant" color="#a78bfa" />}
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: scoreColor(Number(c.verdictScore)) }}>{Number(c.verdictScore).toFixed(0)}</div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>Verdict Score</div>
                    </div>
                  </div>
                </div>

                {/* Metric comparison table */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 6, marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>Metric</div>
                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textAlign: "center" }}>Production</div>
                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textAlign: "center" }}>Experimental</div>
                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textAlign: "center" }}>Delta</div>
                  {[
                    { label: "Win Rate", prod: (Number(c.prodWinRate) * 100).toFixed(1) + "%", exp: (Number(c.expWinRate) * 100).toFixed(1) + "%", delta: ((Number(c.expWinRate) - Number(c.prodWinRate)) * 100).toFixed(1) + "pp" },
                    { label: "Avg R:R",  prod: Number(c.prodAvgRr).toFixed(2),  exp: Number(c.expAvgRr).toFixed(2),  delta: (Number(c.expAvgRr) - Number(c.prodAvgRr)).toFixed(2) },
                    { label: "PF",       prod: Number(c.prodProfitFactor).toFixed(2), exp: Number(c.expProfitFactor).toFixed(2), delta: (Number(c.expProfitFactor) - Number(c.prodProfitFactor)).toFixed(2) },
                    { label: "Sharpe",   prod: Number(c.prodSharpe).toFixed(2),  exp: Number(c.expSharpe).toFixed(2),  delta: (Number(c.expSharpe) - Number(c.prodSharpe)).toFixed(2) },
                  ].map((row, ri) => {
                    const d = parseFloat(row.delta);
                    const col = d > 0 ? "#34d399" : d < 0 ? "#ef4444" : "#94a3b8";
                    return [
                      <div key={`${ri}-l`} style={{ fontSize: 12, color: "#94a3b8", padding: "5px 8px", background: "#1e293b", borderRadius: 4 }}>{row.label}</div>,
                      <div key={`${ri}-p`} style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "5px 8px", background: "#1e293b", borderRadius: 4 }}>{row.prod}</div>,
                      <div key={`${ri}-e`} style={{ fontSize: 12, color: "#e2e8f0", textAlign: "center", padding: "5px 8px", background: "#1e293b", borderRadius: 4 }}>{row.exp}</div>,
                      <div key={`${ri}-d`} style={{ fontSize: 12, color: col, fontWeight: 700, textAlign: "center", padding: "5px 8px", background: "#1e293b", borderRadius: 4 }}>{d > 0 ? "+" : ""}{row.delta}</div>,
                    ];
                  })}
                </div>
                <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>{c.summary}</p>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── Tab: Approval Queue ── */}
      {tab === "approval" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16 }}>
          <div>
            <SectionTitle>Pending Approvals ({pendingQueue.length})</SectionTitle>
            {pendingQueue.length === 0 ? (
              <Empty icon="✅" text="No pending approvals. All recommendations have been decided." />
            ) : (
              pendingQueue.map((q, i) => (
                <Card key={i} style={{ marginBottom: 12, border: `1px solid ${priorityColor(q.priority)}44` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                        <Badge label={`Priority: ${q.priority}`} color={priorityColor(q.priority)} />
                        <Badge label="PENDING APPROVAL" color="#f59e0b" />
                      </div>
                      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{q.title}</h3>
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b", textAlign: "right" }}>
                      <div>Requested: {new Date(q.requestedAt).toLocaleDateString()}</div>
                      {q.expiresAt && <div style={{ color: "#f59e0b" }}>Expires: {new Date(q.expiresAt).toLocaleDateString()}</div>}
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 12px", lineHeight: 1.6 }}>{q.summary.slice(0, 300)}</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => approveMut.mutate(q.queueId)}
                      disabled={approveMut.isPending || rejectMut.isPending}
                      style={{ flex: 1, padding: "8px 0", background: "#166534", border: "1px solid #16a34a", borderRadius: 6, color: "#4ade80", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                    >✓ Approve Deployment</button>
                    <button
                      onClick={() => rejectMut.mutate({ queueId: q.queueId, decision: "more_testing" })}
                      disabled={approveMut.isPending || rejectMut.isPending}
                      style={{ flex: 1, padding: "8px 0", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#94a3b8", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                    >🧪 More Testing</button>
                    <button
                      onClick={() => rejectMut.mutate({ queueId: q.queueId, decision: "rejected" })}
                      disabled={approveMut.isPending || rejectMut.isPending}
                      style={{ flex: 1, padding: "8px 0", background: "#2d0f0f", border: "1px solid #ef4444", borderRadius: 6, color: "#ef4444", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                    >✗ Reject</button>
                  </div>
                </Card>
              ))
            )}

            {/* Decided items */}
            {(approvalQ.data?.queue ?? []).filter(q => q.status === "decided").length > 0 && (
              <>
                <SectionTitle style={{ marginTop: 20 }}>Decided</SectionTitle>
                {(approvalQ.data?.queue ?? []).filter(q => q.status === "decided").slice(0, 5).map((q, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>{q.title.slice(0, 60)}</div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>{q.decisionReason?.slice(0, 80)}</div>
                    </div>
                    <Badge label={q.decision ?? "—"} color={statusColor(q.decision ?? "")} />
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Reason input */}
          <Card>
            <SectionTitle>Decision Reason (Optional)</SectionTitle>
            <textarea
              value={approvalReason}
              onChange={e => setApprovalReason(e.target.value)}
              placeholder="Enter your reason for approving or rejecting…"
              style={{ width: "100%", height: 140, padding: 10, background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0", fontSize: 12, resize: "vertical", boxSizing: "border-box" }}
            />

            {/* Latest recommendations */}
            <div style={{ marginTop: 16 }}>
              <SectionTitle>Latest Recommendations</SectionTitle>
              {(recsQ.data?.recommendations ?? []).slice(0, 4).map((r, i) => (
                <div key={i} style={{ padding: "8px 10px", background: "#1e293b", borderRadius: 6, marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <Badge label={r.recommendationType.replace(/_/g, " ")} color={statusColor(r.recommendationType)} />
                    <Badge label={r.status.replace(/_/g, " ")} color={statusColor(r.status.replace("pending_approval", "pending"))} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0" }}>{r.title.slice(0, 55)}</div>
                  <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>Confidence: {Number(r.confidenceScore).toFixed(0)}%</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12, padding: "8px 10px", background: "#0c1a0c", border: "1px solid #16a34a33", borderRadius: 6, fontSize: 10, color: "#4ade80" }}>
              Approving a recommendation authorizes deployment to the research environment only. A separate production deployment step with additional sign-off is always required.
            </div>
          </Card>
        </div>
      )}

      {/* ── Tab: Research History ── */}
      {tab === "history" && (
        <Card>
          <SectionTitle>Full Research Audit Log ({historyQ.data?.history.length ?? 0} events)</SectionTitle>
          {historyQ.isLoading && <div style={{ color: "#64748b", padding: 20, textAlign: "center" }}>Loading history…</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(historyQ.data?.history ?? []).map((h, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center", padding: "8px 12px", background: "#1e293b", borderRadius: 6 }}>
                <Badge label={h.eventType.replace(/_/g, " ")} color={statusColor(h.eventType.includes("reject") || h.eventType.includes("fail") ? "rejected" : h.eventType.includes("approv") ? "approved" : "active")} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{h.title}</div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>{h.description.slice(0, 100)}</div>
                </div>
                <div style={{ fontSize: 10, color: "#64748b", whiteSpace: "nowrap" }}>{new Date(h.createdAt).toLocaleString()}</div>
              </div>
            ))}
            {!historyQ.data?.history.length && !historyQ.isLoading && (
              <Empty icon="📜" text="No history events yet. Run a research cycle to start logging." />
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
