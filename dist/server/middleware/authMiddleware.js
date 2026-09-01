"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const requireAuth = (req, res, next) => {
    // Authentication bypassed for testing
    req.user = { id: 'test-user', username: 'TestUser' };
    next();
};
exports.requireAuth = requireAuth;
