import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Filter,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Edit3,
  Save,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = "/api";

const PAIRS = ["", "EURUSD", "GBPUSD", "USDJPY"];
const MODES = ["", "paper", "demo", "live"];

interface JournalEntry {
  id: number;
  tradeId: number | null;
  pair: string;
  direction: string;
  entryReason: string | null;
  exitReason: string | null;
  ruleEvaluation: Record<string, any> | null;
  confidenceScores: Record<string, any> | null;
  marketRegime: string | null;
  regimeConfidence: number | null;
  brokerExecution: Record<string, any> | null;
  notes: string | null;
  mode: string;
  createdAt: string;
  updatedAt: string;
}

interface JournalList {
  entries: JournalEntry[];
  total: number;
  limit: number;
  offset: number;
}

function pnlColor(pnl: number | null) {
  if (pnl == null) return "text-zinc-400";
  return pnl >= 0 ? "text-emerald-400" : "text-red-400";
}

function dirIcon(dir: string) {
  if (dir === "buy") return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
  return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
}

function modeBadge(mode: string) {
  if (mode === "live") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-400/10 text-red-400 border border-red-400/20 font-semibold">LIVE</span>;
  if (mode === "demo") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 font-semibold">DEMO</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400 border border-zinc-600">PAPER</span>;
}

function ConfidenceBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, Math.round(value * 100)));
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div className={`h-1.5 rounded-full ${pct >= 70 ? "bg-emerald-500" : pct >= 45 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function EntryCard({ entry }: { entry: JournalEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState(entry.notes ?? "");
  const qc = useQueryClient();
  const { toast } = useToast();

  const updateEntry = useMutation({
    mutationFn: (updates: Record<string, unknown>) =>
      fetch(`${API}/live-journal/${entry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Journal entry updated" });
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["/api/live-journal"] });
    },
  });

  const scores = entry.confidenceScores as Record<string, number> | null;
  const rules = entry.ruleEvaluation as Record<string, boolean | string> | null;
  const exec = entry.brokerExecution as Record<string, any> | null;

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-1.5 min-w-[90px]">
          {dirIcon(entry.direction)}
          <span className="text-sm font-semibold">{entry.pair}</span>
          <span className="text-xs text-muted-foreground capitalize">{entry.direction}</span>
        </div>

        <div className="flex-1 text-xs text-muted-foreground truncate">
          {entry.entryReason ?? "—"}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {entry.marketRegime && (
            <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 rounded capitalize">{entry.marketRegime}</span>
          )}
          {modeBadge(entry.mode)}
          <span className="text-[10px] text-muted-foreground">{new Date(entry.createdAt).toLocaleDateString()}</span>
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4 bg-muted/10">
          <div className="grid grid-cols-2 gap-4">
            {/* Entry / Exit reasons */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Trade Rationale</div>
              <div className="space-y-2">
                {entry.entryReason && (
                  <div>
                    <div className="text-[11px] text-muted-foreground">Entry reason</div>
                    <div className="text-xs">{entry.entryReason}</div>
                  </div>
                )}
                {entry.exitReason && (
                  <div>
                    <div className="text-[11px] text-muted-foreground">Exit reason</div>
                    <div className="text-xs">{entry.exitReason}</div>
                  </div>
                )}
                {entry.regimeConfidence != null && (
                  <div className="text-xs text-muted-foreground">
                    Regime: <span className="capitalize">{entry.marketRegime}</span> ({Math.round(entry.regimeConfidence)}% confidence)
                  </div>
                )}
              </div>
            </div>

            {/* Confidence scores */}
            {scores && Object.keys(scores).length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Confidence Scores</div>
                <div className="space-y-1.5">
                  {Object.entries(scores).map(([k, v]) => (
                    <ConfidenceBar key={k} label={k} value={typeof v === "number" ? v : 0} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Rule evaluation */}
          {rules && Object.keys(rules).length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Rule Evaluation</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(rules).map(([rule, result]) => (
                  <div key={rule} className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border ${result === true || result === "pass" ? "text-emerald-400 bg-emerald-400/5 border-emerald-400/20" : "text-red-400 bg-red-400/5 border-red-400/20"}`}>
                    {result === true || result === "pass" ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {rule}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Broker execution */}
          {exec && Object.keys(exec).length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Broker Execution</div>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(exec).map(([k, v]) => (
                  <div key={k} className="text-xs">
                    <div className="text-[11px] text-muted-foreground capitalize">{k.replace(/_/g, " ")}</div>
                    <div className="font-mono">{typeof v === "number" ? v.toFixed(5) : String(v)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</div>
              {!editing ? (
                <button onClick={() => setEditing(true)} className="text-[11px] flex items-center gap-1 text-muted-foreground hover:text-foreground">
                  <Edit3 className="w-3 h-3" /> Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => { setEditing(false); setNotesDraft(entry.notes ?? ""); }} className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <X className="w-3 h-3" /> Cancel
                  </button>
                  <button onClick={() => updateEntry.mutate({ notes: notesDraft })} className="text-[11px] text-emerald-400 flex items-center gap-1">
                    <Save className="w-3 h-3" /> Save
                  </button>
                </div>
              )}
            </div>
            {editing ? (
              <textarea
                value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                className="w-full bg-muted border border-border rounded p-2 text-xs resize-none h-20"
                placeholder="Add trade notes, observations, learnings…"
              />
            ) : (
              <div className="text-xs text-muted-foreground italic">
                {entry.notes || "No notes recorded"}
              </div>
            )}
          </div>

          {entry.tradeId && (
            <div className="text-[11px] text-muted-foreground">Trade #{entry.tradeId}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LiveJournalPage() {
  const [pair, setPair] = useState("");
  const [mode, setMode] = useState("");
  const [offset, setOffset] = useState(0);
  const LIMIT = 30;

  const { data, isLoading } = useQuery<JournalList>({
    queryKey: ["/api/live-journal", pair, mode, offset],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
      if (pair) params.set("pair", pair);
      if (mode) params.set("mode", mode);
      return fetch(`${API}/live-journal?${params}`).then(r => r.json());
    },
    refetchInterval: 30_000,
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6 border-b border-border flex items-center gap-3">
        <BookOpen className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Live Trade Journal</h1>
          <p className="text-xs text-muted-foreground">Enriched trade log with rule evaluations, confidence scores, and broker execution details</p>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-border flex items-center gap-4">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <select value={pair} onChange={e => { setPair(e.target.value); setOffset(0); }} className="text-xs bg-muted border border-border rounded px-2 py-1">
          {PAIRS.map(p => <option key={p} value={p}>{p || "All Pairs"}</option>)}
        </select>
        <select value={mode} onChange={e => { setMode(e.target.value); setOffset(0); }} className="text-xs bg-muted border border-border rounded px-2 py-1">
          {MODES.map(m => <option key={m} value={m}>{m ? m.charAt(0).toUpperCase() + m.slice(1) : "All Modes"}</option>)}
        </select>
        <div className="ml-auto text-xs text-muted-foreground">{total} entries</div>
      </div>

      <div className="p-6 space-y-2 flex-1">
        {isLoading && <div className="text-zinc-400 text-sm">Loading journal…</div>}
        {!isLoading && entries.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <div className="text-sm">No journal entries yet</div>
            <div className="text-xs mt-1">Entries are created automatically when trades are executed</div>
          </div>
        )}
        {entries.map(e => <EntryCard key={e.id} entry={e} />)}

        {/* Pagination */}
        {total > LIMIT && (
          <div className="flex items-center justify-center gap-3 pt-4">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))} className="text-xs px-3 py-1 rounded border border-border hover:bg-muted disabled:opacity-40">← Prev</button>
            <span className="text-xs text-muted-foreground">{Math.floor(offset / LIMIT) + 1} / {Math.ceil(total / LIMIT)}</span>
            <button disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)} className="text-xs px-3 py-1 rounded border border-border hover:bg-muted disabled:opacity-40">Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
