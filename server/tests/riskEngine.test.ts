import { PositionSizer } from '../services/risk/positionSizer';
import { RiskEngine } from '../services/risk/riskEngine';
import { DEFAULT_RISK_SETTINGS } from '../services/risk/riskConfig';
import { MasterDecisionOutput } from '../services/ai/schemas/types';

describe('Risk Engine Validation & Position Sizing', () => {

  const baseSettings = { ...DEFAULT_RISK_SETTINGS, accountEquity: 1000, riskPerTradePercent: 1, maxExposurePercent: 100 };
  
  const mockSnapshot: any = {
    timeframes: {
      '1h': {
        volatility: { level: 'NORMAL', atrPercentage: 2.5 }
      }
    }
  };

  it('calculates LONG position size correctly', () => {
    const result = PositionSizer.calculatePosition('LONG', 100, 98, baseSettings);
    expect(result.riskAmount).toBe(10);
    expect(result.stopDistance).toBe(2);
    expect(result.quantity).toBe(5);
    expect(result.notionalValue).toBe(500);
  });

  it('calculates SHORT position size correctly', () => {
    const result = PositionSizer.calculatePosition('SHORT', 100, 102, baseSettings);
    expect(result.riskAmount).toBe(10);
    expect(result.stopDistance).toBe(2);
    expect(result.quantity).toBe(5);
    expect(result.notionalValue).toBe(500);
  });

  it('throws error on zero stop distance', () => {
    expect(() => PositionSizer.calculatePosition('LONG', 100, 100, baseSettings)).toThrow();
  });

  it('rejects LONG candidate with stop loss above entry', () => {
    const analysis: any = {
      decision: 'CANDIDATE_TRADE',
      tradeCandidate: {
        side: 'LONG',
        entryZone: { min: 99, max: 101 }, 
        stopLoss: 102,
        takeProfitLevels: [110]
      },
      agentResults: {}
    };

    const plan = RiskEngine.validateCandidate(analysis, mockSnapshot, baseSettings);
    expect(plan.validation.status).toBe('REJECTED');
    expect(plan.validation.reasons).toContain('Stop Loss must be below Entry for LONG.');
  });

  it('rejects candidate with excessive exposure', () => {
    const analysis: any = {
      decision: 'CANDIDATE_TRADE',
      tradeCandidate: {
        side: 'LONG',
        entryZone: { min: 100, max: 100 },
        stopLoss: 99.9,
        takeProfitLevels: [110]
      },
      agentResults: {}
    };

    const plan = RiskEngine.validateCandidate(analysis, mockSnapshot, baseSettings);
    expect(plan.validation.status).toBe('REJECTED');
    expect(plan.validation.reasons[0]).toMatch(/exceeds maximum exposure limit/);
  });

  it('rejects candidate with insufficient RR', () => {
    const analysis: any = {
      decision: 'CANDIDATE_TRADE',
      tradeCandidate: {
        side: 'LONG',
        entryZone: { min: 100, max: 100 },
        stopLoss: 98,
        takeProfitLevels: [101]
      },
      agentResults: {}
    };

    const plan = RiskEngine.validateCandidate(analysis, mockSnapshot, baseSettings);
    expect(plan.validation.status).toBe('REJECTED');
    expect(plan.validation.reasons).toContain('No Take Profit levels meet the minimum Risk/Reward requirement.');
  });

  it('creates VALID trade plan', () => {
    const analysis: any = {
      decision: 'CANDIDATE_TRADE',
      tradeCandidate: {
        side: 'LONG',
        entryZone: { min: 100, max: 100 },
        stopLoss: 98,
        takeProfitLevels: [106]
      },
      agentResults: {}
    };

    const plan = RiskEngine.validateCandidate(analysis, mockSnapshot, baseSettings);
    expect(plan.validation.status).toBe('VALID');
    expect(plan.takeProfits[0].riskReward).toBe(3.0);
    expect(plan.position.notionalValue).toBe(500);
  });

});
