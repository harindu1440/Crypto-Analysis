import { TechnicalAnalysisSnapshot, TradeSetup, TradePlan, TimeframeAnalysis } from './types';
import { MasterDecisionOutput } from '../ai/schemas/types';

export const TradeDecisionEngine = {
  evaluate(
    snapshot: TechnicalAnalysisSnapshot,
    aiConsensus?: MasterDecisionOutput // Make it optional for fallback states where AI is unavailable
  ): {
    status: 'TRADE_READY' | 'WAIT' | 'NO_TRADE' | 'AI_UNAVAILABLE' | 'INSUFFICIENT_DATA',
    score: number,
    reasoning: string
  } {
    if (!snapshot || !snapshot.timeframes['1h']) {
      return { status: 'INSUFFICIENT_DATA', score: 0, reasoning: 'Missing minimum 1h timeframe data.' };
    }

    const primaryTf = snapshot.timeframes['1h'];
    const setup = primaryTf.setup;

    if (!setup || setup.type === 'NO_SETUP' || !setup.isValid) {
      return { status: 'NO_TRADE', score: 20, reasoning: 'No valid trade setup detected in current structure.' };
    }

    // Base score calculation
    let score = 0;
    
    // 1. Market Structure (20)
    if (primaryTf.structure === 'BULLISH' && setup.direction === 'LONG') score += 20;
    if (primaryTf.structure === 'BEARISH' && setup.direction === 'SHORT') score += 20;

    // 2. Multi-Timeframe (20)
    if (snapshot.multiTimeframeAlignment === 'BULLISH' && setup.direction === 'LONG') score += 20;
    if (snapshot.multiTimeframeAlignment === 'BEARISH' && setup.direction === 'SHORT') score += 20;
    if (snapshot.multiTimeframeAlignment === 'CONFLICTING') score += 5; // Partial points

    // 3. Momentum (10)
    if (primaryTf.momentum === 'MOMENTUM_ACCELERATING') score += 10;
    if (primaryTf.momentum === 'MOMENTUM_STABLE') score += 5;

    // 4. Volume (10)
    if (primaryTf.volumeCondition === 'VOLUME_EXPANSION' || primaryTf.volumeCondition === 'VOLUME_BREAKOUT') score += 10;
    
    // 5. Market Regime bonus (10)
    if (snapshot.overallRegime === 'STRONG_BULLISH' && setup.direction === 'LONG') score += 10;
    if (snapshot.overallRegime === 'STRONG_BEARISH' && setup.direction === 'SHORT') score += 10;
    
    // Evaluate status based on deterministic score first
    let deterministicStatus: 'TRADE_READY' | 'WAIT' | 'NO_TRADE' = 'WAIT';
    let reasoning = `Setup ${setup.type} detected but requires more confirmation (Score: ${score}).`;

    if (score >= 65) {
       // Wait / Confirmation needed
       deterministicStatus = 'WAIT';
       reasoning = `Valid ${setup.direction} setup detected (${setup.type}). Waiting for further confirmation (Score: ${score}).`;
    }
    
    if (score >= 75) {
       deterministicStatus = 'TRADE_READY';
       reasoning = `Strong ${setup.direction} setup detected (${setup.type}) with high confidence (Score: ${score}).`;
    }

    if (score < 50) {
      deterministicStatus = 'NO_TRADE';
      reasoning = `Weak structural alignment for ${setup.type} (Score: ${score}).`;
    }

    // Now factor in AI if it ran
    if (aiConsensus) {
      if (aiConsensus.status === 'AI_UNAVAILABLE' || aiConsensus.status === 'ANALYSIS_FAILED') {
         // If deterministic engine says it's ready but AI is down, we must NOT trade. We must return AI_UNAVAILABLE
         if (deterministicStatus === 'TRADE_READY' || deterministicStatus === 'WAIT') {
             return { status: 'AI_UNAVAILABLE', score, reasoning: `Deterministic setup found (${score}), but AI analysis is unavailable for risk challenge.` };
         }
         return { status: 'AI_UNAVAILABLE', score, reasoning: 'AI Unavailable.' };
      }

      // If AI specifically rejects the trade (e.g. Risk Challenger veto)
      if (aiConsensus.decision === 'NO_TRADE' || aiConsensus.decision === 'WATCH') {
         // Downgrade status based on AI veto
         if (deterministicStatus === 'TRADE_READY') deterministicStatus = 'WAIT';
         reasoning = `AI Consensus downgraded to ${aiConsensus.decision} due to: ${aiConsensus.reasoning} (Base Score: ${score})`;
      }
      
      // If AI approves and deterministic approves
      if (aiConsensus.decision === 'CANDIDATE_TRADE' && deterministicStatus === 'TRADE_READY') {
         reasoning = `Deterministic & AI Consensus ALIGNED for ${setup.direction} (Score: ${score}). AI Reasoning: ${aiConsensus.reasoning}`;
      }
    }

    return {
      status: deterministicStatus,
      score,
      reasoning
    };
  },

  calculateTradePlan(primaryTf: TimeframeAnalysis, setup: TradeSetup): TradePlan | null {
    if (!setup || setup.type === 'NO_SETUP' || !setup.isValid) return null;

    const currentPrice = primaryTf.indicators.sma?.[20] || 0; // fallback to a known value if price not directly on TimeframeAnalysis
    // Wait, TimeframeAnalysis has no current price directly on it. Let's use the closest support/resistance or assume entry is current price.
    // Actually, snapshot has market.price. Let's adjust signature to take currentPrice, or extract from swing points.
    // The closest swing point is the most recent.
    let entry = 0;
    if (primaryTf.swingPoints && primaryTf.swingPoints.length > 0) {
      entry = primaryTf.swingPoints[primaryTf.swingPoints.length - 1].price;
    }

    // Default ATR
    const atr = primaryTf.volatility?.atr || entry * 0.02; 
    
    if (entry === 0) return null;

    let stopLoss = 0;
    let tp1 = 0, tp2 = 0, tp3 = 0;

    if (setup.direction === 'LONG') {
      // Find nearest support
      const support = primaryTf.support.find(s => s.price < entry) || { price: entry - (atr * 2) };
      stopLoss = support.price - (atr * 0.5); // buffer below support
      if (entry - stopLoss < atr) stopLoss = entry - (atr * 1.5); // Enforce minimum distance
      
      const risk = entry - stopLoss;
      tp1 = entry + (risk * 1.5);
      tp2 = entry + (risk * 2.5);
      tp3 = entry + (risk * 4.0);
    } else {
      // Find nearest resistance
      const resistance = primaryTf.resistance.find(r => r.price > entry) || { price: entry + (atr * 2) };
      stopLoss = resistance.price + (atr * 0.5); // buffer above resistance
      if (stopLoss - entry < atr) stopLoss = entry + (atr * 1.5);

      const risk = stopLoss - entry;
      tp1 = entry - (risk * 1.5);
      tp2 = entry - (risk * 2.5);
      tp3 = entry - (risk * 4.0);
    }

    const risk = Math.abs(entry - stopLoss);
    const reward = Math.abs(tp2 - entry); // Calculate default R:R against TP2

    return {
      entry,
      stopLoss,
      tp1,
      tp2,
      tp3,
      risk,
      reward,
      riskRewardRatio: risk > 0 ? reward / risk : 0,
      invalidationLevel: stopLoss
    };
  }
};
