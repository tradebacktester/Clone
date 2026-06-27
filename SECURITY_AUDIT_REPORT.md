# Security Audit Report — TradeClone AI

Generated: 2026-06-27

---

## Executive Summary

The security posture of this application has one critical, deployment-blocking vulnerability: the complete absence of authentication on all API endpoints. Every route that controls the trading bot — starting and stopping the engine, adding broker credentials, closing trades, enabling live trading — is publicly accessible with no credential check of any kind. This single issue means anyone who can reach the server's port can take full control of the trading system. Beyond authentication, the audit found plaintext storage of broker API keys, a fully open CORS policy, inconsistent error message sanitization, no rate limiting, no request size limits, and eight known dependency vulnerabilities (two rated high severity).

---

## Critical Findings

### No Authentication on Any Endpoint

`artifacts/api-server/src/app.ts` applies no authentication middleware. The router is mounted at `/api` with no preceding `authenticate()` or `requireApiKey()` call. Every Express route in all 24 route files — including `/api/bot/start`, `/api/bot/stop`, `/api/broker/accounts` (which accepts broker API keys), `/api/deployment/mode`, and `/api/trades/:id/close` — is fully accessible to any HTTP client on the network without providing any credential.

This is not a theoretical risk. In a Replit environment the dev server is accessible via a public `*.replit.dev` URL by default. A single unauthenticated POST to `/api/bot/start` would begin executing paper trades; a POST to `/api/broker/accounts` with fabricated credentials would insert records into the database; a POST to `/api/deployment/mode` with `{ "mode": "live" }` would switch the bot to live trading mode.

**Immediate remediation required:** Add an API-key-based authentication middleware (a single shared secret injected as an environment variable, validated on every request via the `Authorization: Bearer <token>` header) before any route handler is reachable. This can be a single middleware function inserted before `app.use("/api", router)` in `app.ts`.

### Broker API Keys Stored in Plaintext

The `broker_accounts` table in `lib/db/src/schema/broker.ts` defines `apiKey` as `text("api_key").notNull()` and `apiSecret` as `text("api_secret")`. Both are stored and retrieved as plain UTF-8 strings with no encryption. Any actor with read access to the PostgreSQL database — a compromised DB credential, an accidental `SELECT *` leak in a log, or a future SQL-adjacent vulnerability — gains immediate access to live broker credentials that can control real money accounts.

**Remediation:** Encrypt broker credentials at the application layer before writing to the database using a symmetric key derived from an environment-variable secret (e.g. AES-256-GCM). The decryption key should never touch the database. Alternatively, use a secrets manager (Vault, AWS Secrets Manager) and store only a reference ID in the database row.

---

## High Severity Findings

### CORS Wildcard Policy

`app.ts` line 36: `app.use(cors())` is called with no configuration object. The `cors` package defaults to `Access-Control-Allow-Origin: *`, which means any web page on the internet can make cross-origin requests to this API. If a browser-based dashboard is ever served from the same origin or an attacker tricks a logged-in user's browser into visiting a malicious page, cross-site request forgery becomes trivial because there is no same-origin restriction and no CSRF token mechanism.

**Remediation:** Restrict CORS to the known dashboard origin: `app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? "http://localhost:5000" }))`.

### No Rate Limiting on Any Endpoint

No endpoint applies rate limiting. An attacker (or a misconfigured client) can send thousands of requests per second to computationally expensive endpoints like `/api/robustness/run` (which triggers a 10,000-simulation Monte Carlo pipeline), `/api/backtest/run`, or `/api/bot/start`. This creates a denial-of-service vector where the CPU is saturated by repeated backtest or robustness pipeline invocations.

**Remediation:** Apply `express-rate-limit` globally (e.g. 100 requests per minute per IP) and tighten limits on computation-heavy endpoints to 2–5 invocations per minute.

### Dependency Vulnerabilities — 8 Known Issues

Running `pnpm audit` against the current lockfile reveals 8 known CVEs:

- **High — `qs` (GHSA-2557-xxxx, depth 3 via express):** Prototype pollution. `qs` is used by Express to parse query strings. Update `qs` to ≥ 6.15.3.
- **High — `@babel/core` (GHSA-4x5r-pxfx-6jf8, depth 3 via @vitejs/plugin-react):** Arbitrary file read via sourceMappingURL comment. This is a dev-dependency but affects anyone who runs the build pipeline with untrusted input. Update `@babel/core` to ≥ 7.29.6.
- **Moderate — `markdown-it` (depth 4 via orval > typedoc):** ReDoS and potential HTML injection in rendering. This is a devDependency in the codegen pipeline. Update `markdown-it` to ≥ 14.2.0.
- **Low — `esbuild` (GHSA-g7r4-m6w7-qqqr):** Arbitrary file read via the dev server, Windows-only. Low risk in a Linux/Replit deployment but should be updated when possible.
- Four additional moderate-severity advisories in transitive dependencies.

**Remediation:** Run `pnpm update qs @babel/core markdown-it esbuild --latest` and re-audit. Pin minimum versions in workspace `package.json` files.

---

## Medium Severity Findings

### `String(err)` Leaks Internal Error Details in 500 Responses

Multiple route files use `res.status(500).json({ error: String(err) })` as their catch handler. When Node.js errors occur, `String(err)` produces messages like `"Error: relation 'market_zones' does not exist"`, `"Error: connect ECONNREFUSED 127.0.0.1:5432"`, or error messages that include internal file paths. These messages reveal the database schema structure, internal service topology, and sometimes stack traces that an attacker can use to map the system.

Routes affected: `historical.ts` (10 occurrences), `deployment.ts`, `production-readiness.ts`, `robustness.ts`, `v2.ts`.

**Remediation:** Replace with `res.status(500).json({ error: "Internal server error" })` and log the full error server-side. The pattern used in `memory.ts` (which already uses the safe generic message) should be the standard.

### No Request Body Size Limit

Express is configured with `express.json()` and `express.urlencoded({ extended: true })` with no `limit` option. The default Express JSON body limit is 100KB, but the historical data route (`/api/historical/upload`) accepts raw file content in the request body (`content` field). A malicious client could send a multi-megabyte payload and hold the event loop while it is parsed.

**Remediation:** Set an explicit body size limit: `express.json({ limit: "1mb" })` globally and `express.json({ limit: "50mb" })` only on the historical upload route.

### Yahoo Finance Price Feed Has No Fallback Validation

`price-feed.ts` polls `query1.finance.yahoo.com` every 30 seconds using an unofficial, unauthenticated endpoint. The `User-Agent` header mimics a browser to avoid bot detection. This endpoint has no SLA, has been blocked intermittently, and is subject to change without notice. When the feed fails, the engine falls back to hardcoded stale prices (`EURUSD: 1.0850`, etc.) without any alert or halt signal to the trading engine. A stale fallback price used for order sizing produces incorrect lot calculations silently.

**Remediation:** When the live price is a fallback, the supervisor engine should raise an alert and the paper/live engine should not execute new trades. Tag price entries with `source: "fallback"` (already done) and add a gate in `executePaperSignals` that refuses to open positions when `priceEntry?.source === "fallback"`.

---

## Low Severity Findings

### Logging Redaction is Incomplete for Request Bodies

`logger.ts` correctly redacts `Authorization` and `Cookie` headers from pino-http logs. However, request bodies are not logged by pino-http by default (only method and URL are captured, per the serializer in `app.ts`). This is the correct behaviour. However, several explicit `logger.info({ signal })` calls in `paper-engine.ts` will log the full signal object, which includes the trade direction, entry price, and lot size. In a multi-tenant or shared-log environment, this creates a trade-information leak. These should log only non-sensitive identifiers (pair, trade ID).

### No HTTPS Enforcement at Application Layer

The server binds to HTTP. TLS termination is handled by the Replit proxy in development. In a production deployment this assumption must be made explicit — either enforce HTTPS via a reverse proxy and add an HSTS header (`Strict-Transport-Security: max-age=31536000`), or document that the application requires a TLS-terminating load balancer in front of it.

### No Secrets in Source Code

A full scan of all TypeScript source files, configuration files, and committed assets found no hardcoded API keys, passwords, JWT secrets, or connection strings. The `.env`-equivalent secrets are injected via Replit's environment variable system (`DATABASE_URL`). This is correct behaviour.

### Drizzle ORM Prevents SQL Injection

All database interactions use Drizzle ORM's typed query builder. No raw SQL template literals or string concatenation for query construction was found. SQL injection is not a risk with the current codebase.

---

## Remediation Priority Summary

- **Immediate (blocks production deployment):** Add authentication middleware; restrict CORS origin; update `qs` and `@babel/core`.
- **Before live trading:** Encrypt broker API keys at rest; add rate limiting; gate trade execution on stale price detection.
- **Near-term:** Standardize 500 error responses; add request body size limits; set HTTPS enforcement policy.
- **Ongoing:** Monitor `pnpm audit` in CI on every dependency update.
