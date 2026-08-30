export interface MarketAsset {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  sparkline: number[];
}

export interface MarketSummary {
  totalMarketCap: string;
  volume24h: string;
  btcDominance: number;
  marketSentiment: 'Bullish' | 'Bearish' | 'Neutral';
}

export interface Signal {
  symbol: string;
  action: 'BUY' | 'SELL' | 'NEUTRAL';
  confidence: number;
  timeframe: string;
}
