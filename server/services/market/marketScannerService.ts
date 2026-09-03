import { BinanceMarketService } from '../binance/binanceMarketService';
import { AccountSyncService } from '../account/accountSyncService';

export interface ScannerCandidate {
  symbol: string;
  price: number;
  volume24h: number;
  quoteVolume24h: number;
  priceChangePercent: number;
  score: number;
  reasons: string[];
}

export const MarketScannerService = {
  /**
   * Performs a zero-AI deterministic scan of all available Binance pairs.
   * Returns the top N candidates sorted by a calculated momentum/liquidity score.
   */
  async getTopCandidates(limit: number = 5): Promise<ScannerCandidate[]> {
    console.log('[MarketScanner] Starting zero-AI pre-filter scan...');
    
    // 1. Get all trading symbols with filters
    const symbols = await BinanceMarketService.getSymbols();
    const symbolMap = new Map<string, any>();
    symbols.forEach(s => symbolMap.set(s.symbol, s));

    // 2. Get all 24h tickers
    const allTickers = await BinanceMarketService.getAllTickers();
    
    // 3. Resolve user account equity for capital-aware filtering
    let availableEquity = 50; // Default fallback
    try {
      availableEquity = AccountSyncService.getAvailableBalance('USDT');
      if (availableEquity <= 0) availableEquity = 50; // fallback if error
    } catch {
      // Fallback
    }

    const maxRiskAmount = availableEquity * 0.05; // Assume max 5% risk per trade for filter

    const candidates: ScannerCandidate[] = [];

    for (const ticker of allTickers) {
      const symbolInfo = symbolMap.get(ticker.symbol);
      if (!symbolInfo) continue; // Not a valid trading USDT pair

      const price = parseFloat(ticker.lastPrice);
      const volume24h = parseFloat(ticker.volume);
      const quoteVolume24h = parseFloat(ticker.quoteVolume);
      const priceChangePercent = parseFloat(ticker.priceChangePercent);

      // Capital-Aware Filter: Min Notional Check
      const minNotionalFilter = symbolInfo.filters.find((f: any) => f.filterType === 'MIN_NOTIONAL' || f.filterType === 'NOTIONAL');
      let minNotional = 10; // Binance default is usually 5 or 10
      if (minNotionalFilter && minNotionalFilter.minNotional) {
        minNotional = parseFloat(minNotionalFilter.minNotional);
      }
      
      // If the user's available equity is less than the minimum order size, reject
      if (availableEquity < minNotional) {
        continue;
      }

      // Liquidity Filter
      if (quoteVolume24h < 5000000) { // Require at least $5m 24h volume
        continue;
      }

      // Volatility Filter - must move at least 1% to be worth trading
      if (Math.abs(priceChangePercent) < 1.0) {
        continue;
      }

      // Calculate Deterministic Score
      // Weights:
      // Volume: log10 of quote volume (maxes out around ~8-9 for highly liquid)
      // Momentum: absolute price change %
      const volumeScore = Math.log10(quoteVolume24h) * 2; 
      const momentumScore = Math.min(Math.abs(priceChangePercent), 20); // Cap at 20%
      const score = volumeScore + momentumScore;

      const reasons: string[] = [];
      if (momentumScore > 5) reasons.push('High Momentum');
      if (quoteVolume24h > 100000000) reasons.push('High Liquidity');
      
      candidates.push({
        symbol: ticker.symbol,
        price,
        volume24h,
        quoteVolume24h,
        priceChangePercent,
        score,
        reasons
      });
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    const top = candidates.slice(0, limit);
    console.log(`[MarketScanner] Selected top ${top.length} candidates from ${candidates.length} eligible pairs.`);
    return top;
  }
};
