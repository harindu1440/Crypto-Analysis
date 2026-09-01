import { OpportunityService } from '../opportunities/opportunityService';
import { EventBus } from '../system/eventBus';
import { LifecycleService } from '../opportunities/lifecycleService';

export const OpportunityTracker = {
  unsubscribeMarketUpdate: null as (() => void) | null,
  
  start() {
    if (this.unsubscribeMarketUpdate) return;
    console.log('[OpportunityTracker] Started event-driven lifecycle tracker');
    
    // Listen to market updates and revalidate active opportunities
    this.unsubscribeMarketUpdate = EventBus.subscribe('MARKET_UPDATE', (event) => {
      this.revalidateSymbol(event.symbol!);
    });
    
    // Also revalidate on candle close
    EventBus.subscribe('CANDLE_CLOSE', (event) => {
      this.revalidateSymbol(event.symbol!);
    });
  },

  stop() {
    if (this.unsubscribeMarketUpdate) {
      this.unsubscribeMarketUpdate();
      this.unsubscribeMarketUpdate = null;
      console.log('[OpportunityTracker] Stopped event-driven lifecycle tracker');
    }
  },

  revalidateSymbol(symbol: string) {
    const activeOpps = OpportunityService.getActiveOpportunities().filter(o => o.symbol === symbol);
    if (activeOpps.length === 0) return;

    for (const opp of activeOpps) {
      try {
        LifecycleService.revalidate(opp);
      } catch (err: any) {
        console.error(`[OpportunityTracker] Error tracking ${opp.symbol}:`, err.message);
      }
    }
  }
};
