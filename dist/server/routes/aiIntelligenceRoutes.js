"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const database_1 = require("../config/database");
const authMiddleware_1 = require("../middleware/authMiddleware");
const adaptiveIntelligenceService_1 = require("../services/ai/adaptiveIntelligenceService");
const router = express_1.default.Router();
router.get('/intelligence', authMiddleware_1.requireAuth, (req, res) => {
    res.json({
        profiles: database_1.LocalDatabase.get('adaptiveProfiles'),
        driftEvents: database_1.LocalDatabase.get('aiDriftEvents')
    });
});
router.get('/calibration', authMiddleware_1.requireAuth, (req, res) => {
    res.json(database_1.LocalDatabase.get('calibrationProfiles'));
});
router.get('/agents/performance', authMiddleware_1.requireAuth, (req, res) => {
    res.json(database_1.LocalDatabase.get('agentPerformance'));
});
// For testing purposes
router.post('/recalculate', authMiddleware_1.requireAuth, (req, res) => {
    adaptiveIntelligenceService_1.AdaptiveIntelligenceService.recalculateProfiles();
    res.json({ success: true, message: 'Recalculation triggered' });
});
exports.default = router;
