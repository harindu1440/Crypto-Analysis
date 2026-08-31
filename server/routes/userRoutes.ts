import express from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { UserService } from '../services/user/userService';

const router = express.Router();

router.use(requireAuth);

router.get('/watchlist', (req: any, res) => {
  res.json(UserService.getWatchlist(req.user.id));
});

router.post('/watchlist', (req: any, res) => {
  const { symbol } = req.body;
  if (!symbol) return res.status(400).json({ error: 'Symbol required' });
  UserService.addToWatchlist(req.user.id, symbol);
  res.json({ success: true, watchlist: UserService.getWatchlist(req.user.id) });
});

router.delete('/watchlist/:symbol', (req: any, res) => {
  UserService.removeFromWatchlist(req.user.id, req.params.symbol);
  res.json({ success: true, watchlist: UserService.getWatchlist(req.user.id) });
});

router.get('/preferences', (req: any, res) => {
  res.json(UserService.getPreferences(req.user.id));
});

router.patch('/preferences', (req: any, res) => {
  const updated = UserService.updatePreferences(req.user.id, req.body);
  res.json(updated);
});

router.get('/saved', (req: any, res) => {
  res.json(UserService.getSavedOpportunities(req.user.id));
});

router.post('/saved', (req: any, res) => {
  const { opportunityId } = req.body;
  if (!opportunityId) return res.status(400).json({ error: 'opportunityId required' });
  UserService.saveOpportunity(req.user.id, opportunityId);
  res.json({ success: true, saved: UserService.getSavedOpportunities(req.user.id) });
});

router.delete('/saved/:opportunityId', (req: any, res) => {
  UserService.removeSavedOpportunity(req.user.id, req.params.opportunityId);
  res.json({ success: true, saved: UserService.getSavedOpportunities(req.user.id) });
});

export default router;
