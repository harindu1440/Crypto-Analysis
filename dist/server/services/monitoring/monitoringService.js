"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringService = void 0;
const binanceWebSocketService_1 = require("../binance/binanceWebSocketService");
const agentRunner_1 = require("../ai/agentRunner");
const riskEngine_1 = require("../risk/riskEngine");
const executionScheduler_1 = require("../execution/executionScheduler");
const riskConfig_1 = require("../risk/riskConfig");
const analysisService_1 = require("../analysis/analysisService");
const opportunityTracker_1 = require("./opportunityTracker");
const crypto_1 = __importDefault(require("crypto"));
class MonitoringOrchestrator {
    isRunning = false;
    assets = new Map();
    state = new Map();
    events = [];
    MAX_EVENTS = 500;
    ANALYSIS_COOLDOWN_MS = parseInt(process.env.ANALYSIS_COOLDOWN_MS || '60000', 10);
    TRIGGER_PRICE_CHANGE_PERCENT = 1.5; // 1.5% move triggers analysis
    TRIGGER_TIME_MS = 5 * 60 * 1000; // 5 mins fallback trigger
    constructor() {
        // Bind WebSocket handler
        binanceWebSocketService_1.binanceWS.addClient(this.handleMarketTick.bind(this));
    }
    // --- LIFECYCLE ---
    start() {
        if (this.isRunning)
            return;
        const autoMonitoring = process.env.AUTO_MONITORING === 'false' ? false : true;
        if (!autoMonitoring) {
            console.log('[Monitor] AUTO_MONITORING is false. Will not start.');
            return;
        }
        this.isRunning = true;
        this.logEvent('SYSTEM', 'Monitor started', 'INFO');
        // Subscribe to active assets
        const symbolsToSub = Array.from(this.assets.values()).filter(a => a.enabled).map(a => a.symbol);
        if (symbolsToSub.length > 0) {
            binanceWebSocketService_1.binanceWS.subscribe(symbolsToSub);
        }
        // Start active opportunity lifecycle tracker
        opportunityTracker_1.OpportunityTracker.start();
    }
    stop() {
        if (!this.isRunning)
            return;
        this.isRunning = false;
        this.logEvent('SYSTEM', 'Monitor stopped', 'WARNING');
        binanceWebSocketService_1.binanceWS.unsubscribe(Array.from(this.assets.keys()));
        opportunityTracker_1.OpportunityTracker.stop();
    }
    getStatus() {
        return {
            running: this.isRunning,
            assets: Array.from(this.state.values())
        };
    }
    // --- ASSET MANAGEMENT ---
    addAsset(symbol) {
        if (this.assets.has(symbol))
            throw new Error(`${symbol} is already monitored.`);
        this.assets.set(symbol, { symbol, enabled: true, timeframe: '1h' });
        this.state.set(symbol, {
            symbol,
            enabled: true,
            analysisInProgress: false,
            consecutiveNoTrade: 0
        });
        this.logEvent(symbol, `Asset added to monitoring`, 'INFO');
        if (this.isRunning) {
            binanceWebSocketService_1.binanceWS.subscribe([symbol]);
        }
    }
    removeAsset(symbol) {
        this.assets.delete(symbol);
        this.state.delete(symbol);
        this.logEvent(symbol, `Asset removed from monitoring`, 'WARNING');
        binanceWebSocketService_1.binanceWS.unsubscribe([symbol]);
    }
    setAssetStatus(symbol, enabled) {
        const asset = this.assets.get(symbol);
        const state = this.state.get(symbol);
        if (!asset || !state)
            throw new Error('Asset not found');
        asset.enabled = enabled;
        state.enabled = enabled;
        if (enabled && this.isRunning) {
            binanceWebSocketService_1.binanceWS.subscribe([symbol]);
            this.logEvent(symbol, 'Monitoring enabled', 'INFO');
        }
        else {
            binanceWebSocketService_1.binanceWS.unsubscribe([symbol]);
            this.logEvent(symbol, 'Monitoring disabled', 'WARNING');
        }
    }
    // --- EVENT LOGGING ---
    logEvent(symbol, message, type) {
        const event = {
            id: crypto_1.default.randomUUID(),
            timestamp: Date.now(),
            symbol,
            message,
            type
        };
        this.events.unshift(event);
        if (this.events.length > this.MAX_EVENTS) {
            this.events.pop();
        }
        console.log(`[Monitor] ${symbol}: ${message}`);
    }
    getEvents() {
        return this.events;
    }
    // --- TRIGGER CONTROLLER ---
    handleMarketTick(data) {
        if (!this.isRunning)
            return;
        const symbol = data.symbol;
        const state = this.state.get(symbol);
        if (!state || !state.enabled)
            return;
        // We get ticks from WebSocket. We need to decide if an AI analysis should be triggered.
        const price = parseFloat(data.price);
        if (!state.lastPrice) {
            state.lastPrice = price;
            state.lastAnalysisAt = Date.now();
            return;
        }
        const priceDeltaPercent = Math.abs((price - state.lastPrice) / state.lastPrice) * 100;
        const timeSinceLastAnalysis = Date.now() - (state.lastAnalysisAt || 0);
        let shouldTrigger = false;
        let triggerReason = '';
        if (timeSinceLastAnalysis >= this.TRIGGER_TIME_MS) {
            shouldTrigger = true;
            triggerReason = 'Time interval elapsed';
        }
        else if (priceDeltaPercent >= this.TRIGGER_PRICE_CHANGE_PERCENT) {
            shouldTrigger = true;
            triggerReason = `Price moved ${priceDeltaPercent.toFixed(2)}%`;
        }
        if (shouldTrigger && timeSinceLastAnalysis >= this.ANALYSIS_COOLDOWN_MS) {
            if (!state.analysisInProgress) {
                state.lastPrice = price; // reset reference
                this.runAnalysisPipeline(symbol, triggerReason).catch(err => {
                    state.lastError = err.message;
                    this.logEvent(symbol, `Pipeline Error: ${err.message}`, 'ERROR');
                    state.analysisInProgress = false; // ensure unlock
                });
            }
        }
    }
    // --- ORCHESTRATION PIPELINE ---
    async runAnalysisPipeline(symbol, reason) {
        const state = this.state.get(symbol);
        if (!state)
            return;
        state.analysisInProgress = true;
        state.lastAnalysisAt = Date.now();
        this.logEvent(symbol, `Analysis triggered: ${reason}`, 'INFO');
        try {
            // 1. AI Analysis
            const masterDecision = await agentRunner_1.AgentRunner.runAnalysis(symbol);
            state.lastAnalysisId = masterDecision.analysisId;
            state.lastDecision = masterDecision.decision;
            this.logEvent(symbol, `AI Decision: ${masterDecision.decision}`, masterDecision.decision === 'CANDIDATE_TRADE' ? 'SUCCESS' : 'INFO');
            if (masterDecision.decision === 'NO_TRADE') {
                state.consecutiveNoTrade++;
                return; // Normal, stop here.
            }
            state.consecutiveNoTrade = 0;
            // 2. Risk Engine Validation
            // Needs snapshot for volatility
            const snapshot = await analysisService_1.AnalysisService.getAnalysisSnapshot(symbol, ['1h']);
            const tradePlan = riskEngine_1.RiskEngine.validateCandidate(masterDecision, snapshot, riskConfig_1.DEFAULT_RISK_SETTINGS);
            if (tradePlan.validation.status === 'REJECTED') {
                this.logEvent(symbol, `Risk Rejected: ${tradePlan.validation.reasons.join(', ')}`, 'WARNING');
                return; // Stop here.
            }
            // Prevent exact duplicate scheduling
            const existingAudits = executionScheduler_1.ExecutionScheduler.getAuditLog(tradePlan.planId);
            if (existingAudits.length > 0) {
                this.logEvent(symbol, `Skipped duplicate plan ID ${tradePlan.planId}`, 'INFO');
                return;
            }
            // 3. Execution Scheduler
            // For automated trades, schedule immediately (e.g. +10s to allow 5-min alert bypass if it was immediate, or we can just schedule it 6 minutes out to see the countdown)
            // Phase 8 logic: An automated trade should be scheduled slightly in the future to give the user time to cancel.
            const executeAt = Date.now() + (6 * 60 * 1000);
            executionScheduler_1.ExecutionScheduler.schedulePlan(tradePlan, executeAt);
            this.logEvent(symbol, `Plan Scheduled. Execution at ${new Date(executeAt).toLocaleTimeString()}`, 'SUCCESS');
        }
        finally {
            state.analysisInProgress = false;
        }
    }
}
exports.MonitoringService = new MonitoringOrchestrator();
