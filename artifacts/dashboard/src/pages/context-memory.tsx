import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Camera, Brain, Clock, FileText, Search, ChevronRight,
  Trash2, Eye, Upload, CheckCircle, AlertCircle, Play,
  Shield, Target, TrendingUp, BookOpen, Minus, XCircle,
  Image, MessageSquare, BarChart3, Filter, RefreshCw,
} from "lucide-react";

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(body?.error ?? `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimelineEvent {
  stage:       string;
  title:       string;
  description: string | null;
  source:      string;
  occurredAt:  string;
  iconType:    string | null;
  type:        "engine" | "context" | "screenshot";
  meta?:       Record<string, unknown> | null;
}

interface Screenshot {
  id:            string;
  tradeId:       number | null;
  stage:         string;
  timeframe:     string | null;
  pair:          string | null;
  notes:         string | null;
  tags:          string[] | null;
  mimeType:      string;
  sizeBytes:     number | null;
  thumbnailData: string | null;
  capturedAt:    string | null;
  uploadedAt:    string;
}

interface TradeContext {
  id:                   string;
  tradeId:              number;
  marketRegime:         string | null;
  session:              string | null;
  trendStrength:        string | null;
  liquidityLevel:       string | null;
  spreadPips:           string | null;
  volatility:           string | null;
  volatilityScore:      string | null;
  dayOfWeek:            string | null;
  sessionOpenClose:     string | null;
  newsContext:          { overallImpact: string; events: { title: string; impact: string }[] } | null;
  htfBias:              string | null;
  premiumDiscountState: string | null;
  supplyStrength:       string | null;
  demandStrength:       string | null;
  liquidityScore:       string | null;
  amdStage:             string | null;
  confirmationQuality:  string | null;
  ruleEvaluationSummary: Record<string, { passed: boolean; value?: number; tqi?: number; grade?: string; score?: number }> | null;
  manualNotes:          string | null;
  confidence:           number | null;
  emotionTag:           string | null;
  reasonAccepted:       string | null;
  reasonRejected:       string | null;
  lessonsLearned:       string | null;
  createdAt:            string;
  updatedAt:            string;
}

interface SearchResult {
  total:   number;
  results: TradeContext[];
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────

type TabId = "timeline" | "screenshots" | "context" | "notes" | "search";

function TabButton({ id, active, label, icon: Icon, onClick }: {
  id: TabId; active: boolean; label: string; icon: React.ElementType; onClick: (id: TabId) => void;
}) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? "border-indigo-500 text-indigo-400"
          : "border-transparent text-slate-400 hover:text-slate-200"
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

function RegimePill({ regime }: { regime: string | null | undefined }) {
  if (!regime) return <span className="text-slate-500 text-xs">—</span>;
  const map: Record<string, string> = {
    trending:       "bg-emerald-500/20 text-emerald-400",
    ranging:        "bg-blue-500/20 text-blue-400",
    volatile:       "bg-amber-500/20 text-amber-400",
    low_volatility: "bg-slate-500/20 text-slate-400",
  };
  return (
    <span className={`text-xs font-medium rounded px-2 py-0.5 ${map[regime] ?? "bg-slate-700 text-slate-300"}`}>
      {regime.replace(/_/g, " ")}
    </span>
  );
}

function EmotionTag({ emotion }: { emotion: string | null | undefined }) {
  if (!emotion) return <span className="text-slate-500 text-xs">not tagged</span>;
  const map: Record<string, string> = {
    calm:        "bg-teal-500/20 text-teal-400",
    confident:   "bg-emerald-500/20 text-emerald-400",
    disciplined: "bg-blue-500/20 text-blue-400",
    uncertain:   "bg-amber-500/20 text-amber-400",
    fearful:     "bg-red-500/20 text-red-400",
    fomo:        "bg-orange-500/20 text-orange-400",
  };
  return (
    <span className={`text-xs font-medium rounded px-2 py-0.5 ${map[emotion] ?? "bg-slate-700 text-slate-300"}`}>
      {emotion}
    </span>
  );
}

function FieldRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-4 py-1.5 border-b border-slate-800/50 last:border-0">
      <span className="text-xs text-slate-500 shrink-0 w-40">{label}</span>
      <span className={`text-xs text-right ${mono ? "font-mono text-slate-300" : "text-slate-200"}`}>{value}</span>
    </div>
  );
}

// ─── Timeline event icon ──────────────────────────────────────────────────────

function TimelineIcon({ iconType, type }: { iconType: string | null; type: string }) {
  const base  = "w-8 h-8 rounded-full flex items-center justify-center shrink-0";
  const color = type === "engine" ? "bg-indigo-500/20 text-indigo-400"
    : type === "screenshot"       ? "bg-violet-500/20 text-violet-400"
    : "bg-slate-600/40 text-slate-300";

  const icons: Record<string, React.ElementType> = {
    play:         Play,
    check:        CheckCircle,
    shield:       Shield,
    "minus-circle": Minus,
    "trending-up": TrendingUp,
    alert:        AlertCircle,
    target:       Target,
    "x-circle":   XCircle,
    camera:       Camera,
    review:       BookOpen,
    lesson_learned: BookOpen,
    entry:        Play,
    exit:         CheckCircle,
    market_scan:  BarChart3,
    screenshot_saved: Camera,
    note_added:   MessageSquare,
  };

  const Icon = icons[iconType ?? ""] ?? Clock;
  return <div className={`${base} ${color}`}><Icon size={14} /></div>;
}

// ─── Timeline Tab ─────────────────────────────────────────────────────────────

function TimelineTab({ tradeId }: { tradeId: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["context-timeline", tradeId],
    queryFn: () => apiFetch<{ tradeId: number; count: number; events: TimelineEvent[] }>(`/memory/context-timeline/${tradeId}`),
    enabled: tradeId > 0,
  });

  if (isLoading) return <div className="flex justify-center py-16 text-slate-500 text-sm">Loading timeline…</div>;
  if (error)     return <div className="text-red-400 text-sm p-4">Failed to load timeline: {String(error)}</div>;
  if (!data || data.events.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-500">
      <Clock size={32} className="opacity-40" />
      <p className="text-sm">No timeline events yet for Trade #{tradeId}</p>
    </div>
  );

  return (
    <div className="p-4 space-y-1">
      <p className="text-xs text-slate-500 mb-4">{data.count} events across engine, context, and screenshot sources</p>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-4 bottom-4 w-px bg-slate-700/60" />
        <div className="space-y-2">
          {data.events.map((ev, i) => (
            <div key={i} className="flex gap-4 relative">
              <TimelineIcon iconType={ev.iconType} type={ev.type} />
              <div className="flex-1 min-w-0 pb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-200">{ev.title}</span>
                  <span className={`text-[10px] rounded px-1.5 py-0.5 ${
                    ev.type === "engine"     ? "bg-indigo-500/15 text-indigo-400" :
                    ev.type === "screenshot" ? "bg-violet-500/15 text-violet-400" :
                    "bg-slate-700 text-slate-400"
                  }`}>{ev.type}</span>
                  {ev.source === "user" && (
                    <span className="text-[10px] rounded px-1.5 py-0.5 bg-amber-500/15 text-amber-400">manual</span>
                  )}
                </div>
                {ev.description && <p className="text-xs text-slate-400 mt-0.5">{ev.description}</p>}
                <p className="text-[10px] text-slate-600 mt-0.5 font-mono">
                  {new Date(ev.occurredAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Screenshots Tab ──────────────────────────────────────────────────────────

const STAGES = ["before_entry","entry","during_trade","break_even","partial_tp","htf_analysis","ltf_analysis","after_exit","custom"];

function ScreenshotsTab({ tradeId }: { tradeId: number }) {
  const queryClient = useQueryClient();
  const [selected,  setSelected]  = useState<Screenshot | null>(null);
  const [showFull,  setShowFull]  = useState(false);
  const [addForm,   setAddForm]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  // Form state
  const [stage,    setStage]    = useState("before_entry");
  const [tf,       setTf]       = useState("4h");
  const [notes,    setNotes]    = useState("");
  const [imgData,  setImgData]  = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["trade-screenshots", tradeId],
    queryFn: () => apiFetch<{ tradeId: number; total: number; byStage: Record<string,number>; screenshots: Screenshot[] }>(`/memory/screenshots/${tradeId}`),
    enabled: tradeId > 0,
  });

  const deleteShot = useMutation({
    mutationFn: (id: string) => apiFetch(`/memory/screenshots/${id}`, { method: "DELETE" }),
    onSuccess: () => { setSelected(null); queryClient.invalidateQueries({ queryKey: ["trade-screenshots", tradeId] }); },
  });

  const fullImage = useQuery({
    queryKey: ["screenshot-full", selected?.id],
    queryFn: () => apiFetch<{ id: string; imageData: string | null; mimeType: string }>(`/memory/screenshot/${selected!.id}/image`),
    enabled: showFull && !!selected,
  });

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImgData(String(ev.target?.result ?? ""));
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!imgData) { setUploadErr("Please select an image file"); return; }
    setUploading(true); setUploadErr(null);
    try {
      await apiFetch("/memory/screenshots", {
        method: "POST",
        body: JSON.stringify({ tradeId, stage, timeframe: tf, notes: notes || undefined, imageData: imgData }),
      });
      queryClient.invalidateQueries({ queryKey: ["trade-screenshots", tradeId] });
      setAddForm(false); setImgData(""); setNotes(""); setStage("before_entry");
    } catch (err) {
      setUploadErr(String(err));
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) return <div className="flex justify-center py-16 text-slate-500 text-sm">Loading screenshots…</div>;

  const screenshots = data?.screenshots ?? [];

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-slate-500">
          {data?.total ?? 0} screenshots &nbsp;·&nbsp;
          {Object.entries(data?.byStage ?? {}).map(([s, n]) => `${s}: ${n}`).join(" · ")}
        </div>
        <button
          onClick={() => setAddForm(!addForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
        >
          <Upload size={12} /> Upload Screenshot
        </button>
      </div>

      {/* Upload form */}
      {addForm && (
        <div className="mb-4 p-4 bg-slate-800/60 rounded-lg border border-slate-700 space-y-3">
          <p className="text-sm font-medium text-slate-200">Upload Chart Screenshot</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Stage</label>
              <select value={stage} onChange={e => setStage(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200">
                {STAGES.map(s => <option key={s} value={s}>{s.replace(/_/g," ")}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Timeframe</label>
              <select value={tf} onChange={e => setTf(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200">
                {["1m","5m","15m","30m","1h","4h","1d"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Image File</label>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileInput}
              className="w-full text-xs text-slate-300 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-slate-700 file:text-slate-200 file:cursor-pointer" />
            {imgData && <p className="text-[10px] text-emerald-400 mt-1">✓ Image loaded ({Math.round(imgData.length / 1024)}KB)</p>}
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Notes (optional)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Describe what you see…"
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600" />
          </div>
          {uploadErr && <p className="text-xs text-red-400">{uploadErr}</p>}
          <div className="flex gap-2">
            <button onClick={handleUpload} disabled={uploading} className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded transition-colors">
              {uploading ? "Uploading…" : "Save Screenshot"}
            </button>
            <button onClick={() => { setAddForm(false); setUploadErr(null); }} className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {screenshots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-500">
          <Camera size={32} className="opacity-40" />
          <p className="text-sm">No screenshots yet for Trade #{tradeId}</p>
          <p className="text-xs">Upload chart screenshots to build visual memory</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {screenshots.map(ss => (
            <div key={ss.id} onClick={() => setSelected(ss)}
              className={`relative cursor-pointer rounded-lg border overflow-hidden bg-slate-900 group transition-all ${
                selected?.id === ss.id ? "border-indigo-500" : "border-slate-700 hover:border-slate-500"
              }`}
            >
              {ss.thumbnailData ? (
                <img src={ss.thumbnailData} alt={ss.stage} className="w-full h-28 object-cover" />
              ) : (
                <div className="w-full h-28 flex items-center justify-center bg-slate-800">
                  <Image size={24} className="text-slate-600" />
                </div>
              )}
              <div className="p-2">
                <p className="text-[10px] font-medium text-slate-300">{ss.stage.replace(/_/g," ")}</p>
                <p className="text-[10px] text-slate-500">{ss.timeframe ?? "—"} · {ss.pair ?? "—"}</p>
                {ss.notes && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{ss.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <div className="mt-4 p-4 bg-slate-800/60 rounded-lg border border-slate-700">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-slate-200">{selected.stage.replace(/_/g," ")}</p>
              <p className="text-xs text-slate-500">{selected.timeframe} · {selected.pair} · {selected.mimeType} · {Math.round((selected.sizeBytes ?? 0)/1024)}KB</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowFull(!showFull)}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded">
                <Eye size={11} /> {showFull ? "Hide" : "Full Image"}
              </button>
              <button onClick={() => deleteShot.mutate(selected.id)}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-red-900/40 hover:bg-red-800/50 text-red-400 rounded">
                <Trash2 size={11} /> Delete
              </button>
            </div>
          </div>
          {selected.notes && <p className="text-xs text-slate-300 mb-2">{selected.notes}</p>}
          {selected.tags && selected.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {selected.tags.map(t => (
                <span key={t} className="text-[10px] bg-slate-700 text-slate-300 rounded px-1.5 py-0.5">{t}</span>
              ))}
            </div>
          )}
          {showFull && (
            <div className="mt-3 rounded overflow-hidden border border-slate-700">
              {fullImage.isLoading ? (
                <div className="h-40 flex items-center justify-center text-slate-500 text-xs">Loading full image…</div>
              ) : fullImage.data?.imageData ? (
                <img src={fullImage.data.imageData} alt="Full chart" className="w-full" />
              ) : (
                <div className="h-40 flex items-center justify-center text-slate-500 text-xs">No image data</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Context Tab ──────────────────────────────────────────────────────────────

function ContextTab({ tradeId }: { tradeId: number }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["trade-context", tradeId],
    queryFn: () => apiFetch<TradeContext>(`/memory/context/${tradeId}`),
    enabled: tradeId > 0,
    retry: false,
  });

  if (isLoading) return <div className="flex justify-center py-16 text-slate-500 text-sm">Loading context…</div>;
  if (error && String(error).includes("404")) return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-500">
      <Brain size={32} className="opacity-40" />
      <p className="text-sm">No context record yet for Trade #{tradeId}</p>
      <p className="text-xs">Context is auto-populated when the trade opens, or POST to /memory/context/{tradeId}</p>
    </div>
  );
  if (error) return <div className="text-red-400 text-sm p-4">Error: {String(error)}</div>;
  if (!data)  return null;

  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Market Context */}
      <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={14} className="text-blue-400" />
          <h3 className="text-sm font-medium text-slate-200">Market Context</h3>
        </div>
        <FieldRow label="Regime"          value={<RegimePill regime={data.marketRegime} />} />
        <FieldRow label="Session"         value={data.session ?? "—"} />
        <FieldRow label="Day"             value={data.dayOfWeek ?? "—"} />
        <FieldRow label="Session Part"    value={data.sessionOpenClose ?? "—"} />
        <FieldRow label="Trend Strength"  value={data.trendStrength ? `${parseFloat(data.trendStrength).toFixed(1)}%` : "—"} mono />
        <FieldRow label="Volatility"      value={data.volatility ?? "—"} />
        <FieldRow label="Vol. Score"      value={data.volatilityScore ? `${parseFloat(data.volatilityScore).toFixed(1)}` : "—"} mono />
        <FieldRow label="Liquidity"       value={data.liquidityLevel ?? "—"} />
        <FieldRow label="Spread"          value={data.spreadPips ? `${parseFloat(data.spreadPips).toFixed(1)} pips` : "—"} mono />
        {data.newsContext && (
          <FieldRow label="News"
            value={<span className={`text-xs px-1.5 py-0.5 rounded ${
              data.newsContext.overallImpact === "high_impact" ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400"
            }`}>{data.newsContext.overallImpact}</span>}
          />
        )}
      </div>

      {/* Strategy Context */}
      <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target size={14} className="text-emerald-400" />
          <h3 className="text-sm font-medium text-slate-200">Strategy Context</h3>
        </div>
        <FieldRow label="HTF Bias"          value={data.htfBias ?? "—"} />
        <FieldRow label="P/D State"         value={data.premiumDiscountState ?? "—"} />
        <FieldRow label="AMD Stage"         value={data.amdStage ?? "—"} />
        <FieldRow label="Supply Strength"   value={data.supplyStrength ? `${parseFloat(data.supplyStrength).toFixed(1)}` : "—"} mono />
        <FieldRow label="Demand Strength"   value={data.demandStrength ? `${parseFloat(data.demandStrength).toFixed(1)}` : "—"} mono />
        <FieldRow label="Liquidity Score"   value={data.liquidityScore ? `${parseFloat(data.liquidityScore).toFixed(1)}` : "—"} mono />
        <FieldRow label="Conf. Quality"     value={data.confirmationQuality ? `${parseFloat(data.confirmationQuality).toFixed(1)}` : "—"} mono />
        <FieldRow label="TI Score"          value={data.traderIntelligenceScore ? `${parseFloat(String(data.traderIntelligenceScore)).toFixed(1)}` : "placeholder"} mono />
        {data.ruleEvaluationSummary && (
          <div className="mt-2">
            <p className="text-[10px] text-slate-500 mb-1">Gate Results</p>
            {Object.entries(data.ruleEvaluationSummary).map(([gate, res]) => (
              <div key={gate} className="flex justify-between items-center py-0.5">
                <span className="text-[10px] text-slate-500">{gate.replace(/Gate$/,"")}</span>
                <span className={`text-[10px] font-medium ${res.passed ? "text-emerald-400" : "text-red-400"}`}>
                  {res.passed ? "✓" : "✗"} {res.tqi?.toFixed(1) ?? res.value?.toFixed(0) ?? ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trader Context */}
      <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={14} className="text-violet-400" />
          <h3 className="text-sm font-medium text-slate-200">Trader Context</h3>
        </div>
        <FieldRow label="Emotion"      value={<EmotionTag emotion={data.emotionTag} />} />
        <FieldRow label="Confidence"   value={data.confidence != null ? `${data.confidence}/100` : "—"} mono />
        {data.reasonAccepted && (
          <div className="py-1.5 border-b border-slate-800/50">
            <p className="text-[10px] text-slate-500 mb-0.5">Reason Accepted</p>
            <p className="text-xs text-slate-300">{data.reasonAccepted}</p>
          </div>
        )}
        {data.reasonRejected && (
          <div className="py-1.5 border-b border-slate-800/50">
            <p className="text-[10px] text-slate-500 mb-0.5">Reason Rejected</p>
            <p className="text-xs text-slate-300">{data.reasonRejected}</p>
          </div>
        )}
        {data.manualNotes && (
          <div className="py-1.5 border-b border-slate-800/50">
            <p className="text-[10px] text-slate-500 mb-0.5">Notes</p>
            <p className="text-xs text-slate-300">{data.manualNotes}</p>
          </div>
        )}
        {data.lessonsLearned && (
          <div className="py-1.5">
            <p className="text-[10px] text-emerald-500 mb-0.5">💡 Lesson Learned</p>
            <p className="text-xs text-emerald-300">{data.lessonsLearned}</p>
          </div>
        )}
        <p className="text-[10px] text-slate-600 mt-2">Updated {new Date(data.updatedAt).toLocaleString()}</p>
      </div>
    </div>
  );
}

// ─── Notes Tab ────────────────────────────────────────────────────────────────

const EMOTIONS = ["calm","confident","disciplined","uncertain","fearful","fomo"];

function NotesTab({ tradeId }: { tradeId: number }) {
  const queryClient = useQueryClient();
  const { data: ctx } = useQuery({
    queryKey:  ["trade-context", tradeId],
    queryFn:   () => apiFetch<TradeContext>(`/memory/context/${tradeId}`),
    enabled:   tradeId > 0,
    retry:     false,
  });

  const [notes,     setNotes]     = useState(ctx?.manualNotes     ?? "");
  const [lesson,    setLesson]    = useState(ctx?.lessonsLearned   ?? "");
  const [reason,    setReason]    = useState(ctx?.reasonAccepted   ?? "");
  const [emotion,   setEmotion]   = useState(ctx?.emotionTag       ?? "");
  const [confidence,setConfidence]= useState(String(ctx?.confidence ?? ""));
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`/memory/context/${tradeId}`, {
        method: "PATCH",
        body: JSON.stringify({
          manualNotes:    notes    || undefined,
          lessonsLearned: lesson   || undefined,
          reasonAccepted: reason   || undefined,
          emotionTag:     emotion  || undefined,
          confidence:     confidence ? parseInt(confidence) : undefined,
          reviewedAt:     new Date().toISOString(),
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["trade-context", tradeId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      // If no context exists, create one first then retry
      try {
        await apiFetch(`/memory/context/${tradeId}`, { method: "POST", body: JSON.stringify({ tradeId }) });
        await apiFetch(`/memory/context/${tradeId}`, {
          method: "PATCH",
          body: JSON.stringify({ manualNotes: notes || undefined, lessonsLearned: lesson || undefined, reasonAccepted: reason || undefined, emotionTag: emotion || undefined }),
        });
        queryClient.invalidateQueries({ queryKey: ["trade-context", tradeId] });
        setSaved(true); setTimeout(() => setSaved(false), 2000);
      } catch {}
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-2xl">
      <div>
        <label className="text-xs text-slate-400 font-medium block mb-1.5">Manual Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
          placeholder="Your observations about this trade setup, execution, or market conditions…"
          className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 resize-y focus:outline-none focus:border-indigo-500" />
      </div>

      <div>
        <label className="text-xs text-slate-400 font-medium block mb-1.5">💡 Lesson Learned</label>
        <textarea value={lesson} onChange={e => setLesson(e.target.value)} rows={3}
          placeholder="What did this trade teach you? What would you do differently?"
          className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 resize-y focus:outline-none focus:border-indigo-500" />
      </div>

      <div>
        <label className="text-xs text-slate-400 font-medium block mb-1.5">Reason Accepted / Rejected</label>
        <input type="text" value={reason} onChange={e => setReason(e.target.value)}
          placeholder="Primary reason for taking or passing this setup…"
          className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-400 font-medium block mb-1.5">Emotion Tag</label>
          <div className="flex flex-wrap gap-2">
            {EMOTIONS.map(e => (
              <button key={e} onClick={() => setEmotion(emotion === e ? "" : e)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  emotion === e ? "bg-violet-500/30 border-violet-500 text-violet-300" : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                }`}>{e}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-400 font-medium block mb-1.5">
            Confidence: <span className="text-indigo-400 font-mono">{confidence || "—"}</span>
          </label>
          <input type="range" min={0} max={100} value={confidence || 0} onChange={e => setConfidence(e.target.value)}
            className="w-full accent-indigo-500" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors">
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
          {saving ? "Saving…" : "Save Notes"}
        </button>
        {saved && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle size={12} /> Saved</span>}
      </div>
    </div>
  );
}

// ─── Search Tab ───────────────────────────────────────────────────────────────

function SearchTab() {
  const [filters, setFilters] = useState({ session: "", regime: "", notes: "", emotionTag: "", dayOfWeek: "" });
  const [submitted, setSubmitted] = useState(false);

  const buildQs = () => {
    const p = new URLSearchParams();
    if (filters.session)    p.set("session",    filters.session);
    if (filters.regime)     p.set("regime",     filters.regime);
    if (filters.notes)      p.set("notes",      filters.notes);
    if (filters.emotionTag) p.set("emotionTag", filters.emotionTag);
    if (filters.dayOfWeek)  p.set("dayOfWeek",  filters.dayOfWeek);
    return p.toString();
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["context-search", filters],
    queryFn:  () => apiFetch<SearchResult>(`/memory/context/search?${buildQs()}`),
    enabled:  submitted,
  });

  const handleSearch = () => { setSubmitted(true); refetch(); };

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Session</label>
          <select value={filters.session} onChange={e => setFilters(f => ({ ...f, session: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200">
            <option value="">Any</option>
            {["london","newyork","asian"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Regime</label>
          <select value={filters.regime} onChange={e => setFilters(f => ({ ...f, regime: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200">
            <option value="">Any</option>
            {["trending","ranging","volatile","low_volatility"].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Emotion</label>
          <select value={filters.emotionTag} onChange={e => setFilters(f => ({ ...f, emotionTag: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200">
            <option value="">Any</option>
            {EMOTIONS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Day</label>
          <select value={filters.dayOfWeek} onChange={e => setFilters(f => ({ ...f, dayOfWeek: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200">
            <option value="">Any</option>
            {["Monday","Tuesday","Wednesday","Thursday","Friday"].map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Search Notes</label>
          <input type="text" value={filters.notes} onChange={e => setFilters(f => ({ ...f, notes: e.target.value }))}
            placeholder="keyword…"
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600" />
        </div>
      </div>

      <button onClick={handleSearch} className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors">
        <Search size={14} /> Search Context Memory
      </button>

      {isLoading && <div className="text-slate-500 text-sm">Searching…</div>}

      {data && (
        <div>
          <p className="text-xs text-slate-500 mb-3">{data.total} results</p>
          {data.results.length === 0 ? (
            <p className="text-sm text-slate-500">No matching context records found.</p>
          ) : (
            <div className="space-y-2">
              {data.results.map(ctx => (
                <div key={ctx.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-mono text-slate-300">Trade #{ctx.tradeId}</span>
                    <RegimePill regime={ctx.marketRegime} />
                    <span className="text-xs text-slate-400">{ctx.session}</span>
                    <span className="text-xs text-slate-400">{ctx.dayOfWeek}</span>
                    <EmotionTag emotion={ctx.emotionTag} />
                  </div>
                  {ctx.manualNotes && <p className="text-xs text-slate-400 mt-1 truncate">{ctx.manualNotes}</p>}
                  {ctx.lessonsLearned && <p className="text-xs text-emerald-400 mt-0.5 truncate">💡 {ctx.lessonsLearned}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ContextMemoryPage() {
  const [tradeIdInput, setTradeIdInput] = useState("");
  const [tradeId,      setTradeId]      = useState(0);
  const [activeTab,    setActiveTab]    = useState<TabId>("timeline");

  const handleLoad = useCallback(() => {
    const id = parseInt(tradeIdInput, 10);
    if (id > 0) { setTradeId(id); setActiveTab("timeline"); }
  }, [tradeIdInput]);

  const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "timeline",    label: "Timeline",    icon: Clock },
    { id: "screenshots", label: "Screenshots", icon: Camera },
    { id: "context",     label: "Context",     icon: Brain },
    { id: "notes",       label: "Notes",       icon: FileText },
    { id: "search",      label: "Search",      icon: Search },
  ];

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <Brain size={18} className="text-violet-400" /> Context &amp; Visual Memory
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Rich episodic memory — market context, chart screenshots, and trader notes for every trade
            </p>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <input
              type="number"
              value={tradeIdInput}
              onChange={e => setTradeIdInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLoad()}
              placeholder="Trade ID…"
              className="w-32 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
            <button onClick={handleLoad}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors">
              <ChevronRight size={14} /> Load
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mt-4 overflow-x-auto border-b-0 -mb-px">
          {TABS.map(t => (
            <TabButton key={t.id} id={t.id} active={activeTab === t.id} label={t.label} icon={t.icon} onClick={setActiveTab} />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tradeId <= 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
            <Brain size={48} className="opacity-20" />
            <p className="text-base">Enter a trade ID above to explore its context memory</p>
            <p className="text-sm">Or use the Search tab to find trades by session, regime, notes, or emotion</p>
            <button onClick={() => setActiveTab("search")}
              className="mt-2 flex items-center gap-1.5 px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors">
              <Search size={14} /> Open Search
            </button>
          </div>
        ) : (
          <>
            {activeTab === "timeline"    && <TimelineTab    tradeId={tradeId} />}
            {activeTab === "screenshots" && <ScreenshotsTab tradeId={tradeId} />}
            {activeTab === "context"     && <ContextTab     tradeId={tradeId} />}
            {activeTab === "notes"       && <NotesTab       tradeId={tradeId} />}
            {activeTab === "search"      && <SearchTab />}
          </>
        )}
        {/* Search tab always available regardless of trade */}
        {tradeId <= 0 && activeTab === "search" && <SearchTab />}
      </div>
    </div>
  );
}
