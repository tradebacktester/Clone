export interface Candle {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SwingPoint {
  time: Date;
  price: number;
  type: "high" | "low";
  index: number;
}

export type StructureLabel = "HH" | "HL" | "LH" | "LL" | "BOS_UP" | "BOS_DOWN";

export interface StructurePoint extends SwingPoint {
  label: StructureLabel;
}

export interface FibLevel {
  ratio: number;
  label: string;
  price: number;
}

export interface FibAnalysis {
  swingHigh: number;
  swingLow: number;
  trend: "bullish" | "bearish" | "neutral";
  levels: FibLevel[];
  premiumZone: { top: number; bottom: number };
  discountZone: { top: number; bottom: number };
  equilibrium: number;
  currentPriceBias: "premium" | "discount" | "equilibrium";
}

export interface SupplyDemandZone {
  pair: string;
  timeframe: string;
  zoneType: "supply" | "demand";
  priceTop: number;
  priceBottom: number;
  strength: number;
  tested: number;
  active: boolean;
  fibLevel: number | null;
  originTime: Date;
  freshness: "fresh" | "tested" | "stale";
}

export interface LiquidityLevel {
  price: number;
  type: "equal_highs" | "equal_lows" | "prev_high" | "prev_low" | "prev_week_high" | "prev_week_low";
  swept: boolean;
  sweepTime?: Date;
  strength: number;
}

export interface LiquidityGrab {
  time: Date;
  price: number;
  type: "sweep_high" | "sweep_low";
  levelSwept: number;
  reversalStrength: number;
  confirmed: boolean;
}

export interface SweepEvent {
  time: Date;
  // buy_side  = price took a previous HIGH then closed back below → bearish reversal expected
  // sell_side = price took a previous LOW  then closed back above → bullish reversal expected
  type: "buy_side" | "sell_side";
  levelPrice: number;    // the swing high / low that was swept
  sweepPrice: number;    // the extreme reached (candle high for buy_side, candle low for sell_side)
  sweepDistance: number; // how far past the level in ATR units
  sweepScore: number;    // 0–100 (Displacement 40 + Volume 20 + Reversal 20 + BOS 20)
}

export type AMDPhase = "accumulation" | "manipulation" | "distribution" | "none";

export interface AMDSequence {
  phase: AMDPhase;
  direction: "bullish" | "bearish" | null;
  accumulationStart: Date | null;
  manipulationTime: Date | null;
  distributionStart: Date | null;
  manipulationHigh: number | null;
  manipulationLow: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  complete: boolean;
  amdScore: number;
}

export interface MarketRegimeResult {
  pair: string;
  regime: "trending" | "ranging" | "volatile" | "unknown";
  trend: "bullish" | "bearish" | "neutral";
  volatility: "low" | "medium" | "high";
  atr: number;
  adxEquivalent: number;
}

export interface TradeSignal {
  pair: string;
  direction: "buy" | "sell";
  confidence: number;
  finalScore: number;
  zoneScore: number;
  liquidityScore: number;
  amdScore: number;
  confirmationScore: number;
  zoneType: "demand" | "supply";
  zoneStrength: number;
  amdPhase: "accumulation" | "manipulation" | "distribution";
  fibLevel: number;
  session: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  confluenceFactors: string[];
}

export interface BacktestTrade {
  id: number;
  pair: string;
  direction: "buy" | "sell";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  closedPrice: number;
  lotSize: number;
  status: "closed";
  pnl: number;
  pnlPercent: number;
  session: string;
  setupScore: number;
  amdPattern: "accumulation" | "manipulation" | "distribution";
  zoneType: "demand" | "supply";
  zoneStrength: number;
  liquiditySweep: boolean;
  fibLevel: number;
  riskRewardRatio: number;
  breakEvenMoved: boolean;
  closeReason: "tp_hit" | "sl_hit";
  openedAt: string;
  closedAt: string;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  totalTrades: number;
  winners: number;
  losers: number;
  winRate: number;
  totalPnl: number;
  finalBalance: number;
  maxDrawdown: number;
  profitFactor: number;
  sharpeRatio: number;
  equityCurve: { time: string; balance: number }[];
  expectancy: number;
  avgRR: number;
  avgWin: number;
  avgLoss: number;
  maxConsecWins: number;
  maxConsecLosses: number;
  sessionStats: import("./backtest/stats.js").SessionStats[];
  pairStats: import("./backtest/stats.js").PairStats[];
  zoneStats: import("./backtest/stats.js").ZoneCategoryStats[];
}

export interface PatternScore {
  pattern: string;
  trades: number;
  wins: number;
  totalPnl: number;
  winRate: number;
  avgPnl: number;
  avgScore: number;
  confidence: number;
}

export type Pair = "EURUSD" | "GBPUSD" | "USDJPY";
export type Timeframe = "1h" | "4h" | "1d";

export interface AnalysisResult {
  pair: Pair;
  timeframe: Timeframe;
  candles: Candle[];
  swings: SwingPoint[];
  structure: StructurePoint[];
  fib: FibAnalysis | null;
  zones: SupplyDemandZone[];
  liquidity: LiquidityLevel[];
  recentGrabs: LiquidityGrab[];
  sweeps: SweepEvent[];
  amd: AMDSequence;
  regime: MarketRegimeResult;
  signals: TradeSignal[];
  atr: number;
  analyzedAt: Date;
}
