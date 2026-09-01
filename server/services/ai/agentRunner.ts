/**
 * AgentRunner — Phase 20.2 (Dynamic Model Router)
 *
 * All AI calls now route through DynamicModelRouter.executeWithFailover().
 * Provider failures never produce NO_TRADE until all eligible models are exhausted.
 */
import { AIAgent } from './aiAgent';
import { ProviderRegistry } from './providers/providerRegistry';
import { ConsensusEngine } from './consensusEngine';
import { AnalysisService } from '../analysis/analysisService';
import { MasterDecisionOutput } from './schemas/types';
import { OpportunityService } from '../opportunities/opportunityService';
import { TradeOpportunity } from '../opportunities/types';
import { SignalQualityService } from './signalQualityService';
import { AdaptiveIntelligenceService } from './adaptiveIntelligenceService';
import { EventBus } from '../system/eventBus';
import { DynamicModelRouter, AIUnavailableError } from './dynamicModelRouter';
import { ModelRegistry } from './modelRegistry';
import { AIPerformanceTracker } from './aiPerformanceTracker';
import { PROMPTS } from './prompts';
import { ROLE_PROMPTS } from './prompts/roles';
import crypto from 'crypto';

// Initialize provider registry (also populates ModelRegistry)
ProviderRegistry.initialize();

// In-memory lock to prevent duplicate concurrent analysis
const activeAnalysisLocks = new Set<string>();

// Simple in-memory cache to store the latest analysis per symbol
const latestAnalysisResults = new Map<string, MasterDecisionOutput>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUnavailableResult(symbol: string, attemptedModels: string[]): MasterDecisionOutput {
  return {
    analysisId: crypto.randomUUID(),
    symbol,
    timestamp: Date.now(),
    provider: 'AI_UNAVAILABLE',
    decision: 'NO_TRADE',
    confidence: 0,
    timeframe: '1h',
    marketBias: 'NEUTRAL',
    reasoning: `AI_UNAVAILABLE: All eligible models exhausted (${attemptedModels.join(', ')}). Existing opportunities tracked deterministically.`,
    supportingFactors: [],
    conflictingFactors: ['All AI models unavailable'],
    riskLevel: 'LOW',
    tradeCandidate: null,
    agentResults: {} as any,
    consensusScore: '0/0'
  };
}

// ─── AgentRunner ──────────────────────────────────────────────────────────────

export const AgentRunner = {

  async runAnalysis(symbol: string, triggerPayload?: any): Promise<MasterDecisionOutput> {
    const lockKey = `${symbol}-analysis`;

    if (activeAnalysisLocks.has(lockKey)) {
      throw new Error(`Analysis for ${symbol} is already in progress.`);
    }

    activeAnalysisLocks.add(lockKey);
    const analysisRequestId = crypto.randomUUID();
    console.log(`[AgentRunner] Started AI analysis pipeline for ${symbol} (ID: ${analysisRequestId})`);

    try {
      // ── 1. Get Market Data Snapshot ─────────────────────────────────────────
      const data = await AnalysisService.getAnalysisSnapshot(symbol, ['15m', '1h', '4h', '1d']);

      // ── 2. Lightweight Screening via DynamicModelRouter ─────────────────────
      // The router automatically fails over to the next best model if needed.
      let screeningResult: any;
      let screeningModelId: string;
      try {
        const routerResult = await DynamicModelRouter.executeWithFailover<any>(
          JSON.stringify(data),
          'ScreeningAnalysis',
          `${PROMPTS.screening.description}\n${PROMPTS.screening.instructions}`,
          `Screening:${symbol}`,
          undefined,
          { analysisRequestId, roleRequestId: crypto.randomUUID(), expectedTotalRoles: 1 }
        );
        screeningResult = routerResult.data;
        screeningModelId = routerResult.modelId;
      } catch (err) {
        if (err instanceof AIUnavailableError) {
          console.warn(`[AgentRunner] AI_UNAVAILABLE during screening for ${symbol}.`);
          return makeUnavailableResult(symbol, err.attemptedModels);
        }
        throw err;
      }

      // ── 3. Screening Gate ────────────────────────────────────────────────────
      if (!screeningResult?.passScreening || screeningResult?.status === 'ERROR') {
        const result: MasterDecisionOutput = {
          analysisId: crypto.randomUUID(),
          symbol,
          timestamp: Date.now(),
          provider: screeningModelId,
          decision: 'NO_TRADE',
          confidence: 0,
          timeframe: '1h',
          marketBias: 'NEUTRAL',
          reasoning: 'Screening rejected: No meaningful setup forming.',
          supportingFactors: [],
          conflictingFactors: [],
          riskLevel: 'LOW',
          tradeCandidate: null,
          agentResults: { screening: screeningResult } as any,
          consensusScore: '0/0'
        };
        console.log(`[AgentRunner] Screening REJECTED for ${symbol}. No trade setup forming.`);
        return result;
      }

      // ── 4. Deep Analysis Pipeline ────────────────────────────────────────────
      let finalResult: MasterDecisionOutput;

      const minModels = parseInt(process.env.AI_MIN_MODELS || '2');
      const minConsensusPercent = parseInt(process.env.AI_MIN_CONSENSUS_PERCENT || '60');
      const eligibleModels = ModelRegistry.getEligible();

      if (ProviderRegistry.isGeminiOnly()) {
        // ── Legacy single-model pipeline (each step through router) ────────────
        console.log(`[AgentRunner] Running Single-Model Pipeline for ${symbol} (via router)`);

        try {
          const [mcRes, techRes, patRes] = await Promise.all([
            DynamicModelRouter.executeWithFailover<any>(JSON.stringify(data), 'MarketContext', `${PROMPTS.marketContext.description}\n${PROMPTS.marketContext.instructions}`, `MarketContext:${symbol}`),
            DynamicModelRouter.executeWithFailover<any>(JSON.stringify(data), 'TechnicalAnalysis', `${PROMPTS.technical.description}\n${PROMPTS.technical.instructions}`, `Technical:${symbol}`),
            DynamicModelRouter.executeWithFailover<any>(JSON.stringify(data), 'PatternAnalysis', `${PROMPTS.pattern.description}\n${PROMPTS.pattern.instructions}`, `Pattern:${symbol}`)
          ]);

          // Small breather between batches for free-tier rate limits
          await new Promise(resolve => setTimeout(resolve, 1500));

          const [tfRes, liqRes, sentRes] = await Promise.all([
            DynamicModelRouter.executeWithFailover<any>(JSON.stringify(data), 'TimeframeAnalysis', `${PROMPTS.timeframe.description}\n${PROMPTS.timeframe.instructions}`, `Timeframe:${symbol}`),
            DynamicModelRouter.executeWithFailover<any>(JSON.stringify(data), 'LiquidityAnalysis', `${PROMPTS.liquidity.description}\n${PROMPTS.liquidity.instructions}`, `Liquidity:${symbol}`),
            DynamicModelRouter.executeWithFailover<any>(JSON.stringify(data), 'SentimentAnalysis', `${PROMPTS.sentiment.description}\n${PROMPTS.sentiment.instructions}`, `Sentiment:${symbol}`)
          ]);

          const marketContext = mcRes.data;
          const technical = techRes.data;
          const pattern = patRes.data;
          const timeframe = tfRes.data;
          const liquidity = liqRes.data;
          const sentiment = sentRes.data;
          const specialistResults = { marketContext, technical, pattern, timeframe, liquidity, sentiment };

          const riskRes = await DynamicModelRouter.executeWithFailover<any>(
            JSON.stringify({ data, otherAnalysis: specialistResults }),
            'RiskAnalysis',
            `${PROMPTS.risk.description}\n${PROMPTS.risk.instructions}`,
            `Risk:${symbol}`
          );
          const risk = riskRes.data;
          const allAgentResults = { ...specialistResults, risk };

          const masterRes = await DynamicModelRouter.executeWithFailover<any>(
            JSON.stringify({ data, agentResults: allAgentResults }),
            'MasterDecision',
            `${PROMPTS.master.description}\n${PROMPTS.master.instructions}`,
            `MasterDecision:${symbol}`,
            undefined,
            { analysisRequestId, roleRequestId: crypto.randomUUID(), expectedTotalRoles: 1 }
          );
          const masterDecisionRaw = masterRes.data;

          const biases = [
            marketContext.broaderTrend,
            technical.technicalBias,
            pattern.bias,
            liquidity.bias,
            sentiment.bias
          ];
          let bullishCount = 0, bearishCount = 0;
          biases.forEach(b => {
            if (b === 'BULLISH') bullishCount++;
            else if (b === 'BEARISH') bearishCount++;
          });
          const consensusScore = `${Math.max(bullishCount, bearishCount)}/${biases.length}`;

          finalResult = {
            analysisId: crypto.randomUUID(),
            symbol,
            timestamp: Date.now(),
            provider: masterRes.modelId,
            ...masterDecisionRaw,
            agentResults: allAgentResults,
            consensusScore
          };

        } catch (err) {
          if (err instanceof AIUnavailableError) {
            console.warn(`[AgentRunner] AI_UNAVAILABLE during full pipeline for ${symbol}.`);
            return makeUnavailableResult(symbol, err.attemptedModels);
          }
          throw err;
        }

      } else {
        // ── Multi-Model Parallel Pipeline ───────────────────────────────────────
        console.log(`[AgentRunner] Running Multi-Model Parallel Pipeline for ${symbol} (${eligibleModels.length} models)`);

        const rolePromptKeys = Object.keys(ROLE_PROMPTS) as any[];
        
        const capabilitiesMap: Record<string, any> = {
           'TECHNICAL ANALYST': { structuredOutput: true, technicalAnalysis: true },
           'MOMENTUM ANALYST': { structuredOutput: true, reasoning: true },
           'PRICE ACTION ANALYST': { structuredOutput: true, reasoning: true, technicalAnalysis: true },
           'RISK CHALLENGER': { structuredOutput: true, reasoning: true, riskAnalysis: true },
           'INDEPENDENT MARKET ANALYST': { structuredOutput: true, reasoning: true }
        };

        const promises = rolePromptKeys.map((role) => {
          const roleConfig = ROLE_PROMPTS[role];
          if (!roleConfig) return Promise.reject(new Error(`Unknown role: ${role}`));
          
          const requiredCapabilities = capabilitiesMap[role] || { structuredOutput: true };

          return DynamicModelRouter.executeWithFailover<any>(
            JSON.stringify(data),
            'MasterDecision',
            `${roleConfig.description}\n${roleConfig.instructions}`,
            `RoleDecision[${role}]:${symbol}`,
            requiredCapabilities,
            { analysisRequestId, roleRequestId: crypto.randomUUID(), expectedTotalRoles: rolePromptKeys.length }
          ).then(res => ({ ...res.data, provider: res.modelId, role }));
        });

        const settled = await Promise.allSettled(promises);
        const validDecisions: MasterDecisionOutput[] = [];

        settled.forEach((res, i) => {
          if (res.status === 'fulfilled') {
            validDecisions.push(res.value);
            AIPerformanceTracker.trackDecision(res.value);
          } else {
            console.warn(`[AgentRunner] Model ${eligibleModels[i]?.id || 'unknown'} failed in Multi-Model pipeline: ${(res as any).reason?.message}`);
          }
        });

        if (validDecisions.length === 0) {
          console.warn(`[AgentRunner] All models failed in parallel pipeline for ${symbol}. Returning AI_UNAVAILABLE.`);
          return makeUnavailableResult(symbol, eligibleModels.map(e => e.id));
        }

        finalResult = ConsensusEngine.calculateConsensus(
           symbol, 
           validDecisions, 
           minModels, 
           minConsensusPercent,
           rolePromptKeys.length
        );
        AIPerformanceTracker.trackConsensus(finalResult, validDecisions);
      }

      console.log(`[AgentRunner] Completed AI analysis for ${symbol}. Decision: ${finalResult.decision} | Provider: ${finalResult.provider}`);

      // Store in memory cache
      latestAnalysisResults.set(symbol, finalResult);

      EventBus.publish({
        eventType: 'AI_ANALYSIS_COMPLETED',
        source: 'AgentRunner',
        symbol,
        payload: {
          decision: finalResult.decision,
          confidence: finalResult.confidence,
          activeModel: finalResult.provider,
          triggerPayload
        }
      });

      // ── 5. Deterministic Risk Validation ─────────────────────────────────────
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
          if (c.riskRewardRatio < 1.0) valid = false;
        }

        if (!valid) {
          finalResult.decision = 'NO_TRADE';
          finalResult.reasoning = 'Deterministically rejected by Risk validation engine. ' + finalResult.reasoning;
          finalResult.tradeCandidate = null;
        }
      }

      // ── 6. Signal Quality ─────────────────────────────────────────────────────
      const qualityEval = SignalQualityService.evaluateOpportunity(finalResult, data);

      if (finalResult.decision === 'CANDIDATE_TRADE' && finalResult.tradeCandidate) {
        if (!qualityEval.isQualified) {
          finalResult.decision = 'NO_TRADE';
          finalResult.reasoning = `Quality Engine Rejected: ${qualityEval.rejectionReasons.join(', ')} | ` + finalResult.reasoning;
          finalResult.tradeCandidate = null;
        }
      }

      // ── 7. Adaptive Intelligence Calibration ──────────────────────────────────
      let adaptiveCalibration: any = null;
      if (finalResult.decision === 'CANDIDATE_TRADE' && finalResult.tradeCandidate && qualityEval.isQualified) {
        adaptiveCalibration = AdaptiveIntelligenceService.calibrateSignal(finalResult, qualityEval, data);
        finalResult.confidence = adaptiveCalibration.calibratedConfidence;
      }

      // ── 8. Publish Trade Opportunity ──────────────────────────────────────────
      if (finalResult.decision === 'CANDIDATE_TRADE' && finalResult.tradeCandidate && qualityEval.isQualified) {
        const c = finalResult.tradeCandidate;
        const opp: TradeOpportunity & { adaptiveIntelligence?: any } = {
          id: crypto.randomUUID(),
          symbol,
          direction: c.side,
          setup: `${finalResult.marketBias} Consensus`,
          currentPrice: c.entryZone.max,
          entryZone: c.entryZone,
          entryPrice: (c.entryZone.min + c.entryZone.max) / 2,
          stopLoss: c.stopLoss,
          takeProfitTargets: c.takeProfitLevels,
          riskRewardRatio: c.riskRewardRatio,
          confidence: finalResult.confidence,
          timeframe: finalResult.timeframe,
          higherTimeframeBias: finalResult.agentResults?.timeframe?.higherTimeframeBias || 'NEUTRAL',
          marketStructure: finalResult.agentResults?.marketContext?.marketCondition || 'UNKNOWN',
          technicalSummary: finalResult.agentResults?.technical?.technicalReasoning || 'Multi-Model Consensus',
          patternSummary: finalResult.agentResults?.pattern?.patternInterpretation || 'Multi-Model Consensus',
          liquiditySummary: finalResult.agentResults?.liquidity?.liquidityReasoning || 'Multi-Model Consensus',
          sentimentSummary: finalResult.agentResults?.sentiment?.sentimentReasoning || 'Multi-Model Consensus',
          reason: finalResult.reasoning,
          invalidationCondition: c.invalidationCondition,
          agents: [
            { name: 'Market Structure', bias: finalResult.agentResults?.marketContext?.broaderTrend || 'NEUTRAL', explanation: finalResult.agentResults?.marketContext?.marketCondition || 'N/A' },
            { name: 'Technical Analysis', bias: finalResult.agentResults?.technical?.technicalBias || 'NEUTRAL', explanation: finalResult.agentResults?.technical?.technicalReasoning || 'N/A' },
            { name: 'Pattern Analysis', bias: finalResult.agentResults?.pattern?.bias || 'NEUTRAL', explanation: finalResult.agentResults?.pattern?.patternInterpretation || 'N/A' },
            { name: 'Liquidity Analysis', bias: finalResult.agentResults?.liquidity?.bias || 'NEUTRAL', explanation: finalResult.agentResults?.liquidity?.liquidityReasoning || 'N/A' },
            { name: 'Sentiment', bias: finalResult.agentResults?.sentiment?.bias || 'NEUTRAL', explanation: finalResult.agentResults?.sentiment?.sentimentReasoning || 'N/A' }
          ],
          timeframes: [
            { timeframe: '1D', bias: finalResult.agentResults?.timeframe?.higherTimeframeBias || 'NEUTRAL' },
            { timeframe: '4H', bias: finalResult.agentResults?.timeframe?.mediumTermBias || 'NEUTRAL' },
            { timeframe: '1H', bias: finalResult.agentResults?.timeframe?.shortTermBias || 'NEUTRAL' },
            { timeframe: '15m', bias: finalResult.decision === 'CANDIDATE_TRADE' ? (finalResult.tradeCandidate?.side === 'LONG' ? 'BULLISH' : 'BEARISH') : 'NEUTRAL' }
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
          expiresAt: Date.now() + (6 * 60 * 60 * 1000),
          status: 'QUALIFIED'
        };
        OpportunityService.addOpportunity(opp);
      }

      return finalResult;

    } catch (e: any) {
      console.error(`[AgentRunner] Analysis failed for ${symbol}:`, e.message);
      throw e;
    } finally {
      activeAnalysisLocks.delete(lockKey);
    }
  },

  getLatestAnalysis(symbol: string): MasterDecisionOutput | null {
    return latestAnalysisResults.get(symbol) || null;
  },

  /** Expose router status for health checks */
  getRouterStatus() {
    return DynamicModelRouter.getRouterStatus();
  }
};
