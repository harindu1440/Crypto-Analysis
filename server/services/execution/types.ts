export type ExecutionStatus = 
  | 'PENDING'
  | 'COUNTDOWN'
  | 'READY'
  | 'EXECUTING'
  | 'EXECUTED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'EXECUTION_UNCERTAIN';

export interface ExecutionAudit {
  id: string;
  planId: string;
  symbol: string;
  direction: string;
  scheduledAt: number;
  startedAt?: number;
  completedAt?: number;
  status: ExecutionStatus;
  orderId?: string;
  clientOrderId?: string;
  quantity?: number;
  notionalValue?: number;
  error?: string;
  actualFillPrice?: number;
  executedQuantity?: number;
  accountSyncTimestamp?: number;
}

export interface ScheduledPlanState {
  planId: string;
  scheduledAt: number;
  status: ExecutionStatus;
  preTradeNotificationSent: boolean;
}
