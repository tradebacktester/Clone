"""
Build #5 — Signal Generator
==============================
Final output:
  BUY  / SELL / NO TRADE  + confidence score (0–100)

Each engine votes: bullish | bearish | neutral
Weighted by AdaptiveWeightLearner (defaults until 50+ real trades):
  Zone (S&D)    30%
  Liquidity     25%
  AMD           25%
  Market Struct 20%

Run: PYTHONPATH=. python3 trading_clone/build5_signals.py
"""

from trading_clone.market_data.data_feed       import generate_synthetic_candles
from trading_clone.signals.signal_generator    import generate_signal, TradeSignal, EngineVote

PAIRS     = ["EURUSD", "GBPUSD", "USDJPY"]
TIMEFRAME = "H1"
LIMIT     = 300


def _bar(score: int, width: int = 16) -> str:
    filled = round(score / 100 * width)
    return "[" + "█" * filled + "░" * (width - filled) + "]"


def _vote_emoji(vote: str) -> str:
    return {"bullish": "🟢", "bearish": "🔴", "neutral": "⚪"}.get(vote, "⚪")


def _signal_banner(sig: TradeSignal) -> str:
    signal_map = {
        "BUY":      "  ██████╗ ██╗   ██╗██╗   \n  ██╔══██╗██║   ██║╚██╗  \n  ██████╔╝██║   ██║ ╚██╗ \n  ██╔══██╗██║   ██║ ██╔╝ \n  ██████╔╝╚██████╔╝██╔╝  \n  ╚═════╝  ╚═════╝ ╚═╝   ",
        "SELL":     "  ███████╗███████╗██╗     ██╗     \n  ██╔════╝██╔════╝██║     ██║     \n  ███████╗█████╗  ██║     ██║     \n  ╚════██║██╔══╝  ██║     ██║     \n  ███████║███████╗███████╗███████╗\n  ╚══════╝╚══════╝╚══════╝╚══════╝",
        "NO TRADE": "  ███╗   ██╗ ██████╗     ████████╗██████╗  █████╗ ██████╗ ███████╗\n  ████╗  ██║██╔═══██╗    ╚══██╔══╝██╔══██╗██╔══██╗██╔══██╗██╔════╝\n  ██╔██╗ ██║██║   ██║       ██║   ██████╔╝███████║██║  ██║█████╗  \n  ██║╚██╗██║██║   ██║       ██║   ██╔══██╗██╔══██║██║  ██║██╔══╝  \n  ██║ ╚████║╚██████╔╝       ██║   ██║  ██║██║  ██║██████╔╝███████╗\n  ╚═╝  ╚═══╝ ╚═════╝        ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝",
    }
    return signal_map.get(sig.signal, f"  {sig.signal}")


def _pip(pair: str, v: float) -> str:
    scale = 100 if pair == "USDJPY" else 10_000
    return f"{v * scale:.1f}p"


def print_signal(sig: TradeSignal) -> None:
    pair = sig.pair
    print(f"\n{'═' * 72}")
    print(f"  SIGNAL GENERATOR — {pair} / {sig.timeframe}")
    print(f"{'═' * 72}")
    print(f"  Price : {sig.current_price:.5f}    ATR : {sig.atr:.5f} ({_pip(pair, sig.atr)})")

    # ── Engine votes ──────────────────────────────────────────────────────
    print(f"\n  {'─' * 70}")
    print(f"  🔍 ENGINE VOTES")
    print(f"  {'─' * 70}")
    print(f"  {'Engine':<16} {'Vote':<10} {'Score':>6}  {'Bar':<18}  Detail")
    print(f"  {'─'*16}  {'─'*9}  {'─'*6}  {'─'*18}  {'─'*22}")
    for v in sig.engine_votes:
        print(
            f"  {v.name:<16} {_vote_emoji(v.vote)} {v.vote:<8} {v.score:>5}/100  "
            f"{_bar(v.score)}  {v.detail[:50]}"
        )

    # ── Weights used ──────────────────────────────────────────────────────
    w = sig.weights_used
    print(f"\n  Weights  Zone={w['zone']*100:.0f}%  "
          f"Liq={w['liquidity']*100:.0f}%  "
          f"AMD={w['amd']*100:.0f}%  "
          f"Conf={w['confirmation']*100:.0f}%  "
          f"(from AdaptiveWeightLearner)")

    # ── SIGNAL OUTPUT ─────────────────────────────────────────────────────
    print(f"\n  {'─' * 70}")
    print(f"  🎯 SIGNAL")
    print(f"  {'─' * 70}")

    grade_colors = {"A+": "★★★★★", "A": "★★★★☆", "B": "★★★☆☆",
                    "C": "★★☆☆☆", "D": "★☆☆☆☆"}
    sig_line = {
        "BUY":      f"  ✅ BUY",
        "SELL":     f"  ❌ SELL",
        "NO TRADE": f"  ⏸  NO TRADE",
    }[sig.signal]

    print(f"\n{sig_line}")
    print(f"\n  Confidence : {sig.confidence:>3}/100  {_bar(sig.confidence, 24)}")
    print(f"  Grade      : {sig.grade}  {grade_colors.get(sig.grade, '')}")
    print(f"  Reason     : {sig.reason}")
    print(f"\n{'═' * 72}\n")


def main():
    print("\n" + "╔" + "═" * 70 + "╗")
    print("║  BUILD #5 — SIGNAL GENERATOR" + " " * 40 + "║")
    print("╚" + "═" * 70 + "╝")

    results = []
    for pair in PAIRS:
        candles = generate_synthetic_candles(pair, TIMEFRAME, LIMIT, seed=13)
        sig     = generate_signal(pair, TIMEFRAME, candles)
        print_signal(sig)
        results.append(sig)

    # ── Summary table ─────────────────────────────────────────────────────
    print("\n" + "═" * 72)
    print("  SIGNAL SUMMARY")
    print("=" * 72)
    print(f"  {'Pair':<10} {'Signal':<10} {'Confidence':>11}  {'Grade':>5}  Reason")
    print(f"  {'─'*10}  {'─'*9}  {'─'*10}  {'─'*5}  {'─'*25}")
    for sig in results:
        sig_icon = {"BUY": "✅", "SELL": "❌", "NO TRADE": "⏸"}.get(sig.signal, "")
        print(
            f"  {sig.pair:<10} {sig_icon} {sig.signal:<8}  {sig.confidence:>10}/100  "
            f"{sig.grade:>5}  {sig.reason[:40]}"
        )
    print("=" * 72 + "\n")


if __name__ == "__main__":
    main()
