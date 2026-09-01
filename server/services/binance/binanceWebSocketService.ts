import WebSocket from 'ws';

type WsMessageHandler = (data: any) => void;

class BinanceWebSocketService {
  private ws: WebSocket | null = null;
  private subscribers: Set<WsMessageHandler> = new Set();
  private activeStreams: Set<string> = new Set();
  private activeKlineStreams: Set<string> = new Set(); // e.g. btcusdt@kline_1m
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  public status: 'OFFLINE' | 'CONNECTING' | 'LIVE' = 'OFFLINE';

  private connect() {
    if (this.activeStreams.size === 0 && this.activeKlineStreams.size === 0) return;
    
    if (this.ws) {
      this.ws.close();
    }
    
    this.status = 'CONNECTING';

    const streams = [
      ...Array.from(this.activeStreams).map(s => `${s.toLowerCase()}@ticker`),
      ...Array.from(this.activeKlineStreams).map(s => s.toLowerCase())
    ].join('/');
    
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log(`Connected to Binance WS: ${streams}`);
      this.status = 'LIVE';
      this.reconnectAttempts = 0;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.startHeartbeat();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.data) {
          // Detect stream type (ticker vs kline)
          if (parsed.stream.includes('@ticker')) {
            const normalized = {
              type: 'ticker',
              stream: parsed.stream,
              symbol: parsed.data.s,
              price: parsed.data.c,
              priceChange: parsed.data.p,
              priceChangePercent: parsed.data.P,
              volume24h: parsed.data.v,
              timestamp: parsed.data.E
            };
            this.broadcast(normalized);
          } else if (parsed.stream.includes('@kline_')) {
            const normalized = {
              type: 'kline',
              stream: parsed.stream,
              symbol: parsed.data.s,
              kline: {
                startTime: parsed.data.k.t,
                closeTime: parsed.data.k.T,
                interval: parsed.data.k.i,
                open: parseFloat(parsed.data.k.o),
                high: parseFloat(parsed.data.k.h),
                low: parseFloat(parsed.data.k.l),
                close: parseFloat(parsed.data.k.c),
                volume: parseFloat(parsed.data.k.v),
                isClosed: parsed.data.k.x,
              },
              timestamp: parsed.data.E
            };
            this.broadcast(normalized);
          }
        }
      } catch (e) {
        console.error('Error parsing Binance WS message', e);
      }
    });

    this.ws.on('close', () => {
      console.log('Binance WS Closed.');
      this.status = 'OFFLINE';
      this.stopHeartbeat();
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('Binance WS Error:', err.message);
      this.ws?.close();
    });
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max Binance WS reconnect attempts reached. Waiting for manual intervention or full system restart.');
      return;
    }

    if (!this.reconnectTimer) {
      // Exponential backoff: 1s, 2s, 4s, 8s, up to 30s
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      this.reconnectAttempts++;
      
      console.log(`Scheduling Binance WS reconnect attempt ${this.reconnectAttempts} in ${delay}ms...`);
      
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, delay);
    }
  }

  public subscribe(symbols: string[]) {
    let changed = false;
    symbols.forEach(s => {
      if (!this.activeStreams.has(s)) {
        this.activeStreams.add(s);
        changed = true;
      }
    });
    if (changed) {
      this.connect();
    }
  }
  
  public subscribeKlines(symbols: string[], intervals: string[] = ['1m', '5m', '15m', '1h', '4h', '1d']) {
    let changed = false;
    symbols.forEach(s => {
      intervals.forEach(i => {
        const stream = `${s.toLowerCase()}@kline_${i}`;
        if (!this.activeKlineStreams.has(stream)) {
          this.activeKlineStreams.add(stream);
          changed = true;
        }
      });
    });
    if (changed) {
      this.connect();
    }
  }

  public unsubscribe(symbols: string[]) {
    let changed = false;
    symbols.forEach(s => {
      if (this.activeStreams.has(s)) {
        this.activeStreams.delete(s);
        changed = true;
      }
      // Unsubscribe all klines for symbol
      Array.from(this.activeKlineStreams).forEach(stream => {
        if (stream.startsWith(s.toLowerCase() + '@kline_')) {
          this.activeKlineStreams.delete(stream);
          changed = true;
        }
      });
    });
    if (changed) {
      if (this.activeStreams.size === 0 && this.activeKlineStreams.size === 0 && this.ws) {
        this.ws.close();
        this.ws = null;
      } else {
        this.connect();
      }
    }
  }

  public addClient(handler: WsMessageHandler) {
    this.subscribers.add(handler);
  }

  public removeClient(handler: WsMessageHandler) {
    this.subscribers.delete(handler);
  }

  private broadcast(data: any) {
    this.subscribers.forEach(handler => handler(data));
  }
}

export const binanceWS = new BinanceWebSocketService();
