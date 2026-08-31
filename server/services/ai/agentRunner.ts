import { AIAgent } from './aiAgent';
import { MockProvider } from './providers/mockProvider';
import { AnalysisService } from '../analysis/analysisService';
import { MasterDecisionOutput, TradeSide } from './schemas/types';
import { OpportunityService } from '../opportunities/opportunityService';
import { TradeOpportunity } from '../opportunities/types';
import crypto from 'crypto';

// In a real app we'd load the correct provider via env. For now we use the mock.
const provider = new MockProvider();
const agent = new AIAgent(provider);

// In-memory lock to prevent duplicate concurrent analysis
const activeAnalysisLocks = new Set<string>();

// Simple in-memory cache to store the latest analysis per symbol
const latestAnalysisResults = new Map<string, MasterDecisionOutput>();

export const AgentRunner = {
  
  async runAnalysis(symbol: string): Promise<MasterDecisionOutput> {
    const lockKey = `${symbol}-analysis`;
    
    if (activeAnalysisLocks.has(lockKey)) {
      throw new Error(`Analysis for ${symbol} is already in progress.`);
    }

    activeAnalysisLocks.add(lockKey);
    console.log(`[AgentRunner] Started AI analysis pipeline for ${symbol}`);

    try {
      // 1. Get Normalized Market Data Snapshot
      const data = await AnalysisService.getAnalysisSnapshot(symbol, ['15m', '1h', '4h', '1d']);
      
      // 2. Run independent specialist agents concurrently
      const [marketContext, technical, pattern, timeframe, liquidity, sentiment] = await Promise.all([
        agent.analyzeMarketContext(data),
        agent.analyzeTechnicals(data),
        agent.analyzePatterns(data),
        agent.analyzeTimeframes(data),
        agent.analyzeLiquidity(data),
        agent.analyzeSentiment(data)
      ]);

      const specialistResults = { marketContext, technical, pattern, timeframe, liquidity, sentiment };

      // 3. Run Risk Analysis (which needs the other specialist results)
      const risk = await agent.analyzeRisk(data, specialistResults);

      const allAgentResults = { ...specialistResults, risk };

      // 4. Run Master Decision Agent
      const masterDecisionRaw = await agent.makeMasterDecision(data, allAgentResults);

      // Calculate Consensus
      let bullishCount = 0;
      let bearishCount = 0;
      const biases = [
        marketContext.broaderTrend,
        technical.technicalBias,
        pattern.bias,
        liquidity.bias,
        sentiment.bias
      ];
      
      biases.forEach(b => {
        if (b === 'BULLISH') bullishCount++;
        else if (b === 'BEARISH') bearishCount++;
      });
      
      const consensusDirection = bullishCount > bearishCount ? 'BULLISH' : (bearishCount > bullishCount ? 'BEARISH' : 'NEUTRAL');
      const maxScore = Math.max(bullishCount, bearishCount);
      const consensusScore = `${maxScore}/${biases.length}`;

      // 5. Build final validated result
      const finalResult: MasterDecisionOutput = {
        analysisId: crypto.randomUUID(),
        symbol,
        timestamp: Date.now(),
        provider: provider.name,
        ...masterDecisionRaw,
        agentResults: allAgentResults,
        consensusScore
      };

      console.log(`[AgentRunner] Completed AI analysis for ${symbol}. Decision: ${finalResult.decision}`);
      
      // Save to memory
      latestAnalysisResults.set(symbol, finalResult);

      // Phase 12: Generate Global Trade Opportunity if valid
      if (finalResult.decision === 'CANDIDATE_TRADE' && finalResult.tradeCandidate && maxScore >= 3) {
        const c = finalResult.tradeCandidate;
        const opp: TradeOpportunity = {
          id: crypto.randomUUID(),
          symbol,
          direction: c.side,
          setup: `${consensusDirection} Consensus`,
          currentPrice: c.entryZone.max, // Approximation
          entryZone: c.entryZone,
          entryPrice: (c.entryZone.min + c.entryZone.max) / 2,
          stopLoss: c.stopLoss,
          takeProfitTargets: c.takeProfitLevels,
          riskRewardRatio: c.riskRewardRatio,
          confidence: finalResult.confidence,
          timeframe: finalResult.timeframe,
          higherTimeframeBias: timeframe.higherTimeframeBias,
          marketStructure: marketContext.marketCondition,
          technicalSummary: technical.technicalReasoning,
          patternSummary: pattern.patternInterpretation,
          liquiditySummary: liquidity.liquidityReasoning,
          sentimentSummary: sentiment.sentimentReasoning,
          reason: finalResult.reasoning,
          invalidationCondition: c.invalidationCondition,
          createdAt: Date.now(),
          expiresAt: Date.now() + (6 * 60 * 60 * 1000), // 6 hours
          status: 'DETECTED'
        };
        OpportunityService.addOpportunity(opp);
      }

      return finalResult;
    } finally {
      activeAnalysisLocks.delete(lockKey);
    }
  },

  getLatestAnalysis(symbol: string): MasterDecisionOutput | null {
    return latestAnalysisResults.get(symbol) || null;
  }
};
