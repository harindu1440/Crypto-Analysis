import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';

const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Often disabled for simple SPA setups, configure as needed for production
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// API Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Binance Market Routes
import { BinanceMarketService } from './services/binance/binanceMarketService';

app.get('/api/markets/symbols', async (req, res) => {
  try {
    const symbols = await BinanceMarketService.getSymbols();
    res.json(symbols);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/markets/ticker/:symbol', async (req, res) => {
  try {
    const ticker = await BinanceMarketService.getTicker(req.params.symbol);
    res.json(ticker);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/markets/24hr/:symbol', async (req, res) => {
  try {
    const ticker = await BinanceMarketService.getTicker(req.params.symbol); // 24hr ticker is the same
    res.json(ticker);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/markets/klines/:symbol', async (req, res) => {
  try {
    const interval = (req.query.interval as string) || '1h';
    const limit = Number(req.query.limit) || 24;
    const klines = await BinanceMarketService.getKlines(req.params.symbol, interval, limit);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

import { AnalysisService } from './services/analysis/analysisService';
import { AgentRunner } from './services/ai/agentRunner';

app.get('/api/analysis/:symbol', async (req, res) => {
  try {
    const interval = (req.query.interval as string) || '1h';
    const analysis = await AnalysisService.getAnalysisSnapshot(req.params.symbol, [interval]);
    res.json(analysis);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Phase 5 AI Endpoints
app.post('/api/ai/analyze/:symbol', async (req, res) => {
  try {
    const analysis = await AgentRunner.runAnalysis(req.params.symbol);
    res.json(analysis);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/ai/analysis/:symbol', (req, res) => {
  const latest = AgentRunner.getLatestAnalysis(req.params.symbol);
  if (!latest) {
    return res.status(404).json({ error: `No AI analysis found for ${req.params.symbol}` });
  }
  res.json(latest);
});

app.get('/api/ai/status', (req, res) => {
  res.json({
    status: 'ONLINE',
    provider: 'mock-provider',
    message: 'AI Multi-Agent pipeline is ready.'
  });
});

// Phase 6 Risk Endpoints
import { RiskEngine, PlanStore } from './services/risk/riskEngine';
import { DEFAULT_RISK_SETTINGS } from './services/risk/riskConfig';
import { UserRiskSettings } from './services/risk/types';

app.get('/api/risk/config', (req, res) => {
  res.json(DEFAULT_RISK_SETTINGS);
});

app.post('/api/risk/validate/:symbol', async (req, res) => {
  try {
    const analysis = AgentRunner.getLatestAnalysis(req.params.symbol);
    if (!analysis) {
      return res.status(404).json({ error: `No AI analysis found for ${req.params.symbol}` });
    }

    const interval = (req.query.interval as string) || '1h';
    const snapshot = await AnalysisService.getAnalysisSnapshot(req.params.symbol, [interval]);

    // Accept user settings from body, fallback to default
    const settings: UserRiskSettings = { ...DEFAULT_RISK_SETTINGS, ...req.body };
    
    const tradePlan = RiskEngine.validateCandidate(analysis, snapshot, settings);
    PlanStore.save(tradePlan);
    
    res.json(tradePlan);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/risk/plan/:planId', (req, res) => {
  const plan = PlanStore.get(req.params.planId);
  if (!plan) return res.status(404).json({ error: 'Trade plan not found' });
  res.json(plan);
});

// Phase 7 Execution Endpoints
import { ExecutionScheduler } from './services/execution/executionScheduler';

app.get('/api/execution/upcoming', (req, res) => {
  res.json(ExecutionScheduler.getUpcomingPlans());
});

app.get('/api/execution/status/:planId', (req, res) => {
  const status = ExecutionScheduler.getExecutionStatus(req.params.planId);
  if (!status) return res.status(404).json({ error: 'Execution status not found' });
  res.json(status);
});

app.post('/api/execution/schedule/:planId', (req, res) => {
  try {
    const planId = req.params.planId;
    const plan = PlanStore.get(planId);
    if (!plan) return res.status(404).json({ error: 'Trade plan not found' });
    
    // Default schedule for Phase 7 simulation: schedule 6 minutes from now to test countdown
    const executeAt = Date.now() + (6 * 60 * 1000); 
    
    ExecutionScheduler.schedulePlan(plan, executeAt);
    res.json({ message: 'Plan scheduled successfully', executeAt });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/execution/cancel/:planId', (req, res) => {
  try {
    ExecutionScheduler.cancelPlan(req.params.planId);
    res.json({ message: 'Plan cancelled successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/execution/audit/:planId', (req, res) => {
  res.json(ExecutionScheduler.getAuditLog(req.params.planId));
});

// Phase 10: Position & Lifecycle Endpoints
import { PositionManager } from './services/execution/positionManager';

app.get('/api/trading/positions', (req, res) => {
  res.json(PositionManager.getActivePositions());
});

app.get('/api/trading/history', (req, res) => {
  const history = PositionManager.getPositions().filter(p => p.status === 'CLOSED' || p.status === 'FAILED');
  res.json(history);
});

app.post('/api/trading/positions/:id/close', async (req, res) => {
  try {
    const pos = await PositionManager.closePosition(req.params.id);
    res.json(pos);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/trading/emergency-stop', (req, res) => {
  res.json({ isHalted: PositionManager.isEmergencyStopped() });
});

app.post('/api/trading/emergency-stop', (req, res) => {
  const { halted } = req.body;
  PositionManager.setEmergencyStop(halted === true);
  res.json({ isHalted: PositionManager.isEmergencyStopped() });
});

// Phase 8 Monitoring Endpoints
import { MonitoringService } from './services/monitoring/monitoringService';

app.get('/api/monitoring/status', (req, res) => {
  res.json(MonitoringService.getStatus());
});

app.post('/api/monitoring/assets', (req, res) => {
  try {
    const { symbol } = req.body;
    if (!symbol || typeof symbol !== 'string') {
      return res.status(400).json({ error: 'Valid symbol required' });
    }
    MonitoringService.addAsset(symbol);
    res.json({ message: 'Asset added successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/monitoring/assets/:symbol', (req, res) => {
  try {
    MonitoringService.removeAsset(req.params.symbol);
    res.json({ message: 'Asset removed successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/monitoring/assets/:symbol/enable', (req, res) => {
  try {
    MonitoringService.setAssetStatus(req.params.symbol, true);
    res.json({ message: 'Asset enabled' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/monitoring/assets/:symbol/disable', (req, res) => {
  try {
    MonitoringService.setAssetStatus(req.params.symbol, false);
    res.json({ message: 'Asset disabled' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/monitoring/start', (req, res) => {
  MonitoringService.start();
  res.json({ message: 'Monitoring started' });
});

app.post('/api/monitoring/stop', (req, res) => {
  MonitoringService.stop();
  res.json({ message: 'Monitoring stopped' });
});

app.get('/api/monitoring/events', (req, res) => {
  res.json(MonitoringService.getEvents());
});

// Phase 9 Account Endpoints
import { AccountSyncService } from './services/account/accountSyncService';

app.get('/api/account/status', (req, res) => {
  const state = AccountSyncService.getState();
  res.json({
    connected: state.connectionStatus === 'CONNECTED',
    mode: process.env.BINANCE_MODE || 'testnet',
    lastSyncAt: state.lastSyncAt,
    balanceAvailable: state.balances.length > 0,
    error: state.lastError
  });
});

app.get('/api/account/balances', (req, res) => {
  res.json(AccountSyncService.getState().balances);
});

app.get('/api/account/orders', (req, res) => {
  const symbol = req.query.symbol as string;
  res.json(AccountSyncService.getOpenOrders(symbol));
});

// Serve frontend static files
const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

// SPA Fallback - Catch-all route to serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

export { app };
