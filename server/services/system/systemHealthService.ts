import { LocalDatabase } from '../../config/database';
import { BinanceMarketService } from '../binance/binanceMarketService';
import { AccountSyncService } from '../account/accountSyncService';
import { MonitoringService } from '../monitoring/monitoringService';
import { AlertService } from './alertService';

export const SystemHealthService = {
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
      LocalDatabase.get('scheduledPlans');
    } catch (e) {
      health.database = 'OFFLINE';
      health.overall = 'DEGRADED';
    }

    // 2. Binance Market Data Check
    try {
      // Light ping
      await BinanceMarketService.getTicker('BTCUSDT');
    } catch (e) {
      health.binanceMarket = 'DEGRADED';
      health.overall = 'DEGRADED';
      AlertService.log('WARNING', 'SystemHealth', 'Binance Market Data degraded', 'BINANCE_MARKET_DOWN');
    }

    // 3. Binance Account Sync Check
    const accState = AccountSyncService.getState();
    if (accState.connectionStatus !== 'CONNECTED') {
      health.binanceAccount = 'DEGRADED';
      health.overall = 'DEGRADED';
      AlertService.log('WARNING', 'SystemHealth', 'Binance Account Sync degraded', 'BINANCE_ACCOUNT_DOWN');
    }

    // 4. Monitoring Engine
    const monStatus = MonitoringService.getStatus();
    if (!monStatus.running) {
      health.monitoring = 'OFFLINE';
      if (process.env.AUTO_MONITORING !== 'false') {
        health.overall = 'DEGRADED';
      }
    }

    return health;
  }
};
