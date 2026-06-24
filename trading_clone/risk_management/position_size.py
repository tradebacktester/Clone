import logging

logger = logging.getLogger(__name__)

PIP_VALUE_USD = {"EURUSD": 10.0, "GBPUSD": 10.0, "USDJPY": 7.0}
DEFAULT_PIP_VALUE = 10.0


def calc_position_size(
    account_balance: float,
    risk_pct: float,
    entry: float,
    stop_loss: float,
    pair: str,
    lot_precision: int = 2,
) -> float:
    risk_amount = account_balance * risk_pct
    pip = 0.01 if pair == "USDJPY" else 0.0001
    sl_pips = abs(entry - stop_loss) / pip
    if sl_pips == 0:
        return 0.0
    pip_value = PIP_VALUE_USD.get(pair, DEFAULT_PIP_VALUE)
    lots = risk_amount / (sl_pips * pip_value)
    return round(lots, lot_precision)
