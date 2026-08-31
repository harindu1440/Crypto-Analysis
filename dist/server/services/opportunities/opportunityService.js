"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpportunityService = void 0;
const database_1 = require("../../config/database");
const alertService_1 = require("../system/alertService");
exports.OpportunityService = {
    getOpportunities() {
        return database_1.LocalDatabase.get('opportunities') || [];
    },
    getActiveOpportunities() {
        return this.getOpportunities().filter(o => !['EXPIRED', 'INVALIDATED', 'COMPLETED'].includes(o.status));
    },
    addOpportunity(opportunity) {
        const opps = this.getOpportunities();
        // Deduplication logic based on symbol, direction, and timeframe
        const existing = opps.find(o => o.symbol === opportunity.symbol &&
            o.direction === opportunity.direction &&
            o.timeframe === opportunity.timeframe &&
            ['DETECTED', 'VALIDATED', 'ACTIVE'].includes(o.status));
        if (existing) {
            // Update existing instead of spamming
            Object.assign(existing, opportunity, { id: existing.id, createdAt: existing.createdAt });
            database_1.LocalDatabase.set('opportunities', opps);
            console.log(`[Opportunity] Updated existing opportunity for ${opportunity.symbol}`);
            return existing;
        }
        opps.unshift(opportunity);
        database_1.LocalDatabase.set('opportunities', opps);
        alertService_1.AlertService.log('INFO', 'Opportunity', `New Trade Opportunity: ${opportunity.symbol} ${opportunity.direction}`);
        return opportunity;
    },
    updateStatus(id, status, reason) {
        const opps = this.getOpportunities();
        const opp = opps.find(o => o.id === id);
        if (opp && opp.status !== status) {
            opp.status = status;
            if (reason && status === 'INVALIDATED') {
                opp.reason = `Invalidated: ${reason}`;
            }
            database_1.LocalDatabase.set('opportunities', opps);
        }
    }
};
