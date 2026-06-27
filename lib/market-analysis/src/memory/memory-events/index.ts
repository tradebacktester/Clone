// ─── Memory Events ─────────────────────────────────────────────────────────
// Canonical event types and constants for the long-term memory system.
// All modules emit and consume these event definitions.

export const MEMORY_TABLES = {
  TRADE_MEMORY:         "trade_memory",
  SETUP_MEMORY:         "setup_memory",
  SKIPPED_SETUP_MEMORY: "skipped_setup_memory",
  MARKET_SNAPSHOT:      "market_snapshot_memory",
  METADATA:             "memory_metadata",
} as const;

export type MemoryTable = (typeof MEMORY_TABLES)[keyof typeof MEMORY_TABLES];

// ─── Event Types ───────────────────────────────────────────────────────────

export const MEMORY_EVENT = {
  TRADE_STORED:        "memory:trade_stored",
  SETUP_STORED:        "memory:setup_stored",
  SETUP_SKIPPED:       "memory:setup_skipped",
  SNAPSHOT_STORED:     "memory:snapshot_stored",
  RECORD_UPDATED:      "memory:record_updated",
  RECORD_ARCHIVED:     "memory:record_archived",
  VALIDATION_FAILED:   "memory:validation_failed",
  LINK_ESTABLISHED:    "memory:link_established",
} as const;

export type MemoryEvent = (typeof MEMORY_EVENT)[keyof typeof MEMORY_EVENT];

// ─── Skip Reasons ──────────────────────────────────────────────────────────

export const SKIP_REASON = {
  BELOW_CONFIDENCE:     "below_confidence",
  DAILY_LOSS_LIMIT:     "daily_loss_limit",
  WEEKLY_LOSS_LIMIT:    "weekly_loss_limit",
  MAX_OPEN_TRADES:      "max_open_trades",
  PAIR_ALREADY_OPEN:    "pair_already_open",
  BOT_HALTED:           "bot_halted",
  NOT_RUNNING:          "not_running",
  HIGH_IMPACT_NEWS:     "high_impact_news",
  SPREAD_TOO_WIDE:      "spread_too_wide",
  CORRELATION_RISK:     "correlation_risk",
  INVALID_ZONE:         "invalid_zone",
  REGIME_MISMATCH:      "regime_mismatch",
  RULE_FILTER:          "rule_filter",
  MANUAL:               "manual",
} as const;

export type SkipReason = (typeof SKIP_REASON)[keyof typeof SKIP_REASON];

// ─── Outcome Labels ────────────────────────────────────────────────────────

export const TRADE_OUTCOME = {
  WIN:   "win",
  LOSS:  "loss",
  OPEN:  "open",
  BREAK_EVEN: "break_even",
} as const;

export type TradeOutcome = (typeof TRADE_OUTCOME)[keyof typeof TRADE_OUTCOME];

export const HYPOTHETICAL_OUTCOME = {
  WOULD_WIN:  "would_win",
  WOULD_LOSE: "would_lose",
  UNKNOWN:    "unknown",
} as const;

export type HypotheticalOutcome = (typeof HYPOTHETICAL_OUTCOME)[keyof typeof HYPOTHETICAL_OUTCOME];

// ─── Pagination Defaults ───────────────────────────────────────────────────

export const MEMORY_PAGE_DEFAULTS = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT:     500,
  DEFAULT_OFFSET: 0,
} as const;

// ─── Integrity ─────────────────────────────────────────────────────────────

export const MEMORY_SOURCE_MODULE = {
  PAPER_ENGINE:       "paper_engine",
  SIGNAL_GENERATOR:   "signal_generator",
  BACKTEST_ENGINE:    "backtest_engine",
  MANUAL:             "manual",
  MEMORY_SERVICE:     "memory_service",
  RECOVERY_ENGINE:    "recovery_engine",
} as const;

export type MemorySourceModule = (typeof MEMORY_SOURCE_MODULE)[keyof typeof MEMORY_SOURCE_MODULE];
