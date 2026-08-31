import { TradeSide } from '../ai/schemas/types';

export type OpportunityStatus = 
  | 'DETECTED'
  | 'ANALYZING'
  | 'VALIDATING'
  | 'QUALIFIED'
  | 'ACTIVE'
  | 'APPROACHING_ENTRY'
  | 'TRIGGERED'
  | 'EXECUTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'INVALIDATED'
  | 'CANCELLED'
  | 'COMPLETED';

export interface TradeOpportunity {
  id: string;
  symbol: string;
  direction: TradeSide;
  setup: string;
  currentPrice: number;
  
  entryZone: {
    min: number;
    max: number;
  };
  entryPrice: number;
  
  stopLoss: number;
  takeProfitTargets: number[];
  
  riskRewardRatio: number;
  confidence: number;
  
  timeframe: string;
  higherTimeframeBias: string;
  
  marketStructure: string;
  technicalSummary: string;
  patternSummary: string;
  liquiditySummary: string;
  sentimentSummary: string;
  
  reason: string;
  invalidationCondition: string;
  
  // Phase 13 additions
  agents: { name: string; bias: string; explanation?: string }[];
  timeframes: { timeframe: string; bias: string }[];
  marketData: {
    price: number;
    volume24h?: number;
    change24h?: number;
    volatility?: string;
  };
  
  // Phase 15 Additions
  qualityScore: number;
  qualityBreakdown: {
    consensus: number;
    mtfAlignment: number;
    technical: number;
    structure: number;
    riskReward: number;
    dataQuality: number;
  };
  rejectionReasons: string[];
  fingerprint: string;
  version: number;
  updatedAt: number;
  
  createdAt: number;
  expiresAt: number;
  
  status: OpportunityStatus;
}
