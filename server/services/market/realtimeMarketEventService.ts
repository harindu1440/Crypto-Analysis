import { binanceWS } from '../binance/binanceWebSocketService';
import { EventBus } from '../system/eventBus';

export const RealtimeMarketEventService = {
  
  initialize() {
    binanceWS.addClient((data) => this.handleMessage(data));
    console.log('[RealtimeMarketEventService] Initialized and listening to WS streams');
  },

  handleMessage(data: any) {
    if (!data.symbol) return;
    const symbol = data.symbol.toUpperCase();

    if (data.type === 'ticker') {
      EventBus.publish({
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
    } else if (data.type === 'kline') {
      const kline = data.kline;
      // Emit generic market update for price from kline if we want
      
      // Emit CANDLE_CLOSE when a candle is officially closed
      if (kline.isClosed) {
        EventBus.publish({
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

  startMonitoring(symbols: string[]) {
    // Ticker stream
    binanceWS.subscribe(symbols);
    // Kline streams for multi-timeframe
    binanceWS.subscribeKlines(symbols, ['1m', '5m', '15m', '1h', '4h', '1d']);
  },

  stopMonitoring(symbols: string[]) {
    binanceWS.unsubscribe(symbols);
  }
};
