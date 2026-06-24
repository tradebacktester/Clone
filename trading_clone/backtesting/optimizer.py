import logging
from dataclasses import dataclass
from typing import List, Tuple

from trading_clone.market_data.data_feed import Candle
from trading_clone.backtesting.backtester import run_backtest, BacktestResult

logger = logging.getLogger(__name__)


@dataclass
class OptimizationResult:
    min_score: float
    risk_pct: float
    final_balance: float
    win_rate: float
    profit_factor: float
    total_trades: int


def optimize_parameters(
    pair: str,
    timeframe: str,
    candles: List[Candle],
    initial_balance: float = 10_000.0,
) -> List[OptimizationResult]:
    score_range = [70.0, 75.0, 80.0, 85.0, 90.0]
    risk_range = [0.005, 0.01, 0.015, 0.02]

    results: List[OptimizationResult] = []
    for min_score in score_range:
        for risk_pct in risk_range:
            result = run_backtest(pair, timeframe, candles, initial_balance, risk_pct, min_score)
            m = result.metrics
            results.append(OptimizationResult(
                min_score=min_score,
                risk_pct=risk_pct,
                final_balance=result.final_balance,
                win_rate=m["win_rate"],
                profit_factor=m["profit_factor"],
                total_trades=m["total_trades"],
            ))
            logger.info("Opt: score=%.0f risk=%.1f%% trades=%d pf=%.2f",
                        min_score, risk_pct * 100, m["total_trades"], m["profit_factor"])

    results.sort(key=lambda r: r.final_balance, reverse=True)
    return results


def best_params(results: List[OptimizationResult]) -> OptimizationResult | None:
    qualified = [r for r in results if r.total_trades >= 10]
    if not qualified:
        return results[0] if results else None
    return max(qualified, key=lambda r: r.profit_factor)
