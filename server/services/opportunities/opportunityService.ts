import { LocalDatabase } from '../../config/database';
import { TradeOpportunity } from './types';
import { AlertService } from '../system/alertService';

export const OpportunityService = {
  getOpportunities(): TradeOpportunity[] {
    return LocalDatabase.get('opportunities') || [];
  },

  getActiveOpportunities(): TradeOpportunity[] {
    return this.getOpportunities().filter(o => 
      !['EXPIRED', 'INVALIDATED', 'COMPLETED'].includes(o.status)
    );
  },

  addOpportunity(opportunity: TradeOpportunity) {
    const opps = this.getOpportunities();
    
    // Deduplication logic based on symbol, direction, and timeframe
    const existing = opps.find(o => 
      o.symbol === opportunity.symbol && 
      o.direction === opportunity.direction &&
      o.timeframe === opportunity.timeframe &&
      ['DETECTED', 'VALIDATED', 'ACTIVE'].includes(o.status)
    );

    if (existing) {
      // Update existing instead of spamming
      Object.assign(existing, opportunity, { id: existing.id, createdAt: existing.createdAt });
      LocalDatabase.set('opportunities', opps);
      console.log(`[Opportunity] Updated existing opportunity for ${opportunity.symbol}`);
      return existing;
    }

    opps.unshift(opportunity);
    LocalDatabase.set('opportunities', opps);
    
    AlertService.log('INFO', 'Opportunity', `New Trade Opportunity: ${opportunity.symbol} ${opportunity.direction}`);
    
    return opportunity;
  },

  updateStatus(id: string, status: TradeOpportunity['status'], reason?: string) {
    const opps = this.getOpportunities();
    const opp = opps.find(o => o.id === id);
    if (opp && opp.status !== status) {
      opp.status = status;
      if (reason && status === 'INVALIDATED') {
        opp.reason = `Invalidated: ${reason}`;
      }
      LocalDatabase.set('opportunities', opps);
    }
  }
};
