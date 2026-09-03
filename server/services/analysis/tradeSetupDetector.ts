import { TradeSetup, TimeframeAnalysis } from './types';

export const TradeSetupDetector = {
  detect(timeframe: TimeframeAnalysis): TradeSetup {
    const { structure, marketRegime, momentum, breakoutStatus, trend, volumeCondition } = timeframe;

    if (structure.breakout && (volumeCondition === 'LOW_VOLUME' || volumeCondition === 'VOLUME_CONTRACTION')) {
      return {
        type: 'NO_SETUP',
        direction: 'NEUTRAL',
        isValid: false,
        confidence: 0,
        reasoning: 'Fake breakout detected: price broke structure but volume is weak.'
      };
    }

    if (marketRegime === 'STRONG_BULLISH' || marketRegime === 'BULLISH') {
      if (breakoutStatus === 'BREAKOUT_CONFIRMED' && momentum === 'MOMENTUM_ACCELERATING') {
        return {
          type: 'BREAKOUT_RETEST_LONG',
          direction: 'LONG',
          isValid: true,
          confidence: 85,
          reasoning: 'Confirmed breakout with accelerating momentum in a bullish regime.'
        };
      }
      
      if (structure.trend === 'BULLISH' && momentum === 'MOMENTUM_ACCELERATING') {
         return {
           type: 'TREND_CONTINUATION_LONG',
           direction: 'LONG',
           isValid: true,
           confidence: 75,
           reasoning: 'Bullish market structure showing continuation momentum.'
         };
      }
      
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
      if (structure.trend === 'BEARISH' && momentum === 'MOMENTUM_ACCELERATING') {
         return {
           type: 'TREND_CONTINUATION_SHORT',
           direction: 'SHORT',
           isValid: true,
           confidence: 75,
           reasoning: 'Bearish market structure showing continuation momentum.'
         };
      }
      const swings = timeframe.swingPoints || [];
      const recentSwings = swings.slice(-2);
      if (recentSwings.length === 2 && recentSwings[1].type === 'LH' && momentum !== 'MOMENTUM_WEAKENING') {
        return {
          type: 'LOWER_HIGH_CONTINUATION',
          direction: 'SHORT',
          isValid: true,
          confidence: 80,
          reasoning: 'Formed a lower high, expecting continuation downward.'
        };
      }
    }
    
    let reason = 'No clear trade setup detected.';
    if (marketRegime === 'RANGE') reason = 'Market is ranging. Waiting for breakout or boundary bounce.';
    if (marketRegime === 'UNCLEAR') reason = 'Market regime is unclear. No edge present.';
    if (momentum === 'MOMENTUM_WEAKENING') reason = `Trend is ${trend} but momentum is weakening. Risky entry.`;

    return {
      type: 'NO_SETUP',
      direction: 'NEUTRAL',
      isValid: false,
      confidence: 0,
      reasoning: reason
    };
  }
};
