"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionScheduler = void 0;
const executionService_1 = require("./executionService");
const binanceExecution_1 = require("./binanceExecution");
const accountSyncService_1 = require("../account/accountSyncService");
const crypto_1 = __importDefault(require("crypto"));
exports.ExecutionScheduler = {
    scheduledPlans: new Map(),
    executionState: new Map(),
    auditLog: new Map(),
    // Execution locks prevent concurrent executions of the same plan
    executionLocks: new Set(),
    schedulePlan(plan, executeAt) {
        if (plan.validation.status !== 'VALID') {
            throw new Error('Cannot schedule an invalid plan.');
        }
        if (Date.now() >= plan.expiresAt) {
            throw new Error('Cannot schedule an expired plan.');
        }
        if (this.scheduledPlans.has(plan.planId)) {
            throw new Error('Plan is already scheduled.');
        }
        // Duplicate identifier protection (same symbol, same timestamp timeframe)
        // In a real system, you might check if there's an active trade for this symbol.
        // For now, we allow multiple if planId is unique, but it's recorded.
        this.scheduledPlans.set(plan.planId, plan);
        this.executionState.set(plan.planId, {
            planId: plan.planId,
            scheduledAt: executeAt,
            status: 'PENDING',
            preTradeNotificationSent: false
        });
        this.recordAudit({
            id: crypto_1.default.randomUUID(),
            planId: plan.planId,
            symbol: plan.symbol,
            direction: plan.direction,
            scheduledAt: executeAt,
            status: 'PENDING'
        });
        console.log(`[Execution] Plan ${plan.planId} scheduled for ${new Date(executeAt).toISOString()}`);
    },
    cancelPlan(planId) {
        const state = this.executionState.get(planId);
        if (!state)
            throw new Error('Plan not found.');
        if (['EXECUTING', 'EXECUTED', 'FAILED', 'EXPIRED', 'CANCELLED', 'EXECUTION_UNCERTAIN'].includes(state.status)) {
            throw new Error(`Cannot cancel plan in status ${state.status}`);
        }
        state.status = 'CANCELLED';
        this.scheduledPlans.delete(planId);
        console.log(`[Execution] Plan ${planId} cancelled.`);
        this.updateAuditStatus(planId, 'CANCELLED');
    },
    getUpcomingPlans() {
        return Array.from(this.executionState.values()).filter(s => ['PENDING', 'COUNTDOWN', 'READY'].includes(s.status));
    },
    getExecutionStatus(planId) {
        return this.executionState.get(planId) || null;
    },
    getAuditLog(planId) {
        return Array.from(this.auditLog.values()).filter(a => a.planId === planId);
    },
    recordAudit(audit) {
        this.auditLog.set(audit.id, audit);
    },
    updateAuditStatus(planId, status, updates = {}) {
        const audits = this.getAuditLog(planId);
        if (audits.length > 0) {
            const latest = audits[audits.length - 1]; // Assume last is current
            Object.assign(latest, { status, ...updates });
        }
    },
    async runTick() {
        const now = Date.now();
        for (const [planId, state] of this.executionState.entries()) {
            const plan = this.scheduledPlans.get(planId);
            if (!plan)
                continue;
            // 1. Expiration check
            if (now >= plan.expiresAt && ['PENDING', 'COUNTDOWN', 'READY'].includes(state.status)) {
                state.status = 'EXPIRED';
                this.scheduledPlans.delete(planId);
                this.updateAuditStatus(planId, 'EXPIRED');
                console.log(`[Execution] Plan ${planId} expired.`);
                continue;
            }
            const timeRemaining = state.scheduledAt - now;
            // 2. Pre-trade Notification (5 minutes)
            if (timeRemaining <= 5 * 60 * 1000 && timeRemaining > 0) {
                if (state.status === 'PENDING')
                    state.status = 'COUNTDOWN';
                if (!state.preTradeNotificationSent) {
                    state.preTradeNotificationSent = true;
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
                    accountSyncService_1.AccountSyncService.getOrderStatusByClientOrderId(plan.symbol, audit.clientOrderId)
                        .then(order => {
                        if (order) {
                            console.log(`[Execution] Reconciled order ${planId} as ${order.status}`);
                            state.status = order.status === 'FILLED' ? 'EXECUTED' :
                                ['CANCELED', 'REJECTED', 'EXPIRED'].includes(order.status) ? 'FAILED' : 'EXECUTING';
                            this.updateAuditStatus(planId, state.status, {
                                actualFillPrice: order.avgPrice || order.price,
                                executedQuantity: order.executedQty,
                                accountSyncTimestamp: Date.now()
                            });
                            if (state.status === 'EXECUTED' || state.status === 'FAILED') {
                                this.scheduledPlans.delete(planId);
                            }
                        }
                    }).catch(console.error);
                }
            }
        }
    },
    async executeSafe(planId) {
        if (this.executionLocks.has(planId)) {
            console.warn(`[Execution] Duplicate execution prevented for ${planId}`);
            return;
        }
        this.executionLocks.add(planId);
        const state = this.executionState.get(planId);
        const plan = this.scheduledPlans.get(planId);
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
            // Phase 9: Account Balance Check
            if (process.env.ACCOUNT_EQUITY_MODE === 'binance') {
                const quoteCurrency = 'USDT'; // Simplified for Spot Quote
                const available = accountSyncService_1.AccountSyncService.getAvailableBalance(quoteCurrency);
                if (available < plan.position.notionalValue) {
                    throw new Error(`Execution aborted. Insufficient ${quoteCurrency}. Required: ${plan.position.notionalValue}, Available: ${available}`);
                }
                // Open order check
                const openOrders = accountSyncService_1.AccountSyncService.getOpenOrders(plan.symbol);
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
                validOrderParams = await executionService_1.ExecutionService.validateAgainstExchangeFilters(plan);
            }
            catch (err) {
                throw new Error(`Filter Validation Failed: ${err.message}`);
            }
            // 2. Place Order (Mocked or Real)
            const side = plan.direction === 'LONG' ? 'BUY' : 'SELL';
            const result = await binanceExecution_1.BinanceExecution.executeOrder(plan.symbol, side, validOrderParams.normalizedQuantity, clientOrderId
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
        }
        catch (error) {
            console.error(`[Execution] Execution failed for ${planId}:`, error.message);
            // Determine if it was an internal validation error, or a Binance HTTP error
            const isUncertain = error.message.includes('Binance HTTP 5') || error.message.includes('timeout');
            state.status = isUncertain ? 'EXECUTION_UNCERTAIN' : 'FAILED';
            this.updateAuditStatus(planId, state.status, {
                completedAt: Date.now(),
                error: error.message
            });
        }
        finally {
            this.executionLocks.delete(planId);
            // We keep state in executionState for history, but can clean up scheduledPlans
            this.scheduledPlans.delete(planId);
        }
    }
};
// Start the scheduler tick (runs every second)
setInterval(() => exports.ExecutionScheduler.runTick(), 1000);
