
import { OpportunityService } from '../services/opportunities/opportunityService';
import { ExecutionScheduler } from '../services/execution/executionScheduler';
import { RiskEngine } from '../services/risk/riskEngine';
import { PositionManager } from '../services/execution/positionManager';
import { LifecycleService } from '../services/opportunities/lifecycleService';

describe('Phase 20: Execution Safety & Isolation', () => {
  beforeEach(() => {
    // Reset state before tests
    OpportunityService.getOpportunities().length = 0;
  });

  it('SHOULD NOT execute trades automatically upon Entry Trigger', () => {
    // 1. Create a dummy opportunity
    const opp = {
      id: 'test_opp_1',
      symbol: 'BTCUSDT',
      direction: 'LONG',
      status: 'APPROACHING_ENTRY',
      entryZone: { min: 49000, max: 51000 },
      entryPrice: 50000,
      stopLoss: 48000,
      takeProfitTargets: [52000],
      qualityScore: 90
    } as any;
    
    OpportunityService.addOpportunity(opp);

    // 2. Simulate lifecycle transition to ENTRY_TRIGGERED
    const transitioned = LifecycleService.transition(opp, 'ENTRY_TRIGGERED', 'Simulated Touch');
    expect(transitioned).toBe(true);
    expect(opp.status).toBe('ENTRY_TRIGGERED');

    // 3. Verify ExecutionScheduler is unaware (No scheduled plans)
    const upcoming = ExecutionScheduler.getUpcomingPlans();
    expect(upcoming.length).toBe(0);

    // 4. Verify PositionManager has NO active positions
    const positions = PositionManager.getActivePositions();
    expect(positions.length).toBe(0);
  });
  
  it('SHOULD require explicit Risk validation and scheduling to execute', () => {
    const analysis = {
      decision: 'CANDIDATE_TRADE',
      confidence: 90,
      tradeCandidate: {
        side: 'LONG',
        entryZone: { min: 49000, max: 51000 },
        stopLoss: 48000,
        takeProfitLevels: [52000],
      }
    } as any;
    
    const snapshot = {
      market: { price: 50000 },
      timeframes: { '1h': { atr: 100 } }
    } as any;
    
    const settings = {
      accountEquity: 1000,
      riskPerTradePercent: 1,
      maxExposurePercent: 100,
      minimumRiskReward: 1
    } as any;
    
    // Explicit Validation
    const plan = RiskEngine.validateCandidate(analysis, snapshot, settings);
    expect(plan.validation.status).toBe('VALID');
    
    // Explicit Scheduling
    const executeAt = Date.now() + 5000;
    ExecutionScheduler.schedulePlan(plan, executeAt);
    
    const upcoming = ExecutionScheduler.getUpcomingPlans();
    expect(upcoming.length).toBe(1);
  });
});
