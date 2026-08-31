"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HistoricalDataService = void 0;
const database_1 = require("../../config/database");
exports.HistoricalDataService = {
    /**
     * Fetch historical klines, checking cache first, then pulling from Binance if needed.
     * Binance returns max 1000 candles per request.
     */
    async getHistoricalData(symbol, interval, startTime, endTime) {
        const cacheKey = `${symbol}_${interval}`;
        const historicalCache = database_1.LocalDatabase.get('historicalData');
        if (!historicalCache[cacheKey]) {
            historicalCache[cacheKey] = [];
        }
        const cachedData = historicalCache[cacheKey];
        // Sort cache just in case
        cachedData.sort((a, b) => a.time - b.time);
        // Find missing ranges
        // For simplicity in Phase 18, we will pull in chunks directly if we don't have enough data
        // A robust system would merge ranges. Here we check if the requested range is fully covered.
        let isCovered = false;
        if (cachedData.length > 0) {
            const cacheStart = cachedData[0].time;
            const cacheEnd = cachedData[cachedData.length - 1].time;
            if (startTime >= cacheStart && endTime <= cacheEnd) {
                isCovered = true;
            }
        }
        if (isCovered) {
            return cachedData.filter(c => c.time >= startTime && c.time <= endTime);
        }
        // If not covered, we fetch from Binance (up to limits)
        console.log(`[Backtest] Fetching historical data for ${symbol} ${interval} from ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`);
        const fetchedData = await this.fetchFromBinance(symbol, interval, startTime, endTime);
        // Merge into cache and deduplicate
        const merged = [...cachedData, ...fetchedData];
        const uniqueMap = new Map();
        for (const c of merged) {
            uniqueMap.set(c.time, c);
        }
        const newCache = Array.from(uniqueMap.values()).sort((a, b) => a.time - b.time);
        // Data Validation
        this.validateData(newCache);
        historicalCache[cacheKey] = newCache;
        database_1.LocalDatabase.set('historicalData', historicalCache);
        return newCache.filter(c => c.time >= startTime && c.time <= endTime);
    },
    async fetchFromBinance(symbol, interval, startTime, endTime) {
        const BASE_URL = 'https://api.binance.com/api/v3';
        let allData = [];
        let currentStartTime = startTime;
        while (currentStartTime < endTime) {
            const response = await fetch(`${BASE_URL}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&startTime=${currentStartTime}&endTime=${endTime}&limit=1000`);
            if (!response.ok) {
                throw new Error(`Failed to fetch historical klines: ${response.statusText}`);
            }
            const data = await response.json();
            if (data.length === 0)
                break;
            const parsed = data.map(d => ({
                time: d[0],
                open: parseFloat(d[1]),
                high: parseFloat(d[2]),
                low: parseFloat(d[3]),
                close: parseFloat(d[4]),
                volume: parseFloat(d[5])
            }));
            allData = allData.concat(parsed);
            currentStartTime = data[data.length - 1][0] + 1; // Start from next ms
            // Rate limit protection
            await new Promise(res => setTimeout(res, 100));
        }
        return allData;
    },
    validateData(data) {
        for (let i = 1; i < data.length; i++) {
            if (data[i].time <= data[i - 1].time) {
                throw new Error(`[HistoricalData] Invalid data ordering at ${new Date(data[i].time).toISOString()}`);
            }
            if (isNaN(data[i].close) || isNaN(data[i].open) || isNaN(data[i].high) || isNaN(data[i].low)) {
                throw new Error(`[HistoricalData] Invalid OHLC value at ${new Date(data[i].time).toISOString()}`);
            }
        }
    }
};
