import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import type { Pair, Timeframe } from "../../types.js";
import type { IMarketDataProvider, FetchResult, Candle } from "./base.js";
import { emptyResult } from "./base.js";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "market-data", "local");

/**
 * Parse a generic OHLCV CSV line.
 * Supports multiple common formats:
 *   • ISO datetime: 2020-01-02T00:00:00Z,open,high,low,close,volume
 *   • Compact date + time: 2020-01-02,00:00,open,high,low,close,volume
 *   • Unix timestamp: 1577836800,open,high,low,close,volume
 */
function parseGenericLine(line: string, headers: string[]): Candle | null {
  const sep = line.includes(";") ? ";" : line.includes("\t") ? "\t" : ",";
  const parts = line.split(sep).map((p) => p.trim().replace(/^"|"$/g, ""));

  const find = (names: string[]): string | null => {
    for (const n of names) {
      const idx = headers.indexOf(n);
      if (idx !== -1 && parts[idx] != null) return parts[idx]!;
    }
    return null;
  };

  const dateVal = find(["datetime", "date", "time", "timestamp", "Date", "DateTime", "Time"]);
  const openVal = find(["open", "Open", "OPEN"]);
  const highVal = find(["high", "High", "HIGH"]);
  const lowVal = find(["low", "Low", "LOW"]);
  const closeVal = find(["close", "Close", "CLOSE"]);
  const volVal = find(["volume", "Volume", "VOLUME", "vol", "Vol"]);

  if (!dateVal || !openVal || !highVal || !lowVal || !closeVal) return null;

  const o = parseFloat(openVal);
  const h = parseFloat(highVal);
  const l = parseFloat(lowVal);
  const c = parseFloat(closeVal);
  const v = volVal ? parseFloat(volVal) : 0;

  if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) return null;

  let time: Date;
  const asNum = parseFloat(dateVal);
  if (isFinite(asNum) && asNum > 1e9) {
    time = new Date(asNum * 1000); // Unix timestamp in seconds
  } else {
    time = new Date(dateVal.includes("T") ? dateVal : dateVal + "Z");
  }
  if (isNaN(time.getTime())) return null;

  return { time, open: o, high: h, low: l, close: c, volume: v };
}

async function readGenericCsv(filePath: string): Promise<Candle[]> {
  return new Promise((resolve, reject) => {
    const candles: Candle[] = [];
    let headers: string[] = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (headers.length === 0) {
        const sep = trimmed.includes(";") ? ";" : trimmed.includes("\t") ? "\t" : ",";
        headers = trimmed.split(sep).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
        return;
      }
      const c = parseGenericLine(trimmed, headers);
      if (c) candles.push(c);
    });
    rl.on("close", () => resolve(candles));
    rl.on("error", reject);
  });
}

/**
 * Generic Local CSV Importer.
 *
 * Import any OHLCV CSV file into the validation engine. Files are read from:
 *   uploads/market-data/local/
 *
 * Expected filename format (used to determine pair and timeframe):
 *   {PAIR}_{TF}.csv  →  EURUSD_15m.csv, GBPUSD_4h.csv, USDJPY_1d.csv
 *
 * Supported CSV formats (auto-detected from header row):
 *   • datetime,open,high,low,close,volume
 *   • date,time,open,high,low,close,volume
 *   • timestamp,open,high,low,close (Unix seconds)
 *
 * Column names are case-insensitive. Separator can be comma, semicolon, or tab.
 *
 * Upload API endpoint: POST /api/historical/upload-csv
 *   (multipart form-data: field "file", optional fields "pair" and "timeframe")
 */
export class LocalCsvProvider implements IMarketDataProvider {
  readonly name = "Local CSV";
  readonly id = "local_csv";
  readonly priority = 9;

  supportsPair(_pair: Pair): boolean {
    return true;
  }

  supportsTimeframe(_tf: Timeframe): boolean {
    return true;
  }

  maxHistoryDays(_tf: Timeframe): number {
    return 365 * 50; // unlimited by provider design
  }

  isConfigured(): boolean {
    if (!fs.existsSync(UPLOAD_DIR)) return false;
    return fs.readdirSync(UPLOAD_DIR).some((f) => f.toLowerCase().endsWith(".csv"));
  }

  async fetchCandles(pair: Pair, tf: Timeframe, start: Date, end: Date): Promise<FetchResult> {
    if (!fs.existsSync(UPLOAD_DIR)) {
      return emptyResult(this.id, pair, tf, start, end, `Upload directory not found: ${UPLOAD_DIR}`);
    }

    const pairLower = pair.toLowerCase();
    const tfLower = tf.toLowerCase();
    const files = fs
      .readdirSync(UPLOAD_DIR)
      .filter((f) => {
        const fl = f.toLowerCase();
        return fl.endsWith(".csv") && fl.includes(pairLower) && fl.includes(tfLower);
      })
      .map((f) => path.join(UPLOAD_DIR, f));

    if (files.length === 0) {
      return emptyResult(
        this.id,
        pair,
        tf,
        start,
        end,
        `No CSV files matching ${pair}_${tf}.csv found in ${UPLOAD_DIR}`,
      );
    }

    const allCandles: Candle[] = [];
    for (const f of files) {
      const batch = await readGenericCsv(f);
      allCandles.push(...batch);
    }

    const filtered = allCandles
      .filter((c) => c.time >= start && c.time <= end)
      .sort((a, b) => a.time.getTime() - b.time.getTime());

    const seen = new Set<number>();
    const deduped = filtered.filter((c) => {
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
      notes: [`Loaded ${deduped.length} bars from ${files.length} file(s)`],
      warnings: deduped.length === 0 ? ["No candles in the specified date range"] : [],
    };
  }
}
