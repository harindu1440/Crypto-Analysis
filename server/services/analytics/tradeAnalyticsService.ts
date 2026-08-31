import { LocalDatabase } from '../../config/database';
import { Position } from '../execution/types';

export const TradeAnalyticsService = {
  getAnalytics() {
    const positions: Position[] = LocalDatabase.get('positions') || [];
    const closedPositions = positions.filter(p => p.status === 'CLOSED' || p.status === 'FAILED');

    let totalTrades = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let grossProfit = 0;
    let grossLoss = 0;

    for (const pos of closedPositions) {
      totalTrades++;
      if (pos.realizedPnL > 0) {
        winningTrades++;
        grossProfit += pos.realizedPnL;
      } else {
        losingTrades++;
        grossLoss += Math.abs(pos.realizedPnL);
      }
    }

    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const netPnL = grossProfit - grossLoss;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0);

    return {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate: winRate.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      grossLoss: grossLoss.toFixed(2),
      netPnL: netPnL.toFixed(2),
      profitFactor: profitFactor.toFixed(2)
    };
  },
  
  getEquityCurve() {
    const positions: Position[] = LocalDatabase.get('positions') || [];
    const closedPositions = positions.filter(p => p.status === 'CLOSED' || p.status === 'FAILED');
    
    // Sort chronologically
    closedPositions.sort((a, b) => a.updatedAt - b.updatedAt);
    
    const curve = [];
    let runningPnL = 0;
    
    for (const pos of closedPositions) {
      runningPnL += pos.realizedPnL;
      curve.push({
        timestamp: pos.updatedAt,
        symbol: pos.symbol,
        pnl: pos.realizedPnL,
        equity: runningPnL
      });
    }
    
    return curve;
  }
};
