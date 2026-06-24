import logging
from dataclasses import dataclass
from typing import Dict, List

from trading_clone.learning_engine.trade_memory import TradeMemory, TradeRecord

logger = logging.getLogger(__name__)


@dataclass
class SetupQuality:
    setup_key: str
    count: int
    win_rate: float
    avg_pnl: float
    quality_score: float


class SetupLearner:
    def __init__(self, memory: TradeMemory):
        self.memory = memory

    def evaluate_setup_quality(self) -> List[SetupQuality]:
        stats = self.memory.setup_stats()
        results: List[SetupQuality] = []
        for key, data in stats.items():
            count = data["count"]
            wins = data["wins"]
            win_rate = (wins / count * 100) if count > 0 else 0
            avg_pnl = data["total_pnl"] / count if count > 0 else 0
            volume_factor = min(1.0, count / 20)
            quality_score = round((win_rate * 0.6 + max(0, avg_pnl) * 0.4) * volume_factor, 2)
            results.append(SetupQuality(setup_key=key, count=count,
                                        win_rate=round(win_rate, 1),
                                        avg_pnl=round(avg_pnl, 2),
                                        quality_score=quality_score))
        results.sort(key=lambda s: s.quality_score, reverse=True)
        return results

    def best_setups(self, top_n: int = 5) -> List[SetupQuality]:
        return self.evaluate_setup_quality()[:top_n]
