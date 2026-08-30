import { TradeSide } from '../ai/schemas/types';
import { VolatilityLevel } from '../analysis/types';

export type PlanStatus = 'PENDING_VALIDATION' | 'VALID' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export interface UserRiskSettings {
  accountEquity: number;
  riskPerTradePercent: number;
  maxExposurePercent: number;
  minimumRiskReward: number;
  maxOpenTrades: number;
  maximumLeverage: number;
}

export interface TakeProfitPlan {
  price: number;
  riskReward: number;
  allocation: number; // e.g., 0.5 for 50%
}

export interface FinalTradePlan {
  planId: string;
  analysisId: string;
  symbol: string;
  createdAt: number;
  expiresAt: number;

  direction: TradeSide;
  timeframe: string;

  entry: {
    min: number;
    max: number;
    reference: number;
  };
  stopLoss: number;
  takeProfits: TakeProfitPlan[];

  account: {
    equity: number;
    currency: string;
  };
  risk: {
    riskPercent: number;
    riskAmount: number;
    maximumLoss: number;
  };
  position: {
    quantity: number;
    notionalValue: number;
  };
  volatility: {
    level: VolatilityLevel;
    atr: number;
  };
  validation: {
    status: PlanStatus;
    reasons: string[];
    warnings: string[];
  };
  execution: {
    scheduled: boolean;
    executed: boolean;
  };
  configUsed: UserRiskSettings;
}
