import { AdaptiveIntelligenceService } from '../services/ai/adaptiveIntelligenceService';
import { MasterDecisionOutput } from '../services/ai/schemas/types';
import { LocalDatabase } from '../config/database';

jest.mock('../config/database', () => ({
  LocalDatabase: {
    get: jest.fn(),
    insert: jest.fn(),
    save: jest.fn()
  }
}));

describe('AdaptiveIntelligenceService', () => {
  const mockQualityEval = {
    isQualified: true,
    score: 85,
    marketRegime: 'TRENDING'
  };

  const mockSignal: MasterDecisionOutput = {
    symbol: 'BTCUSDT',
    timeframe: '1h',
    decision: 'CANDIDATE_TRADE',
    confidence: 0.80,
    reasoning: 'Test',
    analysisId: 'test-123',
    timestamp: Date.now(),
    provider: 'Test',
    marketBias: 'BULLISH',
    supportingFactors: [],
    conflictingFactors: [],
    riskLevel: 'MEDIUM',
    agentResults: {} as any,
    tradeCandidate: {
      side: 'LONG',
      entryZone: { min: 60000, max: 61000 },
      stopLoss: 59000,
      takeProfitLevels: [63000],
      riskRewardRatio: 2.0,
      timeframe: '1h',
      invalidationCondition: 'Price drops below 59k',
      thesis: 'Strong bullish continuation'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns COLD_START when no profile exists', () => {
    (LocalDatabase.get as jest.Mock).mockReturnValue({});
    
    const result = AdaptiveIntelligenceService.calibrateSignal(mockSignal, mockQualityEval, {});
    
    expect(result.adaptiveStatus).toBe('COLD_START');
    expect(result.calibratedConfidence).toBe(0.80);
    expect(result.calibratedQualityScore).toBe(85);
  });

  test('applies positive calibration when expectancy is high', () => {
    (LocalDatabase.get as jest.Mock).mockReturnValue({
      'BTCUSDT-1h-LONG-TRENDING': {
        sampleSize: 100,
        winRate: 70,
        avgR: 1.5,
        reliability: 'HIGH',
        profileVersion: 1
      }
    });

    const result = AdaptiveIntelligenceService.calibrateSignal(mockSignal, mockQualityEval, {});
    
    // Expectancy: (0.7 * 1.5) - 0.3 = 1.05 - 0.3 = 0.75 (>0.5 -> +5 score)
    expect(result.adaptiveStatus).toBe('HIGH');
    expect(result.calibratedQualityScore).toBe(90); // 85 + 5
    expect(result.calibratedConfidence).toBe(0.70); // 0.80 - 0.10 (bounded max adjustment since 70% is actual vs 80% predicted)
  });

  test('applies negative calibration when expectancy is low', () => {
    (LocalDatabase.get as jest.Mock).mockReturnValue({
      'BTCUSDT-1h-LONG-TRENDING': {
        sampleSize: 50,
        winRate: 30,
        avgR: 0.5,
        reliability: 'LOW',
        profileVersion: 1
      }
    });

    const result = AdaptiveIntelligenceService.calibrateSignal(mockSignal, mockQualityEval, {});
    
    // Expectancy: (0.3 * 0.5) - 0.7 = 0.15 - 0.7 = -0.55 (<0 -> -5 score)
    expect(result.adaptiveStatus).toBe('LOW');
    expect(result.calibratedQualityScore).toBe(80); // 85 - 5
    // Confidence is 80%, win rate is 30%. Delta is -0.50. Max adjustment is -0.10.
    expect(result.calibratedConfidence).toBe(0.70); 
  });
});
