import type { Candle, Pair, Timeframe } from "../types.js";

const YAHOO_SYMBOLS: Record<Pair, string> = {
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "USDJPY=X",
};

const YAHOO_INTERVALS: Record<Timeframe, string> = {
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
};

const YAHOO_RANGES: Record<Timeframe, string> = {
  "1h": "60d",
  "4h": "180d",
  "1d": "730d",
};

const BASE_PRICES: Record<Pair, number> = {
  EURUSD: 1.085,
  GBPUSD: 1.270,
  USDJPY: 149.5,
};

const DAILY_VOLS: Record<Pair, number> = {
  EURUSD: 0.006,
  GBPUSD: 0.008,
  USDJPY: 0.008,
};

export async function fetchCandles(pair: Pair, timeframe: Timeframe): Promise<Candle[]> {
  try {
    const symbol = YAHOO_SYMBOLS[pair];
    const interval = YAHOO_INTERVALS[timeframe];
    const range = YAHOO_RANGES[timeframe];
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}&includePrePost=false`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TradingBot/1.0)",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`);

    const json = await res.json() as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              open?: (number | null)[];
              high?: (number | null)[];
              low?: (number | null)[];
              close?: (number | null)[];
              volume?: (number | null)[];
            }>;
          };
        }>;
        error?: { message: string };
      };
    };

    const result = json.chart?.result?.[0];
    if (!result?.timestamp) throw new Error("No data in Yahoo Finance response");

    const { timestamp } = result;
    const quote = result.indicators?.quote?.[0];
    if (!quote) throw new Error("No quote data");

    const candles: Candle[] = [];
    for (let i = 0; i < timestamp.length; i++) {
      const o = quote.open?.[i];
      const h = quote.high?.[i];
      const l = quote.low?.[i];
      const c = quote.close?.[i];
      if (o == null || h == null || l == null || c == null) continue;
      candles.push({
        time: new Date(timestamp[i]! * 1000),
        open: o,
        high: h,
        low: l,
        close: c,
        volume: quote.volume?.[i] ?? 0,
      });
    }

    if (candles.length < 10) throw new Error("Insufficient candle data from Yahoo Finance");
    return candles;
  } catch {
    return generateSyntheticCandles(pair, timeframe);
  }
}

export function generateSyntheticCandles(
  pair: Pair,
  timeframe: Timeframe,
  numCandles = 300,
): Candle[] {
  const basePrice = BASE_PRICES[pair];
  const dailyVol = DAILY_VOLS[pair];
  const barsPerDay: Record<Timeframe, number> = { "1h": 24, "4h": 6, "1d": 1 };
  const barVol = dailyVol / Math.sqrt(barsPerDay[timeframe]);
  const barMs: Record<Timeframe, number> = {
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
  };

  const candles: Candle[] = [];
  let price = basePrice;
  const now = Date.now();
  const meanReversionSpeed = 0.03;

  for (let i = numCandles - 1; i >= 0; i--) {
    const meanReversion = meanReversionSpeed * (basePrice - price) / basePrice;
    const drift = meanReversion + (Math.random() - 0.5) * barVol;
    const open = price;
    price = price * (1 + drift);
    const intraHigh = Math.random() * barVol * price * 0.7;
    const intraLow = Math.random() * barVol * price * 0.7;
    const close = price;
    const high = Math.max(open, close) + intraHigh;
    const low = Math.min(open, close) - intraLow;

    candles.unshift({
      time: new Date(now - i * barMs[timeframe]),
      open,
      high,
      low,
      close,
      volume: 10000 + Math.random() * 40000,
    });
  }
  return candles;
}

export function generateSyntheticCandlesForDateRange(
  pair: Pair,
  startDate: string,
  endDate: string,
  timeframe: Timeframe = "4h",
): Candle[] {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const barMs: Record<Timeframe, number> = {
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
  };
  const numCandles = Math.floor((end - start) / barMs[timeframe]);
  const basePrice = BASE_PRICES[pair];
  const dailyVol = DAILY_VOLS[pair];
  const barsPerDay: Record<Timeframe, number> = { "1h": 24, "4h": 6, "1d": 1 };
  const barVol = dailyVol / Math.sqrt(barsPerDay[timeframe]);

  const candles: Candle[] = [];
  let price = basePrice * (0.97 + Math.random() * 0.06);

  for (let i = 0; i < numCandles; i++) {
    const meanReversion = 0.02 * (basePrice - price) / basePrice;
    const drift = meanReversion + (Math.random() - 0.5) * barVol;
    const open = price;
    price = price * (1 + drift);
    const intraHigh = Math.random() * barVol * price * 0.7;
    const intraLow = Math.random() * barVol * price * 0.7;
    const close = price;
    const high = Math.max(open, close) + intraHigh;
    const low = Math.min(open, close) - intraLow;

    candles.push({
      time: new Date(start + i * barMs[timeframe]),
      open,
      high,
      low,
      close,
      volume: 10000 + Math.random() * 40000,
    });
  }
  return candles;
}
