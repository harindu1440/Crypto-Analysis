"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const authService_1 = require("../services/auth/authService");
const userService_1 = require("../services/user/userService");
const database_1 = require("../config/database");
describe('Auth & User Services', () => {
    beforeEach(() => {
        // Reset DB for tests
        database_1.LocalDatabase['data'] = {
            scheduledPlans: [],
            executionState: [],
            auditLog: [],
            positions: [],
            emergencyState: { isHalted: false },
            dailyRiskState: { date: new Date().toISOString().split('T')[0], realizedLoss: 0 },
            monitoredAssets: [],
            monitoringEvents: [],
            opportunities: [],
            notifications: [],
            users: [],
            sessions: [],
            watchlists: {},
            savedOpportunities: [],
            userPreferences: {}
        };
    });
    it('should register a new user successfully', () => {
        const user = authService_1.AuthService.register('test@example.com', 'password123', 'Tester');
        expect(user).toBeDefined();
        expect(user.email).toBe('test@example.com');
        expect(user.displayName).toBe('Tester');
        expect(user.passwordHash).toBeDefined();
        expect(user.status).toBe('ACTIVE');
        // Ensure watchlist and preferences are initialized
        const watchlists = database_1.LocalDatabase.get('watchlists');
        expect(watchlists[user.id]).toEqual([]);
    });
    it('should fail to register a duplicate email', () => {
        authService_1.AuthService.register('test@example.com', 'password123', 'Tester');
        expect(() => {
            authService_1.AuthService.register('test@example.com', 'password456', 'Tester2');
        }).toThrow('User already exists');
    });
    it('should login successfully and return a session token', () => {
        authService_1.AuthService.register('test@example.com', 'password123', 'Tester');
        const { user, token } = authService_1.AuthService.login('test@example.com', 'password123');
        expect(user).toBeDefined();
        expect(token).toBeDefined();
        expect(user.passwordHash).toBeUndefined(); // Should not leak hash
    });
    it('should fail login with incorrect password', () => {
        authService_1.AuthService.register('test@example.com', 'password123', 'Tester');
        expect(() => {
            authService_1.AuthService.login('test@example.com', 'wrongpassword');
        }).toThrow('Invalid email or password');
    });
    it('should verify a valid session token', () => {
        authService_1.AuthService.register('test@example.com', 'password123', 'Tester');
        const { token } = authService_1.AuthService.login('test@example.com', 'password123');
        const verifiedUser = authService_1.AuthService.verifySession(token);
        expect(verifiedUser).toBeDefined();
        expect(verifiedUser?.email).toBe('test@example.com');
    });
    it('should fail to verify an invalid or logged out session', () => {
        authService_1.AuthService.register('test@example.com', 'password123', 'Tester');
        const { token } = authService_1.AuthService.login('test@example.com', 'password123');
        authService_1.AuthService.logout(token);
        const verifiedUser = authService_1.AuthService.verifySession(token);
        expect(verifiedUser).toBeNull();
    });
    it('should isolate watchlists between users', () => {
        const user1 = authService_1.AuthService.register('u1@example.com', 'pass', 'U1');
        const user2 = authService_1.AuthService.register('u2@example.com', 'pass', 'U2');
        userService_1.UserService.addToWatchlist(user1.id, 'BTCUSDT');
        userService_1.UserService.addToWatchlist(user2.id, 'ETHUSDT');
        const w1 = userService_1.UserService.getWatchlist(user1.id);
        const w2 = userService_1.UserService.getWatchlist(user2.id);
        expect(w1).toContain('BTCUSDT');
        expect(w1).not.toContain('ETHUSDT');
        expect(w2).toContain('ETHUSDT');
        expect(w2).not.toContain('BTCUSDT');
    });
});
