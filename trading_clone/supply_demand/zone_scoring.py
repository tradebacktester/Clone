"""
Zone scoring helpers shared by demand and supply detectors.

Score breakdown (max 100):
  ┌─────────────┬──────┬────────────────────────────────────────────┐
  │ Component   │  Max │ Condition                                  │
  ├─────────────┼──────┼────────────────────────────────────────────┤
  │ Displacement│   40 │ Impulse body / ATR  > 2→40  >1.5→30  >1→20│
  │ BOS         │   25 │ Impulse close breaks prior 20-bar extreme  │
  │ Freshness   │   25 │ 0 retests=25  1=15  2=5  3+=0             │
  │ Volume      │   10 │ Impulse vol > 1.5× 20-bar average          │
  └─────────────┴──────┴────────────────────────────────────────────┘

Zones scoring < MIN_SCORE are considered low-quality and filtered out.
"""

MIN_SCORE = 70


def score_label(score: int) -> str:
    if score >= 90:
        return "A+"
    if score >= 80:
        return "A"
    if score >= 70:
        return "B"
    if score >= 60:
        return "C"
    return "D"


def freshness_emoji(freshness: str) -> str:
    return {"fresh": "🟢", "tested": "🟡", "stale": "🔴"}.get(freshness, "❓")


def zone_bar(score: int, width: int = 20) -> str:
    filled = round(score / 100 * width)
    return "[" + "█" * filled + "░" * (width - filled) + "]"
