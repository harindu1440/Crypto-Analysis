"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIAgent = void 0;
class AIAgent {
    provider;
    constructor(provider) {
        this.provider = provider;
    }
    async analyzeMarketContext(data) {
        try {
            return await this.provider.generateObject(JSON.stringify(data), 'MarketContext', 'You are a Market Context Agent. Evaluate the broader market conditions.');
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
            return await this.provider.generateObject(JSON.stringify(data), 'TechnicalAnalysis', 'You are a Technical Analysis Agent. Interpret the deterministic technical indicators.');
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
            return await this.provider.generateObject(JSON.stringify(data), 'PatternAnalysis', 'You are a Pattern Analysis Agent. Interpret detected candlestick patterns.');
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
            return await this.provider.generateObject(JSON.stringify(data), 'LiquidityAnalysis', 'You are a Liquidity Agent. Detect liquidity zones, stop hunts, and sweeps.');
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
            return await this.provider.generateObject(JSON.stringify(data), 'SentimentAnalysis', 'You are a Sentiment/News Agent. Analyze market regime and broad sentiment based on price action.');
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
            return await this.provider.generateObject(JSON.stringify(data), 'TimeframeAnalysis', 'You are a Multi-Timeframe Agent. Compare timeframes for alignment or conflict.');
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
            return await this.provider.generateObject(JSON.stringify({ data, otherAnalysis }), 'RiskAnalysis', 'You are a Risk Analysis Agent. Evaluate if the setup has acceptable market conditions.');
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
            return await this.provider.generateObject(JSON.stringify({ data, agentResults }), 'MasterDecision', 'You are the Master Decision Agent. Analyze specialist inputs. Prefer NO_TRADE if uncertainty exists.');
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
