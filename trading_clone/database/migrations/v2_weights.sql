-- ============================================================
-- Database Schema V2
-- Table: weight_snapshots  (AI Learning history)
-- ============================================================

CREATE TABLE IF NOT EXISTS weight_snapshots (
    version             INTEGER     PRIMARY KEY,
    trade_count         INTEGER     NOT NULL DEFAULT 0,
    zone                REAL        NOT NULL CHECK (zone    BETWEEN 0.10 AND 0.55),
    liquidity           REAL        NOT NULL CHECK (liquidity BETWEEN 0.10 AND 0.55),
    amd                 REAL        NOT NULL CHECK (amd     BETWEEN 0.10 AND 0.55),
    confirmation        REAL        NOT NULL CHECK (confirmation BETWEEN 0.10 AND 0.55),
    learning_rate       REAL        NOT NULL,
    notes               TEXT        NOT NULL DEFAULT '',
    timestamp           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed: V1 default weights
INSERT INTO weight_snapshots
    (version, trade_count, zone, liquidity, amd, confirmation, learning_rate, notes)
VALUES
    (1, 0, 0.30, 0.25, 0.25, 0.20, 0.05, 'Initial default weights')
ON CONFLICT (version) DO NOTHING;

-- ── Example: what the table looks like after 1000 trades ────
-- SELECT version, trade_count,
--        ROUND(zone         * 100)::INT || '%' AS zone,
--        ROUND(liquidity    * 100)::INT || '%' AS liquidity,
--        ROUND(amd          * 100)::INT || '%' AS amd,
--        ROUND(confirmation * 100)::INT || '%' AS confirmation,
--        learning_rate,
--        notes
-- FROM   weight_snapshots
-- ORDER  BY version;
