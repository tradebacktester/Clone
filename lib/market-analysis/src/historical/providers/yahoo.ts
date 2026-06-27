import type { Pair, Timeframe } from "../../types.js";
import type { IMarketDataProvider, FetchResult, Candle, DateRange } from "./base.js";
import { BAR_MS, expectedBarCount, emptyResult } from "./base.js";

const YAHOO_SYMBOLS: Record<Pair, string> = {
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "USDJPY=X",
};

// Yahoo Finance intraday limits (in calendar days)
const YAHOO_LIMITS: Record<string, number> = {
  "15m": 60,
  "1h": 730,
  "4h": 730, // fetched as 1h then downsampled
  "1d": 3650, // ~10 years
};

// Yahoo Finance interval identifiers for each timeframe
const YAHOO_INTERVALS: Record<string, string> = {
  "15m": "15m",
  "1h": "60m",
  "4h": "60m", // fetch 1H, downsample to 4H
  "1d": "1d",
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface YahooResponse {
  chart: {
    result: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
      };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

/** Downsample 1H candles into 4H candles, aligned to UTC 4-hour boundaries (0,4,8,12,16,20). */
function downsampleTo4H(hourly: Candle[]): Candle[] {
  if (hourly.length === 0) return [];
  const buckets = new Map<number, Candle[]>();

  for (const c of hourly) {
    const h = c.time.getUTCHours();
    const aligned = h - (h % 4); // 0,4,8,12,16,20
    const bucketTime = new Date(c.time);
    bucketTime.setUTCHours(aligned, 0, 0, 0);
    const key = bucketTime.getTime();
    const bucket = buckets.get(key) ?? [];
    bucket.push(c);
    buckets.set(key, bucket);
  }

  const result: Candle[] = [];
  for (const [, bars] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    if (bars.length === 0) continue;
    result.push({
      time: bars[0]!.time,
      open: bars[0]!.open,
      high: Math.max(...bars.map((b) => b.high)),
      low: Math.min(...bars.map((b) => b.low)),
      close: bars[bars.length - 1]!.close,
      volume: bars.reduce((s, b) => s + b.volume, 0),
    });
  }
  return result;
}

/** Detect gaps larger than 3× the expected bar interval (accounting for weekends). */
function detectGaps(candles: Candle[], tf: Timeframe, label: string): DateRange[] {
  if (candles.length < 2) return [];
  const gaps: DateRange[] = [];
  const barMs = BAR_MS[tf];
  const maxAllowedGap = barMs * 4; // allow up to 4-bar gap before flagging

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]!;
    const curr = candles[i]!;
    const gap = curr.time.getTime() - prev.time.getTime();
    // Skip standard weekend gaps (Fri close → Mon open ≈ 60h for daily, etc.)
    const daysBetween = gap / (24 * 60 * 60 * 1000);
    const isWeekend = daysBetween >= 2 && daysBetween <= 3;
    if (!isWeekend && gap > maxAllowedGap) {
      gaps.push({ start: prev.time, end: curr.time, reason: `${label}: missing bars` });
    }
  }
  return gaps;
}

/**
 * Yahoo Finance market data provider.
 *
 * Supported:
 *   • Daily  — up to 10 years of real OHLCV
 *   • 4H     — real 1H data (up to 730 days) downsampled to 4H (labeled "Yahoo Finance 1H→4H")
 *   • 15M    — real 15M data, limited to last 60 calendar days
 *
 * For 15M requests spanning more than 60 days, the provider returns only the
 * candles that are available and records a gap for the unavailable period.
 * The validation engine must treat that gap as missing — NOT synthesize candles.
 */
export class YahooFinanceProvider implements IMarketDataProvider {
  readonly name = "Yahoo Finance";
  readonly id = "yahoo_finance";
  readonly priority = 10;

  supportsPair(pair: Pair): boolean {
    return pair in YAHOO_SYMBOLS;
  }

  supportsTimeframe(tf: Timeframe): boolean {
    return tf in YAHOO_LIMITS;
  }

  maxHistoryDays(tf: Timeframe): number {
    return YAHOO_LIMITS[tf] ?? 0;
  }

  isConfigured(): boolean {
    return true; // no API key required
  }

  async fetchCandles(pair: Pair, tf: Timeframe, start: Date, end: Date): Promise<FetchResult> {
    const symbol = YAHOO_SYMBOLS[pair];
    if (!symbol) {
      return emptyResult(this.id, pair, tf, start, end, `${this.name}: unsupported pair ${pair}`);
    }

    const maxDays = YAHOO_LIMITS[tf] ?? 0;
    const now = new Date();
    const effectiveStart = new Date(Math.max(start.getTime(), now.getTime() - maxDays * 86400 * 1000));

    const warnings: string[] = [];
    const gaps: DateRange[] = [];

    if (effectiveStart > start) {
      const gapMsg = tf === "15m"
        ? `Yahoo Finance 15M data limited to last ${maxDays} days. ${Math.floor((effectiveStart.getTime() - start.getTime()) / 86400000)} days of requested history are unavailable. 15M validation disabled for that period.`
        : `Yahoo Finance ${tf} data limited to last ${maxDays} days.`;
      warnings.push(gapMsg);
      gaps.push({ start, end: effectiveStart, reason: gapMsg });
    }

    if (effectiveStart >= end) {
      return {
        ...emptyResult(this.id, pair, tf, start, end, `No ${tf} data available from Yahoo Finance for the requested period`),
        warnings,
        gaps,
      };
    }

    const yahooInterval = YAHOO_INTERVALS[tf] ?? "1d";
    const period1 = Math.floor(effectiveStart.getTime() / 1000);
    const period2 = Math.floor(end.getTime() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${yahooInterval}&period1=${period1}&period2=${period2}`;

    let raw: YahooResponse;
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(30000),
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      }
      raw = (await resp.json()) as YahooResponse;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return emptyResult(this.id, pair, tf, start, end, `Yahoo Finance fetch failed: ${msg}`);
    }

    if (raw.chart.error || !raw.chart.result?.[0]) {
      const msg = raw.chart.error?.description ?? "no data returned";
      return emptyResult(this.id, pair, tf, start, end, `Yahoo Finance: ${msg}`);
    }

    const result = raw.chart.result[0]!;
    const timestamps = result.timestamp ?? [];
    const quote = result.indicators.quote[0];
    if (!quote || timestamps.length === 0) {
      return emptyResult(this.id, pair, tf, start, end, "Yahoo Finance returned empty quote data");
    }

    const rawCandles: Candle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const o = quote.open[i];
      const h = quote.high[i];
      const l = quote.low[i];
      const c = quote.close[i];
      const v = quote.volume[i];
      // Skip null bars (Yahoo uses null for missing data)
      if (o == null || h == null || l == null || c == null) continue;
      // Basic OHLC integrity check
      if (h < l || h < o || h < c || l > o || l > c) continue;
      rawCandles.push({
        time: new Date(timestamps[i]! * 1000),
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v ?? 0,
      });
    }

    // Downsample 1H → 4H for 4H timeframe requests
    let candles = tf === "4h" ? downsampleTo4H(rawCandles) : rawCandles;
    candles = candles.sort((a, b) => a.time.getTime() - b.time.getTime());

    // Detect intra-series gaps
    const dataGaps = detectGaps(candles, tf, this.name);
    gaps.push(...dataGaps);

    const label = tf === "4h" ? `${this.name} (1H→4H)` : this.name;
    const notes: string[] = [];
    if (tf === "4h") notes.push("4H bars are aggregated from real 1H data (open=first bar, HLCV=max/min/last/sum)");
    if (tf === "15m" && effectiveStart > start) notes.push(`15M data available only from ${effectiveStart.toISOString().slice(0, 10)}`);

    return {
      candles,
      provider: label,
      pair,
      timeframe: tf,
      requestedStart: start,
      requestedEnd: end,
      actualStart: candles[0]?.time ?? null,
      actualEnd: candles[candles.length - 1]?.time ?? null,
      gaps,
      totalExpected: expectedBarCount(tf, effectiveStart, end),
      notes,
      warnings,
    };
  }
}
