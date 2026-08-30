import { FinalTradePlan } from '../risk/types';
import { ScheduledPlanState, ExecutionAudit, ExecutionStatus } from './types';
import { ExecutionService } from './executionService';
import { BinanceExecution } from './binanceExecution';
import { AccountSyncService } from '../account/accountSyncService';
import { LocalDatabase } from '../../config/database';
import { PositionManager } from './positionManager';
import crypto from 'crypto';

export const ExecutionScheduler = {
  // Execution locks prevent concurrent executions of the same plan
  executionLocks: new Set<string>(),

  // Load from DB instead of using memory maps
  get scheduledPlans() {
    const plans = LocalDatabase.get('scheduledPlans') || [];
    const map = new Map<string, FinalTradePlan>();
    plans.forEach((p: any) => map.set(p.planId, p));
    return map;
  },

  get executionState() {
    const states = LocalDatabase.get('executionState') || [];
    const map = new Map<string, ScheduledPlanState>();
    states.forEach((s: any) => map.set(s.planId, s));
    return map;
  },

  get auditLog() {
    const audits = LocalDatabase.get('auditLog') || [];
    const map = new Map<string, ExecutionAudit>();
    audits.forEach((a: any) => map.set(a.id, a));
    return map;
  },

  saveState(plans: Map<string, FinalTradePlan>, states: Map<string, ScheduledPlanState>) {
    LocalDatabase.set('scheduledPlans', Array.from(plans.values()));
    LocalDatabase.set('executionState', Array.from(states.values()));
  },

  schedulePlan(plan: FinalTradePlan, executeAt: number) {
    if (plan.validation.status !== 'VALID') {
      throw new Error('Cannot schedule an invalid plan.');
    }
    
    if (Date.now() >= plan.expiresAt) {
      throw new Error('Cannot schedule an expired plan.');
    }

    const plans = this.scheduledPlans;
    const states = this.executionState;

    if (plans.has(plan.planId)) {
      throw new Error('Plan is already scheduled.');
    }

    plans.set(plan.planId, plan);
    states.set(plan.planId, {
      planId: plan.planId,
      scheduledAt: executeAt,
      status: 'PENDING',
      preTradeNotificationSent: false
    });

    this.saveState(plans, states);

    this.recordAudit({
      id: crypto.randomUUID(),
      planId: plan.planId,
      symbol: plan.symbol,
      direction: plan.direction,
      scheduledAt: executeAt,
      status: 'PENDING'
    });

    console.log(`[Execution] Plan ${plan.planId} scheduled for ${new Date(executeAt).toISOString()}`);
  },

  cancelPlan(planId: string) {
    const plans = this.scheduledPlans;
    const states = this.executionState;
    const state = states.get(planId);
    
    if (!state) throw new Error('Plan not found.');
    
    if (['EXECUTING', 'EXECUTED', 'FAILED', 'EXPIRED', 'CANCELLED', 'EXECUTION_UNCERTAIN'].includes(state.status)) {
      throw new Error(`Cannot cancel plan in status ${state.status}`);
    }

    state.status = 'CANCELLED';
    plans.delete(planId);
    this.saveState(plans, states);
    
    console.log(`[Execution] Plan ${planId} cancelled.`);
    this.updateAuditStatus(planId, 'CANCELLED');
  },

  getUpcomingPlans() {
    return Array.from(this.executionState.values()).filter(s => 
      ['PENDING', 'COUNTDOWN', 'READY'].includes(s.status)
    );
  },

  getExecutionStatus(planId: string) {
    return this.executionState.get(planId) || null;
  },

  getAuditLog(planId: string) {
    return Array.from(this.auditLog.values()).filter(a => a.planId === planId);
  },

  recordAudit(audit: ExecutionAudit) {
    LocalDatabase.insert('auditLog', audit);
  },

  updateAuditStatus(planId: string, status: ExecutionStatus, updates: Partial<ExecutionAudit> = {}) {
    const auditsMap = this.auditLog;
    const audits = Array.from(auditsMap.values()).filter(a => a.planId === planId);
    if (audits.length > 0) {
      const latest = audits[audits.length - 1]; // Assume last is current
      Object.assign(latest, { status, ...updates });
      auditsMap.set(latest.id, latest);
      LocalDatabase.set('auditLog', Array.from(auditsMap.values()));
    }
  },

  async runTick() {
    const now = Date.now();
    const plans = this.scheduledPlans;
    const states = this.executionState;
    let stateChanged = false;

    for (const [planId, state] of states.entries()) {
      
      const plan = plans.get(planId);
      if (!plan) continue;

      // 1. Expiration check
      if (now >= plan.expiresAt && ['PENDING', 'COUNTDOWN', 'READY'].includes(state.status)) {
        state.status = 'EXPIRED';
        plans.delete(planId);
        stateChanged = true;
        this.updateAuditStatus(planId, 'EXPIRED');
        console.log(`[Execution] Plan ${planId} expired.`);
        continue;
      }

      const timeRemaining = state.scheduledAt - now;

      // 2. Pre-trade Notification (5 minutes)
      if (timeRemaining <= 5 * 60 * 1000 && timeRemaining > 0) {
        if (state.status === 'PENDING') {
          state.status = 'COUNTDOWN';
          stateChanged = true;
        }
        
        if (!state.preTradeNotificationSent) {
          state.preTradeNotificationSent = true;
          stateChanged = true;
          console.log(`[Execution] TRADE EXECUTION ALERT: ${plan.symbol} ${plan.direction} executing in < 5 mins!`);
          // We don't have SSE, but the frontend will poll /api/execution/upcoming and see COUNTDOWN
        }
      }

      // 3. Execution Trigger
      if (timeRemaining <= 0 && ['PENDING', 'COUNTDOWN', 'READY'].includes(state.status)) {
        // Run safe execution async
        this.executeSafe(planId).catch(err => {
          console.error(`[Execution] Safe execution wrapper failed for ${planId}:`, err);
        });
      }

      // 4. Reconciliation for Uncertain Executions
      if (state.status === 'EXECUTION_UNCERTAIN') {
        const audit = this.getAuditLog(planId).slice(-1)[0];
        if (audit && audit.clientOrderId) {
          // Poll Binance async
          AccountSyncService.getOrderStatusByClientOrderId(plan.symbol, audit.clientOrderId)
            .then(order => {
              if (order) {
                 console.log(`[Execution] Reconciled order ${planId} as ${order.status}`);
                 state.status = order.status === 'FILLED' ? 'EXECUTED' : 
                                ['CANCELED', 'REJECTED', 'EXPIRED'].includes(order.status) ? 'FAILED' : 'EXECUTING';
                 stateChanged = true;
                 
                 this.updateAuditStatus(planId, state.status, {
                   actualFillPrice: order.avgPrice || order.price,
                   executedQuantity: order.executedQty,
                   accountSyncTimestamp: Date.now()
                 });
                 if (state.status === 'EXECUTED' || state.status === 'FAILED') {
                   plans.delete(planId);
                   this.saveState(plans, states);
                 }
              }
            }).catch(console.error);
        }
      }
    }

    if (stateChanged) {
      this.saveState(plans, states);
    }
  },

  async executeSafe(planId: string) {
    if (this.executionLocks.has(planId)) {
      console.warn(`[Execution] Duplicate execution prevented for ${planId}`);
      return;
    }
    this.executionLocks.add(planId);

    const plans = this.scheduledPlans;
    const states = this.executionState;
    const state = states.get(planId);
    const plan = plans.get(planId);
    
    if (!state || !plan) {
      this.executionLocks.delete(planId);
      return;
    }

    try {
      // Final Pre-Execution Re-checks
      if (state.status !== 'PENDING' && state.status !== 'COUNTDOWN' && state.status !== 'READY') {
        throw new Error(`Execution aborted. State is ${state.status}`);
      }
      if (Date.now() >= plan.expiresAt) {
        throw new Error(`Execution aborted. Plan expired.`);
      }

      // Phase 9: Live Trading Guard
      const isLive = (process.env.BINANCE_MODE || 'testnet') === 'live';
      const liveEnabled = process.env.LIVE_TRADING_ENABLED === 'true';
      if (isLive && !liveEnabled) {
        throw new Error('Execution aborted. LIVE_TRADING_ENABLED is false.');
      }

      // Phase 10: Emergency Kill Switch & Limits
      if (PositionManager.isEmergencyStopped()) {
        throw new Error('Execution aborted. Emergency Stop is ACTIVE.');
      }

      const maxPositions = Number(process.env.MAX_OPEN_POSITIONS) || 3;
      if (PositionManager.getActivePositions().length >= maxPositions) {
         throw new Error(`Execution aborted. Max open positions (${maxPositions}) reached.`);
      }

      // Phase 9: Account Balance Check
      if (process.env.ACCOUNT_EQUITY_MODE === 'binance') {
        const quoteCurrency = 'USDT'; // Simplified for Spot Quote
        const available = AccountSyncService.getAvailableBalance(quoteCurrency);
        if (available < plan.position.notionalValue) {
           throw new Error(`Execution aborted. Insufficient ${quoteCurrency}. Required: ${plan.position.notionalValue}, Available: ${available}`);
        }
        
        // Open order check
        const openOrders = AccountSyncService.getOpenOrders(plan.symbol);
        if (openOrders.length > 0) {
           throw new Error(`Execution aborted. Existing open orders for ${plan.symbol} found.`);
        }
      }

      state.status = 'EXECUTING';
      
      const clientOrderId = `CAP_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      this.updateAuditStatus(planId, 'EXECUTING', { startedAt: Date.now(), clientOrderId });
      console.log(`[Execution] Execution started for ${planId}`);

      // 1. Binance Filter Validation & Normalization
      let validOrderParams;
      try {
         validOrderParams = await ExecutionService.validateAgainstExchangeFilters(plan);
      } catch (err: any) {
         throw new Error(`Filter Validation Failed: ${err.message}`);
      }

      // 2. Place Order (Mocked or Real)
      const side = plan.direction === 'LONG' ? 'BUY' : 'SELL';
      const result = await BinanceExecution.executeOrder(
        plan.symbol,
        side,
        validOrderParams.normalizedQuantity,
        clientOrderId
        // For Phase 7, we simulate market entries to avoid complex order book math, or limit if defined.
        // If we strictly follow the plan reference entry, it's a LIMIT order.
        // validOrderParams.normalizedPrice
      );

      // 3. Success Record
      state.status = 'EXECUTED';
      this.updateAuditStatus(planId, 'EXECUTED', {
        completedAt: Date.now(),
        orderId: result.orderId?.toString(),
        clientOrderId: result.clientOrderId,
        quantity: validOrderParams.normalizedQuantity,
        notionalValue: validOrderParams.normalizedQuantity * plan.entry.reference,
        executedQuantity: parseFloat(result.executedQty || '0')
      });
      console.log(`[Execution] Order executed successfully for ${planId}`);

    } catch (error: any) {
      console.error(`[Execution] Execution failed for ${planId}:`, error.message);
      
      // Determine if it was an internal validation error, or a Binance HTTP error
      const isUncertain = error.message.includes('Binance HTTP 5') || error.message.includes('timeout');
      
      state.status = isUncertain ? 'EXECUTION_UNCERTAIN' : 'FAILED';
      this.updateAuditStatus(planId, state.status, {
        completedAt: Date.now(),
        error: error.message
      });
    } finally {
      this.executionLocks.delete(planId);
      // We keep state in executionState for history, but can clean up scheduledPlans
      plans.delete(planId);
      this.saveState(plans, states);
    }
  }
};

// Start the scheduler tick (runs every second)
setInterval(() => ExecutionScheduler.runTick(), 1000);
