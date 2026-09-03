import { MasterDecisionOutput, Decision } from './schemas/types';
import crypto from 'crypto';

export class ConsensusEngine {
  
  public static calculateConsensus(
    symbol: string,
    decisions: MasterDecisionOutput[],
    minModels: number,
    minConsensusPercent: number,
    expectedTotalRoles: number = 1,
    failedAnalyses: number = 0,
    unavailableAnalyses: number = 0
  ): MasterDecisionOutput {
    
    const validDecisions = decisions.filter(d => d && d.decision);
    const modelsUsed = validDecisions.length;
    
    // Strict minimum: if we got fewer valid decisions than the configured minimum, fail.
    // (We only relax this if the total expected roles is somehow less than minModels)
    const strictMinModels = Math.min(minModels, expectedTotalRoles);
    
    if (validDecisions.length < strictMinModels) {
      return this.createFallback(symbol, `Insufficient models available for consensus. Got ${validDecisions.length}, need ${strictMinModels}.`, validDecisions, failedAnalyses, unavailableAnalyses);
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
      // Weights based on role (Technical/PriceAction have higher weight)
      let roleWeight = 1.0;
      if (dec.role === 'TECHNICAL ANALYST' || dec.role === 'PRICE ACTION ANALYST') roleWeight = 1.25;
      else if (dec.role === 'MOMENTUM ANALYST' || dec.role === 'INDEPENDENT MARKET ANALYST') roleWeight = 1.0;
      else if (dec.role === 'RISK CHALLENGER') roleWeight = 0.75; // Risk focuses on veto

      // Base weight from confidence
      let weight = (1 + (dec.confidence / 100)) * roleWeight;
      
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
    
    let finalDecision: Decision | null = 'NO_TRADE';
    let finalStatus: any = 'NO_TRADE';
    let finalCandidate = null;
    let finalConfidence = 0;
    let reasoning = `Consensus Breakdown - BUY: ${buyPercent.toFixed(1)}%, SELL: ${sellPercent.toFixed(1)}%, WAIT: ${waitPercent.toFixed(1)}% | Models: ${validDecisions.length} (Unique: ${uniqueModelsCount})`;
    
    // Check against config thresholds (using the environment or default)
    const minConfidenceRequired = parseInt(process.env.AI_MIN_CONFIDENCE || '65');
    
    if (buyPercent >= minConsensusPercent && buyPercent >= minConfidenceRequired) {
      finalDecision = 'BUY';
      finalStatus = 'TRADE_READY';
      finalConfidence = buyPercent;
      finalCandidate = candidates.find(c => c.side === 'LONG') || null;
    } else if (sellPercent >= minConsensusPercent && sellPercent >= minConfidenceRequired) {
      finalDecision = 'SELL';
      finalStatus = 'TRADE_READY';
      finalConfidence = sellPercent;
      finalCandidate = candidates.find(c => c.side === 'SHORT') || null;
    } else {
      reasoning = 'Consensus not reached or confidence too low. ' + reasoning;
      finalDecision = 'NO_TRADE';
      finalStatus = 'NO_TRADE';
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
      status: finalStatus,
      decision: finalDecision,
      confidence: finalConfidence,
      timeframe: validDecisions[0]?.timeframe || '1h',
      marketBias: finalStatus === 'TRADE_READY' ? (finalCandidate?.side === 'LONG' ? 'BULLISH' : 'BEARISH') : 'NEUTRAL',
      reasoning,
      supportingFactors: validDecisions.flatMap(d => d.supportingFactors).slice(0, 5),
      conflictingFactors: validDecisions.flatMap(d => d.conflictingFactors).slice(0, 5),
      riskLevel: finalRisk,
      tradeCandidate: finalCandidate,
      agentResults: {} as any, // Multi-model doesn't use the legacy 7-step structure here
      consensusScore: `${validDecisions.length}/${validDecisions.length}`,
      modelsUsed,
      successfulAnalyses: validDecisions.length,
      failedAnalyses,
      unavailableAnalyses
    };
  }
  
  private static createFallback(symbol: string, reason: string, partialResults: MasterDecisionOutput[], failedAnalyses: number = 0, unavailableAnalyses: number = 0): MasterDecisionOutput {
    return {
      analysisId: crypto.randomUUID(),
      symbol,
      timestamp: Date.now(),
      provider: 'Multi-Model-Consensus',
      status: 'AI_UNAVAILABLE', // Must be AI_UNAVAILABLE not NO_TRADE or just ANALYSIS_FAILED if it didn't meet min requirements
      decision: null,
      confidence: 0,
      timeframe: '1h',
      marketBias: 'NEUTRAL',
      reasoning: reason,
      supportingFactors: [],
      conflictingFactors: ['Insufficient model participation'],
      riskLevel: 'HIGH',
      tradeCandidate: null,
      agentResults: {} as any,
      consensusScore: `${partialResults.length}/Required`,
      modelsUsed: partialResults.length,
      successfulAnalyses: partialResults.length,
      failedAnalyses,
      unavailableAnalyses,
      failureReason: reason
    };
  }
}
