import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Brain, Link, Network, Activity, Search, Shield,
  BarChart3, TrendingUp, TrendingDown, Clock, Camera,
  FileText, Zap, AlertTriangle, CheckCircle, XCircle,
  ChevronRight, RefreshCw, Wrench, Target, Eye,
  BookOpen, Star, Calendar, Filter, ArrowUpDown,
} from "lucide-react";

// ─── API Helper ───────────────────────────────────────────────────────────────
async function api<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Experience {
  experienceId: string;
  tradeId: number | null;
  pair: string | null;
  direction: string | null;
  session: string | null;
  marketRegime: string | null;
  amdStage: string | null;
  outcome: string | null;
  dayOfWeek: string | null;
  volatility: string | null;
  htfBias: string | null;
  emotionTag: string | null;
  pnlPips: number | null;
  riskReward: number | null;
  durationMins: number | null;
  confidenceScore: number | null;
  liquidityScore: number | null;
  spreadPips: number | null;
  traderConfidence: number | null;
  hasContext: boolean;
  hasScreenshots: boolean;
  hasReview: boolean;
  hasLessons: boolean;
  screenshotCount: number;
  eventCount: number;
  relationshipCount: number;
  featureVector: number[];
  similarityMetadata: { nearestNeighbours: string[]; similarityScores: number[]; lastComputedAt: string | null };
  embeddingPlaceholder: { model: string | null; dims: string | null; computed: boolean; vectorId: string | null };
  integrityScore: number | null;
  brokenLinks: number;
  dataQualityNotes: string | null;
  tradeOpenedAt: string | null;
  tradeClosedAt: string | null;
  updatedAt: string;
  context?: Record<string, unknown> | null;
  screenshots?: Array<{ id: string; stage: string; thumbnailData: string | null; capturedAt: string | null }>;
  timeline?: Array<{ stage: string; title: string; description: string | null; occurredAt: string; type: string }>;
  relationships?: Array<{ relType: string; toType: string; toId: string }>;
  notes?: string | null;
  lessons?: string | null;
  reviewSummary?: string | null;
}

interface SearchResult { total: number; results: Experience[] }

interface HealthIssue {
  level: "critical" | "warning" | "info";
  category: string;
  message: string;
  count: number;
  repaired: boolean;
  repair?: string;
}

interface HealthReport {
  runAt: string;
  durationMs: number;
  overallHealth: "healthy" | "degraded" | "critical";
  dataQualityScore: number;
  issueCount: number;
  criticalCount: number;
  warningCount: number;
  issues: HealthIssue[];
  repaired: { orphans: number; experiences: number };
  recommendations: string[];
}

interface MemoryStats {
  totalExperiences: number;
  winningExperiences: number;
  losingExperiences: number;
  breakEvenExperiences: number;
  openExperiences: number;
  experiencesWithContext: number;
  experiencesWithScreenshots: number;
  experiencesWithReviews: number;
  experiencesWithLessons: number;
  avgDurationMins: number | null;
  avgRiskReward: number | null;
  avgPnlPips: number | null;
  avgScreenshotsPerTrade: number | null;
  totalScreenshots: number;
  totalEvents: number;
  totalRelationships: number;
  memoryGrowthRate: string;
  estimatedStorageMB: number;
  relationshipDensity: number;
  dataQualityScore: number;
  oldestExperience: string | null;
  newestExperience: string | null;
  byPair: Record<string, number>;
  byOutcome: Record<string, number>;
  bySession: Record<string, number>;
  byRegime: Record<string, number>;
  byEmotion: Record<string, number>;
}

type Tab = "explorer" | "detail" | "graph" | "statistics" | "health";

// ─── Shared UI Components ─────────────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="text-slate-500 text-xs">—</span>;
  const map: Record<string, string> = {
    win:        "bg-emerald-400/15 text-emerald-400 border-emerald-400/30",
    loss:       "bg-red-400/15 text-red-400 border-red-400/30",
    break_even: "bg-amber-400/15 text-amber-400 border-amber-400/30",
    open:       "bg-sky-400/15 text-sky-400 border-sky-400/30",
  };
  const cls = map[outcome] ?? "bg-slate-400/15 text-slate-400 border-slate-400/30";
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${cls}`}>
      {outcome === "break_even" ? "B/E" : outcome}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: string | null }) {
  if (!direction) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${direction === "long" ? "text-emerald-400 bg-emerald-400/10" : "text-red-400 bg-red-400/10"}`}>
      {direction === "long" ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {direction.toUpperCase()}
    </span>
  );
}

function PnlBadge({ pips }: { pips: number | null }) {
  if (pips == null) return <span className="text-slate-500 text-xs">—</span>;
  const color = pips > 0 ? "text-emerald-400" : pips < 0 ? "text-red-400" : "text-amber-400";
  return <span className={`text-sm font-bold ${color}`}>{pips > 0 ? "+" : ""}{pips.toFixed(1)}p</span>;
}

function CompletenessIcons({ exp }: { exp: Experience }) {
  return (
    <div className="flex gap-1">
      <span title="Context"   className={`text-[10px] ${exp.hasContext     ? "text-emerald-400" : "text-slate-600"}`}>CTX</span>
      <span title="Screenshots" className={`text-[10px] ${exp.hasScreenshots? "text-emerald-400" : "text-slate-600"}`}>IMG</span>
      <span title="Review"    className={`text-[10px] ${exp.hasReview     ? "text-emerald-400" : "text-slate-600"}`}>REV</span>
      <span title="Lessons"   className={`text-[10px] ${exp.hasLessons    ? "text-emerald-400" : "text-slate-600"}`}>LSN</span>
    </div>
  );
}

// ─── Tab: Experience Explorer ─────────────────────────────────────────────────
interface ExplorerFilters {
  pair: string;
  session: string;
  outcome: string;
  direction: string;
  marketRegime: string;
  hasScreenshots: string;
  hasReview: string;
  hasLessons: string;
  orderBy: string;
  limit: string;
}

const INIT_FILTERS: ExplorerFilters = {
  pair: "", session: "", outcome: "", direction: "",
  marketRegime: "", hasScreenshots: "", hasReview: "", hasLessons: "",
  orderBy: "newest", limit: "50",
};

function ExplorerTab({ onSelect }: { onSelect: (exp: Experience) => void }) {
  const [filters, setFilters] = useState<ExplorerFilters>(INIT_FILTERS);
  const [applied, setApplied] = useState<ExplorerFilters>(INIT_FILTERS);

  const buildQS = (f: ExplorerFilters) => {
    const p = new URLSearchParams();
    if (f.pair)           p.set("pair", f.pair);
    if (f.session)        p.set("session", f.session);
    if (f.outcome)        p.set("outcome", f.outcome);
    if (f.direction)      p.set("direction", f.direction);
    if (f.marketRegime)   p.set("marketRegime", f.marketRegime);
    if (f.hasScreenshots) p.set("hasScreenshots", f.hasScreenshots);
    if (f.hasReview)      p.set("hasReview", f.hasReview);
    if (f.hasLessons)     p.set("hasLessons", f.hasLessons);
    p.set("orderBy", f.orderBy);
    p.set("limit",   f.limit);
    return p.toString();
  };

  const { data, isLoading, error, refetch } = useQuery<SearchResult>({
    queryKey: ["experiences", applied],
    queryFn:  () => api(`/memory/experiences?${buildQS(applied)}`),
  });

  const setF = (k: keyof ExplorerFilters, v: string) => setFilters(p => ({ ...p, [k]: v }));

  const selClass = "bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-sky-500";

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={12} className="text-slate-400" />
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Filters</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          <select className={selClass} value={filters.pair}       onChange={e => setF("pair",       e.target.value)}>
            <option value="">All Pairs</option>
            <option value="EUR/USD">EUR/USD</option>
            <option value="GBP/USD">GBP/USD</option>
            <option value="USD/JPY">USD/JPY</option>
          </select>
          <select className={selClass} value={filters.session}    onChange={e => setF("session",    e.target.value)}>
            <option value="">All Sessions</option>
            <option value="london">London</option>
            <option value="new_york">New York</option>
            <option value="asian">Asian</option>
          </select>
          <select className={selClass} value={filters.outcome}    onChange={e => setF("outcome",    e.target.value)}>
            <option value="">All Outcomes</option>
            <option value="win">Win</option>
            <option value="loss">Loss</option>
            <option value="break_even">Break Even</option>
            <option value="open">Open</option>
          </select>
          <select className={selClass} value={filters.direction}  onChange={e => setF("direction",  e.target.value)}>
            <option value="">All Directions</option>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
          <select className={selClass} value={filters.marketRegime} onChange={e => setF("marketRegime", e.target.value)}>
            <option value="">All Regimes</option>
            <option value="trending">Trending</option>
            <option value="ranging">Ranging</option>
            <option value="volatile">Volatile</option>
            <option value="low_volatility">Low Volatility</option>
          </select>
          <select className={selClass} value={filters.hasScreenshots} onChange={e => setF("hasScreenshots", e.target.value)}>
            <option value="">Screenshots</option>
            <option value="true">Has Screenshots</option>
            <option value="false">No Screenshots</option>
          </select>
          <select className={selClass} value={filters.orderBy}    onChange={e => setF("orderBy",    e.target.value)}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="pnl_desc">Best P&L</option>
            <option value="pnl_asc">Worst P&L</option>
            <option value="rr_desc">Best R:R</option>
          </select>
          <div className="flex gap-1">
            <button
              onClick={() => setApplied({ ...filters })}
              className="flex-1 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded px-2 py-1 font-medium transition-colors"
            >
              Apply
            </button>
            <button
              onClick={() => { setFilters(INIT_FILTERS); setApplied(INIT_FILTERS); }}
              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {isLoading && <div className="text-slate-400 text-sm text-center py-8">Loading experiences…</div>}
      {error   && <div className="text-red-400 text-sm text-center py-4">Failed to load experiences</div>}
      {data && (
        <>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-400">{data.total} experience{data.total !== 1 ? "s" : ""}</span>
            <button onClick={() => refetch()} className="text-slate-500 hover:text-slate-300 transition-colors"><RefreshCw size={12} /></button>
          </div>
          {data.results.length === 0 && (
            <div className="text-slate-500 text-sm text-center py-12 border border-dashed border-slate-700 rounded-lg">
              No experiences match these filters
            </div>
          )}
          <div className="space-y-2">
            {data.results.map(exp => (
              <div
                key={exp.experienceId}
                className="bg-slate-900/60 border border-slate-700/50 rounded-lg px-4 py-3 hover:border-sky-500/40 transition-colors cursor-pointer group"
                onClick={() => onSelect(exp)}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-bold text-slate-200">{exp.pair ?? "—"}</span>
                    <DirectionBadge direction={exp.direction} />
                    <OutcomeBadge outcome={exp.outcome} />
                    <span className="text-xs text-slate-500 hidden sm:inline">{exp.session ?? "—"}</span>
                    <span className="text-xs text-slate-600 hidden md:inline">{exp.marketRegime ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <PnlBadge pips={exp.pnlPips} />
                    {exp.riskReward != null && (
                      <span className="text-xs text-slate-400 hidden sm:inline">{exp.riskReward.toFixed(2)}R</span>
                    )}
                    {exp.durationMins != null && (
                      <span className="text-xs text-slate-500 hidden md:inline">
                        <Clock size={10} className="inline mr-0.5" />{exp.durationMins}m
                      </span>
                    )}
                    <CompletenessIcons exp={exp} />
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-600">{exp.relationshipCount} links</span>
                      <ChevronRight size={12} className="text-slate-600 group-hover:text-sky-400 transition-colors" />
                    </div>
                  </div>
                </div>
                {exp.dataQualityNotes && (
                  <p className="text-[10px] text-amber-500/70 mt-1">{exp.dataQualityNotes}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tab: Experience Detail ───────────────────────────────────────────────────
function DetailTab({ selectedExp }: { selectedExp: Experience | null }) {
  const [tradeIdInput, setTradeIdInput] = useState("");
  const [lookupId, setLookupId]         = useState<string | null>(null);

  const { data: exp, isLoading, error } = useQuery<Experience>({
    queryKey: ["exp-detail", lookupId ?? selectedExp?.experienceId],
    queryFn:  () => api(`/memory/experience/${lookupId ?? selectedExp?.experienceId}`),
    enabled:  !!(lookupId || selectedExp?.experienceId),
  });

  const current = exp ?? selectedExp;
  if (!current && !lookupId) {
    return (
      <div className="space-y-4">
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-4">
          <p className="text-sm text-slate-400 mb-3">Select an experience from the Explorer or look up by Trade ID</p>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Trade ID…"
              value={tradeIdInput}
              onChange={e => setTradeIdInput(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500 w-36"
            />
            <button
              onClick={async () => {
                if (!tradeIdInput) return;
                const res = await api<Experience>(`/memory/experience/trade/${tradeIdInput}`);
                setLookupId(res.experienceId);
              }}
              className="bg-sky-600 hover:bg-sky-500 text-white text-sm rounded px-3 py-1.5 font-medium transition-colors"
            >
              Load
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="text-slate-400 text-sm text-center py-8">Loading experience…</div>;
  if (error)     return <div className="text-red-400 text-sm text-center py-4">Failed to load experience</div>;

  const display = current!;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg font-bold text-slate-100">{display.pair ?? "Unknown Pair"}</span>
              <DirectionBadge direction={display.direction} />
              <OutcomeBadge outcome={display.outcome} />
            </div>
            <div className="text-xs text-slate-500">
              ID: <code className="font-mono text-slate-400">{display.experienceId}</code>
              {display.tradeId && <span className="ml-2">Trade #{display.tradeId}</span>}
            </div>
          </div>
          <div className="text-right">
            <CompletenessIcons exp={display} />
            {display.integrityScore != null && (
              <div className="mt-1">
                <span className="text-xs text-slate-500">Integrity: </span>
                <span className={`text-xs font-bold ${(display.integrityScore * 100) >= 70 ? "text-emerald-400" : (display.integrityScore * 100) >= 40 ? "text-amber-400" : "text-red-400"}`}>
                  {Math.round(display.integrityScore * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {[
          { label: "P&L", value: display.pnlPips != null ? `${display.pnlPips > 0 ? "+" : ""}${display.pnlPips.toFixed(1)}p` : "—", color: display.pnlPips && display.pnlPips > 0 ? "text-emerald-400" : display.pnlPips && display.pnlPips < 0 ? "text-red-400" : "text-slate-400" },
          { label: "R:R",      value: display.riskReward ? `${display.riskReward.toFixed(2)}R` : "—", color: "text-sky-400" },
          { label: "Duration", value: display.durationMins ? `${display.durationMins}m` : "—", color: "text-slate-300" },
          { label: "Session",  value: display.session ?? "—",  color: "text-purple-400" },
          { label: "Regime",   value: display.marketRegime ?? "—", color: "text-amber-400" },
          { label: "Confidence", value: display.traderConfidence ? `${display.traderConfidence}%` : "—", color: "text-slate-300" },
        ].map(m => (
          <div key={m.label} className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-2.5 text-center">
            <div className={`text-sm font-bold ${m.color}`}>{m.value}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      {display.timeline && display.timeline.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Timeline</h3>
          <div className="relative pl-4">
            <div className="absolute left-1 top-0 bottom-0 w-px bg-slate-700/50" />
            {display.timeline.map((event, i) => (
              <div key={i} className="relative mb-3 last:mb-0">
                <div className={`absolute -left-[13px] w-2 h-2 rounded-full border border-slate-700 ${
                  event.type === "engine"     ? "bg-sky-500" :
                  event.type === "screenshot" ? "bg-purple-500" :
                  event.type === "review"     ? "bg-emerald-500" : "bg-amber-500"
                }`} />
                <div className="ml-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-200">{event.title}</span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(event.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className={`text-[10px] px-1 rounded ${
                      event.type === "engine" ? "bg-sky-400/10 text-sky-400" :
                      event.type === "screenshot" ? "bg-purple-400/10 text-purple-400" :
                      event.type === "review" ? "bg-emerald-400/10 text-emerald-400" : "bg-amber-400/10 text-amber-400"
                    }`}>{event.type}</span>
                  </div>
                  {event.description && (
                    <p className="text-[11px] text-slate-500 mt-0.5">{event.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes / Lessons */}
      {(display.notes || display.lessons) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {display.notes && (
            <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <FileText size={11} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Notes</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{display.notes}</p>
            </div>
          )}
          {display.lessons && (
            <div className="bg-slate-900/60 border border-emerald-500/20 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <BookOpen size={11} className="text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Lessons</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{display.lessons}</p>
            </div>
          )}
        </div>
      )}

      {/* Feature Vector (AI placeholder) */}
      <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={12} className="text-amber-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Feature Vector</span>
          <span className="text-[9px] bg-amber-400/10 text-amber-400 px-1.5 py-0.5 rounded uppercase font-bold">AI Placeholder</span>
        </div>
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-1">
          {["P&L", "RR", "Dur", "Vol", "Conf", "TI", "Liq", "Spr", "TrdC", "SS"].map((label, i) => (
            <div key={label} className="bg-slate-800/60 rounded p-1.5 text-center">
              <div className="text-[10px] font-mono text-sky-400">{(display.featureVector?.[i] ?? 0).toFixed(1)}</div>
              <div className="text-[8px] text-slate-600 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[10px] text-slate-600">
          Embedding: {display.embeddingPlaceholder?.computed ? "computed" : "not computed"} · 
          Nearest neighbours: {display.similarityMetadata?.nearestNeighbours?.length ?? 0} · 
          Model: {display.embeddingPlaceholder?.model ?? "none"}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Relationship Graph ──────────────────────────────────────────────────
function GraphTab() {
  const [tradeId, setTradeId] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{
    tradeId: number;
    relationships: Array<{ id: number; fromType: string; fromId: string; toType: string; toId: string; relType: string; strength: string | null }>;
    count: number;
  }>({
    queryKey: ["trade-graph", submitted],
    queryFn:  () => api(`/memory/relationships/trade/${submitted}`),
    enabled:  !!submitted,
  });

  const { data: stats } = useQuery<{ total: number; byRelType: Record<string, number>; byFromType: Record<string, number>; densityScore: number }>({
    queryKey: ["rel-stats"],
    queryFn:  () => api("/memory/relationships"),
  });

  const entityColor: Record<string, string> = {
    snapshot:   "border-purple-500/50 bg-purple-500/10 text-purple-300",
    setup:      "border-amber-500/50 bg-amber-500/10 text-amber-300",
    trade:      "border-sky-500/50 bg-sky-500/10 text-sky-300",
    context:    "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
    screenshot: "border-pink-500/50 bg-pink-500/10 text-pink-300",
    event:      "border-slate-500/50 bg-slate-500/10 text-slate-300",
    review:     "border-teal-500/50 bg-teal-500/10 text-teal-300",
    lesson:     "border-indigo-500/50 bg-indigo-500/10 text-indigo-300",
  };

  return (
    <div className="space-y-4">
      {/* Graph-wide Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-sky-400">{stats.total}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Total Links</div>
          </div>
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-purple-400">{stats.densityScore}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Density Score</div>
          </div>
          {Object.entries(stats.byRelType).slice(0, 2).map(([type, cnt]) => (
            <div key={type} className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-emerald-400">{cnt}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{type.replace(/_/g, " ")}</div>
            </div>
          ))}
        </div>
      )}

      {/* Lookup */}
      <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-4">
        <p className="text-xs text-slate-400 mb-3">Explore the relationship chain for a specific trade</p>
        <div className="flex gap-2">
          <input
            type="number" placeholder="Trade ID…" value={tradeId}
            onChange={e => setTradeId(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500 w-36"
          />
          <button
            onClick={() => setSubmitted(tradeId)}
            className="bg-sky-600 hover:bg-sky-500 text-white text-sm rounded px-3 py-1.5 font-medium transition-colors"
          >
            View Graph
          </button>
        </div>
      </div>

      {isLoading && <div className="text-slate-400 text-sm text-center py-6">Loading relationships…</div>}
      {error     && <div className="text-red-400 text-sm text-center py-4">Failed to load relationships</div>}

      {data && (
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Trade #{data.tradeId} — {data.count} relationship{data.count !== 1 ? "s" : ""}
          </h3>

          {data.count === 0 ? (
            <p className="text-slate-500 text-sm text-center py-4">No relationships found. Run /memory/experience/trade/{data.tradeId}/refresh to build chain.</p>
          ) : (
            <div className="space-y-2">
              {data.relationships.map(rel => (
                <div key={rel.id} className="flex items-center gap-2 text-xs">
                  <div className={`border rounded px-2 py-1 font-mono ${entityColor[rel.fromType] ?? "border-slate-600 text-slate-400"}`}>
                    {rel.fromType}:{rel.fromId.length > 8 ? rel.fromId.slice(0, 8) + "…" : rel.fromId}
                  </div>
                  <div className="flex items-center gap-1 text-slate-500">
                    <div className="h-px w-4 bg-slate-600" />
                    <span className="text-[10px] bg-slate-800 border border-slate-700 px-1 rounded whitespace-nowrap">{rel.relType}</span>
                    <div className="h-px w-4 bg-slate-600" />
                    <ChevronRight size={10} className="text-slate-500" />
                  </div>
                  <div className={`border rounded px-2 py-1 font-mono ${entityColor[rel.toType] ?? "border-slate-600 text-slate-400"}`}>
                    {rel.toType}:{rel.toId.length > 8 ? rel.toId.slice(0, 8) + "…" : rel.toId}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Rel type legend */}
          <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-slate-700/50">
            {Object.entries(entityColor).map(([type, cls]) => (
              <span key={type} className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>{type}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Statistics ──────────────────────────────────────────────────────────
function StatisticsTab() {
  const { data: stats, isLoading, error, refetch } = useQuery<MemoryStats>({
    queryKey: ["memory-stats"],
    queryFn:  () => api("/memory/statistics"),
  });

  if (isLoading) return <div className="text-slate-400 text-sm text-center py-8">Computing statistics…</div>;
  if (error)     return <div className="text-red-400 text-sm text-center py-4">Failed to load statistics</div>;
  if (!stats)    return null;

  const winRate = stats.totalExperiences > 0
    ? Math.round((stats.winningExperiences / Math.max(1, stats.winningExperiences + stats.losingExperiences + stats.breakEvenExperiences)) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => refetch()} className="text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1 text-xs">
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Experiences",  value: stats.totalExperiences,    color: "text-sky-400" },
          { label: "Win Rate",           value: `${winRate}%`,             color: winRate >= 50 ? "text-emerald-400" : "text-red-400" },
          { label: "Avg P&L",            value: stats.avgPnlPips != null ? `${stats.avgPnlPips > 0 ? "+" : ""}${stats.avgPnlPips.toFixed(1)}p` : "—", color: stats.avgPnlPips && stats.avgPnlPips > 0 ? "text-emerald-400" : "text-red-400" },
          { label: "Avg R:R",            value: stats.avgRiskReward ? `${stats.avgRiskReward.toFixed(2)}R` : "—", color: "text-amber-400" },
        ].map(m => (
          <div key={m.label} className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-4 text-center">
            <div className={`text-2xl font-bold ${m.color}`}>{m.value}</div>
            <div className="text-[10px] text-slate-500 mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Outcome Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Outcome Distribution</h3>
          {[
            { key: "win",        label: "Wins",        value: stats.winningExperiences,   color: "bg-emerald-500" },
            { key: "loss",       label: "Losses",      value: stats.losingExperiences,    color: "bg-red-500" },
            { key: "break_even", label: "Break Even",  value: stats.breakEvenExperiences, color: "bg-amber-500" },
            { key: "open",       label: "Open",        value: stats.openExperiences,      color: "bg-sky-500" },
          ].map(({ label, value, color }) => {
            const pct = stats.totalExperiences > 0 ? Math.round((value / stats.totalExperiences) * 100) : 0;
            return (
              <div key={label} className="mb-2 last:mb-0">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">{label}</span>
                  <span className="text-slate-400">{value} ({pct}%)</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Completeness</h3>
          {[
            { label: "With Context",     value: stats.experiencesWithContext,     icon: FileText },
            { label: "With Screenshots", value: stats.experiencesWithScreenshots, icon: Camera },
            { label: "With Reviews",     value: stats.experiencesWithReviews,     icon: Eye },
            { label: "With Lessons",     value: stats.experiencesWithLessons,     icon: BookOpen },
          ].map(({ label, value, icon: Icon }) => {
            const pct = stats.totalExperiences > 0 ? Math.round((value / stats.totalExperiences) * 100) : 0;
            return (
              <div key={label} className="flex items-center gap-3 mb-2 last:mb-0">
                <Icon size={11} className="text-slate-500 shrink-0" />
                <span className="text-xs text-slate-300 w-32">{label}</span>
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-slate-400 w-8 text-right">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* By Pair */}
      {Object.keys(stats.byPair).length > 0 && (
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">By Pair</h3>
          <div className="flex gap-4 flex-wrap">
            {Object.entries(stats.byPair).map(([pair, cnt]) => (
              <div key={pair} className="text-center">
                <div className="text-lg font-bold text-slate-200">{cnt}</div>
                <div className="text-xs text-slate-500">{pair}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Memory Health & Graph */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Relationships",  value: stats.totalRelationships,  color: "text-purple-400" },
          { label: "Graph Density",        value: `${stats.relationshipDensity}`,  color: "text-sky-400" },
          { label: "Data Quality",         value: `${stats.dataQualityScore}%`,    color: stats.dataQualityScore >= 70 ? "text-emerald-400" : "text-amber-400" },
          { label: "Storage Est.",         value: `${stats.estimatedStorageMB}MB`, color: "text-slate-300" },
        ].map(m => (
          <div key={m.label} className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-3 text-center">
            <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-slate-400">
        <div className="bg-slate-900/60 border border-slate-700/50 rounded p-2">
          <span className="text-slate-500">Growth rate: </span>
          <span className="text-sky-400 font-medium">{stats.memoryGrowthRate}</span>
        </div>
        <div className="bg-slate-900/60 border border-slate-700/50 rounded p-2">
          <span className="text-slate-500">Total screenshots: </span>
          <span className="text-purple-400 font-medium">{stats.totalScreenshots}</span>
        </div>
        <div className="bg-slate-900/60 border border-slate-700/50 rounded p-2">
          <span className="text-slate-500">Avg duration: </span>
          <span className="text-slate-300 font-medium">{stats.avgDurationMins ? `${stats.avgDurationMins}m` : "—"}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Memory Health ───────────────────────────────────────────────────────
function HealthTab() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery<HealthReport>({
    queryKey: ["memory-health"],
    queryFn:  () => api("/memory/health"),
    staleTime: 30_000,
  });

  const repair = useMutation({
    mutationFn: () => api("/memory/health/repair", { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["memory-health"] }); refetch(); },
  });

  const healthColor = {
    healthy:  "border-emerald-500/50 bg-emerald-500/10 text-emerald-400",
    degraded: "border-amber-500/50  bg-amber-500/10  text-amber-400",
    critical: "border-red-500/50    bg-red-500/10    text-red-400",
  };

  const issueColor = {
    critical: "border-red-500/30 bg-red-500/5 text-red-400",
    warning:  "border-amber-500/30 bg-amber-500/5 text-amber-400",
    info:     "border-sky-500/30 bg-sky-500/5 text-sky-400",
  };

  const issueIcon = {
    critical: XCircle,
    warning:  AlertTriangle,
    info:     Activity,
  };

  if (isLoading) return <div className="text-slate-400 text-sm text-center py-8">Running integrity check…</div>;
  if (error)     return <div className="text-red-400 text-sm text-center py-4">Failed to run health check</div>;
  if (!data)     return null;

  return (
    <div className="space-y-4">
      {/* Health Badge */}
      <div className="flex items-center justify-between">
        <div className={`inline-flex items-center gap-2 border rounded-lg px-4 py-2 ${healthColor[data.overallHealth]}`}>
          {data.overallHealth === "healthy" ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
          <span className="font-bold uppercase tracking-wider text-sm">{data.overallHealth}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => repair.mutate()}
            disabled={repair.isPending}
            className="flex items-center gap-1.5 bg-amber-600/80 hover:bg-amber-600 text-white text-xs rounded px-3 py-1.5 font-medium transition-colors disabled:opacity-50"
          >
            <Wrench size={11} /> {repair.isPending ? "Repairing…" : "Auto-Repair"}
          </button>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded px-3 py-1.5 transition-colors"
          >
            <RefreshCw size={11} /> Re-run
          </button>
        </div>
      </div>

      {/* Score */}
      <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-400">Data Quality Score</span>
          <span className={`text-lg font-bold ${data.dataQualityScore >= 80 ? "text-emerald-400" : data.dataQualityScore >= 50 ? "text-amber-400" : "text-red-400"}`}>
            {data.dataQualityScore}/100
          </span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${data.dataQualityScore >= 80 ? "bg-emerald-500" : data.dataQualityScore >= 50 ? "bg-amber-500" : "bg-red-500"}`}
            style={{ width: `${data.dataQualityScore}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-600 mt-1">
          <span>{data.criticalCount} critical · {data.warningCount} warning · {data.issueCount - data.criticalCount - data.warningCount} info</span>
          <span>Ran in {data.durationMs}ms</span>
        </div>
      </div>

      {/* Issues */}
      {data.issues.length === 0 ? (
        <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
          <CheckCircle size={14} /> No issues detected — memory graph is healthy
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Issues</h3>
          {data.issues.map((issue, i) => {
            const Icon = issueIcon[issue.level];
            return (
              <div key={i} className={`border rounded-lg p-3 ${issueColor[issue.level]}`}>
                <div className="flex items-start gap-2">
                  <Icon size={13} className="shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{issue.message}</span>
                      {issue.repaired && (
                        <span className="text-[10px] bg-emerald-400/20 text-emerald-400 px-1 rounded">AUTO-REPAIRED</span>
                      )}
                    </div>
                    {issue.repair && (
                      <p className="text-[10px] text-slate-400 mt-0.5">{issue.repair}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-600 shrink-0">{issue.category}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Recommendations</h3>
          <ul className="space-y-1.5">
            {data.recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                <ChevronRight size={11} className="text-sky-400 shrink-0 mt-0.5" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Repair Result */}
      {repair.data && !repair.isPending && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-xs text-emerald-400">
          ✅ Repair complete — {(repair.data as { orphansRemoved: number }).orphansRemoved} orphans removed,{" "}
          {(repair.data as { experiencesCreated: number }).experiencesCreated} experiences created
          ({(repair.data as { durationMs: number }).durationMs}ms)
        </div>
      )}
    </div>
  );
}

// ─── Root Page ────────────────────────────────────────────────────────────────

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: "explorer",   label: "Experiences",  icon: <Brain size={13} /> },
  { id: "detail",     label: "Detail",       icon: <Eye size={13} /> },
  { id: "graph",      label: "Graph",        icon: <Network size={13} /> },
  { id: "statistics", label: "Statistics",   icon: <BarChart3 size={13} /> },
  { id: "health",     label: "Health",       icon: <Shield size={13} /> },
];

export default function MemoryPage() {
  const [tab, setTab]         = useState<Tab>("explorer");
  const [selected, setSelected] = useState<Experience | null>(null);

  const handleSelect = useCallback((exp: Experience) => {
    setSelected(exp);
    setTab("detail");
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Brain size={20} className="text-sky-400" />
            Memory Graph
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Experience-based knowledge graph · Relationship mapping · Intelligent retrieval
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-600">
          <Zap size={10} className="text-amber-400" />
          <span>AI placeholders ready · embeddings not active</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-700/50 pb-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t transition-colors -mb-px border-b-2 ${
              tab === t.id
                ? "text-sky-400 border-sky-400 bg-sky-400/5"
                : "text-slate-500 border-transparent hover:text-slate-300 hover:border-slate-600"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {tab === "explorer"   && <ExplorerTab onSelect={handleSelect} />}
        {tab === "detail"     && <DetailTab selectedExp={selected} />}
        {tab === "graph"      && <GraphTab />}
        {tab === "statistics" && <StatisticsTab />}
        {tab === "health"     && <HealthTab />}
      </div>
    </div>
  );
}
