import { TimeframeAnalysis, MarketRegime } from './types';

export const MultiTimeframeEngine = {
  analyzeAlignment(timeframes: Record<string, TimeframeAnalysis>): {
    alignment: 'BULLISH' | 'BEARISH' | 'CONFLICTING' | 'NEUTRAL',
    overallRegime: MarketRegime | 'UNCLEAR',
    overallDirection: 'LONG' | 'SHORT' | 'NEUTRAL'
  } {
    const tf4h = timeframes['4h'];
    const tf1h = timeframes['1h'];
    const tf15m = timeframes['15m'];
    const tf5m = timeframes['5m'];

    if (!tf4h || !tf1h) {
      return { alignment: 'NEUTRAL', overallRegime: 'UNCLEAR', overallDirection: 'NEUTRAL' };
    }

    const macroBullish = tf4h.trend === 'BULLISH' || tf4h.marketRegime.includes('BULLISH');
    const macroBearish = tf4h.trend === 'BEARISH' || tf4h.marketRegime.includes('BEARISH');
    
    const primaryBullish = tf1h.trend === 'BULLISH' || tf1h.marketRegime.includes('BULLISH');
    const primaryBearish = tf1h.trend === 'BEARISH' || tf1h.marketRegime.includes('BEARISH');

    const macroRegime = tf4h.marketRegime;

    if (macroBullish && primaryBullish) {
      // Need to see if lower timeframes confirm entry or pullback
      if (tf15m && tf5m) {
         const ltBearish = tf15m.trend === 'BEARISH' && tf5m.trend === 'BEARISH';
         // If LT is bearish while HT is bullish, it's a pullback - good for entry if 5m starts turning, but for strict alignment:
         if (ltBearish) return { alignment: 'CONFLICTING', overallRegime: macroRegime, overallDirection: 'NEUTRAL' }; // Wait for 5m to flip
      }
      return { alignment: 'BULLISH', overallRegime: macroRegime, overallDirection: 'LONG' };
    }

    if (macroBearish && primaryBearish) {
      if (tf15m && tf5m) {
         const ltBullish = tf15m.trend === 'BULLISH' && tf5m.trend === 'BULLISH';
         if (ltBullish) return { alignment: 'CONFLICTING', overallRegime: macroRegime, overallDirection: 'NEUTRAL' }; 
      }
      return { alignment: 'BEARISH', overallRegime: macroRegime, overallDirection: 'SHORT' };
    }

    if (macroBullish && primaryBearish) {
      return { alignment: 'CONFLICTING', overallRegime: macroRegime, overallDirection: 'NEUTRAL' };
    }

    if (macroBearish && primaryBullish) {
      return { alignment: 'CONFLICTING', overallRegime: macroRegime, overallDirection: 'NEUTRAL' };
    }

    return { alignment: 'NEUTRAL', overallRegime: macroRegime, overallDirection: 'NEUTRAL' };
  }
};
