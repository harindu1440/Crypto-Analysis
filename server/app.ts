import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';

const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Often disabled for simple SPA setups, configure as needed for production
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// API Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Binance Market Routes
import { BinanceMarketService } from './services/binance/binanceMarketService';

app.get('/api/markets/symbols', async (req, res) => {
  try {
    const symbols = await BinanceMarketService.getSymbols();
    res.json(symbols);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/markets/ticker/:symbol', async (req, res) => {
  try {
    const ticker = await BinanceMarketService.getTicker(req.params.symbol);
    res.json(ticker);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/markets/24hr/:symbol', async (req, res) => {
  try {
    const ticker = await BinanceMarketService.getTicker(req.params.symbol); // 24hr ticker is the same
    res.json(ticker);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/markets/klines/:symbol', async (req, res) => {
  try {
    const interval = (req.query.interval as string) || '1h';
    const limit = Number(req.query.limit) || 24;
    const klines = await BinanceMarketService.getKlines(req.params.symbol, interval, limit);
    res.json(klines);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend static files
const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

// SPA Fallback - Catch-all route to serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

export { app };
