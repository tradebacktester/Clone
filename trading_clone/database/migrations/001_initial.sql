-- Migration 001: Initial schema for trading_clone
-- Run against PostgreSQL if using a relational DB instead of the JSON file store

CREATE TABLE IF NOT EXISTS trades (
    id          TEXT PRIMARY KEY,
    pair        TEXT NOT NULL,
    direction   TEXT NOT NULL CHECK (direction IN ('buy', 'sell')),
    entry_price REAL NOT NULL,
    stop_loss   REAL NOT NULL,
    take_profit REAL NOT NULL,
    lot_size    REAL NOT NULL,
    open_time   TIMESTAMPTZ NOT NULL,
    close_time  TIMESTAMPTZ,
    close_price REAL,
    pnl         REAL,
    status      TEXT NOT NULL DEFAULT 'open',
    amd_phase   TEXT NOT NULL DEFAULT 'none',
    zone_score  INTEGER NOT NULL DEFAULT 0,
    amd_score   INTEGER NOT NULL DEFAULT 0,
    final_score REAL NOT NULL DEFAULT 0,
    session     TEXT NOT NULL DEFAULT '',
    risk_reward REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS signals (
    id                  TEXT PRIMARY KEY,
    pair                TEXT NOT NULL,
    direction           TEXT NOT NULL,
    final_score         REAL NOT NULL,
    zone_score          INTEGER NOT NULL,
    liquidity_score     INTEGER NOT NULL,
    amd_score           INTEGER NOT NULL,
    confirmation_score  INTEGER NOT NULL,
    entry_price         REAL NOT NULL,
    stop_loss           REAL NOT NULL,
    take_profit         REAL NOT NULL,
    risk_reward         REAL NOT NULL,
    amd_phase           TEXT NOT NULL,
    session             TEXT NOT NULL,
    confidence          REAL NOT NULL,
    generated_at        TIMESTAMPTZ NOT NULL,
    confluence_factors  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS zones (
    id           TEXT PRIMARY KEY,
    pair         TEXT NOT NULL,
    timeframe    TEXT NOT NULL,
    zone_type    TEXT NOT NULL CHECK (zone_type IN ('supply', 'demand')),
    price_top    REAL NOT NULL,
    price_bottom REAL NOT NULL,
    strength     INTEGER NOT NULL,
    tested       INTEGER NOT NULL DEFAULT 0,
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    freshness    TEXT NOT NULL DEFAULT 'fresh',
    origin_time  TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_state (
    id             INTEGER PRIMARY KEY DEFAULT 1,
    running        BOOLEAN NOT NULL DEFAULT FALSE,
    mode           TEXT NOT NULL DEFAULT 'paper',
    started_at     TIMESTAMPTZ,
    stopped_at     TIMESTAMPTZ,
    analysis_count INTEGER NOT NULL DEFAULT 0,
    signal_count   INTEGER NOT NULL DEFAULT 0,
    CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS backtests (
    id              TEXT PRIMARY KEY,
    pair            TEXT NOT NULL,
    timeframe       TEXT NOT NULL,
    start_date      TIMESTAMPTZ NOT NULL,
    end_date        TIMESTAMPTZ NOT NULL,
    initial_balance REAL NOT NULL,
    final_balance   REAL NOT NULL,
    total_trades    INTEGER NOT NULL,
    win_rate        REAL NOT NULL,
    profit_factor   REAL NOT NULL,
    max_drawdown    REAL NOT NULL,
    sharpe_ratio    REAL NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS learning (
    id                  INTEGER PRIMARY KEY DEFAULT 1,
    episode             INTEGER NOT NULL DEFAULT 0,
    epsilon             REAL NOT NULL DEFAULT 0.1,
    total_reward        REAL NOT NULL DEFAULT 0,
    zone_weight         REAL NOT NULL DEFAULT 0.30,
    liquidity_weight    REAL NOT NULL DEFAULT 0.25,
    amd_weight          REAL NOT NULL DEFAULT 0.25,
    confirmation_weight REAL NOT NULL DEFAULT 0.20,
    updated_at          TIMESTAMPTZ,
    CHECK (id = 1)
);
