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

    const decision = TradeDecisionEngine.evaluate(snapshot);
    const tradePlan = TradeDecisionEngine.calculateTradePlan(snapshot.timeframes['1h'], snapshot.timeframes['1h'].setup, snapshot.market.price);

    defaultResult.status = decision.status as 'WAIT' | 'NO_TRADE' | 'INSUFFICIENT_DATA' | 'CANDIDATE';
    if (decision.status === 'TRADE_READY') {
      defaultResult.status = 'CANDIDATE';
    }
    
    defaultResult.technicalScore = decision.score;
    defaultResult.candidateTrade.reason = decision.reasoning;
    defaultResult.candidateTrade.valid = decision.status === 'TRADE_READY' || decision.status === 'WAIT';
    defaultResult.candidateTrade.setupType = snapshot.timeframes['1h'].setup.type;
    defaultResult.candidateTrade.side = snapshot.timeframes['1h'].setup.direction === 'NEUTRAL' ? 'NONE' : snapshot.timeframes['1h'].setup.direction;

    if (tradePlan) {
      defaultResult.tradePlan = tradePlan;
    }

    return defaultResult;
  }
};
