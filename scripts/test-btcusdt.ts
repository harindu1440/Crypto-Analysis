import dotenv from 'dotenv';
dotenv.config();

import { AgentRunner } from '../server/services/ai/agentRunner';

async function testBTCUSDT() {
  console.log('--- Starting BTCUSDT Pipeline Test ---');
  try {
    const result = await AgentRunner.runAnalysis('BTCUSDT');
    console.log('\n--- FINAL DECISION OUTPUT ---');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testBTCUSDT();
