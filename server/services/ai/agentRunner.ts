/**
 * AgentRunner — Phase 20.2 (Dynamic Model Router)
 *
 * All AI calls now route through DynamicModelRouter.executeWithFailover().
 * Provider failures never produce NO_TRADE until all eligible models are exhausted.
 */
import { AIAgent } from './aiAgent';
import { ProviderRegistry } from './providers/providerRegistry';
import { ConsensusEngine } from './consensusEngine';
import { ModelRegistry } from './modelRegistry';
import { DynamicModelRouter } from './dynamicModelRouter';
import { TradeDecisionEngine } from '../analysis/tradeDecisionEngine';
import { DeterministicMarketScreeningEngine } from '../analysis/screeningEngine';
import { AnalysisService } from '../analysis/analysisService';
import { MasterDecisionOutput } from './schemas/types';
import { OpportunityService } from '../opportunities/opportunityService';
import { TradeOpportunity } from '../opportunities/types';
import { SignalQualityService } from './signalQualityService';
import { AdaptiveIntelligenceService } from './adaptiveIntelligenceService';
import { EventBus } from '../system/eventBus';
import { AIUnavailableError } from './dynamicModelRouter';
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
// Analysis cache for duplicate prevention
const analysisCache = new Map<string, { expiresAt: number; result: MasterDecisionOutput }>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUnavailableResult(symbol: string, attemptedModels: string[]): MasterDecisionOutput {
  return {
    analysisId: crypto.randomUUID(),
    symbol,
    timestamp: Date.now(),
    provider: 'AI_UNAVAILABLE',
    status: 'AI_UNAVAILABLE',
    decision: null,
    confidence: 0,
    timeframe: '1h',
    marketBias: 'NEUTRAL',
    reasoning: `AI_UNAVAILABLE: All eligible models exhausted (${attemptedModels.join(', ')}). Existing opportunities tracked deterministically.`,
    supportingFactors: [],
    conflictingFactors: ['All AI models unavailable'],
    riskLevel: 'LOW',
    tradeCandidate: null,
    agentResults: {} as any,
    consensusScore: '0/0',
    modelsUsed: attemptedModels.length,
    successfulAnalyses: 0,
    failedAnalyses: attemptedModels.length,
    unavailableAnalyses: attemptedModels.length,
    failureReason: 'All eligible AI models exhausted'
  };
}

// ─── AgentRunner ──────────────────────────────────────────────────────────────

export const AgentRunner = {

  async runAnalysis(symbol: string, triggerPayload?: any): Promise<MasterDecisionOutput> {
    const lockKey = `${symbol}-analysis`;

    if (activeAnalysisLocks.has(lockKey)) {
      throw new Error(`Analysis for ${symbol} is already in progress.`);
    }

    // Cache check
    const cached = analysisCache.get(symbol);
    if (cached && cached.expiresAt > Date.now()) {
      console.log(`[AgentRunner] Cache hit for ${symbol}. Skipping redundant AI analysis.`);
      return cached.result;
    }

    activeAnalysisLocks.add(lockKey);
    const analysisRequestId = crypto.randomUUID();
    console.log(`[AgentRunner] START (Symbol: ${symbol} | ID: ${analysisRequestId})`);

    try {
      // ── 1. Get Market Data Snapshot ─────────────────────────────────────────
      console.log(`[MarketData] FETCHING`);
      const data = await AnalysisService.getAnalysisSnapshot(symbol, ['4h', '1h', '15m', '5m']);
      const marketSnapshotId = `snap_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`;
      
      if (!data || !data.timeframes['4h'] || !data.timeframes['1h'] || !data.timeframes['15m'] || !data.timeframes['5m']) {
        console.warn(`[AgentRunner] INSUFFICIENT_DATA for ${symbol}.`);
        console.log(`[MarketData] INVALID`);
        console.log(`[Decision] INSUFFICIENT_DATA`);
        return {
          analysisId: crypto.randomUUID(),
          symbol,
          timestamp: Date.now(),
          provider: 'Backend',
          status: 'INSUFFICIENT_DATA',
          decision: null,
          confidence: 0,
          timeframe: '1h',
          marketBias: 'NEUTRAL',
          reasoning: 'Insufficient historical market data to perform analysis.',
          supportingFactors: [],
          conflictingFactors: [],
          riskLevel: 'LOW',
          tradeCandidate: null,
          agentResults: {} as any,
          consensusScore: '0/0',
          marketSnapshotId,
          dataTimestamp: data?.timestamp || Date.now()
        };
      }
      
      console.log(`[MarketData] VALID`);
      
      // ── 2. Deterministic Screening Gate ─────────────────────────────────────────
      const screeningResult = DeterministicMarketScreeningEngine.screen(data, marketSnapshotId);

      // Inject deterministic screening into the payload so AI can review it
      const payload = { ...data, marketSnapshotId, dataTimestamp: data.timestamp, screeningResult };

      if (screeningResult.status === 'NO_TRADE' || screeningResult.status === 'INSUFFICIENT_DATA' || screeningResult.status === 'WAIT') {
        const result: MasterDecisionOutput = {
          analysisId: crypto.randomUUID(),
          symbol,
          timestamp: Date.now(),
          provider: 'Backend',
          status: screeningResult.status,
          decision: screeningResult.status === 'NO_TRADE' ? 'NO_TRADE' : (screeningResult.status === 'WAIT' ? 'WAIT' : null),
          confidence: screeningResult.technicalScore,
          timeframe: '1h',
          marketBias: screeningResult.marketRegime === 'BULLISH' || screeningResult.marketRegime === 'STRONG_BULLISH' ? 'BULLISH' : 
                      (screeningResult.marketRegime === 'BEARISH' || screeningResult.marketRegime === 'STRONG_BEARISH' ? 'BEARISH' : 'NEUTRAL'),
          reasoning: screeningResult.candidateTrade.reason,
          supportingFactors: [],
          conflictingFactors: [],
          riskLevel: 'LOW',
          tradeCandidate: null,
          agentResults: { screening: screeningResult } as any,
          consensusScore: `${screeningResult.technicalScore}/100`,
          marketSnapshotId,
          dataTimestamp: payload.dataTimestamp
        };
        console.log(`[Screening] REJECT (${result.reasoning})`);
        console.log(`[Decision] ${result.status}`);
        return result;
      }
      
      console.log(`[Screening] PASS (Score: ${screeningResult.technicalScore})`);

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
           'MARKET STRUCTURE ANALYST': { structuredOutput: true, technicalAnalysis: true },
           'TECHNICAL + MOMENTUM ANALYST': { structuredOutput: true, reasoning: true },
           'PRICE ACTION ANALYST': { structuredOutput: true, reasoning: true, technicalAnalysis: true },
           'RISK CHALLENGER': { structuredOutput: true, reasoning: true, riskAnalysis: true }
        };

        const promises = rolePromptKeys.map((role) => {
          const roleConfig = ROLE_PROMPTS[role];
          if (!roleConfig) return Promise.reject(new Error(`Unknown role: ${role}`));
          
          const requiredCapabilities = capabilitiesMap[role] || { structuredOutput: true };

          return DynamicModelRouter.executeWithFailover<any>(
            JSON.stringify(payload),
            'MasterDecision',
            `${roleConfig.description}\n${roleConfig.instructions}`,
            `RoleDecision[${role}]:${symbol}`,
            requiredCapabilities,
            { analysisRequestId, roleRequestId: crypto.randomUUID(), expectedTotalRoles: rolePromptKeys.length }
          ).then(res => ({ ...res.data, provider: res.modelId, role }));
        });

        const settled = await Promise.allSettled(promises);
        const validDecisions: MasterDecisionOutput[] = [];
        let failedAnalyses = 0;
        let unavailableAnalyses = 0;

        settled.forEach((res, i) => {
          if (res.status === 'fulfilled') {
            validDecisions.push(res.value);
            AIPerformanceTracker.trackDecision(res.value);
            console.log(`[AI] ${res.value.provider} / ${res.value.model} SUCCESS`);
          } else {
            const reason = (res as any).reason;
            if (reason instanceof AIUnavailableError) unavailableAnalyses++;
            else failedAnalyses++;
            console.log(`[AI] FAILED: ${reason?.message}`);
            console.warn(`[AgentRunner] Model ${eligibleModels[i]?.id || 'unknown'} failed in Multi-Model pipeline: ${reason?.message}`);
          }
        });

        let aiConsensus: MasterDecisionOutput;
        if (validDecisions.length === 0) {
          console.warn(`[AgentRunner] All models failed in parallel pipeline for ${symbol}. Proceeding with AI_UNAVAILABLE.`);
          aiConsensus = makeUnavailableResult(symbol, eligibleModels.map(e => e.id));
        } else {
          aiConsensus = ConsensusEngine.calculateConsensus(
             symbol, 
             validDecisions, 
             minModels, 
             minConsensusPercent,
             rolePromptKeys.length,
             failedAnalyses,
             unavailableAnalyses
          );
          console.log(`[Consensus] VALID_COUNT: ${validDecisions.length} / ${rolePromptKeys.length}`);
          AIPerformanceTracker.trackConsensus(aiConsensus, validDecisions);
        }
        
        aiConsensus.marketSnapshotId = marketSnapshotId;
        aiConsensus.dataTimestamp = payload.dataTimestamp;

        const decisionResult = TradeDecisionEngine.evaluate(data, aiConsensus);
        
        aiConsensus.status = decisionResult.status as any; // Map back the refined WAIT/NO_TRADE/TRADE_READY
        aiConsensus.reasoning = decisionResult.reasoning;
        if (decisionResult.status === 'TRADE_READY') {
           aiConsensus.decision = 'CANDIDATE_TRADE';
        } else if (decisionResult.status === 'WAIT') {
           aiConsensus.decision = 'WATCH';
        } else if (decisionResult.status === 'AI_UNAVAILABLE') {
           // Do NOT map to NO_TRADE. Map it cleanly to null or keep it clear.
           aiConsensus.decision = null;
        } else {
           aiConsensus.decision = 'NO_TRADE';
        }
        
        // Populate opportunity score dynamically to the payload
        (aiConsensus as any).opportunityScore = decisionResult.score;
        
        // Override the trade candidate with the strict deterministic plan
        if (payload.screeningResult?.tradePlan) {
           const tp = payload.screeningResult.tradePlan;
           aiConsensus.tradeCandidate = {
              side: payload.screeningResult.candidateTrade.side as any,
              entryZone: { min: tp.entry * 0.999, max: tp.entry * 1.001 },
              stopLoss: tp.stopLoss,
              takeProfitLevels: [tp.tp1, tp.tp2, tp.tp3],
              riskRewardRatio: tp.riskRewardRatio,
              invalidationCondition: 'Price breaches Stop Loss',
              thesis: decisionResult.reasoning,
              timeframe: '1h'
           };
        } else if (aiConsensus.status === 'NO_TRADE' || aiConsensus.status === 'WAIT') {
           aiConsensus.tradeCandidate = null;
        }

        finalResult = aiConsensus;
      }

      console.log(`[Decision] ${finalResult.status}`);
      console.log(`[AgentRunner] Completed AI analysis for ${symbol}. Status: ${finalResult.status} | Provider: ${finalResult.provider}`);

      // Store in memory cache
      latestAnalysisResults.set(symbol, finalResult);
      
      if (finalResult.status === 'TRADE_READY' || finalResult.status === 'NO_TRADE') {
         analysisCache.set(symbol, {
           expiresAt: Date.now() + 15 * 60 * 1000, // 15 minute cache
           result: finalResult
         });
      }

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
          console.log(`[Risk] PASS`);
          const risk = Math.abs(entryPrice - c.stopLoss);
          const reward = Math.abs(c.takeProfitLevels[0] - entryPrice);
          c.riskRewardRatio = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0;
          if (c.riskRewardRatio < 1.0) valid = false;
        }

        if (!valid) {
          console.log(`[Risk] FAIL`);
          finalResult.status = 'NO_TRADE';
          finalResult.decision = 'NO_TRADE';
          finalResult.reasoning = 'Deterministically rejected by Risk validation engine. ' + finalResult.reasoning;
          finalResult.tradeCandidate = null;
        }
      }

      // ── 6. Signal Quality ─────────────────────────────────────────────────────
      const qualityEval = SignalQualityService.evaluateOpportunity(finalResult, data);

      if (finalResult.decision === 'CANDIDATE_TRADE' && finalResult.tradeCandidate) {
        if (!qualityEval.isQualified) {
          finalResult.status = 'NO_TRADE';
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
      if (finalResult.status === 'TRADE_READY' && finalResult.tradeCandidate && qualityEval.isQualified) {
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
            { timeframe: '4H', bias: data.timeframes['4h']?.trend || 'NEUTRAL' },
            { timeframe: '1H', bias: data.timeframes['1h']?.trend || 'NEUTRAL' },
            { timeframe: '15m', bias: data.timeframes['15m']?.trend || 'NEUTRAL' },
            { timeframe: '5m', bias: data.timeframes['5m']?.trend || 'NEUTRAL' }
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
