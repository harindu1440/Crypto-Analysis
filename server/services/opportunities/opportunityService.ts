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
    
    // Phase 15: Deduplication logic based on fingerprint
    const existingIndex = opps.findIndex(o => 
      o.fingerprint === opportunity.fingerprint &&
      ['DETECTED', 'ANALYZING', 'VALIDATING', 'QUALIFIED', 'ACTIVE', 'APPROACHING_ENTRY'].includes(o.status)
    );

    if (existingIndex !== -1) {
      const existing = opps[existingIndex];
      // Update existing instead of spamming
      const updatedOpp: TradeOpportunity = {
        ...existing,
        ...opportunity,
        id: existing.id, 
        createdAt: existing.createdAt,
        version: (existing.version || 1) + 1,
        updatedAt: Date.now()
      };
      
      opps[existingIndex] = updatedOpp;
      LocalDatabase.set('opportunities', opps);
      console.log(`[Opportunity] Updated existing opportunity for ${opportunity.symbol} (v${updatedOpp.version})`);
      
      require('../notifications/notificationOrchestrator').NotificationOrchestrator.dispatch(
        'UPDATED', 'INFO',
        `Opportunity Updated: ${updatedOpp.symbol}`,
        `The AI analysis for ${updatedOpp.symbol} has been updated. Score: ${updatedOpp.qualityScore}`,
        updatedOpp
      );
      
      return updatedOpp;
    }

    opps.unshift(opportunity);
    LocalDatabase.set('opportunities', opps);
    
    require('../notifications/notificationOrchestrator').NotificationOrchestrator.dispatch(
      'NEW_OPPORTUNITY', 'HIGH',
      `New Opportunity: ${opportunity.symbol} ${opportunity.direction}`,
      `A new high-quality setup was detected. Score: ${opportunity.qualityScore}`,
      opportunity
    );
    
    return opportunity;
  },
  
  updateOpportunity(opportunity: TradeOpportunity) {
    const opps = this.getOpportunities();
    const index = opps.findIndex(o => o.id === opportunity.id);
    if (index !== -1) {
      opps[index] = opportunity;
      LocalDatabase.set('opportunities', opps);
    }
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
