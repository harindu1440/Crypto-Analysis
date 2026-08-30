import 'dotenv/config';
import { app } from './server/app';
import http from 'http';
import { WebSocketServer } from 'ws';
import { binanceWS } from './server/services/binance/binanceWebSocketService';

const PORT = Number(process.env.SERVER_PORT) || Number(process.env.PORT) || 3000;

const server = http.createServer(app);

// Initialize Local WebSocket Server for Frontend
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('Client connected to local WebSocket');

  const handler = (data: any) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'MARKET_UPDATE', data }));
    }
  };

  // Add the client to binanceWS broadcasters
  binanceWS.addClient(handler);

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());
      if (msg.type === 'SUBSCRIBE' && Array.isArray(msg.symbols)) {
        binanceWS.subscribe(msg.symbols);
      } else if (msg.type === 'UNSUBSCRIBE' && Array.isArray(msg.symbols)) {
        binanceWS.unsubscribe(msg.symbols);
      }
    } catch (e) {
      console.error('Invalid WS message from client', e);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    binanceWS.removeClient(handler);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
