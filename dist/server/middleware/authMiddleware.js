"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const authService_1 = require("../services/auth/authService");
const requireAuth = (req, res, next) => {
    const token = req.cookies?.sessionToken || req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized: No session token provided' });
    }
    const user = authService_1.AuthService.verifySession(token);
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
    }
    const { passwordHash, salt, ...safeUser } = user;
    req.user = safeUser;
    next();
};
exports.requireAuth = requireAuth;
