"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const notificationOrchestrator_1 = require("../services/notifications/notificationOrchestrator");
const database_1 = require("../config/database");
const authService_1 = require("../services/auth/authService");
const userService_1 = require("../services/user/userService");
describe('Notification Fan-Out', () => {
    beforeEach(() => {
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
            userPreferences: {},
            historicalData: [],
            backtests: [],
            backtestJobs: {}
        };
    });
    it('should fan out notifications correctly based on preferences', () => {
        // 1. Create two users
        const u1 = authService_1.AuthService.register('u1@test.com', 'pass', 'U1');
        const u2 = authService_1.AuthService.register('u2@test.com', 'pass', 'U2');
        // 2. Set U1 to only want high quality (80+) and LONG
        userService_1.UserService.updatePreferences(u1.id, {
            minQualityScore: 80,
            direction: 'LONG'
        });
        // 3. Set U2 to want everything (default is 75+, BOTH)
        userService_1.UserService.updatePreferences(u2.id, {
            minQualityScore: 75,
            direction: 'BOTH'
        });
        // 4. Dispatch a 78-score SHORT opportunity
        notificationOrchestrator_1.NotificationOrchestrator.dispatch('NEW_OPPORTUNITY', 'HIGH', 'Test', 'Test Msg', { id: 'opp1', symbol: 'BTCUSDT', direction: 'SHORT', qualityScore: 78, timeframe: '15m', version: 1 });
        // 5. Verify results
        const notifications = database_1.LocalDatabase.get('notifications') || [];
        // U1 should NOT receive it (wants 80+, wants LONG)
        const n1 = notifications.filter((n) => n.userId === u1.id);
        expect(n1.length).toBe(0);
        // U2 SHOULD receive it (wants 75+, wants BOTH)
        const n2 = notifications.filter((n) => n.userId === u2.id);
        expect(n2.length).toBe(1);
        expect(n2[0].opportunityId).toBe('opp1');
    });
    it('should deduplicate per user', () => {
        const u1 = authService_1.AuthService.register('u3@test.com', 'pass', 'U3');
        // Dispatch same alert twice
        notificationOrchestrator_1.NotificationOrchestrator.dispatch('NEW_OPPORTUNITY', 'HIGH', 'Test', 'Test Msg', { id: 'opp2', symbol: 'ETHUSDT', direction: 'LONG', qualityScore: 90, timeframe: '15m', version: 1 });
        notificationOrchestrator_1.NotificationOrchestrator.dispatch('NEW_OPPORTUNITY', 'HIGH', 'Test', 'Test Msg', { id: 'opp2', symbol: 'ETHUSDT', direction: 'LONG', qualityScore: 90, timeframe: '15m', version: 1 });
        const notifications = database_1.LocalDatabase.get('notifications') || [];
        const n = notifications.filter((n) => n.userId === u1.id);
        expect(n.length).toBe(1); // Only 1 should be stored
    });
});
