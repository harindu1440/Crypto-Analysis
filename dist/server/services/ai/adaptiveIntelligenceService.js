"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdaptiveIntelligenceService = void 0;
const database_1 = require("../../config/database");
const crypto_1 = __importDefault(require("crypto"));
exports.AdaptiveIntelligenceService = {
    MIN_CALIBRATION_SAMPLE_SIZE: parseInt(process.env.MIN_CALIBRATION_SAMPLE_SIZE || '30'),
    EXPLORATION_RATIO: parseFloat(process.env.EXPLORATION_RATIO || '0.10'),
    MAX_ADAPTIVE_SCORE_ADJUSTMENT: parseInt(process.env.MAX_ADAPTIVE_SCORE_ADJUSTMENT || '10'),
    MAX_ADAPTIVE_CONFIDENCE_ADJUSTMENT: parseFloat(process.env.MAX_ADAPTIVE_CONFIDENCE_ADJUSTMENT || '0.10'),
    /**
     * Main gate for calibrating a new AI signal
     */
    calibrateSignal(rawSignal, qualityEval, marketData) {
        if (rawSignal.decision !== 'CANDIDATE_TRADE' || !rawSignal.tradeCandidate) {
            return {
                calibratedConfidence: rawSignal.confidence,
                calibratedQualityScore: qualityEval.score,
                adaptiveStatus: 'NOT_APPLICABLE',
                historicalContext: 'N/A',
                sampleSize: 0,
                adaptiveProfile: null
            };
        }
        const c = rawSignal.tradeCandidate;
        const profileKey = `${rawSignal.symbol}-${c.timeframe}-${c.side}-${qualityEval.marketRegime}`;
        // Retrieve cached profile
        const profiles = database_1.LocalDatabase.get('adaptiveProfiles');
        const profile = profiles[profileKey];
        let calibratedConfidence = rawSignal.confidence;
        let calibratedQualityScore = qualityEval.score;
        let adaptiveStatus = 'COLD_START';
        let historicalContext = 'Insufficient historical data for accurate calibration.';
        let sampleSize = 0;
        // Apply calibration if sufficient data exists
        if (profile && profile.sampleSize >= this.MIN_CALIBRATION_SAMPLE_SIZE) {
            sampleSize = profile.sampleSize;
            // Calculate confidence adjustment (bounded)
            const confidenceDelta = (profile.winRate / 100) - rawSignal.confidence;
            const boundedConfDelta = Math.max(-this.MAX_ADAPTIVE_CONFIDENCE_ADJUSTMENT, Math.min(this.MAX_ADAPTIVE_CONFIDENCE_ADJUSTMENT, confidenceDelta));
            calibratedConfidence = parseFloat((rawSignal.confidence + boundedConfDelta).toFixed(2));
            // Calculate quality score adjustment based on R expectancy (bounded)
            const expectedR = (profile.winRate / 100) * profile.avgR - (1 - (profile.winRate / 100)); // Simple expectancy
            let scoreDelta = 0;
            if (expectedR > 0.5)
                scoreDelta = 5;
            else if (expectedR > 0.2)
                scoreDelta = 2;
            else if (expectedR < 0)
                scoreDelta = -5;
            const boundedScoreDelta = Math.max(-this.MAX_ADAPTIVE_SCORE_ADJUSTMENT, Math.min(this.MAX_ADAPTIVE_SCORE_ADJUSTMENT, scoreDelta));
            calibratedQualityScore = Math.min(100, Math.max(0, qualityEval.score + boundedScoreDelta));
            adaptiveStatus = profile.reliability;
            historicalContext = `Based on ${sampleSize} similar setups, historical win rate is ${profile.winRate.toFixed(1)}% with an average of +${profile.avgR.toFixed(2)}R.`;
            this.logAdaptiveChange(rawSignal.analysisId, qualityEval.score, calibratedQualityScore, rawSignal.confidence, calibratedConfidence, profile.profileVersion, `Adjusted based on historical expectancy of ${expectedR.toFixed(2)}`);
        }
        else {
            // Exploration Logic (Cold Start)
            if (qualityEval.score >= parseInt(process.env.MIN_EXPLORATION_SCORE || '75')) {
                historicalContext = 'Exploration Mode: Setup qualifies for deterministic testing despite lack of deep historical data.';
                this.logAdaptiveChange(rawSignal.analysisId, qualityEval.score, qualityEval.score, rawSignal.confidence, rawSignal.confidence, 0, 'Cold Start Exploration');
            }
        }
        return {
            calibratedConfidence,
            calibratedQualityScore,
            adaptiveStatus,
            historicalContext,
            sampleSize,
            adaptiveProfile: profile || null
        };
    },
    logAdaptiveChange(oppId, rawScore, adjustedScore, rawConf, adjustedConf, version, reason) {
        database_1.LocalDatabase.insert('adaptiveAuditLogs', {
            id: crypto_1.default.randomUUID(),
            opportunityId: oppId,
            rawScore,
            adjustedScore,
            rawConfidence: rawConf,
            adjustedConfidence: adjustedConf,
            profileVersion: version,
            reason,
            timestamp: Date.now()
        });
    },
    /**
     * Recalculate Profiles (Called by Background Job)
     */
    recalculateProfiles() {
        console.log('[AdaptiveIntelligence] Starting periodic recalculation of adaptive profiles...');
        // For Phase 19 testing: Seed with mock historical outcomes to avoid COLD START everywhere
        const mockProfiles = database_1.LocalDatabase.get('adaptiveProfiles');
        // Generate a few realistic profiles
        const mockData = [
            { key: 'BTCUSDT-1h-LONG-TRENDING', winRate: 72.5, avgR: 1.4, sampleSize: 145 },
            { key: 'ETHUSDT-1h-SHORT-RANGING', winRate: 61.2, avgR: 0.8, sampleSize: 89 },
            { key: 'SOLUSDT-4h-LONG-VOLATILE', winRate: 45.0, avgR: 0.4, sampleSize: 42 }
        ];
        mockData.forEach(data => {
            mockProfiles[data.key] = {
                id: crypto_1.default.randomUUID(),
                symbol: data.key.split('-')[0],
                timeframe: data.key.split('-')[1],
                direction: data.key.split('-')[2],
                regime: data.key.split('-')[3],
                sampleSize: data.sampleSize,
                winRate: data.winRate,
                avgR: data.avgR,
                reliability: data.sampleSize > 100 ? 'HIGH' : data.sampleSize > 50 ? 'MEDIUM' : 'LOW',
                lastUpdated: Date.now(),
                dataRange: 'Last 90 Days',
                profileVersion: 1
            };
        });
        database_1.LocalDatabase.save();
        console.log('[AdaptiveIntelligence] Recalculation complete. Seeded mock profiles.');
    }
};
