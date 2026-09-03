import { TradeSetup, TimeframeAnalysis } from './types';

export const TradeSetupDetector = {
  detect(timeframe: TimeframeAnalysis): TradeSetup {
    const { structure, marketRegime, momentum, breakoutStatus, trend } = timeframe;

    // VERY naive logic - we'll keep it simple for this structural refactor, 
    // but in reality this relies heavily on S/R proximity and volume.
    
    if (marketRegime === 'STRONG_BULLISH' || marketRegime === 'BULLISH') {
      if (breakoutStatus === 'BREAKOUT_CONFIRMED' && momentum === 'MOMENTUM_ACCELERATING') {
        return {
          type: 'BREAKOUT_RETEST',
          direction: 'LONG',
          isValid: true,
          confidence: 85,
          reasoning: 'Confirmed breakout with accelerating momentum in a bullish regime.'
        };
      }
      
      if (structure === 'BULLISH' && momentum === 'MOMENTUM_ACCELERATING') {
         return {
           type: 'TREND_CONTINUATION',
           direction: 'LONG',
           isValid: true,
           confidence: 75,
           reasoning: 'Bullish market structure showing continuation momentum.'
         };
      }
      
      // Look for Higher Low Continuation
      const swings = timeframe.swingPoints || [];
      const recentSwings = swings.slice(-2);
      if (recentSwings.length === 2 && recentSwings[1].type === 'HL' && momentum !== 'MOMENTUM_WEAKENING') {
        return {
          type: 'HIGHER_LOW_CONTINUATION',
          direction: 'LONG',
          isValid: true,
          confidence: 80,
          reasoning: 'Formed a higher low, expecting continuation upward.'
        };
      }
    }

    if (marketRegime === 'STRONG_BEARISH' || marketRegime === 'BEARISH') {
      // Similar logic for shorts
      if (structure === 'BEARISH' && momentum === 'MOMENTUM_ACCELERATING') {
         return {
           type: 'TREND_CONTINUATION',
           direction: 'SHORT',
           isValid: true,
           confidence: 75,
           reasoning: 'Bearish market structure showing continuation momentum.'
         };
      }
    }

    return {
      type: 'NO_SETUP',
      direction: 'NEUTRAL',
      isValid: false,
      confidence: 0,
      reasoning: 'No clear trade setup detected.'
    };
  }
};
