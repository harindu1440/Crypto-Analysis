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
        // Phase 15: Deduplication logic based on fingerprint
        const existingIndex = opps.findIndex(o => o.fingerprint === opportunity.fingerprint &&
            ['DETECTED', 'ANALYZING', 'VALIDATING', 'QUALIFIED', 'ACTIVE', 'APPROACHING_ENTRY'].includes(o.status));
        if (existingIndex !== -1) {
            const existing = opps[existingIndex];
            // Update existing instead of spamming
            const updatedOpp = {
                ...existing,
                ...opportunity,
                id: existing.id,
                createdAt: existing.createdAt,
                version: (existing.version || 1) + 1,
                updatedAt: Date.now()
            };
            opps[existingIndex] = updatedOpp;
            database_1.LocalDatabase.set('opportunities', opps);
            console.log(`[Opportunity] Updated existing opportunity for ${opportunity.symbol} (v${updatedOpp.version})`);
            return updatedOpp;
        }
        opps.unshift(opportunity);
        database_1.LocalDatabase.set('opportunities', opps);
        alertService_1.AlertService.log('INFO', 'Opportunity', `New Qualified Trade Opportunity: ${opportunity.symbol} ${opportunity.direction} (Score: ${opportunity.qualityScore})`);
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
