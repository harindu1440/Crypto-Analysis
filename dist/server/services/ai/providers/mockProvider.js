"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockProvider = void 0;
class MockProvider {
    name = 'mock-provider';
    async generateObject(prompt, schemaName, systemPrompt) {
        // Simulating network delay
        await new Promise(resolve => setTimeout(resolve, 500));
        switch (schemaName) {
            case 'MarketContext':
                return {
                    status: 'COMPLETE',
                    marketCondition: 'RANGING',
                    broaderTrend: 'NEUTRAL',
                    momentum: 'WEAK',
                    unusualConditions: [],
                    warnings: ['Low liquidity detected']
                };
            case 'TechnicalAnalysis':
                return {
                    status: 'COMPLETE',
                    technicalBias: 'BULLISH',
                    indicatorAgreement: false,
                    indicatorConflicts: ['RSI overbought but MACD trending up'],
                    importantLevels: [60000, 62000],
                    technicalReasoning: 'Price is above EMA50 but nearing strong resistance.'
                };
            case 'PatternAnalysis':
                return {
                    status: 'COMPLETE',
                    patternInterpretation: 'Bullish engulfing on 1h chart.',
                    bias: 'BULLISH',
                    reliabilityAssessment: 'Moderate reliability due to low volume.',
                    confirmationRequirements: 'Needs a close above 62000.',
                    invalidationConditions: 'Close below 60000 invalidates pattern.'
                };
            case 'TimeframeAnalysis':
                return {
                    status: 'COMPLETE',
                    shortTermBias: 'BULLISH',
                    mediumTermBias: 'NEUTRAL',
                    higherTimeframeBias: 'BEARISH',
                    timeframeAlignment: 'CONFLICT',
                    conflictingWarnings: ['Short term bullish momentum opposes higher timeframe bearish trend.']
                };
            case 'RiskAnalysis':
                return {
                    status: 'COMPLETE',
                    riskLevel: 'HIGH',
                    majorRisks: ['Conflicting timeframes', 'Upcoming macroeconomic data'],
                    invalidationConditions: 'Daily close below support.',
                    structurallyReasonable: false
                };
            case 'MasterDecision':
                // For testing, let's say the mock provider returns NO_TRADE because of conflicts.
                return {
                    decision: 'NO_TRADE',
                    confidence: 85,
                    timeframe: '1h',
                    marketBias: 'NEUTRAL',
                    reasoning: 'Conflicting timeframes and high risk assessment outweigh the short-term bullish technicals and patterns. The system prioritizes capital preservation.',
                    supportingFactors: ['Short term technicals are bullish'],
                    conflictingFactors: ['Higher timeframe is bearish', 'Risk level is high'],
                    riskLevel: 'HIGH',
                    tradeCandidate: null
                };
            default:
                throw new Error(`Unknown schema: ${schemaName}`);
        }
    }
}
exports.MockProvider = MockProvider;
