import logging
from typing import Dict, List

from trading_clone.execution.paper_trader import PaperTrade
from trading_clone.backtesting.metrics import calc_metrics

logger = logging.getLogger(__name__)


def build_analytics(trades: List[PaperTrade]) -> Dict:
    if not trades:
        return {}

    closed = [t for t in trades if t.status == "closed" and t.pnl is not None]
    if not closed:
        return {"total_closed": 0}

    pnls = [t.pnl for t in closed]
    wins = [p for p in pnls if p > 0]

    equity = 10_000.0
    equity_curve: List[float] = [equity]
    for p in pnls:
        equity += p
        equity_curve.append(round(equity, 2))

    pair_stats: Dict[str, Dict] = {}
    for t in closed:
        if t.pair not in pair_stats:
            pair_stats[t.pair] = {"count": 0, "wins": 0, "pnl": 0.0}
        pair_stats[t.pair]["count"] += 1
        if (t.pnl or 0) > 0:
            pair_stats[t.pair]["wins"] += 1
        pair_stats[t.pair]["pnl"] += t.pnl or 0

    return {
        "total_closed": len(closed),
        "win_rate": round(len(wins) / len(pnls) * 100, 1),
        "total_pnl": round(sum(pnls), 2),
        "equity_curve": equity_curve,
        "pair_stats": pair_stats,
    }


def monthly_pnl(trades: List[PaperTrade]) -> Dict[str, float]:
    monthly: Dict[str, float] = {}
    for t in trades:
        if t.status != "closed" or t.close_time is None:
            continue
        key = t.close_time.strftime("%Y-%m")
        monthly[key] = round(monthly.get(key, 0.0) + (t.pnl or 0), 2)
    return dict(sorted(monthly.items()))
