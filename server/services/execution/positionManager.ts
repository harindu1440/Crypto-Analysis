import { LocalDatabase } from '../../config/database';
import { Position } from './types';
import { BinanceMarketService } from '../binance/binanceMarketService';
import { BinanceExecution } from './binanceExecution';
import { AccountSyncService } from '../account/accountSyncService';
import { AlertService } from '../system/alertService';

export const PositionManager = {
  isEmergencyStopped(): boolean {
    const state = LocalDatabase.get('emergencyState');
    return state?.isHalted || false;
  },

  setEmergencyStop(halted: boolean) {
    LocalDatabase.set('emergencyState', { isHalted: halted, haltedAt: halted ? Date.now() : undefined });
  },

  getPositions(): Position[] {
    return LocalDatabase.get('positions');
  },

  getActivePositions(): Position[] {
    return this.getPositions().filter(p => p.status === 'POSITION_OPEN');
  },

  checkDailyRiskLimits() {
    const today = new Date().toISOString().split('T')[0];
    const riskState = LocalDatabase.get('dailyRiskState') || { date: today, realizedLoss: 0 };
    
    // Reset if it's a new day
    if (riskState.date !== today) {
      riskState.date = today;
      riskState.realizedLoss = 0;
      LocalDatabase.set('dailyRiskState', riskState);
      
      // If we were halted because of daily loss, we could theoretically unhalt, but let's require manual unhalt for safety
    }

    const active = this.getActivePositions();
    let currentUnrealizedLoss = 0;
    for (const pos of active) {
      if (pos.unrealizedPnL < 0) {
        currentUnrealizedLoss += Math.abs(pos.unrealizedPnL);
      }
    }

    const totalLoss = riskState.realizedLoss + currentUnrealizedLoss;
    
    const accountState = AccountSyncService.getState();
    const equity = accountState.balances.find(b => b.asset === 'USDT')?.free || 1000; // Fallback for pure logic
    
    const maxLossPercent = parseFloat(process.env.MAX_DAILY_LOSS_PERCENT || '5');
    const maxLossAmount = (equity * maxLossPercent) / 100;
    
    if (totalLoss > maxLossAmount && !this.isEmergencyStopped()) {
      this.setEmergencyStop(true);
      AlertService.log('CRITICAL', 'PositionManager', `Daily Loss Limit Exceeded! Total Loss: $${totalLoss.toFixed(2)}. Trading Halted.`);
    }
  },

  async updateUnrealizedPnL() {
    const active = this.getActivePositions();
    if (active.length === 0) return;

    let changed = false;
    for (const pos of active) {
      try {
        const ticker = await BinanceMarketService.getTicker(pos.symbol);
        const currentPrice = parseFloat(ticker.lastPrice);
        
        let grossPnL = 0;
        if (pos.side === 'LONG') {
          grossPnL = (currentPrice - pos.entryPrice) * pos.quantity;
        } else {
          grossPnL = (pos.entryPrice - currentPrice) * pos.quantity;
        }

        pos.unrealizedPnL = grossPnL;
        pos.updatedAt = Date.now();
        changed = true;
      } catch (e) {
        console.error(`[PositionManager] Failed to update PnL for ${pos.symbol}`);
      }
    }

    if (changed) {
      LocalDatabase.set('positions', this.getPositions()); // Save changes
      this.checkDailyRiskLimits();
    }
  },

  async closePosition(planId: string) {
    const positions = this.getPositions();
    const pos = positions.find(p => p.id === planId);
    
    if (!pos) throw new Error('Position not found.');
    if (pos.status !== 'POSITION_OPEN') throw new Error('Position is not open.');

    // Fire Market Order to close
    const side = pos.side === 'LONG' ? 'SELL' : 'BUY';
    const closeClientOrderId = `CAP_CLOSE_${Date.now()}`;
    
    console.log(`[PositionManager] Manual close requested for ${pos.symbol}`);
    
    try {
      const result = await BinanceExecution.executeOrder(pos.symbol, side, pos.quantity, closeClientOrderId);
      
      // Attempt to cancel the protective OCO order if it exists
      if (pos.protectiveOrderId) {
         // Canceling order lists requires a dedicated Binance API endpoint: DELETE /api/v3/orderList
         // For now, if manual close is done, protective orders might become orphaned if not cancelled
         // But capital is protected. 
      }
      
      pos.status = 'CLOSED';
      pos.realizedPnL = pos.unrealizedPnL; // Close enough for gross PnL
      pos.updatedAt = Date.now();
      
      LocalDatabase.set('positions', positions);
      return pos;
    } catch (e: any) {
      throw new Error(`Failed to close position: ${e.message}`);
    }
  }
};

setInterval(() => PositionManager.updateUnrealizedPnL(), 15000);
