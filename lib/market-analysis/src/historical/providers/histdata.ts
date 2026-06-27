import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import type { Pair, Timeframe } from "../../types.js";
import type { IMarketDataProvider, FetchResult, Candle, DateRange } from "./base.js";
import { emptyResult, BAR_MS, expectedBarCount } from "./base.js";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "market-data", "histdata");

const PAIR_KEYS: Record<Pair, string[]> = {
  EURUSD: ["EURUSD"],
  GBPUSD: ["GBPUSD"],
  USDJPY: ["USDJPY"],
};

/**
 * Parse a HistData.com ASCII CSV line.
 *
 * HistData 1M format:
 *   20200102 000100,1.11673,1.11675,1.11666,1.11669,0
 *   (YYYYMMDD HHMMSS, open, high, low, close, volume)
 *
 * HistData 1H format:
 *   20200102 000000,1.11740,1.11795,1.11650,1.11673,0
 */
function parseHistDataLine(line: string): Candle | null {
  const sep = line.includes(";") ? ";" : ",";
  const parts = line.split(sep).map(p => p.trim());
  if (parts.length < 5) return null;

  const dtStr = parts[0]!.trim();
  const o = parseFloat(parts[1]!);
  const h = parseFloat(parts[2]!);
  const l = parseFloat(parts[3]!);
  const c = parseFloat(parts[4]!);
  const v = parts[5] != null ? parseFloat(parts[5]) : 0;

  if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) return null;
  if (h < l || h < Math.min(o, c) || l > Math.max(o, c)) return null;

  // Parse "YYYYMMDD HHMMSS" or "YYYYMMDD HH:MM:SS"
  let time: Date;
  try {
    const normalized = dtStr.replace(/(\d{4})(\d{2})(\d{2})\s(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6Z")
                            .replace(/(\d{4})(\d{2})(\d{2})\s(\d{2}):(\d{2}):(\d{2})/, "$1-$2-$3T$4:$5:$6Z");
    time = new Date(normalized);
    if (isNaN(time.getTime())) return null;
  } catch {
    return null;
  }

  return { time, open: o, high: h, low: l, close: c, volume: isFinite(v) ? v : 0 };
}

async function readHistDataFile(filePath: string): Promise<Candle[]> {
  return new Promise((resolve, reject) => {
    const candles: Candle[] = [];
    const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
    let linesRead = 0;
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      // Skip header: starts with letters or '<'
      if (linesRead === 0 && (trimmed[0]!.match(/[a-zA-Z<]/))) return;
      linesRead++;
      const c = parseHistDataLine(trimmed);
      if (c) candles.push(c);
    });
    rl.on("close", () => resolve(candles));
    rl.on("error", reject);
  });
}

/**
 * Aggregate 1M candles into a target timeframe.
 * Only produces complete bars — partial bars at the boundary are dropped.
 */
function aggregateTo(candles: Candle[], tf: Timeframe): Candle[] {
  if (tf === "15m") return aggregateByMs(candles, BAR_MS["15m"], alignTo15m);
  if (tf === "1h")  return aggregateByMs(candles, BAR_MS["1h"],  alignToHour);
  if (tf === "4h")  return aggregateByMs(candles, BAR_MS["4h"],  alignTo4h);
  if (tf === "1d")  return aggregateByMs(candles, BAR_MS["1d"],  alignToDay);
  return candles;
}

function alignTo15m(t: Date): number {
  const d = new Date(t);
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 15) * 15, 0, 0);
  return d.getTime();
}

function alignToHour(t: Date): number {
  const d = new Date(t);
  d.setUTCMinutes(0, 0, 0);
  return d.getTime();
}

function alignTo4h(t: Date): number {
  const d = new Date(t);
  const h = d.getUTCHours();
  d.setUTCHours(h - (h % 4), 0, 0, 0);
  return d.getTime();
}

function alignToDay(t: Date): number {
  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function aggregateByMs(
  candles: Candle[],
  barMs: number,
  alignFn: (t: Date) => number,
): Candle[] {
  if (candles.length === 0) return [];

  const buckets = new Map<number, Candle[]>();
  for (const c of candles) {
    const key = alignFn(c.time);
    const bucket = buckets.get(key) ?? [];
    bucket.push(c);
    buckets.set(key, bucket);
  }

  const result: Candle[] = [];
  for (const [key, bars] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    if (bars.length === 0) continue;
    result.push({
      time: new Date(key),
      open: bars[0]!.open,
      high: Math.max(...bars.map(b => b.high)),
      low: Math.min(...bars.map(b => b.low)),
      close: bars[bars.length - 1]!.close,
      volume: bars.reduce((s, b) => s + b.volume, 0),
    });
  }
  return result;
}

function detectGaps(candles: Candle[], tf: Timeframe): DateRange[] {
  if (candles.length < 2) return [];
  const barMs = BAR_MS[tf];
  const maxGap = barMs * 4;
  const gaps: DateRange[] = [];
  for (let i = 1; i < candles.length; i++) {
    const gap = candles[i]!.time.getTime() - candles[i - 1]!.time.getTime();
    const daysBetween = gap / 86400000;
    const isWeekend = daysBetween >= 2 && daysBetween <= 3;
    if (!isWeekend && gap > maxGap) {
      gaps.push({ start: candles[i - 1]!.time, end: candles[i]!.time, reason: "HistData: missing bars" });
    }
  }
  return gaps;
}

function findFiles(pair: Pair): string[] {
  if (!fs.existsSync(UPLOAD_DIR)) return [];
  const keys = PAIR_KEYS[pair] ?? [pair];
  return fs
    .readdirSync(UPLOAD_DIR)
    .filter(f => f.toLowerCase().endsWith(".csv"))
    .filter(f => {
      const up = f.toUpperCase();
      return keys.some(k => up.includes(k.toUpperCase()));
    })
    .map(f => path.join(UPLOAD_DIR, f));
}

/**
 * HistData.com Provider — real CSV file reader.
 *
 * Place HistData ASCII CSV exports in: uploads/market-data/histdata/
 *
 * Download from: https://www.histdata.com/download-free-forex-historical-data/
 *
 * Supported formats (auto-detected):
 *   • 1M ASCII CSV  — HISTDATA_COM_FX_EURUSD_M1_2020.csv
 *   • 1H ASCII CSV  — HISTDATA_COM_FX_EURUSD_H1_2020.csv
 *
 * 1M files are aggregated to the requested timeframe (15M/1H/4H/1D) on-the-fly.
 * The provider scans ALL matching files for the pair and merges them so you can
 * drop multiple year-files and get a continuous series.
 */
export class HistDataProvider implements IMarketDataProvider {
  readonly name = "HistData.com";
  readonly id = "histdata";
  readonly priority = 7;

  supportsPair(pair: Pair): boolean {
    return ["EURUSD", "GBPUSD", "USDJPY"].includes(pair);
  }

  supportsTimeframe(tf: Timeframe): boolean {
    return ["15m", "1h", "4h", "1d"].includes(tf);
  }

  maxHistoryDays(_tf: Timeframe): number {
    return 365 * 25;
  }

  isConfigured(): boolean {
    if (!fs.existsSync(UPLOAD_DIR)) return false;
    return fs.readdirSync(UPLOAD_DIR).some(f => f.toLowerCase().endsWith(".csv"));
  }

  async fetchCandles(pair: Pair, tf: Timeframe, start: Date, end: Date): Promise<FetchResult> {
    const files = findFiles(pair);
    if (files.length === 0) {
      return emptyResult(
        this.id,
        pair,
        tf,
        start,
        end,
        `No HistData CSV files found for ${pair} in ${UPLOAD_DIR}. ` +
        `Download from histdata.com and place files there. Filename should contain "${pair}".`,
      );
    }

    // Read all matching files
    const allRaw: Candle[] = [];
    const loadedFiles: string[] = [];
    for (const f of files) {
      try {
        const batch = await readHistDataFile(f);
        if (batch.length > 0) {
          allRaw.push(...batch);
          loadedFiles.push(path.basename(f));
        }
      } catch (err) {
        // Skip unreadable files — they'll appear as gaps
      }
    }

    if (allRaw.length === 0) {
      return emptyResult(this.id, pair, tf, start, end, `Could not parse any candles from HistData files for ${pair}`);
    }

    // Detect source timeframe from bar count/spacing
    const sorted = allRaw.sort((a, b) => a.time.getTime() - b.time.getTime());
    const sampleGap = sorted.length >= 2
      ? sorted[1]!.time.getTime() - sorted[0]!.time.getTime()
      : BAR_MS["1h"];

    // Aggregate if source is finer than target
    let aggregated: Candle[];
    if (sampleGap <= BAR_MS["15m"] && tf !== "15m") {
      aggregated = aggregateTo(sorted, tf);
    } else if (sampleGap <= BAR_MS["1h"] && (tf === "4h" || tf === "1d")) {
      aggregated = aggregateTo(sorted, tf);
    } else {
      aggregated = sorted; // already at correct (or coarser) timeframe
    }

    // Filter to requested date range
    const filtered = aggregated.filter(c => c.time >= start && c.time <= end);

    // Deduplicate by timestamp
    const seen = new Set<number>();
    const deduped = filtered.filter(c => {
      const k = c.time.getTime();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const gaps = detectGaps(deduped, tf);
    const warnings: string[] = [];
    if (deduped.length === 0) {
      warnings.push(`HistData files loaded (${loadedFiles.join(", ")}) but no candles fall in the requested range ${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`);
    }

    const sourceLabel = sampleGap <= BAR_MS["15m"] ? "1M" : "1H";
    const label = sampleGap < BAR_MS[tf] ? `${this.name} (${sourceLabel}→${tf})` : this.name;

    return {
      candles: deduped,
      provider: label,
      pair,
      timeframe: tf,
      requestedStart: start,
      requestedEnd: end,
      actualStart: deduped[0]?.time ?? null,
      actualEnd: deduped[deduped.length - 1]?.time ?? null,
      gaps,
      totalExpected: expectedBarCount(tf, start, end),
      notes: [
        `Loaded ${allRaw.toLocaleString().replace(",", "")} raw bars from ${loadedFiles.length} file(s): ${loadedFiles.join(", ")}`,
        `Aggregated to ${tf} → ${deduped.length} bars`,
      ],
      warnings,
    };
  }
}
