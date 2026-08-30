import { AccountSyncService } from '../services/account/accountSyncService';
import { BinanceAccountApi } from '../services/binance/binanceAccountApi';

jest.mock('../services/binance/binanceAccountApi');

describe('Account Service (Phase 9)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('account snapshot parsing and balance normalization', async () => {
    (BinanceAccountApi.getAccount as jest.Mock).mockResolvedValue({
      timestamp: 1000,
      balances: [
        { asset: 'USDT', free: 1000, locked: 0 },
        { asset: 'BTC', free: 1, locked: 0 }
      ]
    });
    (BinanceAccountApi.getOpenOrders as jest.Mock).mockResolvedValue([]);

    await AccountSyncService.fetchAccount();
    const state = AccountSyncService.getState();

    expect(state.connectionStatus).toBe('CONNECTED');
    expect(state.balances.length).toBe(2);
    expect(AccountSyncService.getAvailableBalance('USDT')).toBe(1000);
  });

  it('account API error handled safely', async () => {
    (BinanceAccountApi.getAccount as jest.Mock).mockRejectedValue(new Error('Network error'));
    
    await AccountSyncService.fetchAccount();
    const state = AccountSyncService.getState();

    expect(state.connectionStatus).toBe('ERROR');
    expect(state.lastError).toBe('Network error');
  });

  it('throws error when balance unavailable (missing credentials)', () => {
    expect(() => AccountSyncService.getAvailableBalance('USDT')).toThrow(/Account balance unavailable/);
  });

  it('order reconciliation detects existing order status', async () => {
    (BinanceAccountApi.getOrder as jest.Mock).mockResolvedValue({
      symbol: 'BTCUSDT',
      orderId: '123',
      status: 'FILLED',
      executedQty: 1,
      price: 50000
    });

    const order = await AccountSyncService.getOrderStatusByClientOrderId('BTCUSDT', 'client1');
    expect(order).toBeDefined();
    expect(order?.status).toBe('FILLED');
  });

  it('order reconciliation handles missing order gracefully', async () => {
    (BinanceAccountApi.getOrder as jest.Mock).mockRejectedValue(new Error('Order does not exist'));

    const order = await AccountSyncService.getOrderStatusByClientOrderId('BTCUSDT', 'client1');
    expect(order).toBeNull();
  });
});
