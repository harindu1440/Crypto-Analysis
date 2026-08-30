"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountSyncService = void 0;
const binanceAccountApi_1 = require("../binance/binanceAccountApi");
class AccountSyncOrchestrator {
    state = {
        lastSyncAt: 0,
        balances: [],
        openOrders: [],
        connectionStatus: 'DISCONNECTED'
    };
    syncInterval = null;
    DEFAULT_INTERVAL_MS = parseInt(process.env.ACCOUNT_SYNC_INTERVAL_MS || '30000', 10);
    start() {
        if (this.syncInterval)
            return;
        this.syncAccount(); // Initial sync
        this.syncInterval = setInterval(() => this.syncAccount(), this.DEFAULT_INTERVAL_MS);
    }
    stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }
    async fetchAccount() {
        return this.syncAccount();
    }
    async syncAccount() {
        try {
            const [snapshot, orders] = await Promise.all([
                binanceAccountApi_1.BinanceAccountApi.getAccount(),
                binanceAccountApi_1.BinanceAccountApi.getOpenOrders()
            ]);
            this.state.balances = snapshot.balances;
            this.state.openOrders = orders;
            this.state.lastSyncAt = snapshot.timestamp;
            this.state.connectionStatus = 'CONNECTED';
            this.state.lastError = undefined;
        }
        catch (error) {
            console.error('[AccountSync] Sync failed:', error.message);
            this.state.connectionStatus = 'ERROR';
            this.state.lastError = error.message;
        }
    }
    getState() {
        return this.state;
    }
    getAvailableBalance(asset) {
        if (this.state.connectionStatus !== 'CONNECTED') {
            throw new Error(`Account balance unavailable (Status: ${this.state.connectionStatus})`);
        }
        const balance = this.state.balances.find(b => b.asset === asset);
        return balance ? balance.free : 0;
    }
    getOpenOrders(symbol) {
        if (symbol) {
            return this.state.openOrders.filter(o => o.symbol === symbol);
        }
        return this.state.openOrders;
    }
    async getOrderStatusByClientOrderId(symbol, clientOrderId) {
        try {
            // Fetch directly from Binance API to ensure latest state
            const order = await binanceAccountApi_1.BinanceAccountApi.getOrder(symbol, clientOrderId);
            return order;
        }
        catch (e) {
            // If error is code -2013 (NO_SUCH_ORDER), return null
            if (e.message.includes('Order does not exist')) {
                return null;
            }
            throw e;
        }
    }
}
exports.AccountSyncService = new AccountSyncOrchestrator();
// Start automatically
exports.AccountSyncService.start();
