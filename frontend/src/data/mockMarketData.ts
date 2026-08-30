import type { MarketAsset, MarketSummary, Signal } from '../types';

export const mockMarketSummary: MarketSummary = {
  totalMarketCap: '$1.82T',
  volume24h: '$64.2B',
  btcDominance: 52.4,
  marketSentiment: 'Bullish'
};

const generateSparkline = (startPoint: number, trend: 'up' | 'down' | 'neutral') => {
  const points = [startPoint];
  let current = startPoint;
  for (let i = 1; i < 20; i++) {
    const volatility = current * 0.02;
    let change = (Math.random() - 0.5) * volatility;
    if (trend === 'up') change += volatility * 0.2;
    if (trend === 'down') change -= volatility * 0.2;
    current += change;
    points.push(current);
  }
  return points;
};

export const mockAssets: MarketAsset[] = [
  { symbol: 'BTC/USDT', name: 'Bitcoin', price: 64230.50, change24h: 2.4, volume24h: 28400000000, sparkline: generateSparkline(62000, 'up') },
  { symbol: 'ETH/USDT', name: 'Ethereum', price: 3450.20, change24h: 1.8, volume24h: 12100000000, sparkline: generateSparkline(3300, 'up') },
  { symbol: 'BNB/USDT', name: 'Binance Coin', price: 590.10, change24h: -0.5, volume24h: 1200000000, sparkline: generateSparkline(600, 'down') },
  { symbol: 'SOL/USDT', name: 'Solana', price: 145.80, change24h: 5.2, volume24h: 2800000000, sparkline: generateSparkline(135, 'up') },
  { symbol: 'XRP/USDT', name: 'Ripple', price: 0.58, change24h: -1.2, volume24h: 980000000, sparkline: generateSparkline(0.60, 'down') },
  { symbol: 'ADA/USDT', name: 'Cardano', price: 0.45, change24h: 0.5, volume24h: 450000000, sparkline: generateSparkline(0.44, 'neutral') },
  { symbol: 'DOGE/USDT', name: 'Dogecoin', price: 0.15, change24h: -3.4, volume24h: 1800000000, sparkline: generateSparkline(0.16, 'down') },
];

export const mockSignals: Signal[] = [
  { symbol: 'BTC/USDT', action: 'BUY', confidence: 78, timeframe: '1H' },
  { symbol: 'ETH/USDT', action: 'NEUTRAL', confidence: 54, timeframe: '4H' },
  { symbol: 'SOL/USDT', action: 'SELL', confidence: 71, timeframe: '15M' },
  { symbol: 'BNB/USDT', action: 'BUY', confidence: 65, timeframe: '1D' },
];
