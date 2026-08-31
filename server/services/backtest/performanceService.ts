import { BacktestResult, OutcomeState } from './backtestEngine';

export interface PerformanceMetrics {
  totalSignals: number;
  qualifiedSignals: number;
  entriesTriggered: number;
  wins: number;
  losses: number;
  noEntry: number;
  expired: number;
  invalidated: number;
  
  winRate: number;
  lossRate: number;
  averageR: number;
  medianR: number;
  totalR: number;
  profitFactor: number;
  maxDrawdown: number;
  expectancy: number;
  averageDuration: number;
}

export const PerformanceService = {
  calculateMetrics(results: BacktestResult[]): PerformanceMetrics {
    const totalSignals = results.length;
    let wins = 0;
    let losses = 0;
    let noEntry = 0;
    let expired = 0;
    let invalidated = 0;
    
    let totalR = 0;
    let grossProfitR = 0;
    let grossLossR = 0;
    const rValues: number[] = [];
    const durations: number[] = [];

    // Drawdown calculation
    let currentEquity = 100; // Base 100R
    let peakEquity = 100;
    let maxDrawdown = 0;

    for (const res of results) {
      if (res.outcome === 'WIN') wins++;
      if (res.outcome === 'LOSS') losses++;
      if (res.outcome === 'NO_ENTRY' || res.outcome === 'AMBIGUOUS') noEntry++;
      if (res.outcome === 'EXPIRED') expired++;
      if (res.outcome === 'INVALIDATED') invalidated++;

      if (res.outcome === 'WIN' || res.outcome === 'LOSS') {
        totalR += res.rMultiple;
        rValues.push(res.rMultiple);
        
        if (res.rMultiple > 0) grossProfitR += res.rMultiple;
        if (res.rMultiple < 0) grossLossR += Math.abs(res.rMultiple);
        
        currentEquity += res.rMultiple;
        if (currentEquity > peakEquity) peakEquity = currentEquity;
        const drawdown = peakEquity - currentEquity;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }
      
      if (res.duration) {
        durations.push(res.duration);
      }
    }

    const entriesTriggered = wins + losses;
    const winRate = entriesTriggered > 0 ? (wins / entriesTriggered) * 100 : 0;
    const lossRate = entriesTriggered > 0 ? (losses / entriesTriggered) * 100 : 0;
    const averageR = entriesTriggered > 0 ? totalR / entriesTriggered : 0;
    const profitFactor = grossLossR > 0 ? grossProfitR / grossLossR : (grossProfitR > 0 ? 999 : 0);
    
    const sortedR = [...rValues].sort((a, b) => a - b);
    const medianR = sortedR.length > 0 ? sortedR[Math.floor(sortedR.length / 2)] : 0;
    
    const avgWinR = wins > 0 ? grossProfitR / wins : 0;
    const avgLossR = losses > 0 ? grossLossR / losses : 0;
    const expectancy = (winRate/100 * avgWinR) - (lossRate/100 * avgLossR);
    
    const averageDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    return {
      totalSignals,
      qualifiedSignals: totalSignals,
      entriesTriggered,
      wins,
      losses,
      noEntry,
      expired,
      invalidated,
      winRate,
      lossRate,
      averageR,
      medianR,
      totalR,
      profitFactor,
      maxDrawdown,
      expectancy,
      averageDuration
    };
  },

  groupByQualityScore(results: BacktestResult[]) {
    const groups = {
      '90-100': [] as BacktestResult[],
      '80-89': [] as BacktestResult[],
      '70-79': [] as BacktestResult[],
      '<70': [] as BacktestResult[]
    };
    
    for (const r of results) {
      if (r.qualityScore >= 90) groups['90-100'].push(r);
      else if (r.qualityScore >= 80) groups['80-89'].push(r);
      else if (r.qualityScore >= 70) groups['70-79'].push(r);
      else groups['<70'].push(r);
    }
    
    return {
      '90-100': this.calculateMetrics(groups['90-100']),
      '80-89': this.calculateMetrics(groups['80-89']),
      '70-79': this.calculateMetrics(groups['70-79']),
      '<70': this.calculateMetrics(groups['<70'])
    };
  }
};
