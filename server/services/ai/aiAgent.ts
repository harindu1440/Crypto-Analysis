import { AIProvider } from './providers/provider.interface';
import { TechnicalAnalysisSnapshot } from '../analysis/types';
import { PROMPTS } from './prompts';
import {
  MarketContextOutput,
  TechnicalAnalysisOutput,
  PatternAnalysisOutput,
  LiquidityAnalysisOutput,
  SentimentAnalysisOutput,
  TimeframeAnalysisOutput,
  RiskAnalysisOutput,
  ScreeningAnalysisOutput
} from './schemas/types';

export class AIAgent {
  constructor(private provider: AIProvider) {}

  async analyzeScreening(data: TechnicalAnalysisSnapshot): Promise<ScreeningAnalysisOutput> {
    try {
      return await this.provider.generateObject<ScreeningAnalysisOutput>(
        JSON.stringify(data),
        'ScreeningAnalysis',
        `${PROMPTS.screening.description}\n${PROMPTS.screening.instructions}`
      );
    } catch (e) {
      console.error('Screening Agent failed:', e);
      return {
        status: 'ERROR',
        passScreening: false,
        reasoning: 'Screening agent failed.'
      };
    }
  }

  async analyzeMarketContext(data: TechnicalAnalysisSnapshot): Promise<MarketContextOutput> {
    try {
      return await this.provider.generateObject<MarketContextOutput>(
        JSON.stringify(data),
        'MarketContext',
        `${PROMPTS.marketContext.description}\n${PROMPTS.marketContext.instructions}`
      );
    } catch (e) {
      console.error('MarketContext Agent failed:', e);
      return {
        status: 'ERROR',
        marketCondition: 'UNKNOWN',
        broaderTrend: 'NEUTRAL',
        momentum: 'UNKNOWN',
        unusualConditions: [],
        warnings: ['Agent execution failed']
      };
    }
  }

  async analyzeTechnicals(data: TechnicalAnalysisSnapshot): Promise<TechnicalAnalysisOutput> {
    try {
      return await this.provider.generateObject<TechnicalAnalysisOutput>(
        JSON.stringify(data),
        'TechnicalAnalysis',
        `${PROMPTS.technical.description}\n${PROMPTS.technical.instructions}`
      );
    } catch (e) {
      return {
        status: 'ERROR',
        technicalBias: 'NEUTRAL',
        indicatorAgreement: false,
        indicatorConflicts: [],
        importantLevels: [],
        technicalReasoning: 'Agent execution failed'
      };
    }
  }

  async analyzePatterns(data: TechnicalAnalysisSnapshot): Promise<PatternAnalysisOutput> {
    try {
      return await this.provider.generateObject<PatternAnalysisOutput>(
        JSON.stringify(data),
        'PatternAnalysis',
        `${PROMPTS.pattern.description}\n${PROMPTS.pattern.instructions}`
      );
    } catch (e) {
      return {
        status: 'ERROR',
        patternInterpretation: 'UNKNOWN',
        bias: 'NEUTRAL',
        reliabilityAssessment: 'UNKNOWN',
        confirmationRequirements: 'UNKNOWN',
        invalidationConditions: 'UNKNOWN'
      };
    }
  }

  async analyzeLiquidity(data: TechnicalAnalysisSnapshot): Promise<LiquidityAnalysisOutput> {
    try {
      return await this.provider.generateObject<LiquidityAnalysisOutput>(
        JSON.stringify(data),
        'LiquidityAnalysis',
        `${PROMPTS.liquidity.description}\n${PROMPTS.liquidity.instructions}`
      );
    } catch (e) {
      return {
        status: 'ERROR',
        bias: 'NEUTRAL',
        liquidityZones: [],
        sweepsDetected: false,
        liquidityReasoning: 'Agent execution failed'
      };
    }
  }

  async analyzeSentiment(data: TechnicalAnalysisSnapshot): Promise<SentimentAnalysisOutput> {
    try {
      return await this.provider.generateObject<SentimentAnalysisOutput>(
        JSON.stringify(data),
        'SentimentAnalysis',
        `${PROMPTS.sentiment.description}\n${PROMPTS.sentiment.instructions}`
      );
    } catch (e) {
      return {
        status: 'ERROR',
        bias: 'NEUTRAL',
        sentimentScore: 50,
        keyThemes: [],
        sentimentReasoning: 'Agent execution failed'
      };
    }
  }

  async analyzeTimeframes(data: TechnicalAnalysisSnapshot): Promise<TimeframeAnalysisOutput> {
    try {
      return await this.provider.generateObject<TimeframeAnalysisOutput>(
        JSON.stringify(data),
        'TimeframeAnalysis',
        `${PROMPTS.timeframe.description}\n${PROMPTS.timeframe.instructions}`
      );
    } catch (e) {
      return {
        status: 'ERROR',
        shortTermBias: 'NEUTRAL',
        mediumTermBias: 'NEUTRAL',
        higherTimeframeBias: 'NEUTRAL',
        timeframeAlignment: 'CONFLICT',
        conflictingWarnings: ['Agent execution failed']
      };
    }
  }

  async analyzeRisk(data: TechnicalAnalysisSnapshot, otherAnalysis: any): Promise<RiskAnalysisOutput> {
    try {
      return await this.provider.generateObject<RiskAnalysisOutput>(
        JSON.stringify({ data, otherAnalysis }),
        'RiskAnalysis',
        `${PROMPTS.risk.description}\n${PROMPTS.risk.instructions}`
      );
    } catch (e) {
      return {
        status: 'ERROR',
        riskLevel: 'EXTREME',
        majorRisks: ['Agent execution failed'],
        invalidationConditions: 'UNKNOWN',
        structurallyReasonable: false
      };
    }
  }

  async makeMasterDecision(data: TechnicalAnalysisSnapshot, agentResults: any) {
    try {
      return await this.provider.generateObject<any>(
        JSON.stringify({ data, agentResults }),
        'MasterDecision',
        `${PROMPTS.master.description}\n${PROMPTS.master.instructions}`
      );
    } catch (e) {
      return {
        decision: 'NO_TRADE',
        confidence: 0,
        timeframe: '1h',
        marketBias: 'NEUTRAL',
        reasoning: 'Master Decision Agent execution failed. Defaulting to NO_TRADE for safety.',
        supportingFactors: [],
        conflictingFactors: ['System error'],
        riskLevel: 'EXTREME',
        tradeCandidate: null
      };
    }
  }
}
