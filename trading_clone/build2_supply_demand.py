"""
Build #2 — Supply & Demand Engine
===================================
Outputs:
  • Demand Zones  (with price range, score, freshness)
  • Supply Zones  (with price range, score, freshness)
  • Zone Scores   (A+/A/B breakdown, distance from price)
"""

from trading_clone.market_data.data_feed import generate_synthetic_candles
from trading_clone.market_structure.swing_detector import calc_atr
from trading_clone.market_structure.premium_discount import calc_fib
from trading_clone.supply_demand.demand_detector import detect_demand_zones, DemandZone
from trading_clone.supply_demand.supply_detector import detect_supply_zones, SupplyZone
from trading_clone.supply_demand.zone_filter import filter_zones, is_price_in_zone, approaching_zone
from trading_clone.supply_demand.zone_scoring import (
    MIN_SCORE, score_label, freshness_emoji, zone_bar,
)

PAIRS     = ["EURUSD", "GBPUSD", "USDJPY"]
TIMEFRAME = "H1"
LIMIT     = 300


# ── Formatting helpers ────────────────────────────────────────────────────────

def _pip(pair: str, value: float) -> str:
    scale = 100 if pair == "USDJPY" else 10_000
    return f"{value * scale:.1f}p"


def _price_status(price: float, top: float, bottom: float,
                  atr: float, pair_name: str, zone_type: str) -> str:
    if is_price_in_zone(price, _mock_zone(top, bottom), atr):
        return "◀ IN ZONE ◀"
    direction = "buy" if zone_type == "demand" else "sell"
    if approaching_zone(price, _mock_zone(top, bottom), atr, direction):
        return "→ APPROACHING"
    dist = abs(price - (top if zone_type == "demand" else bottom))
    return f"  {_pip(pair_name, dist)} away"


class _mock_zone:
    def __init__(self, top, bottom):
        self.price_top = top
        self.price_bottom = bottom


def _zone_row(z, current: float, atr: float, pair: str, zone_type: str) -> str:
    status   = _price_status(current, z.price_top, z.price_bottom, atr, pair, zone_type)
    f_emoji  = freshness_emoji(z.freshness)
    grade    = score_label(z.score)
    width    = (z.price_top - z.price_bottom)
    width_p  = _pip(pair, width)
    return (
        f"  {f_emoji} {z.price_top:.5f} ─ {z.price_bottom:.5f}  "
        f"width={width_p:>7}  "
        f"score={z.score:>3}/100 [{grade}]  {zone_bar(z.score, 12)}  "
        f"retests={z.tested}  {status}"
    )


def _score_summary(zones, label: str) -> str:
    if not zones:
        return f"  No {label} zones detected above score {MIN_SCORE}"
    grades = [score_label(z.score) for z in zones]
    counts = {g: grades.count(g) for g in ["A+", "A", "B", "C"]}
    parts  = [f"{g}×{n}" for g, n in counts.items() if n > 0]
    avg    = sum(z.score for z in zones) / len(zones)
    return f"  {len(zones)} zones  avg={avg:.0f}/100  grades: {' '.join(parts)}"


# ── Main engine runner ────────────────────────────────────────────────────────

def run_supply_demand(pair: str) -> None:
    candles = generate_synthetic_candles(pair, TIMEFRAME, LIMIT, seed=42)
    atr     = calc_atr(candles)
    current = candles[-1].close

    raw_demand = detect_demand_zones(pair, TIMEFRAME, candles)
    raw_supply = detect_supply_zones(pair, TIMEFRAME, candles)

    demand = sorted(filter_zones(raw_demand), key=lambda z: z.score, reverse=True)
    supply = sorted(filter_zones(raw_supply), key=lambda z: z.score, reverse=True)

    print(f"\n{'═' * 72}")
    print(f"  SUPPLY & DEMAND — {pair} / {TIMEFRAME}")
    print(f"{'═' * 72}")
    print(f"  Current Price : {current:.5f}    ATR : {atr:.5f} ({_pip(pair, atr)})")
    print(f"  Candles       : {LIMIT}    Min score : {MIN_SCORE}/100")

    # ── DEMAND ZONES ──────────────────────────────────────────────────────────
    print(f"\n  {'─' * 70}")
    print(f"  📗 DEMAND ZONES  (buy intent — price approaching from above)")
    print(f"  {'─' * 70}")

    if demand:
        for z in demand:
            print(_zone_row(z, current, atr, pair, "demand"))
        print(f"\n  Summary: {_score_summary(demand, 'demand')}")
    else:
        print(f"  — No qualified demand zones (score ≥ {MIN_SCORE}) —")

    # ── SUPPLY ZONES ──────────────────────────────────────────────────────────
    print(f"\n  {'─' * 70}")
    print(f"  📕 SUPPLY ZONES  (sell intent — price approaching from below)")
    print(f"  {'─' * 70}")

    if supply:
        for z in supply:
            print(_zone_row(z, current, atr, pair, "supply"))
        print(f"\n  Summary: {_score_summary(supply, 'supply')}")
    else:
        print(f"  — No qualified supply zones (score ≥ {MIN_SCORE}) —")

    # ── ZONE SCORES BREAKDOWN ─────────────────────────────────────────────────
    all_zones = [(z, "demand") for z in demand] + [(z, "supply") for z in supply]
    all_zones.sort(key=lambda x: x[0].score, reverse=True)

    print(f"\n  {'─' * 70}")
    print(f"  📊 ZONE SCORES  (all qualified zones, ranked)")
    print(f"  {'─' * 70}")
    print(f"  {'Type':<8} {'Top':>10} {'Bottom':>10} {'Width':>7}  "
          f"{'Score':>6}  {'Grade':>5}  {'Fresh':>7}  Bar")
    print(f"  {'─' * 68}")

    for z, ztype in all_zones:
        tag    = "DEMAND" if ztype == "demand" else "SUPPLY"
        tag_c  = f"\033[92m{tag}\033[0m" if ztype == "demand" else f"\033[91m{tag}\033[0m"
        width  = _pip(pair, z.price_top - z.price_bottom)
        grade  = score_label(z.score)
        femoji = freshness_emoji(z.freshness)
        print(f"  {tag:<8} {z.price_top:>10.5f} {z.price_bottom:>10.5f} {width:>7}  "
              f"{z.score:>5}/100  {grade:>5}  {femoji} {z.freshness:<7}  {zone_bar(z.score, 10)}")

    # ── Score scoring rubric ──────────────────────────────────────────────────
    print(f"\n  {'─' * 70}")
    print(f"  📐 SCORE RUBRIC")
    print(f"  {'─' * 70}")
    rubric = [
        ("Displacement", 40, "Impulse body > 2 ATR=40  > 1.5=30  > 1=20"),
        ("BOS",          25, "Impulse close breaks prior 20-bar extreme"),
        ("Freshness",    25, "0 retests=25  1 retest=15  2 retests=5"),
        ("Volume",       10, "Impulse volume > 1.5× 20-bar average"),
    ]
    for name, pts, desc in rubric:
        print(f"  {name:<14} {pts:>3}/100   {desc}")
    print(f"  {'─'*14}  {'─'*4}")
    print(f"  {'Total':.<14}  100")
    print(f"  Minimum qualifying score : {MIN_SCORE}/100")

    print(f"\n{'═' * 72}\n")


def main():
    print("\n" + "╔" + "═" * 70 + "╗")
    print("║  BUILD #2 — SUPPLY & DEMAND ENGINE" + " " * 35 + "║")
    print("╚" + "═" * 70 + "╝")
    for pair in PAIRS:
        run_supply_demand(pair)


if __name__ == "__main__":
    main()
