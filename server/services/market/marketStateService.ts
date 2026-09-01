import { EventBus } from '../system/eventBus';

export interface MarketSnapshot {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  volume24h: number;
  lastUpdatedAt: number;
  dataAgeMs: number;
  source: 'WEBSOCKET' | 'REST' | 'CACHE';
  connectionStatus: 'LIVE' | 'STALE' | 'OFFLINE';
}

const STALE_THRESHOLD_MS = 60000; // 1 minute without update = STALE

class MarketStateCache {
  private cache = new Map<string, MarketSnapshot>();

  constructor() {
    EventBus.subscribe('MARKET_UPDATE', (event) => {
      const { symbol, payload } = event;
      if (!symbol) return;
      
      this.updateState(symbol, {
        price: payload.price,
        priceChange: payload.priceChange,
        priceChangePercent: payload.priceChangePercent,
        volume24h: payload.volume24h,
        source: 'WEBSOCKET'
      });
    });
  }

  public updateState(symbol: string, data: Partial<MarketSnapshot>) {
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

    const updated: MarketSnapshot = {
      ...existing,
      ...data,
      lastUpdatedAt: Date.now(),
      connectionStatus: 'LIVE'
    };

    this.cache.set(symbol, updated);
  }

  public getSnapshot(symbol: string): MarketSnapshot | null {
    const snapshot = this.cache.get(symbol);
    if (!snapshot) return null;

    // Calculate dynamic freshness
    const now = Date.now();
    snapshot.dataAgeMs = now - snapshot.lastUpdatedAt;
    
    if (snapshot.dataAgeMs > STALE_THRESHOLD_MS) {
      snapshot.connectionStatus = 'STALE';
    }

    return snapshot;
  }
  
  public getAllSnapshots(): MarketSnapshot[] {
    const symbols = Array.from(this.cache.keys());
    return symbols.map(sym => this.getSnapshot(sym)!).filter(Boolean);
  }
}

export const MarketStateService = new MarketStateCache();
