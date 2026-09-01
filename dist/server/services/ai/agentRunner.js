"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRunner = void 0;
const providerRegistry_1 = require("./providers/providerRegistry");
const consensusEngine_1 = require("./consensusEngine");
const analysisService_1 = require("../analysis/analysisService");
const opportunityService_1 = require("../opportunities/opportunityService");
const signalQualityService_1 = require("./signalQualityService");
const adaptiveIntelligenceService_1 = require("./adaptiveIntelligenceService");
const eventBus_1 = require("../system/eventBus");
const dynamicModelRouter_1 = require("./dynamicModelRouter");
const modelRegistry_1 = require("./modelRegistry");
const aiPerformanceTracker_1 = require("./aiPerformanceTracker");
const prompts_1 = require("./prompts");
const roles_1 = require("./prompts/roles");
const crypto_1 = __importDefault(require("crypto"));
// Initialize provider registry (also populates ModelRegistry)
providerRegistry_1.ProviderRegistry.initialize();
// In-memory lock to prevent duplicate concurrent analysis
const activeAnalysisLocks = new Set();
// Simple in-memory cache to store the latest analysis per symbol
const latestAnalysisResults = new Map();
// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeUnavailableResult(symbol, attemptedModels) {
    return {
        analysisId: crypto_1.default.randomUUID(),
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
        agentResults: {},
        consensusScore: '0/0'
    };
}
// ─── AgentRunner ──────────────────────────────────────────────────────────────
exports.AgentRunner = {
    async runAnalysis(symbol, triggerPayload) {
        const lockKey = `${symbol}-analysis`;
        if (activeAnalysisLocks.has(lockKey)) {
            throw new Error(`Analysis for ${symbol} is already in progress.`);
        }
        activeAnalysisLocks.add(lockKey);
        console.log(`[AgentRunner] Started AI analysis pipeline for ${symbol}`);
        try {
            // ── 1. Get Market Data Snapshot ─────────────────────────────────────────
            const data = await analysisService_1.AnalysisService.getAnalysisSnapshot(symbol, ['15m', '1h', '4h', '1d']);
            // ── 2. Lightweight Screening via DynamicModelRouter ─────────────────────
            // The router automatically fails over to the next best model if needed.
            let screeningResult;
            let screeningModelId;
            try {
                const routerResult = await dynamicModelRouter_1.DynamicModelRouter.executeWithFailover(JSON.stringify(data), 'ScreeningAnalysis', `${prompts_1.PROMPTS.screening.description}\n${prompts_1.PROMPTS.screening.instructions}`, `Screening:${symbol}`);
                screeningResult = routerResult.data;
                screeningModelId = routerResult.modelId;
            }
            catch (err) {
                if (err instanceof dynamicModelRouter_1.AIUnavailableError) {
                    console.warn(`[AgentRunner] AI_UNAVAILABLE during screening for ${symbol}.`);
                    return makeUnavailableResult(symbol, err.attemptedModels);
                }
                throw err;
            }
            // ── 3. Screening Gate ────────────────────────────────────────────────────
            if (!screeningResult?.passScreening || screeningResult?.status === 'ERROR') {
                const result = {
                    analysisId: crypto_1.default.randomUUID(),
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
                    agentResults: { screening: screeningResult },
                    consensusScore: '0/0'
                };
                console.log(`[AgentRunner] Screening REJECTED for ${symbol}. No trade setup forming.`);
                return result;
            }
            // ── 4. Deep Analysis Pipeline ────────────────────────────────────────────
            let finalResult;
            const minModels = parseInt(process.env.AI_MIN_MODELS || '2');
            const minConsensusPercent = parseInt(process.env.AI_MIN_CONSENSUS_PERCENT || '60');
            const eligibleModels = modelRegistry_1.ModelRegistry.getEligible();
            if (providerRegistry_1.ProviderRegistry.isGeminiOnly()) {
                // ── Legacy single-model pipeline (each step through router) ────────────
                console.log(`[AgentRunner] Running Single-Model Pipeline for ${symbol} (via router)`);
                try {
                    const [mcRes, techRes, patRes] = await Promise.all([
                        dynamicModelRouter_1.DynamicModelRouter.executeWithFailover(JSON.stringify(data), 'MarketContext', `${prompts_1.PROMPTS.marketContext.description}\n${prompts_1.PROMPTS.marketContext.instructions}`, `MarketContext:${symbol}`),
                        dynamicModelRouter_1.DynamicModelRouter.executeWithFailover(JSON.stringify(data), 'TechnicalAnalysis', `${prompts_1.PROMPTS.technical.description}\n${prompts_1.PROMPTS.technical.instructions}`, `Technical:${symbol}`),
                        dynamicModelRouter_1.DynamicModelRouter.executeWithFailover(JSON.stringify(data), 'PatternAnalysis', `${prompts_1.PROMPTS.pattern.description}\n${prompts_1.PROMPTS.pattern.instructions}`, `Pattern:${symbol}`)
                    ]);
                    // Small breather between batches for free-tier rate limits
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    const [tfRes, liqRes, sentRes] = await Promise.all([
                        dynamicModelRouter_1.DynamicModelRouter.executeWithFailover(JSON.stringify(data), 'TimeframeAnalysis', `${prompts_1.PROMPTS.timeframe.description}\n${prompts_1.PROMPTS.timeframe.instructions}`, `Timeframe:${symbol}`),
                        dynamicModelRouter_1.DynamicModelRouter.executeWithFailover(JSON.stringify(data), 'LiquidityAnalysis', `${prompts_1.PROMPTS.liquidity.description}\n${prompts_1.PROMPTS.liquidity.instructions}`, `Liquidity:${symbol}`),
                        dynamicModelRouter_1.DynamicModelRouter.executeWithFailover(JSON.stringify(data), 'SentimentAnalysis', `${prompts_1.PROMPTS.sentiment.description}\n${prompts_1.PROMPTS.sentiment.instructions}`, `Sentiment:${symbol}`)
                    ]);
                    const marketContext = mcRes.data;
                    const technical = techRes.data;
                    const pattern = patRes.data;
                    const timeframe = tfRes.data;
                    const liquidity = liqRes.data;
                    const sentiment = sentRes.data;
                    const specialistResults = { marketContext, technical, pattern, timeframe, liquidity, sentiment };
                    const riskRes = await dynamicModelRouter_1.DynamicModelRouter.executeWithFailover(JSON.stringify({ data, otherAnalysis: specialistResults }), 'RiskAnalysis', `${prompts_1.PROMPTS.risk.description}\n${prompts_1.PROMPTS.risk.instructions}`, `Risk:${symbol}`);
                    const risk = riskRes.data;
                    const allAgentResults = { ...specialistResults, risk };
                    const masterRes = await dynamicModelRouter_1.DynamicModelRouter.executeWithFailover(JSON.stringify({ data, agentResults: allAgentResults }), 'MasterDecision', `${prompts_1.PROMPTS.master.description}\n${prompts_1.PROMPTS.master.instructions}`, `MasterDecision:${symbol}`);
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
                        if (b === 'BULLISH')
                            bullishCount++;
                        else if (b === 'BEARISH')
                            bearishCount++;
                    });
                    const consensusScore = `${Math.max(bullishCount, bearishCount)}/${biases.length}`;
                    finalResult = {
                        analysisId: crypto_1.default.randomUUID(),
                        symbol,
                        timestamp: Date.now(),
                        provider: masterRes.modelId,
                        ...masterDecisionRaw,
                        agentResults: allAgentResults,
                        consensusScore
                    };
                }
                catch (err) {
                    if (err instanceof dynamicModelRouter_1.AIUnavailableError) {
                        console.warn(`[AgentRunner] AI_UNAVAILABLE during full pipeline for ${symbol}.`);
                        return makeUnavailableResult(symbol, err.attemptedModels);
                    }
                    throw err;
                }
            }
            else {
                // ── Multi-Model Parallel Pipeline ───────────────────────────────────────
                console.log(`[AgentRunner] Running Multi-Model Parallel Pipeline for ${symbol} (${eligibleModels.length} models)`);
                const modelEntries = modelRegistry_1.ModelRegistry.getEligible();
                const rolePromptKeys = Object.keys(roles_1.ROLE_PROMPTS);
                const promises = modelEntries.map((entry, idx) => {
                    const role = entry.role;
                    const roleConfig = roles_1.ROLE_PROMPTS[role];
                    if (!roleConfig)
                        return Promise.reject(new Error(`Unknown role: ${role}`));
                    return dynamicModelRouter_1.DynamicModelRouter.executeWithFailover(JSON.stringify(data), 'MasterDecision', `${roleConfig.description}\n${roleConfig.instructions}`, `RoleDecision[${role}]:${symbol}`).then(res => ({ ...res.data, provider: res.modelId, role }));
                });
                const settled = await Promise.allSettled(promises);
                const validDecisions = [];
                settled.forEach((res, i) => {
                    if (res.status === 'fulfilled') {
                        validDecisions.push(res.value);
                        aiPerformanceTracker_1.AIPerformanceTracker.trackDecision(res.value);
                    }
                    else {
                        console.warn(`[AgentRunner] Model ${modelEntries[i]?.id} failed in Multi-Model pipeline: ${res.reason?.message}`);
                    }
                });
                if (validDecisions.length === 0) {
                    console.warn(`[AgentRunner] All models failed in parallel pipeline for ${symbol}. Returning AI_UNAVAILABLE.`);
                    return makeUnavailableResult(symbol, modelEntries.map(e => e.id));
                }
                finalResult = consensusEngine_1.ConsensusEngine.calculateConsensus(symbol, validDecisions, minModels, minConsensusPercent);
                aiPerformanceTracker_1.AIPerformanceTracker.trackConsensus(finalResult, validDecisions);
            }
            console.log(`[AgentRunner] Completed AI analysis for ${symbol}. Decision: ${finalResult.decision} | Provider: ${finalResult.provider}`);
            // Store in memory cache
            latestAnalysisResults.set(symbol, finalResult);
            eventBus_1.EventBus.publish({
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
                    if (c.stopLoss >= entryPrice)
                        valid = false;
                    c.takeProfitLevels.forEach(tp => { if (tp <= entryPrice)
                        valid = false; });
                }
                else {
                    if (c.stopLoss <= entryPrice)
                        valid = false;
                    c.takeProfitLevels.forEach(tp => { if (tp >= entryPrice)
                        valid = false; });
                }
                if (valid) {
                    const risk = Math.abs(entryPrice - c.stopLoss);
                    const reward = Math.abs(c.takeProfitLevels[0] - entryPrice);
                    c.riskRewardRatio = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0;
                    if (c.riskRewardRatio < 1.0)
                        valid = false;
                }
                if (!valid) {
                    finalResult.decision = 'NO_TRADE';
                    finalResult.reasoning = 'Deterministically rejected by Risk validation engine. ' + finalResult.reasoning;
                    finalResult.tradeCandidate = null;
                }
            }
            // ── 6. Signal Quality ─────────────────────────────────────────────────────
            const qualityEval = signalQualityService_1.SignalQualityService.evaluateOpportunity(finalResult, data);
            if (finalResult.decision === 'CANDIDATE_TRADE' && finalResult.tradeCandidate) {
                if (!qualityEval.isQualified) {
                    finalResult.decision = 'NO_TRADE';
                    finalResult.reasoning = `Quality Engine Rejected: ${qualityEval.rejectionReasons.join(', ')} | ` + finalResult.reasoning;
                    finalResult.tradeCandidate = null;
                }
            }
            // ── 7. Adaptive Intelligence Calibration ──────────────────────────────────
            let adaptiveCalibration = null;
            if (finalResult.decision === 'CANDIDATE_TRADE' && finalResult.tradeCandidate && qualityEval.isQualified) {
                adaptiveCalibration = adaptiveIntelligenceService_1.AdaptiveIntelligenceService.calibrateSignal(finalResult, qualityEval, data);
                finalResult.confidence = adaptiveCalibration.calibratedConfidence;
            }
            // ── 8. Publish Trade Opportunity ──────────────────────────────────────────
            if (finalResult.decision === 'CANDIDATE_TRADE' && finalResult.tradeCandidate && qualityEval.isQualified) {
                const c = finalResult.tradeCandidate;
                const opp = {
                    id: crypto_1.default.randomUUID(),
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
                opportunityService_1.OpportunityService.addOpportunity(opp);
            }
            return finalResult;
        }
        catch (e) {
            console.error(`[AgentRunner] Analysis failed for ${symbol}:`, e.message);
            throw e;
        }
        finally {
            activeAnalysisLocks.delete(lockKey);
        }
    },
    getLatestAnalysis(symbol) {
        return latestAnalysisResults.get(symbol) || null;
    },
    /** Expose router status for health checks */
    getRouterStatus() {
        return dynamicModelRouter_1.DynamicModelRouter.getRouterStatus();
    }
};
