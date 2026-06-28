# Visual Memory & Context Memory System

KRYTOS V2 — Phase 2, Prompt 3/5

---

## Overview

Every trade, setup, and market event is enriched with two complementary memory layers:

| System | Purpose |
|---|---|
| **Context Memory** | Market regime, session, volatility, news, strategy state, trader notes/emotions, lessons learned |
| **Visual Memory** | Chart screenshots tagged to lifecycle stages (before_entry, htf_analysis, etc.) |

Both systems are **storage and retrieval infrastructure only** — no AI, no pattern recognition.

---

## Database Tables

### `trade_screenshots`
One row per screenshot per trade lifecycle stage. Append-only (never overwrite imageData).

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | Random UUID |
| `trade_id` | integer | Links to `trades` table |
| `setup_id` | UUID | Optional link to memory setup |
| `stage` | text | Lifecycle stage (see below) |
| `timeframe` | text | Chart timeframe (1m–1w) |
| `pair` | text | e.g. EUR/USD |
| `image_data` | text | Full base64-encoded image |
| `thumbnail_data` | text | Preview (~37KB truncated or ≤200KB image) |
| `mime_type` | text | image/png, image/jpeg, image/webp, image/gif |
| `size_bytes` | integer | Raw image size in bytes |
| `file_hash` | text | SHA-256 of raw bytes (duplicate detection) |
| `notes` | text | Trader annotation |
| `tags` | jsonb | String[] of custom tags |
| `chart_annotations` | jsonb | Arbitrary annotation metadata |
| `captured_at` | timestamptz | When the screenshot was taken |
| `uploaded_at` | timestamptz | When it was stored |

**Valid stages:** `before_entry` · `entry` · `during_trade` · `break_even` · `partial_tp` · `htf_analysis` · `ltf_analysis` · `after_exit` · `custom`

### `trade_context`
One row per trade (upsert pattern). Rich episodic context split into three sub-domains.

**Market sub-domain:** trend_strength, market_regime, session, liquidity_level, spread_pips, volatility, volatility_score, correlation_data, news_context, session_open_close, day_of_week

**Strategy sub-domain:** htf_bias, premium_discount_state, supply_strength, demand_strength, liquidity_score, amd_stage, confirmation_quality, trader_intelligence_score, rule_evaluation_summary

**Trader sub-domain:** manual_notes, confidence (0–100), emotion_tag, reason_accepted, reason_rejected, lessons_learned

Also stores `search_vector` — a concatenated text blob for future pgvector semantic search.

**Valid emotion tags:** `calm` · `confident` · `disciplined` · `uncertain` · `fearful` · `fomo`

### `context_timeline_events`
Append-only event log combining auto-events (from trading engine) and manual review events.

**Valid stages:** `market_scan` · `htf_analysis` · `setup_created` · `screenshot_saved` · `liquidity_sweep` · `amd_complete` · `entry` · `break_even` · `partial_tp` · `exit` · `review` · `lesson_learned` · `note_added` · `custom`

---

## API Endpoints

### Visual Memory

| Method | Path | Description |
|---|---|---|
| POST | `/api/memory/screenshots` | Upload a screenshot (up to 10MB) |
| GET | `/api/memory/screenshots/gallery` | All screenshots paginated (no imageData) |
| GET | `/api/memory/screenshots/:tradeId` | All screenshots for a trade |
| GET | `/api/memory/screenshot/:id/image` | Full resolution image |
| GET | `/api/memory/screenshot/:id/thumbnail` | Thumbnail preview |
| DELETE | `/api/memory/screenshots/:id` | Delete screenshot |

#### Upload Body
```json
{
  "tradeId": 42,
  "stage": "before_entry",
  "timeframe": "4h",
  "pair": "EUR/USD",
  "theme": "dark",
  "notes": "Clear FVG visible at 1.0820",
  "tags": ["fvg", "premium"],
  "imageData": "data:image/png;base64,..."
}
```

#### Duplicate Detection
Same SHA-256 hash + same tradeId → returns existing record (`isDuplicate: true`, HTTP 200).

### Context Memory

| Method | Path | Description |
|---|---|---|
| POST | `/api/memory/context/:tradeId` | Create or replace context |
| GET | `/api/memory/context/:tradeId` | Retrieve context |
| PATCH | `/api/memory/context/:tradeId` | Partial update (notes, emotion, lessons) |
| POST | `/api/memory/context/:tradeId/lesson` | Record a lesson learned |
| POST | `/api/memory/context/:tradeId/event` | Add a manual timeline event |
| GET | `/api/memory/context-timeline/:tradeId` | Full merged timeline |
| GET | `/api/memory/context/search` | Search by session, regime, notes, emotion |

#### Search Query Parameters
`session`, `regime`, `notes` (free-text ILIKE), `emotionTag`, `dayOfWeek`, `dateFrom`, `dateTo`, `limit`, `offset`

---

## Image Storage

Screenshots are stored as base64 text in PostgreSQL `TEXT` columns (PostgreSQL TOAST handles large values efficiently out-of-line).

| Limit | Value |
|---|---|
| Max image size | 10MB raw |
| Max base64 input | ~13.7MB |
| Express body limit | 15MB (for the screenshot endpoint) |
| Supported MIME types | PNG, JPEG, WebP, GIF |

**Thumbnails:** For images ≤ 200KB, the thumbnail is identical to the original. For larger images, a 50000-character prefix of the base64 is used as a preview (~37KB), sufficient for gallery display at CSS-constrained sizes. True downscaling requires native `sharp` (future upgrade path).

---

## Auto-Population

When a trade opens through the paper engine, `autoPopulateContextFromTrade` is called automatically with:
- Market regime, session, spread, news status
- AMD stage (set to `accumulation` initially)
- TQI score and MTF alignment
- Entry event appended to the context timeline

The **Trader Context** (notes, emotion, confidence, lessons) is never auto-populated — always requires manual input via the dashboard or API.

---

## Context Timeline Merging

`GET /api/memory/context-timeline/:tradeId` merges three sources:

1. **Engine events** from `trade_events` table (opened, closed, break-even, etc.)
2. **Context events** from `context_timeline_events` table (rich stage log)
3. **Screenshot events** from `trade_screenshots` (each screenshot = timeline moment)

All sorted chronologically. Each event carries: `stage`, `title`, `description`, `source` (engine/system/user), `occurredAt`, `iconType`, `meta`, `type`.

---

## Dashboard — Context & Visual Memory

Navigate to `/context-memory` in the dashboard.

**Enter a trade ID** in the top bar to explore:

| Tab | Contents |
|---|---|
| Timeline | Vertical chronological timeline merging all event sources |
| Screenshots | Gallery grid with stage labels, thumbnail preview, upload form |
| Context | Three cards: Market / Strategy / Trader context fields |
| Notes | Editor for manual notes, lessons learned, emotion tagging, confidence slider |
| Search | Filter by session, regime, emotion, day, free-text notes |

---

## Future Upgrades

- **pgvector embedding**: `search_vector` field is pre-computed as a text blob for future vectorisation. When pgvector is installed, replace ILIKE search with cosine-similarity nearest-neighbour search.
- **True thumbnail generation**: Install `sharp` (native binary) for server-side image resizing to 200px width at ≤ 20KB.
- **Compression metrics**: Track `compression_ratio` per screenshot and auto-reject low-quality uploads.
- **News integration**: Populate `news_context` automatically from an economic calendar feed.
- **Screenshot diff**: Compare before/after screenshots for the same trade using structural similarity.
