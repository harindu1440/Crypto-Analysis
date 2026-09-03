import { TechnicalAnalysisSnapshot, DeterministicScreeningResult, MarketRegime } from './types';
import { TradeSetupDetector } from './tradeSetupDetector';
import { TradeDecisionEngine } from './tradeDecisionEngine';

export const DeterministicMarketScreeningEngine = {
  screen(snapshot: TechnicalAnalysisSnapshot, snapshotId: string): DeterministicScreeningResult {
    const defaultResult: DeterministicScreeningResult = {
      symbol: snapshot.symbol,
      snapshotId,
      timestamp: snapshot.timestamp,
      marketRegime: snapshot.overallRegime || 'UNCLEAR',
      trend: {
        htf4h: snapshot.timeframes['4h']?.trend || 'NEUTRAL',
        htf1h: snapshot.timeframes['1h']?.trend || 'NEUTRAL',
        mtf15m: snapshot.timeframes['15m']?.trend || 'NEUTRAL',
        entry5m: snapshot.timeframes['5m']?.trend || 'NEUTRAL',
        alignmentScore: 0
      },
      technicalScore: 0,
      momentumScore: 0,
      volumeScore: 0,
      structureScore: 0,
      liquidityScore: 0,
      candidateTrade: {
        side: 'NONE',
        setupType: 'NO_SETUP',
        valid: false,
        reason: 'Insufficient data'
      },
      status: 'INSUFFICIENT_DATA'
    };

    if (!snapshot || !snapshot.timeframes['1h']) {
      return defaultResult;
    }

    const primaryTf = snapshot.timeframes['1h'];
    const setup = primaryTf.setup;

    // Calculate scores (Max 100)
    let structureScore = 0;
    let alignmentScore = 0;
    let momentumScore = 0;
    let volumeScore = 0;
    let liquidityScore = 5; // Default 5 if minimal volume is met
    let technicalScore = 0;

    if (primaryTf.structure === 'BULLISH' && setup?.direction === 'LONG') structureScore = 20;
    if (primaryTf.structure === 'BEARISH' && setup?.direction === 'SHORT') structureScore = 20;

    if (snapshot.multiTimeframeAlignment === 'BULLISH' && setup?.direction === 'LONG') alignmentScore = 20;
    if (snapshot.multiTimeframeAlignment === 'BEARISH' && setup?.direction === 'SHORT') alignmentScore = 20;
    if (snapshot.multiTimeframeAlignment === 'CONFLICTING') alignmentScore = 5;

    if (primaryTf.momentum === 'MOMENTUM_ACCELERATING') momentumScore = 10;
    if (primaryTf.momentum === 'MOMENTUM_STABLE') momentumScore = 5;

    if (primaryTf.volumeCondition === 'VOLUME_EXPANSION' || primaryTf.volumeCondition === 'VOLUME_BREAKOUT') volumeScore = 10;
    if (primaryTf.volumeCondition === 'NORMAL_VOLUME') volumeScore = 5;

    // Evaluate Support / Resistance room etc inside technicalScore
    technicalScore = structureScore + alignmentScore + momentumScore + volumeScore + liquidityScore;

    defaultResult.trend.alignmentScore = alignmentScore;
    defaultResult.structureScore = structureScore;
    defaultResult.momentumScore = momentumScore;
    defaultResult.volumeScore = volumeScore;
    defaultResult.liquidityScore = liquidityScore;
    defaultResult.technicalScore = technicalScore;

    if (!setup || setup.type === 'NO_SETUP' || !setup.isValid) {
      defaultResult.status = 'NO_TRADE';
      defaultResult.candidateTrade.reason = 'No valid trade setup detected in current structure.';
      return defaultResult;
    }

    defaultResult.candidateTrade = {
      side: setup.direction === 'NEUTRAL' ? 'NONE' : setup.direction,
      setupType: setup.type,
      valid: setup.isValid,
      reason: setup.reasoning
    };

    if (technicalScore >= 75) {
      defaultResult.status = 'CANDIDATE';
    } else if (technicalScore >= 65) {
      defaultResult.status = 'WAIT';
    } else {
      defaultResult.status = 'NO_TRADE';
    }

    // Now calculate the deterministic TradePlan
    const tradePlan = TradeDecisionEngine.calculateTradePlan(primaryTf, setup);
    if (tradePlan) {
      defaultResult.tradePlan = tradePlan;
      if (tradePlan.riskRewardRatio < 2) {
         defaultResult.status = 'WAIT';
         defaultResult.candidateTrade.reason = 'Risk/Reward ratio is below minimum threshold (1:2).';
         defaultResult.candidateTrade.valid = false;
      }
    }

    return defaultResult;
  }
};
