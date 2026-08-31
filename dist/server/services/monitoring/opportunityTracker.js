"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpportunityTracker = void 0;
const opportunityService_1 = require("../opportunities/opportunityService");
const binanceMarketService_1 = require("../binance/binanceMarketService");
const alertService_1 = require("../system/alertService");
exports.OpportunityTracker = {
    timer: null,
    start() {
        if (this.timer)
            return;
        console.log('[OpportunityTracker] Started background lifecycle tracker');
        // Run every 10 seconds
        this.timer = setInterval(() => this.tick(), 10000);
    },
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            console.log('[OpportunityTracker] Stopped background lifecycle tracker');
        }
    },
    async tick() {
        const activeOpps = opportunityService_1.OpportunityService.getActiveOpportunities();
        if (activeOpps.length === 0)
            return;
        for (const opp of activeOpps) {
            try {
                const ticker = await binanceMarketService_1.BinanceMarketService.getTicker(opp.symbol);
                const currentPrice = Number(ticker.lastPrice);
                // 1. Check Expiration
                if (Date.now() > opp.expiresAt) {
                    opportunityService_1.OpportunityService.updateStatus(opp.id, 'EXPIRED', 'Opportunity time expired.');
                    alertService_1.AlertService.log('INFO', 'OpportunityTracker', `Opportunity ${opp.symbol} expired.`);
                    continue;
                }
                // 2. Check Invalidation (Stop Loss hit before Entry)
                if (opp.direction === 'LONG' && currentPrice <= opp.stopLoss) {
                    opportunityService_1.OpportunityService.updateStatus(opp.id, 'INVALIDATED', 'Price dropped below Stop Loss before entry.');
                    alertService_1.AlertService.log('WARNING', 'OpportunityTracker', `Opportunity ${opp.symbol} invalidated (Hit SL).`);
                    continue;
                }
                if (opp.direction === 'SHORT' && currentPrice >= opp.stopLoss) {
                    opportunityService_1.OpportunityService.updateStatus(opp.id, 'INVALIDATED', 'Price rose above Stop Loss before entry.');
                    alertService_1.AlertService.log('WARNING', 'OpportunityTracker', `Opportunity ${opp.symbol} invalidated (Hit SL).`);
                    continue;
                }
                // 3. Check Approaching Entry
                // For LONG, if price is dropping towards entryZone max
                const thresholdPercent = 0.005; // 0.5% away
                let isApproaching = false;
                if (opp.direction === 'LONG' && currentPrice > opp.entryZone.max) {
                    const distance = (currentPrice - opp.entryZone.max) / opp.entryZone.max;
                    if (distance <= thresholdPercent)
                        isApproaching = true;
                }
                else if (opp.direction === 'SHORT' && currentPrice < opp.entryZone.min) {
                    const distance = (opp.entryZone.min - currentPrice) / opp.entryZone.min;
                    if (distance <= thresholdPercent)
                        isApproaching = true;
                }
                if (isApproaching && opp.status !== 'APPROACHING_ENTRY') {
                    opportunityService_1.OpportunityService.updateStatus(opp.id, 'APPROACHING_ENTRY');
                    alertService_1.AlertService.log('INFO', 'OpportunityTracker', `${opp.symbol} is approaching entry zone!`);
                }
                else if (!isApproaching && opp.status === 'APPROACHING_ENTRY') {
                    // Move back to QUALIFIED/ACTIVE if it moves away
                    opportunityService_1.OpportunityService.updateStatus(opp.id, 'QUALIFIED');
                }
            }
            catch (err) {
                console.error(`[OpportunityTracker] Error tracking ${opp.symbol}:`, err.message);
            }
        }
    }
};
