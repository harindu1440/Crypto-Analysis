import { MarketRegime, VolatilityAnalysis, IndicatorSnapshot } from './types';

export const MarketRegimeEngine = {
  classifyRegime(
    price: number,
    indicators: IndicatorSnapshot,
    volatility: VolatilityAnalysis,
    structure: { trend: 'BULLISH' | 'BEARISH' | 'CHOP' | 'CONSOLIDATION', bos: boolean, choch: boolean, breakout: boolean }
  ): MarketRegime {
    const ema20 = indicators.ema[20] || 0;
    const ema50 = indicators.ema[50] || 0;
    const ema200 = indicators.ema[200] || 0;
    const adx = indicators.adx || 0;
    const structTrend = structure.trend;

    // Volume-based liquidity check (instead of arbitrary volatility)
    if (indicators.volumeSma && indicators.volumeSma < 100) return 'LOW_LIQUIDITY';

    // Check for extreme edge cases first
    if (volatility.level === 'EXTREME') return 'HIGH_VOLATILITY';

    const priceAboveEma20 = price > ema20;
    const priceAboveEma50 = price > ema50;
    const priceAboveEma200 = price > ema200;
    
    const emaStackedBullish = ema20 > ema50 && ema50 > ema200;
    const emaStackedBearish = ema20 < ema50 && ema50 < ema200;

    const trending = adx >= 25;
    const weakTrend = adx >= 20 && adx < 25;

    // Bullish Regimes
    if (emaStackedBullish && priceAboveEma20 && trending && structTrend === 'BULLISH') {
      return 'STRONG_BULLISH';
    }
    if (emaStackedBullish && priceAboveEma50 && structTrend !== 'BEARISH') {
      if (trending) return 'BULLISH';
      return 'WEAK_BULLISH';
    }
    if (!emaStackedBullish && priceAboveEma200 && structTrend === 'BULLISH') {
      return 'WEAK_BULLISH';
    }

    // Bearish Regimes
    if (emaStackedBearish && !priceAboveEma20 && trending && structTrend === 'BEARISH') {
      return 'STRONG_BEARISH';
    }
    if (emaStackedBearish && !priceAboveEma50 && structTrend !== 'BULLISH') {
      if (trending) return 'BEARISH';
      return 'WEAK_BEARISH';
    }
    if (!emaStackedBearish && !priceAboveEma200 && structTrend === 'BEARISH') {
      return 'WEAK_BEARISH';
    }

    // Range Regimes
    if (!trending || structTrend === 'CONSOLIDATION' || structTrend === 'CHOP') {
      return 'RANGE';
    }

    return 'UNCLEAR';
  }
};
