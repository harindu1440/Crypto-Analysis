import { AIProvider } from './provider.interface';
import { GoogleGenAI, Type, Schema } from '@google/genai';
import { AlertService } from '../../system/alertService';
import { GeminiBudgetManager } from '../geminiBudgetManager';
// Define Schemas for Structured Output
const SCHEMAS: Record<string, Schema> = {
  ScreeningAnalysis: {
    type: Type.OBJECT,
    properties: {
      status: { type: Type.STRING, enum: ['UNAVAILABLE', 'COMPLETE', 'ANALYZING', 'ERROR'] },
      passScreening: { type: Type.BOOLEAN },
      reasoning: { type: Type.STRING }
    },
    required: ['status', 'passScreening', 'reasoning']
  },
  MarketContext: {
    type: Type.OBJECT,
    properties: {
      status: { type: Type.STRING, enum: ['UNAVAILABLE', 'COMPLETE', 'ANALYZING', 'ERROR'] },
      marketCondition: { type: Type.STRING },
      broaderTrend: { type: Type.STRING, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
      momentum: { type: Type.STRING },
      unusualConditions: { type: Type.ARRAY, items: { type: Type.STRING } },
      warnings: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ['status', 'marketCondition', 'broaderTrend', 'momentum', 'unusualConditions', 'warnings']
  },
  TechnicalAnalysis: {
    type: Type.OBJECT,
    properties: {
      status: { type: Type.STRING, enum: ['UNAVAILABLE', 'COMPLETE', 'ANALYZING', 'ERROR'] },
      technicalBias: { type: Type.STRING, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
      indicatorAgreement: { type: Type.BOOLEAN },
      indicatorConflicts: { type: Type.ARRAY, items: { type: Type.STRING } },
      importantLevels: { type: Type.ARRAY, items: { type: Type.NUMBER } },
      technicalReasoning: { type: Type.STRING }
    },
    required: ['status', 'technicalBias', 'indicatorAgreement', 'indicatorConflicts', 'importantLevels', 'technicalReasoning']
  },
  PatternAnalysis: {
    type: Type.OBJECT,
    properties: {
      status: { type: Type.STRING, enum: ['UNAVAILABLE', 'COMPLETE', 'ANALYZING', 'ERROR'] },
      patternInterpretation: { type: Type.STRING },
      bias: { type: Type.STRING, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
      reliabilityAssessment: { type: Type.STRING },
      confirmationRequirements: { type: Type.STRING },
      invalidationConditions: { type: Type.STRING }
    },
    required: ['status', 'patternInterpretation', 'bias', 'reliabilityAssessment', 'confirmationRequirements', 'invalidationConditions']
  },
  LiquidityAnalysis: {
    type: Type.OBJECT,
    properties: {
      status: { type: Type.STRING, enum: ['UNAVAILABLE', 'COMPLETE', 'ANALYZING', 'ERROR'] },
      bias: { type: Type.STRING, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
      liquidityZones: { type: Type.ARRAY, items: { type: Type.STRING } },
      sweepsDetected: { type: Type.BOOLEAN },
      liquidityReasoning: { type: Type.STRING }
    },
    required: ['status', 'bias', 'liquidityZones', 'sweepsDetected', 'liquidityReasoning']
  },
  SentimentAnalysis: {
    type: Type.OBJECT,
    properties: {
      status: { type: Type.STRING, enum: ['UNAVAILABLE', 'COMPLETE', 'ANALYZING', 'ERROR'] },
      bias: { type: Type.STRING, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
      sentimentScore: { type: Type.NUMBER },
      keyThemes: { type: Type.ARRAY, items: { type: Type.STRING } },
      sentimentReasoning: { type: Type.STRING }
    },
    required: ['status', 'bias', 'sentimentScore', 'keyThemes', 'sentimentReasoning']
  },
  TimeframeAnalysis: {
    type: Type.OBJECT,
    properties: {
      status: { type: Type.STRING, enum: ['UNAVAILABLE', 'COMPLETE', 'ANALYZING', 'ERROR'] },
      shortTermBias: { type: Type.STRING, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
      mediumTermBias: { type: Type.STRING, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
      higherTimeframeBias: { type: Type.STRING, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
      timeframeAlignment: { type: Type.STRING, enum: ['AGREEMENT', 'PARTIAL', 'CONFLICT'] },
      conflictingWarnings: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ['status', 'shortTermBias', 'mediumTermBias', 'higherTimeframeBias', 'timeframeAlignment', 'conflictingWarnings']
  },
  RiskAnalysis: {
    type: Type.OBJECT,
    properties: {
      status: { type: Type.STRING, enum: ['UNAVAILABLE', 'COMPLETE', 'ANALYZING', 'ERROR'] },
      riskLevel: { type: Type.STRING, enum: ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'] },
      majorRisks: { type: Type.ARRAY, items: { type: Type.STRING } },
      invalidationConditions: { type: Type.STRING },
      structurallyReasonable: { type: Type.BOOLEAN }
    },
    required: ['status', 'riskLevel', 'majorRisks', 'invalidationConditions', 'structurallyReasonable']
  },
  MasterDecision: {
    type: Type.OBJECT,
    properties: {
      decision: { type: Type.STRING, enum: ['NO_TRADE', 'WATCH', 'CANDIDATE_TRADE'] },
      confidence: { type: Type.NUMBER },
      timeframe: { type: Type.STRING },
      marketBias: { type: Type.STRING, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
      reasoning: { type: Type.STRING },
      supportingFactors: { type: Type.ARRAY, items: { type: Type.STRING } },
      conflictingFactors: { type: Type.ARRAY, items: { type: Type.STRING } },
      riskLevel: { type: Type.STRING, enum: ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'] },
      tradeCandidate: { 
        type: Type.OBJECT, 
        nullable: true,
        properties: {
          side: { type: Type.STRING, enum: ['LONG', 'SHORT'] },
          entryZone: { 
            type: Type.OBJECT,
            properties: { min: { type: Type.NUMBER }, max: { type: Type.NUMBER } },
            required: ['min', 'max']
          },
          stopLoss: { type: Type.NUMBER },
          takeProfitLevels: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          riskRewardRatio: { type: Type.NUMBER },
          invalidationCondition: { type: Type.STRING },
          thesis: { type: Type.STRING },
          timeframe: { type: Type.STRING }
        },
        required: ['side', 'entryZone', 'stopLoss', 'takeProfitLevels', 'riskRewardRatio', 'invalidationCondition', 'thesis', 'timeframe']
      }
    },
    required: ['decision', 'confidence', 'timeframe', 'marketBias', 'reasoning', 'supportingFactors', 'conflictingFactors', 'riskLevel']
  }
};

import { BaseAIProvider } from './baseProvider';

export class GeminiProvider extends BaseAIProvider {
  name = 'gemini-provider';
  private ai: GoogleGenAI | null = null;
  private fastModel: string;
  private deepModel: string;
  
  constructor() {
    super();
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
    
    let fast = process.env.GEMINI_SCREENING_MODEL || 'gemini-3.6-flash';
    let deep = process.env.GEMINI_MASTER_MODEL || 'gemini-3.6-flash';
    
    if (fast.includes('2.5')) fast = 'gemini-3.6-flash';
    if (deep.includes('2.5')) deep = 'gemini-3.6-flash';
    
    this.fastModel = fast;
    this.deepModel = deep;
  }

  isConfigured(): boolean {
    return this.ai !== null;
  }

  // Override getHealth to include GeminiBudgetManager state
  getHealth() {
    const baseHealth = super.getHealth();
    const budgetStatus = GeminiBudgetManager.getStatus();
    if (budgetStatus.status === 'QUOTA_EXHAUSTED') {
      baseHealth.status = 'QUOTA_EXHAUSTED';
    } else if (budgetStatus.status === 'DEGRADED' && baseHealth.status === 'HEALTHY') {
      baseHealth.status = 'DEGRADED';
    }
    return baseHealth;
  }

  async generateObject<T>(prompt: string, schemaName: string, systemPrompt?: string): Promise<T> {
    if (!this.isConfigured() || !this.ai) {
      throw new Error('Gemini API is OFFLINE');
    }
    
    if (!GeminiBudgetManager.canMakeRequest()) {
      const status = GeminiBudgetManager.getStatus();
      if (status.status === 'QUOTA_EXHAUSTED') {
        throw new Error('DAILY_QUOTA_EXHAUSTED');
      }
      throw new Error('Gemini API is unavailable or Quota Exhausted');
    }

    const schema = SCHEMAS[schemaName];
    if (!schema) {
      throw new Error(`Schema ${schemaName} is not defined in GeminiProvider.`);
    }

    const modelToUse = schemaName === 'MasterDecision' ? this.deepModel : this.fastModel;

    try {
      const response = await this.ai.models.generateContent({
        model: modelToUse,
        contents: prompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.2
        }
      });
      
      if (!response.text) {
        throw new Error('Empty response from Gemini');
      }

      const parsed = JSON.parse(response.text);
      GeminiBudgetManager.recordRequest(true);
      this.recordSuccess();
      return parsed as T;

    } catch (err: any) {
      GeminiBudgetManager.recordRequest(false);
      this.recordFailure(err);
      console.error(`[GeminiProvider] Error calling Gemini (Model: ${modelToUse}, Schema: ${schemaName}):`, err.message);

      // ── Classify and rethrow with clean error codes ──────────────────────

      // 1. Daily quota exhausted — DynamicModelRouter will NOT retry Gemini
      if (
        err.message?.includes('GenerateRequestsPerDayPerProjectFreeTier') ||
        err.message?.includes('GenerateRequestsPerDayPerProject') ||
        err.message?.includes('free_tier_requests') ||
        (err.message?.includes('429') && err.message?.includes('quota'))
      ) {
        GeminiBudgetManager.markQuotaExhausted(true);
        throw new Error('DAILY_QUOTA_EXHAUSTED');
      }

      // 2. Temporary rate limit — extract retryDelay if present
      if (err.message?.includes('429') || err.message?.includes('rate limit') || err.message?.includes('RESOURCE_EXHAUSTED')) {
        const retryMatch = err.message.match(/retryDelay[":\s]+([0-9.]+)s/);
        const retrySeconds = retryMatch ? parseFloat(retryMatch[1]) : 30;
        GeminiBudgetManager.markQuotaExhausted(false, retrySeconds * 1000);
        throw new Error(`RATE_LIMITED:${retrySeconds}s`);
      }

      // 3. Server errors / timeout — transient, router may retry same or next model
      throw err;
    }
  }
}
