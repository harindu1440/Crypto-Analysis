import { ExecutionService } from '../services/execution/executionService';
import { ExecutionScheduler } from '../services/execution/executionScheduler';
import { BinanceMarketService } from '../services/binance/binanceMarketService';

jest.mock('../services/binance/binanceMarketService');

describe('Execution Service Math & Filters', () => {

  it('normalizes quantity down to nearest step size safely', () => {
    // raw 0.001237 with step 0.0001 -> 0.0012
    const result = ExecutionService.normalizeQuantity(0.001237, 0.0001);
    expect(result).toBe(0.0012);
  });

  it('normalizes price to nearest tick size', () => {
    const result = ExecutionService.normalizePrice(105234.567, 0.1);
    expect(result).toBe(105234.6);
  });

  it('throws error if quantity is below minQty', async () => {
    (BinanceMarketService.getSymbols as jest.Mock).mockResolvedValue([{
      symbol: 'BTCUSDT',
      status: 'TRADING',
      filters: [
        { filterType: 'LOT_SIZE', minQty: '0.001', maxQty: '1000', stepSize: '0.0001' },
        { filterType: 'MIN_NOTIONAL', minNotional: '10' },
        { filterType: 'PRICE_FILTER', tickSize: '0.1' }
      ]
    }]);

    const mockPlan: any = {
      symbol: 'BTCUSDT',
      position: { quantity: 0.0005 },
      entry: { reference: 60000 }
    };

    await expect(ExecutionService.validateAgainstExchangeFilters(mockPlan)).rejects.toThrow(/below exchange minimum/);
  });

  it('throws error if notional is below minNotional', async () => {
    (BinanceMarketService.getSymbols as jest.Mock).mockResolvedValue([{
      symbol: 'BTCUSDT',
      status: 'TRADING',
      filters: [
        { filterType: 'LOT_SIZE', minQty: '0.001', maxQty: '1000', stepSize: '0.0001' },
        { filterType: 'MIN_NOTIONAL', minNotional: '100' }, // 100 USDT minimum
        { filterType: 'PRICE_FILTER', tickSize: '0.1' }
      ]
    }]);

    const mockPlan: any = {
      symbol: 'BTCUSDT',
      position: { quantity: 0.001 },
      entry: { reference: 60000 } // 0.001 * 60000 = 60 USDT Notional < 100 USDT MinNotional
    };

    await expect(ExecutionService.validateAgainstExchangeFilters(mockPlan)).rejects.toThrow(/Notional value.*below exchange minimum/);
  });

  it('validates and returns normalized values correctly', async () => {
    (BinanceMarketService.getSymbols as jest.Mock).mockResolvedValue([{
      symbol: 'BTCUSDT',
      status: 'TRADING',
      filters: [
        { filterType: 'LOT_SIZE', minQty: '0.001', maxQty: '1000', stepSize: '0.0001' },
        { filterType: 'MIN_NOTIONAL', minNotional: '10' }, 
        { filterType: 'PRICE_FILTER', tickSize: '0.1' }
      ]
    }]);

    const mockPlan: any = {
      symbol: 'BTCUSDT',
      position: { quantity: 0.01538 },
      entry: { reference: 60000.123 } 
    };

    const res = await ExecutionService.validateAgainstExchangeFilters(mockPlan);
    expect(res.normalizedQuantity).toBe(0.0153);
    expect(res.normalizedPrice).toBe(60000.1);
  });
});

describe('Execution Scheduler State', () => {
  beforeEach(() => {
    ExecutionScheduler.scheduledPlans.clear();
    ExecutionScheduler.executionState.clear();
    ExecutionScheduler.executionLocks.clear();
  });

  it('prevents scheduling an invalid plan', () => {
    const invalidPlan: any = { validation: { status: 'REJECTED' } };
    expect(() => ExecutionScheduler.schedulePlan(invalidPlan, Date.now() + 10000)).toThrow(/invalid plan/);
  });

  it('prevents scheduling an expired plan', () => {
    const expiredPlan: any = { validation: { status: 'VALID' }, expiresAt: Date.now() - 10000 };
    expect(() => ExecutionScheduler.schedulePlan(expiredPlan, Date.now() + 10000)).toThrow(/expired plan/);
  });

  it('schedules successfully and cancels successfully', () => {
    const validPlan: any = { planId: '123', symbol: 'BTCUSDT', validation: { status: 'VALID' }, expiresAt: Date.now() + 10000 };
    ExecutionScheduler.schedulePlan(validPlan, Date.now() + 5000);
    expect(ExecutionScheduler.getUpcomingPlans().length).toBe(1);
    
    ExecutionScheduler.cancelPlan('123');
    expect(ExecutionScheduler.getUpcomingPlans().length).toBe(0);
  });
});
