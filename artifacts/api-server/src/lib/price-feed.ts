import type { Pair } from "@workspace/market-analysis";
import { logger } from "./logger.js";

const YAHOO_SYMBOLS: Record<Pair, string> = {
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "USDJPY=X",
};

const FALLBACK_PRICES: Record<Pair, number> = {
  EURUSD: 1.0850,
  GBPUSD: 1.2700,
  USDJPY: 149.50,
};

const SPREADS: Record<Pair, number> = {
  EURUSD: 0.00010,
  GBPUSD: 0.00012,
  USDJPY: 0.010,
};

export interface PriceEntry {
  bid: number;
  ask: number;
  mid: number;
  updatedAt: Date;
  source: "live" | "fallback";
}

const priceCache = new Map<Pair, PriceEntry>();
let feedInterval: ReturnType<typeof setInterval> | null = null;

const ALL_PAIRS: Pair[] = ["EURUSD", "GBPUSD", "USDJPY"];

async function fetchPrice(pair: Pair): Promise<number> {
  const symbol = YAHOO_SYMBOLS[pair];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d&includePrePost=false`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; TradingBot/1.0)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`);

  const json = await res.json() as {
    chart?: {
      result?: Array<{
        meta?: { regularMarketPrice?: number; previousClose?: number };
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: (number | null)[] }> };
      }>;
    };
  };

  const result = json.chart?.result?.[0];
  const meta = result?.meta;

  const regularMarketPrice = meta?.regularMarketPrice;
  if (regularMarketPrice && regularMarketPrice > 0) return regularMarketPrice;

  const closes = result?.indicators?.quote?.[0]?.close;
  if (closes) {
    for (let i = closes.length - 1; i >= 0; i--) {
      if (closes[i] != null && closes[i]! > 0) return closes[i]!;
    }
  }

  const prev = meta?.previousClose;
  if (prev && prev > 0) return prev;

  throw new Error("No valid price in Yahoo Finance response");
}

async function refreshPrices(): Promise<void> {
  for (const pair of ALL_PAIRS) {
    try {
      const mid = await fetchPrice(pair);
      const spread = SPREADS[pair];
      priceCache.set(pair, {
        bid: mid - spread / 2,
        ask: mid + spread / 2,
        mid,
        updatedAt: new Date(),
        source: "live",
      });
    } catch (err) {
      const existing = priceCache.get(pair);
      if (!existing) {
        const fallback = FALLBACK_PRICES[pair];
        const spread = SPREADS[pair];
        priceCache.set(pair, {
          bid: fallback - spread / 2,
          ask: fallback + spread / 2,
          mid: fallback,
          updatedAt: new Date(),
          source: "fallback",
        });
      }
      logger.warn({ pair, err }, "Price feed fetch failed, using cached/fallback");
    }
  }
}

export function getCurrentPrice(pair: Pair): PriceEntry | null {
  const entry = priceCache.get(pair);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt.getTime() > 10 * 60 * 1000) return null;
  return entry;
}

export function getAllCurrentPrices(): Record<Pair, PriceEntry | null> {
  return {
    EURUSD: getCurrentPrice("EURUSD"),
    GBPUSD: getCurrentPrice("GBPUSD"),
    USDJPY: getCurrentPrice("USDJPY"),
  };
}

export function getPriceLastUpdated(): Date | null {
  let latest: Date | null = null;
  for (const entry of priceCache.values()) {
    if (!latest || entry.updatedAt > latest) latest = entry.updatedAt;
  }
  return latest;
}

export function startPriceFeed(intervalSeconds = 30): void {
  if (feedInterval) return;
  refreshPrices().catch(err => logger.error({ err }, "Initial price feed failed"));
  feedInterval = setInterval(() => {
    refreshPrices().catch(err => logger.error({ err }, "Price feed refresh failed"));
  }, intervalSeconds * 1000);
  logger.info({ intervalSeconds }, "Price feed started");
}

export function stopPriceFeed(): void {
  if (feedInterval) {
    clearInterval(feedInterval);
    feedInterval = null;
    logger.info("Price feed stopped");
  }
}
