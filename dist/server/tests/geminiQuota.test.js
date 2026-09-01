"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const geminiBudgetManager_1 = require("../services/ai/geminiBudgetManager");
const geminiProvider_1 = require("../services/ai/providers/geminiProvider");
const aiAgent_1 = require("../services/ai/aiAgent");
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
    test('AgentRunner halts quickly if Screening fails due to Quota', async () => {
        const provider = new geminiProvider_1.GeminiProvider();
        // Mock the provider to throw a DAILY_QUOTA_EXHAUSTED error during screening
        jest.spyOn(provider, 'generateObject').mockRejectedValueOnce(new Error('DAILY_QUOTA_EXHAUSTED'));
        const agent = new aiAgent_1.AIAgent(provider);
        const screening = await agent.analyzeScreening({});
        expect(screening.status).toBe('ERROR');
        expect(screening.passScreening).toBe(false);
    });
});
