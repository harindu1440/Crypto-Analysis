import { MonitoredAsset, AssetMonitorState, MonitoringEvent } from './types';
import { binanceWS } from '../binance/binanceWebSocketService';
import { LocalDatabase } from '../../config/database';
import { AgentRunner } from '../ai/agentRunner';
import { RiskEngine } from '../risk/riskEngine';
import { ExecutionScheduler } from '../execution/executionScheduler';
import { DEFAULT_RISK_SETTINGS } from '../risk/riskConfig';
import { AnalysisService } from '../analysis/analysisService';
import { OpportunityTracker } from './opportunityTracker';
import crypto from 'crypto';

class MonitoringOrchestrator {
  private isRunning: boolean = false;
  private assets: Map<string, MonitoredAsset> = new Map();
  private state: Map<string, AssetMonitorState> = new Map();
  private events: MonitoringEvent[] = [];
  private readonly MAX_EVENTS = 500;
  
  private readonly ANALYSIS_COOLDOWN_MS = parseInt(process.env.ANALYSIS_COOLDOWN_MS || '60000', 10);
  private readonly TRIGGER_PRICE_CHANGE_PERCENT = 1.5; // 1.5% move triggers analysis
  private readonly TRIGGER_TIME_MS = 5 * 60 * 1000; // 5 mins fallback trigger

  constructor() {
    // Bind WebSocket handler
    binanceWS.addClient(this.handleMarketTick.bind(this));
  }

  // --- LIFECYCLE ---

  public start() {
    if (this.isRunning) return;
    const autoMonitoring = process.env.AUTO_MONITORING === 'false' ? false : true;
    if (!autoMonitoring) {
      console.log('[Monitor] AUTO_MONITORING is false. Will not start.');
      return;
    }
    
    this.isRunning = true;
    this.logEvent('SYSTEM', 'Monitor started', 'INFO');
    
    // Subscribe to active assets
    const symbolsToSub = Array.from(this.assets.values()).filter(a => a.enabled).map(a => a.symbol);
    if (symbolsToSub.length > 0) {
      binanceWS.subscribe(symbolsToSub);
    }
    
    // Start active opportunity lifecycle tracker
    OpportunityTracker.start();
  }

  public stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.logEvent('SYSTEM', 'Monitor stopped', 'WARNING');
    binanceWS.unsubscribe(Array.from(this.assets.keys()));
    
    OpportunityTracker.stop();
  }

  public getStatus() {
    return {
      running: this.isRunning,
      assets: Array.from(this.state.values())
    };
  }

  // --- ASSET MANAGEMENT ---

  public addAsset(symbol: string) {
    if (this.assets.has(symbol)) throw new Error(`${symbol} is already monitored.`);
    this.assets.set(symbol, { symbol, enabled: true, timeframe: '1h' });
    this.state.set(symbol, {
      symbol,
      enabled: true,
      analysisInProgress: false,
      consecutiveNoTrade: 0
    });
    this.logEvent(symbol, `Asset added to monitoring`, 'INFO');
    if (this.isRunning) {
      binanceWS.subscribe([symbol]);
    }
  }

  public removeAsset(symbol: string) {
    this.assets.delete(symbol);
    this.state.delete(symbol);
    this.logEvent(symbol, `Asset removed from monitoring`, 'WARNING');
    binanceWS.unsubscribe([symbol]);
  }

  public setAssetStatus(symbol: string, enabled: boolean) {
    const asset = this.assets.get(symbol);
    const state = this.state.get(symbol);
    if (!asset || !state) throw new Error('Asset not found');
    
    asset.enabled = enabled;
    state.enabled = enabled;
    
    if (enabled && this.isRunning) {
      binanceWS.subscribe([symbol]);
      this.logEvent(symbol, 'Monitoring enabled', 'INFO');
    } else {
      binanceWS.unsubscribe([symbol]);
      this.logEvent(symbol, 'Monitoring disabled', 'WARNING');
    }
  }

  // --- EVENT LOGGING ---

  private logEvent(symbol: string, message: string, type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS') {
    const event: MonitoringEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      symbol,
      message,
      type
    };
    this.events.unshift(event);
    if (this.events.length > this.MAX_EVENTS) {
      this.events.pop();
    }
    console.log(`[Monitor] ${symbol}: ${message}`);
  }

  public getEvents() {
    return this.events;
  }

  // --- TRIGGER CONTROLLER ---

  private handleMarketTick(data: any) {
    if (!this.isRunning) return;
    const symbol = data.symbol;
    const state = this.state.get(symbol);
    
    if (!state || !state.enabled) return;

    // We get ticks from WebSocket. We need to decide if an AI analysis should be triggered.
    const price = parseFloat(data.price);
    
    if (!state.lastPrice) {
      state.lastPrice = price;
      state.lastAnalysisAt = Date.now();
      return;
    }

    const priceDeltaPercent = Math.abs((price - state.lastPrice) / state.lastPrice) * 100;
    const timeSinceLastAnalysis = Date.now() - (state.lastAnalysisAt || 0);

    let shouldTrigger = false;
    let triggerReason = '';

    if (timeSinceLastAnalysis >= this.TRIGGER_TIME_MS) {
      shouldTrigger = true;
      triggerReason = 'Time interval elapsed';
    } else if (priceDeltaPercent >= this.TRIGGER_PRICE_CHANGE_PERCENT) {
      shouldTrigger = true;
      triggerReason = `Price moved ${priceDeltaPercent.toFixed(2)}%`;
    }

    if (shouldTrigger && timeSinceLastAnalysis >= this.ANALYSIS_COOLDOWN_MS) {
      if (!state.analysisInProgress) {
        state.lastPrice = price; // reset reference
        this.runAnalysisPipeline(symbol, triggerReason).catch(err => {
           state.lastError = err.message;
           this.logEvent(symbol, `Pipeline Error: ${err.message}`, 'ERROR');
           state.analysisInProgress = false; // ensure unlock
        });
      }
    }
  }

  // --- ORCHESTRATION PIPELINE ---

  private async runAnalysisPipeline(symbol: string, reason: string) {
    const state = this.state.get(symbol);
    if (!state) return;

    state.analysisInProgress = true;
    state.lastAnalysisAt = Date.now();
    this.logEvent(symbol, `Analysis triggered: ${reason}`, 'INFO');

    try {
      // 1. AI Analysis
      const masterDecision = await AgentRunner.runAnalysis(symbol);
      state.lastAnalysisId = masterDecision.analysisId;
      state.lastDecision = masterDecision.decision;

      this.logEvent(symbol, `AI Decision: ${masterDecision.decision}`, masterDecision.decision === 'CANDIDATE_TRADE' ? 'SUCCESS' : 'INFO');

      if (masterDecision.decision === 'NO_TRADE') {
        state.consecutiveNoTrade++;
        return; // Normal, stop here.
      }

      state.consecutiveNoTrade = 0;

      // 2. Risk Engine Validation
      // Needs snapshot for volatility
      const snapshot = await AnalysisService.getAnalysisSnapshot(symbol, ['1h']); 
      const tradePlan = RiskEngine.validateCandidate(masterDecision, snapshot, DEFAULT_RISK_SETTINGS);

      if (tradePlan.validation.status === 'REJECTED') {
        this.logEvent(symbol, `Risk Rejected: ${tradePlan.validation.reasons.join(', ')}`, 'WARNING');
        return; // Stop here.
      }

      // Prevent exact duplicate scheduling
      const existingAudits = ExecutionScheduler.getAuditLog(tradePlan.planId);
      if (existingAudits.length > 0) {
        this.logEvent(symbol, `Skipped duplicate plan ID ${tradePlan.planId}`, 'INFO');
        return;
      }

      // 3. Execution Scheduler
      // For automated trades, schedule immediately (e.g. +10s to allow 5-min alert bypass if it was immediate, or we can just schedule it 6 minutes out to see the countdown)
      // Phase 8 logic: An automated trade should be scheduled slightly in the future to give the user time to cancel.
      const executeAt = Date.now() + (6 * 60 * 1000); 
      ExecutionScheduler.schedulePlan(tradePlan, executeAt);
      
      this.logEvent(symbol, `Plan Scheduled. Execution at ${new Date(executeAt).toLocaleTimeString()}`, 'SUCCESS');

    } finally {
      state.analysisInProgress = false;
    }
  }
}

export const MonitoringService = new MonitoringOrchestrator();
