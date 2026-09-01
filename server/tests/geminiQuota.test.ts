import { GeminiBudgetManager } from '../services/ai/geminiBudgetManager';
import { GeminiProvider } from '../services/ai/providers/geminiProvider';
import { AIAgent } from '../services/ai/aiAgent';
import { AgentRunner } from '../services/ai/agentRunner';
import { AnalysisService } from '../services/analysis/analysisService';

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

  test('AgentRunner halts quickly if Screening fails due to Quota', async () => {
    const provider = new GeminiProvider();
    
    // Mock the provider to throw a DAILY_QUOTA_EXHAUSTED error during screening
    jest.spyOn(provider, 'generateObject').mockRejectedValueOnce(new Error('DAILY_QUOTA_EXHAUSTED'));

    const agent = new AIAgent(provider);
    
    const screening = await agent.analyzeScreening({} as any);
    
    expect(screening.status).toBe('ERROR');
    expect(screening.passScreening).toBe(false);
  });
});
