"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const opportunityService_1 = require("../services/opportunities/opportunityService");
const executionScheduler_1 = require("../services/execution/executionScheduler");
const riskEngine_1 = require("../services/risk/riskEngine");
const positionManager_1 = require("../services/execution/positionManager");
const lifecycleService_1 = require("../services/opportunities/lifecycleService");
describe('Phase 20: Execution Safety & Isolation', () => {
    beforeEach(() => {
        // Reset state before tests
        opportunityService_1.OpportunityService.getOpportunities().length = 0;
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
        };
        opportunityService_1.OpportunityService.addOpportunity(opp);
        // 2. Simulate lifecycle transition to ENTRY_TRIGGERED
        const transitioned = lifecycleService_1.LifecycleService.transition(opp, 'ENTRY_TRIGGERED', 'Simulated Touch');
        expect(transitioned).toBe(true);
        expect(opp.status).toBe('ENTRY_TRIGGERED');
        // 3. Verify ExecutionScheduler is unaware (No scheduled plans)
        const upcoming = executionScheduler_1.ExecutionScheduler.getUpcomingPlans();
        expect(upcoming.length).toBe(0);
        // 4. Verify PositionManager has NO active positions
        const positions = positionManager_1.PositionManager.getActivePositions();
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
        };
        const snapshot = {
            market: { price: 50000 },
            timeframes: { '1h': { atr: 100 } }
        };
        const settings = {
            accountEquity: 1000,
            riskPerTradePercent: 1,
            maxExposurePercent: 100,
            minimumRiskReward: 1
        };
        // Explicit Validation
        const plan = riskEngine_1.RiskEngine.validateCandidate(analysis, snapshot, settings);
        expect(plan.validation.status).toBe('VALID');
        // Explicit Scheduling
        const executeAt = Date.now() + 5000;
        executionScheduler_1.ExecutionScheduler.schedulePlan(plan, executeAt);
        const upcoming = executionScheduler_1.ExecutionScheduler.getUpcomingPlans();
        expect(upcoming.length).toBe(1);
    });
});
