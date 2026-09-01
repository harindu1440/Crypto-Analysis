/**
 * geminiQuota.test.ts — Updated for Phase 20.2
 *
 * Tests that GeminiBudgetManager correctly tracks quota and that
 * GeminiProvider throws proper error codes for DynamicModelRouter to classify.
 */
import { GeminiBudgetManager } from '../services/ai/geminiBudgetManager';
import { GeminiProvider } from '../services/ai/providers/geminiProvider';
import { AIAgent } from '../services/ai/aiAgent';
import { ModelRegistry } from '../services/ai/modelRegistry';

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
    GeminiBudgetManager.resetForTesting();
  });

  test('Budget Manager tracks requests accurately', () => {
    expect(GeminiBudgetManager.canMakeRequest()).toBe(true);
    GeminiBudgetManager.recordRequest(true);
    const status = GeminiBudgetManager.getStatus();
    expect(status.stats.requestsThisMinute).toBe(1);
    expect(status.stats.requestsToday).toBe(1);
  });

  test('Budget Manager stops requests on Quota Exhaustion', () => {
    GeminiBudgetManager.markQuotaExhausted(true);
    expect(GeminiBudgetManager.canMakeRequest()).toBe(false);
    expect(GeminiBudgetManager.getStatus().status).toBe('QUOTA_EXHAUSTED');
  });

  test('GeminiProvider throws DAILY_QUOTA_EXHAUSTED when budget is exhausted', async () => {
    GeminiBudgetManager.markQuotaExhausted(true);
    const provider = new GeminiProvider();
    // When budget is exhausted, should immediately throw DAILY_QUOTA_EXHAUSTED
    await expect(provider.generateObject('test', 'ScreeningAnalysis')).rejects.toThrow('DAILY_QUOTA_EXHAUSTED');
  });

  test('ModelRegistry correctly classifies DAILY_QUOTA_EXHAUSTED as QUOTA_EXHAUSTED', () => {
    const errClass = ModelRegistry.classifyError(new Error('DAILY_QUOTA_EXHAUSTED'));
    expect(errClass).toBe('QUOTA_EXHAUSTED');
  });

  test('ModelRegistry correctly classifies rate limit 429 as RATE_LIMITED', () => {
    const errClass = ModelRegistry.classifyError(new Error('429 Too Many Requests'));
    expect(errClass).toBe('RATE_LIMITED');
  });

  test('ModelRegistry correctly classifies GenerateRequestsPerDayPerProjectFreeTier as QUOTA_EXHAUSTED', () => {
    const errClass = ModelRegistry.classifyError(new Error('GenerateRequestsPerDayPerProjectFreeTier limit exceeded'));
    expect(errClass).toBe('QUOTA_EXHAUSTED');
  });

  test('AIAgent screening returns ERROR on provider failure', async () => {
    const provider = new GeminiProvider();
    jest.spyOn(provider, 'generateObject').mockRejectedValueOnce(new Error('DAILY_QUOTA_EXHAUSTED'));

    const agent = new AIAgent(provider);
    const screening = await agent.analyzeScreening({} as any);

    expect(screening.status).toBe('ERROR');
    expect(screening.passScreening).toBe(false);
  });
});
