"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalysisService = void 0;
const binanceMarketService_1 = require("../binance/binanceMarketService");
const indicatorService_1 = require("./indicatorService");
const candleService_1 = require("./candleService");
const types_1 = require("./types");
exports.AnalysisService = {
    async getAnalysisSnapshot(symbol, intervals = ['1h']) {
        const timeframes = {};
        let latestPrice = 0;
        let latestVolume = 0;
        for (const interval of intervals) {
            // Fetch 200 candles to ensure enough data for SMA 200 / EMA 200
            const klines = await binanceMarketService_1.BinanceMarketService.getKlines(symbol, interval, 200);
            const candles = klines.map(k => ({
                openTime: k.openTime,
                closeTime: k.closeTime,
                open: parseFloat(k.open),
                high: parseFloat(k.high),
                low: parseFloat(k.low),
                close: parseFloat(k.close),
                volume: parseFloat(k.volume),
                quoteVolume: 0 // Simplification for now
            }));
            if (candles.length === 0)
                continue;
            latestPrice = candles[candles.length - 1].close;
            latestVolume = candles[candles.length - 1].volume;
            const closes = candles.map(c => c.close);
            // Indicators
            const sma = types_1.INDICATOR_CONFIG.SMA_PERIODS.reduce((acc, p) => ({ ...acc, [p]: indicatorService_1.IndicatorService.sma(closes, p) || 0 }), {});
            const ema = types_1.INDICATOR_CONFIG.EMA_PERIODS.reduce((acc, p) => ({ ...acc, [p]: indicatorService_1.IndicatorService.ema(closes, p) || 0 }), {});
            const rsi = types_1.INDICATOR_CONFIG.RSI_PERIOD ? { [types_1.INDICATOR_CONFIG.RSI_PERIOD]: indicatorService_1.IndicatorService.rsi(closes, types_1.INDICATOR_CONFIG.RSI_PERIOD) || 50 } : {};
            const macd = indicatorService_1.IndicatorService.macd(closes, types_1.INDICATOR_CONFIG.MACD.fast, types_1.INDICATOR_CONFIG.MACD.slow, types_1.INDICATOR_CONFIG.MACD.signal);
            const bollingerBands = indicatorService_1.IndicatorService.bollingerBands(closes, types_1.INDICATOR_CONFIG.BOLLINGER.period, types_1.INDICATOR_CONFIG.BOLLINGER.multiplier);
            const atr = indicatorService_1.IndicatorService.atr(candles, types_1.INDICATOR_CONFIG.ATR_PERIOD) || 0;
            // Classifications
            const { trend, marketCondition } = this.classifyMarket(closes, ema, rsi[types_1.INDICATOR_CONFIG.RSI_PERIOD], macd, bollingerBands);
            const { support, resistance } = candleService_1.CandleService.findSupportResistance(candles);
            const patterns = candleService_1.CandleService.detectPatterns(candles);
            const volumeCondition = candleService_1.CandleService.analyzeVolume(candles);
            const volatility = this.analyzeVolatility(latestPrice, atr);
            timeframes[interval] = {
                timeframe: interval,
                indicators: { sma, ema, rsi, macd, bollingerBands, atr },
                trend,
                marketCondition,
                support,
                resistance,
                patterns,
                volumeCondition,
                volatility
            };
        }
        return {
            symbol,
            timestamp: Date.now(),
            market: {
                price: latestPrice,
                volume24h: latestVolume, // Should use real 24h ticker, but this is a placeholder
                change24h: 0
            },
            timeframes
        };
    },
    classifyMarket(closes, ema, rsi, macd, bb) {
        let trend = 'NEUTRAL';
        let condition = 'RANGING';
        const price = closes[closes.length - 1];
        const ema20 = ema[21] || 0;
        const ema50 = ema[50] || 0;
        const ema200 = ema[200] || 0;
        // Basic Trend Assessment
        if (price > ema20 && ema20 > ema50) {
            trend = 'BULLISH';
        }
        else if (price < ema20 && ema20 < ema50) {
            trend = 'BEARISH';
        }
        // Market Condition Assessment
        const bbWidth = (bb.upper - bb.lower) / bb.middle; // Bollinger bandwidth
        if (bbWidth > 0.1) {
            condition = 'HIGH_VOLATILITY';
        }
        else if (bbWidth < 0.02) {
            condition = 'LOW_VOLATILITY';
        }
        else if (Math.abs(macd.histogram) > 0) {
            condition = 'TRENDING';
        }
        return { trend, marketCondition: condition };
    },
    analyzeVolatility(price, atr) {
        const atrPercentage = (atr / price) * 100;
        let level = 'MEDIUM';
        if (atrPercentage < 1)
            level = 'LOW';
        else if (atrPercentage > 5)
            level = 'EXTREME';
        else if (atrPercentage > 2.5)
            level = 'HIGH';
        return { level, atr, atrPercentage };
    }
};
