"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIAgent = void 0;
const prompts_1 = require("./prompts");
class AIAgent {
    provider;
    constructor(provider) {
        this.provider = provider;
    }
    async analyzeMarketContext(data) {
        try {
            return await this.provider.generateObject(JSON.stringify(data), 'MarketContext', `${prompts_1.PROMPTS.marketContext.description}\n${prompts_1.PROMPTS.marketContext.instructions}`);
        }
        catch (e) {
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
    async analyzeTechnicals(data) {
        try {
            return await this.provider.generateObject(JSON.stringify(data), 'TechnicalAnalysis', `${prompts_1.PROMPTS.technical.description}\n${prompts_1.PROMPTS.technical.instructions}`);
        }
        catch (e) {
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
    async analyzePatterns(data) {
        try {
            return await this.provider.generateObject(JSON.stringify(data), 'PatternAnalysis', `${prompts_1.PROMPTS.pattern.description}\n${prompts_1.PROMPTS.pattern.instructions}`);
        }
        catch (e) {
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
    async analyzeLiquidity(data) {
        try {
            return await this.provider.generateObject(JSON.stringify(data), 'LiquidityAnalysis', `${prompts_1.PROMPTS.liquidity.description}\n${prompts_1.PROMPTS.liquidity.instructions}`);
        }
        catch (e) {
            return {
                status: 'ERROR',
                bias: 'NEUTRAL',
                liquidityZones: [],
                sweepsDetected: false,
                liquidityReasoning: 'Agent execution failed'
            };
        }
    }
    async analyzeSentiment(data) {
        try {
            return await this.provider.generateObject(JSON.stringify(data), 'SentimentAnalysis', `${prompts_1.PROMPTS.sentiment.description}\n${prompts_1.PROMPTS.sentiment.instructions}`);
        }
        catch (e) {
            return {
                status: 'ERROR',
                bias: 'NEUTRAL',
                sentimentScore: 50,
                keyThemes: [],
                sentimentReasoning: 'Agent execution failed'
            };
        }
    }
    async analyzeTimeframes(data) {
        try {
            return await this.provider.generateObject(JSON.stringify(data), 'TimeframeAnalysis', `${prompts_1.PROMPTS.timeframe.description}\n${prompts_1.PROMPTS.timeframe.instructions}`);
        }
        catch (e) {
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
    async analyzeRisk(data, otherAnalysis) {
        try {
            return await this.provider.generateObject(JSON.stringify({ data, otherAnalysis }), 'RiskAnalysis', `${prompts_1.PROMPTS.risk.description}\n${prompts_1.PROMPTS.risk.instructions}`);
        }
        catch (e) {
            return {
                status: 'ERROR',
                riskLevel: 'EXTREME',
                majorRisks: ['Agent execution failed'],
                invalidationConditions: 'UNKNOWN',
                structurallyReasonable: false
            };
        }
    }
    async makeMasterDecision(data, agentResults) {
        try {
            return await this.provider.generateObject(JSON.stringify({ data, agentResults }), 'MasterDecision', `${prompts_1.PROMPTS.master.description}\n${prompts_1.PROMPTS.master.instructions}`);
        }
        catch (e) {
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
exports.AIAgent = AIAgent;
