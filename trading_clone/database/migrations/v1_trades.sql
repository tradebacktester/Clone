-- ============================================================
-- Database Schema V1
-- Table: trades
-- ============================================================

CREATE TABLE IF NOT EXISTS trades (
    trade_id            TEXT        PRIMARY KEY,
    pair                TEXT        NOT NULL CHECK (pair IN ('EURUSD', 'GBPUSD', 'USDJPY')),
    direction           TEXT        NOT NULL CHECK (direction IN ('BUY', 'SELL')),
    entry               REAL        NOT NULL,
    stop_loss           REAL        NOT NULL,
    take_profit         REAL        NOT NULL,
    risk_reward         REAL        NOT NULL,
    zone_score          INTEGER     NOT NULL DEFAULT 0 CHECK (zone_score BETWEEN 0 AND 100),
    liquidity_score     INTEGER     NOT NULL DEFAULT 0 CHECK (liquidity_score BETWEEN 0 AND 100),
    amd_score           INTEGER     NOT NULL DEFAULT 0 CHECK (amd_score BETWEEN 0 AND 100),
    confirmation_score  INTEGER     NOT NULL DEFAULT 0 CHECK (confirmation_score BETWEEN 0 AND 100),
    final_score         REAL        NOT NULL DEFAULT 0 CHECK (final_score BETWEEN 0 AND 100),
    result              TEXT        NOT NULL DEFAULT 'OPEN'
                                    CHECK (result IN ('WIN', 'LOSS', 'BREAKEVEN', 'OPEN')),
    session             TEXT        NOT NULL CHECK (session IN ('london', 'newyork', 'asian')),
    date                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trades_pair        ON trades (pair);
CREATE INDEX IF NOT EXISTS idx_trades_direction   ON trades (direction);
CREATE INDEX IF NOT EXISTS idx_trades_result      ON trades (result);
CREATE INDEX IF NOT EXISTS idx_trades_session     ON trades (session);
CREATE INDEX IF NOT EXISTS idx_trades_date        ON trades (date DESC);
CREATE INDEX IF NOT EXISTS idx_trades_final_score ON trades (final_score DESC);

-- ── Example query: closed win-rate by pair ───────────────────
-- SELECT pair,
--        COUNT(*)                                     AS total,
--        SUM(CASE WHEN result = 'WIN' THEN 1 END)    AS wins,
--        ROUND(AVG(risk_reward)::NUMERIC, 2)          AS avg_rr,
--        ROUND(AVG(final_score)::NUMERIC, 2)          AS avg_score
-- FROM   trades
-- WHERE  result <> 'OPEN'
-- GROUP  BY pair;
