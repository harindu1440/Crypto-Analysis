import crypto from 'crypto';
import { LocalDatabase } from '../../config/database';
import { NotificationEvent, NotificationType, NotificationPriority } from './types';
import { EventEmitter } from 'events';
import { TradeOpportunity } from '../opportunities/types';

export const notificationEmitter = new EventEmitter();

export const NotificationOrchestrator = {
  
  getNotifications(userId: string = 'global'): NotificationEvent[] {
    const all = LocalDatabase.get('notifications') || [];
    return all.filter((n: NotificationEvent) => n.userId === userId || n.userId === 'global');
  },

  getUnreadCount(userId: string = 'global'): number {
    return this.getNotifications(userId).filter(n => !n.read).length;
  },

  markAsRead(notificationId: string) {
    const all = LocalDatabase.get('notifications') || [];
    const n = all.find((x: NotificationEvent) => x.id === notificationId);
    if (n) {
      n.read = true;
      LocalDatabase.set('notifications', all);
      notificationEmitter.emit('notification_updated', n);
    }
  },

  markAllAsRead(userId: string = 'global') {
    const all = LocalDatabase.get('notifications') || [];
    let updated = false;
    all.forEach((n: NotificationEvent) => {
      if ((n.userId === userId || n.userId === 'global') && !n.read) {
        n.read = true;
        updated = true;
      }
    });
    if (updated) {
      LocalDatabase.set('notifications', all);
      notificationEmitter.emit('notifications_read_all', userId);
    }
  },

  dispatch(
    type: NotificationType, 
    priority: NotificationPriority, 
    title: string, 
    message: string, 
    opportunity?: TradeOpportunity,
    userId: string = 'global'
  ) {
    const all = LocalDatabase.get('notifications') || [];
    
    // Deduplication Key
    let dedupKey = `${userId}-${type}`;
    if (opportunity) {
       // For UPDATED, tie dedup to version. For others, tie to status or just opportunity ID.
       if (type === 'UPDATED') {
         dedupKey = `${userId}-${opportunity.id}-v${opportunity.version}-${type}`;
       } else {
         dedupKey = `${userId}-${opportunity.id}-${type}`;
       }
    }

    // Check dedup
    const isDuplicate = all.some((n: NotificationEvent) => n.dedupKey === dedupKey);
    if (isDuplicate) {
      console.log(`[Notification] Suppressed duplicate alert: ${dedupKey}`);
      return null;
    }

    const notification: NotificationEvent = {
      id: crypto.randomUUID(),
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
    if (all.length > 1000) all.pop();
    
    LocalDatabase.set('notifications', all);
    
    console.log(`[Notification | ${priority}] ${title}: ${message}`);
    
    // Broadcast via WS
    notificationEmitter.emit('new_notification', notification);
    
    return notification;
  }
};
