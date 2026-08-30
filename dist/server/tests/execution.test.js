"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const executionService_1 = require("../services/execution/executionService");
const executionScheduler_1 = require("../services/execution/executionScheduler");
const binanceMarketService_1 = require("../services/binance/binanceMarketService");
jest.mock('../services/binance/binanceMarketService');
describe('Execution Service Math & Filters', () => {
    it('normalizes quantity down to nearest step size safely', () => {
        // raw 0.001237 with step 0.0001 -> 0.0012
        const result = executionService_1.ExecutionService.normalizeQuantity(0.001237, 0.0001);
        expect(result).toBe(0.0012);
    });
    it('normalizes price to nearest tick size', () => {
        const result = executionService_1.ExecutionService.normalizePrice(105234.567, 0.1);
        expect(result).toBe(105234.6);
    });
    it('throws error if quantity is below minQty', async () => {
        binanceMarketService_1.BinanceMarketService.getSymbols.mockResolvedValue([{
                symbol: 'BTCUSDT',
                status: 'TRADING',
                filters: [
                    { filterType: 'LOT_SIZE', minQty: '0.001', maxQty: '1000', stepSize: '0.0001' },
                    { filterType: 'MIN_NOTIONAL', minNotional: '10' },
                    { filterType: 'PRICE_FILTER', tickSize: '0.1' }
                ]
            }]);
        const mockPlan = {
            symbol: 'BTCUSDT',
            position: { quantity: 0.0005 },
            entry: { reference: 60000 }
        };
        await expect(executionService_1.ExecutionService.validateAgainstExchangeFilters(mockPlan)).rejects.toThrow(/below exchange minimum/);
    });
    it('throws error if notional is below minNotional', async () => {
        binanceMarketService_1.BinanceMarketService.getSymbols.mockResolvedValue([{
                symbol: 'BTCUSDT',
                status: 'TRADING',
                filters: [
                    { filterType: 'LOT_SIZE', minQty: '0.001', maxQty: '1000', stepSize: '0.0001' },
                    { filterType: 'MIN_NOTIONAL', minNotional: '100' }, // 100 USDT minimum
                    { filterType: 'PRICE_FILTER', tickSize: '0.1' }
                ]
            }]);
        const mockPlan = {
            symbol: 'BTCUSDT',
            position: { quantity: 0.001 },
            entry: { reference: 60000 } // 0.001 * 60000 = 60 USDT Notional < 100 USDT MinNotional
        };
        await expect(executionService_1.ExecutionService.validateAgainstExchangeFilters(mockPlan)).rejects.toThrow(/Notional value.*below exchange minimum/);
    });
    it('validates and returns normalized values correctly', async () => {
        binanceMarketService_1.BinanceMarketService.getSymbols.mockResolvedValue([{
                symbol: 'BTCUSDT',
                status: 'TRADING',
                filters: [
                    { filterType: 'LOT_SIZE', minQty: '0.001', maxQty: '1000', stepSize: '0.0001' },
                    { filterType: 'MIN_NOTIONAL', minNotional: '10' },
                    { filterType: 'PRICE_FILTER', tickSize: '0.1' }
                ]
            }]);
        const mockPlan = {
            symbol: 'BTCUSDT',
            position: { quantity: 0.01538 },
            entry: { reference: 60000.123 }
        };
        const res = await executionService_1.ExecutionService.validateAgainstExchangeFilters(mockPlan);
        expect(res.normalizedQuantity).toBe(0.0153);
        expect(res.normalizedPrice).toBe(60000.1);
    });
});
describe('Execution Scheduler State', () => {
    beforeEach(() => {
        executionScheduler_1.ExecutionScheduler.scheduledPlans.clear();
        executionScheduler_1.ExecutionScheduler.executionState.clear();
        executionScheduler_1.ExecutionScheduler.executionLocks.clear();
    });
    it('prevents scheduling an invalid plan', () => {
        const invalidPlan = { validation: { status: 'REJECTED' } };
        expect(() => executionScheduler_1.ExecutionScheduler.schedulePlan(invalidPlan, Date.now() + 10000)).toThrow(/invalid plan/);
    });
    it('prevents scheduling an expired plan', () => {
        const expiredPlan = { validation: { status: 'VALID' }, expiresAt: Date.now() - 10000 };
        expect(() => executionScheduler_1.ExecutionScheduler.schedulePlan(expiredPlan, Date.now() + 10000)).toThrow(/expired plan/);
    });
    it('schedules successfully and cancels successfully', () => {
        const validPlan = { planId: '123', symbol: 'BTCUSDT', validation: { status: 'VALID' }, expiresAt: Date.now() + 10000 };
        executionScheduler_1.ExecutionScheduler.schedulePlan(validPlan, Date.now() + 5000);
        expect(executionScheduler_1.ExecutionScheduler.getUpcomingPlans().length).toBe(1);
        executionScheduler_1.ExecutionScheduler.cancelPlan('123');
        expect(executionScheduler_1.ExecutionScheduler.getUpcomingPlans().length).toBe(0);
    });
});
