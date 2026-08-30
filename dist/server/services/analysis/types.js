"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INDICATOR_CONFIG = void 0;
exports.INDICATOR_CONFIG = {
    SMA_PERIODS: [20, 50, 200],
    EMA_PERIODS: [9, 21, 50, 200],
    RSI_PERIOD: 14,
    MACD: { fast: 12, slow: 26, signal: 9 },
    BOLLINGER: { period: 20, multiplier: 2 },
    ATR_PERIOD: 14
};
