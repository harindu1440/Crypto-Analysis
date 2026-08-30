"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtectionService = void 0;
const binanceExecution_1 = require("./binanceExecution");
const database_1 = require("../../config/database");
const executionScheduler_1 = require("./executionScheduler");
const executionService_1 = require("./executionService");
exports.ProtectionService = {
    isProcessing: false,
    async processPendingProtections() {
        if (this.isProcessing)
            return;
        this.isProcessing = true;
        try {
            const states = executionScheduler_1.ExecutionScheduler.executionState;
            const plans = executionScheduler_1.ExecutionScheduler.scheduledPlans;
            let stateChanged = false;
            for (const [planId, state] of states.entries()) {
                if (state.status === 'ENTRY_FILLED') {
                    const plan = plans.get(planId);
                    if (!plan)
                        continue;
                    // Transition to PENDING so we don't double process
                    state.status = 'PROTECTION_PENDING';
                    stateChanged = true;
                    try {
                        // 1. Fetch the actual executed amount from the audit log
                        const audits = executionScheduler_1.ExecutionScheduler.getAuditLog(planId);
                        const entryAudit = audits.find(a => a.status === 'ENTRY_FILLED' || a.status === 'EXECUTED');
                        const filledQty = entryAudit?.executedQuantity || plan.position.quantity;
                        const actualEntry = entryAudit?.actualFillPrice || plan.entry.reference;
                        if (filledQty <= 0) {
                            throw new Error('Cannot protect a position with 0 filled quantity.');
                        }
                        // Normalize according to filters
                        const { tickSize, stepSize } = await executionService_1.ExecutionService.validateAgainstExchangeFilters(plan);
                        const normalizedQty = executionService_1.ExecutionService.normalizeQuantity(filledQty, stepSize);
                        // OCO Logic:
                        // If Long: Sell order. Price = Take Profit (above current), StopPrice = Stop Loss (below current)
                        // If Short: Buy order. Price = Take Profit (below current), StopPrice = Stop Loss (above current)
                        const ocoSide = plan.direction === 'LONG' ? 'SELL' : 'BUY';
                        const stopPrice = executionService_1.ExecutionService.normalizePrice(plan.stopLoss, tickSize);
                        // For simplicity, grab the final take profit target
                        const tpTarget = plan.takeProfits[plan.takeProfits.length - 1].price;
                        const limitPrice = executionService_1.ExecutionService.normalizePrice(tpTarget, tickSize);
                        console.log(`[Protection] Submitting OCO for ${plan.symbol} ${ocoSide}. Qty: ${normalizedQty}, SL: ${stopPrice}, TP: ${limitPrice}`);
                        const ocoResult = await binanceExecution_1.BinanceExecution.executeOCOOrder(plan.symbol, ocoSide, normalizedQty, limitPrice, stopPrice, stopPrice // limit price for stop limit is usually the same or slightly slipped
                        );
                        // Success! Record position
                        const position = {
                            id: planId,
                            planId,
                            symbol: plan.symbol,
                            side: plan.direction,
                            quantity: normalizedQty,
                            entryPrice: actualEntry,
                            stopLoss: stopPrice,
                            takeProfit: limitPrice,
                            unrealizedPnL: 0,
                            realizedPnL: 0,
                            status: 'POSITION_OPEN',
                            openedAt: Date.now(),
                            updatedAt: Date.now(),
                            entryOrderId: entryAudit?.orderId,
                            protectiveOrderId: ocoResult.orderListId?.toString()
                        };
                        database_1.LocalDatabase.insert('positions', position);
                        state.status = 'POSITION_OPEN';
                        executionScheduler_1.ExecutionScheduler.updateAuditStatus(planId, 'PROTECTED', { orderId: ocoResult.orderListId?.toString() });
                    }
                    catch (error) {
                        console.error(`[Protection] Failed to protect ${planId}:`, error.message);
                        // Leave in PROTECTION_PENDING or transition to UNPROTECTED depending on error
                        state.status = 'FAILED';
                        executionScheduler_1.ExecutionScheduler.updateAuditStatus(planId, 'FAILED', { error: `Protection Failed: ${error.message}` });
                    }
                }
            }
            if (stateChanged) {
                executionScheduler_1.ExecutionScheduler.saveState(plans, states);
            }
        }
        finally {
            this.isProcessing = false;
        }
    }
};
setInterval(() => exports.ProtectionService.processPendingProtections(), 10000);
