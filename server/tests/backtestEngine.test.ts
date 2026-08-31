import { BacktestEngine } from '../services/backtest/backtestEngine';
import { HistoricalDataService, OHLCV } from '../services/backtest/historicalDataService';
import { TradeOpportunity } from '../services/opportunities/types';

describe('Backtest Engine', () => {
  beforeAll(() => {
    // Mock HistoricalDataService
    jest.spyOn(HistoricalDataService, 'getHistoricalData').mockImplementation(
      async (symbol, interval, start, end): Promise<OHLCV[]> => {
        // Simple synthetic candle stream
        return [
          { time: start + 1000, open: 100, high: 105, low: 95, close: 102, volume: 100 },
          { time: start + 2000, open: 102, high: 108, low: 101, close: 105, volume: 100 },
          { time: start + 3000, open: 105, high: 120, low: 104, close: 115, volume: 100 }
        ];
      }
    );
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should correctly simulate a LONG WIN', async () => {
    const opp: any = {
      id: 'test-long-win',
      symbol: 'BTCUSDT',
      direction: 'LONG',
      timeframe: '15m',
      entryZone: { min: 99, max: 101 },
      stopLoss: 90,
      takeProfitTargets: [110],
      createdAt: 1000,
      expiresAt: 5000,
      qualityScore: 90
    };

    const res = await BacktestEngine.runBacktest(opp, 0, 0); // 0 fees/slippage
    
    // Entry should trigger on candle 1 because low 95 <= entryMax 101
    // Win should trigger on candle 3 because high 120 >= takeProfit 110
    expect(res.outcome).toBe('WIN');
    expect(res.rMultiple).toBeCloseTo(0.818, 2); // Risk = 101 - 90 = 11. Reward = 110 - 101 = 9. 9/11 = 0.818
  });

  it('should correctly handle EXPIRED', async () => {
    const opp: any = {
      id: 'test-expired',
      symbol: 'BTCUSDT',
      direction: 'LONG',
      timeframe: '15m',
      entryZone: { min: 80, max: 85 }, // Price never drops this low in synthetic stream
      stopLoss: 70,
      takeProfitTargets: [110],
      createdAt: 1000,
      expiresAt: 2500, // Expires after candle 2
      qualityScore: 90
    };

    const res = await BacktestEngine.runBacktest(opp, 0, 0);
    
    expect(res.outcome).toBe('EXPIRED');
    expect(res.exitTime).toBe(3000); // Expiration triggered when checking candle 3
  });
});
