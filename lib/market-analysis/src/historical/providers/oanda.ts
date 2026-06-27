import type { Pair, Timeframe } from "../../types.js";
import type { IMarketDataProvider, FetchResult } from "./base.js";
import { emptyResult } from "./base.js";

const OANDA_INSTRUMENTS: Record<Pair, string> = {
  EURUSD: "EUR_USD",
  GBPUSD: "GBP_USD",
  USDJPY: "USD_JPY",
};

const OANDA_GRANULARITIES: Record<string, string> = {
  "15m": "M15",
  "1h": "H1",
  "4h": "H4",
  "1d": "D",
};

/**
 * OANDA v20 REST API Provider (stub — requires API key and account).
 *
 * OANDA provides professional-grade historical candle data through their v20 API.
 * Data quality is excellent — used by institutional traders.
 *
 * To activate this provider:
 *   1. Create a free OANDA practice account: https://www.oanda.com/register/
 *   2. Generate an API key in your OANDA account dashboard
 *   3. Add to environment: OANDA_API_KEY=your_key_here
 *   4. Add to environment: OANDA_ACCOUNT_ID=your_account_id
 *   5. Set OANDA_ENV to "practice" or "live"
 *
 * OANDA advantages:
 *   • Real-time and historical data via the same API
 *   • H4 native bars (no downsampling needed)
 *   • Up to 6 years of history on practice accounts
 *   • Bid/Ask spread data available
 *
 * API endpoint: https://api-fxtrade.oanda.com/v3/instruments/{instrument}/candles
 */
export class OANDAProvider implements IMarketDataProvider {
  readonly name = "OANDA";
  readonly id = "oanda";
  readonly priority = 3; // highest priority when configured

  private readonly apiKey = process.env["OANDA_API_KEY"];
  private readonly accountId = process.env["OANDA_ACCOUNT_ID"];
  private readonly env = process.env["OANDA_ENV"] ?? "practice";
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = this.env === "live"
      ? "https://api-fxtrade.oanda.com"
      : "https://api-fxpractice.oanda.com";
  }

  supportsPair(pair: Pair): boolean {
    return pair in OANDA_INSTRUMENTS;
  }

  supportsTimeframe(tf: Timeframe): boolean {
    return tf in OANDA_GRANULARITIES;
  }

  maxHistoryDays(tf: Timeframe): number {
    if (tf === "15m") return 365 * 2;
    if (tf === "1h" || tf === "4h") return 365 * 4;
    return 365 * 6;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.accountId);
  }

  async fetchCandles(pair: Pair, tf: Timeframe, start: Date, end: Date): Promise<FetchResult> {
    if (!this.isConfigured()) {
      return emptyResult(
        this.id,
        pair,
        tf,
        start,
        end,
        "OANDA API key not configured. Set OANDA_API_KEY and OANDA_ACCOUNT_ID environment variables.",
      );
    }

    const instrument = OANDA_INSTRUMENTS[pair];
    const granularity = OANDA_GRANULARITIES[tf];
    if (!instrument || !granularity) {
      return emptyResult(this.id, pair, tf, start, end, `OANDA: unsupported pair or timeframe`);
    }

    const url = new URL(`${this.baseUrl}/v3/instruments/${instrument}/candles`);
    url.searchParams.set("from", start.toISOString());
    url.searchParams.set("to", end.toISOString());
    url.searchParams.set("granularity", granularity);
    url.searchParams.set("price", "M"); // mid candles

    try {
      const resp = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(30000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = (await resp.json()) as {
        candles: Array<{
          time: string;
          mid: { o: string; h: string; l: string; c: string };
          volume: number;
          complete: boolean;
        }>;
      };

      const candles = (data.candles ?? [])
        .filter((c) => c.complete)
        .map((c) => ({
          time: new Date(c.time),
          open: parseFloat(c.mid.o),
          high: parseFloat(c.mid.h),
          low: parseFloat(c.mid.l),
          close: parseFloat(c.mid.c),
          volume: c.volume,
        }));

      return {
        candles,
        provider: this.name,
        pair,
        timeframe: tf,
        requestedStart: start,
        requestedEnd: end,
        actualStart: candles[0]?.time ?? null,
        actualEnd: candles[candles.length - 1]?.time ?? null,
        gaps: [],
        totalExpected: 0,
        notes: [`OANDA ${this.env} account`],
        warnings: [],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return emptyResult(this.id, pair, tf, start, end, `OANDA fetch failed: ${msg}`);
    }
  }
}
