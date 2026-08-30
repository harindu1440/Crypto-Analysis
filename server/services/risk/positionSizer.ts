import { TradeSide } from '../ai/schemas/types';
import { UserRiskSettings } from './types';

export const PositionSizer = {
  calculatePosition(
    side: TradeSide,
    entryPrice: number,
    stopLoss: number,
    settings: UserRiskSettings
  ) {
    if (entryPrice <= 0 || stopLoss <= 0 || entryPrice === stopLoss) {
      throw new Error('Invalid entry or stop loss for position sizing.');
    }

    const riskAmount = settings.accountEquity * (settings.riskPerTradePercent / 100);
    const stopDistance = Math.abs(entryPrice - stopLoss);
    
    // Position Size = Risk Amount / Stop Distance
    const quantity = riskAmount / stopDistance;
    const notionalValue = quantity * entryPrice;

    return {
      riskAmount,
      stopDistance,
      quantity,
      notionalValue
    };
  },

  calculateReward(
    side: TradeSide,
    entryPrice: number,
    takeProfit: number
  ) {
    if (side === 'LONG' && takeProfit <= entryPrice) return 0;
    if (side === 'SHORT' && takeProfit >= entryPrice) return 0;
    return Math.abs(takeProfit - entryPrice);
  }
};
