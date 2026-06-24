import logging
from dataclasses import dataclass
from typing import List

logger = logging.getLogger(__name__)


@dataclass
class RiskCheck:
    allowed: bool
    reason: str


def check_daily_loss(
    closed_pnl_today: float,
    account_balance: float,
    max_daily_loss_pct: float = 0.05,
) -> RiskCheck:
    loss_pct = abs(closed_pnl_today) / account_balance if account_balance > 0 else 0
    if closed_pnl_today < 0 and loss_pct >= max_daily_loss_pct:
        return RiskCheck(allowed=False,
                         reason=f"Daily loss limit hit: {loss_pct:.1%} >= {max_daily_loss_pct:.1%}")
    return RiskCheck(allowed=True, reason="")


def check_weekly_loss(
    closed_pnl_week: float,
    account_balance: float,
    max_weekly_loss_pct: float = 0.10,
) -> RiskCheck:
    loss_pct = abs(closed_pnl_week) / account_balance if account_balance > 0 else 0
    if closed_pnl_week < 0 and loss_pct >= max_weekly_loss_pct:
        return RiskCheck(allowed=False,
                         reason=f"Weekly loss limit hit: {loss_pct:.1%} >= {max_weekly_loss_pct:.1%}")
    return RiskCheck(allowed=True, reason="")


def check_max_open_trades(open_count: int, max_open: int = 3) -> RiskCheck:
    if open_count >= max_open:
        return RiskCheck(allowed=False, reason=f"Max open trades ({max_open}) reached")
    return RiskCheck(allowed=True, reason="")


def check_all_risk(
    open_count: int,
    closed_pnl_today: float,
    closed_pnl_week: float,
    account_balance: float,
    max_open: int = 3,
    max_daily_pct: float = 0.05,
    max_weekly_pct: float = 0.10,
) -> RiskCheck:
    for check in [
        check_max_open_trades(open_count, max_open),
        check_daily_loss(closed_pnl_today, account_balance, max_daily_pct),
        check_weekly_loss(closed_pnl_week, account_balance, max_weekly_pct),
    ]:
        if not check.allowed:
            return check
    return RiskCheck(allowed=True, reason="")
