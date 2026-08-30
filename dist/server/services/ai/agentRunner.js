"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRunner = void 0;
const aiAgent_1 = require("./aiAgent");
const mockProvider_1 = require("./providers/mockProvider");
const analysisService_1 = require("../analysis/analysisService");
const crypto_1 = __importDefault(require("crypto"));
// In a real app we'd load the correct provider via env. For now we use the mock.
const provider = new mockProvider_1.MockProvider();
const agent = new aiAgent_1.AIAgent(provider);
// In-memory lock to prevent duplicate concurrent analysis
const activeAnalysisLocks = new Set();
// Simple in-memory cache to store the latest analysis per symbol
const latestAnalysisResults = new Map();
exports.AgentRunner = {
    async runAnalysis(symbol) {
        const lockKey = `${symbol}-analysis`;
        if (activeAnalysisLocks.has(lockKey)) {
            throw new Error(`Analysis for ${symbol} is already in progress.`);
        }
        activeAnalysisLocks.add(lockKey);
        console.log(`[AgentRunner] Started AI analysis pipeline for ${symbol}`);
        try {
            // 1. Get Normalized Market Data Snapshot
            const data = await analysisService_1.AnalysisService.getAnalysisSnapshot(symbol, ['15m', '1h', '4h', '1d']);
            // 2. Run independent specialist agents concurrently
            const [marketContext, technical, pattern, timeframe] = await Promise.all([
                agent.analyzeMarketContext(data),
                agent.analyzeTechnicals(data),
                agent.analyzePatterns(data),
                agent.analyzeTimeframes(data)
            ]);
            const specialistResults = { marketContext, technical, pattern, timeframe };
            // 3. Run Risk Analysis (which needs the other specialist results)
            const risk = await agent.analyzeRisk(data, specialistResults);
            const allAgentResults = { ...specialistResults, risk };
            // 4. Run Master Decision Agent
            const masterDecisionRaw = await agent.makeMasterDecision(data, allAgentResults);
            // 5. Build final validated result
            const finalResult = {
                analysisId: crypto_1.default.randomUUID(),
                symbol,
                timestamp: Date.now(),
                provider: provider.name,
                ...masterDecisionRaw,
                agentResults: allAgentResults
            };
            console.log(`[AgentRunner] Completed AI analysis for ${symbol}. Decision: ${finalResult.decision}`);
            // Save to memory
            latestAnalysisResults.set(symbol, finalResult);
            return finalResult;
        }
        finally {
            activeAnalysisLocks.delete(lockKey);
        }
    },
    getLatestAnalysis(symbol) {
        return latestAnalysisResults.get(symbol) || null;
    }
};
