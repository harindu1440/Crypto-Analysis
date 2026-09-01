"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const aiDriftService_1 = require("../services/ai/aiDriftService");
jest.mock('../config/database', () => ({
    LocalDatabase: {
        insert: jest.fn()
    }
}));
describe('AiDriftService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    test('detects no drift when performance is stable', () => {
        const baseline = [{ winRate: 70 }, { winRate: 72 }];
        const recent = [{ winRate: 69 }, { winRate: 71 }];
        const events = aiDriftService_1.AiDriftService.evaluateDrift(baseline, recent);
        expect(events.length).toBe(0);
    });
    // Note: These tests will be expanded once statistical formulas are fully implemented
});
