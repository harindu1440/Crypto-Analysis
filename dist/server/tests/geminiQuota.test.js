"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * geminiQuota.test.ts — Updated for Phase 20.2
 *
 * Tests that GeminiBudgetManager correctly tracks quota and that
 * GeminiProvider throws proper error codes for DynamicModelRouter to classify.
 */
const geminiBudgetManager_1 = require("../services/ai/geminiBudgetManager");
const geminiProvider_1 = require("../services/ai/providers/geminiProvider");
const aiAgent_1 = require("../services/ai/aiAgent");
const modelRegistry_1 = require("../services/ai/modelRegistry");
jest.mock('../services/analysis/analysisService', () => ({
    AnalysisService: {
        getAnalysisSnapshot: jest.fn().mockResolvedValue({
            symbol: 'BTCUSDT',
            timeframes: {},
            market: { price: 60000, volume24h: 1000, change24h: 2 }
        })
    }
}));
describe('Gemini Quota Orchestration', () => {
    beforeEach(() => {
        process.env.GEMINI_API_KEY = 'mock';
        geminiBudgetManager_1.GeminiBudgetManager.resetForTesting();
    });
    test('Budget Manager tracks requests accurately', () => {
        expect(geminiBudgetManager_1.GeminiBudgetManager.canMakeRequest()).toBe(true);
        geminiBudgetManager_1.GeminiBudgetManager.recordRequest(true);
        const status = geminiBudgetManager_1.GeminiBudgetManager.getStatus();
        expect(status.stats.requestsThisMinute).toBe(1);
        expect(status.stats.requestsToday).toBe(1);
    });
    test('Budget Manager stops requests on Quota Exhaustion', () => {
        geminiBudgetManager_1.GeminiBudgetManager.markQuotaExhausted(true);
        expect(geminiBudgetManager_1.GeminiBudgetManager.canMakeRequest()).toBe(false);
        expect(geminiBudgetManager_1.GeminiBudgetManager.getStatus().status).toBe('QUOTA_EXHAUSTED');
    });
    test('GeminiProvider throws DAILY_QUOTA_EXHAUSTED when budget is exhausted', async () => {
        geminiBudgetManager_1.GeminiBudgetManager.markQuotaExhausted(true);
        const provider = new geminiProvider_1.GeminiProvider();
        // When budget is exhausted, should immediately throw DAILY_QUOTA_EXHAUSTED
        await expect(provider.generateObject('test', 'ScreeningAnalysis')).rejects.toThrow('DAILY_QUOTA_EXHAUSTED');
    });
    test('ModelRegistry correctly classifies DAILY_QUOTA_EXHAUSTED as QUOTA_EXHAUSTED', () => {
        const errClass = modelRegistry_1.ModelRegistry.classifyError(new Error('DAILY_QUOTA_EXHAUSTED'));
        expect(errClass).toBe('QUOTA_EXHAUSTED');
    });
    test('ModelRegistry correctly classifies rate limit 429 as RATE_LIMITED', () => {
        const errClass = modelRegistry_1.ModelRegistry.classifyError(new Error('429 Too Many Requests'));
        expect(errClass).toBe('RATE_LIMITED');
    });
    test('ModelRegistry correctly classifies GenerateRequestsPerDayPerProjectFreeTier as QUOTA_EXHAUSTED', () => {
        const errClass = modelRegistry_1.ModelRegistry.classifyError(new Error('GenerateRequestsPerDayPerProjectFreeTier limit exceeded'));
        expect(errClass).toBe('QUOTA_EXHAUSTED');
    });
    test('AIAgent screening returns ERROR on provider failure', async () => {
        const provider = new geminiProvider_1.GeminiProvider();
        jest.spyOn(provider, 'generateObject').mockRejectedValueOnce(new Error('DAILY_QUOTA_EXHAUSTED'));
        const agent = new aiAgent_1.AIAgent(provider);
        const screening = await agent.analyzeScreening({});
        expect(screening.status).toBe('ERROR');
        expect(screening.passScreening).toBe(false);
    });
});
