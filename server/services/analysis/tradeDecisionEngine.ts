import { TechnicalAnalysisSnapshot, TradeSetup, TradePlan, TimeframeAnalysis } from './types';
import { MasterDecisionOutput } from '../ai/schemas/types';

export const TradeDecisionEngine = {
  evaluate(
    snapshot: TechnicalAnalysisSnapshot,
    aiConsensus?: MasterDecisionOutput
  ): {
    status: 'TRADE_READY' | 'WAIT' | 'NO_TRADE' | 'AI_UNAVAILABLE' | 'INSUFFICIENT_DATA',
    scores: {
      total: number,
      structure: number,
      mtf: number,
      priceAction: number,
      momentum: number,
      volume: number,
      supportResistance: number,
      riskReward: number,
      liquidity: number
    },
    blockingConditions: string[],
    reasoning: string
  } {
    const scores = { total: 0, structure: 0, mtf: 0, priceAction: 0, momentum: 0, volume: 0, supportResistance: 0, riskReward: 0, liquidity: 0 };
    const blockingConditions: string[] = [];

    if (!snapshot || !snapshot.timeframes['1h'] || !snapshot.timeframes['4h'] || !snapshot.timeframes['15m'] || !snapshot.timeframes['5m']) {
      blockingConditions.push('Missing required timeframe data (4H, 1H, 15M, 5M).');
      return { status: 'INSUFFICIENT_DATA', scores, blockingConditions, reasoning: blockingConditions[0] };
    }

    const primaryTf = snapshot.timeframes['1h'];
    const setup = primaryTf.setup;

    if (!setup || setup.type === 'NO_SETUP' || !setup.isValid) {
      const t4h = snapshot.timeframes['4h']?.trend || 'N/A';
      const t1h = snapshot.timeframes['1h']?.trend || 'N/A';
      const t15m = snapshot.timeframes['15m']?.trend || 'N/A';
      const t5m = snapshot.timeframes['5m']?.trend || 'N/A';
      blockingConditions.push(`4H trend is ${t4h}`);
      blockingConditions.push(`1H trend is ${t1h}`);
      if (setup?.reasoning) blockingConditions.push(setup.reasoning);
      return { status: 'NO_TRADE', scores, blockingConditions, reasoning: setup?.reasoning || 'No clear trade setup detected.' };
    }

    // 1. Structure (20)
    if (primaryTf.structure.trend === 'BULLISH' && setup.direction === 'LONG') scores.structure = 20;
    else if (primaryTf.structure.trend === 'BEARISH' && setup.direction === 'SHORT') scores.structure = 20;
    else blockingConditions.push(`Primary 1H trend (${primaryTf.structure.trend}) does not align with setup direction (${setup.direction}).`);

    // 2. MTF Alignment (20)
    if (snapshot.multiTimeframeAlignment === 'BULLISH' && setup.direction === 'LONG') scores.mtf = 20;
    else if (snapshot.multiTimeframeAlignment === 'BEARISH' && setup.direction === 'SHORT') scores.mtf = 20;
    else if (snapshot.multiTimeframeAlignment === 'CONFLICTING') {
      scores.mtf = 5; 
      blockingConditions.push('MTF Alignment is CONFLICTING.');
    } else {
      blockingConditions.push('MTF Alignment does not support setup direction.');
    }

    // 3. Price Action (15)
    if (primaryTf.structure.breakout || primaryTf.structure.bos || primaryTf.structure.choch) scores.priceAction = 15;
    else {
      scores.priceAction = 5; 
      blockingConditions.push('No recent BOS/CHoCH/Breakout.');
    }

    // 4. Momentum (10)
    if (primaryTf.momentum === 'MOMENTUM_ACCELERATING') scores.momentum = 10;
    else if (primaryTf.momentum === 'MOMENTUM_STABLE') scores.momentum = 5;
    else blockingConditions.push(`Momentum is ${primaryTf.momentum}.`);

    // 5. Volume (10)
    if (primaryTf.volumeCondition === 'VOLUME_EXPANSION' || primaryTf.volumeCondition === 'VOLUME_BREAKOUT') scores.volume = 10;
    else blockingConditions.push(`Volume condition is ${primaryTf.volumeCondition}.`);
    
    // 6. Liquidity (5)
    if (primaryTf.volatility.level !== 'EXTREME' && primaryTf.volumeCondition !== 'LOW_VOLUME') scores.liquidity = 5;
    else blockingConditions.push('Market liquidity/volatility is unfavorable.');

    const tradePlan = this.calculateTradePlan(primaryTf, setup, snapshot.market.price);
    
    if (!tradePlan) {
      blockingConditions.push('Failed to generate a valid trade plan due to invalid risk/reward or missing levels.');
      scores.total = Object.values(scores).reduce((a, b) => a + b, 0);
      return { status: 'NO_TRADE', scores, blockingConditions, reasoning: blockingConditions[blockingConditions.length - 1] };
    }
    
    if (tradePlan.riskRewardRatio < 2.0) {
      blockingConditions.push(`Rejected: R:R ratio is too low (${tradePlan.riskRewardRatio.toFixed(2)}). Minimum required is 1:2.`);
    } else {
      scores.supportResistance = 10;
      scores.riskReward = 10;
    }

    scores.total = Object.values(scores).reduce((a, b) => a + b, 0);

    let deterministicStatus: 'TRADE_READY' | 'WAIT' | 'NO_TRADE' = 'WAIT';
    let reasoning = `Setup ${setup.type} detected but requires more confirmation (Score: ${scores.total}).`;

    if (scores.total >= 80 && blockingConditions.length === 0) {
       deterministicStatus = 'TRADE_READY';
       reasoning = `Strong ${setup.direction} setup detected (${setup.type}) with valid R:R (Score: ${scores.total}).`;
    } else if (scores.total >= 60) {
       deterministicStatus = 'WAIT';
       reasoning = `Valid ${setup.direction} setup detected (${setup.type}). Waiting for further confirmation (Score: ${scores.total}).`;
    } else {
       deterministicStatus = 'NO_TRADE';
       reasoning = `Weak structural alignment for ${setup.type} (Score: ${scores.total}).`;
    }

    if (aiConsensus) {
      if (aiConsensus.status === 'AI_UNAVAILABLE' || aiConsensus.status === 'ANALYSIS_FAILED') {
         if (deterministicStatus === 'TRADE_READY' || deterministicStatus === 'WAIT') {
             return { status: 'AI_UNAVAILABLE', scores, blockingConditions, reasoning: `Deterministic setup found (${scores.total}), but AI analysis is unavailable for risk challenge.` };
         }
         return { status: 'AI_UNAVAILABLE', scores, blockingConditions, reasoning: 'AI Unavailable.' };
      }

      if (aiConsensus.decision === 'NO_TRADE' || aiConsensus.decision === 'WATCH') {
         if (deterministicStatus === 'TRADE_READY') deterministicStatus = 'WAIT';
         reasoning = `AI Consensus downgraded to ${aiConsensus.decision} due to: ${aiConsensus.reasoning} (Base Score: ${scores.total})`;
      }
      
      if (aiConsensus.decision === 'CANDIDATE_TRADE' && deterministicStatus === 'TRADE_READY') {
         reasoning = `Deterministic & AI Consensus ALIGNED for ${setup.direction} (Score: ${scores.total}). AI Reasoning: ${aiConsensus.reasoning}`;
      }
    }

    return { status: deterministicStatus, scores, blockingConditions, reasoning };
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
