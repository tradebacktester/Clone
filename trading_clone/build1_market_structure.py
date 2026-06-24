"""
Build #1 — Market Structure Engine
===================================
Outputs:
  • Current Trend
  • Major Support
  • Major Resistance
  • Premium Area
  • Discount Area
"""

from trading_clone.market_data.data_feed import generate_synthetic_candles
from trading_clone.market_structure.swing_detector import detect_swings, detect_trend, calc_atr
from trading_clone.market_structure.support_resistance import detect_sr_levels, major_support, major_resistance
from trading_clone.market_structure.premium_discount import calc_fib, premium_area, discount_area
from trading_clone.market_structure.structure_score import analyse_structure

PAIRS = ["EURUSD", "GBPUSD", "USDJPY"]
TIMEFRAME = "H1"
CANDLE_LIMIT = 200

TREND_EMOJI = {"bullish": "📈", "bearish": "📉", "ranging": "↔️"}
ZONE_EMOJI  = {"premium": "🔴", "equilibrium": "⚖️", "discount": "🟢", "unknown": "❓"}
ZONE_LABEL  = {"premium": "PREMIUM (sell bias)", "equilibrium": "EQUILIBRIUM (neutral)",
               "discount": "DISCOUNT (buy bias)", "unknown": "unknown"}


def _pip(pair: str, value: float) -> str:
    scale = 100 if pair == "USDJPY" else 10_000
    return f"{value * scale:.1f} pips"


def _bar(strength: int, width: int = 20) -> str:
    filled = round(strength / 100 * width)
    return "█" * filled + "░" * (width - filled)


def run_market_structure(pair: str) -> None:
    candles = generate_synthetic_candles(pair, TIMEFRAME, CANDLE_LIMIT, seed=42)
    swings = detect_swings(candles, left=5, right=5)
    atr = calc_atr(candles)
    sr_levels = detect_sr_levels(candles, swings)
    fib = calc_fib(candles, lookback=100)
    result = analyse_structure(pair, TIMEFRAME, candles, swings, sr_levels, fib)

    current = result.current_price
    sup = major_support(sr_levels)
    res = major_resistance(sr_levels)

    print(f"\n{'═' * 56}")
    print(f"  MARKET STRUCTURE — {pair} / {TIMEFRAME}")
    print(f"{'═' * 56}")
    print(f"  Current Price : {current}")
    print(f"  ATR (14)      : {atr:.5f}  ({_pip(pair, atr)})")

    print(f"\n  ── TREND ──────────────────────────────────────────")
    emoji = TREND_EMOJI[result.trend]
    print(f"  Current Trend : {emoji}  {result.trend.upper()}")

    highs = [s for s in swings if s.type == "high"]
    lows  = [s for s in swings if s.type == "low"]
    if len(highs) >= 2:
        print(f"  Swing Highs   : {highs[-2].price:.5f}  →  {highs[-1].price:.5f}  "
              f"({'HH ↑' if highs[-1].price > highs[-2].price else 'LH ↓'})")
    if len(lows) >= 2:
        print(f"  Swing Lows    : {lows[-2].price:.5f}  →  {lows[-1].price:.5f}  "
              f"({'HL ↑' if lows[-1].price > lows[-2].price else 'LL ↓'})")

    print(f"\n  ── SUPPORT & RESISTANCE ───────────────────────────")
    if res:
        dist = abs(res.price - current)
        print(f"  Major Resistance : {res.price:.5f}  "
              f"({_pip(pair, dist)} away, strength {res.strength})")
        print(f"  Strength         : [{_bar(res.strength)}] {res.strength}/100  "
              f"({res.touch_count} touches)")
    else:
        print(f"  Major Resistance : — not detected —")

    if sup:
        dist = abs(current - sup.price)
        print(f"  Major Support    : {sup.price:.5f}  "
              f"({_pip(pair, dist)} away, strength {sup.strength})")
        print(f"  Strength         : [{_bar(sup.strength)}] {sup.strength}/100  "
              f"({sup.touch_count} touches)")
    else:
        print(f"  Major Support    : — not detected —")

    print(f"\n  ── PREMIUM / DISCOUNT ─────────────────────────────")
    if fib:
        p_hi, p_lo = premium_area(fib)
        d_hi, d_lo = discount_area(fib)
        z_emoji = ZONE_EMOJI[result.current_zone]
        z_label = ZONE_LABEL[result.current_zone]
        print(f"  Swing High    : {fib.swing_high:.5f}")
        print(f"  Swing Low     : {fib.swing_low:.5f}")
        print(f"  Range Size    : {_pip(pair, fib.range_size)}")
        print(f"")
        print(f"  Premium Area  : {p_hi:.5f}  →  {p_lo:.5f}  (above 0.5 fib)")
        print(f"  Discount Area : {d_hi:.5f}  →  {d_lo:.5f}  (below 0.5 fib)")
        print(f"  Equilibrium   : {fib.levels[0.5]:.5f}")
        print(f"")
        print(f"  Price Location: {z_emoji}  {z_label}  (ratio {result.fib_ratio:.3f})")
    else:
        print(f"  — Not enough data for Fib analysis —")

    all_sr = sorted(sr_levels, key=lambda l: l.price, reverse=True)
    if all_sr:
        print(f"\n  ── ALL S/R LEVELS ─────────────────────────────────")
        for lvl in all_sr[:6]:
            marker = " ◀ CURRENT" if abs(lvl.price - current) < atr * 0.5 else ""
            tag = "R" if lvl.type == "resistance" else "S"
            print(f"  [{tag}] {lvl.price:.5f}  strength {lvl.strength:3d}  "
                  f"[{_bar(lvl.strength, 10)}]{marker}")

    print(f"\n{'═' * 56}\n")


def main():
    print("\n" + "╔" + "═" * 54 + "╗")
    print("║  BUILD #1 — MARKET STRUCTURE ENGINE                 ║")
    print("╚" + "═" * 54 + "╝")
    for pair in PAIRS:
        run_market_structure(pair)


if __name__ == "__main__":
    main()
