# Production Readiness Audit — TradeClone AI

Generated: 2026-06-27
Review scope: Full repository audit as if preparing for deployment to a hedge fund environment handling real FX positions.

---

## Overview

TradeClone AI has a strong algorithmic foundation — a well-structured multi-engine trading pipeline with AMD/SMC strategy logic, robust backtesting, Monte Carlo simulation, multi-timeframe validation, and a comprehensive supervisor system. The architecture decisions (OpenAPI-first, Drizzle ORM, modular market analysis library, live readiness gating) are sound. However, the system is not yet production-deployable in a capital-at-risk environment. The critical blockers are the complete absence of authentication, plaintext credential storage, and several scalability issues that will manifest with real trading volume. These must be resolved before live trading is enabled.

---

## Critical Priority — Must Fix Before Any Production Deployment

**No authentication on any API endpoint.** Every route — including bot start/stop, live trading mode toggle, broker credential management, and trade closure — is publicly accessible with no token, session, or key check. This is the highest-priority blocker. Without authentication, the server cannot be safely exposed to any network beyond a strictly private localhost environment.

**Broker API keys stored as plaintext text in PostgreSQL.** The `broker_accounts.api_key` and `broker_accounts.api_secret` columns are unencrypted UTF-8 strings. In the event of a database credential leak, a log-level SQL trace, or a future application vulnerability, live broker credentials are immediately exposed. For a system that may control real money positions, credentials must be encrypted at rest using application-layer AES-256-GCM encryption, with the encryption key held only in the runtime environment, never persisted.

**No rate limiting on any endpoint.** Computationally expensive operations — running a robustness pipeline (10,000 Monte Carlo simulations), triggering a backtest, starting the analysis scheduler — have no throttling. A single automated client can saturate the server CPU with repeated invocations, denying service to the trading engine itself.

**O(n²) peak balance calculation blocks the event loop.** The drawdown computation in `paper-engine.ts` (lines 242–247) has quadratic time complexity. At 10,000 closed trades it would block Node.js for several seconds on every signal execution, during which time the server cannot respond to health checks, price updates, or stop-loss monitoring. This is a hard blocker for any system intended to run unattended for months.

---

## High Priority — Must Fix Before Live Trading Is Enabled

**Missing database indexes on the trades table.** The `trades` table has no secondary indexes on `status`, `pair`, or `openedAt`. Every analytics query, every paper engine P&L check, and every trade list request performs a full sequential table scan. At 5,000+ trades this causes multi-second API response times and elevated DB CPU. Required indexes: `trades(status, pair, openedAt)` and `market_zones(pair, active)`.

**Analytics routes aggregate 100% of trade rows in JavaScript.** Win rate, profit factor, drawdown, and rule-adherence computations load the entire trades table into Node.js memory and process it with JavaScript reduce/filter. PostgreSQL can compute all of these with a single SQL query in milliseconds. This pattern causes memory exhaustion and multi-second latency as trade history grows — a system that trades daily for six months will have thousands of records.

**All closed trades fetched on every signal execution (up to 12×/cycle).** `executePaperSignals()` issues an unbounded `SELECT * FROM trades WHERE status = 'closed'` on every invocation. This runs for each pair/timeframe combination in the scheduler. It must be replaced with a single aggregate SQL query run once per scheduler cycle, cached for the duration of that cycle, and passed as a parameter.

**CORS wildcard policy.** `app.use(cors())` with no origin restriction allows any web page on the internet to make cross-origin requests to the API. This must be restricted to the known dashboard origin before the API is accessible on any public or semi-public network.

**Two high-severity dependency vulnerabilities.** The `qs` library (used by Express for query string parsing) has a prototype pollution CVE. `@babel/core` (used in the Vite build pipeline) has an arbitrary file read CVE. Both have patches available and should be updated before production deployment.

**MTF gate and correlation gate rejection reasons are miscoded.** Both failures are currently logged as generic `"below_confidence"` or `"pair_already_open"` reasons in the missed-opportunity tracker. This corrupts the learning engine's signal quality analysis and makes post-incident debugging significantly harder. Correct reason codes must be used for the system's own learning data to be trustworthy.

**TQI gate is optional — trades can execute without quality validation.** When `analysisResult` is null, the TQI gate is skipped and the trade executes. In production this should be a hard rejection.

---

## Medium Priority — Fix Before Extended Paper Trading or Live Demo

**`String(err)` in 500 error responses leaks internal implementation details.** Routes in `historical.ts`, `deployment.ts`, and `production-readiness.ts` return raw error messages to the client, including database schema names, internal file paths, and service topology. Standardise all error responses to `{ error: "Internal server error" }` and log the full error server-side only.

**Dashboard has no code splitting.** All 23 pages are statically imported and bundled into a single JavaScript file. The initial page load downloads code for every page regardless of which route the user visits. Implementing `React.lazy()` with Vite dynamic imports reduces the initial bundle by an estimated 60–70%.

**Market zones table cleared and re-inserted on every analysis run.** The full DELETE + INSERT approach creates a brief window where zone data is empty, causing UI flicker and potentially affecting any concurrent request that reads zones during the re-insertion. An upsert-based approach eliminates this window.

**No request body size limit beyond Express defaults.** The historical data upload endpoint accepts arbitrary-length JSON bodies. Without an explicit limit, a malicious or misconfigured client can submit a multi-megabyte payload and stall the JSON parser.

**Price feed fallback prices are used silently.** When Yahoo Finance is unreachable, the engine falls back to hardcoded stale prices without halting trade execution. A trade opened against a stale price will have incorrect lot sizing and incorrect P&L reference. The engine should refuse to open positions when the price source is flagged as `"fallback"`.

**No response compression middleware.** API responses are sent uncompressed. GZIP via Express `compression` middleware would reduce JSON payload sizes by 70–80% with no application logic changes.

**Strategy health monitor fetches all trades for drawdown check (runs every 30 minutes).** The health monitor's `checkDrawdown()` function loads the entire trade history on every tick. This should use the same cached or aggregated data pattern recommended for the paper engine.

---

## Low Priority — Operational Improvements Before Long-Term Production

**No structured audit log for critical operations.** Starting/stopping the bot, enabling live trading, adding broker accounts, and manually closing trades are operations that require an immutable audit trail in a regulated trading environment. A dedicated `audit_log` table with actor, action, timestamp, and before/after values is standard in financial systems. Currently these events are captured only in `execution_log`, which has a broader scope and no immutability guarantees.

**Yahoo Finance as the sole live price source.** The unofficial Yahoo Finance endpoint has no SLA, no support, and has been intermittently blocked for bot-like User-Agent strings. In a production trading environment, price data must come from the connected broker's official API feed (OANDA streaming, TradeLocker WebSocket, MT5 price bridge). The current implementation is suitable only for paper trading in development.

**No pagination enforced on list endpoints.** Several routes return unbounded result sets — `/api/analytics/summary`, `/api/market/zones`, `/api/market/regime`. In a long-running deployment, these responses grow without limit. All list endpoints should enforce a maximum page size and return cursor or offset pagination tokens.

**`missed_opportunities` table has no retention policy.** The table grows indefinitely as rejected signals accumulate. After one year of operation with multiple analysis cycles per hour, this table could contain hundreds of thousands of rows. A rolling 90-day retention window should be enforced via a periodic cleanup job.

**No health check endpoint that validates DB connectivity.** The existing `/api/health` endpoint should verify that it can reach the database (a lightweight `SELECT 1`) and return an appropriate error code if not. This is required for load balancer health checks in any cloud deployment.

**`lib/market-analysis` exports ~350 symbols — many are internal.** The public API surface of this library is far larger than necessary. Unexported internal helpers reduce the risk of external callers depending on unstable internals and improve tree-shaking effectiveness.

**No CI pipeline.** There is no automated test run, lint check, typecheck, or security audit on push. For a system that will manage real capital, a CI gate that runs `pnpm typecheck`, `pnpm audit`, and the full market-analysis test suite (currently 51+ tests passing) on every change is essential.

**No structured deployment runbook.** The path from the current Replit development environment to a production deployment (database migration, environment variable provisioning, TLS configuration, broker credential onboarding, live trading gate activation) is not documented. A runbook reduces operational risk during the transition from paper to live trading.

---

## Readiness Score by Domain

- **Authentication & Authorisation:** Not ready. Zero authentication exists.
- **Data Security:** Not ready. Plaintext credential storage.
- **Scalability:** Conditionally ready. Functional for low trade volumes; will degrade beyond ~500 trades without index and aggregation fixes.
- **Reliability:** Conditionally ready. Recovery engine and supervisor system are strong; price feed fallback is a gap.
- **Observability:** Mostly ready. Pino structured logging, supervisor alerts, strategy health snapshots, and execution logs provide good visibility. Missing: immutable audit log, DB health in /health endpoint.
- **Trading Logic Correctness:** Ready. AMD/SMC strategy, MTF alignment, TQI, dynamic sizing, and risk limits are well-implemented.
- **Frontend Performance:** Conditionally ready. Functional but bundles all pages eagerly; code splitting needed.
- **Dependency Security:** Not ready. Two high-severity CVEs outstanding.
