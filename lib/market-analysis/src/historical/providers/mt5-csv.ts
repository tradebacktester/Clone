import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import type { Pair, Timeframe } from "../../types.js";
import type { IMarketDataProvider, FetchResult, Candle } from "./base.js";
import { emptyResult, BAR_MS } from "./base.js";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "market-data", "mt5");

const PAIR_SUFFIXES: Record<Pair, string[]> = {
  EURUSD: ["EURUSD", "EURUSDm"],
  GBPUSD: ["GBPUSD", "GBPUSDm"],
  USDJPY: ["USDJPY", "USDJPYm"],
};

const TF_STRINGS: Record<Timeframe, string[]> = {
  "15m": ["M15", "15m", "15min"],
  "1h": ["H1", "1h", "60min"],
  "4h": ["H4", "4h", "240min"],
  "1d": ["D1", "1d", "daily"],
};

/**
 * Parse a single MT5 CSV line.
 * MT5 exports two common formats:
 *   Format A (tab-separated): DATE\tTIME\tOPEN\tHIGH\tLOW\tCLOSE\tTICKVOL\tVOL\tSPREAD
 *   Format B (comma-separated): DATE,TIME,OPEN,HIGH,LOW,CLOSE,TICKVOL,VOL,SPREAD
 */
function parseMT5Line(line: string): Candle | null {
  const sep = line.includes("\t") ? "\t" : ",";
  const parts = line.split(sep).map((p) => p.trim());
  if (parts.length < 6) return null;

  const dateStr = parts[0]!;
  const timeStr = parts[1]!;
  const o = parseFloat(parts[2]!);
  const h = parseFloat(parts[3]!);
  const l = parseFloat(parts[4]!);
  const c = parseFloat(parts[5]!);
  const vol = parts[6] != null ? parseFloat(parts[6]!) : 0;

  if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) return null;
  if (h < l || h < Math.min(o, c) || l > Math.max(o, c)) return null;

  let time: Date;
  try {
    time = new Date(`${dateStr}T${timeStr}Z`);
    if (isNaN(time.getTime())) {
      // try space separator: "2020.01.02 00:00"
      const normalized = `${dateStr} ${timeStr}`.replace(/\./g, "-");
      time = new Date(`${normalized}:00Z`);
    }
    if (isNaN(time.getTime())) return null;
  } catch {
    return null;
  }

  return { time, open: o, high: h, low: l, close: c, volume: vol };
}

async function readCsvFile(filePath: string): Promise<Candle[]> {
  return new Promise((resolve, reject) => {
    const candles: Candle[] = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });
    let headerSkipped = false;
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      // Skip header rows
      if (!headerSkipped && (trimmed.toLowerCase().startsWith("date") || trimmed.startsWith("<"))) {
        headerSkipped = true;
        return;
      }
      headerSkipped = true;
      const c = parseMT5Line(trimmed);
      if (c) candles.push(c);
    });
    rl.on("close", () => resolve(candles));
    rl.on("error", reject);
  });
}

function findFiles(pair: Pair, tf: Timeframe): string[] {
  if (!fs.existsSync(UPLOAD_DIR)) return [];
  const pairKeys = PAIR_SUFFIXES[pair] ?? [pair];
  const tfKeys = TF_STRINGS[tf] ?? [tf];
  return fs
    .readdirSync(UPLOAD_DIR)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .filter((f) => {
      const up = f.toUpperCase();
      return pairKeys.some((pk) => up.includes(pk.toUpperCase())) &&
        tfKeys.some((tk) => up.includes(tk.toUpperCase()));
    })
    .map((f) => path.join(UPLOAD_DIR, f));
}

/**
 * MetaTrader 5 CSV Export Provider.
 *
 * Reads OHLCV CSV files exported from MT5 → Tools → History Center → Export.
 * Files must be placed in: uploads/market-data/mt5/
 *
 * Naming convention (the provider auto-detects pair/timeframe from filename):
 *   EURUSD_M15_2020.csv, GBPUSDm_H4_2021_2022.csv, etc.
 *
 * MT5 Export steps:
 *   1. Open MT5 → View → Symbols → select pair
 *   2. Right-click → History Center
 *   3. Select timeframe → Export
 *   4. Save to uploads/market-data/mt5/
 */
export class MT5CsvProvider implements IMarketDataProvider {
  readonly name = "MT5 CSV Export";
  readonly id = "mt5_csv";
  readonly priority = 8;

  supportsPair(pair: Pair): boolean {
    return ["EURUSD", "GBPUSD", "USDJPY"].includes(pair);
  }

  supportsTimeframe(tf: Timeframe): boolean {
    return ["15m", "1h", "4h", "1d"].includes(tf);
  }

  maxHistoryDays(_tf: Timeframe): number {
    return 365 * 30; // only limited by what MT5 exported
  }

  isConfigured(): boolean {
    if (!fs.existsSync(UPLOAD_DIR)) return false;
    const files = fs.readdirSync(UPLOAD_DIR).filter((f) => f.toLowerCase().endsWith(".csv"));
    return files.length > 0;
  }

  async fetchCandles(pair: Pair, tf: Timeframe, start: Date, end: Date): Promise<FetchResult> {
    const files = findFiles(pair, tf);
    if (files.length === 0) {
      return emptyResult(
        this.id,
        pair,
        tf,
        start,
        end,
        `No MT5 CSV files found for ${pair} ${tf} in ${UPLOAD_DIR}. Export from MT5 and place in that directory.`,
      );
    }

    const allCandles: Candle[] = [];
    for (const f of files) {
      const batch = await readCsvFile(f);
      allCandles.push(...batch);
    }

    const sorted = allCandles
      .filter((c) => c.time >= start && c.time <= end)
      .sort((a, b) => a.time.getTime() - b.time.getTime());

    // Deduplicate by timestamp
    const seen = new Set<number>();
    const deduped = sorted.filter((c) => {
      const k = c.time.getTime();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    return {
      candles: deduped,
      provider: this.name,
      pair,
      timeframe: tf,
      requestedStart: start,
      requestedEnd: end,
      actualStart: deduped[0]?.time ?? null,
      actualEnd: deduped[deduped.length - 1]?.time ?? null,
      gaps: [],
      totalExpected: 0,
      notes: [`Loaded ${deduped.length} bars from ${files.length} CSV file(s)`],
      warnings: deduped.length === 0 ? ["No candles found in the specified date range"] : [],
    };
  }
}
