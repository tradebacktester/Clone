import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Database, Play, RefreshCw, Upload, AlertTriangle, CheckCircle2,
  XCircle, Clock, BarChart3, TrendingUp, Layers, ChevronRight, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL ?? "";

interface Provider {
  id: string; name: string; priority: number; configured: boolean;
  supportedPairs: string[]; supportedTimeframes: string[];
  maxHistoryDays: Record<string, number>;
}
interface CacheStatus {
  pair: string; timeframe: string; provider: string | null;
  coverageStart: string | null; coverageEnd: string | null;
  totalBars: number; lastUpdated: string | null; isComplete: boolean;
}
interface Session {
  id: number; pair: string; timeframe: string; startDate: string; endDate: string;
  status: string; totalTrades: number; totalCandles: number;
  winRate: string; profitFactor: string; maxDrawdown: string; sharpeRatio: string;
  reportGenerated: boolean; createdAt: string;
}

const PAIRS = ["EURUSD", "GBPUSD", "USDJPY"];
const TIMEFRAMES = ["15m", "1h", "4h", "1d"];

const TF_NOTE: Record<string, string> = {
  "15m": "Real 15M data — Yahoo Finance limited to last 60 days. No synthesis.",
  "1h":  "Real 1H data — Yahoo Finance up to 730 days.",
  "4h":  "Real 1H downsampled to 4H — Yahoo Finance up to 730 days.",
  "1d":  "Real Daily data — Yahoo Finance up to 10 years.",
};

const STATUS_BADGE: Record<string, { color: string; icon: React.ReactNode }> = {
  pending:  { color: "bg-gray-500",   icon: <Clock className="w-3 h-3" /> },
  running:  { color: "bg-blue-500",   icon: <RefreshCw className="w-3 h-3 animate-spin" /> },
  complete: { color: "bg-green-600",  icon: <CheckCircle2 className="w-3 h-3" /> },
  failed:   { color: "bg-red-600",    icon: <XCircle className="w-3 h-3" /> },
};

const GRADE_COLOR: Record<string, string> = {
  A: "text-green-400", B: "text-green-300", C: "text-yellow-400",
  D: "text-orange-400", F: "text-red-400",
};

export default function Historical() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [pair, setPair] = useState("EURUSD");
  const [timeframe, setTimeframe] = useState("4h");
  const [startDate, setStartDate] = useState("2022-01-01");
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: provData, isLoading: provLoading } = useQuery({
    queryKey: ["/api/historical/providers"],
    queryFn: () => fetch(`${API}/api/historical/providers`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: statusData } = useQuery({
    queryKey: ["/api/historical/data-status"],
    queryFn: () => fetch(`${API}/api/historical/data-status`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: sessionsData, isLoading: sessLoading } = useQuery({
    queryKey: ["/api/historical/sessions"],
    queryFn: () => fetch(`${API}/api/historical/sessions`).then(r => r.json()),
    refetchInterval: 5000,
  });

  const fetchMut = useMutation({
    mutationFn: (params: { pair: string; timeframe: string; startDate: string; endDate: string; forceRefresh?: boolean }) =>
      fetch(`${API}/api/historical/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      }).then(r => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/historical/data-status"] });
      if (data.error) {
        toast({ title: "Fetch failed", description: data.error, variant: "destructive" });
      } else {
        toast({ title: "Data fetched", description: `${data.candles} candles from ${data.source}` });
      }
    },
  });

  const runMut = useMutation({
    mutationFn: (config: { pair: string; timeframe: string; startDate: string; endDate: string }) =>
      fetch(`${API}/api/historical/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      }).then(r => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/historical/sessions"] });
      if (data.error) {
        toast({ title: "Run failed", description: data.error, variant: "destructive" });
      } else {
        toast({ title: "Validation started", description: `Session #${data.sessionId}` });
      }
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      fetch(`${API}/api/historical/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/historical/sessions"] }),
  });

  const providers: Provider[] = provData?.providers ?? [];
  const statuses: CacheStatus[] = statusData?.statuses ?? [];
  const sessions: Session[] = sessionsData?.sessions ?? [];

  const relevantStatus = statuses.filter(s => s.pair === pair && s.timeframe === timeframe);
  const cacheHit = relevantStatus.find(s => s.isComplete);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Database className="w-7 h-7 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Historical Validation</h1>
          <p className="text-sm text-gray-400">Real market data only — no synthetic candles</p>
        </div>
      </div>

      {/* 15M warning */}
      {timeframe === "15m" && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertDescription className="text-amber-300">
            <strong>15M Limitation:</strong> Yahoo Finance provides real 15M data for the last 60 days only.
            Validation will only cover periods with actual real candles — no synthesis.
            For longer 15M history, upload an MT5 or local CSV file.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Config panel ── */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Play className="w-4 h-4 text-green-400" />
                Run Validation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Pair</label>
                <Select value={pair} onValueChange={setPair}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAIRS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400">Timeframe</label>
                <Select value={timeframe} onValueChange={setTimeframe}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEFRAMES.map(tf => <SelectItem key={tf} value={tf}>{tf}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">{TF_NOTE[timeframe]}</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded px-3 py-2 text-sm"
                />
              </div>

              {cacheHit && (
                <div className="bg-green-900/20 border border-green-800/40 rounded p-2 text-xs text-green-400">
                  ✅ {cacheHit.totalBars.toLocaleString()} bars cached from {cacheHit.provider}
                  <br />{cacheHit.coverageStart?.slice(0, 10)} → {cacheHit.coverageEnd?.slice(0, 10)}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-blue-700 text-blue-400 hover:bg-blue-900/20"
                  disabled={fetchMut.isPending}
                  onClick={() => fetchMut.mutate({ pair, timeframe, startDate, endDate })}
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${fetchMut.isPending ? "animate-spin" : ""}`} />
                  Fetch Data
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  disabled={runMut.isPending}
                  onClick={() => runMut.mutate({ pair, timeframe, startDate, endDate })}
                >
                  <Play className="w-3 h-3 mr-1" />
                  Validate
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Upload CSV ── */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Upload className="w-4 h-4 text-purple-400" />
                Upload Historical Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-gray-400">
                Upload MT5 exported CSV or any OHLCV CSV file to enable longer-history validation.
              </p>
              <CsvUploader toast={toast} qc={qc} />
            </CardContent>
          </Card>
        </div>

        {/* ── Provider status + session list ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Providers */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                Data Providers (priority order)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {provLoading ? (
                <p className="text-gray-500 text-sm">Loading providers…</p>
              ) : (
                <div className="space-y-2">
                  {providers.map(p => (
                    <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 w-4">{p.priority}</span>
                        <span className="text-sm text-white">{p.name}</span>
                        {p.configured
                          ? <Badge className="bg-green-700/30 text-green-400 text-xs px-1 py-0">Active</Badge>
                          : <Badge className="bg-gray-700/30 text-gray-500 text-xs px-1 py-0">Not configured</Badge>}
                      </div>
                      <div className="text-xs text-gray-500">
                        {p.supportedTimeframes.join(", ")} · up to {Math.max(...Object.values(p.maxHistoryDays))}d
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sessions */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-orange-400" />
                Validation Sessions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sessLoading ? (
                <p className="text-gray-500 text-sm">Loading…</p>
              ) : sessions.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-6">
                  No sessions yet. Configure above and click Validate.
                </p>
              ) : (
                <div className="space-y-2">
                  {sessions.map(s => {
                    const badge = STATUS_BADGE[s.status] ?? STATUS_BADGE["pending"]!;
                    return (
                      <div key={s.id} className="flex items-center justify-between bg-gray-800/40 rounded-lg p-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-white text-xs ${badge.color}`}>
                            {badge.icon} {s.status}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-white">
                              {s.pair} {s.timeframe} · {s.startDate} → {s.endDate}
                            </div>
                            <div className="text-xs text-gray-500">
                              {s.totalTrades} trades · WR {parseFloat(s.winRate).toFixed(1)}% · PF {parseFloat(s.profitFactor).toFixed(2)} · SR {parseFloat(s.sharpeRatio).toFixed(2)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {s.status === "complete" && (
                            <Link href={`/historical-analytics?id=${s.id}`}>
                              <Button size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300 h-7 px-2">
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                            </Link>
                          )}
                          <Button
                            size="sm" variant="ghost"
                            className="text-red-500 hover:text-red-400 h-7 px-2"
                            onClick={() => deleteMut.mutate(s.id)}
                          >
                            <XCircle className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Data coverage grid */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-400" />
            Cached Data Coverage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-800">
                  <th className="text-left py-2 pr-4">Pair</th>
                  {TIMEFRAMES.map(tf => (
                    <th key={tf} className="text-center py-2 px-2">{tf}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PAIRS.map(p => (
                  <tr key={p} className="border-b border-gray-800/50">
                    <td className="py-2 pr-4 text-white font-medium">{p}</td>
                    {TIMEFRAMES.map(tf => {
                      const s = statuses.find(st => st.pair === p && st.timeframe === tf);
                      return (
                        <td key={tf} className="py-2 px-2 text-center">
                          {s?.isComplete ? (
                            <div className="text-xs">
                              <div className="text-green-400">{s.totalBars.toLocaleString()} bars</div>
                              <div className="text-gray-500">{s.coverageStart?.slice(0,10)}</div>
                            </div>
                          ) : (
                            <span className="text-gray-600 text-xs">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 bg-blue-900/20 border border-blue-800/40 rounded-lg p-3">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-300 space-y-1">
          <p><strong>Provider Architecture:</strong> The engine tries providers in priority order (OANDA → Dukascopy → HistData → MT5 CSV → Yahoo Finance → Local CSV). Only real data is used — no synthetic candles.</p>
          <p><strong>To add more data:</strong> Configure OANDA_API_KEY env var, or upload MT5/CSV files to unlock longer history and higher-quality intraday data.</p>
        </div>
      </div>
    </div>
  );
}

function CsvUploader({ toast, qc }: { toast: ReturnType<typeof useToast>["toast"]; qc: ReturnType<typeof useQueryClient> }) {
  const [uploading, setUploading] = useState(false);
  const [csvType, setCsvType] = useState<"mt5" | "local">("mt5");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const resp = await fetch("/api/historical/upload-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: csvType, filename: file.name, content: b64 }),
      });
      const data = await resp.json();
      if (data.error) {
        toast({ title: "Upload failed", description: data.error, variant: "destructive" });
      } else {
        toast({ title: "CSV uploaded", description: data.message });
        qc.invalidateQueries({ queryKey: ["/api/historical/providers"] });
      }
    } catch (err) {
      toast({ title: "Upload error", description: String(err), variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <Select value={csvType} onValueChange={v => setCsvType(v as "mt5" | "local")}>
        <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-xs h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mt5">MT5 Export (EURUSD_M15_2020.csv)</SelectItem>
          <SelectItem value="local">Generic CSV (datetime,o,h,l,c,v)</SelectItem>
        </SelectContent>
      </Select>
      <label className={`flex items-center justify-center gap-2 w-full py-2 px-3 rounded border border-dashed text-xs cursor-pointer transition-colors
        ${uploading ? "border-gray-600 text-gray-600" : "border-purple-700 text-purple-400 hover:border-purple-500 hover:text-purple-300"}`}>
        <Upload className="w-3 h-3" />
        {uploading ? "Uploading…" : "Choose CSV file"}
        <input type="file" accept=".csv,.txt" className="hidden" disabled={uploading} onChange={handleFile} />
      </label>
    </div>
  );
}
