# MARKET RELATIONSHIP REPORT
Generated: Build-time placeholder — live report at /api/market/world-model/report
Engine Version: 1.0.0

---

## Summary

This report documents the statistically significant relationships discovered between
the 13 world model components using historical trade feature data.

## Key Known Relationships (Domain Priors)

| Source          | Target             | Type         | Direction | Notes                              |
|-----------------|--------------------|--------------|-----------|------------------------------------|
| news            | volatility         | amplifies    | positive  | High-impact news → volatility spike |
| volatility      | liquidity          | suppresses   | negative  | Rising vol → reduced liquidity      |
| liquidity       | spread             | suppresses   | negative  | Low liq → wider spreads             |
| regime          | trend              | leads_to     | positive  | Regime defines trend context        |
| session         | liquidity          | amplifies    | positive  | London/NY → higher liquidity        |
| amd_completion  | confirmation_quality | amplifies  | positive  | Complete AMD → quality confirmation |

Live relationship data is available at: `GET /api/market/relationships`

_Advisory only. Relationships are observational, not predictive._
