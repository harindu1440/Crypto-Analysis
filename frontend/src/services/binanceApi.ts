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
