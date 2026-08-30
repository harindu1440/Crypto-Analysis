"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReconciliationService = void 0;
const executionScheduler_1 = require("./executionScheduler");
const accountSyncService_1 = require("../account/accountSyncService");
exports.ReconciliationService = {
    isReconciling: false,
    async runReconciliation() {
        if (this.isReconciling)
            return;
        this.isReconciling = true;
        try {
            const activeStates = Array.from(executionScheduler_1.ExecutionScheduler.executionState.values())
                .filter(s => ['EXECUTING', 'EXECUTION_UNCERTAIN', 'EXECUTED'].includes(s.status));
            for (const state of activeStates) {
                const plan = executionScheduler_1.ExecutionScheduler.scheduledPlans.get(state.planId);
                if (!plan)
                    continue;
                const audits = executionScheduler_1.ExecutionScheduler.getAuditLog(state.planId);
                const latestAudit = audits[audits.length - 1];
                if (latestAudit && latestAudit.clientOrderId) {
                    try {
                        // Compare local vs Binance
                        const order = await accountSyncService_1.AccountSyncService.getOrderStatusByClientOrderId(plan.symbol, latestAudit.clientOrderId);
                        if (order) {
                            const prevStatus = state.status;
                            if (order.status === 'FILLED') {
                                state.status = 'EXECUTED';
                            }
                            else if (['CANCELED', 'REJECTED', 'EXPIRED'].includes(order.status)) {
                                state.status = 'FAILED';
                            }
                            if (prevStatus !== state.status) {
                                console.log(`[Reconciliation] Plan ${state.planId} updated from ${prevStatus} to ${state.status}`);
                                executionScheduler_1.ExecutionScheduler.updateAuditStatus(state.planId, state.status, {
                                    actualFillPrice: order.avgPrice || order.price,
                                    executedQuantity: order.executedQty,
                                    accountSyncTimestamp: Date.now()
                                });
                                executionScheduler_1.ExecutionScheduler.saveState(executionScheduler_1.ExecutionScheduler.scheduledPlans, executionScheduler_1.ExecutionScheduler.executionState);
                            }
                        }
                    }
                    catch (e) {
                        console.error(`[Reconciliation] Failed to sync order for ${state.planId}:`, e.message);
                    }
                }
            }
        }
        catch (e) {
            console.error(`[Reconciliation] General error:`, e.message);
        }
        finally {
            this.isReconciling = false;
        }
    }
};
// Run reconciliation every 30 seconds
setInterval(() => exports.ReconciliationService.runReconciliation(), 30000);
