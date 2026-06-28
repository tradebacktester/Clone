# Memory Validation Report
**Phase 2 Memory System — Production Hardening**
**Generated:** 2026-06-28
**System:** KRYTOS V2 Trading Bot Platform

---

## Executive Summary

The Memory Validation Engine performs **21 integrity checks** across all memory subsystem tables. Checks span 7 categories: Referential Integrity, Duplicate Detection, Timestamp Validity, Data Completeness, Orphaned Records, Trade Outcomes, and Market Context.

**Validation Status:** ✅ Engine Operational  
**Checks Implemented:** 21  
**Categories Covered:** 7  
**Auto-Repair Capable:** Yes (referential link cleanup, relationship repairs)  
**Runs Stored:** PostgreSQL `memory_validation_runs` table (permanent audit trail)

---

## Check Categories

### 1. Referential Integrity (REF-001 to REF-004)

Verifies that every foreign-key-like reference points to a real record.

| Check ID | Description | Severity | Auto-Repair |
|----------|-------------|----------|-------------|
| REF-001 | Trade events referencing non-existent setups | Warning | Partial |
| REF-002 | Screenshots pointing to non-existent trades | Info | Manual |
| REF-003 | Context records with no matching experience | Info | Via /repair |
| REF-004 | Relationship graph broken edges (trade → experience) | Warning | SQL provided |

**Key Insight:** The relationship graph uses soft links (no DB-level foreign keys) for flexibility. This requires periodic validation to catch drift. The engine detects and flags all broken edges with exact SQL repair hints.

---

### 2. Duplicate Detection (DUP-001 to DUP-004)

Detects exact duplicates that would corrupt memory graph integrity and future AI modules.

| Check ID | Description | Severity | Impact |
|----------|-------------|----------|--------|
| DUP-001 | Duplicate experience records by tradeId | **Critical** | Corrupts memory graph |
| DUP-002 | Duplicate setup evaluations (same minute) | Warning | Inflated analysis data |
| DUP-003 | Duplicate trade events (same second) | Warning | Corrupted lifecycle replay |
| DUP-004 | Identical screenshot hashes | Info | Wasted storage |

**Critical:** DUP-001 is the highest severity check. Duplicate experiences cause fan-out in relationship resolution, making all graph queries return incorrect results. This must be zero before enabling any AI learning module.

---

### 3. Timestamp Validity (TS-001 to TS-004)

Ensures all timestamps are logically ordered and not corrupted.

| Check ID | Description | Severity |
|----------|-------------|----------|
| TS-001 | Trade events with future timestamps (> 1 minute) | **Critical** |
| TS-002 | Experiences with closedAt before openedAt | **Critical** |
| TS-003 | Context records with updatedAt before createdAt | Warning |
| TS-004 | Screenshots with timestamps > 24h in future | Warning |

**Root Cause Patterns:**
- TS-001/TS-004: Clock skew between trading engine and DB server
- TS-002: Corrupted close event — close price set before open was recorded
- TS-003: Benign in most cases (migration artifact)

---

### 4. Data Completeness (COMP-001 to COMP-004)

Measures coverage quality across the full experience lifecycle.

| Check ID | Description | Severity | Target |
|----------|-------------|----------|--------|
| COMP-001 | Closed trades missing context records | Warning | 0 |
| COMP-002 | Closed trades missing screenshots | Info | < 10% |
| COMP-003 | Setups missing market snapshot link | Info | < 20% |
| COMP-004 | Metadata records marked invalid | Warning | 0 |

**Coverage Goal:** Every closed trade should have: context, at least 1 screenshot, and a linked market snapshot. Completeness directly impacts the quality of future AI training data.

---

### 5. Orphaned Records (ORP-001 to ORP-003)

Finds records with no parent or meaningful link.

| Check ID | Description | Severity |
|----------|-------------|----------|
| ORP-001 | Screenshots with no tradeId or setupId | Info |
| ORP-002 | Timeline events with no trade or setup link | Info |
| ORP-003 | Skipped setup records with null/empty pair | **Critical** |

---

### 6. Trade Outcomes (OUT-001 to OUT-003)

Validates that outcome labels match PnL data.

| Check ID | Description | Severity |
|----------|-------------|----------|
| OUT-001 | Closed experiences with missing outcome | Warning |
| OUT-002 | 'win' experiences with negative PnL pips | **Critical** |
| OUT-003 | 'loss' experiences with positive PnL pips | **Critical** |

**Note:** OUT-002 and OUT-003 indicate a PnL calculation bug in the trading engine if found. They are critical because AI modules will learn incorrect patterns from them.

---

### 7. Market Context (CTX-001 to CTX-003)

Validates market-level metadata quality.

| Check ID | Description | Severity |
|----------|-------------|----------|
| CTX-001 | Snapshots missing regime classification | Info |
| CTX-002 | Invalid pair values (not EURUSD/GBPUSD/USDJPY) | Warning |
| CTX-003 | Experiences with integrity score < 30% | Warning |

---

## Health Score Formula

```
healthScore = 100 - (criticals × 25) - (warnings × 8) - (infos × 2)
              clamped to [0, 100]

overallHealth:
  ≥ 80  → "healthy"
  ≥ 50  → "degraded"
  < 50  → "critical"
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/memory/validation/run` | POST | Run full 21-check validation |
| `/api/memory/validation/quick` | GET | Fast 4-check subset |
| `/api/memory/validation/latest` | GET | Most recent completed run |
| `/api/memory/validation/history` | GET | All validation runs (paginated) |

---

## Storage

All validation runs are stored in `memory_validation_runs` with:
- Full report JSON (findings, recommendations, summary)
- Health score and overall health status
- Issue counts by severity
- Duration and timestamps

This creates a permanent audit trail for regulatory and operational purposes.

---

## Test Coverage

**28 unit tests** validate all pure logic without a DB connection:
- `computeHealthScore` — 7 tests
- `computeOverallHealth` — 5 tests
- `buildRecommendations` — 6 tests
- Finding structure — 3 tests
- Compound scenarios — 7 tests

All tests pass via `node:test` (tsx runner).

---

*Report generated by the KRYTOS V2 Memory Validation Engine — Phase 2 Memory Hardening*
