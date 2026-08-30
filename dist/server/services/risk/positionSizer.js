"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PositionSizer = void 0;
exports.PositionSizer = {
    calculatePosition(side, entryPrice, stopLoss, settings) {
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
    calculateReward(side, entryPrice, takeProfit) {
        if (side === 'LONG' && takeProfit <= entryPrice)
            return 0;
        if (side === 'SHORT' && takeProfit >= entryPrice)
            return 0;
        return Math.abs(takeProfit - entryPrice);
    }
};
