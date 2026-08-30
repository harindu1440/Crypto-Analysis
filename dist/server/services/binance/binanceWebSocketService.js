"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.binanceWS = void 0;
const ws_1 = __importDefault(require("ws"));
class BinanceWebSocketService {
    ws = null;
    subscribers = new Set();
    activeStreams = new Set();
    reconnectTimer = null;
    connect() {
        if (this.activeStreams.size === 0)
            return;
        if (this.ws) {
            this.ws.close();
        }
        const streams = Array.from(this.activeStreams).map(s => `${s.toLowerCase()}@ticker`).join('/');
        const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
        this.ws = new ws_1.default(url);
        this.ws.on('open', () => {
            console.log(`Connected to Binance WS: ${streams}`);
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
        });
        this.ws.on('message', (data) => {
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
            }
            catch (e) {
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
    scheduleReconnect() {
        if (!this.reconnectTimer) {
            this.reconnectTimer = setTimeout(() => {
                this.connect();
            }, 5000);
        }
    }
    subscribe(symbols) {
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
    unsubscribe(symbols) {
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
            }
            else {
                this.connect();
            }
        }
    }
    addClient(handler) {
        this.subscribers.add(handler);
    }
    removeClient(handler) {
        this.subscribers.delete(handler);
    }
    broadcast(data) {
        this.subscribers.forEach(handler => handler(data));
    }
}
exports.binanceWS = new BinanceWebSocketService();
