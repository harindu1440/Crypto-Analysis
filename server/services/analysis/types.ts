export type TrendDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type MarketCondition = 'TRENDING' | 'RANGING' | 'HIGH_VOLATILITY' | 'LOW_VOLATILITY' | 'NEUTRAL';
export type VolatilityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
export type VolumeCondition = 'LOW_VOLUME' | 'NORMAL_VOLUME' | 'HIGH_VOLUME';

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
  marketCondition: MarketCondition;
  support: SupportResistanceLevel[];
  resistance: SupportResistanceLevel[];
  patterns: PatternDetection[];
  volumeCondition: VolumeCondition;
  volatility: VolatilityAnalysis;
}

export interface TechnicalAnalysisSnapshot {
  symbol: string;
  timestamp: number;
  market: {
    price: number;
    volume24h: number;
    change24h: number; // We might omit this if not easily retrieved from klines alone, or compute it.
  };
  timeframes: Record<string, TimeframeAnalysis>;
}

export const INDICATOR_CONFIG = {
  SMA_PERIODS: [20, 50, 200],
  EMA_PERIODS: [9, 21, 50, 200],
  RSI_PERIOD: 14,
  MACD: { fast: 12, slow: 26, signal: 9 },
  BOLLINGER: { period: 20, multiplier: 2 },
  ATR_PERIOD: 14
};
