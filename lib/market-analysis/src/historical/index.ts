// Provider architecture
export type { IMarketDataProvider, FetchResult, CacheStatus, DateRange, Candle as HistoricalCandle } from "./providers/base.js";
export { BAR_MS, expectedBarCount, emptyResult } from "./providers/base.js";
export { YahooFinanceProvider } from "./providers/yahoo.js";
export { DukascopyProvider } from "./providers/dukascopy.js";
export { HistDataProvider } from "./providers/histdata.js";
export { OANDAProvider } from "./providers/oanda.js";
export { MT5CsvProvider } from "./providers/mt5-csv.js";
export { LocalCsvProvider } from "./providers/local-csv.js";
export { ProviderRegistry, createDefaultRegistry } from "./providers/registry.js";
export type { ProviderStatus } from "./providers/registry.js";

// Cache
export { getCachedCandles, cacheCandles, getCacheStatus, isCacheValid } from "./cache.js";

// Data quality
export type { DataQualityScore, DataGrade } from "./data-quality.js";
export { computeDataQuality, formatQualityBlock } from "./data-quality.js";

// Metrics
export type { TradeResult, ExtendedMetrics, ReturnBucket } from "./metrics.js";
export { computeExtendedMetrics } from "./metrics.js";

// Breakdowns
export type { BreakdownRow, Breakdowns } from "./breakdowns.js";
export { computeBreakdowns, formatBreakdownTable } from "./breakdowns.js";

// Bias detection
export type { BiasCheck, HistoricalBiasReport, BiasType, BiasLevel } from "./bias-checker.js";
export { detectHistoricalBias } from "./bias-checker.js";

// Validator
export type { HistoricalConfig, HistoricalValidationResult, StrategyVsActual } from "./validator.js";
export { runHistoricalValidation } from "./validator.js";

// Report
export { generateHistoricalReport } from "./report-generator.js";
