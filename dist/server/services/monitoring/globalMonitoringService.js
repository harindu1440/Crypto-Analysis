"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalMonitoringService = void 0;
const binanceWebSocketService_1 = require("../binance/binanceWebSocketService");
const agentRunner_1 = require("../ai/agentRunner");
const riskEngine_1 = require("../risk/riskEngine");
const executionScheduler_1 = require("../execution/executionScheduler");
const riskConfig_1 = require("../risk/riskConfig");
const analysisService_1 = require("../analysis/analysisService");
const opportunityTracker_1 = require("./opportunityTracker");
const opportunityService_1 = require("../opportunities/opportunityService");
class GlobalMonitoringOrchestrator {
    isRunning = false;
    assets = new Map();
    state = new Map();
    scanInterval = null;
    // Phase 16: Adaptive Configuration
    BASE_ANALYSIS_COOLDOWN_MS = 15 * 60 * 1000; // 15 mins normal
    QUALIFIED_COOLDOWN_MS = 5 * 60 * 1000; // 5 mins qualified
    APPROACHING_COOLDOWN_MS = 1 * 60 * 1000; // 1 min approaching
    TRIGGER_PRICE_CHANGE_PERCENT = 1.5;
    constructor() {
        binanceWebSocketService_1.binanceWS.addClient(this.handleMarketTick.bind(this));
    }
    start() {
        if (this.isRunning)
            return;
        const autoMonitoring = process.env.AUTO_MONITORING === 'false' ? false : true;
        if (!autoMonitoring) {
            console.log('[GlobalMonitor] AUTO_MONITORING is false.');
            return;
        }
        this.isRunning = true;
        console.log('[GlobalMonitor] Started');
        const symbolsToSub = Array.from(this.assets.values()).filter(a => a.enabled).map(a => a.symbol);
        if (symbolsToSub.length > 0)
            binanceWebSocketService_1.binanceWS.subscribe(symbolsToSub);
        opportunityTracker_1.OpportunityTracker.start();
        // Centralized Queue Scanner (Runs every 2 seconds to pop highest priority item)
        this.scanInterval = setInterval(() => this.scanQueue(), 2000);
    }
    stop() {
        if (!this.isRunning)
            return;
        this.isRunning = false;
        console.log('[GlobalMonitor] Stopped');
        binanceWebSocketService_1.binanceWS.unsubscribe(Array.from(this.assets.keys()));
        opportunityTracker_1.OpportunityTracker.stop();
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
    }
    getStatus() {
        return {
            running: this.isRunning,
            assets: Array.from(this.state.values())
        };
    }
    addAsset(symbol) {
        if (this.assets.has(symbol))
            return;
        this.assets.set(symbol, { symbol, enabled: true, timeframe: '1h' });
        this.state.set(symbol, {
            symbol,
            enabled: true,
            analysisInProgress: false,
            consecutiveNoTrade: 0
        });
        if (this.isRunning)
            binanceWebSocketService_1.binanceWS.subscribe([symbol]);
    }
    removeAsset(symbol) {
        this.assets.delete(symbol);
        this.state.delete(symbol);
        binanceWebSocketService_1.binanceWS.unsubscribe([symbol]);
    }
    setAssetStatus(symbol, enabled) {
        const asset = this.assets.get(symbol);
        const state = this.state.get(symbol);
        if (!asset || !state)
            return;
        asset.enabled = enabled;
        state.enabled = enabled;
        if (enabled && this.isRunning)
            binanceWebSocketService_1.binanceWS.subscribe([symbol]);
        else
            binanceWebSocketService_1.binanceWS.unsubscribe([symbol]);
    }
    handleMarketTick(data) {
        if (!this.isRunning)
            return;
        const symbol = data.symbol;
        const state = this.state.get(symbol);
        if (!state || !state.enabled)
            return;
        const price = parseFloat(data.price);
        if (!state.lastPrice) {
            state.lastPrice = price;
            return; // Wait for next tick to calculate delta
        }
        const priceDeltaPercent = Math.abs((price - state.lastPrice) / state.lastPrice) * 100;
        // Fast tracking for large price moves
        if (priceDeltaPercent >= this.TRIGGER_PRICE_CHANGE_PERCENT && !state.analysisInProgress) {
            // Temporarily mark lastAnalysisAt artificially older so it gets picked up immediately by the queue
            state.lastAnalysisAt = 0;
        }
        state.lastPrice = price;
    }
    // --- Priority Queue Scanner ---
    async scanQueue() {
        if (!this.isRunning)
            return;
        // Make sure we are not already processing too many concurrently
        const inProgressCount = Array.from(this.state.values()).filter(s => s.analysisInProgress).length;
        if (inProgressCount > 0)
            return; // Wait for current Gemini call to finish (prevent rate limits)
        const now = Date.now();
        const activeOpps = opportunityService_1.OpportunityService.getActiveOpportunities();
        let candidateToRun = null;
        for (const [symbol, state] of this.state.entries()) {
            if (!state.enabled || state.analysisInProgress)
                continue;
            const opp = activeOpps.find(o => o.symbol === symbol);
            // Adaptive Cooldown
            let requiredCooldown = this.BASE_ANALYSIS_COOLDOWN_MS;
            let priorityScore = 10;
            if (opp) {
                if (opp.status === 'APPROACHING_ENTRY') {
                    requiredCooldown = this.APPROACHING_COOLDOWN_MS;
                    priorityScore = 100;
                }
                else if (opp.status === 'QUALIFIED' || opp.status === 'ACTIVE') {
                    requiredCooldown = this.QUALIFIED_COOLDOWN_MS;
                    priorityScore = 50;
                }
            }
            // Did enough time pass?
            const timeSinceLast = now - (state.lastAnalysisAt || 0);
            if (timeSinceLast >= requiredCooldown) {
                // Boost priority the longer it waits
                priorityScore += Math.floor((timeSinceLast - requiredCooldown) / 60000);
                if (!candidateToRun || priorityScore > candidateToRun.priority) {
                    candidateToRun = { symbol, priority: priorityScore };
                }
            }
        }
        if (candidateToRun) {
            this.runAnalysisPipeline(candidateToRun.symbol).catch(err => {
                const state = this.state.get(candidateToRun.symbol);
                if (state) {
                    state.lastError = err.message;
                    state.analysisInProgress = false;
                }
                console.error(`[GlobalMonitor] Pipeline Error for ${candidateToRun?.symbol}: ${err.message}`);
            });
        }
    }
    async runAnalysisPipeline(symbol) {
        const state = this.state.get(symbol);
        if (!state)
            return;
        state.analysisInProgress = true;
        state.lastAnalysisAt = Date.now();
        try {
            const masterDecision = await agentRunner_1.AgentRunner.runAnalysis(symbol);
            state.lastAnalysisId = masterDecision.analysisId;
            state.lastDecision = masterDecision.decision;
            if (masterDecision.decision === 'NO_TRADE') {
                state.consecutiveNoTrade++;
                return;
            }
            state.consecutiveNoTrade = 0;
            // Risk Engine Validation (Only for execution flow)
            const snapshot = await analysisService_1.AnalysisService.getAnalysisSnapshot(symbol, ['1h']);
            const tradePlan = riskEngine_1.RiskEngine.validateCandidate(masterDecision, snapshot, riskConfig_1.DEFAULT_RISK_SETTINGS);
            if (tradePlan.validation.status === 'REJECTED') {
                return;
            }
            const existingAudits = executionScheduler_1.ExecutionScheduler.getAuditLog(tradePlan.planId);
            if (existingAudits.length > 0)
                return;
            const executeAt = Date.now() + (6 * 60 * 1000);
            executionScheduler_1.ExecutionScheduler.schedulePlan(tradePlan, executeAt);
        }
        finally {
            state.analysisInProgress = false;
        }
    }
}
exports.GlobalMonitoringService = new GlobalMonitoringOrchestrator();
