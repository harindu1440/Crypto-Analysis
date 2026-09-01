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

export class GeminiProvider implements AIProvider {
  name = 'gemini-provider';
  private ai: GoogleGenAI;
  private fastModel: string;
  private deepModel: string;
  
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[GeminiProvider] No GEMINI_API_KEY provided. AI is OFFLINE.');
      // Mock ai to prevent hard crashes if called before check
      this.ai = new GoogleGenAI({ apiKey: 'mock' });
    } else {
      this.ai = new GoogleGenAI({ apiKey });
    }
    
    let fast = process.env.GEMINI_SCREENING_MODEL || 'gemini-3.6-flash';
    let deep = process.env.GEMINI_MASTER_MODEL || 'gemini-3.6-flash';
    
    if (fast.includes('2.5')) fast = 'gemini-3.6-flash';
    if (deep.includes('2.5')) deep = 'gemini-3.6-flash';
    
    this.fastModel = fast;
    this.deepModel = deep;
  }

  async generateObject<T>(prompt: string, schemaName: string, systemPrompt?: string): Promise<T> {
    if (!GeminiBudgetManager.canMakeRequest()) {
      throw new Error('Gemini API is unavailable or Quota Exhausted');
    }

    const schema = SCHEMAS[schemaName];
    if (!schema) {
      throw new Error(`Schema ${schemaName} is not defined in GeminiProvider.`);
    }

    const modelToUse = schemaName === 'MasterDecision' ? this.deepModel : this.fastModel;

    let retries = 3;
    let delay = 3000;

    while (retries >= 0) {
      try {
        const response = await this.ai.models.generateContent({
          model: modelToUse,
          contents: prompt,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            responseSchema: schema,
            temperature: 0.2 // low temp for analytical tasks
          }
        });
        
        if (!response.text) {
            throw new Error('Empty response from Gemini');
        }

        const parsed = JSON.parse(response.text);
        GeminiBudgetManager.recordRequest(true);
        return parsed as T;
      } catch (err: any) {
        GeminiBudgetManager.recordRequest(false);
        retries--;
        console.error(`[GeminiProvider] Error calling Gemini (Model: ${modelToUse}, Schema: ${schemaName}):`, err.message);
        
        // 1. Daily Quota Exhausted
        if (err.message.includes('GenerateRequestsPerDayPerProjectFreeTier') || (err.message.includes('429') && err.message.includes('quota'))) {
           GeminiBudgetManager.markQuotaExhausted(true);
           throw new Error('DAILY_QUOTA_EXHAUSTED'); // Stop retry storm immediately
        }
        
        // 2. Temporary Rate Limit
        if (err.message.includes('Rate Limit') || err.message.includes('429')) {
           const retryMatch = err.message.match(/retry in ([\d\.]+)s/);
           if (retryMatch) {
             delay = Math.max(delay, (parseFloat(retryMatch[1]) * 1000) + 1000);
           } else {
             delay = Math.max(delay, 10000); // Default to 10s backoff for rate limits
           }
           GeminiBudgetManager.markQuotaExhausted(false, delay);
        } else if (err.message.includes('50') || err.message.includes('timeout')) {
           GeminiBudgetManager.markQuotaExhausted(false, delay);
        }

        if (retries < 0) {
          throw err;
        }
        
        console.warn(`[GeminiProvider] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, 30000); // exponential backoff up to 30s
      }
    }
    
    throw new Error('GeminiProvider failed after retries');
  }
}
