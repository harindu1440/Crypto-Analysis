"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BacktestEngine = void 0;
const historicalDataService_1 = require("./historicalDataService");
exports.BacktestEngine = {
    async runBacktest(opportunity, feeRate = 0.001, slippage = 0.001) {
        const symbol = opportunity.symbol;
        const interval = opportunity.timeframe; // '15m', '1h', etc.
        const start = opportunity.createdAt;
        const end = opportunity.expiresAt + (7 * 24 * 60 * 60 * 1000); // Fetch up to 7 days past expiration
        const data = await historicalDataService_1.HistoricalDataService.getHistoricalData(symbol, interval, start, end);
        let state = null;
        let entryTime;
        let exitTime;
        let rMultiple = 0;
        let entered = false;
        let actualEntryPrice = 0;
        // We assume risk amount is 1R.
        // If we win, R is calculated. If loss, R is -1.
        // Calculate slippage adjustments
        const applySlippage = (price, isBuy) => isBuy ? price * (1 + slippage) : price * (1 - slippage);
        for (const candle of data) {
            // 1. Check for expiration if not entered
            if (!entered && candle.time >= opportunity.expiresAt) {
                state = 'EXPIRED';
                exitTime = candle.time;
                break;
            }
            // 2. Check for invalidation if not entered
            // For simplicity, if price hits SL before entry zone, it's invalidated
            if (!entered) {
                const hitSL = opportunity.direction === 'LONG'
                    ? candle.low <= opportunity.stopLoss
                    : candle.high >= opportunity.stopLoss;
                if (hitSL) {
                    state = 'INVALIDATED';
                    exitTime = candle.time;
                    break;
                }
            }
            // 3. Check for Entry
            if (!entered) {
                const inZone = opportunity.direction === 'LONG'
                    ? (candle.low <= opportunity.entryZone.max) // Price dipped into or below top of entry zone
                    : (candle.high >= opportunity.entryZone.min); // Price pushed into or above bottom of entry zone
                if (inZone) {
                    entered = true;
                    entryTime = candle.time;
                    // Assume entry at the boundary we hit, plus slippage
                    actualEntryPrice = opportunity.direction === 'LONG' ? opportunity.entryZone.max : opportunity.entryZone.min;
                    actualEntryPrice = applySlippage(actualEntryPrice, opportunity.direction === 'LONG');
                    // Check if it immediately hit SL in the same candle
                    const immediateSL = opportunity.direction === 'LONG' ? candle.low <= opportunity.stopLoss : candle.high >= opportunity.stopLoss;
                    const immediateTP = opportunity.direction === 'LONG' ? candle.high >= opportunity.takeProfitTargets[0] : candle.low <= opportunity.takeProfitTargets[0];
                    if (immediateSL && immediateTP) {
                        state = 'AMBIGUOUS'; // We don't know which hit first in this timeframe
                        exitTime = candle.time;
                        break;
                    }
                    else if (immediateSL) {
                        state = 'LOSS';
                        rMultiple = -1;
                        exitTime = candle.time;
                        break;
                    }
                    else if (immediateTP) {
                        state = 'WIN';
                        const tpPrice = applySlippage(opportunity.takeProfitTargets[0], opportunity.direction === 'SHORT');
                        rMultiple = Math.abs((tpPrice - actualEntryPrice) / (actualEntryPrice - opportunity.stopLoss));
                        rMultiple -= (feeRate * 2); // approximate round trip fees in R
                        exitTime = candle.time;
                        break;
                    }
                    continue; // Move to next candle after entry
                }
            }
            // 4. Manage open position
            if (entered) {
                const hitSL = opportunity.direction === 'LONG' ? candle.low <= opportunity.stopLoss : candle.high >= opportunity.stopLoss;
                const hitTP = opportunity.direction === 'LONG' ? candle.high >= opportunity.takeProfitTargets[0] : candle.low <= opportunity.takeProfitTargets[0];
                if (hitSL && hitTP) {
                    state = 'AMBIGUOUS';
                    exitTime = candle.time;
                    break;
                }
                else if (hitSL) {
                    state = 'LOSS';
                    rMultiple = -1 - (feeRate * 2);
                    exitTime = candle.time;
                    break;
                }
                else if (hitTP) {
                    state = 'WIN';
                    const tpPrice = applySlippage(opportunity.takeProfitTargets[0], opportunity.direction === 'SHORT');
                    const risk = Math.abs(actualEntryPrice - opportunity.stopLoss);
                    const reward = Math.abs(tpPrice - actualEntryPrice);
                    rMultiple = (reward / risk) - (feeRate * 2); // Approximate fee in R
                    exitTime = candle.time;
                    break;
                }
            }
        }
        if (!state) {
            state = entered ? 'EXPIRED' : 'NO_ENTRY'; // Time ran out
        }
        // Determine Consensus Score
        const consensus = opportunity.qualityBreakdown?.consensus ? Math.round((opportunity.qualityBreakdown.consensus / 100) * 5) : 3;
        return {
            id: `bt_${opportunity.id}`,
            opportunityId: opportunity.id,
            symbol: opportunity.symbol,
            direction: opportunity.direction,
            timeframe: opportunity.timeframe,
            marketRegime: opportunity.marketData?.volatility || 'RANGING',
            qualityScore: opportunity.qualityScore,
            aiConfidence: opportunity.confidence,
            agentConsensus: consensus,
            riskReward: opportunity.riskRewardRatio,
            entry: actualEntryPrice || opportunity.entryPrice,
            stopLoss: opportunity.stopLoss,
            takeProfit: opportunity.takeProfitTargets[0],
            createdAt: opportunity.createdAt,
            entryTime,
            exitTime,
            outcome: state,
            rMultiple: rMultiple || 0,
            duration: (entryTime && exitTime) ? (exitTime - entryTime) : undefined
        };
    }
};
