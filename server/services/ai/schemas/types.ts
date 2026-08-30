export type AgentStatus = 'UNAVAILABLE' | 'COMPLETE' | 'ANALYZING' | 'ERROR';
export type Decision = 'NO_TRADE' | 'WATCH' | 'CANDIDATE_TRADE';
export type TradeSide = 'LONG' | 'SHORT';
export type MarketBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

export interface MarketContextOutput {
  status: AgentStatus;
  marketCondition: string;
  broaderTrend: MarketBias;
  momentum: string;
  unusualConditions: string[];
  warnings: string[];
}

export interface TechnicalAnalysisOutput {
  status: AgentStatus;
  technicalBias: MarketBias;
  indicatorAgreement: boolean;
  indicatorConflicts: string[];
  importantLevels: number[];
  technicalReasoning: string;
}

export interface PatternAnalysisOutput {
  status: AgentStatus;
  patternInterpretation: string;
  bias: MarketBias;
  reliabilityAssessment: string;
  confirmationRequirements: string;
  invalidationConditions: string;
}

export interface TimeframeAnalysisOutput {
  status: AgentStatus;
  shortTermBias: MarketBias;
  mediumTermBias: MarketBias;
  higherTimeframeBias: MarketBias;
  timeframeAlignment: 'AGREEMENT' | 'PARTIAL' | 'CONFLICT';
  conflictingWarnings: string[];
}

export interface RiskAnalysisOutput {
  status: AgentStatus;
  riskLevel: RiskLevel;
  majorRisks: string[];
  invalidationConditions: string;
  structurallyReasonable: boolean;
}

export interface TradeCandidate {
  side: TradeSide;
  entryZone: { min: number; max: number };
  stopLoss: number;
  takeProfitLevels: number[];
  riskRewardRatio: number;
  invalidationCondition: string;
  thesis: string;
  timeframe: string;
}

export interface MasterDecisionOutput {
  analysisId: string;
  symbol: string;
  timestamp: number;
  provider: string;
  decision: Decision;
  confidence: number;
  timeframe: string;
  marketBias: MarketBias;
  reasoning: string;
  supportingFactors: string[];
  conflictingFactors: string[];
  riskLevel: RiskLevel;
  tradeCandidate: TradeCandidate | null;
  agentResults: {
    marketContext: MarketContextOutput;
    technical: TechnicalAnalysisOutput;
    pattern: PatternAnalysisOutput;
    timeframe: TimeframeAnalysisOutput;
    risk: RiskAnalysisOutput;
  };
}
