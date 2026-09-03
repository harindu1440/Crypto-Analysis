export type TrendDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type MarketRegime = 'STRONG_BULLISH' | 'BULLISH' | 'WEAK_BULLISH' | 'RANGE' | 'WEAK_BEARISH' | 'BEARISH' | 'STRONG_BEARISH' | 'HIGH_VOLATILITY' | 'LOW_LIQUIDITY' | 'UNCLEAR';
export type VolatilityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
export type VolumeCondition = 'LOW_VOLUME' | 'NORMAL_VOLUME' | 'HIGH_VOLUME' | 'VOLUME_EXPANSION' | 'VOLUME_CONTRACTION' | 'VOLUME_BREAKOUT';
export type BreakoutStatus = 'BREAKOUT_CONFIRMED' | 'BREAKOUT_UNCONFIRMED' | 'BREAKOUT_FAILED' | 'NO_BREAKOUT';
export type MomentumState = 'MOMENTUM_ACCELERATING' | 'MOMENTUM_STABLE' | 'MOMENTUM_WEAKENING' | 'MOMENTUM_REVERSING';
export type TradeSetupType = 'TREND_CONTINUATION' | 'BREAKOUT_RETEST' | 'SUPPORT_BOUNCE' | 'BULLISH_REVERSAL' | 'HIGHER_LOW_CONTINUATION' | 'BREAKDOWN_RETEST' | 'RESISTANCE_REJECTION' | 'BEARISH_REVERSAL' | 'LOWER_HIGH_CONTINUATION' | 'NO_SETUP';

export interface SwingPoint {
  type: 'HH' | 'HL' | 'LH' | 'LL' | 'UNKNOWN';
  price: number;
  index: number;
  timestamp: number;
}

export interface TradeSetup {
  type: TradeSetupType;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  isValid: boolean;
  confidence: number;
  reasoning: string;
}

export interface NormalizedCandle {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
}

export interface SupportResistanceLevel {
  type: 'support' | 'resistance';
  price: number;
  strength: number; // 1 to 5
}

export interface PatternDetection {
  pattern: string;
  direction: TrendDirection;
  confidence: number; // 0 to 100
  index: number; // candle index from end (0 = latest)
}

export interface IndicatorSnapshot {
  sma: Record<number, number>; // period -> value
  ema: Record<number, number>;
  rsi: Record<number, number>;
  macd: {
    macdLine: number;
    signalLine: number;
    histogram: number;
  };
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
  };
  atr: number;
  adx?: number;
  stochastic?: { k: number; d: number };
  volumeSma?: number;
}

export interface VolatilityAnalysis {
  level: VolatilityLevel;
  atr: number;
  atrPercentage: number;
}

export interface TimeframeAnalysis {
  timeframe: string;
  indicators: IndicatorSnapshot;
  trend: TrendDirection;
  marketRegime: MarketRegime;
  support: SupportResistanceLevel[];
  resistance: SupportResistanceLevel[];
  patterns: PatternDetection[];
  volumeCondition: VolumeCondition;
  volatility: VolatilityAnalysis;
  momentum: MomentumState;
  swingPoints: SwingPoint[];
  structure: 'BULLISH' | 'BEARISH' | 'CHOP' | 'CONSOLIDATION';
  setup: TradeSetup;
  breakoutStatus: BreakoutStatus;
}

export interface TechnicalAnalysisSnapshot {
  symbol: string;
  timestamp: number;
  market: {
    price: number;
    volume24h: number;
    change24h: number; 
  };
  timeframes: Record<string, TimeframeAnalysis>;
  multiTimeframeAlignment?: 'BULLISH' | 'BEARISH' | 'CONFLICTING' | 'NEUTRAL';
  overallRegime?: MarketRegime;
  overallDirection?: 'LONG' | 'SHORT' | 'NEUTRAL';
  opportunityScore?: number;
}

export const INDICATOR_CONFIG = {
  SMA_PERIODS: [20, 50, 200],
  EMA_PERIODS: [9, 21, 50, 200],
  RSI_PERIOD: 14,
  MACD: { fast: 12, slow: 26, signal: 9 },
  BOLLINGER: { period: 20, multiplier: 2 },
  ATR_PERIOD: 14
};
