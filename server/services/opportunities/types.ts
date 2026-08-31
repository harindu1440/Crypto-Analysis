import { TradeSide } from '../ai/schemas/types';

export type OpportunityStatus = 
  | 'DETECTED'
  | 'VALIDATED'
  | 'ACTIVE'
  | 'APPROACHING_ENTRY'
  | 'TRIGGERED'
  | 'EXPIRED'
  | 'INVALIDATED'
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
  
  createdAt: number;
  expiresAt: number;
  
  status: OpportunityStatus;
}
