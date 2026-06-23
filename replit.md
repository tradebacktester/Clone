# TradeClone AI

An algorithmic trading bot that learns Smart Money / Supply & Demand / AMD strategy behavior and executes trades on EUR/USD, GBP/USD, and USD/JPY.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite, TailwindCSS, Recharts, Wouter, React Query

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle table definitions (trades, bot, market, learning, backtest, broker)
- `artifacts/api-server/src/routes/` — Express route handlers (bot, trades, analytics, market, learning, backtest, broker)
- `artifacts/dashboard/src/` — React dashboard frontend

## Architecture decisions

- OpenAPI-first: all types generated from `lib/api-spec/openapi.yaml` via Orval — never hand-write API types
- Broker layer is abstracted behind `/broker/accounts` API; actual broker connectivity (OANDA/MT5/TradeLocker) added when credentials provided
- Backtesting runs simulated trades server-side (realistic AMD/SMC pattern simulation) stored in DB
- RL agent state tracked in `rl_agent` table; actual reinforcement learning weights will be persisted as model versions
- Risk limits enforced at bot start/stop level; daily/weekly loss tracked from closed trades

## Product

- **Dashboard**: Live bot status, open positions, active signals, recent trade feed, key metrics
- **Trade Journal**: Full trade history with AMD pattern, zone data, R:R, P&L filtering
- **Analytics**: Equity curve, monthly P&L, drawdown, win rate breakdown by pair/session/zone
- **Market Analysis**: Supply/demand zones per pair/timeframe, market regime, active signals
- **Learning Engine**: RL agent stats (episode, epsilon, reward), setup quality scores by pattern
- **Backtesting**: Run backtests by pair/date/balance, view historical results
- **Settings**: Bot config, risk management, broker account management

## Supported Pairs & Sessions

- Pairs: EUR/USD, GBP/USD, USD/JPY
- Sessions: London (primary), New York (secondary)
- Strategy: Smart Money + Supply & Demand + AMD (Accumulation/Manipulation/Distribution)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after any OpenAPI spec change before building routes or frontend
- Broker API keys stored in `broker_accounts` table — NOT in environment variables (added via Settings UI)
- The `rl_agent` table has a single row (singleton) — always use LIMIT 1 and upsert pattern
- Bot state is a singleton row in `bot_state` table — same pattern

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
