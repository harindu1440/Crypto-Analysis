import { ExecutionScheduler } from './executionScheduler';
import { AccountSyncService } from '../account/accountSyncService';

export const ReconciliationService = {
  isReconciling: false,

  async runReconciliation() {
    if (this.isReconciling) return;
    this.isReconciling = true;

    try {
      const activeStates = Array.from(ExecutionScheduler.executionState.values())
        .filter(s => ['EXECUTING', 'EXECUTION_UNCERTAIN', 'EXECUTED'].includes(s.status));

      for (const state of activeStates) {
        const plan = ExecutionScheduler.scheduledPlans.get(state.planId);
        if (!plan) continue;

        const audits = ExecutionScheduler.getAuditLog(state.planId);
        const latestAudit = audits[audits.length - 1];

        if (latestAudit && latestAudit.clientOrderId) {
          try {
            // Compare local vs Binance
            const order = await AccountSyncService.getOrderStatusByClientOrderId(plan.symbol, latestAudit.clientOrderId);
            
            if (order) {
              const prevStatus = state.status;
              
              if (order.status === 'FILLED') {
                state.status = 'EXECUTED';
              } else if (['CANCELED', 'REJECTED', 'EXPIRED'].includes(order.status)) {
                state.status = 'FAILED';
              }

              if (prevStatus !== state.status) {
                console.log(`[Reconciliation] Plan ${state.planId} updated from ${prevStatus} to ${state.status}`);
                ExecutionScheduler.updateAuditStatus(state.planId, state.status, {
                  actualFillPrice: order.avgPrice || order.price,
                  executedQuantity: order.executedQty,
                  accountSyncTimestamp: Date.now()
                });
                ExecutionScheduler.saveState(ExecutionScheduler.scheduledPlans, ExecutionScheduler.executionState);
              }
            }
          } catch (e: any) {
            console.error(`[Reconciliation] Failed to sync order for ${state.planId}:`, e.message);
          }
        }
      }
    } catch (e: any) {
      console.error(`[Reconciliation] General error:`, e.message);
    } finally {
      this.isReconciling = false;
    }
  }
};

// Run reconciliation every 30 seconds
setInterval(() => ReconciliationService.runReconciliation(), 30000);
