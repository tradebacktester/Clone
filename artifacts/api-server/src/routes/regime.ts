import { Router, type IRouter } from "express";
import { isNull } from "drizzle-orm";
import { db, marketRegimeTable, regimePerformanceTable, regimeWeightsTable } from "@workspace/db";
import { DEFAULT_REGIME_WEIGHTS, bestPerformingRegime, type RegimePerformanceStats } from "@workspace/market-analysis";

const router: IRouter = Router();

router.get("/regime/analytics", async (_req, res): Promise<void> => {
  const [perfRows, weightRows, regimeRows] = await Promise.all([
    db.select().from(regimePerformanceTable).where(isNull(regimePerformanceTable.pair)),
    db.select().from(regimeWeightsTable).where(isNull(regimeWeightsTable.pair)),
    db.select().from(marketRegimeTable),
  ]);

  const stats: RegimePerformanceStats[] = (["trending", "ranging", "volatile", "low_volatility"] as const).map(regime => {
    const row = perfRows.find(r => r.regime === regime);
    const weightRow = weightRows.find(r => r.regime === regime);
    const defaultW = DEFAULT_REGIME_WEIGHTS[regime];

    const weights = {
      zone:         parseFloat(weightRow?.zoneWeight         ?? String(defaultW.zone)),
      liquidity:    parseFloat(weightRow?.liquidityWeight    ?? String(defaultW.liquidity)),
      amd:          parseFloat(weightRow?.amdWeight          ?? String(defaultW.amd)),
      confirmation: parseFloat(weightRow?.confirmationWeight ?? String(defaultW.confirmation)),
    };

    const zoneWR   = parseFloat(row?.zoneWinRate         ?? "0");
    const liqWR    = parseFloat(row?.liquidityWinRate    ?? "0");
    const amdWR    = parseFloat(row?.amdWinRate          ?? "0");
    const confWR   = parseFloat(row?.confirmationWinRate ?? "0");

    const components: [string, number][] = [
      ["zone", zoneWR], ["liquidity", liqWR], ["amd", amdWR], ["confirmation", confWR],
    ];
    const bestComponent = components.sort((a, b) => b[1] - a[1])[0]![0] as "zone" | "liquidity" | "amd" | "confirmation";

    return {
      regime,
      totalTrades: row?.totalTrades ?? 0,
      wins:        row?.wins        ?? 0,
      losses:      row?.losses      ?? 0,
      winRate:             parseFloat(row?.winRate             ?? "0"),
      profitFactor:        parseFloat(row?.profitFactor        ?? "0"),
      maxDrawdown:         parseFloat(row?.maxDrawdown         ?? "0"),
      avgSetupScore:       parseFloat(row?.avgSetupScore       ?? "0"),
      zoneWinRate:         zoneWR,
      liquidityWinRate:    liqWR,
      amdWinRate:          amdWR,
      confirmationWinRate: confWR,
      bestComponent,
      weights,
    };
  });

  const best = bestPerformingRegime(stats);

  const currentRegimes: Record<string, string> = {};
  for (const r of regimeRows) {
    currentRegimes[r.pair] = r.regime;
  }

  const regimesWithBest = stats.map(s => ({
    ...s,
    isBestRegime: s.regime === best,
    weights: (["trending", "ranging", "volatile", "low_volatility"] as const)
      .filter(r => r === s.regime)
      .map(() => {
        const wr = weightRows.find(r => r.regime === s.regime);
        const dw = DEFAULT_REGIME_WEIGHTS[s.regime];
        return {
          zone:         parseFloat(wr?.zoneWeight         ?? String(dw.zone)),
          liquidity:    parseFloat(wr?.liquidityWeight    ?? String(dw.liquidity)),
          amd:          parseFloat(wr?.amdWeight          ?? String(dw.amd)),
          confirmation: parseFloat(wr?.confirmationWeight ?? String(dw.confirmation)),
        };
      })[0] ?? { zone: 0.30, liquidity: 0.25, amd: 0.25, confirmation: 0.20 },
  }));

  res.json({ regimes: regimesWithBest, bestRegime: best, currentRegimes });
});

router.get("/regime/weights", async (_req, res): Promise<void> => {
  const rows = await db.select().from(regimeWeightsTable).where(isNull(regimeWeightsTable.pair));

  const result = (["trending", "ranging", "volatile", "low_volatility"] as const).map(regime => {
    const row = rows.find(r => r.regime === regime);
    const dw = DEFAULT_REGIME_WEIGHTS[regime];
    return {
      regime,
      zone:         parseFloat(row?.zoneWeight         ?? String(dw.zone)),
      liquidity:    parseFloat(row?.liquidityWeight    ?? String(dw.liquidity)),
      amd:          parseFloat(row?.amdWeight          ?? String(dw.amd)),
      confirmation: parseFloat(row?.confirmationWeight ?? String(dw.confirmation)),
      sampleSize:   row?.sampleSize ?? 0,
      updatedAt:    row?.updatedAt?.toISOString() ?? new Date(0).toISOString(),
    };
  });

  res.json(result);
});

router.get("/regime/current", async (_req, res): Promise<void> => {
  const rows = await db.select().from(marketRegimeTable);
  res.json(rows.map(r => ({
    pair: r.pair,
    regime: r.regime,
    trend: r.trend,
    volatility: r.volatility,
    atr: parseFloat(r.atr),
    adxEquivalent: parseFloat(r.adxEquivalent ?? "0"),
    regimeConfidence: parseFloat(r.regimeConfidence ?? "0"),
    volatilityPercentile: parseFloat(r.volatilityPercentile ?? "50"),
    rangeCompression: parseFloat(r.rangeCompression ?? "0"),
    updatedAt: r.updatedAt?.toISOString() ?? new Date().toISOString(),
  })));
});

export default router;
