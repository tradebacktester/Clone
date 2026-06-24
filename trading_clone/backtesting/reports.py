import logging
from typing import List

from trading_clone.backtesting.backtester import BacktestResult, BacktestTrade

logger = logging.getLogger(__name__)


def print_report(result: BacktestResult) -> None:
    m = result.metrics
    print(f"\n{'='*60}")
    print(f"  BACKTEST REPORT — {result.pair} {result.timeframe}")
    print(f"{'='*60}")
    print(f"  Period    : {result.start_date.date()} → {result.end_date.date()}")
    print(f"  Balance   : ${result.initial_balance:,.2f} → ${result.final_balance:,.2f}")
    print(f"  Total PnL : ${m['total_pnl']:+,.2f}")
    print(f"  Trades    : {m['total_trades']}")
    print(f"  Win Rate  : {m['win_rate']}%")
    print(f"  Profit F  : {m['profit_factor']}")
    print(f"  Max DD    : {m['max_drawdown']}%")
    print(f"  Sharpe    : {m['sharpe_ratio']}")
    print(f"  Avg R:R   : {m['avg_rr']}")
    print(f"  Expectancy: ${m['expectancy']:+,.2f}")
    print(f"{'='*60}\n")


def equity_curve(result: BacktestResult, initial_balance: float) -> List[float]:
    equity = initial_balance
    curve = [equity]
    for trade in result.trades:
        equity += trade.pnl or 0
        curve.append(round(equity, 2))
    return curve


def trade_summary_table(result: BacktestResult) -> List[dict]:
    rows = []
    for t in result.trades:
        rows.append({
            "id": t.id,
            "pair": t.pair,
            "direction": t.direction,
            "entry": t.entry_price,
            "sl": t.stop_loss,
            "tp": t.take_profit,
            "close": t.close_price,
            "pnl": t.pnl,
            "outcome": t.outcome,
            "zone_score": t.zone_score,
            "final_score": t.final_score,
        })
    return rows
