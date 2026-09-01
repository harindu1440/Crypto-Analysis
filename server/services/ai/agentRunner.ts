import { AIAgent } from './aiAgent';
import { GeminiProvider } from './providers/geminiProvider';
import { AnalysisService } from '../analysis/analysisService';
import { MasterDecisionOutput, TradeSide } from './schemas/types';
import { OpportunityService } from '../opportunities/opportunityService';
import { TradeOpportunity } from '../opportunities/types';
import { SignalQualityService } from './signalQualityService';
import { AdaptiveIntelligenceService } from './adaptiveIntelligenceService';
import { EventBus } from '../system/eventBus';
import crypto from 'crypto';

const provider = new GeminiProvider();
const agent = new AIAgent(provider);

let aiSystemPaused = false;
let aiSystemPauseTimer: NodeJS.Timeout | null = null;

// In-memory lock to prevent duplicate concurrent analysis
const activeAnalysisLocks = new Set<string>();

// Simple in-memory cache to store the latest analysis per symbol
const latestAnalysisResults = new Map<string, MasterDecisionOutput>();

export const AgentRunner = {
  
  async runAnalysis(symbol: string, triggerPayload?: any): Promise<MasterDecisionOutput> {
    if (aiSystemPaused) {
      console.warn(`[AgentRunner] AI System is currently paused due to rate limits or failures. Skipping analysis for ${symbol}.`);
      throw new Error('AI System Paused');
    }

    const lockKey = `${symbol}-analysis`;
    
    if (activeAnalysisLocks.has(lockKey)) {
      throw new Error(`Analysis for ${symbol} is already in progress.`);
    }

    activeAnalysisLocks.add(lockKey);
    console.log(`[AgentRunner] Started AI analysis pipeline for ${symbol}`);

    try {
      // 1. Get Normalized Market Data Snapshot
      const data = await AnalysisService.getAnalysisSnapshot(symbol, ['15m', '1h', '4h', '1d']);
      
      // 2. Run Lightweight Screening First
      const screening = await agent.analyzeScreening(data);
      if (!screening.passScreening || screening.status === 'ERROR') {
        const result: MasterDecisionOutput = {
          analysisId: crypto.randomUUID(),
          symbol,
          timestamp: Date.now(),
          provider: provider.name,
          decision: 'NO_TRADE',
          confidence: 0,
          timeframe: '1h',
          marketBias: 'NEUTRAL',
          reasoning: screening.status === 'ERROR' ? 'Screening failed (Quota/Error).' : 'Screening rejected: No meaningful setup forming.',
          supportingFactors: [],
          conflictingFactors: [],
          riskLevel: 'LOW',
          tradeCandidate: null,
          agentResults: { screening } as any,
          consensusScore: '0/0'
        };
        console.log(`[AgentRunner] Completed AI screening for ${symbol}. Decision: NO_TRADE (${result.reasoning})`);
        return result;
      }
      
      // 3. Run independent specialist agents concurrently
      // Run independent specialist agents sequentially or in small batches to respect Gemini Free Tier 15 RPM limit
      const marketContext = await agent.analyzeMarketContext(data);
      const technical = await agent.analyzeTechnicals(data);
      const pattern = await agent.analyzePatterns(data);
      
      // Add a small 2-second delay to let the bucket refill slightly
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const timeframe = await agent.analyzeTimeframes(data);
      const liquidity = await agent.analyzeLiquidity(data);
      const sentiment = await agent.analyzeSentiment(data);

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
      
      // Store in memory cache
      latestAnalysisResults.set(symbol, finalResult);

      EventBus.publish({
        eventType: 'AI_ANALYSIS_COMPLETED',
        source: 'AgentRunner',
        symbol,
        payload: {
          decision: finalResult.decision,
          confidence: finalResult.confidence,
          triggerPayload
        }
      });

      // Deterministic Validation & R:R recalculation
      if (finalResult.decision === 'CANDIDATE_TRADE' && finalResult.tradeCandidate) {
        let valid = true;
        const c = finalResult.tradeCandidate;
        const entryPrice = (c.entryZone.min + c.entryZone.max) / 2;
        
        if (c.side === 'LONG') {
          if (c.stopLoss >= entryPrice) valid = false;
          c.takeProfitLevels.forEach(tp => { if (tp <= entryPrice) valid = false; });
        } else {
          if (c.stopLoss <= entryPrice) valid = false;
          c.takeProfitLevels.forEach(tp => { if (tp >= entryPrice) valid = false; });
        }

        if (valid) {
          const risk = Math.abs(entryPrice - c.stopLoss);
          const reward = Math.abs(c.takeProfitLevels[0] - entryPrice);
          c.riskRewardRatio = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0;
          
          if (c.riskRewardRatio < 1.0) valid = false; // Reject poor R:R
        }

        if (!valid) {
          finalResult.decision = 'NO_TRADE';
          finalResult.reasoning = 'Deterministically rejected by Risk validation engine. ' + finalResult.reasoning;
          finalResult.tradeCandidate = null;
        }
      }

      // Phase 15: AI Signal Quality & Validation
      const qualityEval = SignalQualityService.evaluateOpportunity(finalResult, data);

      if (finalResult.decision === 'CANDIDATE_TRADE' && finalResult.tradeCandidate) {
        if (!qualityEval.isQualified) {
          finalResult.decision = 'NO_TRADE';
          finalResult.reasoning = `Quality Engine Rejected: ${qualityEval.rejectionReasons.join(', ')} | ` + finalResult.reasoning;
          finalResult.tradeCandidate = null;
        }
      }

      // Phase 19: Adaptive Intelligence Calibration
      let adaptiveCalibration: any = null;
      if (finalResult.decision === 'CANDIDATE_TRADE' && finalResult.tradeCandidate && qualityEval.isQualified) {
        adaptiveCalibration = AdaptiveIntelligenceService.calibrateSignal(finalResult, qualityEval, data);
        
        // Update the final result with calibrated confidence
        finalResult.confidence = adaptiveCalibration.calibratedConfidence;
      }

      // Phase 12 & 15 & 19: Generate Global Trade Opportunity if valid & qualified
      if (finalResult.decision === 'CANDIDATE_TRADE' && finalResult.tradeCandidate && qualityEval.isQualified) {
        const c = finalResult.tradeCandidate;
        const opp: TradeOpportunity & { adaptiveIntelligence?: any } = {
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
          
          agents: [
            { name: 'Market Structure', bias: marketContext.broaderTrend, explanation: marketContext.marketCondition },
            { name: 'Technical Analysis', bias: technical.technicalBias, explanation: technical.technicalReasoning },
            { name: 'Pattern Analysis', bias: pattern.bias, explanation: pattern.patternInterpretation },
            { name: 'Liquidity Analysis', bias: liquidity.bias, explanation: liquidity.liquidityReasoning },
            { name: 'Sentiment', bias: sentiment.bias, explanation: sentiment.sentimentReasoning }
          ],
          timeframes: [
            { timeframe: '1D', bias: timeframe.higherTimeframeBias },
            { timeframe: '4H', bias: timeframe.mediumTermBias },
            { timeframe: '1H', bias: timeframe.shortTermBias },
            { timeframe: '15m', bias: finalResult.decision === 'CANDIDATE_TRADE' ? finalResult.tradeCandidate?.side === 'LONG' ? 'BULLISH' : 'BEARISH' : 'NEUTRAL' }
          ],
          marketData: {
            price: data.market.price,
            volume24h: data.market.volume24h,
            change24h: data.market.change24h,
            volatility: data.timeframes['1h']?.volatility.level || 'MEDIUM'
          },

          qualityScore: adaptiveCalibration ? adaptiveCalibration.calibratedQualityScore : qualityEval.score,
          qualityBreakdown: qualityEval.breakdown,
          rejectionReasons: qualityEval.rejectionReasons,
          adaptiveIntelligence: adaptiveCalibration,
          fingerprint: `${symbol}-${c.side}-${c.timeframe}-${qualityEval.marketRegime}`,
          version: 1,
          updatedAt: Date.now(),
          
          createdAt: Date.now(),
          expiresAt: Date.now() + (6 * 60 * 60 * 1000), // 6 hours
          status: 'QUALIFIED'
        };
        OpportunityService.addOpportunity(opp);
      }

      return finalResult;
    } catch (e: any) {
      console.error(`[AgentRunner] Analysis failed for ${symbol}:`, e.message);
      
      if (e.message?.includes('DAILY_QUOTA_EXHAUSTED')) {
        console.warn(`[AgentRunner] DAILY QUOTA EXHAUSTED for ${symbol}. Marking as NO_TRADE / INCOMPLETE.`);
        return {
          analysisId: crypto.randomUUID(),
          symbol,
          timestamp: Date.now(),
          provider: provider.name,
          decision: 'NO_TRADE',
          confidence: 0,
          timeframe: '1h',
          marketBias: 'NEUTRAL',
          reasoning: 'ANALYSIS_INCOMPLETE: Daily Quota Exhausted. Existing opportunities will be tracked deterministically.',
          supportingFactors: [],
          conflictingFactors: ['API Quota Exhausted'],
          riskLevel: 'LOW',
          tradeCandidate: null,
          agentResults: {} as any,
          consensusScore: '0/0'
        };
      }
      
      // If we hit rate limits or Gemini is down, pause new requests for 60 seconds
      if (e.message?.includes('429') || e.message?.includes('500') || e.message?.includes('RESOURCE_EXHAUSTED') || e.message?.includes('Quota Exhausted')) {
        if (!aiSystemPaused) {
          console.warn('[AgentRunner] ⚠️ Gemini failure detected. Pausing new AI requests for 60 seconds.');
          aiSystemPaused = true;
          
          EventBus.publish({
            eventType: 'SYSTEM_ALERT',
            source: 'AgentRunner',
            payload: { message: 'AI System Degraded: Rate limit or upstream error. Market monitoring continues.' }
          });

          if (aiSystemPauseTimer) clearTimeout(aiSystemPauseTimer);
          aiSystemPauseTimer = setTimeout(() => {
            console.log('[AgentRunner] 🟢 Resuming AI requests.');
            aiSystemPaused = false;
          }, 60000);
        }
      }
      
      throw e;
    } finally {
      activeAnalysisLocks.delete(lockKey);
    }
  },

  getLatestAnalysis(symbol: string): MasterDecisionOutput | null {
    return latestAnalysisResults.get(symbol) || null;
  }
};
