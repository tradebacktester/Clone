import type { Pair, Timeframe } from "../../types.js";

export type { Pair, Timeframe };

export interface Candle {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DateRange {
  start: Date;
  end: Date;
  reason?: string;
}

/**
 * Result returned by every market data provider.
 * `isReal` is always true — providers must never synthesize candles.
 * If real data is unavailable for a period, that period appears in `gaps`.
 */
export interface FetchResult {
  candles: Candle[];
  provider: string;
  pair: Pair;
  timeframe: Timeframe;
  requestedStart: Date;
  requestedEnd: Date;
  actualStart: Date | null;
  actualEnd: Date | null;
  gaps: DateRange[];
  totalExpected: number;
  notes: string[];
  warnings: string[];
}

export interface CacheStatus {
  pair: Pair;
  timeframe: Timeframe;
  provider: string | null;
  coverageStart: Date | null;
  coverageEnd: Date | null;
  totalBars: number;
  lastUpdated: Date | null;
  isComplete: boolean;
}

/**
 * Every market data provider must implement this interface.
 * The validation engine is decoupled from specific providers — it only
 * depends on this contract. Adding a new broker or data vendor requires
 * only implementing this interface and registering in the ProviderRegistry.
 */
export interface IMarketDataProvider {
  /** Unique human-readable name shown in the UI and reports */
  readonly name: string;
  /** Lower number = higher priority when multiple providers are available */
  readonly priority: number;
  /** Short identifier used in DB and report columns */
  readonly id: string;

  /** Returns true if this provider can supply data for the given pair */
  supportsPair(pair: Pair): boolean;
  /** Returns true if this provider can supply data at this timeframe */
  supportsTimeframe(tf: Timeframe): boolean;
  /**
   * Maximum history in calendar days this provider can supply for a timeframe.
   * Returns 0 if the provider does not support that timeframe.
   */
  maxHistoryDays(tf: Timeframe): number;
  /**
   * Returns true if the provider is ready to fetch (e.g., API key configured,
   * data files present on disk). A provider that is not configured will be
   * skipped by the registry.
   */
  isConfigured(): Promise<boolean> | boolean;

  /**
   * Fetch OHLCV candles for a specific pair and timeframe within [start, end].
   * Must NEVER synthesize candles. If data is missing for a sub-period,
   * the gap is recorded in `FetchResult.gaps` and those candles are omitted.
   */
  fetchCandles(pair: Pair, tf: Timeframe, start: Date, end: Date): Promise<FetchResult>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const BAR_MS: Record<Timeframe, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

/** Expected bar count in a date range (forex market ≈ Mon–Fri). */
export function expectedBarCount(tf: Timeframe, start: Date, end: Date): number {
  const totalMs = end.getTime() - start.getTime();
  const barMs = BAR_MS[tf];
  // Forex trades ~252 days/year ≈ 69% of calendar days
  const forexFraction = tf === "1d" ? 0.69 : 0.714; // excludes weekends
  return Math.round((totalMs / barMs) * forexFraction);
}

/** Build an empty FetchResult for a not-configured / unavailable provider */
export function emptyResult(
  provider: string,
  pair: Pair,
  tf: Timeframe,
  start: Date,
  end: Date,
  reason: string,
): FetchResult {
  return {
    candles: [],
    provider,
    pair,
    timeframe: tf,
    requestedStart: start,
    requestedEnd: end,
    actualStart: null,
    actualEnd: null,
    gaps: [{ start, end, reason }],
    totalExpected: expectedBarCount(tf, start, end),
    notes: [],
    warnings: [reason],
  };
}
