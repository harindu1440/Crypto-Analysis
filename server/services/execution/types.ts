export type ExecutionStatus = 
  | 'PENDING'
  | 'COUNTDOWN'
  | 'READY'
  | 'EXECUTING'
  | 'EXECUTED'
  | 'EXECUTION_UNCERTAIN'
  | 'ENTRY_PARTIALLY_FILLED'
  | 'ENTRY_FILLED'
  | 'PROTECTION_PENDING'
  | 'PROTECTED'
  | 'POSITION_OPEN'
  | 'EXIT_PENDING'
  | 'POSITION_CLOSING'
  | 'CLOSED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'RECONCILING';

export interface Position {
  id: string;
  planId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  unrealizedPnL: number;
  realizedPnL: number;
  status: ExecutionStatus;
  openedAt: number;
  updatedAt: number;
  entryOrderId?: string;
  protectiveOrderId?: string; // e.g. OCO Order List ID
}

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
