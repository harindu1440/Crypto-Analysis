
import { LifecycleService } from '../services/opportunities/lifecycleService';
import { MarketStateService } from '../services/market/marketStateService';

describe('Phase 20: Opportunity Lifecycle 2.0', () => {
  it('Should transition through states correctly', () => {
    const opp = {
      id: 'test_opp_1',
      symbol: 'BTCUSDT',
      direction: 'LONG',
      status: 'DETECTED',
      version: 1,
      updatedAt: Date.now()
    } as any;
    
    // Valid transition
    let success = LifecycleService.transition(opp, 'ANALYZING', 'AI Started');
    expect(success).toBe(true);
    expect(opp.status).toBe('ANALYZING');
    expect(opp.version).toBe(2);
    
    // Invalid transition (ANALYZING -> POSITION_OPEN directly)
    success = LifecycleService.transition(opp, 'POSITION_OPEN', 'Skip steps');
    expect(success).toBe(false);
    expect(opp.status).toBe('ANALYZING'); // unchanged
  });

  it('Should invalidate LONG opportunity if Stop Loss is hit before entry', () => {
    const opp = {
      id: 'test_opp_2',
      symbol: 'ETHUSDT',
      direction: 'LONG',
      status: 'QUALIFIED',
      entryZone: { min: 3000, max: 3100 },
      stopLoss: 2900,
      expiresAt: Date.now() + 100000,
      version: 1
    } as any;
    
    // Mock Market State dropped to 2850 (Below SL)
    MarketStateService.updateState('ETHUSDT', { price: 2850 });
    
    LifecycleService.revalidate(opp);
    
    expect(opp.status).toBe('INVALIDATED');
  });

  it('Should trigger ENTRY_TRIGGERED when price touches entry zone', () => {
    const opp = {
      id: 'test_opp_3',
      symbol: 'SOLUSDT',
      direction: 'SHORT',
      status: 'APPROACHING_ENTRY',
      entryZone: { min: 140, max: 145 },
      stopLoss: 150,
      expiresAt: Date.now() + 100000,
      version: 1
    } as any;
    
    // Mock Market State touches entry
    MarketStateService.updateState('SOLUSDT', { price: 142 });
    
    LifecycleService.revalidate(opp);
    
    expect(opp.status).toBe('ENTRY_TRIGGERED');
  });
});
