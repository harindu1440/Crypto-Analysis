// aiPerformanceTracker.ts
import { MasterDecisionOutput } from './schemas/types';

interface TrackedDecision extends MasterDecisionOutput {
  id: string;
}

export class AIPerformanceTracker {
  private static decisions: TrackedDecision[] = [];

  public static trackDecision(decision: MasterDecisionOutput) {
    // In a real database, we would insert this into the AI_PERFORMANCE_LOG table.
    // We store it in memory for now.
    if (!decision.analysisId) return;
    
    this.decisions.push({
      ...decision,
      id: decision.analysisId
    });
    
    // Maintain maximum cache size (e.g., last 1000 decisions)
    if (this.decisions.length > 1000) {
      this.decisions.shift();
    }
  }

  public static trackConsensus(consensusDecision: MasterDecisionOutput, individualDecisions: MasterDecisionOutput[]) {
    // We could store the linkage between the consensus result and the individuals.
    this.trackDecision(consensusDecision);
  }

  public static getProviderAccuracy(provider: string): { total: number, accurate: number } {
    // Placeholder for future performance weighting logic
    // Currently returns dummy data
    return { total: 0, accurate: 0 };
  }
}
