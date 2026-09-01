import { MonitoredAsset, AssetMonitorState } from './types';
import { binanceWS } from '../binance/binanceWebSocketService';
import { AgentRunner } from '../ai/agentRunner';
import { RiskEngine } from '../risk/riskEngine';
import { ExecutionScheduler } from '../execution/executionScheduler';
import { DEFAULT_RISK_SETTINGS } from '../risk/riskConfig';
import { AnalysisService } from '../analysis/analysisService';
import { OpportunityTracker } from './opportunityTracker';
import { OpportunityService } from '../opportunities/opportunityService';
import { NotificationOrchestrator } from '../notifications/notificationOrchestrator';

class GlobalMonitoringOrchestrator {
  private isRunning: boolean = false;
  private assets: Map<string, MonitoredAsset> = new Map();
  private state: Map<string, AssetMonitorState> = new Map();
  private scanInterval: NodeJS.Timeout | null = null;
  
  // Phase 16: Adaptive Configuration
  private readonly BASE_ANALYSIS_COOLDOWN_MS = 15 * 60 * 1000; // 15 mins normal
  private readonly QUALIFIED_COOLDOWN_MS = 5 * 60 * 1000;      // 5 mins qualified
  private readonly APPROACHING_COOLDOWN_MS = 1 * 60 * 1000;    // 1 min approaching
  private readonly TRIGGER_PRICE_CHANGE_PERCENT = 1.5;

  constructor() {
    binanceWS.addClient(this.handleMarketTick.bind(this));
  }

  public start() {
    if (this.isRunning) return;
    const autoMonitoring = process.env.AUTO_MONITORING === 'false' ? false : true;
    if (!autoMonitoring) {
      console.log('[GlobalMonitor] AUTO_MONITORING is false.');
      return;
    }
    
    this.isRunning = true;
    console.log('[GlobalMonitor] Started');
    
    const symbolsToSub = Array.from(this.assets.values()).filter(a => a.enabled).map(a => a.symbol);
    if (symbolsToSub.length > 0) binanceWS.subscribe(symbolsToSub);
    
    OpportunityTracker.start();
    
    // Centralized Queue Scanner (Runs every 2 seconds to pop highest priority item)
    this.scanInterval = setInterval(() => this.scanQueue(), 2000);
  }

  public stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    console.log('[GlobalMonitor] Stopped');
    binanceWS.unsubscribe(Array.from(this.assets.keys()));
    OpportunityTracker.stop();
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
  }

  public getStatus() {
    return {
      running: this.isRunning,
      assets: Array.from(this.state.values())
    };
  }

  public addAsset(symbol: string) {
    if (this.assets.has(symbol)) return;
    this.assets.set(symbol, { symbol, enabled: true, timeframe: '1h' });
    this.state.set(symbol, {
      symbol,
      enabled: true,
      analysisInProgress: false,
      consecutiveNoTrade: 0
    });
    if (this.isRunning) binanceWS.subscribe([symbol]);
  }

  public removeAsset(symbol: string) {
    this.assets.delete(symbol);
    this.state.delete(symbol);
    binanceWS.unsubscribe([symbol]);
  }

  public setAssetStatus(symbol: string, enabled: boolean) {
    const asset = this.assets.get(symbol);
    const state = this.state.get(symbol);
    if (!asset || !state) return;
    asset.enabled = enabled;
    state.enabled = enabled;
    if (enabled && this.isRunning) binanceWS.subscribe([symbol]);
    else binanceWS.unsubscribe([symbol]);
  }

  private handleMarketTick(data: any) {
    if (!this.isRunning) return;
    const symbol = data.symbol;
    const state = this.state.get(symbol);
    if (!state || !state.enabled) return;

    const price = parseFloat(data.price);
    
    if (!state.lastPrice) {
      state.lastPrice = price;
      return; // Wait for next tick to calculate delta
    }

    const priceDeltaPercent = Math.abs((price - state.lastPrice) / state.lastPrice) * 100;

    // Fast tracking for large price moves
    if (priceDeltaPercent >= this.TRIGGER_PRICE_CHANGE_PERCENT && !state.analysisInProgress) {
      // Temporarily mark lastAnalysisAt artificially older so it gets picked up immediately by the queue
      state.lastAnalysisAt = 0; 
    }
    
    state.lastPrice = price;
  }

  // --- Priority Queue Scanner ---
  
  private async scanQueue() {
    if (!this.isRunning) return;
    
    // Make sure we are not already processing too many concurrently
    const inProgressCount = Array.from(this.state.values()).filter(s => s.analysisInProgress).length;
    if (inProgressCount > 0) return; // Wait for current Gemini call to finish (prevent rate limits)

    const now = Date.now();
    const activeOpps = OpportunityService.getActiveOpportunities();

    let candidateToRun: { symbol: string, priority: number } | null = null;

    for (const [symbol, state] of this.state.entries()) {
      if (!state.enabled || state.analysisInProgress) continue;

      const opp = activeOpps.find(o => o.symbol === symbol);
      
      // Adaptive Cooldown
      let requiredCooldown = this.BASE_ANALYSIS_COOLDOWN_MS;
      let priorityScore = 10;
      
      if (opp) {
        if (opp.status === 'APPROACHING_ENTRY') {
          requiredCooldown = this.APPROACHING_COOLDOWN_MS;
          priorityScore = 100;
        } else if (opp.status === 'QUALIFIED') {
          requiredCooldown = this.QUALIFIED_COOLDOWN_MS;
          priorityScore = 50;
        }
      }

      // Did enough time pass?
      const timeSinceLast = now - (state.lastAnalysisAt || 0);
      if (timeSinceLast >= requiredCooldown) {
        // Boost priority the longer it waits
        priorityScore += Math.floor((timeSinceLast - requiredCooldown) / 60000);
        
        if (!candidateToRun || priorityScore > candidateToRun.priority) {
          candidateToRun = { symbol, priority: priorityScore };
        }
      }
    }

    if (candidateToRun) {
      this.runAnalysisPipeline(candidateToRun.symbol).catch(err => {
        const state = this.state.get(candidateToRun!.symbol);
        if (state) {
          state.lastError = err.message;
          state.analysisInProgress = false;
        }
        console.error(`[GlobalMonitor] Pipeline Error for ${candidateToRun?.symbol}: ${err.message}`);
      });
    }
  }

  private async runAnalysisPipeline(symbol: string) {
    const state = this.state.get(symbol);
    if (!state) return;

    state.analysisInProgress = true;
    state.lastAnalysisAt = Date.now();

    try {
      const masterDecision = await AgentRunner.runAnalysis(symbol);
      state.lastAnalysisId = masterDecision.analysisId;
      state.lastDecision = masterDecision.decision;

      if (masterDecision.decision === 'NO_TRADE') {
        state.consecutiveNoTrade++;
        return;
      }
      state.consecutiveNoTrade = 0;

      // Risk Engine Validation (Only for execution flow)
      const snapshot = await AnalysisService.getAnalysisSnapshot(symbol, ['1h']); 
      const tradePlan = RiskEngine.validateCandidate(masterDecision, snapshot, DEFAULT_RISK_SETTINGS);

      if (tradePlan.validation.status === 'REJECTED') {
        return;
      }

      const existingAudits = ExecutionScheduler.getAuditLog(tradePlan.planId);
      if (existingAudits.length > 0) return;

      const executeAt = Date.now() + (6 * 60 * 1000); 
      ExecutionScheduler.schedulePlan(tradePlan, executeAt);

    } finally {
      state.analysisInProgress = false;
    }
  }
}

export const GlobalMonitoringService = new GlobalMonitoringOrchestrator();
