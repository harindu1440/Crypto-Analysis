import { MonitoringService } from '../services/monitoring/monitoringService';
import { AgentRunner } from '../services/ai/agentRunner';
import { RiskEngine } from '../services/risk/riskEngine';
import { ExecutionScheduler } from '../services/execution/executionScheduler';
import { binanceWS } from '../services/binance/binanceWebSocketService';
import { AnalysisService } from '../services/analysis/analysisService';

jest.mock('../services/ai/agentRunner');
jest.mock('../services/risk/riskEngine');
jest.mock('../services/execution/executionScheduler');
jest.mock('../services/binance/binanceWebSocketService');
jest.mock('../services/analysis/analysisService');

describe('Monitoring Service', () => {

  beforeEach(() => {
    MonitoringService.stop();
    // clear memory
    const status = MonitoringService.getStatus();
    status.assets.forEach(a => MonitoringService.removeAsset(a.symbol));
    jest.clearAllMocks();
  });

  it('adds and removes assets correctly', () => {
    MonitoringService.addAsset('BTCUSDT');
    const status = MonitoringService.getStatus();
    expect(status.assets.length).toBe(1);
    expect(status.assets[0].symbol).toBe('BTCUSDT');

    MonitoringService.removeAsset('BTCUSDT');
    expect(MonitoringService.getStatus().assets.length).toBe(0);
  });

  it('prevents duplicate asset additions', () => {
    MonitoringService.addAsset('ETHUSDT');
    expect(() => MonitoringService.addAsset('ETHUSDT')).toThrow();
  });

  it('connects to WS when started with active assets', () => {
    MonitoringService.addAsset('SOLUSDT');
    MonitoringService.start();
    expect(binanceWS.subscribe).toHaveBeenCalledWith(['SOLUSDT']);
  });

  it('does not run analysis on every tick (cooldown/price delta logic)', async () => {
    MonitoringService.addAsset('ADAUSDT');
    MonitoringService.start();

    // Trigger tick 1 (sets lastPrice)
    (MonitoringService as any).handleMarketTick({ symbol: 'ADAUSDT', price: 100 });
    expect(AgentRunner.runAnalysis).not.toHaveBeenCalled();

    // Trigger tick 2 immediately with 0.1% change (should not trigger)
    (MonitoringService as any).handleMarketTick({ symbol: 'ADAUSDT', price: 100.1 });
    expect(AgentRunner.runAnalysis).not.toHaveBeenCalled();

    // Fake time in the state so cooldown passes
    const state = (MonitoringService as any).state.get('ADAUSDT');
    state.lastAnalysisAt = Date.now() - 10 * 60 * 1000; // 10 mins ago

    // Trigger tick 3 with 2% change (exceeds 1.5% threshold)
    (MonitoringService as any).handleMarketTick({ symbol: 'ADAUSDT', price: 102 });
    
    // Allow microtask queue to drain for async pipeline
    await new Promise(process.nextTick);
    
    expect(AgentRunner.runAnalysis).toHaveBeenCalledWith('ADAUSDT');
  });

  it('orchestrates pipeline to scheduler for VALID candidate', async () => {
    MonitoringService.addAsset('BNBUSDT');
    MonitoringService.start();

    const mockDecision = { decision: 'CANDIDATE_TRADE', analysisId: '123' };
    (AgentRunner.runAnalysis as jest.Mock).mockResolvedValue(mockDecision);
    
    (AnalysisService.getAnalysisSnapshot as jest.Mock).mockResolvedValue({});
    
    const mockPlan = { planId: 'p1', validation: { status: 'VALID' } };
    (RiskEngine.validateCandidate as jest.Mock).mockReturnValue(mockPlan);

    (ExecutionScheduler.getAuditLog as jest.Mock).mockReturnValue([]); // No duplicates

    // Manually force time since last analysis to be high so we trigger on time
    const state = (MonitoringService as any).state.get('BNBUSDT');
    state.lastPrice = 200;
    state.lastAnalysisAt = Date.now() - 10 * 60 * 1000; // 10 mins ago

    (MonitoringService as any).handleMarketTick({ symbol: 'BNBUSDT', price: 200 });

    await new Promise(process.nextTick);

    expect(AgentRunner.runAnalysis).toHaveBeenCalled();
    expect(RiskEngine.validateCandidate).toHaveBeenCalled();
    expect(ExecutionScheduler.schedulePlan).toHaveBeenCalledWith(mockPlan, expect.any(Number));
  });

  it('stops at NO_TRADE and does not schedule', async () => {
    MonitoringService.addAsset('XRPUSDT');
    MonitoringService.start();

    const mockDecision = { decision: 'NO_TRADE' };
    (AgentRunner.runAnalysis as jest.Mock).mockResolvedValue(mockDecision);

    const state = (MonitoringService as any).state.get('XRPUSDT');
    state.lastPrice = 0.50;
    state.lastAnalysisAt = Date.now() - 10 * 60 * 1000;

    (MonitoringService as any).handleMarketTick({ symbol: 'XRPUSDT', price: 0.50 });

    await new Promise(process.nextTick);

    expect(AgentRunner.runAnalysis).toHaveBeenCalled();
    expect(RiskEngine.validateCandidate).not.toHaveBeenCalled();
    expect(ExecutionScheduler.schedulePlan).not.toHaveBeenCalled();
  });

  it('prevents scheduling exact duplicates', async () => {
    MonitoringService.addAsset('DOTUSDT');
    MonitoringService.start();

    const mockDecision = { decision: 'CANDIDATE_TRADE', analysisId: 'dup123' };
    (AgentRunner.runAnalysis as jest.Mock).mockResolvedValue(mockDecision);
    (AnalysisService.getAnalysisSnapshot as jest.Mock).mockResolvedValue({});
    const mockPlan = { planId: 'p2', validation: { status: 'VALID' } };
    (RiskEngine.validateCandidate as jest.Mock).mockReturnValue(mockPlan);

    // MOCK: Audit log returns an existing entry for this planId
    (ExecutionScheduler.getAuditLog as jest.Mock).mockReturnValue([{ id: 'audit1' }]); 

    const state = (MonitoringService as any).state.get('DOTUSDT');
    state.lastPrice = 5;
    state.lastAnalysisAt = Date.now() - 10 * 60 * 1000;

    (MonitoringService as any).handleMarketTick({ symbol: 'DOTUSDT', price: 5 });

    await new Promise(process.nextTick);

    expect(AgentRunner.runAnalysis).toHaveBeenCalled();
    expect(RiskEngine.validateCandidate).toHaveBeenCalled();
    // Scheduler should NOT be called because it's a duplicate
    expect(ExecutionScheduler.schedulePlan).not.toHaveBeenCalled();
  });

});
