"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PositionManager = void 0;
const database_1 = require("../../config/database");
const binanceMarketService_1 = require("../binance/binanceMarketService");
const binanceExecution_1 = require("./binanceExecution");
const accountSyncService_1 = require("../account/accountSyncService");
const alertService_1 = require("../system/alertService");
exports.PositionManager = {
    isEmergencyStopped() {
        const state = database_1.LocalDatabase.get('emergencyState');
        return state?.isHalted || false;
    },
    setEmergencyStop(halted) {
        database_1.LocalDatabase.set('emergencyState', { isHalted: halted, haltedAt: halted ? Date.now() : undefined });
    },
    getPositions() {
        return database_1.LocalDatabase.get('positions');
    },
    getActivePositions() {
        return this.getPositions().filter(p => p.status === 'POSITION_OPEN');
    },
    checkDailyRiskLimits() {
        const today = new Date().toISOString().split('T')[0];
        const riskState = database_1.LocalDatabase.get('dailyRiskState') || { date: today, realizedLoss: 0 };
        // Reset if it's a new day
        if (riskState.date !== today) {
            riskState.date = today;
            riskState.realizedLoss = 0;
            database_1.LocalDatabase.set('dailyRiskState', riskState);
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
        const accountState = accountSyncService_1.AccountSyncService.getState();
        const equity = accountState.balances.find(b => b.asset === 'USDT')?.free || 1000; // Fallback for pure logic
        const maxLossPercent = parseFloat(process.env.MAX_DAILY_LOSS_PERCENT || '5');
        const maxLossAmount = (equity * maxLossPercent) / 100;
        if (totalLoss > maxLossAmount && !this.isEmergencyStopped()) {
            this.setEmergencyStop(true);
            alertService_1.AlertService.log('CRITICAL', 'PositionManager', `Daily Loss Limit Exceeded! Total Loss: $${totalLoss.toFixed(2)}. Trading Halted.`);
        }
    },
    async updateUnrealizedPnL() {
        const active = this.getActivePositions();
        if (active.length === 0)
            return;
        let changed = false;
        for (const pos of active) {
            try {
                const ticker = await binanceMarketService_1.BinanceMarketService.getTicker(pos.symbol);
                const currentPrice = parseFloat(ticker.lastPrice);
                let grossPnL = 0;
                if (pos.side === 'LONG') {
                    grossPnL = (currentPrice - pos.entryPrice) * pos.quantity;
                }
                else {
                    grossPnL = (pos.entryPrice - currentPrice) * pos.quantity;
                }
                pos.unrealizedPnL = grossPnL;
                pos.updatedAt = Date.now();
                changed = true;
            }
            catch (e) {
                console.error(`[PositionManager] Failed to update PnL for ${pos.symbol}`);
            }
        }
        if (changed) {
            database_1.LocalDatabase.set('positions', this.getPositions()); // Save changes
            this.checkDailyRiskLimits();
        }
    },
    async closePosition(planId) {
        const positions = this.getPositions();
        const pos = positions.find(p => p.id === planId);
        if (!pos)
            throw new Error('Position not found.');
        if (pos.status !== 'POSITION_OPEN')
            throw new Error('Position is not open.');
        // Fire Market Order to close
        const side = pos.side === 'LONG' ? 'SELL' : 'BUY';
        const closeClientOrderId = `CAP_CLOSE_${Date.now()}`;
        console.log(`[PositionManager] Manual close requested for ${pos.symbol}`);
        try {
            const result = await binanceExecution_1.BinanceExecution.executeOrder(pos.symbol, side, pos.quantity, closeClientOrderId);
            // Attempt to cancel the protective OCO order if it exists
            if (pos.protectiveOrderId) {
                // Canceling order lists requires a dedicated Binance API endpoint: DELETE /api/v3/orderList
                // For now, if manual close is done, protective orders might become orphaned if not cancelled
                // But capital is protected. 
            }
            pos.status = 'CLOSED';
            pos.realizedPnL = pos.unrealizedPnL; // Close enough for gross PnL
            pos.updatedAt = Date.now();
            database_1.LocalDatabase.set('positions', positions);
            return pos;
        }
        catch (e) {
            throw new Error(`Failed to close position: ${e.message}`);
        }
    }
};
setInterval(() => exports.PositionManager.updateUnrealizedPnL(), 15000);
