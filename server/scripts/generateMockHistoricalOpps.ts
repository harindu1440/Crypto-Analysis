import { LocalDatabase } from '../config/database';
import { TradeOpportunity } from '../services/opportunities/types';
import crypto from 'crypto';

LocalDatabase.initialize();

const symbols = ['BTCUSDT', 'ETHUSDT'];
const timeframes = ['15m', '1h', '4h'];
const directions: ('LONG' | 'SHORT')[] = ['LONG', 'SHORT'];

const opps: TradeOpportunity[] = [];

// Generate 20 random opportunities over the last 30 days
const now = Date.now();
const thirtyDays = 30 * 24 * 60 * 60 * 1000;

for (let i = 0; i < 20; i++) {
  const timestamp = now - Math.floor(Math.random() * thirtyDays);
  const symbol = symbols[Math.floor(Math.random() * symbols.length)];
  const direction = directions[Math.floor(Math.random() * directions.length)];
  const timeframe = timeframes[Math.floor(Math.random() * timeframes.length)];
  
  // Fake entry price near 60000 for BTC, 3000 for ETH
  const basePrice = symbol === 'BTCUSDT' ? 60000 : 3000;
  const currentPrice = basePrice + (Math.random() * 2000 - 1000);
  
  const risk = currentPrice * 0.02; // 2% risk
  const stopLoss = direction === 'LONG' ? currentPrice - risk : currentPrice + risk;
  
  const reward = risk * (1.5 + Math.random() * 2); // 1.5R to 3.5R
  const takeProfit = direction === 'LONG' ? currentPrice + reward : currentPrice - reward;
  
  const entryMin = currentPrice * 0.999;
  const entryMax = currentPrice * 1.001;
  
  const opp: TradeOpportunity = {
    id: crypto.randomUUID(),
    symbol,
    direction,
    setup: 'Mock Setup',
    currentPrice,
    entryZone: { min: entryMin, max: entryMax },
    entryPrice: currentPrice,
    stopLoss,
    takeProfitTargets: [takeProfit],
    riskRewardRatio: reward / risk,
    confidence: 0.7 + Math.random() * 0.25,
    timeframe,
    higherTimeframeBias: direction,
    marketStructure: 'Mock Structure',
    technicalSummary: 'Mock Summary',
    patternSummary: 'Mock Pattern',
    liquiditySummary: 'Mock Liquidity',
    sentimentSummary: 'Mock Sentiment',
    reason: 'Mock Reason',
    invalidationCondition: 'Mock Invalidation',
    agents: [],
    timeframes: [],
    marketData: { price: currentPrice, volatility: 'VOLATILE' },
    qualityScore: Math.floor(65 + Math.random() * 30),
    qualityBreakdown: {
      consensus: 80,
      mtfAlignment: 80,
      technical: 80,
      structure: 80,
      riskReward: 80,
      dataQuality: 80
    },
    rejectionReasons: [],
    fingerprint: crypto.randomUUID(),
    version: 1,
    updatedAt: timestamp,
    createdAt: timestamp,
    expiresAt: timestamp + (4 * 60 * 60 * 1000), // 4 hours
    status: 'EXPIRED' // Historically completed
  };
  
  opps.push(opp);
}

const existing = LocalDatabase.get('opportunities') || [];
LocalDatabase.set('opportunities', [...existing, ...opps]);

console.log(`Added ${opps.length} mock historical opportunities.`);
