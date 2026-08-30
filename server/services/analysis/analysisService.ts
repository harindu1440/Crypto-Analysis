import { BinanceMarketService } from '../binance/binanceMarketService';
import { IndicatorService } from './indicatorService';
import { CandleService } from './candleService';
import { 
  NormalizedCandle, 
  TimeframeAnalysis, 
  TechnicalAnalysisSnapshot,
  INDICATOR_CONFIG,
  TrendDirection,
  MarketCondition,
  VolatilityAnalysis,
  VolatilityLevel
} from './types';

export const AnalysisService = {
  
  async getAnalysisSnapshot(symbol: string, intervals: string[] = ['1h']): Promise<TechnicalAnalysisSnapshot> {
    const timeframes: Record<string, TimeframeAnalysis> = {};
    let latestPrice = 0;
    let latestVolume = 0;

    for (const interval of intervals) {
      // Fetch 200 candles to ensure enough data for SMA 200 / EMA 200
      const klines = await BinanceMarketService.getKlines(symbol, interval, 200);
      
      const candles: NormalizedCandle[] = klines.map(k => ({
        openTime: k.openTime,
        closeTime: k.closeTime,
        open: parseFloat(k.open),
        high: parseFloat(k.high),
        low: parseFloat(k.low),
        close: parseFloat(k.close),
        volume: parseFloat(k.volume),
        quoteVolume: 0 // Simplification for now
      }));

      if (candles.length === 0) continue;
      
      latestPrice = candles[candles.length - 1].close;
      latestVolume = candles[candles.length - 1].volume;

      const closes = candles.map(c => c.close);
      
      // Indicators
      const sma = INDICATOR_CONFIG.SMA_PERIODS.reduce((acc, p) => ({ ...acc, [p]: IndicatorService.sma(closes, p) || 0 }), {});
      const ema = INDICATOR_CONFIG.EMA_PERIODS.reduce((acc, p) => ({ ...acc, [p]: IndicatorService.ema(closes, p) || 0 }), {});
      const rsi = INDICATOR_CONFIG.RSI_PERIOD ? { [INDICATOR_CONFIG.RSI_PERIOD]: IndicatorService.rsi(closes, INDICATOR_CONFIG.RSI_PERIOD) || 50 } : {};
      const macd = IndicatorService.macd(closes, INDICATOR_CONFIG.MACD.fast, INDICATOR_CONFIG.MACD.slow, INDICATOR_CONFIG.MACD.signal);
      const bollingerBands = IndicatorService.bollingerBands(closes, INDICATOR_CONFIG.BOLLINGER.period, INDICATOR_CONFIG.BOLLINGER.multiplier);
      const atr = IndicatorService.atr(candles, INDICATOR_CONFIG.ATR_PERIOD) || 0;

      // Classifications
      const { trend, marketCondition } = this.classifyMarket(closes, ema, rsi[INDICATOR_CONFIG.RSI_PERIOD], macd, bollingerBands);
      const { support, resistance } = CandleService.findSupportResistance(candles);
      const patterns = CandleService.detectPatterns(candles);
      const volumeCondition = CandleService.analyzeVolume(candles);
      const volatility = this.analyzeVolatility(latestPrice, atr);

      timeframes[interval] = {
        timeframe: interval,
        indicators: { sma, ema, rsi, macd, bollingerBands, atr },
        trend,
        marketCondition,
        support,
        resistance,
        patterns,
        volumeCondition,
        volatility
      };
    }

    return {
      symbol,
      timestamp: Date.now(),
      market: {
        price: latestPrice,
        volume24h: latestVolume, // Should use real 24h ticker, but this is a placeholder
        change24h: 0 
      },
      timeframes
    };
  },

  classifyMarket(closes: number[], ema: Record<number, number>, rsi: number, macd: any, bb: any): { trend: TrendDirection, marketCondition: MarketCondition } {
    let trend: TrendDirection = 'NEUTRAL';
    let condition: MarketCondition = 'RANGING';
    const price = closes[closes.length - 1];

    const ema20 = ema[21] || 0;
    const ema50 = ema[50] || 0;
    const ema200 = ema[200] || 0;

    // Basic Trend Assessment
    if (price > ema20 && ema20 > ema50) {
      trend = 'BULLISH';
    } else if (price < ema20 && ema20 < ema50) {
      trend = 'BEARISH';
    }

    // Market Condition Assessment
    const bbWidth = (bb.upper - bb.lower) / bb.middle; // Bollinger bandwidth
    
    if (bbWidth > 0.1) {
      condition = 'HIGH_VOLATILITY';
    } else if (bbWidth < 0.02) {
      condition = 'LOW_VOLATILITY';
    } else if (Math.abs(macd.histogram) > 0) {
      condition = 'TRENDING';
    }

    return { trend, marketCondition: condition };
  },

  analyzeVolatility(price: number, atr: number): VolatilityAnalysis {
    const atrPercentage = (atr / price) * 100;
    let level: VolatilityLevel = 'MEDIUM';
    
    if (atrPercentage < 1) level = 'LOW';
    else if (atrPercentage > 5) level = 'EXTREME';
    else if (atrPercentage > 2.5) level = 'HIGH';

    return { level, atr, atrPercentage };
  }
};
