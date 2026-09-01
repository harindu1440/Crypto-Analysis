"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpportunityTracker = void 0;
const opportunityService_1 = require("../opportunities/opportunityService");
const eventBus_1 = require("../system/eventBus");
const lifecycleService_1 = require("../opportunities/lifecycleService");
exports.OpportunityTracker = {
    unsubscribeMarketUpdate: null,
    start() {
        if (this.unsubscribeMarketUpdate)
            return;
        console.log('[OpportunityTracker] Started event-driven lifecycle tracker');
        // Listen to market updates and revalidate active opportunities
        this.unsubscribeMarketUpdate = eventBus_1.EventBus.subscribe('MARKET_UPDATE', (event) => {
            this.revalidateSymbol(event.symbol);
        });
        // Also revalidate on candle close
        eventBus_1.EventBus.subscribe('CANDLE_CLOSE', (event) => {
            this.revalidateSymbol(event.symbol);
        });
    },
    stop() {
        if (this.unsubscribeMarketUpdate) {
            this.unsubscribeMarketUpdate();
            this.unsubscribeMarketUpdate = null;
            console.log('[OpportunityTracker] Stopped event-driven lifecycle tracker');
        }
    },
    revalidateSymbol(symbol) {
        const activeOpps = opportunityService_1.OpportunityService.getActiveOpportunities().filter(o => o.symbol === symbol);
        if (activeOpps.length === 0)
            return;
        for (const opp of activeOpps) {
            try {
                lifecycleService_1.LifecycleService.revalidate(opp);
            }
            catch (err) {
                console.error(`[OpportunityTracker] Error tracking ${opp.symbol}:`, err.message);
            }
        }
    }
};
