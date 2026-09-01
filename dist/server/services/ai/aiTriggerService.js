"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiTriggerService = void 0;
const eventBus_1 = require("../system/eventBus");
const agentRunner_1 = require("./agentRunner");
const AI_SYMBOL_COOLDOWN_MS = process.env.AI_SYMBOL_COOLDOWN_SECONDS ? parseInt(process.env.AI_SYMBOL_COOLDOWN_SECONDS) * 1000 : 30000;
class AiTriggerEngine {
    lastAnalysisTime = new Map();
    pendingAnalysis = new Map();
    processingQueue = false;
    constructor() {
        eventBus_1.EventBus.subscribe('MARKET_UPDATE', (event) => {
            this.evaluateMarketUpdate(event.symbol, event.payload);
        });
        eventBus_1.EventBus.subscribe('CANDLE_CLOSE', (event) => {
            this.evaluateCandleClose(event.symbol, event.payload);
        });
        // Check pending queue every 5 seconds
        setInterval(() => this.processQueue(), 5000);
    }
    evaluateMarketUpdate(symbol, data) {
        // Basic logic: if price changes by > 1% since last check, trigger
        // For now, let's keep it simple and just use cooldowns
        if (Math.abs(data.priceChangePercent) > 2.0) {
            this.requestAnalysis(symbol, 'HIGH', ['Significant Price Movement']);
        }
    }
    evaluateCandleClose(symbol, data) {
        if (['1h', '4h', '1d'].includes(data.interval)) {
            this.requestAnalysis(symbol, 'MEDIUM', [`${data.interval} Candle Close`]);
        }
    }
    requestAnalysis(symbol, priority, triggers) {
        const pending = this.pendingAnalysis.get(symbol);
        if (pending) {
            // Coalescing logic: upgrade priority if higher, merge triggers
            pending.priority = this.getHighestPriority(pending.priority, priority);
            pending.triggers = Array.from(new Set([...pending.triggers, ...triggers]));
            pending.lastTriggerAt = Date.now();
        }
        else {
            this.pendingAnalysis.set(symbol, {
                symbol,
                priority,
                triggers,
                lastTriggerAt: Date.now()
            });
        }
        this.processQueue();
    }
    getHighestPriority(p1, p2) {
        const weights = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        return weights[p1] >= weights[p2] ? p1 : p2;
    }
    async processQueue() {
        if (this.processingQueue)
            return;
        this.processingQueue = true;
        try {
            const now = Date.now();
            // Find eligible items (cooldown expired)
            const eligibleItems = Array.from(this.pendingAnalysis.values()).filter(item => {
                const lastTime = this.lastAnalysisTime.get(item.symbol) || 0;
                return now - lastTime >= AI_SYMBOL_COOLDOWN_MS;
            });
            if (eligibleItems.length === 0)
                return;
            // Sort by priority (CRITICAL first, then HIGH, etc.)
            eligibleItems.sort((a, b) => {
                const weights = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
                return weights[b.priority] - weights[a.priority];
            });
            // Process the top item (to avoid hitting rate limits instantly)
            const target = eligibleItems[0];
            this.pendingAnalysis.delete(target.symbol);
            this.lastAnalysisTime.set(target.symbol, now);
            console.log(`[AiTriggerService] Triggering AI Analysis for ${target.symbol} | Priority: ${target.priority} | Triggers: ${target.triggers.join(', ')}`);
            // Dispatch Event
            eventBus_1.EventBus.publish({
                eventType: 'AI_ANALYSIS_REQUESTED',
                source: 'AiTriggerService',
                symbol: target.symbol,
                payload: {
                    priority: target.priority,
                    triggers: target.triggers
                }
            });
            // Actually call the runner (in real architecture, maybe the runner listens to the event, but we can call it here for now to fit the existing flow)
            agentRunner_1.AgentRunner.runAnalysis(target.symbol).catch(err => {
                console.error(`[AiTriggerService] AI Analysis failed for ${target.symbol}`, err.message);
            });
        }
        finally {
            this.processingQueue = false;
        }
    }
}
exports.AiTriggerService = new AiTriggerEngine();
