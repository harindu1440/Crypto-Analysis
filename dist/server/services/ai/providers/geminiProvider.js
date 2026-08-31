"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiProvider = void 0;
const genai_1 = require("@google/genai");
const alertService_1 = require("../../system/alertService");
// Define Schemas for Structured Output
const SCHEMAS = {
    MarketContext: {
        type: genai_1.Type.OBJECT,
        properties: {
            status: { type: genai_1.Type.STRING, enum: ['UNAVAILABLE', 'COMPLETE', 'ANALYZING', 'ERROR'] },
            marketCondition: { type: genai_1.Type.STRING },
            broaderTrend: { type: genai_1.Type.STRING, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
            momentum: { type: genai_1.Type.STRING },
            unusualConditions: { type: genai_1.Type.ARRAY, items: { type: genai_1.Type.STRING } },
            warnings: { type: genai_1.Type.ARRAY, items: { type: genai_1.Type.STRING } }
        },
        required: ['status', 'marketCondition', 'broaderTrend', 'momentum', 'unusualConditions', 'warnings']
    },
    TechnicalAnalysis: {
        type: genai_1.Type.OBJECT,
        properties: {
            status: { type: genai_1.Type.STRING, enum: ['UNAVAILABLE', 'COMPLETE', 'ANALYZING', 'ERROR'] },
            technicalBias: { type: genai_1.Type.STRING, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
            indicatorAgreement: { type: genai_1.Type.BOOLEAN },
            indicatorConflicts: { type: genai_1.Type.ARRAY, items: { type: genai_1.Type.STRING } },
            importantLevels: { type: genai_1.Type.ARRAY, items: { type: genai_1.Type.NUMBER } },
            technicalReasoning: { type: genai_1.Type.STRING }
        },
        required: ['status', 'technicalBias', 'indicatorAgreement', 'indicatorConflicts', 'importantLevels', 'technicalReasoning']
    },
    PatternAnalysis: {
        type: genai_1.Type.OBJECT,
        properties: {
            status: { type: genai_1.Type.STRING, enum: ['UNAVAILABLE', 'COMPLETE', 'ANALYZING', 'ERROR'] },
            patternInterpretation: { type: genai_1.Type.STRING },
            bias: { type: genai_1.Type.STRING, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
            reliabilityAssessment: { type: genai_1.Type.STRING },
            confirmationRequirements: { type: genai_1.Type.STRING },
            invalidationConditions: { type: genai_1.Type.STRING }
        },
        required: ['status', 'patternInterpretation', 'bias', 'reliabilityAssessment', 'confirmationRequirements', 'invalidationConditions']
    },
    LiquidityAnalysis: {
        type: genai_1.Type.OBJECT,
        properties: {
            status: { type: genai_1.Type.STRING, enum: ['UNAVAILABLE', 'COMPLETE', 'ANALYZING', 'ERROR'] },
            bias: { type: genai_1.Type.STRING, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
            liquidityZones: { type: genai_1.Type.ARRAY, items: { type: genai_1.Type.STRING } },
            sweepsDetected: { type: genai_1.Type.BOOLEAN },
            liquidityReasoning: { type: genai_1.Type.STRING }
        },
        required: ['status', 'bias', 'liquidityZones', 'sweepsDetected', 'liquidityReasoning']
    },
    SentimentAnalysis: {
        type: genai_1.Type.OBJECT,
        properties: {
            status: { type: genai_1.Type.STRING, enum: ['UNAVAILABLE', 'COMPLETE', 'ANALYZING', 'ERROR'] },
            bias: { type: genai_1.Type.STRING, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
            sentimentScore: { type: genai_1.Type.NUMBER },
            keyThemes: { type: genai_1.Type.ARRAY, items: { type: genai_1.Type.STRING } },
            sentimentReasoning: { type: genai_1.Type.STRING }
        },
        required: ['status', 'bias', 'sentimentScore', 'keyThemes', 'sentimentReasoning']
    },
    TimeframeAnalysis: {
        type: genai_1.Type.OBJECT,
        properties: {
            status: { type: genai_1.Type.STRING, enum: ['UNAVAILABLE', 'COMPLETE', 'ANALYZING', 'ERROR'] },
            shortTermBias: { type: genai_1.Type.STRING, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
            mediumTermBias: { type: genai_1.Type.STRING, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
            higherTimeframeBias: { type: genai_1.Type.STRING, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
            timeframeAlignment: { type: genai_1.Type.STRING, enum: ['AGREEMENT', 'PARTIAL', 'CONFLICT'] },
            conflictingWarnings: { type: genai_1.Type.ARRAY, items: { type: genai_1.Type.STRING } }
        },
        required: ['status', 'shortTermBias', 'mediumTermBias', 'higherTimeframeBias', 'timeframeAlignment', 'conflictingWarnings']
    },
    RiskAnalysis: {
        type: genai_1.Type.OBJECT,
        properties: {
            status: { type: genai_1.Type.STRING, enum: ['UNAVAILABLE', 'COMPLETE', 'ANALYZING', 'ERROR'] },
            riskLevel: { type: genai_1.Type.STRING, enum: ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'] },
            majorRisks: { type: genai_1.Type.ARRAY, items: { type: genai_1.Type.STRING } },
            invalidationConditions: { type: genai_1.Type.STRING },
            structurallyReasonable: { type: genai_1.Type.BOOLEAN }
        },
        required: ['status', 'riskLevel', 'majorRisks', 'invalidationConditions', 'structurallyReasonable']
    },
    MasterDecision: {
        type: genai_1.Type.OBJECT,
        properties: {
            decision: { type: genai_1.Type.STRING, enum: ['NO_TRADE', 'WATCH', 'CANDIDATE_TRADE'] },
            confidence: { type: genai_1.Type.NUMBER },
            timeframe: { type: genai_1.Type.STRING },
            marketBias: { type: genai_1.Type.STRING, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
            reasoning: { type: genai_1.Type.STRING },
            supportingFactors: { type: genai_1.Type.ARRAY, items: { type: genai_1.Type.STRING } },
            conflictingFactors: { type: genai_1.Type.ARRAY, items: { type: genai_1.Type.STRING } },
            riskLevel: { type: genai_1.Type.STRING, enum: ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'] },
            tradeCandidate: {
                type: genai_1.Type.OBJECT,
                nullable: true,
                properties: {
                    side: { type: genai_1.Type.STRING, enum: ['LONG', 'SHORT'] },
                    entryZone: {
                        type: genai_1.Type.OBJECT,
                        properties: { min: { type: genai_1.Type.NUMBER }, max: { type: genai_1.Type.NUMBER } },
                        required: ['min', 'max']
                    },
                    stopLoss: { type: genai_1.Type.NUMBER },
                    takeProfitLevels: { type: genai_1.Type.ARRAY, items: { type: genai_1.Type.NUMBER } },
                    riskRewardRatio: { type: genai_1.Type.NUMBER },
                    invalidationCondition: { type: genai_1.Type.STRING },
                    thesis: { type: genai_1.Type.STRING },
                    timeframe: { type: genai_1.Type.STRING }
                },
                required: ['side', 'entryZone', 'stopLoss', 'takeProfitLevels', 'riskRewardRatio', 'invalidationCondition', 'thesis', 'timeframe']
            }
        },
        required: ['decision', 'confidence', 'timeframe', 'marketBias', 'reasoning', 'supportingFactors', 'conflictingFactors', 'riskLevel']
    }
};
class GeminiProvider {
    name = 'gemini-provider';
    ai;
    fastModel;
    deepModel;
    // Rate limiting & Observability
    requestsThisMinute = 0;
    resetTime = Date.now() + 60000;
    static lastStatus = 'OFFLINE';
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn('[GeminiProvider] No GEMINI_API_KEY provided. AI is OFFLINE.');
            GeminiProvider.lastStatus = 'OFFLINE';
            // Mock ai to prevent hard crashes if called before check
            this.ai = new genai_1.GoogleGenAI({ apiKey: 'mock' });
        }
        else {
            this.ai = new genai_1.GoogleGenAI({ apiKey });
            GeminiProvider.lastStatus = 'HEALTHY';
        }
        this.fastModel = process.env.GEMINI_FAST_MODEL || 'gemini-3.6-flash';
        this.deepModel = process.env.GEMINI_DEEP_MODEL || 'gemini-3.6-flash';
    }
    checkRateLimit() {
        if (Date.now() > this.resetTime) {
            this.requestsThisMinute = 0;
            this.resetTime = Date.now() + 60000;
        }
        if (this.requestsThisMinute > 15) {
            throw new Error('Local Rate Limit Exceeded (15/min limit for safety)');
        }
        this.requestsThisMinute++;
    }
    async generateObject(prompt, schemaName, systemPrompt) {
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
                return parsed;
            }
            catch (err) {
                retries--;
                console.error(`[GeminiProvider] Error calling Gemini (Model: ${modelToUse}, Schema: ${schemaName}):`, err.message);
                if (err.message.includes('Rate Limit') || err.message.includes('429')) {
                    GeminiProvider.lastStatus = 'DEGRADED';
                    alertService_1.AlertService.log('WARNING', 'AI', 'Gemini API Rate Limit hit. Retrying...');
                }
                else if (err.message.includes('50') || err.message.includes('timeout')) {
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
exports.GeminiProvider = GeminiProvider;
