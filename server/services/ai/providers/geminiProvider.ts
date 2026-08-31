import { AIProvider } from './provider.interface';
import { GoogleGenAI, Type, Schema } from '@google/genai';
import { AlertService } from '../../system/alertService';

// Define Schemas for Structured Output
const SCHEMAS: Record<string, Schema> = {
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
  
  // Rate limiting & Observability
  private requestsThisMinute = 0;
  private resetTime = Date.now() + 60000;
  public static lastStatus: 'HEALTHY' | 'DEGRADED' | 'OFFLINE' = 'OFFLINE';

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[GeminiProvider] No GEMINI_API_KEY provided. AI is OFFLINE.');
      GeminiProvider.lastStatus = 'OFFLINE';
      // Mock ai to prevent hard crashes if called before check
      this.ai = new GoogleGenAI({ apiKey: 'mock' });
    } else {
      this.ai = new GoogleGenAI({ apiKey });
      GeminiProvider.lastStatus = 'HEALTHY';
    }
    
    this.fastModel = process.env.GEMINI_FAST_MODEL || 'gemini-2.5-flash';
    this.deepModel = process.env.GEMINI_DEEP_MODEL || 'gemini-2.5-pro';
  }

  private checkRateLimit() {
    if (Date.now() > this.resetTime) {
      this.requestsThisMinute = 0;
      this.resetTime = Date.now() + 60000;
    }
    if (this.requestsThisMinute > 15) {
      throw new Error('Local Rate Limit Exceeded (15/min limit for safety)');
    }
    this.requestsThisMinute++;
  }

  async generateObject<T>(prompt: string, schemaName: string, systemPrompt?: string): Promise<T> {
    if (GeminiProvider.lastStatus === 'OFFLINE' || !process.env.GEMINI_API_KEY) {
      throw new Error('Gemini API is OFFLINE');
    }

    const schema = SCHEMAS[schemaName];
    if (!schema) {
      throw new Error(`Schema ${schemaName} is not defined in GeminiProvider.`);
    }

    const modelToUse = schemaName === 'MasterDecision' ? this.deepModel : this.fastModel;

    let retries = 2;
    let delay = 1000;

    while (retries >= 0) {
      try {
        this.checkRateLimit();
        
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
        GeminiProvider.lastStatus = 'HEALTHY';
        return parsed as T;
      } catch (err: any) {
        retries--;
        console.error(`[GeminiProvider] Error calling Gemini (Model: ${modelToUse}, Schema: ${schemaName}):`, err.message);
        
        if (err.message.includes('Rate Limit') || err.message.includes('429')) {
           GeminiProvider.lastStatus = 'DEGRADED';
           AlertService.log('WARNING', 'AI', 'Gemini API Rate Limit hit. Retrying...');
        } else if (err.message.includes('50') || err.message.includes('timeout')) {
           GeminiProvider.lastStatus = 'DEGRADED';
        }

        if (retries < 0) {
          throw err;
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // exponential backoff
      }
    }
    
    throw new Error('GeminiProvider failed after retries');
  }
}
