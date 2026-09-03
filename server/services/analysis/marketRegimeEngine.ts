import { MarketRegime, VolatilityAnalysis, IndicatorSnapshot } from './types';

export const MarketRegimeEngine = {
  classifyRegime(
    price: number,
    indicators: IndicatorSnapshot,
    volatility: VolatilityAnalysis,
    structure: 'BULLISH' | 'BEARISH' | 'CHOP' | 'CONSOLIDATION'
  ): MarketRegime {
    const ema21 = indicators.ema[21] || 0;
    const ema50 = indicators.ema[50] || 0;
    const ema200 = indicators.ema[200] || 0;
    const adx = indicators.adx || 0;

    // Check for extreme edge cases first
    if (volatility.level === 'EXTREME') return 'HIGH_VOLATILITY';
    if (volatility.level === 'LOW') return 'LOW_LIQUIDITY'; // Or RANGE depending on ADX

    const priceAboveEma21 = price > ema21;
    const priceAboveEma50 = price > ema50;
    const priceAboveEma200 = price > ema200;
    
    const emaStackedBullish = ema21 > ema50 && ema50 > ema200;
    const emaStackedBearish = ema21 < ema50 && ema50 < ema200;

    const trending = adx >= 25;
    const weakTrend = adx >= 20 && adx < 25;

    // Bullish Regimes
    if (emaStackedBullish && priceAboveEma21 && trending && structure === 'BULLISH') {
      return 'STRONG_BULLISH';
    }
    if (emaStackedBullish && priceAboveEma50 && structure !== 'BEARISH') {
      if (trending) return 'BULLISH';
      return 'WEAK_BULLISH';
    }
    if (!emaStackedBullish && priceAboveEma200 && structure === 'BULLISH') {
      return 'WEAK_BULLISH';
    }

    // Bearish Regimes
    if (emaStackedBearish && !priceAboveEma21 && trending && structure === 'BEARISH') {
      return 'STRONG_BEARISH';
    }
    if (emaStackedBearish && !priceAboveEma50 && structure !== 'BULLISH') {
      if (trending) return 'BEARISH';
      return 'WEAK_BEARISH';
    }
    if (!emaStackedBearish && !priceAboveEma200 && structure === 'BEARISH') {
      return 'WEAK_BEARISH';
    }

    // Range Regimes
    if (!trending || structure === 'CONSOLIDATION' || structure === 'CHOP') {
      return 'RANGE';
    }

    return 'UNCLEAR';
  }
};
