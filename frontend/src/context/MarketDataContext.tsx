import React, { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useMarketData } from '../hooks/useMarketData';
import type { LiveMarketData } from '../hooks/useMarketData';

interface MarketContextType {
  selectedSymbols: string[];
  marketData: Record<string, LiveMarketData>;
  wsConnected: boolean;
  addSymbol: (symbol: string) => void;
  removeSymbol: (symbol: string) => void;
}

const MarketContext = createContext<MarketContextType | undefined>(undefined);

export const MarketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const marketDataHook = useMarketData();
  return (
    <MarketContext.Provider value={marketDataHook}>
      {children}
    </MarketContext.Provider>
  );
};

export const useGlobalMarketData = () => {
  const context = useContext(MarketContext);
  if (!context) {
    throw new Error('useGlobalMarketData must be used within a MarketProvider');
  }
  return context;
};
