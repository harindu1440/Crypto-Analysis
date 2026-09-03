import dotenv from 'dotenv';
dotenv.config();

import { AgentRunner } from '../server/services/ai/agentRunner';

async function testSymbols() {
  const symbols = ['BTCUSDT', 'SOLUSDT', 'TRXUSDT'];
  
  for (const sym of symbols) {
    console.log(`\n\n======================================================`);
    console.log(`🚀 STARTING RUN FOR ${sym}`);
    console.log(`======================================================`);
    try {
      const result = await AgentRunner.runAnalysis(sym);
      console.log(`\n--- FINAL DECISION FOR ${sym} ---`);
      console.log(`Status: ${result.status}`);
      console.log(`Decision: ${result.decision}`);
      console.log(`Reasoning: ${result.reasoning}`);
      if (result.status === 'TRADE_READY') {
         console.log(`Trade Candidate: ${JSON.stringify(result.tradeCandidate, null, 2)}`);
      }
    } catch (err) {
      console.error(`Failed to analyze ${sym}:`, err);
    }
  }
  
  process.exit(0);
}

testSymbols();
