"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authService_1 = require("../services/auth/authService");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.post('/register', (req, res) => {
    try {
        const { email, password, displayName } = req.body;
        if (!email || !password || !displayName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const user = authService_1.AuthService.register(email, password, displayName);
        // Automatically login after register
        const { token, user: safeUser } = authService_1.AuthService.login(email, password);
        res.cookie('sessionToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000
        });
        res.json({ user: safeUser });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.post('/login', (req, res) => {
    try {
        const { email, password } = req.body;
        const { user, token } = authService_1.AuthService.login(email, password);
        res.cookie('sessionToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000
        });
        res.json({ user });
    }
    catch (error) {
        res.status(401).json({ error: error.message });
    }
});
router.post('/logout', authMiddleware_1.requireAuth, (req, res) => {
    try {
        const token = req.cookies.sessionToken || req.headers.authorization?.split(' ')[1];
        if (token)
            authService_1.AuthService.logout(token);
        res.clearCookie('sessionToken');
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/me', authMiddleware_1.requireAuth, (req, res) => {
    res.json({ user: req.user });
});
exports.default = router;
