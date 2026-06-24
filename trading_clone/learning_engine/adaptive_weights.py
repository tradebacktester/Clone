import logging
from dataclasses import dataclass
from typing import Dict

from trading_clone.learning_engine.trade_memory import TradeMemory
from trading_clone.learning_engine.regime_detection import RegimeResult

logger = logging.getLogger(__name__)


@dataclass
class WeightProfile:
    zone_weight: float = 0.30
    liquidity_weight: float = 0.25
    amd_weight: float = 0.25
    confirmation_weight: float = 0.20
    epsilon: float = 0.1
    episode: int = 0
    total_reward: float = 0.0


DEFAULT_WEIGHTS = WeightProfile()


class AdaptiveWeights:
    def __init__(self, memory: TradeMemory):
        self.memory = memory
        self.profile = WeightProfile()

    def update(self) -> WeightProfile:
        records = self.memory.get_all()
        if len(records) < 10:
            return self.profile

        wins = [r for r in records if r.pnl > 0]
        losses = [r for r in records if r.pnl <= 0]

        def avg(records, attr):
            if not records:
                return 0.0
            return sum(getattr(r, attr) for r in records) / len(records)

        win_zone = avg(wins, "zone_score")
        loss_zone = avg(losses, "zone_score")
        win_amd = avg(wins, "amd_score")
        loss_amd = avg(losses, "amd_score")
        win_conf = avg(wins, "confirmation_score")
        loss_conf = avg(losses, "confirmation_score")

        adj_zone = (win_zone - loss_zone) / 200
        adj_amd = (win_amd - loss_amd) / 200
        adj_conf = (win_conf - loss_conf) / 200

        lr = 0.05
        new_zone = max(0.10, min(0.50, self.profile.zone_weight + lr * adj_zone))
        new_amd = max(0.10, min(0.50, self.profile.amd_weight + lr * adj_amd))
        new_conf = max(0.10, min(0.50, self.profile.confirmation_weight + lr * adj_conf))
        total = new_zone + new_amd + new_conf + self.profile.liquidity_weight
        norm = total if total > 0 else 1.0

        self.profile.zone_weight = round(new_zone / norm, 4)
        self.profile.amd_weight = round(new_amd / norm, 4)
        self.profile.confirmation_weight = round(new_conf / norm, 4)
        self.profile.liquidity_weight = round(self.profile.liquidity_weight / norm, 4)
        self.profile.episode += 1
        self.profile.total_reward += sum(r.pnl for r in records[-10:])
        self.profile.epsilon = max(0.01, self.profile.epsilon * 0.995)

        logger.info("Weights updated: zone=%.3f amd=%.3f conf=%.3f eps=%.3f",
                    self.profile.zone_weight, self.profile.amd_weight,
                    self.profile.confirmation_weight, self.profile.epsilon)
        return self.profile

    def apply_regime_adjustment(self, regime: RegimeResult) -> WeightProfile:
        import copy
        p = copy.copy(self.profile)
        if regime.regime in ("trending_bullish", "trending_bearish"):
            p.amd_weight = min(0.50, p.amd_weight * 1.1)
            p.zone_weight = max(0.10, p.zone_weight * 0.95)
        elif regime.regime == "volatile":
            p.confirmation_weight = min(0.50, p.confirmation_weight * 1.15)
        return p
