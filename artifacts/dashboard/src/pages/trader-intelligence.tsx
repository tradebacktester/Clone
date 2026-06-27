import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  Plus,
  Search,
  BarChart3,
  GitCompare,
  Image,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Clock,
  Target,
  AlertTriangle,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";

// ─── Types ─────────────────────────────────────────────────────────────────

interface TiDecision {
  id: number;
  pair: string;
  timeframes: string;
  session?: string;
  regime?: string;
  htfStructure?: string;
  premiumDiscount?: string;
  zoneScore?: number;
  liquidityScore?: number;
  amdScore?: number;
  confirmScore?: number;
  tqi?: number;
  expectedRr?: number;
  riskPct?: number;
  traderDecision: "accepted" | "rejected" | "delayed";
  traderConfidence?: number;
  traderNotes?: string;
  contextTags: string;
  tradeId?: number;
  outcome?: string;
  engineDecision?: string;
  createdAt: string;
  updatedAt: string;
}

interface TiDecisionDetail extends TiDecision {
  screenshots: TiScreenshot[];
}

interface TiScreenshot {
  id: number;
  decisionId: number;
  url: string;
  label?: string;
  notes?: string;
  createdAt: string;
}

// ─── API helpers ───────────────────────────────────────────────────────────

const API = "/api";

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const CONTEXT_TAGS = [
  "Trend looked weak",
  "News uncertainty",
  "Liquidity looked unusual",
  "Market too slow",
  "Session almost over",
  "Zone looked messy",
  "Structure not clean",
  "Too close to equilibrium",
  "HTF against",
  "Low volume",
  "High spread",
  "Strong momentum",
  "Clean structure",
  "Perfect zone",
];

const PAIRS = ["EURUSD", "GBPUSD", "USDJPY"];
const SESSIONS = ["london", "new_york"];
const REGIMES = ["trending", "ranging", "volatile", "low_volatility"];
const HTF_STRUCTURES = ["bullish", "bearish", "ranging"];
const PREMIUM_DISCOUNT = ["premium", "discount", "equilibrium"];

const DECISION_COLOR: Record<string, string> = {
  accepted: "text-emerald-400",
  rejected: "text-red-400",
  delayed: "text-amber-400",
};

const OUTCOME_COLOR: Record<string, string> = {
  win: "text-emerald-400",
  loss: "text-red-400",
  missed: "text-amber-400",
  pending: "text-blue-400",
};

const DECISION_ICON: Record<string, React.ReactNode> = {
  accepted: <CheckCircle className="w-3 h-3 text-emerald-400" />,
  rejected: <XCircle className="w-3 h-3 text-red-400" />,
  delayed: <Clock className="w-3 h-3 text-amber-400" />,
};

// ─── Sub-components ────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold font-mono">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function ScoreBadge({ label, value }: { label: string; value?: number | null }) {
  if (value == null) return null;
  const color = value >= 80 ? "bg-emerald-900/40 text-emerald-300" : value >= 60 ? "bg-amber-900/40 text-amber-300" : "bg-red-900/40 text-red-300";
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-mono ${color}`}>
      {label}: {value}
    </span>
  );
}

function DecisionRow({ d, onSelect }: { d: TiDecision; onSelect: (id: number) => void }) {
  const tags: string[] = (() => { try { return JSON.parse(d.contextTags); } catch { return []; } })();
  return (
    <div
      className="border border-border rounded-lg p-3 hover:bg-muted/20 cursor-pointer transition-colors"
      onClick={() => onSelect(d.id)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {DECISION_ICON[d.traderDecision]}
          <span className="font-mono text-sm font-semibold">{d.pair}</span>
          {d.session && <span className="text-xs text-muted-foreground">{d.session}</span>}
          {d.regime && <span className="text-xs text-muted-foreground">{d.regime}</span>}
          {d.traderConfidence != null && (
            <span className="text-xs font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
              {d.traderConfidence}% conf
            </span>
          )}
          {d.outcome && (
            <span className={`text-xs font-semibold ${OUTCOME_COLOR[d.outcome] ?? "text-muted-foreground"}`}>
              {d.outcome.toUpperCase()}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(d.createdAt).toLocaleDateString()}
        </span>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        <ScoreBadge label="Z" value={d.zoneScore} />
        <ScoreBadge label="L" value={d.liquidityScore} />
        <ScoreBadge label="A" value={d.amdScore} />
        <ScoreBadge label="C" value={d.confirmScore} />
        <ScoreBadge label="TQI" value={d.tqi} />
        {d.expectedRr != null && (
          <span className="text-xs text-muted-foreground">RR: {d.expectedRr}×</span>
        )}
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {tags.map((t) => (
            <span key={t} className="text-xs bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded">
              {t}
            </span>
          ))}
        </div>
      )}
      {d.traderNotes && (
        <p className="text-xs text-muted-foreground mt-1.5 italic line-clamp-1">{d.traderNotes}</p>
      )}
    </div>
  );
}

// ─── Log Decision Form ──────────────────────────────────────────────────────

function LogDecisionForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    pair: "EURUSD",
    timeframes: '["15m","1h"]',
    session: "london",
    regime: "",
    htfStructure: "",
    premiumDiscount: "",
    zoneScore: "",
    liquidityScore: "",
    amdScore: "",
    confirmScore: "",
    tqi: "",
    expectedRr: "",
    riskPct: "",
    traderDecision: "accepted",
    traderConfidence: "70",
    traderNotes: "",
    contextTags: [] as string[],
    engineDecision: "",
  });

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch("/ti/decisions", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ti-decisions"] });
      onSuccess();
    },
  });

  const toggleTag = (tag: string) => {
    setForm((f) => ({
      ...f,
      contextTags: f.contextTags.includes(tag)
        ? f.contextTags.filter((t) => t !== tag)
        : [...f.contextTags, tag],
    }));
  };

  const set = (field: string, val: string) => setForm((f) => ({ ...f, [field]: val }));

  const handleSubmit = () => {
    const body: Record<string, unknown> = {
      pair: form.pair,
      timeframes: form.timeframes,
      traderDecision: form.traderDecision,
      contextTags: JSON.stringify(form.contextTags),
    };
    if (form.session) body["session"] = form.session;
    if (form.regime) body["regime"] = form.regime;
    if (form.htfStructure) body["htfStructure"] = form.htfStructure;
    if (form.premiumDiscount) body["premiumDiscount"] = form.premiumDiscount;
    if (form.zoneScore) body["zoneScore"] = parseFloat(form.zoneScore);
    if (form.liquidityScore) body["liquidityScore"] = parseFloat(form.liquidityScore);
    if (form.amdScore) body["amdScore"] = parseFloat(form.amdScore);
    if (form.confirmScore) body["confirmScore"] = parseFloat(form.confirmScore);
    if (form.tqi) body["tqi"] = parseFloat(form.tqi);
    if (form.expectedRr) body["expectedRr"] = parseFloat(form.expectedRr);
    if (form.riskPct) body["riskPct"] = parseFloat(form.riskPct);
    if (form.traderConfidence) body["traderConfidence"] = parseInt(form.traderConfidence);
    if (form.traderNotes) body["traderNotes"] = form.traderNotes;
    if (form.engineDecision) body["engineDecision"] = form.engineDecision;
    mutation.mutate(body);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Pair</label>
          <select className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-sm" value={form.pair} onChange={(e) => set("pair", e.target.value)}>
            {PAIRS.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Session</label>
          <select className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-sm" value={form.session} onChange={(e) => set("session", e.target.value)}>
            <option value="">—</option>
            {SESSIONS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Regime</label>
          <select className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-sm" value={form.regime} onChange={(e) => set("regime", e.target.value)}>
            <option value="">—</option>
            {REGIMES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">HTF Structure</label>
          <select className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-sm" value={form.htfStructure} onChange={(e) => set("htfStructure", e.target.value)}>
            <option value="">—</option>
            {HTF_STRUCTURES.map((h) => <option key={h}>{h}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Premium / Discount</label>
          <select className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-sm" value={form.premiumDiscount} onChange={(e) => set("premiumDiscount", e.target.value)}>
            <option value="">—</option>
            {PREMIUM_DISCOUNT.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">My Decision</label>
          <select className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-sm" value={form.traderDecision} onChange={(e) => set("traderDecision", e.target.value)}>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="delayed">Delayed</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Engine Decision</label>
          <select className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-sm" value={form.engineDecision} onChange={(e) => set("engineDecision", e.target.value)}>
            <option value="">— Unknown —</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="no_signal">No Signal</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">My Confidence (0–100)</label>
          <input type="number" min={0} max={100} className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-sm" value={form.traderConfidence} onChange={(e) => set("traderConfidence", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {[
          { field: "zoneScore", label: "Zone" },
          { field: "liquidityScore", label: "Liquidity" },
          { field: "amdScore", label: "AMD" },
          { field: "confirmScore", label: "Confirm" },
          { field: "tqi", label: "TQI" },
        ].map(({ field, label }) => (
          <div key={field}>
            <label className="text-xs text-muted-foreground">{label}</label>
            <input
              type="number" min={0} max={100}
              className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-sm"
              placeholder="0–100"
              value={(form as Record<string, string>)[field]}
              onChange={(e) => set(field, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Expected RR</label>
          <input type="number" step="0.1" className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-sm" value={form.expectedRr} onChange={(e) => set("expectedRr", e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Risk %</label>
          <input type="number" step="0.1" className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-sm" value={form.riskPct} onChange={(e) => set("riskPct", e.target.value)} />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Context Observations</label>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {CONTEXT_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                form.contextTags.includes(tag)
                  ? "bg-primary/20 border-primary text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Notes (free-text)</label>
        <textarea
          className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-sm resize-none"
          rows={3}
          placeholder="Trend looked hesitant. Zone was a bit messy. News in 30 mins..."
          value={form.traderNotes}
          onChange={(e) => set("traderNotes", e.target.value)}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={mutation.isPending}
        className="w-full bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
      >
        {mutation.isPending ? "Saving…" : "Log Decision"}
      </button>
      {mutation.isError && (
        <p className="text-xs text-red-400">{String(mutation.error)}</p>
      )}
    </div>
  );
}

// ─── Decision Detail Panel ──────────────────────────────────────────────────

function DecisionDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<TiDecisionDetail>({
    queryKey: ["ti-decision", id],
    queryFn: () => apiFetch(`/ti/decisions/${id}`),
  });
  const [addingScreenshot, setAddingScreenshot] = useState(false);
  const [ssUrl, setSsUrl] = useState("");
  const [ssLabel, setSsLabel] = useState("entry");
  const [ssNotes, setSsNotes] = useState("");
  const [updatingOutcome, setUpdatingOutcome] = useState("");

  const addScreenshot = useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiFetch(`/ti/decisions/${id}/screenshots`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ti-decision", id] }); setAddingScreenshot(false); setSsUrl(""); },
  });

  const updateOutcome = useMutation({
    mutationFn: (outcome: string) =>
      apiFetch(`/ti/decisions/${id}`, { method: "PATCH", body: JSON.stringify({ outcome }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ti-decision", id] }); qc.invalidateQueries({ queryKey: ["ti-decisions"] }); setUpdatingOutcome(""); },
  });

  if (isLoading || !data) return (
    <div className="p-6 text-center text-muted-foreground text-sm animate-pulse">Loading decision…</div>
  );

  const tags: string[] = (() => { try { return JSON.parse(data.contextTags); } catch { return []; } })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Decision #{data.id} — {data.pair}</h3>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="text-muted-foreground">Decision</div>
        <div className={`font-semibold ${DECISION_COLOR[data.traderDecision] ?? ""}`}>{data.traderDecision.toUpperCase()}</div>
        <div className="text-muted-foreground">Engine</div>
        <div className="font-mono">{data.engineDecision ?? "—"}</div>
        <div className="text-muted-foreground">Outcome</div>
        <div className={`font-semibold ${OUTCOME_COLOR[data.outcome ?? ""] ?? "text-muted-foreground"}`}>
          {data.outcome?.toUpperCase() ?? "—"}
        </div>
        <div className="text-muted-foreground">Confidence</div>
        <div className="font-mono">{data.traderConfidence ?? "—"}/100</div>
        <div className="text-muted-foreground">Session</div>
        <div className="font-mono">{data.session ?? "—"}</div>
        <div className="text-muted-foreground">Regime</div>
        <div className="font-mono">{data.regime ?? "—"}</div>
        <div className="text-muted-foreground">HTF</div>
        <div className="font-mono">{data.htfStructure ?? "—"}</div>
        <div className="text-muted-foreground">Premium/Disc.</div>
        <div className="font-mono">{data.premiumDiscount ?? "—"}</div>
        <div className="text-muted-foreground">Expected RR</div>
        <div className="font-mono">{data.expectedRr != null ? `${data.expectedRr}×` : "—"}</div>
      </div>

      <div className="flex flex-wrap gap-1">
        <ScoreBadge label="Zone" value={data.zoneScore} />
        <ScoreBadge label="Liquidity" value={data.liquidityScore} />
        <ScoreBadge label="AMD" value={data.amdScore} />
        <ScoreBadge label="Confirm" value={data.confirmScore} />
        <ScoreBadge label="TQI" value={data.tqi} />
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className="text-xs bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded">{t}</span>
          ))}
        </div>
      )}

      {data.traderNotes && (
        <p className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-2 italic">{data.traderNotes}</p>
      )}

      {/* Update Outcome */}
      {!data.outcome && (
        <div>
          <label className="text-xs text-muted-foreground">Mark Outcome</label>
          <div className="flex gap-2 mt-1">
            {["win", "loss", "missed", "pending"].map((o) => (
              <button
                key={o}
                onClick={() => updateOutcome.mutate(o)}
                className={`text-xs px-2 py-1 rounded border ${OUTCOME_COLOR[o] ?? ""} border-current hover:bg-white/5`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Screenshots */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Screenshots ({data.screenshots.length})</span>
          <button
            onClick={() => setAddingScreenshot(!addingScreenshot)}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <Image className="w-3 h-3" />
            Add
          </button>
        </div>
        {data.screenshots.map((s) => (
          <div key={s.id} className="text-xs border border-border rounded p-2 mb-1">
            <div className="font-mono text-primary truncate">{s.url}</div>
            {s.label && <div className="text-muted-foreground">{s.label}{s.notes ? ` — ${s.notes}` : ""}</div>}
          </div>
        ))}
        {addingScreenshot && (
          <div className="space-y-2 border border-border rounded p-3">
            <input
              placeholder="URL or file path"
              className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
              value={ssUrl}
              onChange={(e) => setSsUrl(e.target.value)}
            />
            <select className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs" value={ssLabel} onChange={(e) => setSsLabel(e.target.value)}>
              {["entry", "context", "outcome", "analysis"].map((l) => <option key={l}>{l}</option>)}
            </select>
            <input
              placeholder="Notes (optional)"
              className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
              value={ssNotes}
              onChange={(e) => setSsNotes(e.target.value)}
            />
            <button
              onClick={() => addScreenshot.mutate({ url: ssUrl, label: ssLabel, notes: ssNotes })}
              disabled={!ssUrl || addScreenshot.isPending}
              className="w-full bg-primary/80 text-primary-foreground rounded px-2 py-1 text-xs disabled:opacity-50"
            >
              Attach Screenshot
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Similar Setups Panel ───────────────────────────────────────────────────

function SimilarSetups() {
  const [scores, setScores] = useState({ zoneScore: "75", liquidityScore: "70", amdScore: "65", confirmScore: "70", tqi: "68" });
  const [pair, setPair] = useState("");
  const [searching, setSearching] = useState(false);

  const { data, refetch, isFetching } = useQuery<{ items: { decision: TiDecision; similarityScore: number }[] }>({
    queryKey: ["ti-similar", scores, pair],
    queryFn: () => apiFetch(`/ti/similar?zoneScore=${scores.zoneScore}&liquidityScore=${scores.liquidityScore}&amdScore=${scores.amdScore}&confirmScore=${scores.confirmScore}&tqi=${scores.tqi}${pair ? `&pair=${pair}` : ""}`),
    enabled: searching,
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-2">
        {[
          { key: "zoneScore", label: "Zone" },
          { key: "liquidityScore", label: "Liquidity" },
          { key: "amdScore", label: "AMD" },
          { key: "confirmScore", label: "Confirm" },
          { key: "tqi", label: "TQI" },
        ].map(({ key, label }) => (
          <div key={key}>
            <label className="text-xs text-muted-foreground">{label}</label>
            <input
              type="number" min={0} max={100}
              className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-sm"
              value={(scores as Record<string, string>)[key]}
              onChange={(e) => setScores((s) => ({ ...s, [key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <select className="bg-background border border-border rounded px-2 py-1.5 text-sm" value={pair} onChange={(e) => setPair(e.target.value)}>
          <option value="">All Pairs</option>
          {PAIRS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <button
          onClick={() => { setSearching(true); refetch(); }}
          disabled={isFetching}
          className="bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
        >
          <Search className="w-4 h-4" />
          {isFetching ? "Searching…" : "Find Similar"}
        </button>
      </div>

      {data && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">{data.items.length} similar setups found</div>
          {data.items.map(({ decision: d, similarityScore }) => (
            <div key={d.id} className="border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {DECISION_ICON[d.traderDecision]}
                  <span className="font-mono text-sm font-semibold">{d.pair}</span>
                  {d.session && <span className="text-xs text-muted-foreground">{d.session}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${OUTCOME_COLOR[d.outcome ?? ""] ?? "text-muted-foreground"}`}>
                    {d.outcome?.toUpperCase() ?? "—"}
                  </span>
                  <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">
                    {similarityScore}% match
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                <ScoreBadge label="Z" value={d.zoneScore} />
                <ScoreBadge label="L" value={d.liquidityScore} />
                <ScoreBadge label="A" value={d.amdScore} />
                <ScoreBadge label="C" value={d.confirmScore} />
                <ScoreBadge label="TQI" value={d.tqi} />
                {d.traderConfidence != null && (
                  <span className="text-xs text-muted-foreground">conf: {d.traderConfidence}%</span>
                )}
              </div>
              {d.traderNotes && (
                <p className="text-xs text-muted-foreground mt-1.5 italic line-clamp-1">{d.traderNotes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Recommendation Panel ───────────────────────────────────────────────────

function RecommendationPanel() {
  const [scores, setScores] = useState({ zoneScore: "75", liquidityScore: "70", amdScore: "65", confirmScore: "70", tqi: "68" });
  const [pair, setPair] = useState("");
  const [querying, setQuerying] = useState(false);

  const { data, refetch, isFetching } = useQuery<{
    totalMatches: number;
    winRate?: number;
    profitFactor?: number;
    avgRr?: number;
    avgConfidence?: number;
    recentComments: string[];
    topOutcomes: Record<string, number>;
  }>({
    queryKey: ["ti-recommendation", scores, pair],
    queryFn: () => apiFetch(`/ti/recommendation?zoneScore=${scores.zoneScore}&liquidityScore=${scores.liquidityScore}&amdScore=${scores.amdScore}&confirmScore=${scores.confirmScore}&tqi=${scores.tqi}${pair ? `&pair=${pair}` : ""}`),
    enabled: querying,
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-2">
        {[
          { key: "zoneScore", label: "Zone" },
          { key: "liquidityScore", label: "Liquidity" },
          { key: "amdScore", label: "AMD" },
          { key: "confirmScore", label: "Confirm" },
          { key: "tqi", label: "TQI" },
        ].map(({ key, label }) => (
          <div key={key}>
            <label className="text-xs text-muted-foreground">{label}</label>
            <input
              type="number" min={0} max={100}
              className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-sm"
              value={(scores as Record<string, string>)[key]}
              onChange={(e) => setScores((s) => ({ ...s, [key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <select className="bg-background border border-border rounded px-2 py-1.5 text-sm" value={pair} onChange={(e) => setPair(e.target.value)}>
          <option value="">All Pairs</option>
          {PAIRS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <button
          onClick={() => { setQuerying(true); refetch(); }}
          disabled={isFetching}
          className="bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
        >
          <Target className="w-4 h-4" />
          {isFetching ? "Loading…" : "Get Recommendation"}
        </button>
      </div>

      {data && (
        <div className="space-y-4">
          {data.totalMatches === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              No similar setups found. Log more decisions to build your history.
            </div>
          ) : (
            <>
              <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
                <p className="text-sm font-medium">
                  This setup resembles <span className="text-primary font-bold">{data.totalMatches}</span> previous setups you logged.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Win Rate" value={data.winRate != null ? `${(data.winRate * 100).toFixed(1)}%` : "N/A"} />
                <StatCard label="Profit Factor" value={data.profitFactor != null ? data.profitFactor.toFixed(2) : "N/A"} />
                <StatCard label="Avg R:R" value={data.avgRr != null ? `${data.avgRr.toFixed(2)}×` : "N/A"} />
                <StatCard label="Avg Confidence" value={data.avgConfidence != null ? `${data.avgConfidence.toFixed(0)}%` : "N/A"} />
              </div>
              {data.recentComments.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-2">Your comments on similar setups:</div>
                  <div className="space-y-1.5">
                    {data.recentComments.map((c, i) => (
                      <p key={i} className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2 italic">{c}</p>
                    ))}
                  </div>
                </div>
              )}
              {Object.keys(data.topOutcomes).length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-2">Historical outcomes:</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(data.topOutcomes).map(([outcome, count]) => (
                      <span key={outcome} className={`text-xs font-mono ${OUTCOME_COLOR[outcome] ?? "text-muted-foreground"} bg-muted/20 px-2 py-1 rounded`}>
                        {outcome}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Psychology Dashboard ───────────────────────────────────────────────────

function PsychologyDashboard() {
  const { data, isLoading } = useQuery<{
    overTime: { date: string; avgConfidence: number; count: number }[];
    byPair: { pair: string; avgConfidence: number; count: number }[];
    bySession: { session: string; avgConfidence: number; count: number }[];
    byRegime: { regime: string; avgConfidence: number; count: number }[];
    byDecision: { decision: string; avgConfidence: number; count: number }[];
    streakEffect: { avgConfidenceAfterWin?: number; avgConfidenceAfterLoss?: number; sampleAfterWin: number; sampleAfterLoss: number };
  }>({
    queryKey: ["ti-psychology"],
    queryFn: () => apiFetch("/ti/psychology"),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground animate-pulse">Loading psychology data…</div>;
  if (!data) return null;

  const BAR_COLOR = "#6366f1";

  return (
    <div className="space-y-6">
      {data.overTime.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-2">Confidence Over Time (daily avg)</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data.overTime}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => [`${v}%`, "Confidence"]} />
              <Line type="monotone" dataKey="avgConfidence" stroke="#6366f1" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {[
          { title: "By Pair", data: data.byPair, key: "pair" },
          { title: "By Session", data: data.bySession, key: "session" },
          { title: "By Regime", data: data.byRegime, key: "regime" },
          { title: "By Decision", data: data.byDecision, key: "decision" },
        ].map(({ title, data: d, key }) => (
          d.length > 0 && (
            <div key={title}>
              <div className="text-xs text-muted-foreground mb-2">{title}</div>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={d} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey={key} tick={{ fontSize: 9 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(v: number) => [`${v}%`, "Avg Confidence"]} />
                  <Bar dataKey="avgConfidence" fill={BAR_COLOR} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Confidence After Win"
          value={data.streakEffect.avgConfidenceAfterWin != null ? `${data.streakEffect.avgConfidenceAfterWin}%` : "N/A"}
          sub={`${data.streakEffect.sampleAfterWin} samples`}
        />
        <StatCard
          label="Confidence After Loss"
          value={data.streakEffect.avgConfidenceAfterLoss != null ? `${data.streakEffect.avgConfidenceAfterLoss}%` : "N/A"}
          sub={`${data.streakEffect.sampleAfterLoss} samples`}
        />
      </div>

      {data.overTime.length === 0 && data.byPair.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-8">
          No confidence data yet. Log decisions with a confidence rating to see psychology charts.
        </div>
      )}
    </div>
  );
}

// ─── Engine vs Trader Comparison ────────────────────────────────────────────

function ComparisonView() {
  const { data, isLoading } = useQuery<{
    totalDecisions: number;
    agreementRate: number;
    bothAccepted: { count: number; winRate?: number; avgRr?: number; examples: TiDecision[] };
    botAcceptedTraderRejected: { count: number; winRate?: number; avgRr?: number; examples: TiDecision[] };
    traderAcceptedBotRejected: { count: number; winRate?: number; avgRr?: number; examples: TiDecision[] };
    bothRejected: { count: number; winRate?: number; avgRr?: number; examples: TiDecision[] };
  }>({
    queryKey: ["ti-comparison"],
    queryFn: () => apiFetch("/ti/comparison"),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground animate-pulse">Loading comparison data…</div>;
  if (!data) return null;

  if (data.totalDecisions === 0) return (
    <div className="text-sm text-muted-foreground text-center py-8">
      No decisions with engine context yet. When logging a decision, select what the engine decided to enable comparison analysis.
    </div>
  );

  const categories = [
    { key: "bothAccepted", label: "Both Agreed — Accepted", color: "text-emerald-400", icon: <CheckCircle className="w-4 h-4 text-emerald-400" />, data: data.bothAccepted },
    { key: "bothRejected", label: "Both Agreed — Rejected", color: "text-muted-foreground", icon: <XCircle className="w-4 h-4 text-muted-foreground" />, data: data.bothRejected },
    { key: "botAcceptedTraderRejected", label: "Bot Accepted / I Rejected", color: "text-amber-400", icon: <AlertTriangle className="w-4 h-4 text-amber-400" />, data: data.botAcceptedTraderRejected },
    { key: "traderAcceptedBotRejected", label: "I Accepted / Bot Rejected", color: "text-blue-400", icon: <TrendingUp className="w-4 h-4 text-blue-400" />, data: data.traderAcceptedBotRejected },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total w/ Engine Context" value={data.totalDecisions} />
        <StatCard label="Agreement Rate" value={`${(data.agreementRate * 100).toFixed(1)}%`} />
      </div>
      <div className="space-y-3">
        {categories.map(({ key, label, icon, data: cat }) => (
          <div key={key} className="border border-border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              {icon}
              <span className="text-sm font-medium">{label}</span>
              <span className="ml-auto text-xs text-muted-foreground font-mono">{cat.count} decisions</span>
            </div>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span>Win Rate: {cat.winRate != null ? `${(cat.winRate * 100).toFixed(1)}%` : "N/A"}</span>
              <span>Avg RR: {cat.avgRr != null ? `${cat.avgRr.toFixed(2)}×` : "N/A"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

type Tab = "timeline" | "log" | "similar" | "recommendation" | "psychology" | "comparison";

export default function TraderIntelligence() {
  const [tab, setTab] = useState<Tab>("timeline");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filterPair, setFilterPair] = useState("");
  const [filterDecision, setFilterDecision] = useState("");
  const qc = useQueryClient();

  const { data: decisionsData, isLoading } = useQuery<{ decisions: TiDecision[]; total: number }>({
    queryKey: ["ti-decisions", filterPair, filterDecision],
    queryFn: () => apiFetch(`/ti/decisions?limit=100${filterPair ? `&pair=${filterPair}` : ""}${filterDecision ? `&decision=${filterDecision}` : ""}`),
    enabled: tab === "timeline",
  });

  const generateReport = useMutation({
    mutationFn: () => apiFetch("/ti/report", { method: "POST" }),
    onSuccess: () => alert("TRADER_INTELLIGENCE_REPORT.md generated successfully"),
  });

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "timeline", label: "Timeline", icon: <Clock className="w-3.5 h-3.5" /> },
    { id: "log", label: "Log Decision", icon: <Plus className="w-3.5 h-3.5" /> },
    { id: "similar", label: "Similar Setups", icon: <Search className="w-3.5 h-3.5" /> },
    { id: "recommendation", label: "Recommendation", icon: <Target className="w-3.5 h-3.5" /> },
    { id: "psychology", label: "Psychology", icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: "comparison", label: "Engine vs Me", icon: <GitCompare className="w-3.5 h-3.5" /> },
  ];

  // Quick stats from decisions
  const decisions = decisionsData?.decisions ?? [];
  const accepted = decisions.filter((d) => d.traderDecision === "accepted").length;
  const rejected = decisions.filter((d) => d.traderDecision === "rejected").length;
  const wins = decisions.filter((d) => d.outcome === "win").length;
  const resolved = decisions.filter((d) => d.outcome && d.outcome !== "pending").length;
  const winRate = resolved > 0 ? ((wins / resolved) * 100).toFixed(1) : "N/A";

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5 text-primary" />
            <div>
              <h1 className="text-lg font-bold tracking-tight">Trader Intelligence</h1>
              <p className="text-xs text-muted-foreground">Vasu Decision Model — advisory only, never modifies strategy</p>
            </div>
          </div>
          <button
            onClick={() => generateReport.mutate()}
            disabled={generateReport.isPending}
            className="text-xs bg-muted hover:bg-muted/80 text-muted-foreground px-3 py-1.5 rounded flex items-center gap-1.5"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            {generateReport.isPending ? "Generating…" : "Generate Report"}
          </button>
        </div>

        {/* Quick Stats */}
        <div className="flex gap-4 mt-3">
          <div className="text-xs text-muted-foreground">
            <span className="text-foreground font-mono font-semibold">{decisionsData?.total ?? 0}</span> decisions
          </div>
          <div className="text-xs text-muted-foreground">
            <span className="text-emerald-400 font-mono font-semibold">{accepted}</span> accepted
          </div>
          <div className="text-xs text-muted-foreground">
            <span className="text-red-400 font-mono font-semibold">{rejected}</span> rejected
          </div>
          <div className="text-xs text-muted-foreground">
            Win Rate: <span className="text-foreground font-mono font-semibold">{winRate}%</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-6 flex-shrink-0 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {tabs.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => { setTab(id); setSelectedId(null); }}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* TIMELINE */}
        {tab === "timeline" && !selectedId && (
          <div className="max-w-2xl space-y-4">
            <div className="flex items-center gap-2">
              <select
                className="bg-background border border-border rounded px-2 py-1.5 text-xs"
                value={filterPair}
                onChange={(e) => setFilterPair(e.target.value)}
              >
                <option value="">All Pairs</option>
                {PAIRS.map((p) => <option key={p}>{p}</option>)}
              </select>
              <select
                className="bg-background border border-border rounded px-2 py-1.5 text-xs"
                value={filterDecision}
                onChange={(e) => setFilterDecision(e.target.value)}
              >
                <option value="">All Decisions</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
                <option value="delayed">Delayed</option>
              </select>
            </div>
            {isLoading && <div className="text-sm text-muted-foreground animate-pulse">Loading decisions…</div>}
            {!isLoading && decisions.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Brain className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No decisions logged yet.</p>
                <p className="text-xs mt-1">Switch to the "Log Decision" tab to record your first setup evaluation.</p>
              </div>
            )}
            {decisions.map((d) => (
              <DecisionRow key={d.id} d={d} onSelect={setSelectedId} />
            ))}
          </div>
        )}

        {tab === "timeline" && selectedId && (
          <div className="max-w-lg">
            <DecisionDetail id={selectedId} onClose={() => setSelectedId(null)} />
          </div>
        )}

        {/* LOG */}
        {tab === "log" && (
          <div className="max-w-lg">
            <LogDecisionForm onSuccess={() => { setTab("timeline"); qc.invalidateQueries({ queryKey: ["ti-decisions"] }); }} />
          </div>
        )}

        {/* SIMILAR */}
        {tab === "similar" && (
          <div className="max-w-xl">
            <SimilarSetups />
          </div>
        )}

        {/* RECOMMENDATION */}
        {tab === "recommendation" && (
          <div className="max-w-xl">
            <RecommendationPanel />
          </div>
        )}

        {/* PSYCHOLOGY */}
        {tab === "psychology" && (
          <div className="max-w-2xl">
            <PsychologyDashboard />
          </div>
        )}

        {/* COMPARISON */}
        {tab === "comparison" && (
          <div className="max-w-xl">
            <ComparisonView />
          </div>
        )}
      </div>
    </div>
  );
}
