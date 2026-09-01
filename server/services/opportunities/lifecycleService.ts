import { TradeOpportunity, OpportunityStatus } from './types';
import { EventBus } from '../system/eventBus';
import { MarketStateService } from '../market/marketStateService';
import { OpportunityService } from './opportunityService';

export const LifecycleService = {
  
  validateTransition(from: OpportunityStatus, to: OpportunityStatus): boolean {
    const validTransitions: Record<OpportunityStatus, OpportunityStatus[]> = {
      'DETECTED': ['ANALYZING', 'REJECTED', 'NO_TRADE', 'INVALIDATED', 'EXPIRED'],
      'ANALYZING': ['VALIDATING', 'REJECTED', 'NO_TRADE', 'INVALIDATED', 'EXPIRED'],
      'VALIDATING': ['QUALIFIED', 'REJECTED', 'NO_TRADE', 'INVALIDATED', 'EXPIRED'],
      'QUALIFIED': ['APPROACHING_ENTRY', 'INVALIDATED', 'EXPIRED', 'CANCELLED'],
      'APPROACHING_ENTRY': ['ENTRY_TRIGGERED', 'QUALIFIED', 'INVALIDATED', 'EXPIRED', 'CANCELLED'],
      'ENTRY_TRIGGERED': ['EXECUTION_READY', 'INVALIDATED', 'EXPIRED', 'CANCELLED'],
      'EXECUTION_READY': ['POSITION_OPEN', 'INVALIDATED', 'EXPIRED', 'CANCELLED', 'REJECTED'],
      'POSITION_OPEN': ['POSITION_CLOSING', 'CLOSED'],
      'POSITION_CLOSING': ['CLOSED'],
      'CLOSED': [],
      'REJECTED': [],
      'EXPIRED': [],
      'INVALIDATED': [],
      'CANCELLED': [],
      'NO_TRADE': []
    };
    
    return validTransitions[from]?.includes(to) || false;
  },

  transition(opp: TradeOpportunity, to: OpportunityStatus, reason: string): boolean {
    if (!this.validateTransition(opp.status, to)) {
      console.warn(`[LifecycleService] Invalid transition attempted: ${opp.status} -> ${to} for ${opp.symbol}`);
      return false;
    }
    
    const from = opp.status;
    opp.status = to;
    opp.version += 1;
    opp.updatedAt = Date.now();
    
    // Dispatch state change event
    EventBus.publish({
      eventType: to === 'INVALIDATED' ? 'OPPORTUNITY_INVALIDATED' : 
                 to === 'APPROACHING_ENTRY' ? 'OPPORTUNITY_APPROACHING' : 
                 to === 'ENTRY_TRIGGERED' ? 'ENTRY_TRIGGERED' : 'OPPORTUNITY_UPDATED',
      source: 'LifecycleService',
      symbol: opp.symbol,
      payload: {
        opportunityId: opp.id,
        from,
        to,
        reason
      }
    });
    
    // Persist to database
    OpportunityService.updateOpportunity(opp);
    
    return true;
  },

  revalidate(opp: TradeOpportunity) {
    // Only revalidate active, pre-execution states
    if (!['QUALIFIED', 'APPROACHING_ENTRY', 'ENTRY_TRIGGERED'].includes(opp.status)) return;
    
    if (Date.now() > opp.expiresAt) {
      this.transition(opp, 'EXPIRED', 'Opportunity reached expiration time');
      return;
    }

    const marketState = MarketStateService.getSnapshot(opp.symbol);
    if (!marketState || marketState.connectionStatus === 'OFFLINE') return; // Wait for data to return
    
    const price = marketState.price;
    
    // Check invalidation condition (SL hit before entry)
    if (opp.direction === 'LONG' && price <= opp.stopLoss) {
      this.transition(opp, 'INVALIDATED', `Price hit stop loss (${opp.stopLoss}) before entry`);
      return;
    }
    
    if (opp.direction === 'SHORT' && price >= opp.stopLoss) {
      this.transition(opp, 'INVALIDATED', `Price hit stop loss (${opp.stopLoss}) before entry`);
      return;
    }
    
    // Check Entry Proximity
    const minEntry = Math.min(opp.entryZone.min, opp.entryZone.max);
    const maxEntry = Math.max(opp.entryZone.min, opp.entryZone.max);
    
    const entryDistance = opp.direction === 'LONG' ? (price - maxEntry) / maxEntry : (minEntry - price) / minEntry;
    
    if (entryDistance > 0 && entryDistance < 0.005) { // within 0.5% of entry
      if (opp.status === 'QUALIFIED') {
        this.transition(opp, 'APPROACHING_ENTRY', 'Price is approaching the entry zone');
      }
    }
    
    // Check Entry Trigger (Zone Touch)
    if (price >= minEntry && price <= maxEntry) {
      if (opp.status === 'QUALIFIED' || opp.status === 'APPROACHING_ENTRY') {
        this.transition(opp, 'ENTRY_TRIGGERED', `Price touched entry zone (${price})`);
      }
    }
  }
};
