import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardCheck,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  Server,
  Activity,
  ShieldCheck,
  Database,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = "/api";

interface ChecklistItem {
  id: string;
  name: string;
  category: "safety" | "strategy" | "infrastructure" | "risk" | "validation";
  required: boolean;
  passed: boolean;
  message: string;
  details?: string;
  recommendation?: string;
}

interface ChecklistResult {
  hasResult: boolean;
  id?: number;
  runAt?: string;
  overallPassed?: boolean;
  readinessScore?: number;
  items?: ChecklistItem[];
  blockers?: string[];
  warnings?: string[];
  recommendation?: string;
  canEnableLive?: boolean;
}

interface HistoryEntry {
  id: number;
  runAt: string;
  overallPassed: boolean;
  readinessScore: number;
  recommendation: string;
  blockerCount: number;
  warningCount: number;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  safety: Shield,
  strategy: Activity,
  infrastructure: Server,
  risk: AlertTriangle,
  validation: Database,
};

const CATEGORY_ORDER = ["safety", "risk", "infrastructure", "validation", "strategy"];

function groupByCategory(items: ChecklistItem[]) {
  const groups: Record<string, ChecklistItem[]> = {};
  for (const item of items) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  }
  return groups;
}

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 85 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="relative w-28 h-28 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} stroke="#27272a" strokeWidth="8" fill="none" />
        <circle
          cx="50" cy="50" r={r}
          stroke={color}
          strokeWidth="8"
          fill="none"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold" style={{ color }}>{score}</span>
        <span className="text-[10px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

function ItemRow({ item }: { item: ChecklistItem }) {
  const [open, setOpen] = useState(!item.passed);

  return (
    <div className={`rounded-md border ${item.passed ? "border-border/50" : item.required ? "border-red-400/30 bg-red-400/5" : "border-yellow-400/20 bg-yellow-400/5"}`}>
      <div
        className="flex items-start gap-3 p-3 cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        {item.passed
          ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
          : item.required
          ? <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          : <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{item.name}</span>
            {item.required && !item.passed && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-400/10 text-red-400 border border-red-400/20 font-semibold">BLOCKER</span>
            )}
            {!item.required && (
              <span className="text-[10px] text-muted-foreground">(optional)</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{item.message}</div>
        </div>
        {(item.details || item.recommendation) && (
          open ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
      </div>

      {open && (item.details || item.recommendation) && (
        <div className="px-10 pb-3 space-y-1.5">
          {item.details && (
            <div className="text-xs text-muted-foreground">{item.details}</div>
          )}
          {item.recommendation && (
            <div className="text-xs text-blue-400 bg-blue-400/5 border border-blue-400/20 rounded px-2 py-1.5">
              → {item.recommendation}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReadinessChecklistPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [forLive, setForLive] = useState(false);

  const { data: latest, isLoading } = useQuery<ChecklistResult>({
    queryKey: ["/api/readiness/checklist/latest"],
    queryFn: () => fetch(`${API}/readiness/checklist/latest`).then(r => r.json()),
  });

  const { data: history } = useQuery<HistoryEntry[]>({
    queryKey: ["/api/readiness/checklist/history"],
    queryFn: () => fetch(`${API}/readiness/checklist/history?limit=10`).then(r => r.json()),
  });

  const runChecklist = useMutation({
    mutationFn: (fl: boolean) =>
      fetch(`${API}/readiness/checklist/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forLive: fl }),
      }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Checklist complete", description: "Readiness assessment updated" });
      qc.invalidateQueries({ queryKey: ["/api/readiness/checklist/latest"] });
      qc.invalidateQueries({ queryKey: ["/api/readiness/checklist/history"] });
      qc.invalidateQueries({ queryKey: ["/api/deployment/status"] });
    },
  });

  const hasResult = latest?.hasResult && latest.items;
  const groups = hasResult ? groupByCategory(latest.items!) : {};
  const orderedCategories = CATEGORY_ORDER.filter(c => groups[c]?.length > 0);

  const score = latest?.readinessScore ?? 0;
  const passed = latest?.overallPassed ?? false;

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6 border-b border-border flex items-center gap-3">
        <ClipboardCheck className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Readiness Checklist</h1>
          <p className="text-xs text-muted-foreground">Pre-live trading verification — all blockers must be resolved before enabling live mode</p>
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-4xl">
        {/* Score + Run button */}
        <div className="flex items-start gap-6">
          <div className="bg-card border border-border rounded-lg p-6 text-center w-48 flex-shrink-0">
            {hasResult ? <ScoreGauge score={score} /> : (
              <div className="w-28 h-28 mx-auto flex items-center justify-center rounded-full border-4 border-zinc-700 text-muted-foreground text-xs">No data</div>
            )}
            <div className="mt-3 text-xs font-semibold">Readiness Score</div>
            {latest?.runAt && (
              <div className="text-[10px] text-muted-foreground mt-1">
                Last run: {new Date(latest.runAt).toLocaleString()}
              </div>
            )}
          </div>

          <div className="flex-1 space-y-3">
            {/* Overall recommendation */}
            {latest?.recommendation && (
              <div className={`p-3 rounded-lg border text-sm ${passed ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-300" : "border-red-400/30 bg-red-400/5 text-red-300"}`}>
                {latest.recommendation}
              </div>
            )}

            {/* Blockers summary */}
            {(latest?.blockers?.length ?? 0) > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-red-400">Blockers ({latest!.blockers!.length})</div>
                {latest!.blockers!.map((b, i) => (
                  <div key={i} className="text-xs text-red-400/80 flex items-start gap-1.5">
                    <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {b}
                  </div>
                ))}
              </div>
            )}

            {/* Run controls */}
            <div className="flex items-center gap-3 pt-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={forLive}
                  onChange={e => setForLive(e.target.checked)}
                  className="rounded"
                />
                Include live-mode checks (broker account, live gate)
              </label>
              <button
                onClick={() => runChecklist.mutate(forLive)}
                disabled={runChecklist.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
              >
                {runChecklist.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {runChecklist.isPending ? "Running…" : "Run Checklist"}
              </button>
            </div>
          </div>
        </div>

        {/* Checklist items by category */}
        {isLoading && <div className="text-muted-foreground text-sm">Loading…</div>}

        {hasResult && orderedCategories.map(cat => {
          const Icon = CATEGORY_ICONS[cat] ?? ShieldCheck;
          const catItems = groups[cat];
          const allPassed = catItems.every(i => i.passed);
          const hasBlocker = catItems.some(i => !i.passed && i.required);
          return (
            <section key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-4 h-4 ${allPassed ? "text-emerald-400" : hasBlocker ? "text-red-400" : "text-yellow-400"}`} />
                <h2 className="text-sm font-semibold capitalize">{cat}</h2>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${allPassed ? "text-emerald-400 bg-emerald-400/10" : hasBlocker ? "text-red-400 bg-red-400/10" : "text-yellow-400 bg-yellow-400/10"}`}>
                  {catItems.filter(i => i.passed).length}/{catItems.length} passed
                </span>
              </div>
              <div className="space-y-2">
                {catItems.map(item => <ItemRow key={item.id} item={item} />)}
              </div>
            </section>
          );
        })}

        {!hasResult && !isLoading && (
          <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
            <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <div className="text-sm">No checklist run yet</div>
            <div className="text-xs mt-1">Click "Run Checklist" to assess your readiness for live trading</div>
          </div>
        )}

        {/* History */}
        {(history?.length ?? 0) > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground mb-2">Run History</h2>
            <div className="space-y-1.5">
              {history!.map(h => (
                <div key={h.id} className="flex items-center gap-3 text-xs p-2 rounded bg-muted/20 border border-border/50">
                  {h.overallPassed
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  }
                  <span className="text-muted-foreground">{new Date(h.runAt).toLocaleString()}</span>
                  <span className={`font-bold ${h.readinessScore >= 75 ? "text-emerald-400" : h.readinessScore >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                    {h.readinessScore}/100
                  </span>
                  <span className="flex-1 text-muted-foreground truncate">{h.recommendation}</span>
                  {h.blockerCount > 0 && <span className="text-red-400 flex-shrink-0">{h.blockerCount} blocker{h.blockerCount !== 1 ? "s" : ""}</span>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
