import 'dotenv/config';
import { AgentRunner } from '../server/services/ai/agentRunner';

async function runTest() {
  console.log('=== STARTING SOLUSDT AI TEST ===\n');
  
  try {
    const result = await AgentRunner.runAnalysis('SOLUSDT');
    
    console.log('\n=== FINAL STRUCTURED RESULT ===');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('Test script failed:', error);
  } finally {
    process.exit(0);
  }
}

runTest();
