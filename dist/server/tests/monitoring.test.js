"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const monitoringService_1 = require("../services/monitoring/monitoringService");
const agentRunner_1 = require("../services/ai/agentRunner");
const riskEngine_1 = require("../services/risk/riskEngine");
const executionScheduler_1 = require("../services/execution/executionScheduler");
const binanceWebSocketService_1 = require("../services/binance/binanceWebSocketService");
const analysisService_1 = require("../services/analysis/analysisService");
jest.mock('../services/ai/agentRunner');
jest.mock('../services/risk/riskEngine');
jest.mock('../services/execution/executionScheduler');
jest.mock('../services/binance/binanceWebSocketService');
jest.mock('../services/analysis/analysisService');
describe('Monitoring Service', () => {
    beforeEach(() => {
        monitoringService_1.MonitoringService.stop();
        // clear memory
        const status = monitoringService_1.MonitoringService.getStatus();
        status.assets.forEach(a => monitoringService_1.MonitoringService.removeAsset(a.symbol));
        jest.clearAllMocks();
    });
    it('adds and removes assets correctly', () => {
        monitoringService_1.MonitoringService.addAsset('BTCUSDT');
        const status = monitoringService_1.MonitoringService.getStatus();
        expect(status.assets.length).toBe(1);
        expect(status.assets[0].symbol).toBe('BTCUSDT');
        monitoringService_1.MonitoringService.removeAsset('BTCUSDT');
        expect(monitoringService_1.MonitoringService.getStatus().assets.length).toBe(0);
    });
    it('prevents duplicate asset additions', () => {
        monitoringService_1.MonitoringService.addAsset('ETHUSDT');
        expect(() => monitoringService_1.MonitoringService.addAsset('ETHUSDT')).toThrow();
    });
    it('connects to WS when started with active assets', () => {
        monitoringService_1.MonitoringService.addAsset('SOLUSDT');
        monitoringService_1.MonitoringService.start();
        expect(binanceWebSocketService_1.binanceWS.subscribe).toHaveBeenCalledWith(['SOLUSDT']);
    });
    it('does not run analysis on every tick (cooldown/price delta logic)', async () => {
        monitoringService_1.MonitoringService.addAsset('ADAUSDT');
        monitoringService_1.MonitoringService.start();
        // Trigger tick 1 (sets lastPrice)
        monitoringService_1.MonitoringService.handleMarketTick({ symbol: 'ADAUSDT', price: 100 });
        expect(agentRunner_1.AgentRunner.runAnalysis).not.toHaveBeenCalled();
        // Trigger tick 2 immediately with 0.1% change (should not trigger)
        monitoringService_1.MonitoringService.handleMarketTick({ symbol: 'ADAUSDT', price: 100.1 });
        expect(agentRunner_1.AgentRunner.runAnalysis).not.toHaveBeenCalled();
        // Fake time in the state so cooldown passes
        const state = monitoringService_1.MonitoringService.state.get('ADAUSDT');
        state.lastAnalysisAt = Date.now() - 10 * 60 * 1000; // 10 mins ago
        // Trigger tick 3 with 2% change (exceeds 1.5% threshold)
        monitoringService_1.MonitoringService.handleMarketTick({ symbol: 'ADAUSDT', price: 102 });
        // Allow microtask queue to drain for async pipeline
        await new Promise(process.nextTick);
        expect(agentRunner_1.AgentRunner.runAnalysis).toHaveBeenCalledWith('ADAUSDT');
    });
    it('orchestrates pipeline to scheduler for VALID candidate', async () => {
        monitoringService_1.MonitoringService.addAsset('BNBUSDT');
        monitoringService_1.MonitoringService.start();
        const mockDecision = { decision: 'CANDIDATE_TRADE', analysisId: '123' };
        agentRunner_1.AgentRunner.runAnalysis.mockResolvedValue(mockDecision);
        analysisService_1.AnalysisService.getAnalysisSnapshot.mockResolvedValue({});
        const mockPlan = { planId: 'p1', validation: { status: 'VALID' } };
        riskEngine_1.RiskEngine.validateCandidate.mockReturnValue(mockPlan);
        executionScheduler_1.ExecutionScheduler.getAuditLog.mockReturnValue([]); // No duplicates
        // Manually force time since last analysis to be high so we trigger on time
        const state = monitoringService_1.MonitoringService.state.get('BNBUSDT');
        state.lastPrice = 200;
        state.lastAnalysisAt = Date.now() - 10 * 60 * 1000; // 10 mins ago
        monitoringService_1.MonitoringService.handleMarketTick({ symbol: 'BNBUSDT', price: 200 });
        await new Promise(process.nextTick);
        expect(agentRunner_1.AgentRunner.runAnalysis).toHaveBeenCalled();
        expect(riskEngine_1.RiskEngine.validateCandidate).toHaveBeenCalled();
        expect(executionScheduler_1.ExecutionScheduler.schedulePlan).toHaveBeenCalledWith(mockPlan, expect.any(Number));
    });
    it('stops at NO_TRADE and does not schedule', async () => {
        monitoringService_1.MonitoringService.addAsset('XRPUSDT');
        monitoringService_1.MonitoringService.start();
        const mockDecision = { decision: 'NO_TRADE' };
        agentRunner_1.AgentRunner.runAnalysis.mockResolvedValue(mockDecision);
        const state = monitoringService_1.MonitoringService.state.get('XRPUSDT');
        state.lastPrice = 0.50;
        state.lastAnalysisAt = Date.now() - 10 * 60 * 1000;
        monitoringService_1.MonitoringService.handleMarketTick({ symbol: 'XRPUSDT', price: 0.50 });
        await new Promise(process.nextTick);
        expect(agentRunner_1.AgentRunner.runAnalysis).toHaveBeenCalled();
        expect(riskEngine_1.RiskEngine.validateCandidate).not.toHaveBeenCalled();
        expect(executionScheduler_1.ExecutionScheduler.schedulePlan).not.toHaveBeenCalled();
    });
    it('prevents scheduling exact duplicates', async () => {
        monitoringService_1.MonitoringService.addAsset('DOTUSDT');
        monitoringService_1.MonitoringService.start();
        const mockDecision = { decision: 'CANDIDATE_TRADE', analysisId: 'dup123' };
        agentRunner_1.AgentRunner.runAnalysis.mockResolvedValue(mockDecision);
        analysisService_1.AnalysisService.getAnalysisSnapshot.mockResolvedValue({});
        const mockPlan = { planId: 'p2', validation: { status: 'VALID' } };
        riskEngine_1.RiskEngine.validateCandidate.mockReturnValue(mockPlan);
        // MOCK: Audit log returns an existing entry for this planId
        executionScheduler_1.ExecutionScheduler.getAuditLog.mockReturnValue([{ id: 'audit1' }]);
        const state = monitoringService_1.MonitoringService.state.get('DOTUSDT');
        state.lastPrice = 5;
        state.lastAnalysisAt = Date.now() - 10 * 60 * 1000;
        monitoringService_1.MonitoringService.handleMarketTick({ symbol: 'DOTUSDT', price: 5 });
        await new Promise(process.nextTick);
        expect(agentRunner_1.AgentRunner.runAnalysis).toHaveBeenCalled();
        expect(riskEngine_1.RiskEngine.validateCandidate).toHaveBeenCalled();
        // Scheduler should NOT be called because it's a duplicate
        expect(executionScheduler_1.ExecutionScheduler.schedulePlan).not.toHaveBeenCalled();
    });
});
