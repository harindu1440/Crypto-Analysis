"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
exports.app = app;
// Middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false, // Often disabled for simple SPA setups, configure as needed for production
}));
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '1mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '1mb' }));
// API Routes
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});
// Phase 11: System & Analytics Endpoints
const systemHealthService_1 = require("./services/system/systemHealthService");
const alertService_1 = require("./services/system/alertService");
const tradeAnalyticsService_1 = require("./services/analytics/tradeAnalyticsService");
app.get('/api/system/health', async (req, res) => {
    try {
        const health = await systemHealthService_1.SystemHealthService.getHealth();
        res.json(health);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/system/alerts', (req, res) => {
    res.json(alertService_1.AlertService.getAlerts());
});
app.get('/api/analytics/performance', (req, res) => {
    res.json(tradeAnalyticsService_1.TradeAnalyticsService.getAnalytics());
});
app.get('/api/analytics/equity-curve', (req, res) => {
    res.json(tradeAnalyticsService_1.TradeAnalyticsService.getEquityCurve());
});
// Binance Market Routes
const binanceMarketService_1 = require("./services/binance/binanceMarketService");
app.get('/api/markets/symbols', async (req, res) => {
    try {
        const symbols = await binanceMarketService_1.BinanceMarketService.getSymbols();
        res.json(symbols);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/markets/ticker/:symbol', async (req, res) => {
    try {
        const ticker = await binanceMarketService_1.BinanceMarketService.getTicker(req.params.symbol);
        res.json(ticker);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/markets/24hr/:symbol', async (req, res) => {
    try {
        const ticker = await binanceMarketService_1.BinanceMarketService.getTicker(req.params.symbol); // 24hr ticker is the same
        res.json(ticker);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/markets/klines/:symbol', async (req, res) => {
    try {
        const interval = req.query.interval || '1h';
        const limit = Number(req.query.limit) || 24;
        const klines = await binanceMarketService_1.BinanceMarketService.getKlines(req.params.symbol, interval, limit);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
const analysisService_1 = require("./services/analysis/analysisService");
const agentRunner_1 = require("./services/ai/agentRunner");
app.get('/api/analysis/:symbol', async (req, res) => {
    try {
        const interval = req.query.interval || '1h';
        const analysis = await analysisService_1.AnalysisService.getAnalysisSnapshot(req.params.symbol, [interval]);
        res.json(analysis);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Phase 5 AI Endpoints
app.post('/api/ai/analyze/:symbol', async (req, res) => {
    try {
        const analysis = await agentRunner_1.AgentRunner.runAnalysis(req.params.symbol);
        res.json(analysis);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/ai/analysis/:symbol', (req, res) => {
    const latest = agentRunner_1.AgentRunner.getLatestAnalysis(req.params.symbol);
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
const riskEngine_1 = require("./services/risk/riskEngine");
const riskConfig_1 = require("./services/risk/riskConfig");
app.get('/api/risk/config', (req, res) => {
    res.json(riskConfig_1.DEFAULT_RISK_SETTINGS);
});
app.post('/api/risk/validate/:symbol', async (req, res) => {
    try {
        const analysis = agentRunner_1.AgentRunner.getLatestAnalysis(req.params.symbol);
        if (!analysis) {
            return res.status(404).json({ error: `No AI analysis found for ${req.params.symbol}` });
        }
        const interval = req.query.interval || '1h';
        const snapshot = await analysisService_1.AnalysisService.getAnalysisSnapshot(req.params.symbol, [interval]);
        // Accept user settings from body, fallback to default
        const settings = { ...riskConfig_1.DEFAULT_RISK_SETTINGS, ...req.body };
        const tradePlan = riskEngine_1.RiskEngine.validateCandidate(analysis, snapshot, settings);
        riskEngine_1.PlanStore.save(tradePlan);
        res.json(tradePlan);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/risk/plan/:planId', (req, res) => {
    const plan = riskEngine_1.PlanStore.get(req.params.planId);
    if (!plan)
        return res.status(404).json({ error: 'Trade plan not found' });
    res.json(plan);
});
// Phase 7 Execution Endpoints
const executionScheduler_1 = require("./services/execution/executionScheduler");
app.get('/api/execution/upcoming', (req, res) => {
    res.json(executionScheduler_1.ExecutionScheduler.getUpcomingPlans());
});
app.get('/api/execution/status/:planId', (req, res) => {
    const status = executionScheduler_1.ExecutionScheduler.getExecutionStatus(req.params.planId);
    if (!status)
        return res.status(404).json({ error: 'Execution status not found' });
    res.json(status);
});
app.post('/api/execution/schedule/:planId', (req, res) => {
    try {
        const planId = req.params.planId;
        const plan = riskEngine_1.PlanStore.get(planId);
        if (!plan)
            return res.status(404).json({ error: 'Trade plan not found' });
        // Default schedule for Phase 7 simulation: schedule 6 minutes from now to test countdown
        const executeAt = Date.now() + (6 * 60 * 1000);
        executionScheduler_1.ExecutionScheduler.schedulePlan(plan, executeAt);
        res.json({ message: 'Plan scheduled successfully', executeAt });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
app.post('/api/execution/cancel/:planId', (req, res) => {
    try {
        executionScheduler_1.ExecutionScheduler.cancelPlan(req.params.planId);
        res.json({ message: 'Plan cancelled successfully' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
app.get('/api/execution/audit/:planId', (req, res) => {
    res.json(executionScheduler_1.ExecutionScheduler.getAuditLog(req.params.planId));
});
// Phase 12: Opportunity Endpoints
const opportunityService_1 = require("./services/opportunities/opportunityService");
app.get('/api/opportunities', (req, res) => {
    res.json(opportunityService_1.OpportunityService.getActiveOpportunities());
});
// Phase 10: Position & Lifecycle Endpoints
const positionManager_1 = require("./services/execution/positionManager");
app.get('/api/trading/positions', (req, res) => {
    res.json(positionManager_1.PositionManager.getActivePositions());
});
app.get('/api/trading/history', (req, res) => {
    const history = positionManager_1.PositionManager.getPositions().filter(p => p.status === 'CLOSED' || p.status === 'FAILED');
    res.json(history);
});
app.post('/api/trading/positions/:id/close', async (req, res) => {
    try {
        const pos = await positionManager_1.PositionManager.closePosition(req.params.id);
        res.json(pos);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
app.get('/api/trading/emergency-stop', (req, res) => {
    res.json({ isHalted: positionManager_1.PositionManager.isEmergencyStopped() });
});
app.post('/api/trading/emergency-stop', (req, res) => {
    const { halted } = req.body;
    positionManager_1.PositionManager.setEmergencyStop(halted === true);
    res.json({ isHalted: positionManager_1.PositionManager.isEmergencyStopped() });
});
// Phase 8 Monitoring Endpoints
const monitoringService_1 = require("./services/monitoring/monitoringService");
app.get('/api/monitoring/status', (req, res) => {
    res.json(monitoringService_1.MonitoringService.getStatus());
});
app.post('/api/monitoring/assets', (req, res) => {
    try {
        const { symbol } = req.body;
        if (!symbol || typeof symbol !== 'string') {
            return res.status(400).json({ error: 'Valid symbol required' });
        }
        monitoringService_1.MonitoringService.addAsset(symbol);
        res.json({ message: 'Asset added successfully' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
app.delete('/api/monitoring/assets/:symbol', (req, res) => {
    try {
        monitoringService_1.MonitoringService.removeAsset(req.params.symbol);
        res.json({ message: 'Asset removed successfully' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
app.post('/api/monitoring/assets/:symbol/enable', (req, res) => {
    try {
        monitoringService_1.MonitoringService.setAssetStatus(req.params.symbol, true);
        res.json({ message: 'Asset enabled' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
app.post('/api/monitoring/assets/:symbol/disable', (req, res) => {
    try {
        monitoringService_1.MonitoringService.setAssetStatus(req.params.symbol, false);
        res.json({ message: 'Asset disabled' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
app.post('/api/monitoring/start', (req, res) => {
    monitoringService_1.MonitoringService.start();
    res.json({ message: 'Monitoring started' });
});
app.post('/api/monitoring/stop', (req, res) => {
    monitoringService_1.MonitoringService.stop();
    res.json({ message: 'Monitoring stopped' });
});
app.get('/api/monitoring/events', (req, res) => {
    res.json(monitoringService_1.MonitoringService.getEvents());
});
// Phase 9 Account Endpoints
const accountSyncService_1 = require("./services/account/accountSyncService");
app.get('/api/account', async (req, res) => {
    const state = accountSyncService_1.AccountSyncService.getState();
    res.json({
        status: state.connectionStatus,
        lastSyncAt: state.lastSyncAt,
        balances: state.balances,
        error: state.lastError,
        automatedTradingEnabled: state.automatedTradingEnabled
    });
});
app.post('/api/account/automated-trading', express_1.default.json(), (req, res) => {
    try {
        const { enabled } = req.body;
        accountSyncService_1.AccountSyncService.setAutomatedTrading(enabled);
        res.json({ success: true, enabled: accountSyncService_1.AccountSyncService.getState().automatedTradingEnabled });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
app.get('/api/account/status', (req, res) => {
    const state = accountSyncService_1.AccountSyncService.getState();
    res.json({
        connected: state.connectionStatus === 'CONNECTED',
        mode: process.env.BINANCE_MODE || 'testnet',
        lastSyncAt: state.lastSyncAt,
        balanceAvailable: state.balances.length > 0,
        error: state.lastError
    });
});
app.get('/api/account/balances', (req, res) => {
    res.json(accountSyncService_1.AccountSyncService.getState().balances);
});
app.get('/api/account/orders', (req, res) => {
    const symbol = req.query.symbol;
    res.json(accountSyncService_1.AccountSyncService.getOpenOrders(symbol));
});
// Serve frontend static files
const frontendPath = path_1.default.join(__dirname, '../../frontend/dist');
app.use(express_1.default.static(frontendPath));
// SPA Fallback - Catch-all route to serve React app
app.get('*', (req, res) => {
    res.sendFile(path_1.default.join(frontendPath, 'index.html'));
});
// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});
