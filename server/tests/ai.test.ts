/**
 * ai.test.ts — Updated for Phase 20.2 (Dynamic Model Router)
 */
import { AgentRunner } from '../services/ai/agentRunner';
import { GeminiProvider } from '../services/ai/providers/geminiProvider';

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

jest.mock('../services/ai/providers/providerRegistry', () => ({
  ProviderRegistry: {
    initialize: jest.fn(),
    isGeminiOnly: jest.fn().mockReturnValue(true),
    getEligibleProviders: jest.fn().mockReturnValue([]),
    getProviderHealths: jest.fn().mockReturnValue([]),
    getRouterStatus: jest.fn().mockReturnValue({ activeModel: null, eligibleCount: 0, totalModels: 0, models: [] })
  }
}));

// Mock ModelRegistry to return one eligible model (needed by agentRunner multi-model path)
jest.mock('../services/ai/modelRegistry', () => ({
  ModelRegistry: {
    register: jest.fn(),
    getAll: jest.fn().mockReturnValue([]),
    get: jest.fn(),
    getEligible: jest.fn().mockReturnValue([]),
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
    score: jest.fn().mockReturnValue(0.8),
    getStatus: jest.fn().mockReturnValue([]),
    classifyError: jest.fn().mockReturnValue('TRANSIENT'),
  }
}));

// Mock DynamicModelRouter to simulate a successful analysis with the invalid LONG trade
jest.mock('../services/ai/dynamicModelRouter', () => ({
  DynamicModelRouter: {
    executeWithFailover: jest.fn()
      .mockResolvedValueOnce({ data: { status: 'COMPLETE', passScreening: true, reasoning: 'ok' }, modelId: 'gemini:flash', provider: 'gemini', modelName: 'gemini-3.6-flash', latencyMs: 100, failoverCount: 0 })
      // MarketContext, Technical, Pattern
      .mockResolvedValueOnce({ data: { broaderTrend: 'BULLISH', marketCondition: 'RANGING', momentum: 'UP', unusualConditions: [], warnings: [] }, modelId: 'gemini:flash', provider: 'gemini', modelName: 'gemini-3.6-flash', latencyMs: 100, failoverCount: 0 })
      .mockResolvedValueOnce({ data: { technicalBias: 'BULLISH', indicatorAgreement: true, indicatorConflicts: [], importantLevels: [], technicalReasoning: 'Test' }, modelId: 'gemini:flash', provider: 'gemini', modelName: 'gemini-3.6-flash', latencyMs: 100, failoverCount: 0 })
      .mockResolvedValueOnce({ data: { bias: 'BULLISH', patternInterpretation: 'Test', reliabilityAssessment: 'HIGH', confirmationRequirements: '', invalidationConditions: '' }, modelId: 'gemini:flash', provider: 'gemini', modelName: 'gemini-3.6-flash', latencyMs: 100, failoverCount: 0 })
      // Timeframe, Liquidity, Sentiment
      .mockResolvedValueOnce({ data: { higherTimeframeBias: 'BULLISH', shortTermBias: 'BULLISH', mediumTermBias: 'BULLISH', timeframeAlignment: 'AGREEMENT', conflictingWarnings: [] }, modelId: 'gemini:flash', provider: 'gemini', modelName: 'gemini-3.6-flash', latencyMs: 100, failoverCount: 0 })
      .mockResolvedValueOnce({ data: { bias: 'BULLISH', liquidityZones: [], sweepsDetected: false, liquidityReasoning: 'Test' }, modelId: 'gemini:flash', provider: 'gemini', modelName: 'gemini-3.6-flash', latencyMs: 100, failoverCount: 0 })
      .mockResolvedValueOnce({ data: { bias: 'BULLISH', sentimentScore: 75, keyThemes: [], sentimentReasoning: 'Test' }, modelId: 'gemini:flash', provider: 'gemini', modelName: 'gemini-3.6-flash', latencyMs: 100, failoverCount: 0 })
      // Risk
      .mockResolvedValueOnce({ data: { riskLevel: 'MEDIUM', majorRisks: [], invalidationConditions: 'test', structurallyReasonable: true }, modelId: 'gemini:flash', provider: 'gemini', modelName: 'gemini-3.6-flash', latencyMs: 100, failoverCount: 0 })
      // MasterDecision — invalid LONG (SL above entry)
      .mockResolvedValueOnce({
        data: {
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
            stopLoss: 61000, // Invalid: SL >= entry for LONG
            takeProfitLevels: [62000],
            riskRewardRatio: 2,
            invalidationCondition: 'test',
            thesis: 'test',
            timeframe: '1h'
          }
        },
        modelId: 'gemini:flash', provider: 'gemini', modelName: 'gemini-3.6-flash', latencyMs: 200, failoverCount: 0
      }),
    getRouterStatus: jest.fn().mockReturnValue({ activeModel: null, eligibleCount: 0, totalModels: 0, models: [] }),
  },
  AIUnavailableError: class AIUnavailableError extends Error {
    attemptedModels: string[];
    constructor(attempted: string[]) {
      super('AI_UNAVAILABLE');
      this.name = 'AIUnavailableError';
      this.attemptedModels = attempted;
    }
  }
}));

describe('Phase 14: Gemini Intelligence Engine', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'mock_key';
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test('GeminiProvider handles offline state if no API key', async () => {
    delete process.env.GEMINI_API_KEY;
    const provider = new GeminiProvider();
    await expect(provider.generateObject('test', 'MarketContext')).rejects.toThrow('Gemini API is OFFLINE');
  });

  test('AgentRunner validation rejects invalid LONG setup', async () => {
    const result = await AgentRunner.runAnalysis('BTCUSDT');
    expect(result.decision).toBe('NO_TRADE');
    expect(result.reasoning).toContain('Deterministically rejected');
  });
});
