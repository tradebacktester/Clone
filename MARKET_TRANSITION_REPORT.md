# MARKET TRANSITION REPORT
Generated: Build-time placeholder — live report at /api/market/world-model/report
Engine Version: 1.0.0

---

## Summary

This report documents market state transitions detected from historical trade feature data.

## Tracked Transitions

### Regime Transitions
- Trending → Ranging
- Ranging → Trending
- Volatile → Trending
- Trending → Volatile
- Low Volatility → Trending
- Low Volatility → Volatile

### Volatility Transitions
- Compression → Expansion
- Expansion → Compression
- Stable → Expansion
- Expansion → Stable

### Liquidity Transitions
- High Liquidity → Low
- Low Liquidity → High
- Normal → Low Liquidity
- Low → Normal Liquidity

## Metrics Per Transition
- Transition Probability
- Average Duration (bars)
- Median Duration (bars)
- Historical Frequency
- Confidence Score
- Average Trade Quality After Transition

Live transition data is available at: `GET /api/market/transitions`

_Advisory only. Transition probabilities are historical estimates, not guarantees._
