"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CandleBuilderService = void 0;
const eventBus_1 = require("../system/eventBus");
class CandleCache {
    // symbol -> timeframe -> candles[]
    cache = new Map();
    maxCandles = 200; // Store up to 200 candles per timeframe
    constructor() {
        eventBus_1.EventBus.subscribe('CANDLE_CLOSE', (event) => {
            const { symbol, payload } = event;
            if (!symbol)
                return;
            this.addCandle(symbol, payload.interval, {
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
    addCandle(symbol, timeframe, candle) {
        if (!this.cache.has(symbol)) {
            this.cache.set(symbol, new Map());
        }
        const symbolCache = this.cache.get(symbol);
        if (!symbolCache.has(timeframe)) {
            symbolCache.set(timeframe, []);
        }
        const candles = symbolCache.get(timeframe);
        // Check if candle already exists (update or append)
        const existingIndex = candles.findIndex(c => c.openTime === candle.openTime);
        if (existingIndex >= 0) {
            candles[existingIndex] = candle;
        }
        else {
            candles.push(candle);
            candles.sort((a, b) => a.openTime - b.openTime);
            // Keep only maxCandles
            if (candles.length > this.maxCandles) {
                candles.splice(0, candles.length - this.maxCandles);
            }
        }
    }
    getCandles(symbol, timeframe) {
        return this.cache.get(symbol)?.get(timeframe) || [];
    }
}
exports.CandleBuilderService = new CandleCache();
