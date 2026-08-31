import { TradeOpportunity } from '../opportunities/types';

export type NotificationType = 
  | 'NEW_OPPORTUNITY' 
  | 'APPROACHING_ENTRY' 
  | 'FIVE_MINUTE_WARNING' 
  | 'ENTRY_TRIGGERED' 
  | 'ORDER_EXECUTED'
  | 'INVALIDATED'
  | 'EXPIRED'
  | 'UPDATED'
  | 'SYSTEM_ALERT';

export type NotificationPriority = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface NotificationEvent {
  id: string;
  userId: string; // 'global' or specific user ID
  opportunityId?: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  link?: string;
  data?: any;
  createdAt: number;
  read: boolean;
  dedupKey: string;
}

export interface NotificationPreferences {
  userId: string;
  newOpportunity: boolean;
  approachingEntry: boolean;
  fiveMinuteWarning: boolean;
  entryTriggered: boolean;
  invalidated: boolean;
  expired: boolean;
  systemAlerts: boolean;
}
