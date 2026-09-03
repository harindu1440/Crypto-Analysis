import 'dotenv/config';
import { AgentRunner } from '../server/services/ai/agentRunner';

async function runTest() {
  console.log('=== STARTING SOLUSDT AI TEST ===\n');
  
  try {
    const result = await AgentRunner.runAnalysis('SOLUSDT');
    
    console.log('\n=== FINAL STRUCTURED RESULT ===');
    console.log(JSON.stringify(result, null, 2));

    console.log('\n======================================================');
    console.log('BEGINNER-FRIENDLY TRADE REPORT');
    console.log('======================================================\n');
    console.log(`Asset: ${result.symbol}`);
    console.log(`Market: ${result.marketBias} (${result.reasoning.includes('STRONG') ? 'Strong' : 'Normal'})`);
    console.log(`Opportunity: ${result.status}`);
    console.log(`\nWhy:\n${result.reasoning}`);
    
    if (result.tradeCandidate && result.status !== 'NO_TRADE') {
      const tc = result.tradeCandidate;
      console.log(`\nPotential entry:\n$${tc.entryZone.min} – $${tc.entryZone.max}`);
      console.log(`\nInvalidation (Stop Loss):\nBelow $${tc.stopLoss}`);
      console.log(`\nPotential TP:\n$${tc.takeProfitLevels.join(', $')}`);
      console.log(`\nRisk/Reward:\n1:2.4 (Simulated Output)`);
      console.log(`\nConfidence:\n${result.confidence}%`);
      console.log(`\nRisk:\n${result.riskLevel}`);
    } else {
      console.log(`\nWhat to watch:\nWaiting for structural confirmation or better risk/reward setup.`);
    }
    console.log('\n======================================================\n');
    
  } catch (error) {
    console.error('Test script failed:', error);
  } finally {
    process.exit(0);
  }
}

runTest();
