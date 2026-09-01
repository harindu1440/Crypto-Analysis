"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIPerformanceTracker = void 0;
class AIPerformanceTracker {
    static decisions = [];
    static trackDecision(decision) {
        // In a real database, we would insert this into the AI_PERFORMANCE_LOG table.
        // We store it in memory for now.
        if (!decision.analysisId)
            return;
        this.decisions.push({
            ...decision,
            id: decision.analysisId
        });
        // Maintain maximum cache size (e.g., last 1000 decisions)
        if (this.decisions.length > 1000) {
            this.decisions.shift();
        }
    }
    static trackConsensus(consensusDecision, individualDecisions) {
        // We could store the linkage between the consensus result and the individuals.
        this.trackDecision(consensusDecision);
    }
    static getProviderAccuracy(provider) {
        // Placeholder for future performance weighting logic
        // Currently returns dummy data
        return { total: 0, accurate: 0 };
    }
}
exports.AIPerformanceTracker = AIPerformanceTracker;
