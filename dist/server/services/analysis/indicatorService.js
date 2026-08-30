"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IndicatorService = void 0;
exports.IndicatorService = {
    sma(data, period) {
        if (data.length < period)
            return null;
        const slice = data.slice(-period);
        const sum = slice.reduce((a, b) => a + b, 0);
        return sum / period;
    },
    ema(data, period) {
        if (data.length < period)
            return null;
        const k = 2 / (period + 1);
        // Start with SMA for the initial value
        let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
        // Calculate EMA for the rest of the array
        for (let i = period; i < data.length; i++) {
            ema = (data[i] * k) + (ema * (1 - k));
        }
        return ema;
    },
    rsi(data, period) {
        if (data.length <= period)
            return null;
        let gains = 0;
        let losses = 0;
        // Calculate initial average gain/loss
        for (let i = 1; i <= period; i++) {
            const difference = data[i] - data[i - 1];
            if (difference >= 0) {
                gains += difference;
            }
            else {
                losses -= difference;
            }
        }
        let avgGain = gains / period;
        let avgLoss = losses / period;
        // Smoothed RSI for the remaining data
        for (let i = period + 1; i < data.length; i++) {
            const difference = data[i] - data[i - 1];
            if (difference >= 0) {
                avgGain = (avgGain * (period - 1) + difference) / period;
                avgLoss = (avgLoss * (period - 1)) / period;
            }
            else {
                avgGain = (avgGain * (period - 1)) / period;
                avgLoss = (avgLoss * (period - 1) - difference) / period;
            }
        }
        if (avgLoss === 0)
            return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    },
    macd(data, fast, slow, signalPeriod) {
        if (data.length < slow + signalPeriod)
            return { macdLine: 0, signalLine: 0, histogram: 0 };
        const macdLineArr = [];
        // We need to calculate MACD line for enough periods to get the signal EMA
        for (let i = slow; i <= data.length; i++) {
            const slice = data.slice(0, i);
            const fastEma = this.ema(slice, fast);
            const slowEma = this.ema(slice, slow);
            if (fastEma !== null && slowEma !== null) {
                macdLineArr.push(fastEma - slowEma);
            }
        }
        if (macdLineArr.length < signalPeriod)
            return { macdLine: 0, signalLine: 0, histogram: 0 };
        const macdLine = macdLineArr[macdLineArr.length - 1];
        const signalLine = this.ema(macdLineArr, signalPeriod) || 0;
        const histogram = macdLine - signalLine;
        return { macdLine, signalLine, histogram };
    },
    bollingerBands(data, period, multiplier) {
        const middle = this.sma(data, period);
        if (middle === null)
            return { upper: 0, middle: 0, lower: 0 };
        const slice = data.slice(-period);
        const variance = slice.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) / period;
        const stdDev = Math.sqrt(variance);
        return {
            upper: middle + (stdDev * multiplier),
            middle: middle,
            lower: middle - (stdDev * multiplier)
        };
    },
    atr(candles, period) {
        if (candles.length <= period)
            return null;
        const trueRanges = [];
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;
            const tr1 = high - low;
            const tr2 = Math.abs(high - prevClose);
            const tr3 = Math.abs(low - prevClose);
            trueRanges.push(Math.max(tr1, tr2, tr3));
        }
        // Basic Wilder's Smoothing for ATR
        let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
        for (let i = period; i < trueRanges.length; i++) {
            atr = ((atr * (period - 1)) + trueRanges[i]) / period;
        }
        return atr;
    }
};
