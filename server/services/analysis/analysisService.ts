import { BinanceMarketService } from '../binance/binanceMarketService';
import { IndicatorService } from './indicatorService';
import { CandleService } from './candleService';
import { MarketStructureEngine } from './marketStructureEngine';
import { MarketRegimeEngine } from './marketRegimeEngine';
import { MomentumVolumeEngine } from './momentumVolumeEngine';
import { SupportResistanceEngine } from './supportResistanceEngine';
import { TradeSetupDetector } from './tradeSetupDetector';
import { MultiTimeframeEngine } from './multiTimeframeEngine';
import { 
  NormalizedCandle, 
  TimeframeAnalysis, 
  TechnicalAnalysisSnapshot,
  INDICATOR_CONFIG,
  TrendDirection,
  VolatilityAnalysis,
  VolatilityLevel
} from './types';

export const AnalysisService = {
  
  async getAnalysisSnapshot(symbol: string, intervals: string[] = ['4h', '1h', '15m', '5m']): Promise<TechnicalAnalysisSnapshot> {
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

      console.log(`[MarketData] Fetched ${candles.length} actual OHLCV candles for ${interval.toUpperCase()}`);

      if (candles.length < 100) {
        console.warn(`[MarketData] Warning: Insufficient candle history for ${interval} (${candles.length}/200). Indicators may be inaccurate.`);
      }

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
      const adx = IndicatorService.adx(candles, 14) || 0;
      const stochastic = IndicatorService.stochastic(candles, 14, 3, 3) || { k: 50, d: 50 };
      const volumeSma = IndicatorService.volumeSma(candles.map(c => c.volume), 20) || 0;
      
      const currentCandle = candles[candles.length - 1];
      const previousCandle = candles.length > 1 ? candles[candles.length - 2] : currentCandle;
      const priceVelocity = currentCandle.close - previousCandle.close;
      const averageCandleRange = candles.slice(-20).reduce((sum, c) => sum + (c.high - c.low), 0) / 20;
      const volumeRatio = volumeSma > 0 ? currentCandle.volume / volumeSma : 1;

      const indicators = { sma, ema, rsi, macd, bollingerBands, atr, adx, stochastic, volumeSma, priceVelocity, averageCandleRange, volumeRatio };

      // Deterministic Engines
      const swingPoints = MarketStructureEngine.detectSwingPoints(candles);
      const structure = MarketStructureEngine.analyzeStructure(swingPoints, candles);
      const { trend } = this.classifyMarket(closes, ema);
      const volatility = this.analyzeVolatility(latestPrice, atr);
      const marketRegime = MarketRegimeEngine.classifyRegime(latestPrice, indicators, volatility, structure);
      const momentum = MomentumVolumeEngine.analyzeMomentum(indicators);
      const volumeCondition = MomentumVolumeEngine.analyzeVolume(candles, volumeSma);
      const { support, resistance } = SupportResistanceEngine.calculateLevels(candles, swingPoints);
      const patterns = CandleService.detectPatterns(candles);
      
      const breakoutStatus = 'NO_BREAKOUT'; // Simplified for now

      const partialTimeframe = {
        timeframe: interval,
        indicators,
        trend,
        marketRegime,
        support,
        resistance,
        patterns,
        volumeCondition,
        volatility,
        momentum,
        swingPoints,
        structure,
        breakoutStatus
      };

      const setup = TradeSetupDetector.detect(partialTimeframe as TimeframeAnalysis);

      timeframes[interval] = {
        ...partialTimeframe,
        setup
      } as TimeframeAnalysis;
    }

    const { alignment, overallRegime, overallDirection, mtfAlignmentScore, action } = MultiTimeframeEngine.analyzeAlignment(timeframes);

    return {
      symbol,
      timestamp: Date.now(),
      market: {
        price: latestPrice,
        volume24h: latestVolume,
        change24h: 0 
      },
      timeframes,
      multiTimeframeAlignment: alignment,
      mtfAlignmentScore,
      mtfAction: action,
      overallRegime,
      overallDirection
    };
  },

  classifyMarket(closes: number[], ema: Record<number, number>): { trend: TrendDirection } {
    let trend: TrendDirection = 'NEUTRAL';
    const price = closes[closes.length - 1];

    const ema20 = ema[20] || 0;
    const ema50 = ema[50] || 0;

    if (price > ema20 && ema20 > ema50) {
      trend = 'BULLISH';
    } else if (price < ema20 && ema20 < ema50) {
      trend = 'BEARISH';
    }

    return { trend };
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
