import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class TradeRecord:
    id: str
    pair: str
    direction: str
    entry_price: float
    stop_loss: float
    take_profit: float
    close_price: float
    pnl: float
    rr_achieved: float
    zone_score: int
    amd_score: int
    confirmation_score: int
    final_score: float
    amd_phase: str
    session: str
    outcome: str
    opened_at: datetime
    closed_at: datetime


class TradeMemory:
    def __init__(self, max_records: int = 500):
        self.max_records = max_records
        self._records: List[TradeRecord] = []

    def add(self, record: TradeRecord) -> None:
        self._records.append(record)
        if len(self._records) > self.max_records:
            self._records = self._records[-self.max_records:]
        logger.debug("TradeMemory: added record %s pnl=%.2f", record.id, record.pnl)

    def get_all(self) -> List[TradeRecord]:
        return list(self._records)

    def get_by_pair(self, pair: str) -> List[TradeRecord]:
        return [r for r in self._records if r.pair == pair]

    def get_by_outcome(self, outcome: str) -> List[TradeRecord]:
        return [r for r in self._records if r.outcome == outcome]

    def win_rate(self) -> float:
        if not self._records:
            return 0.0
        wins = sum(1 for r in self._records if r.pnl > 0)
        return round(wins / len(self._records) * 100, 1)

    def avg_rr(self) -> float:
        if not self._records:
            return 0.0
        return round(sum(r.rr_achieved for r in self._records) / len(self._records), 2)

    def total_pnl(self) -> float:
        return round(sum(r.pnl for r in self._records), 2)

    def setup_stats(self) -> Dict:
        stats: Dict[str, Dict] = {}
        for r in self._records:
            key = f"{r.pair}_{r.amd_phase}_{r.session}"
            if key not in stats:
                stats[key] = {"count": 0, "wins": 0, "total_pnl": 0.0}
            stats[key]["count"] += 1
            if r.pnl > 0:
                stats[key]["wins"] += 1
            stats[key]["total_pnl"] += r.pnl
        return stats
