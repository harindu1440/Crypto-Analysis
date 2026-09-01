"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRunner = void 0;
const aiAgent_1 = require("./aiAgent");
const geminiProvider_1 = require("./providers/geminiProvider");
const providerRegistry_1 = require("./providers/providerRegistry");
const consensusEngine_1 = require("./consensusEngine");
const analysisService_1 = require("../analysis/analysisService");
const opportunityService_1 = require("../opportunities/opportunityService");
const signalQualityService_1 = require("./signalQualityService");
const adaptiveIntelligenceService_1 = require("./adaptiveIntelligenceService");
const eventBus_1 = require("../system/eventBus");
const crypto_1 = __importDefault(require("crypto"));
const aiPerformanceTracker_1 = require("./aiPerformanceTracker");
// Initialize provider registry
providerRegistry_1.ProviderRegistry.initialize();
const legacyGeminiProvider = new geminiProvider_1.GeminiProvider();
const legacyAgent = new aiAgent_1.AIAgent(legacyGeminiProvider);
let aiSystemPaused = false;
let aiSystemPauseTimer = null;
// In-memory lock to prevent duplicate concurrent analysis
const activeAnalysisLocks = new Set();
// Simple in-memory cache to store the latest analysis per symbol
const latestAnalysisResults = new Map();
exports.AgentRunner = {
    async runAnalysis(symbol, triggerPayload) {
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
            const data = await analysisService_1.AnalysisService.getAnalysisSnapshot(symbol, ['15m', '1h', '4h', '1d']);
            // 2. Run Lightweight Screening First
            // Pick the best healthy provider for screening — prefer Gemini, fallback to others
            let screeningAgent = legacyAgent;
            const geminiHealth = legacyGeminiProvider.getHealth();
            if (geminiHealth.status === 'COOLDOWN') {
                const eligible = providerRegistry_1.ProviderRegistry.getEligibleProviders();
                const fallbackProvider = eligible.find(p => p.provider.name !== 'gemini-provider');
                if (fallbackProvider) {
                    screeningAgent = new aiAgent_1.AIAgent(fallbackProvider.provider);
                    console.log(`[AgentRunner] Gemini in COOLDOWN. Using ${fallbackProvider.provider.name} for screening.`);
                }
                else {
                    console.warn(`[AgentRunner] Gemini in COOLDOWN and no fallback providers available. Skipping ${symbol}.`);
                    throw new Error('DAILY_QUOTA_EXHAUSTED');
                }
            }
            const screening = await screeningAgent.analyzeScreening(data);
            if (!screening.passScreening || screening.status === 'ERROR') {
                const result = {
                    analysisId: crypto_1.default.randomUUID(),
                    symbol,
                    timestamp: Date.now(),
                    provider: 'Multi-Model-Orchestrator',
                    decision: 'NO_TRADE',
                    confidence: 0,
                    timeframe: '1h',
                    marketBias: 'NEUTRAL',
                    reasoning: screening.status === 'ERROR' ? 'Screening failed (Quota/Error).' : 'Screening rejected: No meaningful setup forming.',
                    supportingFactors: [],
                    conflictingFactors: [],
                    riskLevel: 'LOW',
                    tradeCandidate: null,
                    agentResults: { screening },
                    consensusScore: '0/0'
                };
                console.log(`[AgentRunner] Completed AI screening for ${symbol}. Decision: NO_TRADE (${result.reasoning})`);
                return result;
            }
            let finalResult;
            const minModels = parseInt(process.env.AI_MIN_MODELS || '2');
            const minConsensusPercent = parseInt(process.env.AI_MIN_CONSENSUS_PERCENT || '60');
            if (providerRegistry_1.ProviderRegistry.isGeminiOnly()) {
                console.log(`[AgentRunner] Running Legacy Gemini-Only Pipeline for ${symbol}`);
                // Run independent specialist agents sequentially
                const marketContext = await legacyAgent.analyzeMarketContext(data);
                const technical = await legacyAgent.analyzeTechnicals(data);
                const pattern = await legacyAgent.analyzePatterns(data);
                await new Promise(resolve => setTimeout(resolve, 2000));
                const timeframe = await legacyAgent.analyzeTimeframes(data);
                const liquidity = await legacyAgent.analyzeLiquidity(data);
                const sentiment = await legacyAgent.analyzeSentiment(data);
                const specialistResults = { marketContext, technical, pattern, timeframe, liquidity, sentiment };
                const risk = await legacyAgent.analyzeRisk(data, specialistResults);
                const allAgentResults = { ...specialistResults, risk };
                const masterDecisionRaw = await legacyAgent.makeMasterDecision(data, allAgentResults);
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
                    if (b === 'BULLISH')
                        bullishCount++;
                    else if (b === 'BEARISH')
                        bearishCount++;
                });
                const maxScore = Math.max(bullishCount, bearishCount);
                const consensusScore = `${maxScore}/${biases.length}`;
                finalResult = {
                    analysisId: crypto_1.default.randomUUID(),
                    symbol,
                    timestamp: Date.now(),
                    provider: legacyGeminiProvider.name,
                    ...masterDecisionRaw,
                    agentResults: allAgentResults,
                    consensusScore
                };
            }
            else {
                console.log(`[AgentRunner] Running Multi-Model Parallel Pipeline for ${symbol}`);
                const eligibleProviders = providerRegistry_1.ProviderRegistry.getEligibleProviders();
                const promises = eligibleProviders.map(p => legacyAgent.generateRoleDecision(data, p.role, p.provider));
                const settled = await Promise.allSettled(promises);
                const validDecisions = [];
                settled.forEach((res, i) => {
                    if (res.status === 'fulfilled') {
                        validDecisions.push(res.value);
                        // Track successful model performance
                        aiPerformanceTracker_1.AIPerformanceTracker.trackDecision(res.value);
                    }
                    else {
                        console.warn(`[AgentRunner] Provider ${eligibleProviders[i].provider.name} failed during Multi-Model Pipeline.`);
                    }
                });
                finalResult = consensusEngine_1.ConsensusEngine.calculateConsensus(symbol, validDecisions, minModels, minConsensusPercent);
                // Track the final consensus
                aiPerformanceTracker_1.AIPerformanceTracker.trackConsensus(finalResult, validDecisions);
            }
            console.log(`[AgentRunner] Completed AI analysis for ${symbol}. Decision: ${finalResult.decision}`);
            // Store in memory cache
            latestAnalysisResults.set(symbol, finalResult);
            eventBus_1.EventBus.publish({
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
                        valid = false; // Reject poor R:R
                }
                if (!valid) {
                    finalResult.decision = 'NO_TRADE';
                    finalResult.reasoning = 'Deterministically rejected by Risk validation engine. ' + finalResult.reasoning;
                    finalResult.tradeCandidate = null;
                }
            }
            // Phase 15: AI Signal Quality & Validation
            const qualityEval = signalQualityService_1.SignalQualityService.evaluateOpportunity(finalResult, data);
            if (finalResult.decision === 'CANDIDATE_TRADE' && finalResult.tradeCandidate) {
                if (!qualityEval.isQualified) {
                    finalResult.decision = 'NO_TRADE';
                    finalResult.reasoning = `Quality Engine Rejected: ${qualityEval.rejectionReasons.join(', ')} | ` + finalResult.reasoning;
                    finalResult.tradeCandidate = null;
                }
            }
            // Phase 19: Adaptive Intelligence Calibration
            let adaptiveCalibration = null;
            if (finalResult.decision === 'CANDIDATE_TRADE' && finalResult.tradeCandidate && qualityEval.isQualified) {
                adaptiveCalibration = adaptiveIntelligenceService_1.AdaptiveIntelligenceService.calibrateSignal(finalResult, qualityEval, data);
                // Update the final result with calibrated confidence
                finalResult.confidence = adaptiveCalibration.calibratedConfidence;
            }
            // Phase 12 & 15 & 19: Generate Global Trade Opportunity if valid & qualified
            if (finalResult.decision === 'CANDIDATE_TRADE' && finalResult.tradeCandidate && qualityEval.isQualified) {
                const c = finalResult.tradeCandidate;
                const opp = {
                    id: crypto_1.default.randomUUID(),
                    symbol,
                    direction: c.side,
                    setup: `${finalResult.marketBias} Consensus`,
                    currentPrice: c.entryZone.max, // Approximation
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
                    expiresAt: Date.now() + (6 * 60 * 60 * 1000), // 6 hours
                    status: 'QUALIFIED'
                };
                opportunityService_1.OpportunityService.addOpportunity(opp);
            }
            return finalResult;
        }
        catch (e) {
            console.error(`[AgentRunner] Analysis failed for ${symbol}:`, e.message);
            if (e.message?.includes('DAILY_QUOTA_EXHAUSTED')) {
                // Check if we have other healthy providers available
                const healthyAlternatives = providerRegistry_1.ProviderRegistry.getEligibleProviders()
                    .filter(p => p.provider.name !== 'gemini-provider');
                if (healthyAlternatives.length > 0) {
                    console.warn(`[AgentRunner] Gemini quota exhausted for ${symbol}, but ${healthyAlternatives.length} alternative provider(s) exist. Will use them next cycle.`);
                }
                else {
                    console.warn(`[AgentRunner] DAILY QUOTA EXHAUSTED for ${symbol} with no alternatives. Marking as NO_TRADE.`);
                }
                return {
                    analysisId: crypto_1.default.randomUUID(),
                    symbol,
                    timestamp: Date.now(),
                    provider: 'Multi-Model-Orchestrator',
                    decision: 'NO_TRADE',
                    confidence: 0,
                    timeframe: '1h',
                    marketBias: 'NEUTRAL',
                    reasoning: healthyAlternatives.length > 0
                        ? `ANALYSIS_INCOMPLETE: Gemini Quota Exhausted. Switching to alternative providers (${healthyAlternatives.map(p => p.provider.name).join(', ')}) next cycle.`
                        : 'ANALYSIS_INCOMPLETE: All AI quotas exhausted. Existing opportunities tracked deterministically.',
                    supportingFactors: [],
                    conflictingFactors: ['API Quota Exhausted'],
                    riskLevel: 'LOW',
                    tradeCandidate: null,
                    agentResults: {},
                    consensusScore: '0/0'
                };
            }
            // Only pause the entire AI system if ALL providers are failing (not just Gemini)
            if (e.message?.includes('429') || e.message?.includes('500') || e.message?.includes('RESOURCE_EXHAUSTED') || e.message?.includes('Quota Exhausted')) {
                const healthyProviders = providerRegistry_1.ProviderRegistry.getEligibleProviders();
                if (healthyProviders.length === 0 && !aiSystemPaused) {
                    console.warn('[AgentRunner] ⚠️ All AI providers degraded. Pausing new AI requests for 60 seconds.');
                    aiSystemPaused = true;
                    eventBus_1.EventBus.publish({
                        eventType: 'SYSTEM_ALERT',
                        source: 'AgentRunner',
                        payload: { message: 'AI System Degraded: All providers unavailable. Market monitoring continues.' }
                    });
                    if (aiSystemPauseTimer)
                        clearTimeout(aiSystemPauseTimer);
                    aiSystemPauseTimer = setTimeout(() => {
                        console.log('[AgentRunner] 🟢 Resuming AI requests.');
                        aiSystemPaused = false;
                    }, 60000);
                }
                else if (healthyProviders.length > 0) {
                    console.log(`[AgentRunner] Gemini failed but ${healthyProviders.length} provider(s) still healthy. AI system remains active.`);
                }
            }
            throw e;
        }
        finally {
            activeAnalysisLocks.delete(lockKey);
        }
    },
    getLatestAnalysis(symbol) {
        return latestAnalysisResults.get(symbol) || null;
    }
};
