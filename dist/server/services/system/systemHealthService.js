"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemHealthService = void 0;
const database_1 = require("../../config/database");
const binanceMarketService_1 = require("../binance/binanceMarketService");
const accountSyncService_1 = require("../account/accountSyncService");
const monitoringService_1 = require("../monitoring/monitoringService");
const alertService_1 = require("./alertService");
exports.SystemHealthService = {
    async getHealth() {
        const health = {
            overall: 'HEALTHY',
            database: 'HEALTHY',
            binanceMarket: 'HEALTHY',
            binanceAccount: 'HEALTHY',
            monitoring: 'HEALTHY',
            timestamp: Date.now()
        };
        // 1. Database Check
        try {
            database_1.LocalDatabase.get('scheduledPlans');
        }
        catch (e) {
            health.database = 'OFFLINE';
            health.overall = 'DEGRADED';
        }
        // 2. Binance Market Data Check
        try {
            // Light ping
            await binanceMarketService_1.BinanceMarketService.getTicker('BTCUSDT');
        }
        catch (e) {
            health.binanceMarket = 'DEGRADED';
            health.overall = 'DEGRADED';
            alertService_1.AlertService.log('WARNING', 'SystemHealth', 'Binance Market Data degraded', 'BINANCE_MARKET_DOWN');
        }
        // 3. Binance Account Sync Check
        const accState = accountSyncService_1.AccountSyncService.getState();
        if (accState.connectionStatus !== 'CONNECTED') {
            health.binanceAccount = 'DEGRADED';
            health.overall = 'DEGRADED';
            alertService_1.AlertService.log('WARNING', 'SystemHealth', 'Binance Account Sync degraded', 'BINANCE_ACCOUNT_DOWN');
        }
        // 4. Monitoring Engine
        const monStatus = monitoringService_1.MonitoringService.getStatus();
        if (!monStatus.running) {
            health.monitoring = 'OFFLINE';
            if (process.env.AUTO_MONITORING !== 'false') {
                health.overall = 'DEGRADED';
            }
        }
        return health;
    }
};
