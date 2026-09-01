import { EventBus } from '../system/eventBus';

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  isClosed: boolean;
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

class CandleCache {
  // symbol -> timeframe -> candles[]
  private cache = new Map<string, Map<Timeframe, Candle[]>>();
  private maxCandles = 200; // Store up to 200 candles per timeframe

  constructor() {
    EventBus.subscribe('CANDLE_CLOSE', (event) => {
      const { symbol, payload } = event;
      if (!symbol) return;
      this.addCandle(symbol, payload.interval as Timeframe, {
        openTime: payload.startTime,
        open: payload.open,
        high: payload.high,
        low: payload.low,
        close: payload.close,
        volume: payload.volume,
        closeTime: payload.closeTime,
        isClosed: true
      });
    });
  }

  public addCandle(symbol: string, timeframe: Timeframe, candle: Candle) {
    if (!this.cache.has(symbol)) {
      this.cache.set(symbol, new Map());
    }
    
    const symbolCache = this.cache.get(symbol)!;
    if (!symbolCache.has(timeframe)) {
      symbolCache.set(timeframe, []);
    }

    const candles = symbolCache.get(timeframe)!;
    
    // Check if candle already exists (update or append)
    const existingIndex = candles.findIndex(c => c.openTime === candle.openTime);
    if (existingIndex >= 0) {
      candles[existingIndex] = candle;
    } else {
      candles.push(candle);
      candles.sort((a, b) => a.openTime - b.openTime);
      
      // Keep only maxCandles
      if (candles.length > this.maxCandles) {
        candles.splice(0, candles.length - this.maxCandles);
      }
    }
  }

  public getCandles(symbol: string, timeframe: Timeframe): Candle[] {
    return this.cache.get(symbol)?.get(timeframe) || [];
  }
}

export const CandleBuilderService = new CandleCache();
