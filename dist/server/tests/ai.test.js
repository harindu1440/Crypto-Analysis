"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const agentRunner_1 = require("../services/ai/agentRunner");
const geminiProvider_1 = require("../services/ai/providers/geminiProvider");
jest.mock('../services/analysis/analysisService', () => ({
    AnalysisService: {
        getAnalysisSnapshot: jest.fn().mockResolvedValue({
            symbol: 'BTCUSDT',
            timestamp: Date.now(),
            market: { price: 60000, volume24h: 1000, change24h: 2 },
            timeframes: {
                '1h': { volatility: { level: 'MEDIUM' } }
            }
        })
    }
}));
jest.mock('../services/ai/aiAgent', () => {
    return {
        AIAgent: jest.fn().mockImplementation(() => {
            return {
                analyzeMarketContext: jest.fn().mockResolvedValue({ broaderTrend: 'BULLISH', marketCondition: 'RANGING' }),
                analyzeTechnicals: jest.fn().mockResolvedValue({ technicalBias: 'BULLISH', technicalReasoning: 'Test' }),
                analyzePatterns: jest.fn().mockResolvedValue({ bias: 'BULLISH', patternInterpretation: 'Test' }),
                analyzeLiquidity: jest.fn().mockResolvedValue({ bias: 'BULLISH', liquidityReasoning: 'Test' }),
                analyzeSentiment: jest.fn().mockResolvedValue({ bias: 'BULLISH', sentimentReasoning: 'Test' }),
                analyzeTimeframes: jest.fn().mockResolvedValue({ higherTimeframeBias: 'BULLISH', shortTermBias: 'BULLISH' }),
                analyzeRisk: jest.fn().mockResolvedValue({ riskLevel: 'LOW' }),
                makeMasterDecision: jest.fn().mockResolvedValue({
                    decision: 'CANDIDATE_TRADE',
                    confidence: 80,
                    timeframe: '1h',
                    marketBias: 'BULLISH',
                    reasoning: 'Test bad LONG',
                    supportingFactors: [],
                    conflictingFactors: [],
                    riskLevel: 'MEDIUM',
                    tradeCandidate: {
                        side: 'LONG',
                        entryZone: { min: 60000, max: 61000 },
                        stopLoss: 61000, // Invalid: SL > entry for LONG
                        takeProfitLevels: [62000],
                        riskRewardRatio: 2,
                        invalidationCondition: 'test',
                        thesis: 'test',
                        timeframe: '1h'
                    }
                })
            };
        })
    };
});
describe('Phase 14: Gemini Intelligence Engine', () => {
    beforeEach(() => {
        process.env.GEMINI_API_KEY = 'mock_key';
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    test('GeminiProvider handles offline state if no API key', async () => {
        delete process.env.GEMINI_API_KEY;
        const provider = new geminiProvider_1.GeminiProvider();
        await expect(provider.generateObject('test', 'MarketContext')).rejects.toThrow('Gemini API is OFFLINE');
    });
    test('AgentRunner validation rejects invalid LONG setup', async () => {
        const result = await agentRunner_1.AgentRunner.runAnalysis('BTCUSDT');
        expect(result.decision).toBe('NO_TRADE');
        expect(result.reasoning).toContain('Deterministically rejected');
    });
});
