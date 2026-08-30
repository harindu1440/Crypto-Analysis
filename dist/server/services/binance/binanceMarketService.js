"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinanceMarketService = void 0;
const BASE_URL = 'https://api.binance.com/api/v3';
exports.BinanceMarketService = {
    async getSymbols() {
        const response = await fetch(`${BASE_URL}/exchangeInfo`);
        if (!response.ok)
            throw new Error('Failed to fetch Binance symbols');
        const data = await response.json();
        return data.symbols
            .filter((s) => s.status === 'TRADING' && s.quoteAsset === 'USDT')
            .map((s) => ({
            symbol: s.symbol,
            baseAsset: s.baseAsset,
            quoteAsset: s.quoteAsset,
            status: s.status,
            filters: s.filters || [],
        }));
    },
    async getTicker(symbol) {
        const response = await fetch(`${BASE_URL}/ticker/24hr?symbol=${symbol.toUpperCase()}`);
        if (!response.ok)
            throw new Error(`Failed to fetch ticker for ${symbol}`);
        return await response.json();
    },
    async getKlines(symbol, interval = '1h', limit = 24) {
        const response = await fetch(`${BASE_URL}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`);
        if (!response.ok)
            throw new Error(`Failed to fetch klines for ${symbol}`);
        const data = await response.json();
        return data.map((d) => ({
            openTime: d[0],
            open: d[1],
            high: d[2],
            low: d[3],
            close: d[4],
            volume: d[5],
            closeTime: d[6]
        }));
    }
};
