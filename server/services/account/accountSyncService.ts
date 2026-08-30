import { AccountState, BinanceOrderStatus, ConnectionStatus } from './types';
import { BinanceAccountApi } from '../binance/binanceAccountApi';

class AccountSyncOrchestrator {
  private state: AccountState = {
    lastSyncAt: 0,
    balances: [],
    openOrders: [],
    connectionStatus: 'DISCONNECTED'
  };

  private syncInterval: NodeJS.Timeout | null = null;
  private readonly DEFAULT_INTERVAL_MS = parseInt(process.env.ACCOUNT_SYNC_INTERVAL_MS || '30000', 10);

  public start() {
    if (this.syncInterval) return;
    this.syncAccount(); // Initial sync
    this.syncInterval = setInterval(() => this.syncAccount(), this.DEFAULT_INTERVAL_MS);
  }

  public stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  public async fetchAccount() {
    return this.syncAccount();
  }

  private async syncAccount() {
    try {
      const [snapshot, orders] = await Promise.all([
        BinanceAccountApi.getAccount(),
        BinanceAccountApi.getOpenOrders()
      ]);

      this.state.balances = snapshot.balances;
      this.state.openOrders = orders;
      this.state.lastSyncAt = snapshot.timestamp;
      this.state.connectionStatus = 'CONNECTED';
      this.state.lastError = undefined;

    } catch (error: any) {
      console.error('[AccountSync] Sync failed:', error.message);
      this.state.connectionStatus = 'ERROR';
      this.state.lastError = error.message;
    }
  }

  public getState(): AccountState {
    return this.state;
  }

  public getAvailableBalance(asset: string): number {
    if (this.state.connectionStatus !== 'CONNECTED') {
      throw new Error(`Account balance unavailable (Status: ${this.state.connectionStatus})`);
    }
    const balance = this.state.balances.find(b => b.asset === asset);
    return balance ? balance.free : 0;
  }

  public getOpenOrders(symbol?: string): BinanceOrderStatus[] {
    if (symbol) {
      return this.state.openOrders.filter(o => o.symbol === symbol);
    }
    return this.state.openOrders;
  }

  public async getOrderStatusByClientOrderId(symbol: string, clientOrderId: string): Promise<BinanceOrderStatus | null> {
    try {
      // Fetch directly from Binance API to ensure latest state
      const order = await BinanceAccountApi.getOrder(symbol, clientOrderId);
      return order;
    } catch (e: any) {
      // If error is code -2013 (NO_SUCH_ORDER), return null
      if (e.message.includes('Order does not exist')) {
        return null;
      }
      throw e;
    }
  }
}

export const AccountSyncService = new AccountSyncOrchestrator();

// Start automatically
AccountSyncService.start();
