export interface MonitoredAsset {
  symbol: string;
  enabled: boolean;
  timeframe: string;
}

export interface AssetMonitorState {
  symbol: string;
  enabled: boolean;
  
  lastPrice?: number;
  lastAnalysisAt?: number;
  
  analysisInProgress: boolean;
  lastAnalysisId?: string;
  lastDecision?: string;
  
  consecutiveNoTrade: number;
  lastError?: string;
}

export interface MonitoringEvent {
  id: string;
  timestamp: number;
  symbol: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
}
