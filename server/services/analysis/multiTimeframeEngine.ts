import { TimeframeAnalysis, MarketRegime } from './types';

export const MultiTimeframeEngine = {
  analyzeAlignment(timeframes: Record<string, TimeframeAnalysis>): {
    alignment: 'BULLISH' | 'BEARISH' | 'CONFLICTING' | 'NEUTRAL',
    overallRegime: MarketRegime | 'UNCLEAR',
    overallDirection: 'LONG' | 'SHORT' | 'NEUTRAL',
    mtfAlignmentScore: number,
    action: 'TRADE_READY' | 'WAIT' | 'NO_TRADE'
  } {
    const tf4h = timeframes['4h'];
    const tf1h = timeframes['1h'];
    const tf15m = timeframes['15m'];
    const tf5m = timeframes['5m'];

    if (!tf4h || !tf1h || !tf15m || !tf5m) {
      return { alignment: 'NEUTRAL', overallRegime: 'UNCLEAR', overallDirection: 'NEUTRAL', mtfAlignmentScore: 0, action: 'NO_TRADE' };
    }

    const macroBullish = tf4h.trend === 'BULLISH';
    const macroBearish = tf4h.trend === 'BEARISH';
    const primaryBullish = tf1h.trend === 'BULLISH';
    const primaryBearish = tf1h.trend === 'BEARISH';
    const confBullish = tf15m.trend === 'BULLISH';
    const confBearish = tf15m.trend === 'BEARISH';
    const entryBullish = tf5m.trend === 'BULLISH';
    const entryBearish = tf5m.trend === 'BEARISH';

    const macroRegime = tf4h.marketRegime;

    let score = 0;
    
    // LONG Alignment
    if (macroBullish && primaryBullish) {
      score += 40;
      if (confBullish) score += 40;
      if (entryBullish) score += 20;

      if (score === 100) return { alignment: 'BULLISH', overallRegime: macroRegime, overallDirection: 'LONG', mtfAlignmentScore: score, action: 'TRADE_READY' };
      if (score >= 40) return { alignment: 'BULLISH', overallRegime: macroRegime, overallDirection: 'LONG', mtfAlignmentScore: score, action: 'WAIT' };
      return { alignment: 'CONFLICTING', overallRegime: macroRegime, overallDirection: 'NEUTRAL', mtfAlignmentScore: score, action: 'WAIT' };
    }

    // SHORT Alignment
    if (macroBearish && primaryBearish) {
      score += 40;
      if (confBearish) score += 40;
      if (entryBearish) score += 20;

      if (score === 100) return { alignment: 'BEARISH', overallRegime: macroRegime, overallDirection: 'SHORT', mtfAlignmentScore: score, action: 'TRADE_READY' };
      if (score >= 40) return { alignment: 'BEARISH', overallRegime: macroRegime, overallDirection: 'SHORT', mtfAlignmentScore: score, action: 'WAIT' };
      return { alignment: 'CONFLICTING', overallRegime: macroRegime, overallDirection: 'NEUTRAL', mtfAlignmentScore: score, action: 'WAIT' };
    }

    return { alignment: 'NEUTRAL', overallRegime: macroRegime, overallDirection: 'NEUTRAL', mtfAlignmentScore: 0, action: 'NO_TRADE' };
  }
};
