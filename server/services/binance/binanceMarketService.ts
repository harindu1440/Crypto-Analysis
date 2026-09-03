import { BinanceSymbol, BinanceTicker, BinanceKline } from './types';

const BASE_URL = 'https://api.binance.com/api/v3';

export const BinanceMarketService = {
  async getSymbols(): Promise<BinanceSymbol[]> {
    const response = await fetch(`${BASE_URL}/exchangeInfo`);
    if (!response.ok) throw new Error('Failed to fetch Binance symbols');
    const data = await response.json();
    return data.symbols
      .filter((s: any) => s.status === 'TRADING' && s.quoteAsset === 'USDT')
      .map((s: any) => ({
        symbol: s.symbol,
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset,
        status: s.status,
        filters: s.filters || [],
      }));
  },

  async getTicker(symbol: string): Promise<BinanceTicker> {
    const response = await fetch(`${BASE_URL}/ticker/24hr?symbol=${symbol.toUpperCase()}`);
    if (!response.ok) throw new Error(`Failed to fetch ticker for ${symbol}`);
    return await response.json();
  },

  async getAllTickers(): Promise<BinanceTicker[]> {
    const response = await fetch(`${BASE_URL}/ticker/24hr`);
    if (!response.ok) throw new Error(`Failed to fetch all tickers`);
    return await response.json();
  },


  async getKlines(symbol: string, interval: string = '1h', limit: number = 24): Promise<BinanceKline[]> {
    const response = await fetch(`${BASE_URL}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`);
    if (!response.ok) throw new Error(`Failed to fetch klines for ${symbol}`);
    const data = await response.json();
    return data.map((d: any[]) => ({
      openTime: d[0],
      open: d[1],
      high: d[2],
      low: d[3],
      close: d[4],
      volume: d[5],
      closeTime: d[6],
      quoteVolume: d[7]
    }));
  }
};
