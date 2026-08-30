export interface BinanceAssetBalance {
  asset: string;
  free: number;
  locked: number;
}

export interface BinanceOrderStatus {
  symbol: string;
  orderId: string;
  clientOrderId: string;
  status: string;
  side: string;
  type: string;
  origQty: number;
  executedQty: number;
  price: number;
  avgPrice?: number;
  time: number;
  updateTime: number;
}

export interface BinanceAccountSnapshot {
  timestamp: number;
  balances: BinanceAssetBalance[];
}

export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

export interface AccountState {
  lastSyncAt: number;
  balances: BinanceAssetBalance[];
  openOrders: BinanceOrderStatus[];
  connectionStatus: ConnectionStatus;
  lastError?: string;
}

export type ExecutionOrderStatus =
  | 'NEW'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'UNKNOWN';

export interface PositionState {
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  entryPrice: number;
  currentPrice?: number;
  unrealizedPnl?: number;
  updatedAt: number;
}
