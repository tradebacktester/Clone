"""
Build #3 — Liquidity Engine
=============================
Outputs:
  • Liquidity Sweeps  (BSL / SSL with score)
  • Stop Hunts        (HUNT_HIGH / HUNT_LOW with score)
  • Liquidity Score   (0–100 with directional bias)

Run: PYTHONPATH=. python3 trading_clone/build3_liquidity.py
"""

from trading_clone.market_data.data_feed         import generate_synthetic_candles
from trading_clone.market_structure.swing_detector import calc_atr
from trading_clone.liquidity.sweep_detector       import LiquiditySweep
from trading_clone.liquidity.stop_hunt            import StopHunt
from trading_clone.liquidity.liquidity_score      import calc_liquidity, LiquidityResult

PAIRS     = ["EURUSD", "GBPUSD", "USDJPY"]
TIMEFRAME = "H1"
LIMIT     = 300


def _pip(pair: str, v: float) -> str:
    scale = 100 if pair == "USDJPY" else 10_000
    return f"{v * scale:.1f}p"


def _bar(score: int, width: int = 16) -> str:
    filled = round(score / 100 * width)
    return "[" + "█" * filled + "░" * (width - filled) + "]"


def _sweep_row(s: LiquiditySweep, pair: str) -> str:
    tag  = "▲ BSL" if s.sweep_type == "BSL_SWEEP" else "▼ SSL"
    ext  = _pip(pair, s.extension)
    conf = "✓" if s.confirmed   else "—"
    vol  = "✓" if s.volume_spike else "—"
    return (
        f"  {tag}  level={s.swept_level:.5f}  "
        f"ext={ext:>6}  {s.ext_atr_ratio:.2f}×ATR  "
        f"rev={s.reversal_body:.2f}×ATR  "
        f"vol={vol}  confirmed={conf}  "
        f"score={s.score:>3}/100  {_bar(s.score)}"
    )


def _hunt_row(h: StopHunt, pair: str) -> str:
    tag  = "▲ HI" if h.hunt_type == "HUNT_HIGH" else "▼ LO"
    wick = _pip(pair, h.wick_size)
    same = "✓" if h.same_candle  else "—"
    vol  = "✓" if h.volume_spike else "—"
    return (
        f"  {tag}  level={h.hunted_level:.5f}  "
        f"wick={wick:>6}  body={h.body_ratio:.0%}  "
        f"same-candle={same}  vol={vol}  "
        f"score={h.score:>3}/100  {_bar(h.score)}"
    )


def run_liquidity(pair: str) -> None:
    candles  = generate_synthetic_candles(pair, TIMEFRAME, LIMIT, seed=7)
    atr      = calc_atr(candles)
    current  = candles[-1].close
    result: LiquidityResult = calc_liquidity(candles)

    print(f"\n{'═' * 72}")
    print(f"  LIQUIDITY ENGINE — {pair} / {TIMEFRAME}")
    print(f"{'═' * 72}")
    print(f"  Current Price : {current:.5f}    ATR : {atr:.5f} ({_pip(pair, atr)})")
    print(f"  Candles       : {LIMIT}")

    # ── Sweeps ────────────────────────────────────────────────────────────
    print(f"\n  {'─' * 70}")
    print(f"  🌊 LIQUIDITY SWEEPS")
    print(f"  {'─' * 70}")
    if result.sweeps:
        for s in result.sweeps:
            print(_sweep_row(s, pair))
        bsl = sum(1 for s in result.sweeps if s.sweep_type == "BSL_SWEEP")
        ssl = sum(1 for s in result.sweeps if s.sweep_type == "SSL_SWEEP")
        avg = sum(s.score for s in result.sweeps) / len(result.sweeps)
        print(f"\n  Total: {len(result.sweeps)}  (BSL:{bsl}  SSL:{ssl})  avg score={avg:.0f}/100")
    else:
        print("  — No qualifying sweeps detected —")

    # ── Stop Hunts ────────────────────────────────────────────────────────
    print(f"\n  {'─' * 70}")
    print(f"  🎯 STOP HUNTS")
    print(f"  {'─' * 70}")
    if result.hunts:
        for h in result.hunts:
            print(_hunt_row(h, pair))
        hi = sum(1 for h in result.hunts if h.hunt_type == "HUNT_HIGH")
        lo = sum(1 for h in result.hunts if h.hunt_type == "HUNT_LOW")
        avg = sum(h.score for h in result.hunts) / len(result.hunts)
        print(f"\n  Total: {len(result.hunts)}  (High:{hi}  Low:{lo})  avg score={avg:.0f}/100")
    else:
        print("  — No qualifying stop hunts detected —")

    # ── Liquidity Score ───────────────────────────────────────────────────
    print(f"\n  {'─' * 70}")
    print(f"  📊 LIQUIDITY SCORE")
    print(f"  {'─' * 70}")
    bias_emoji = {"bullish": "🟢", "bearish": "🔴", "neutral": "⚪"}
    be = bias_emoji.get(result.bias, "⚪")
    print(f"  Score  : {result.liquidity_score:>3}/100  {_bar(result.liquidity_score, 20)}")
    print(f"  Bias   : {be} {result.bias.upper()}")
    print(f"  Detail : {result.summary}")

    print(f"\n  {'─' * 70}")
    print(f"  📐 SCORE RUBRIC")
    print(f"  {'─' * 70}")
    for name, pts, desc in [
        ("Extension", 40, "Sweep distance past level / ATR  (>0.75→40  >0.4→30  >0.2→15)"),
        ("Reversal",  35, "Next-candle body in reversal direction (ATR units)"),
        ("Volume",    15, "Sweep-candle volume > 1.5× 20-bar average"),
        ("Confirmed", 10, "Following candle continues reversal direction"),
    ]:
        print(f"  {name:<12} {pts:>3}/100   {desc}")
    print(f"  {'─'*12}  {'─'*4}")
    print(f"  Total        100")
    print(f"\n{'═' * 72}\n")


def main():
    print("\n" + "╔" + "═" * 70 + "╗")
    print("║  BUILD #3 — LIQUIDITY ENGINE" + " " * 41 + "║")
    print("╚" + "═" * 70 + "╝")
    for pair in PAIRS:
        run_liquidity(pair)


if __name__ == "__main__":
    main()
