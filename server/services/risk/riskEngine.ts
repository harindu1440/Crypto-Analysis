import { MasterDecisionOutput, TradeCandidate } from '../ai/schemas/types';
import { FinalTradePlan, PlanStatus, UserRiskSettings, TakeProfitPlan } from './types';
import { PositionSizer } from './positionSizer';
import crypto from 'crypto';
import { TechnicalAnalysisSnapshot, VolatilityLevel } from '../analysis/types';

import { AccountSyncService } from '../account/accountSyncService';

export const RiskEngine = {
  validateCandidate(
    analysis: MasterDecisionOutput,
    snapshot: TechnicalAnalysisSnapshot,
    settings: UserRiskSettings
  ): FinalTradePlan {
    const candidate = analysis.tradeCandidate;
    
    if (!candidate || analysis.decision !== 'CANDIDATE_TRADE') {
      throw new Error('Analysis does not contain a valid CANDIDATE_TRADE.');
    }

    const reasons: string[] = [];
    const warnings: string[] = [];
    let status: PlanStatus = 'VALID';

    // 0. Account Equity Resolution
    let availableEquity = settings.accountEquity;
    const mode = process.env.ACCOUNT_EQUITY_MODE || 'configured';
    
    if (mode === 'binance') {
      try {
        const quoteCurrency = 'USDT';
        availableEquity = AccountSyncService.getAvailableBalance(quoteCurrency);
        if (availableEquity <= 0) {
          status = 'REJECTED';
          reasons.push(`Available ${quoteCurrency} balance is 0 on Binance.`);
        }
      } catch (err: any) {
        status = 'REJECTED';
        reasons.push(`Live account balance unavailable: ${err.message}`);
      }
    }

    // Pass the resolved equity to settings for the position sizer
    const resolvedSettings = { ...settings, accountEquity: availableEquity };

    // 1. Validate Entry
    const referenceEntry = (candidate.entryZone.min + candidate.entryZone.max) / 2;
    
    if (candidate.side === 'LONG' && candidate.stopLoss >= referenceEntry) {
      status = 'REJECTED';
      reasons.push('Stop Loss must be below Entry for LONG.');
    }
    
    if (candidate.side === 'SHORT' && candidate.stopLoss <= referenceEntry) {
      status = 'REJECTED';
      reasons.push('Stop Loss must be above Entry for SHORT.');
    }

    // 2. Position Sizing
    let riskAmount = 0;
    let stopDistance = 0;
    let quantity = 0;
    let notionalValue = 0;

    try {
      const sizeCalc = PositionSizer.calculatePosition(
        candidate.side,
        referenceEntry,
        candidate.stopLoss,
        resolvedSettings
      );
      riskAmount = sizeCalc.riskAmount;
      stopDistance = sizeCalc.stopDistance;
      quantity = sizeCalc.quantity;
      notionalValue = sizeCalc.notionalValue;
    } catch (e: any) {
      status = 'REJECTED';
      reasons.push(`Position sizing failed: ${e.message}`);
    }

    // 3. Exposure Limit
    const maxExposureValue = resolvedSettings.accountEquity * (resolvedSettings.maxExposurePercent / 100);
    if (notionalValue > maxExposureValue) {
      status = 'REJECTED';
      reasons.push(`Notional value (${notionalValue.toFixed(2)}) exceeds maximum exposure limit (${maxExposureValue.toFixed(2)}).`);
    }

    // 4. Take Profit & Risk/Reward Validation
    const processedTps: TakeProfitPlan[] = [];
    let hasValidTP = false;

    for (const tpPrice of candidate.takeProfitLevels) {
      const reward = PositionSizer.calculateReward(candidate.side, referenceEntry, tpPrice);
      if (reward <= 0) {
        warnings.push(`Take Profit at ${tpPrice} is invalid for ${candidate.side}.`);
        continue;
      }
      
      const rr = reward / stopDistance;
      if (rr < settings.minimumRiskReward) {
        warnings.push(`Take Profit at ${tpPrice} has RR (${rr.toFixed(2)}) below minimum (${settings.minimumRiskReward}).`);
      } else {
        hasValidTP = true;
      }

      processedTps.push({
        price: tpPrice,
        riskReward: rr,
        allocation: 1.0 / candidate.takeProfitLevels.length
      });
    }

    if (!hasValidTP) {
      status = 'REJECTED';
      reasons.push('No Take Profit levels meet the minimum Risk/Reward requirement.');
    }

    // 5. Timeframe / Market Context Checks
    if (analysis.agentResults?.timeframe?.timeframeAlignment === 'CONFLICT') {
      warnings.push('Major timeframe conflict detected by AI.');
    }
    
    if (analysis.agentResults?.risk?.riskLevel === 'EXTREME') {
      status = 'REJECTED';
      reasons.push('Risk Agent classified the setup as EXTREME risk.');
    }

    // 6. Volatility Check
    const timeframeKey = candidate.timeframe || '1h';
    const volatility = snapshot.timeframes[timeframeKey]?.volatility || { level: 'UNKNOWN', atrPercentage: 0 };
    if (volatility.level === 'EXTREME') {
      warnings.push('Extreme volatility detected. Position sizing may be unsafe.');
    }

    // 7. Calculate Expiry
    const expiresAt = Date.now() + (4 * 60 * 60 * 1000);

    return {
      planId: crypto.randomUUID(),
      analysisId: analysis.analysisId || 'unknown',
      symbol: analysis.symbol,
      createdAt: Date.now(),
      expiresAt,
      direction: candidate.side,
      timeframe: candidate.timeframe,
      entry: {
        min: candidate.entryZone.min,
        max: candidate.entryZone.max,
        reference: referenceEntry
      },
      stopLoss: candidate.stopLoss,
      takeProfits: processedTps,
      account: {
        equity: settings.accountEquity,
        currency: 'USDT'
      },
      risk: {
        riskPercent: settings.riskPerTradePercent,
        riskAmount,
        maximumLoss: riskAmount
      },
      position: {
        quantity,
        notionalValue
      },
      volatility: {
        level: volatility.level as VolatilityLevel,
        atr: volatility.atrPercentage
      },
      validation: {
        status,
        reasons,
        warnings
      },
      execution: {
        scheduled: false,
        executed: false
      },
      configUsed: resolvedSettings
    };
  }
};

export const PlanStore = {
  plans: new Map<string, FinalTradePlan>(),
  
  save(plan: FinalTradePlan) {
    this.plans.set(plan.planId, plan);
  },

  get(planId: string) {
    return this.plans.get(planId) || null;
  }
};
