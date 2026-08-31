export const getAvailableSymbols = async () => {
  const res = await fetch('/api/markets/symbols');
  if (!res.ok) throw new Error('Failed to fetch symbols');
  return await res.json();
};

export const getTicker = async (symbol: string) => {
  const res = await fetch(`/api/markets/ticker/${symbol}`);
  if (!res.ok) throw new Error(`Failed to fetch ticker for ${symbol}`);
  return await res.json();
};

export const getKlines = async (symbol: string, interval: string = '1h', limit: number = 24) => {
  const res = await fetch(`/api/markets/klines/${symbol}?interval=${interval}&limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to fetch klines for ${symbol}`);
  return await res.json();
};

export const getAnalysis = async (symbol: string, interval: string = '1h') => {
  const res = await fetch(`/api/analysis/${symbol}?interval=${interval}`);
  if (!res.ok) throw new Error(`Failed to fetch analysis for ${symbol}`);
  return await res.json();
};

export const triggerAiAnalysis = async (symbol: string) => {
  const res = await fetch(`/api/ai/analyze/${symbol}`, { method: 'POST' });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to trigger AI analysis for ${symbol} (Status: ${res.status})`);
  }
  return await res.json();
};

export const getLatestAiAnalysis = async (symbol: string) => {
  const res = await fetch(`/api/ai/analysis/${symbol}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Failed to fetch latest AI analysis for ${symbol}`);
  }
  return await res.json();
};

export const getRiskConfig = async () => {
  const res = await fetch('/api/risk/config');
  if (!res.ok) throw new Error('Failed to fetch risk config');
  return await res.json();
};

export const validateTradePlan = async (symbol: string, settings: any) => {
  const res = await fetch(`/api/risk/validate/${symbol}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });
  if (!res.ok) throw new Error(`Failed to validate trade plan for ${symbol}`);
  return await res.json();
};

export const getUpcomingExecutions = async () => {
  const res = await fetch('/api/execution/upcoming');
  if (!res.ok) throw new Error('Failed to fetch upcoming executions');
  return await res.json();
};

export const scheduleExecution = async (planId: string) => {
  const res = await fetch(`/api/execution/schedule/${planId}`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to schedule execution');
  }
  return await res.json();
};

export const cancelExecution = async (planId: string) => {
  const res = await fetch(`/api/execution/cancel/${planId}`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to cancel execution');
  }
  return await res.json();
};

// Phase 8 Monitoring APIs
export const getMonitoringStatus = async () => {
  const res = await fetch('/api/monitoring/status');
  if (!res.ok) throw new Error('Failed to fetch monitoring status');
  return await res.json();
};

export const getMonitoringEvents = async () => {
  const response = await fetch(`/api/monitoring/events`);
  if (!response.ok) throw new Error('Failed to fetch events');
  return response.json();
};

// Phase 9: Account APIs
export const getAccountStatus = async () => {
  const response = await fetch(`/api/account/status`);
  if (!response.ok) throw new Error('Failed to fetch account status');
  return response.json();
};

export const getAccountBalances = async () => {
  const response = await fetch(`/api/account/balances`);
  if (!response.ok) throw new Error('Failed to fetch balances');
  return response.json();
};

export const getAccountOrders = async (symbol?: string) => {
  const url = symbol ? `/api/account/orders?symbol=${symbol}` : `/api/account/orders`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch orders');
  return response.json();
};

export const startMonitoring = async () => {
  const res = await fetch('/api/monitoring/start', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to start monitoring');
  return await res.json();
};

export const stopMonitoring = async () => {
  const res = await fetch('/api/monitoring/stop', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to stop monitoring');
  return await res.json();
};

export const addMonitoredAsset = async (symbol: string) => {
  const res = await fetch(`/api/monitoring/assets/${symbol}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to add monitored asset');
  return await res.json();
};

export const removeMonitoredAsset = async (symbol: string) => {
  const res = await fetch(`/api/monitoring/assets/${symbol}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to remove monitored asset');
  return await res.json();
};

export const enableMonitoredAsset = async (symbol: string) => {
  const res = await fetch(`/api/monitoring/assets/${symbol}/enable`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to enable monitored asset');
  return await res.json();
};

export const disableMonitoredAsset = async (symbol: string) => {
  const res = await fetch(`/api/monitoring/assets/${symbol}/disable`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to disable monitored asset');
  return await res.json();
};
