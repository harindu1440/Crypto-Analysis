import { UserRiskSettings } from './types';

export const DEFAULT_RISK_SETTINGS: UserRiskSettings = {
  accountEquity: 1000,
  riskPerTradePercent: 1.0,
  maxExposurePercent: 20.0,
  minimumRiskReward: 1.5,
  maxOpenTrades: 3,
  maximumLeverage: 1.0
};
