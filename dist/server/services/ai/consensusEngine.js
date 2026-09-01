"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsensusEngine = void 0;
const crypto_1 = __importDefault(require("crypto"));
class ConsensusEngine {
    static calculateConsensus(symbol, decisions, minModels, minConsensusPercent) {
        const validDecisions = decisions.filter(d => d && d.decision);
        if (validDecisions.length < minModels) {
            return this.createFallback(symbol, 'Insufficient models available for consensus.', validDecisions);
        }
        let buyWeight = 0;
        let sellWeight = 0;
        let waitWeight = 0;
        let totalWeight = 0;
        const candidates = [];
        for (const dec of validDecisions) {
            const weight = 1 + (dec.confidence / 100); // Base weight 1 + up to 1 for 100% confidence
            totalWeight += weight;
            if (dec.decision === 'CANDIDATE_TRADE' && dec.tradeCandidate) {
                if (dec.tradeCandidate.side === 'LONG') {
                    buyWeight += weight;
                }
                else {
                    sellWeight += weight;
                }
                candidates.push(dec.tradeCandidate);
            }
            else {
                waitWeight += weight;
            }
        }
        const buyPercent = (buyWeight / totalWeight) * 100;
        const sellPercent = (sellWeight / totalWeight) * 100;
        const waitPercent = (waitWeight / totalWeight) * 100;
        let finalDecision = 'NO_TRADE';
        let finalCandidate = null;
        let finalConfidence = 0;
        let reasoning = `Consensus Breakdown - BUY: ${buyPercent.toFixed(1)}%, SELL: ${sellPercent.toFixed(1)}%, WAIT: ${waitPercent.toFixed(1)}% | Models: ${validDecisions.length}`;
        if (buyPercent >= minConsensusPercent) {
            finalDecision = 'CANDIDATE_TRADE';
            finalConfidence = buyPercent;
            finalCandidate = candidates.find(c => c.side === 'LONG') || null;
        }
        else if (sellPercent >= minConsensusPercent) {
            finalDecision = 'CANDIDATE_TRADE';
            finalConfidence = sellPercent;
            finalCandidate = candidates.find(c => c.side === 'SHORT') || null;
        }
        else {
            reasoning = 'Consensus not reached or models disagree significantly. ' + reasoning;
        }
        // Average out risk level
        const riskLevels = validDecisions.map(d => d.riskLevel);
        let finalRisk = 'MEDIUM';
        if (riskLevels.includes('EXTREME'))
            finalRisk = 'EXTREME';
        else if (riskLevels.includes('HIGH'))
            finalRisk = 'HIGH';
        return {
            analysisId: crypto_1.default.randomUUID(),
            symbol,
            timestamp: Date.now(),
            provider: 'Multi-Model-Consensus',
            decision: finalDecision,
            confidence: finalConfidence,
            timeframe: validDecisions[0]?.timeframe || '1h',
            marketBias: finalDecision === 'CANDIDATE_TRADE' ? (finalCandidate?.side === 'LONG' ? 'BULLISH' : 'BEARISH') : 'NEUTRAL',
            reasoning,
            supportingFactors: validDecisions.flatMap(d => d.supportingFactors).slice(0, 5),
            conflictingFactors: validDecisions.flatMap(d => d.conflictingFactors).slice(0, 5),
            riskLevel: finalRisk,
            tradeCandidate: finalCandidate,
            agentResults: {}, // Multi-model doesn't use the legacy 7-step structure here
            consensusScore: `${validDecisions.length}/${validDecisions.length}`
        };
    }
    static createFallback(symbol, reason, partialResults) {
        return {
            analysisId: crypto_1.default.randomUUID(),
            symbol,
            timestamp: Date.now(),
            provider: 'Multi-Model-Consensus',
            decision: 'NO_TRADE',
            confidence: 0,
            timeframe: '1h',
            marketBias: 'NEUTRAL',
            reasoning: reason,
            supportingFactors: [],
            conflictingFactors: ['Insufficient model participation'],
            riskLevel: 'HIGH',
            tradeCandidate: null,
            agentResults: {},
            consensusScore: `${partialResults.length}/Required`
        };
    }
}
exports.ConsensusEngine = ConsensusEngine;
