"""
Build #4 — AMD Engine
========================
Outputs:
  • Accumulation  (range detection, score)
  • Manipulation  (fakeout detection, direction, score)
  • Distribution  (expansion move, score)
  • AMD Score     (composite 0–100)

Run: PYTHONPATH=. python3 trading_clone/build4_amd.py
"""

from trading_clone.market_data.data_feed        import generate_synthetic_candles
from trading_clone.market_structure.swing_detector import calc_atr
from trading_clone.amd.amd_score                import calc_amd, AMDResult

PAIRS     = ["EURUSD", "GBPUSD", "USDJPY"]
TIMEFRAME = "H1"
LIMIT     = 300


def _pip(pair: str, v: float) -> str:
    scale = 100 if pair == "USDJPY" else 10_000
    return f"{v * scale:.1f}p"


def _bar(score: int, width: int = 16) -> str:
    filled = round(score / 100 * width)
    return "[" + "█" * filled + "░" * (width - filled) + "]"


def _phase_emoji(phase: str) -> str:
    return {"accumulation": "🔵", "manipulation": "🟡",
            "distribution": "🟢", "none": "⚫"}.get(phase, "⚫")


def run_amd(pair: str) -> None:
    candles = generate_synthetic_candles(pair, TIMEFRAME, LIMIT, seed=99)
    atr     = calc_atr(candles)
    current = candles[-1].close
    result: AMDResult = calc_amd(candles)

    acc   = result.accumulation
    manip = result.manipulation
    dist  = result.distribution

    print(f"\n{'═' * 72}")
    print(f"  AMD ENGINE — {pair} / {TIMEFRAME}")
    print(f"{'═' * 72}")
    print(f"  Current Price : {current:.5f}    ATR : {atr:.5f} ({_pip(pair, atr)})")
    print(f"  Candles       : {LIMIT}")
    print(f"  Current Phase : {_phase_emoji(result.phase)} {result.phase.upper()}")
    print(f"  Direction     : {(result.direction or '—').upper()}")

    # ── Accumulation ──────────────────────────────────────────────────────
    print(f"\n  {'─' * 70}")
    print(f"  🔵 ACCUMULATION")
    print(f"  {'─' * 70}")
    if acc.found:
        width = _pip(pair, acc.range_high - acc.range_low)
        print(f"  Found         : YES")
        print(f"  Range         : {acc.range_high:.5f} ─ {acc.range_low:.5f}  (width={width})")
        print(f"  Midpoint      : {acc.midpoint:.5f}")
        print(f"  Duration      : {acc.bars} candles")
        print(f"  Avg Body/ATR  : {acc.avg_body:.2f}×  (lower = tighter = better)")
        print(f"  Score         : {acc.score:>3}/100  {_bar(acc.score)}")
    else:
        print(f"  — No accumulation range detected —")

    # ── Manipulation ──────────────────────────────────────────────────────
    print(f"\n  {'─' * 70}")
    print(f"  🟡 MANIPULATION")
    print(f"  {'─' * 70}")
    if manip.found:
        print(f"  Found         : YES")
        print(f"  Direction     : {(manip.direction or '—').upper()}")
        print(f"  Break Size    : {manip.break_size:.2f}×ATR")
        print(f"  Returned      : {'YES ✓' if manip.returned else 'NO'}")
        print(f"  Score         : {manip.score:>3}/100  {_bar(manip.score)}")
    else:
        print(f"  — No manipulation fakeout detected —")

    # ── Distribution ──────────────────────────────────────────────────────
    print(f"\n  {'─' * 70}")
    print(f"  🟢 DISTRIBUTION")
    print(f"  {'─' * 70}")
    if dist.found:
        print(f"  Found         : YES")
        print(f"  Direction     : {(dist.direction or '—').upper()}")
        print(f"  Move Size     : {dist.move_size:.2f}×ATR")
        print(f"  Consistency   : {dist.consistency:.0%} of candles in direction")
        print(f"  Score         : {dist.score:>3}/100  {_bar(dist.score)}")
    else:
        print(f"  — Distribution phase not confirmed yet —")

    # ── AMD Score ─────────────────────────────────────────────────────────
    print(f"\n  {'─' * 70}")
    print(f"  📊 AMD SCORE")
    print(f"  {'─' * 70}")
    print(f"  AMD Score     : {result.amd_score:>3}/100  {_bar(result.amd_score, 20)}")
    print(f"  Sequence done : {'✓ YES' if result.complete else '— NO'}")
    print(f"  Summary       : {result.summary}")

    # ── Score rubric ──────────────────────────────────────────────────────
    print(f"\n  {'─' * 70}")
    print(f"  📐 SCORE WEIGHTS")
    print(f"  {'─' * 70}")
    for name, pct, desc in [
        ("Accumulation",  "25%", "Range tightness, duration, width"),
        ("Manipulation",  "40%", "BOS strength, return to range, liquidity grab"),
        ("Distribution",  "35%", "Move size, candle consistency, clean expansion"),
    ]:
        print(f"  {name:<14} {pct:>4}   {desc}")
    print(f"\n{'═' * 72}\n")


def main():
    print("\n" + "╔" + "═" * 70 + "╗")
    print("║  BUILD #4 — AMD ENGINE" + " " * 47 + "║")
    print("╚" + "═" * 70 + "╝")
    for pair in PAIRS:
        run_amd(pair)


if __name__ == "__main__":
    main()
