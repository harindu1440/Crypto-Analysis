import { LocalDatabase } from '../../config/database';
import { TradeOpportunity } from '../opportunities/types';
import crypto from 'crypto';

export interface UserPreferences {
  userId: string;
  minQualityScore: number;
  direction: 'LONG' | 'SHORT' | 'BOTH';
  timeframes: string[]; // e.g., ['15m', '1h', '4h']
  notifications: {
    newOpportunity: boolean;
    approachingEntry: boolean;
    fiveMinuteWarning: boolean;
    entryTriggered: boolean;
    invalidated: boolean;
    expired: boolean;
    tradeExecuted: boolean;
    systemAlerts: boolean;
  };
  mode: 'BEGINNER' | 'ADVANCED';
}

const DEFAULT_PREFS: UserPreferences = {
  userId: '',
  minQualityScore: 75,
  direction: 'BOTH',
  timeframes: ['15m', '1h', '4h', '1d'],
  notifications: {
    newOpportunity: true,
    approachingEntry: true,
    fiveMinuteWarning: true,
    entryTriggered: true,
    invalidated: true,
    expired: false,
    tradeExecuted: true,
    systemAlerts: true
  },
  mode: 'BEGINNER'
};

export const UserService = {

  // --- Watchlist ---
  getWatchlist(userId: string): string[] {
    const watchlists = LocalDatabase.get('watchlists') || {};
    return watchlists[userId] || [];
  },

  addToWatchlist(userId: string, symbol: string) {
    const watchlists = LocalDatabase.get('watchlists') || {};
    const list = watchlists[userId] || [];
    if (!list.includes(symbol)) {
      list.push(symbol);
      watchlists[userId] = list;
      LocalDatabase.set('watchlists', watchlists);
    }
  },

  removeFromWatchlist(userId: string, symbol: string) {
    const watchlists = LocalDatabase.get('watchlists') || {};
    const list = watchlists[userId] || [];
    const index = list.indexOf(symbol);
    if (index !== -1) {
      list.splice(index, 1);
      watchlists[userId] = list;
      LocalDatabase.set('watchlists', watchlists);
    }
  },

  // --- Preferences ---
  getPreferences(userId: string): UserPreferences {
    const prefs = LocalDatabase.get('userPreferences') || {};
    if (!prefs[userId]) {
      return { ...DEFAULT_PREFS, userId };
    }
    return prefs[userId];
  },

  updatePreferences(userId: string, updates: Partial<UserPreferences>): UserPreferences {
    const prefs = LocalDatabase.get('userPreferences') || {};
    const current = prefs[userId] || { ...DEFAULT_PREFS, userId };
    const merged = { ...current, ...updates, userId };
    
    // Ensure notifications object is merged properly if partial
    if (updates.notifications) {
      merged.notifications = { ...current.notifications, ...updates.notifications };
    }

    prefs[userId] = merged;
    LocalDatabase.set('userPreferences', prefs);
    return merged;
  },

  // --- Saved Opportunities ---
  getSavedOpportunities(userId: string): any[] {
    const saved = LocalDatabase.get('savedOpportunities') || [];
    return saved.filter((s: any) => s.userId === userId);
  },

  saveOpportunity(userId: string, opportunityId: string) {
    const saved = LocalDatabase.get('savedOpportunities') || [];
    if (!saved.some((s: any) => s.userId === userId && s.opportunityId === opportunityId)) {
      saved.push({
        id: crypto.randomUUID(),
        userId,
        opportunityId,
        createdAt: Date.now()
      });
      LocalDatabase.set('savedOpportunities', saved);
    }
  },

  removeSavedOpportunity(userId: string, opportunityId: string) {
    const saved = LocalDatabase.get('savedOpportunities') || [];
    const index = saved.findIndex((s: any) => s.userId === userId && s.opportunityId === opportunityId);
    if (index !== -1) {
      saved.splice(index, 1);
      LocalDatabase.set('savedOpportunities', saved);
    }
  }
};
