"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketStateService = void 0;
const eventBus_1 = require("../system/eventBus");
const STALE_THRESHOLD_MS = 60000; // 1 minute without update = STALE
class MarketStateCache {
    cache = new Map();
    constructor() {
        eventBus_1.EventBus.subscribe('MARKET_UPDATE', (event) => {
            const { symbol, payload } = event;
            if (!symbol)
                return;
            this.updateState(symbol, {
                price: payload.price,
                priceChange: payload.priceChange,
                priceChangePercent: payload.priceChangePercent,
                volume24h: payload.volume24h,
                source: 'WEBSOCKET'
            });
        });
    }
    updateState(symbol, data) {
        const existing = this.cache.get(symbol) || {
            symbol,
            price: 0,
            priceChange: 0,
            priceChangePercent: 0,
            volume24h: 0,
            lastUpdatedAt: 0,
            dataAgeMs: 0,
            source: 'CACHE',
            connectionStatus: 'OFFLINE'
        };
        const updated = {
            ...existing,
            ...data,
            lastUpdatedAt: Date.now(),
            connectionStatus: 'LIVE'
        };
        this.cache.set(symbol, updated);
    }
    getSnapshot(symbol) {
        const snapshot = this.cache.get(symbol);
        if (!snapshot)
            return null;
        // Calculate dynamic freshness
        const now = Date.now();
        snapshot.dataAgeMs = now - snapshot.lastUpdatedAt;
        if (snapshot.dataAgeMs > STALE_THRESHOLD_MS) {
            snapshot.connectionStatus = 'STALE';
        }
        return snapshot;
    }
    getAllSnapshots() {
        const symbols = Array.from(this.cache.keys());
        return symbols.map(sym => this.getSnapshot(sym)).filter(Boolean);
    }
}
exports.MarketStateService = new MarketStateCache();
