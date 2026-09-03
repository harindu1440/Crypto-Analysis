import 'dotenv/config';
import { AgentRunner } from '../server/services/ai/agentRunner';
import { AnalysisService } from '../server/services/analysis/analysisService';
import { DeterministicMarketScreeningEngine } from '../server/services/analysis/screeningEngine';

async function runTest() {
  console.log('=== STARTING SOLUSDT AI TEST ===\n');
  
  try {
    const symbol = 'SOLUSDT';
    console.log(`[1] Fetching Deterministic Data for ${symbol}...`);
    const data = await AnalysisService.getAnalysisSnapshot(symbol, ['4h', '1h', '15m', '5m']);
    
    if (!data) {
      console.log('Failed to fetch market data.');
      process.exit(1);
    }
    
    console.log('\n=== DETERMINISTIC ENGINE REPORT ===');
    console.log(`Macro Trend (4H): ${data.timeframes['4h']?.trend || 'N/A'}`);
    console.log(`Primary Trend (1H): ${data.timeframes['1h']?.trend || 'N/A'}`);
    console.log(`Confirmation Trend (15M): ${data.timeframes['15m']?.trend || 'N/A'}`);
    console.log(`Entry Trend (5M): ${data.timeframes['5m']?.trend || 'N/A'}`);
    
    console.log('\n--- Support/Resistance (1H) ---');
    const support = data.timeframes['1h']?.support.slice(0, 3) || [];
    const resistance = data.timeframes['1h']?.resistance.slice(0, 3) || [];
    console.log(`Support: ${support.map(s => `$${s.price.toFixed(2)} (${s.touches} touches)`).join(' | ')}`);
    console.log(`Resistance: ${resistance.map(r => `$${r.price.toFixed(2)} (${r.touches} touches)`).join(' | ')}`);
    
    console.log('\n--- Setup Detection ---');
    const setup = data.timeframes['1h']?.setup;
    console.log(`Setup Detected: ${setup?.type || 'NO_SETUP'}`);
    console.log(`Direction: ${setup?.direction || 'NEUTRAL'}`);
    console.log(`Reasoning: ${setup?.reasoning || 'N/A'}`);
    
    const screening = DeterministicMarketScreeningEngine.screen(data, 'test_snap');
    console.log(`\n--- Scoring ---`);
    console.log(`Deterministic Score: ${screening.technicalScore}/100`);
    console.log(`Structure (20): ${screening.structureScore} | MTF (20): ${screening.trend.alignmentScore} | Momentum (10): ${screening.momentumScore} | Volume (10): ${screening.volumeScore} | Liquidity (5): ${screening.liquidityScore}`);
    
    console.log('\n[2] Passing to AI Engine (AgentRunner)...');
    const result = await AgentRunner.runAnalysis(symbol);
    
    console.log('\n=== AI ROUTER REPORT ===');
    console.log(`Provider: ${result.provider}`);
    console.log(`Failed Analyses: ${result.failedAnalyses}`);
    console.log(`Unavailable Analyses: ${result.unavailableAnalyses}`);
    console.log(`Models Used: ${result.modelsUsed}`);
    console.log(`Consensus Decision: ${result.decision || 'NONE'}`);
    
    console.log('\n=== FINAL DECISION ===');
    console.log(`Status: ${result.status}`);
    console.log(`Reasoning: ${result.reasoning}`);
    
    if (result.tradeCandidate) {
      const tc = result.tradeCandidate;
      console.log(`\nPotential entry: $${tc.entryZone.min.toFixed(2)} – $${tc.entryZone.max.toFixed(2)}`);
      console.log(`Invalidation (Stop Loss): Below $${tc.stopLoss.toFixed(2)}`);
      console.log(`Potential TP: $${tc.takeProfitLevels.map(l => l.toFixed(2)).join(', $')}`);
      console.log(`Risk/Reward: 1:${tc.riskRewardRatio.toFixed(2)}`);
    } else {
      console.log(`\nNo valid Trade Plan generated. Condition: WAIT or NO_TRADE.`);
    }
    
    console.log('\n======================================================\n');
    
  } catch (error) {
    console.error('Test script failed:', error);
  } finally {
    process.exit(0);
  }
}

runTest();
