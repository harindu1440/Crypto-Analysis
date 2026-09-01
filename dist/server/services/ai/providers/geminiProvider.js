"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiProvider = void 0;
const genai_1 = require("@google/genai");
const geminiBudgetManager_1 = require("../geminiBudgetManager");
// Define Schemas for Structured Output
const SCHEMAS = {
    ScreeningAnalysis: {
        type: genai_1.Type.OBJECT,
        properties: {
            status: { type: genai_1.Type.STRING, enum: ['UNAVAILABLE', 'COMPLETE', 'ANALYZING', 'ERROR'] },
            passScreening: { type: genai_1.Type.BOOLEAN },
            reasoning: { type: genai_1.Type.STRING }
        },
        required: ['status', 'passScreening', 'reasoning']
    },
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
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn('[GeminiProvider] No GEMINI_API_KEY provided. AI is OFFLINE.');
            // Mock ai to prevent hard crashes if called before check
            this.ai = new genai_1.GoogleGenAI({ apiKey: 'mock' });
        }
        else {
            this.ai = new genai_1.GoogleGenAI({ apiKey });
        }
        let fast = process.env.GEMINI_SCREENING_MODEL || 'gemini-3.6-flash';
        let deep = process.env.GEMINI_MASTER_MODEL || 'gemini-3.6-flash';
        if (fast.includes('2.5'))
            fast = 'gemini-3.6-flash';
        if (deep.includes('2.5'))
            deep = 'gemini-3.6-flash';
        this.fastModel = fast;
        this.deepModel = deep;
    }
    async generateObject(prompt, schemaName, systemPrompt) {
        if (!geminiBudgetManager_1.GeminiBudgetManager.canMakeRequest()) {
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
                geminiBudgetManager_1.GeminiBudgetManager.recordRequest(true);
                return parsed;
            }
            catch (err) {
                geminiBudgetManager_1.GeminiBudgetManager.recordRequest(false);
                retries--;
                console.error(`[GeminiProvider] Error calling Gemini (Model: ${modelToUse}, Schema: ${schemaName}):`, err.message);
                // 1. Daily Quota Exhausted
                if (err.message.includes('GenerateRequestsPerDayPerProjectFreeTier') || (err.message.includes('429') && err.message.includes('quota'))) {
                    geminiBudgetManager_1.GeminiBudgetManager.markQuotaExhausted(true);
                    throw new Error('DAILY_QUOTA_EXHAUSTED'); // Stop retry storm immediately
                }
                // 2. Temporary Rate Limit
                if (err.message.includes('Rate Limit') || err.message.includes('429')) {
                    const retryMatch = err.message.match(/retry in ([\d\.]+)s/);
                    if (retryMatch) {
                        delay = Math.max(delay, (parseFloat(retryMatch[1]) * 1000) + 1000);
                    }
                    else {
                        delay = Math.max(delay, 10000); // Default to 10s backoff for rate limits
                    }
                    geminiBudgetManager_1.GeminiBudgetManager.markQuotaExhausted(false, delay);
                }
                else if (err.message.includes('50') || err.message.includes('timeout')) {
                    geminiBudgetManager_1.GeminiBudgetManager.markQuotaExhausted(false, delay);
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
exports.GeminiProvider = GeminiProvider;
