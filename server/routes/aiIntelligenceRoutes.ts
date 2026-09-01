import express from 'express';
import { LocalDatabase } from '../config/database';
import { requireAuth } from '../middleware/authMiddleware';
import { AdaptiveIntelligenceService } from '../services/ai/adaptiveIntelligenceService';

const router = express.Router();

router.get('/intelligence', requireAuth, (req, res) => {
  res.json({
    profiles: LocalDatabase.get('adaptiveProfiles'),
    driftEvents: LocalDatabase.get('aiDriftEvents')
  });
});

router.get('/calibration', requireAuth, (req, res) => {
  res.json(LocalDatabase.get('calibrationProfiles'));
});

router.get('/agents/performance', requireAuth, (req, res) => {
  res.json(LocalDatabase.get('agentPerformance'));
});

// For testing purposes
router.post('/recalculate', requireAuth, (req, res) => {
  AdaptiveIntelligenceService.recalculateProfiles();
  res.json({ success: true, message: 'Recalculation triggered' });
});

export default router;
