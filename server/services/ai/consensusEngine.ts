import { MasterDecisionOutput, Decision } from './schemas/types';
import crypto from 'crypto';

export class ConsensusEngine {
  
  public static calculateConsensus(
    symbol: string,
    decisions: MasterDecisionOutput[],
    minModels: number,
    minConsensusPercent: number
  ): MasterDecisionOutput {
    
    const validDecisions = decisions.filter(d => d && d.decision);
    
    // Adaptive minimum: if we got fewer models than expected (e.g. Gemini in cooldown),
    // scale down gracefully. Minimum of 1 valid model still allows a decision.
    const adaptedMinModels = Math.min(minModels, Math.max(1, decisions.length));
    
    if (validDecisions.length < adaptedMinModels) {
      return this.createFallback(symbol, `Insufficient models available for consensus. Got ${validDecisions.length}, need ${adaptedMinModels}.`, validDecisions);
    }
    
    let buyWeight = 0;
    let sellWeight = 0;
    let waitWeight = 0;
    
    let totalWeight = 0;
    
    const candidates = [];
    const modelUsageCount: Record<string, number> = {};
    
    // First pass: count models
    for (const dec of validDecisions) {
       const providerId = dec.provider;
       modelUsageCount[providerId] = (modelUsageCount[providerId] || 0) + 1;
    }
    const uniqueModelsCount = Object.keys(modelUsageCount).length;
    
    for (const dec of validDecisions) {
      // Base weight from confidence
      let weight = 1 + (dec.confidence / 100);
      
      // Penalize models that dominate the consensus to prevent echo-chamber effect
      const usageCount = modelUsageCount[dec.provider];
      if (usageCount > 1) {
         weight = weight / Math.sqrt(usageCount); // e.g. 4 usages = weight divided by 2
      }
      
      totalWeight += weight;
      
      if (dec.decision === 'CANDIDATE_TRADE' && dec.tradeCandidate) {
        if (dec.tradeCandidate.side === 'LONG') {
          buyWeight += weight;
        } else {
          sellWeight += weight;
        }
        candidates.push(dec.tradeCandidate);
      } else {
        waitWeight += weight;
      }
    }
    
    const buyPercent = (buyWeight / totalWeight) * 100;
    const sellPercent = (sellWeight / totalWeight) * 100;
    const waitPercent = (waitWeight / totalWeight) * 100;
    
    let finalDecision: Decision = 'NO_TRADE';
    let finalCandidate = null;
    let finalConfidence = 0;
    let reasoning = `Consensus Breakdown - BUY: ${buyPercent.toFixed(1)}%, SELL: ${sellPercent.toFixed(1)}%, WAIT: ${waitPercent.toFixed(1)}% | Models: ${validDecisions.length} (Unique: ${uniqueModelsCount})`;
    
    if (buyPercent >= minConsensusPercent) {
      finalDecision = 'CANDIDATE_TRADE';
      finalConfidence = buyPercent;
      finalCandidate = candidates.find(c => c.side === 'LONG') || null;
    } else if (sellPercent >= minConsensusPercent) {
      finalDecision = 'CANDIDATE_TRADE';
      finalConfidence = sellPercent;
      finalCandidate = candidates.find(c => c.side === 'SHORT') || null;
    } else {
      reasoning = 'Consensus not reached or models disagree significantly. ' + reasoning;
    }
    
    // Average out risk level
    const riskLevels = validDecisions.map(d => d.riskLevel);
    let finalRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' = 'MEDIUM';
    if (riskLevels.includes('EXTREME')) finalRisk = 'EXTREME';
    else if (riskLevels.includes('HIGH')) finalRisk = 'HIGH';
    
    return {
      analysisId: crypto.randomUUID(),
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
      agentResults: {} as any, // Multi-model doesn't use the legacy 7-step structure here
      consensusScore: `${validDecisions.length}/${validDecisions.length}`
    };
  }
  
  private static createFallback(symbol: string, reason: string, partialResults: MasterDecisionOutput[]): MasterDecisionOutput {
    return {
      analysisId: crypto.randomUUID(),
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
      agentResults: {} as any,
      consensusScore: `${partialResults.length}/Required`
    };
  }
}
