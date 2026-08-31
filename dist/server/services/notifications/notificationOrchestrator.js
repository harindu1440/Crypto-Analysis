"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationOrchestrator = exports.notificationEmitter = void 0;
const database_1 = require("../../config/database");
const events_1 = require("events");
exports.notificationEmitter = new events_1.EventEmitter();
exports.NotificationOrchestrator = {
    getNotifications(userId = 'global') {
        const all = database_1.LocalDatabase.get('notifications') || [];
        return all.filter((n) => n.userId === userId || n.userId === 'global');
    },
    getUnreadCount(userId = 'global') {
        return this.getNotifications(userId).filter(n => !n.read).length;
    },
    markAsRead(notificationId) {
        const all = database_1.LocalDatabase.get('notifications') || [];
        const n = all.find((x) => x.id === notificationId);
        if (n) {
            n.read = true;
            database_1.LocalDatabase.set('notifications', all);
            exports.notificationEmitter.emit('notification_updated', n);
        }
    },
    markAllAsRead(userId = 'global') {
        const all = database_1.LocalDatabase.get('notifications') || [];
        let updated = false;
        all.forEach((n) => {
            if ((n.userId === userId || n.userId === 'global') && !n.read) {
                n.read = true;
                updated = true;
            }
        });
        if (updated) {
            database_1.LocalDatabase.set('notifications', all);
            exports.notificationEmitter.emit('notifications_read_all', userId);
        }
    },
    dispatch(type, priority, title, message, opportunity) {
        // 1. Get all active users
        const users = database_1.LocalDatabase.get('users') || [];
        const activeUsers = users.filter((u) => u.status === 'ACTIVE');
        // 2. Fallback to global if no users (backward compatibility)
        if (activeUsers.length === 0) {
            this._createNotification('global', type, priority, title, message, opportunity);
            return;
        }
        const { UserService } = require('../user/userService');
        // 3. Fan-out to each user based on preferences
        activeUsers.forEach(user => {
            const prefs = UserService.getPreferences(user.id);
            // Check event type preference
            const prefKey = type === 'NEW_OPPORTUNITY' ? 'newOpportunity' :
                type === 'APPROACHING_ENTRY' ? 'approachingEntry' :
                    type === 'FIVE_MINUTE_WARNING' ? 'fiveMinuteWarning' :
                        type === 'ENTRY_TRIGGERED' ? 'entryTriggered' :
                            type === 'INVALIDATED' ? 'invalidated' :
                                type === 'EXPIRED' ? 'expired' :
                                    type === 'ORDER_EXECUTED' ? 'tradeExecuted' :
                                        type === 'SYSTEM_ALERT' ? 'systemAlerts' : null;
            if (prefKey && prefs.notifications[prefKey] === false)
                return;
            if (opportunity) {
                // Check quality threshold
                if (opportunity.qualityScore !== undefined && opportunity.qualityScore < prefs.minQualityScore)
                    return;
                // Check direction
                if (prefs.direction !== 'BOTH' && opportunity.direction !== prefs.direction)
                    return;
                // Check timeframe
                if (prefs.timeframes && !prefs.timeframes.includes(opportunity.timeframe))
                    return;
            }
            this._createNotification(user.id, type, priority, title, message, opportunity);
        });
    },
    _createNotification(userId, type, priority, title, message, opportunity) {
        const all = database_1.LocalDatabase.get('notifications') || [];
        let dedupKey = `${userId}-${type}`;
        if (opportunity) {
            if (type === 'UPDATED') {
                dedupKey = `${userId}-${opportunity.id}-v${opportunity.version}-${type}`;
            }
            else {
                dedupKey = `${userId}-${opportunity.id}-${type}`;
            }
        }
        const isDuplicate = all.some((n) => n.dedupKey === dedupKey);
        if (isDuplicate)
            return;
        const notification = {
            id: require('crypto').randomUUID(),
            userId,
            opportunityId: opportunity?.id,
            type,
            priority,
            title,
            message,
            link: opportunity ? `/opportunities/${opportunity.id}` : undefined,
            data: opportunity ? { symbol: opportunity.symbol, direction: opportunity.direction } : undefined,
            createdAt: Date.now(),
            read: false,
            dedupKey
        };
        all.unshift(notification);
        if (all.length > 5000)
            all.pop(); // Increased capacity for multiple users
        database_1.LocalDatabase.set('notifications', all);
        console.log(`[Notification | ${priority} | User:${userId}] ${title}: ${message}`);
        exports.notificationEmitter.emit('new_notification', notification);
    }
};
