import WebSocket from 'ws';

type WsMessageHandler = (data: any) => void;

class BinanceWebSocketService {
  private ws: WebSocket | null = null;
  private subscribers: Set<WsMessageHandler> = new Set();
  private activeStreams: Set<string> = new Set();
  private reconnectTimer: NodeJS.Timeout | null = null;

  private connect() {
    if (this.activeStreams.size === 0) return;
    
    if (this.ws) {
      this.ws.close();
    }

    const streams = Array.from(this.activeStreams).map(s => `${s.toLowerCase()}@ticker`).join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log(`Connected to Binance WS: ${streams}`);
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.data) {
          // Normalize the data
          const normalized = {
            stream: parsed.stream,
            symbol: parsed.data.s,
            price: parsed.data.c,
            priceChange: parsed.data.p,
            priceChangePercent: parsed.data.P,
            volume24h: parsed.data.v,
            timestamp: parsed.data.E
          };
          this.broadcast(normalized);
        }
      } catch (e) {
        console.error('Error parsing Binance WS message', e);
      }
    });

    this.ws.on('close', () => {
      console.log('Binance WS Closed. Reconnecting in 5s...');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('Binance WS Error:', err.message);
      this.ws?.close();
    });
  }

  private scheduleReconnect() {
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, 5000);
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

  public unsubscribe(symbols: string[]) {
    let changed = false;
    symbols.forEach(s => {
      if (this.activeStreams.has(s)) {
        this.activeStreams.delete(s);
        changed = true;
      }
    });
    if (changed) {
      if (this.activeStreams.size === 0 && this.ws) {
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
