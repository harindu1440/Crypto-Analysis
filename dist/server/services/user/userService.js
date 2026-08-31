"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const database_1 = require("../../config/database");
const crypto_1 = __importDefault(require("crypto"));
const DEFAULT_PREFS = {
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
exports.UserService = {
    // --- Watchlist ---
    getWatchlist(userId) {
        const watchlists = database_1.LocalDatabase.get('watchlists') || {};
        return watchlists[userId] || [];
    },
    addToWatchlist(userId, symbol) {
        const watchlists = database_1.LocalDatabase.get('watchlists') || {};
        const list = watchlists[userId] || [];
        if (!list.includes(symbol)) {
            list.push(symbol);
            watchlists[userId] = list;
            database_1.LocalDatabase.set('watchlists', watchlists);
        }
    },
    removeFromWatchlist(userId, symbol) {
        const watchlists = database_1.LocalDatabase.get('watchlists') || {};
        const list = watchlists[userId] || [];
        const index = list.indexOf(symbol);
        if (index !== -1) {
            list.splice(index, 1);
            watchlists[userId] = list;
            database_1.LocalDatabase.set('watchlists', watchlists);
        }
    },
    // --- Preferences ---
    getPreferences(userId) {
        const prefs = database_1.LocalDatabase.get('userPreferences') || {};
        if (!prefs[userId]) {
            return { ...DEFAULT_PREFS, userId };
        }
        return prefs[userId];
    },
    updatePreferences(userId, updates) {
        const prefs = database_1.LocalDatabase.get('userPreferences') || {};
        const current = prefs[userId] || { ...DEFAULT_PREFS, userId };
        const merged = { ...current, ...updates, userId };
        // Ensure notifications object is merged properly if partial
        if (updates.notifications) {
            merged.notifications = { ...current.notifications, ...updates.notifications };
        }
        prefs[userId] = merged;
        database_1.LocalDatabase.set('userPreferences', prefs);
        return merged;
    },
    // --- Saved Opportunities ---
    getSavedOpportunities(userId) {
        const saved = database_1.LocalDatabase.get('savedOpportunities') || [];
        return saved.filter((s) => s.userId === userId);
    },
    saveOpportunity(userId, opportunityId) {
        const saved = database_1.LocalDatabase.get('savedOpportunities') || [];
        if (!saved.some((s) => s.userId === userId && s.opportunityId === opportunityId)) {
            saved.push({
                id: crypto_1.default.randomUUID(),
                userId,
                opportunityId,
                createdAt: Date.now()
            });
            database_1.LocalDatabase.set('savedOpportunities', saved);
        }
    },
    removeSavedOpportunity(userId, opportunityId) {
        const saved = database_1.LocalDatabase.get('savedOpportunities') || [];
        const index = saved.findIndex((s) => s.userId === userId && s.opportunityId === opportunityId);
        if (index !== -1) {
            saved.splice(index, 1);
            database_1.LocalDatabase.set('savedOpportunities', saved);
        }
    }
};
