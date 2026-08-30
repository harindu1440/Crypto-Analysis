"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./server/app");
const http_1 = __importDefault(require("http"));
const ws_1 = require("ws");
const binanceWebSocketService_1 = require("./server/services/binance/binanceWebSocketService");
const database_1 = require("./server/config/database");
require("./server/services/execution/reconciliationService");
require("./server/services/execution/protectionService");
require("./server/services/execution/positionManager");
database_1.LocalDatabase.initialize();
const PORT = Number(process.env.SERVER_PORT) || Number(process.env.PORT) || 3000;
const server = http_1.default.createServer(app_1.app);
// Initialize Local WebSocket Server for Frontend
const wss = new ws_1.WebSocketServer({ server });
wss.on('connection', (ws) => {
    console.log('Client connected to local WebSocket');
    const handler = (data) => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'MARKET_UPDATE', data }));
        }
    };
    // Add the client to binanceWS broadcasters
    binanceWebSocketService_1.binanceWS.addClient(handler);
    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message.toString());
            if (msg.type === 'SUBSCRIBE' && Array.isArray(msg.symbols)) {
                binanceWebSocketService_1.binanceWS.subscribe(msg.symbols);
            }
            else if (msg.type === 'UNSUBSCRIBE' && Array.isArray(msg.symbols)) {
                binanceWebSocketService_1.binanceWS.unsubscribe(msg.symbols);
            }
        }
        catch (e) {
            console.error('Invalid WS message from client', e);
        }
    });
    ws.on('close', () => {
        console.log('Client disconnected');
        binanceWebSocketService_1.binanceWS.removeClient(handler);
    });
});
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
