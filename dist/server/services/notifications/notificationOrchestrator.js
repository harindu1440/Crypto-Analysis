"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationOrchestrator = exports.notificationEmitter = void 0;
const crypto_1 = __importDefault(require("crypto"));
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
    dispatch(type, priority, title, message, opportunity, userId = 'global') {
        const all = database_1.LocalDatabase.get('notifications') || [];
        // Deduplication Key
        let dedupKey = `${userId}-${type}`;
        if (opportunity) {
            // For UPDATED, tie dedup to version. For others, tie to status or just opportunity ID.
            if (type === 'UPDATED') {
                dedupKey = `${userId}-${opportunity.id}-v${opportunity.version}-${type}`;
            }
            else {
                dedupKey = `${userId}-${opportunity.id}-${type}`;
            }
        }
        // Check dedup
        const isDuplicate = all.some((n) => n.dedupKey === dedupKey);
        if (isDuplicate) {
            console.log(`[Notification] Suppressed duplicate alert: ${dedupKey}`);
            return null;
        }
        const notification = {
            id: crypto_1.default.randomUUID(),
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
        // Keep only last 1000
        all.unshift(notification);
        if (all.length > 1000)
            all.pop();
        database_1.LocalDatabase.set('notifications', all);
        console.log(`[Notification | ${priority}] ${title}: ${message}`);
        // Broadcast via WS
        exports.notificationEmitter.emit('new_notification', notification);
        return notification;
    }
};
