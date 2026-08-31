"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const userService_1 = require("../services/user/userService");
const router = express_1.default.Router();
router.use(authMiddleware_1.requireAuth);
router.get('/watchlist', (req, res) => {
    res.json(userService_1.UserService.getWatchlist(req.user.id));
});
router.post('/watchlist', (req, res) => {
    const { symbol } = req.body;
    if (!symbol)
        return res.status(400).json({ error: 'Symbol required' });
    userService_1.UserService.addToWatchlist(req.user.id, symbol);
    res.json({ success: true, watchlist: userService_1.UserService.getWatchlist(req.user.id) });
});
router.delete('/watchlist/:symbol', (req, res) => {
    userService_1.UserService.removeFromWatchlist(req.user.id, req.params.symbol);
    res.json({ success: true, watchlist: userService_1.UserService.getWatchlist(req.user.id) });
});
router.get('/preferences', (req, res) => {
    res.json(userService_1.UserService.getPreferences(req.user.id));
});
router.patch('/preferences', (req, res) => {
    const updated = userService_1.UserService.updatePreferences(req.user.id, req.body);
    res.json(updated);
});
router.get('/saved', (req, res) => {
    res.json(userService_1.UserService.getSavedOpportunities(req.user.id));
});
router.post('/saved', (req, res) => {
    const { opportunityId } = req.body;
    if (!opportunityId)
        return res.status(400).json({ error: 'opportunityId required' });
    userService_1.UserService.saveOpportunity(req.user.id, opportunityId);
    res.json({ success: true, saved: userService_1.UserService.getSavedOpportunities(req.user.id) });
});
router.delete('/saved/:opportunityId', (req, res) => {
    userService_1.UserService.removeSavedOpportunity(req.user.id, req.params.opportunityId);
    res.json({ success: true, saved: userService_1.UserService.getSavedOpportunities(req.user.id) });
});
exports.default = router;
