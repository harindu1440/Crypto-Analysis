"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const accountSyncService_1 = require("../services/account/accountSyncService");
const binanceAccountApi_1 = require("../services/binance/binanceAccountApi");
jest.mock('../services/binance/binanceAccountApi');
describe('Account Service (Phase 9)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    it('account snapshot parsing and balance normalization', async () => {
        binanceAccountApi_1.BinanceAccountApi.getAccount.mockResolvedValue({
            timestamp: 1000,
            balances: [
                { asset: 'USDT', free: 1000, locked: 0 },
                { asset: 'BTC', free: 1, locked: 0 }
            ]
        });
        binanceAccountApi_1.BinanceAccountApi.getOpenOrders.mockResolvedValue([]);
        await accountSyncService_1.AccountSyncService.fetchAccount();
        const state = accountSyncService_1.AccountSyncService.getState();
        expect(state.connectionStatus).toBe('CONNECTED');
        expect(state.balances.length).toBe(2);
        expect(accountSyncService_1.AccountSyncService.getAvailableBalance('USDT')).toBe(1000);
    });
    it('account API error handled safely', async () => {
        binanceAccountApi_1.BinanceAccountApi.getAccount.mockRejectedValue(new Error('Network error'));
        await accountSyncService_1.AccountSyncService.fetchAccount();
        const state = accountSyncService_1.AccountSyncService.getState();
        expect(state.connectionStatus).toBe('ERROR');
        expect(state.lastError).toBe('Network error');
    });
    it('throws error when balance unavailable (missing credentials)', () => {
        expect(() => accountSyncService_1.AccountSyncService.getAvailableBalance('USDT')).toThrow(/Account balance unavailable/);
    });
    it('order reconciliation detects existing order status', async () => {
        binanceAccountApi_1.BinanceAccountApi.getOrder.mockResolvedValue({
            symbol: 'BTCUSDT',
            orderId: '123',
            status: 'FILLED',
            executedQty: 1,
            price: 50000
        });
        const order = await accountSyncService_1.AccountSyncService.getOrderStatusByClientOrderId('BTCUSDT', 'client1');
        expect(order).toBeDefined();
        expect(order?.status).toBe('FILLED');
    });
    it('order reconciliation handles missing order gracefully', async () => {
        binanceAccountApi_1.BinanceAccountApi.getOrder.mockRejectedValue(new Error('Order does not exist'));
        const order = await accountSyncService_1.AccountSyncService.getOrderStatusByClientOrderId('BTCUSDT', 'client1');
        expect(order).toBeNull();
    });
});
