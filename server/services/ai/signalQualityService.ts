import { MasterDecisionOutput } from './schemas/types';
import { TechnicalAnalysisSnapshot } from '../analysis/types';

export interface SignalQualityEvaluation {
  score: number;
  breakdown: {
    consensus: number;
    mtfAlignment: number;
    technical: number;
    structure: number;
    riskReward: number;
    dataQuality: number;
  };
  rejectionReasons: string[];
  isQualified: boolean;
  marketRegime: string;
}

export const SignalQualityService = {
  
  evaluateOpportunity(decision: MasterDecisionOutput, snapshot: TechnicalAnalysisSnapshot): SignalQualityEvaluation {
    const reasons: string[] = [];
    const breakdown = {
      consensus: 0,
      mtfAlignment: 0,
      technical: 0,
      structure: 0,
      riskReward: 0,
      dataQuality: 0
    };

    // 1. Data Quality (10%)
    // Check if essential timeframes and indicators exist
    const requiredTFs = ['1d', '4h', '1h', '15m'];
    let missingTFs = 0;
    requiredTFs.forEach(tf => {
      if (!snapshot.timeframes[tf]) missingTFs++;
    });
    
    // Max analysis age check
    const MAX_ANALYSIS_AGE_SECONDS = Number(process.env.MAX_ANALYSIS_AGE_SECONDS || 60);
    const ageSeconds = (Date.now() - snapshot.timestamp) / 1000;
    
    if (ageSeconds > MAX_ANALYSIS_AGE_SECONDS) {
      reasons.push('STALE_DATA: Market data is too old.');
    }
    
    if (missingTFs > 1) {
      reasons.push('INSUFFICIENT_DATA: Missing multiple required timeframes.');
      breakdown.dataQuality = 0;
    } else if (missingTFs === 1) {
      breakdown.dataQuality = 5;
    } else {
      breakdown.dataQuality = 10;
    }

    // 2. MTF Alignment (20%)
    const tfs = decision.agentResults?.timeframe;
    let mtfScore = 0;
    if (tfs) {
      if (tfs.timeframeAlignment === 'AGREEMENT') {
        mtfScore = 20;
      } else if (tfs.timeframeAlignment === 'PARTIAL') {
        mtfScore = 10;
      } else if (tfs.timeframeAlignment === 'CONFLICT') {
        mtfScore = 0;
        reasons.push('TIMEFRAME_CONFLICT: Major timeframes are opposing each other.');
      }
    } else {
      reasons.push('MISSING_MTF_DATA');
    }
    breakdown.mtfAlignment = mtfScore;

    // 3. AI Consensus (25%)
    let consensusScore = 0;
    const MIN_AI_CONFIDENCE = Number(process.env.MIN_AI_CONFIDENCE || 0.70);
    if (decision.confidence < (MIN_AI_CONFIDENCE * 100)) {
      reasons.push(`LOW_AI_CONFIDENCE: Confidence ${decision.confidence} is below threshold ${MIN_AI_CONFIDENCE * 100}`);
    } else {
       // Based on the string "4/5" from AgentRunner
       if (decision.consensusScore) {
          const parts = decision.consensusScore.split('/');
          const matches = parseInt(parts[0]);
          const total = parseInt(parts[1]);
          if (matches === total) consensusScore = 25;
          else if (matches === total - 1) consensusScore = 15;
          else consensusScore = 5;
          
          if (matches < Number(process.env.MIN_AGENT_CONSENSUS || 3)) {
            reasons.push('WEAK_CONSENSUS: Not enough agents agree.');
          }
       }
    }
    breakdown.consensus = consensusScore;

    // 4. Risk / Reward (15%)
    let rrScore = 0;
    const MIN_RISK_REWARD = Number(process.env.MIN_RISK_REWARD || 1.5);
    if (decision.tradeCandidate) {
      const rr = decision.tradeCandidate.riskRewardRatio;
      if (rr < MIN_RISK_REWARD) {
        reasons.push(`POOR_RISK_REWARD: R:R ${rr} is below minimum ${MIN_RISK_REWARD}`);
      } else {
        if (rr >= 3) rrScore = 15;
        else if (rr >= 2) rrScore = 10;
        else rrScore = 5;
      }
    } else {
      reasons.push('INVALID_TRADE_PARAMETERS: Missing trade candidate details.');
    }
    breakdown.riskReward = rrScore;

    // 5. Technical Evidence (15%) & Market Structure (15%)
    // Deterministic regime detection
    const regime = this.detectMarketRegime(snapshot);
    if (regime === 'HIGH_VOLATILITY' || regime === 'UNCERTAIN') {
      reasons.push(`MARKET_UNCERTAIN: Regime detected as ${regime}`);
      breakdown.structure = 0;
    } else if (regime.includes('TRENDING')) {
      breakdown.structure = 15;
    } else {
      breakdown.structure = 10; // Ranging
    }

    if (decision.agentResults?.technical?.technicalBias !== 'NEUTRAL') {
      breakdown.technical = 15;
    } else {
      breakdown.technical = 5;
    }

    // Final calculations
    const totalScore = Object.values(breakdown).reduce((a, b) => a + b, 0);
    const MIN_OPPORTUNITY_SCORE = Number(process.env.MIN_OPPORTUNITY_SCORE || 75);

    if (totalScore < MIN_OPPORTUNITY_SCORE) {
      reasons.push(`LOW_QUALITY_SCORE: ${totalScore} is below minimum ${MIN_OPPORTUNITY_SCORE}`);
    }

    return {
      score: totalScore,
      breakdown,
      rejectionReasons: reasons,
      isQualified: reasons.length === 0,
      marketRegime: regime
    };
  },

  detectMarketRegime(snapshot: TechnicalAnalysisSnapshot): string {
    const h1 = snapshot.timeframes['1h'];
    if (!h1 || !h1.indicators) return 'UNCERTAIN';
    
    if (h1.volatility.level === 'HIGH' || h1.volatility.level === 'EXTREME') {
      return 'HIGH_VOLATILITY';
    }

    const sma20 = h1.indicators.sma[20];
    const sma50 = h1.indicators.sma[50];
    const sma200 = h1.indicators.sma[200];
    
    if (sma20 && sma50 && sma200) {
       if (sma20 > sma50 && sma50 > sma200) return 'TRENDING_BULLISH';
       if (sma20 < sma50 && sma50 < sma200) return 'TRENDING_BEARISH';
       return 'RANGING';
    }
    return 'UNCERTAIN';
  }
};
