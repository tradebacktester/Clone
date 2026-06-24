"""
Schema V1 — verification script.
Inserts sample trades, queries them, prints the table.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from datetime import datetime, timezone
from trading_clone.database.database import (
    init_db, insert_trade, update_result,
    get_all_trades, get_open_trades, get_closed_trades,
    win_rate_by_pair, win_rate_by_session, score_distribution,
)
from trading_clone.database.models import Trade

SAMPLE_TRADES = [
    Trade(pair="EURUSD", direction="BUY",  entry=1.0820, stop_loss=1.0790, take_profit=1.0880,
          risk_reward=2.0, zone_score=85, liquidity_score=75, amd_score=90,
          confirmation_score=80, final_score=83.5, session="london"),
    Trade(pair="EURUSD", direction="SELL", entry=1.0950, stop_loss=1.0980, take_profit=1.0890,
          risk_reward=2.0, zone_score=78, liquidity_score=70, amd_score=82,
          confirmation_score=76, final_score=77.0, session="newyork"),
    Trade(pair="GBPUSD", direction="BUY",  entry=1.2650, stop_loss=1.2610, take_profit=1.2730,
          risk_reward=2.0, zone_score=92, liquidity_score=88, amd_score=85,
          confirmation_score=90, final_score=89.5, session="london"),
    Trade(pair="GBPUSD", direction="SELL", entry=1.2800, stop_loss=1.2840, take_profit=1.2720,
          risk_reward=2.0, zone_score=80, liquidity_score=65, amd_score=78,
          confirmation_score=72, final_score=74.5, session="london"),
    Trade(pair="USDJPY", direction="BUY",  entry=149.20, stop_loss=148.80, take_profit=150.00,
          risk_reward=2.0, zone_score=88, liquidity_score=80, amd_score=86,
          confirmation_score=84, final_score=85.0, session="newyork"),
    Trade(pair="USDJPY", direction="SELL", entry=150.50, stop_loss=150.90, take_profit=149.70,
          risk_reward=2.0, zone_score=76, liquidity_score=72, amd_score=80,
          confirmation_score=74, final_score=75.5, session="asian"),
]

RESULTS = ["WIN", "LOSS", "WIN", "LOSS", "WIN", "LOSS"]


def _col(val, width, align="<"):
    s = str(val)
    if len(s) > width:
        s = s[:width - 1] + "…"
    return f"{s:{align}{width}}"


def print_table(trades):
    header = (
        f"{'trade_id':<10} {'pair':<8} {'dir':<5} {'entry':>9} "
        f"{'SL':>9} {'TP':>9} {'R:R':>5} "
        f"{'zone':>5} {'liq':>5} {'amd':>5} {'conf':>5} {'score':>6} "
        f"{'result':<10} {'session':<10} {'date':<12}"
    )
    sep = "─" * len(header)
    print(f"\n  {sep}")
    print(f"  {header}")
    print(f"  {sep}")
    for t in trades:
        row = (
            f"{_col(t.trade_id[:8], 10)} {_col(t.pair, 8)} {_col(t.direction, 5)} "
            f"{t.entry:>9.5f} {t.stop_loss:>9.5f} {t.take_profit:>9.5f} {t.risk_reward:>5.1f} "
            f"{t.zone_score:>5} {t.liquidity_score:>5} {t.amd_score:>5} "
            f"{t.confirmation_score:>5} {t.final_score:>6.1f} "
            f"{_col(t.result, 10)} {_col(t.session, 10)} {t.date.strftime('%Y-%m-%d'):<12}"
        )
        print(f"  {row}")
    print(f"  {sep}")
    print(f"  {len(trades)} row(s)\n")


def main():
    # Use a temp DB for this run
    os.environ["LOCAL_DB_PATH"] = "/tmp/schema_verify_db"
    init_db()

    print("\n╔══════════════════════════════════════════════════════╗")
    print("║  DATABASE SCHEMA V1 — trades table verification     ║")
    print("╚══════════════════════════════════════════════════════╝")

    print("\n── SCHEMA ─────────────────────────────────────────────")
    print("  Table : trades")
    print("  Cols  : trade_id, pair, direction, entry, stop_loss,")
    print("          take_profit, risk_reward, zone_score,")
    print("          liquidity_score, amd_score, confirmation_score,")
    print("          final_score, result, session, date")

    # Insert
    print("\n── INSERT (6 sample trades) ───────────────────────────")
    inserted = []
    for trade in SAMPLE_TRADES:
        inserted.append(insert_trade(trade))
    print(f"  ✓  {len(inserted)} trades inserted")

    # Close some
    print("\n── UPDATE result ──────────────────────────────────────")
    for trade, result in zip(inserted, RESULTS):
        update_result(trade.trade_id, result)
        print(f"  ✓  {trade.trade_id[:8]}  {trade.pair} {trade.direction}  →  {result}")

    # Full table
    all_trades = get_all_trades()
    print(f"\n── FULL TABLE ─────────────────────────────────────────")
    print_table(all_trades)

    # Win rate by pair
    print("── WIN RATE BY PAIR ───────────────────────────────────")
    wr = win_rate_by_pair()
    print(f"  {'Pair':<8} {'Total':>6} {'Wins':>6} {'Win %':>7} {'Avg R:R':>8} {'Avg Score':>10}")
    print(f"  {'─'*8} {'─'*6} {'─'*6} {'─'*7} {'─'*8} {'─'*10}")
    for pair, s in wr.items():
        print(f"  {pair:<8} {s['total']:>6} {s['wins']:>6} {s['win_rate']:>6.1f}% "
              f"{s['avg_rr']:>8.2f} {s['avg_score']:>10.1f}")

    # Win rate by session
    print(f"\n── WIN RATE BY SESSION ────────────────────────────────")
    ws = win_rate_by_session()
    print(f"  {'Session':<10} {'Total':>6} {'Wins':>6} {'Win %':>7}")
    print(f"  {'─'*10} {'─'*6} {'─'*6} {'─'*7}")
    for sess, s in ws.items():
        print(f"  {sess:<10} {s['total']:>6} {s['wins']:>6} {s['win_rate']:>6.1f}%")

    # Score distribution
    print(f"\n── SCORE DISTRIBUTION ─────────────────────────────────")
    sd = score_distribution()
    for bucket, count in sd.items():
        bar = "█" * count + "░" * (6 - count)
        print(f"  {bucket:>6}  [{bar}]  {count} trade(s)")

    print(f"\n  ✓  Schema V1 verified — all queries OK\n")


if __name__ == "__main__":
    main()
