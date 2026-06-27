import type { Pair, Timeframe } from "../../types.js";
import type { IMarketDataProvider, FetchResult } from "./base.js";
import { emptyResult } from "./base.js";

/**
 * HistData.com Provider (stub — requires manual file download).
 *
 * HistData.com provides free ASCII CSV exports of historical Forex data
 * including 1M and 1H bars for major pairs.
 *
 * To activate this provider:
 *   1. Visit https://www.histdata.com/download-free-forex-historical-data/
 *   2. Download 1M or 1H ASCII CSV for the desired pair and year
 *   3. Place files in: uploads/market-data/histdata/
 *   4. Expected filename format: HISTDATA_COM_FX_{PAIR}_{TIMEFRAME}_{YEAR}.csv
 *      Example: HISTDATA_COM_FX_EURUSD_M1_2020.csv
 *
 * HistData CSV format (1M):
 *   datetime,open,high,low,close,volume
 *   20200102 000100,1.11673,1.11675,1.11666,1.11669,0
 *
 * This provider would scan the uploads/market-data/histdata/ directory,
 * find all relevant files for the requested pair+period, parse and aggregate
 * to the desired timeframe.
 */
export class HistDataProvider implements IMarketDataProvider {
  readonly name = "HistData.com";
  readonly id = "histdata";
  readonly priority = 7;

  supportsPair(pair: Pair): boolean {
    return ["EURUSD", "GBPUSD", "USDJPY"].includes(pair);
  }

  supportsTimeframe(tf: Timeframe): boolean {
    return ["15m", "1h", "4h"].includes(tf);
  }

  maxHistoryDays(_tf: Timeframe): number {
    return 365 * 25; // files available from ~2000
  }

  isConfigured(): boolean {
    return false; // requires manual file download — see JSDoc above
  }

  async fetchCandles(pair: Pair, tf: Timeframe, start: Date, end: Date): Promise<FetchResult> {
    return emptyResult(
      this.id,
      pair,
      tf,
      start,
      end,
      "HistData.com provider requires manual CSV download. See providers/histdata.ts for instructions.",
    );
  }
}
