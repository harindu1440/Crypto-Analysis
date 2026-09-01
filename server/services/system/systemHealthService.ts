import { LocalDatabase } from '../../config/database';
import { BinanceMarketService } from '../binance/binanceMarketService';
import { AccountSyncService } from '../account/accountSyncService';
import { GlobalMonitoringService } from '../monitoring/globalMonitoringService';
import { AlertService } from './alertService';
import { GeminiBudgetManager } from '../ai/geminiBudgetManager';
import { OpportunityService } from '../opportunities/opportunityService';
import { ProviderRegistry } from '../ai/providers/providerRegistry';

export const SystemHealthService = {
  async getAIStatus() {
    const aiBudget = GeminiBudgetManager.getStatus();
    
    let isHealthy = false;
    let message = 'AI is OFFLINE';
    let status = aiBudget.status;
    
    let providers: any[] = [];
    let routerStatus: any = null;
    
    try {
       providers = ProviderRegistry.getProviderHealths();
       const healthyProviders = providers.filter(p => p.health.status === 'HEALTHY' || p.health.status === 'DEGRADED');
       
       if (healthyProviders.length > 0) {
         isHealthy = true;
         status = 'HEALTHY';
         message = `Multi-Model AI Active (${healthyProviders.length}/${providers.length} providers)`;
       }
       
       if (ProviderRegistry.isGeminiOnly()) {
         message = 'Legacy Gemini-Only AI Active';
         status = aiBudget.status;
         isHealthy = status === 'HEALTHY' || status === 'DEGRADED';
       }

       // Phase 20.2: Per-model router status
       routerStatus = ProviderRegistry.getRouterStatus();
       if (routerStatus?.activeModel) {
         message = `Active: ${routerStatus.activeModel.provider}/${routerStatus.activeModel.modelName} | ${routerStatus.eligibleCount} model(s) eligible`;
         isHealthy = true;
         status = 'HEALTHY';
       }
    } catch (e) {
       // Provider Registry not initialized yet
    }
    
    return {
      status: status,
      isHealthy,
      message,
      providers,
      routerStatus,
      dailyRequestsCount: aiBudget.stats ? aiBudget.stats.requestsToday : 0,
      quotaExhausted: aiBudget.status === 'QUOTA_EXHAUSTED'
    };
  },

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
    const monStatus = GlobalMonitoringService.getStatus();
    if (!monStatus.running) {
      health.monitoring = 'OFFLINE';
      if (process.env.AUTO_MONITORING !== 'false') {
        health.overall = 'DEGRADED';
      }
    }

    // 5. Phase 15 AI & Opportunity Engine
    const aiStatus = (await this.getAIStatus()).status;
    const opps = OpportunityService.getOpportunities();
    
    const opportunityStats = {
      active: opps.filter(o => ['DETECTED', 'ANALYZING', 'VALIDATING', 'QUALIFIED', 'ACTIVE', 'APPROACHING_ENTRY'].includes(o.status)).length,
      rejected: opps.filter(o => o.status === 'REJECTED').length,
      expired: opps.filter(o => o.status === 'EXPIRED').length,
      invalidated: opps.filter(o => o.status === 'INVALIDATED').length
    };

    return {
      ...health,
      aiEngine: aiStatus,
      opportunityStats
    };
  }
};
