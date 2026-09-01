"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeMarketEventService = void 0;
const binanceWebSocketService_1 = require("../binance/binanceWebSocketService");
const eventBus_1 = require("../system/eventBus");
exports.RealtimeMarketEventService = {
    initialize() {
        binanceWebSocketService_1.binanceWS.addClient((data) => this.handleMessage(data));
        console.log('[RealtimeMarketEventService] Initialized and listening to WS streams');
    },
    handleMessage(data) {
        if (!data.symbol)
            return;
        const symbol = data.symbol.toUpperCase();
        if (data.type === 'ticker') {
            eventBus_1.EventBus.publish({
                eventType: 'MARKET_UPDATE',
                source: 'RealtimeMarketEventService',
                symbol,
                payload: {
                    price: parseFloat(data.price),
                    priceChange: parseFloat(data.priceChange),
                    priceChangePercent: parseFloat(data.priceChangePercent),
                    volume24h: parseFloat(data.volume24h),
                    timestamp: data.timestamp
                }
            });
        }
        else if (data.type === 'kline') {
            const kline = data.kline;
            // Emit generic market update for price from kline if we want
            // Emit CANDLE_CLOSE when a candle is officially closed
            if (kline.isClosed) {
                eventBus_1.EventBus.publish({
                    eventType: 'CANDLE_CLOSE',
                    source: 'RealtimeMarketEventService',
                    symbol,
                    payload: {
                        interval: kline.interval,
                        open: kline.open,
                        high: kline.high,
                        low: kline.low,
                        close: kline.close,
                        volume: kline.volume,
                        startTime: kline.startTime,
                        closeTime: kline.closeTime,
                        timestamp: data.timestamp
                    }
                });
            }
        }
    },
    startMonitoring(symbols) {
        // Ticker stream
        binanceWebSocketService_1.binanceWS.subscribe(symbols);
        // Kline streams for multi-timeframe
        binanceWebSocketService_1.binanceWS.subscribeKlines(symbols, ['1m', '5m', '15m', '1h', '4h', '1d']);
    },
    stopMonitoring(symbols) {
        binanceWebSocketService_1.binanceWS.unsubscribe(symbols);
    }
};
