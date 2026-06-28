# Learning Version History — Technical Report
**System:** KRYTOS V2 — Learning System Enhancement, Phase 4**
**Status:** ADVISORY ONLY — versioning is metadata only**
**Date:** 2026-06-28**

---

## 1. Executive Summary

The Learning Version Controller applies semantic versioning to every learning cycle snapshot. This enables reproducible auditing, regression detection, structured comparisons between system states, and a full changelog of how the learning system evolved over time.

Versioning is pure metadata — it does not modify learning methodology, execution parameters, or advisory output calculation.

---

## 2. Versioning Scheme

KRYTOS V2 uses standard semantic versioning: **vMAJOR.MINOR.PATCH**

| Level | Trigger | Example |
|-------|---------|---------|
| **MAJOR** | Breaking change detected | Health drop >20pts, validation→failed, method change | `v1.x.x → v2.0.0` |
| **MINOR** | Improvement or new capabilities | New patterns, improved win rate >3pp, features gained | `v1.2.x → v1.3.0` |
| **PATCH** | Trivial re-run, minor data refresh | Same methodology, <3pp win rate delta | `v1.2.3 → v1.2.4` |

### Change Type Rules (in priority order)
1. **MAJOR**: health score drop > 20pts OR validation status degraded to "failed" OR 3+ patterns significantly degraded
2. **MINOR**: new patterns discovered, new features gained, win rate improved > 3pp, health improved > 5pts
3. **PATCH**: all other changes

---

## 3. Version Snapshot Data

Each version snapshot records:

**Performance Metrics:**
- Win rate, avg confidence, avg TQI, avg setup score
- Profit factor, total PnL
- Trade count, feature count

**Validation State:**
- Validation status (passed / degraded / failed)
- Validation score (0–100)

**Health State:**
- Health score (0–100), health grade (A–F)

**Top Rankings:**
- Top 5 feature rankings (feature name, importance, rank)
- Top 5 pattern rankings (pattern, win rate, sample size, rank)
- Regime distribution (% of trades in each regime)

**Change Summary (vs prior version):**
- Delta metrics for all key performance indicators
- List of major changes
- Breaking change flag
- Change type (major/minor/patch)

---

## 4. Version Comparison Engine

`compareVersions(versionA, versionB)` produces:

```
{
  overallImpact: "improved" | "stable" | "degraded" | "mixed"
  changeType: "major" | "minor" | "patch"
  breakingChanges: boolean
  winRateDelta: number
  healthScoreDelta: number
  profitFactorDelta: number
  patternsNew: string[]
  patternsDegraded: string[]
  featuresGained: string[]
  featuresLost: string[]
  regimeShifts: Record<string, { before, after }>
  recommendations: string[]
  summary: string
}
```

---

## 5. Changelog Format

The `generateVersionChangelog()` function produces a Markdown changelog sorted newest-first, with:
- Semver header + date
- Performance snapshot row
- Change type label (MAJOR / MINOR / PATCH)
- Warning markers (⚠️) for major change bullets
- Changelog notes (operator-provided)

---

## 6. Version Tags

Operators can tag versions for semantic meaning:
- `stable` — production-quality snapshot
- `experimental` — under observation
- `baseline` — reference point for comparisons
- `milestone` — significant capability release
- `manual` — manually triggered

One version is marked `isActive = true` at any time. The first version is automatically marked `isBaseline = true`.

---

## 7. Test Coverage

- 25 tests across 6 suites
- Coverage: bumpVersion logic (all 3 types), initial version creation, version bumping rules, comparison engine (improved/degraded/stable/mixed), new pattern detection, feature gains/losses, changelog format, sort order
- All 25 tests pass

---

## 8. API Endpoints

```
GET  /api/learning/enhancement/versions              — list all versions
GET  /api/learning/enhancement/versions/:id          — single version detail
GET  /api/learning/enhancement/versions/changelog    — markdown changelog
POST /api/learning/enhancement/versions/compare      — compare two versions
POST /api/learning/enhancement/create-version        — create new version snapshot
```

---

## 9. Version Timeline (Initial State)

No versions exist until the first `POST /api/learning/enhancement/create-version` is called. The initial version will be tagged `v1.0.0`, `isBaseline: true`, `isActive: true`. Subsequent cycles will auto-bump based on the change classifier.
