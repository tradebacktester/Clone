import logging
import math
from typing import List

logger = logging.getLogger(__name__)


def calc_metrics(trades: list, initial_balance: float = 10_000.0) -> dict:
    if not trades:
        return {
            "total_trades": 0, "win_rate": 0.0, "total_pnl": 0.0,
            "profit_factor": 0.0, "max_drawdown": 0.0,
            "sharpe_ratio": 0.0, "avg_rr": 0.0, "expectancy": 0.0,
        }

    pnls = [t.pnl or 0 for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]

    total_pnl = round(sum(pnls), 2)
    win_rate = round(len(wins) / len(pnls) * 100, 1)
    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))
    profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else 0.0
    expectancy = round(total_pnl / len(pnls), 2)

    equity = initial_balance
    peak = initial_balance
    max_dd = 0.0
    for p in pnls:
        equity += p
        if equity > peak:
            peak = equity
        dd = (peak - equity) / peak * 100
        if dd > max_dd:
            max_dd = dd

    if len(pnls) > 1:
        mean = total_pnl / len(pnls)
        variance = sum((p - mean) ** 2 for p in pnls) / len(pnls)
        std = math.sqrt(variance) if variance > 0 else 1e-9
        sharpe = round((mean / std) * math.sqrt(252), 2)
    else:
        sharpe = 0.0

    rrs = []
    for t in trades:
        risk = abs(t.entry_price - t.stop_loss)
        if risk > 0:
            rr = abs((t.close_price or t.entry_price) - t.entry_price) / risk
            rrs.append(rr)
    avg_rr = round(sum(rrs) / len(rrs), 2) if rrs else 0.0

    return {
        "total_trades": len(trades),
        "win_rate": win_rate,
        "total_pnl": total_pnl,
        "profit_factor": profit_factor,
        "max_drawdown": round(max_dd, 2),
        "sharpe_ratio": sharpe,
        "avg_rr": avg_rr,
        "expectancy": expectancy,
    }
