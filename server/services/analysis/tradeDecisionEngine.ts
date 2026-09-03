import { TechnicalAnalysisSnapshot, TradeSetup, TradePlan, TimeframeAnalysis } from './types';
import { MasterDecisionOutput } from '../ai/schemas/types';

export const TradeDecisionEngine = {
  evaluate(
    snapshot: TechnicalAnalysisSnapshot,
    aiConsensus?: MasterDecisionOutput
  ): {
    status: 'TRADE_READY' | 'WAIT' | 'NO_TRADE' | 'AI_UNAVAILABLE' | 'INSUFFICIENT_DATA',
    score: number,
    reasoning: string
  } {
    if (!snapshot || !snapshot.timeframes['1h'] || !snapshot.timeframes['4h'] || !snapshot.timeframes['15m'] || !snapshot.timeframes['5m']) {
      return { status: 'INSUFFICIENT_DATA', score: 0, reasoning: 'Missing required timeframe data (4H, 1H, 15M, 5M).' };
    }

    const primaryTf = snapshot.timeframes['1h'];
    const setup = primaryTf.setup;

    if (!setup || setup.type === 'NO_SETUP' || !setup.isValid) {
      const t4h = snapshot.timeframes['4h']?.trend || 'N/A';
      const t1h = snapshot.timeframes['1h']?.trend || 'N/A';
      const t15m = snapshot.timeframes['15m']?.trend || 'N/A';
      const t5m = snapshot.timeframes['5m']?.trend || 'N/A';
      const mtfStr = `[4H=${t4h}, 1H=${t1h}, 15M=${t15m}, 5M=${t5m}]`;
      return { status: 'NO_TRADE', score: 0, reasoning: `${mtfStr} ${setup?.reasoning || 'No clear trade setup detected.'}` };
    }

    let score = 0;
    
    // 1. Structure (20)
    if (primaryTf.structure.trend === 'BULLISH' && setup.direction === 'LONG') score += 20;
    if (primaryTf.structure.trend === 'BEARISH' && setup.direction === 'SHORT') score += 20;

    // 2. MTF Alignment (20)
    if (snapshot.multiTimeframeAlignment === 'BULLISH' && setup.direction === 'LONG') score += 20;
    if (snapshot.multiTimeframeAlignment === 'BEARISH' && setup.direction === 'SHORT') score += 20;
    if (snapshot.multiTimeframeAlignment === 'CONFLICTING') score += 5; 

    // 3. Price Action (15)
    if (primaryTf.structure.breakout || primaryTf.structure.bos || primaryTf.structure.choch) score += 15;
    else score += 5; 

    // 4. Momentum (10)
    if (primaryTf.momentum === 'MOMENTUM_ACCELERATING') score += 10;
    if (primaryTf.momentum === 'MOMENTUM_STABLE') score += 5;

    // 5. Volume (10)
    if (primaryTf.volumeCondition === 'VOLUME_EXPANSION' || primaryTf.volumeCondition === 'VOLUME_BREAKOUT') score += 10;
    
    const tradePlan = this.calculateTradePlan(primaryTf, setup, snapshot.market.price);
    
    if (!tradePlan) {
      return { status: 'NO_TRADE', score, reasoning: 'Failed to generate a valid trade plan due to invalid risk/reward or missing levels.' };
    }
    
    if (tradePlan.riskRewardRatio < 2.0) {
      return { status: 'NO_TRADE', score, reasoning: `Rejected: R:R ratio is too low (${tradePlan.riskRewardRatio.toFixed(2)}). Minimum required is 1:2.` };
    } else {
      score += 20; // 10 for S/R clarity, 10 for R:R
    }

    if (primaryTf.volatility.level !== 'EXTREME' && primaryTf.volumeCondition !== 'LOW_VOLUME') score += 5;

    let deterministicStatus: 'TRADE_READY' | 'WAIT' | 'NO_TRADE' = 'WAIT';
    let reasoning = `Setup ${setup.type} detected but requires more confirmation (Score: ${score}).`;

    if (score >= 80) {
       deterministicStatus = 'TRADE_READY';
       reasoning = `Strong ${setup.direction} setup detected (${setup.type}) with valid R:R (Score: ${score}).`;
    } else if (score >= 60) {
       deterministicStatus = 'WAIT';
       reasoning = `Valid ${setup.direction} setup detected (${setup.type}). Waiting for further confirmation (Score: ${score}).`;
    } else {
       deterministicStatus = 'NO_TRADE';
       reasoning = `Weak structural alignment for ${setup.type} (Score: ${score}).`;
    }

    if (aiConsensus) {
      if (aiConsensus.status === 'AI_UNAVAILABLE' || aiConsensus.status === 'ANALYSIS_FAILED') {
         if (deterministicStatus === 'TRADE_READY' || deterministicStatus === 'WAIT') {
             return { status: 'AI_UNAVAILABLE', score, reasoning: `Deterministic setup found (${score}), but AI analysis is unavailable for risk challenge.` };
         }
         return { status: 'AI_UNAVAILABLE', score, reasoning: 'AI Unavailable.' };
      }

      if (aiConsensus.decision === 'NO_TRADE' || aiConsensus.decision === 'WATCH') {
         if (deterministicStatus === 'TRADE_READY') deterministicStatus = 'WAIT';
         reasoning = `AI Consensus downgraded to ${aiConsensus.decision} due to: ${aiConsensus.reasoning} (Base Score: ${score})`;
      }
      
      if (aiConsensus.decision === 'CANDIDATE_TRADE' && deterministicStatus === 'TRADE_READY') {
         reasoning = `Deterministic & AI Consensus ALIGNED for ${setup.direction} (Score: ${score}). AI Reasoning: ${aiConsensus.reasoning}`;
      }
    }

    return { status: deterministicStatus, score, reasoning };
  },

  calculateTradePlan(primaryTf: TimeframeAnalysis, setup: TradeSetup, currentPrice: number): TradePlan | null {
    if (!setup || setup.type === 'NO_SETUP' || !setup.isValid || currentPrice <= 0) return null;

    const entry = currentPrice;
    const atr = primaryTf.volatility?.atr || entry * 0.02; 
    
    let stopLoss = 0, tp1 = 0, tp2 = 0, tp3 = 0, nextLevelPrice = 0;

    if (setup.direction === 'LONG') {
      const support = primaryTf.support.find(s => s.price < entry) || { price: entry - (atr * 2), type: 'support', strength: 1, touches: 0, distancePercent: 0 };
      stopLoss = support.price - (atr * 0.5); 
      if (entry - stopLoss < atr) stopLoss = entry - (atr * 1.5); 
      
      const resistance = primaryTf.resistance.find(r => r.price > entry);
      if (resistance) nextLevelPrice = resistance.price;
      
      const risk = entry - stopLoss;
      tp1 = entry + (risk * 1.5);
      tp2 = entry + (risk * 2.5);
      tp3 = entry + (risk * 4.0);
      
      if (nextLevelPrice > 0 && nextLevelPrice < tp2) tp2 = nextLevelPrice - (atr * 0.2);
    } else {
      const resistance = primaryTf.resistance.find(r => r.price > entry) || { price: entry + (atr * 2), type: 'resistance', strength: 1, touches: 0, distancePercent: 0 };
      stopLoss = resistance.price + (atr * 0.5); 
      if (stopLoss - entry < atr) stopLoss = entry + (atr * 1.5);

      const support = primaryTf.support.find(s => s.price < entry);
      if (support) nextLevelPrice = support.price;

      const risk = stopLoss - entry;
      tp1 = entry - (risk * 1.5);
      tp2 = entry - (risk * 2.5);
      tp3 = entry - (risk * 4.0);
      
      if (nextLevelPrice > 0 && nextLevelPrice > tp2) tp2 = nextLevelPrice + (atr * 0.2);
    }

    const risk = Math.abs(entry - stopLoss);
    const reward = Math.abs(tp2 - entry); 
    const riskRewardRatio = risk > 0 ? reward / risk : 0;

    return { entry, stopLoss, tp1, tp2, tp3, risk, reward, riskRewardRatio, invalidationLevel: stopLoss };
  }
};
