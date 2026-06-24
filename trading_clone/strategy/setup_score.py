import logging
from typing import Dict

logger = logging.getLogger(__name__)

ZONE_WEIGHT = 0.30
LIQUIDITY_WEIGHT = 0.25
AMD_WEIGHT = 0.25
CONFIRMATION_WEIGHT = 0.20
MIN_FINAL_SCORE = 80.0


def calc_final_score(
    zone_score: float,
    liquidity_score: float,
    amd_score: float,
    confirmation_score: float,
) -> Dict:
    zone_contrib = zone_score * ZONE_WEIGHT
    liq_contrib = liquidity_score * LIQUIDITY_WEIGHT
    amd_contrib = amd_score * AMD_WEIGHT
    conf_contrib = confirmation_score * CONFIRMATION_WEIGHT
    final = zone_contrib + liq_contrib + amd_contrib + conf_contrib

    return {
        "final_score": round(final, 2),
        "zone_contrib": round(zone_contrib, 2),
        "liquidity_contrib": round(liq_contrib, 2),
        "amd_contrib": round(amd_contrib, 2),
        "confirmation_contrib": round(conf_contrib, 2),
        "allowed": final >= MIN_FINAL_SCORE,
    }
