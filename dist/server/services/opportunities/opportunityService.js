"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpportunityService = void 0;
const database_1 = require("../../config/database");
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
            require('../notifications/notificationOrchestrator').NotificationOrchestrator.dispatch('UPDATED', 'INFO', `Opportunity Updated: ${updatedOpp.symbol}`, `The AI analysis for ${updatedOpp.symbol} has been updated. Score: ${updatedOpp.qualityScore}`, updatedOpp);
            return updatedOpp;
        }
        opps.unshift(opportunity);
        database_1.LocalDatabase.set('opportunities', opps);
        require('../notifications/notificationOrchestrator').NotificationOrchestrator.dispatch('NEW_OPPORTUNITY', 'HIGH', `New Opportunity: ${opportunity.symbol} ${opportunity.direction}`, `A new high-quality setup was detected. Score: ${opportunity.qualityScore}`, opportunity);
        return opportunity;
    },
    updateOpportunity(opportunity) {
        const opps = this.getOpportunities();
        const index = opps.findIndex(o => o.id === opportunity.id);
        if (index !== -1) {
            opps[index] = opportunity;
            database_1.LocalDatabase.set('opportunities', opps);
        }
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
