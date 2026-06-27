import type { Pair, Timeframe } from "../../types.js";
import type { IMarketDataProvider, FetchResult } from "./base.js";
import { YahooFinanceProvider } from "./yahoo.js";
import { DukascopyProvider } from "./dukascopy.js";
import { HistDataProvider } from "./histdata.js";
import { OANDAProvider } from "./oanda.js";
import { MT5CsvProvider } from "./mt5-csv.js";
import { LocalCsvProvider } from "./local-csv.js";

export interface ProviderStatus {
  id: string;
  name: string;
  priority: number;
  configured: boolean;
  supportsPair: boolean;
  supportsTimeframe: boolean;
  maxHistoryDays: number;
}

/**
 * ProviderRegistry manages all market data providers and routes fetch requests
 * to the best available source.
 *
 * Resolution order:
 *   1. Filter providers by: pair support, timeframe support, configured
 *   2. Sort by priority (lower = higher priority)
 *   3. Try each in order until one returns candles
 *   4. If the highest-priority provider returns a gap, attempt to fill from
 *      the next-priority provider (gap-filling)
 *
 * Adding a new provider:
 *   1. Create a class in providers/ implementing IMarketDataProvider
 *   2. Instantiate and call registry.register(new MyProvider())
 *   3. No other changes required — the registry and validation engine adapt automatically.
 */
export class ProviderRegistry {
  private providers: IMarketDataProvider[] = [];

  constructor(providers?: IMarketDataProvider[]) {
    if (providers) {
      for (const p of providers) this.providers.push(p);
    }
  }

  register(provider: IMarketDataProvider): void {
    this.providers.push(provider);
    this.providers.sort((a, b) => a.priority - b.priority);
  }

  getAll(): IMarketDataProvider[] {
    return [...this.providers].sort((a, b) => a.priority - b.priority);
  }

  async getStatus(pair: Pair, tf: Timeframe): Promise<ProviderStatus[]> {
    return Promise.all(
      this.providers
        .sort((a, b) => a.priority - b.priority)
        .map(async (p) => ({
          id: p.id,
          name: p.name,
          priority: p.priority,
          configured: await Promise.resolve(p.isConfigured()),
          supportsPair: p.supportsPair(pair),
          supportsTimeframe: p.supportsTimeframe(tf),
          maxHistoryDays: p.maxHistoryDays(tf),
        })),
    );
  }

  /**
   * Fetch candles using the best available provider.
   * Never synthesizes data. If a provider returns gaps, tries the next provider
   * for the gap period and merges results.
   */
  async fetchBest(pair: Pair, tf: Timeframe, start: Date, end: Date): Promise<FetchResult> {
    const eligible: IMarketDataProvider[] = [];
    for (const p of this.providers.sort((a, b) => a.priority - b.priority)) {
      if (!p.supportsPair(pair)) continue;
      if (!p.supportsTimeframe(tf)) continue;
      const maxDays = p.maxHistoryDays(tf);
      if (maxDays === 0) continue;
      const configured = await Promise.resolve(p.isConfigured());
      if (!configured) continue;
      eligible.push(p);
    }

    if (eligible.length === 0) {
      return {
        candles: [],
        provider: "none",
        pair,
        timeframe: tf,
        requestedStart: start,
        requestedEnd: end,
        actualStart: null,
        actualEnd: null,
        gaps: [{ start, end, reason: "No configured provider supports this pair + timeframe" }],
        totalExpected: 0,
        notes: [],
        warnings: ["No configured market data provider available. Add provider credentials or upload CSV files."],
      };
    }

    // Try primary provider
    const primary = eligible[0]!;
    const primaryResult = await primary.fetchCandles(pair, tf, start, end);

    if (primaryResult.candles.length > 0 && primaryResult.gaps.length === 0) {
      return primaryResult;
    }

    // Attempt gap-filling from lower-priority providers
    if (primaryResult.gaps.length > 0 && eligible.length > 1) {
      let merged = [...primaryResult.candles];
      const mergedGaps = [...primaryResult.gaps];
      const mergedWarnings = [...primaryResult.warnings];
      const mergedNotes = [...primaryResult.notes];

      for (const gap of primaryResult.gaps) {
        for (let i = 1; i < eligible.length; i++) {
          const fallback = eligible[i]!;
          const filled = await fallback.fetchCandles(pair, tf, gap.start, gap.end);
          if (filled.candles.length > 0) {
            merged = merged.concat(filled.candles);
            mergedNotes.push(`Gap ${gap.start.toISOString().slice(0, 10)}→${gap.end.toISOString().slice(0, 10)} filled from ${fallback.name}`);
            const gapIdx = mergedGaps.indexOf(gap);
            if (gapIdx !== -1) mergedGaps.splice(gapIdx, 1);
            if (filled.gaps.length > 0) mergedGaps.push(...filled.gaps);
            break;
          }
        }
      }

      merged.sort((a, b) => a.time.getTime() - b.time.getTime());
      const seen = new Set<number>();
      const deduped = merged.filter((c) => {
        const k = c.time.getTime();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      return {
        ...primaryResult,
        candles: deduped,
        gaps: mergedGaps,
        warnings: mergedWarnings,
        notes: mergedNotes,
        actualStart: deduped[0]?.time ?? null,
        actualEnd: deduped[deduped.length - 1]?.time ?? null,
      };
    }

    return primaryResult;
  }
}

/** Default registry with all built-in providers pre-registered (priority order). */
export function createDefaultRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(new OANDAProvider());
  registry.register(new DukascopyProvider());
  registry.register(new HistDataProvider());
  registry.register(new MT5CsvProvider());
  registry.register(new YahooFinanceProvider());
  registry.register(new LocalCsvProvider());
  return registry;
}
