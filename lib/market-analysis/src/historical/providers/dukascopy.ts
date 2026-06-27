import type { Pair, Timeframe } from "../../types.js";
import type { IMarketDataProvider, FetchResult } from "./base.js";
import { emptyResult } from "./base.js";

/**
 * Dukascopy Historical Data Provider (stub).
 *
 * Dukascopy provides free historical tick/OHLCV data through their
 * JForex platform and public datafeed, but the binary .bi5 format
 * requires LZMA decompression (not available without native bindings).
 *
 * To activate this provider:
 *   1. Install an LZMA decompression package: `pnpm add lzma-native`
 *   2. Implement the bi5 fetch from:
 *      https://datafeed.dukascopy.com/datafeed/{PAIR}/{YEAR}/{MONTH_0INDEXED}/{DAY}/{HOUR}h_ticks.bi5
 *   3. Parse 32-byte tick records (time_ms, ask, bid, ask_vol, bid_vol)
 *   4. Aggregate ticks into desired OHLCV bars
 *
 * Dukascopy advantages:
 *   • Tick-resolution history back to 2003
 *   • No API key required (public datafeed)
 *   • High accuracy bid/ask data
 *
 * Reference: https://github.com/leo-mazur/dukascopy-node
 */
export class DukascopyProvider implements IMarketDataProvider {
  readonly name = "Dukascopy";
  readonly id = "dukascopy";
  readonly priority = 5; // highest priority when implemented

  supportsPair(pair: Pair): boolean {
    return ["EURUSD", "GBPUSD", "USDJPY"].includes(pair);
  }

  supportsTimeframe(_tf: Timeframe): boolean {
    return true; // supports all timeframes via tick aggregation
  }

  maxHistoryDays(_tf: Timeframe): number {
    return 365 * 20; // ~20 years of tick data
  }

  isConfigured(): boolean {
    return false; // not yet implemented — see JSDoc above
  }

  async fetchCandles(pair: Pair, tf: Timeframe, start: Date, end: Date): Promise<FetchResult> {
    return emptyResult(
      this.id,
      pair,
      tf,
      start,
      end,
      "Dukascopy provider not yet implemented. See providers/dukascopy.ts for activation instructions.",
    );
  }
}
