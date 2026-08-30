import { useState, useEffect, useRef } from 'react';

export interface LiveMarketData {
  symbol: string;
  price: string;
  priceChange: string;
  priceChangePercent: string;
  volume24h: string;
  timestamp: number;
}

export const useMarketData = () => {
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(() => {
    const saved = localStorage.getItem('selectedSymbols');
    return saved ? JSON.parse(saved) : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  });

  const [marketData, setMarketData] = useState<Record<string, LiveMarketData>>({});
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const activeSubsRef = useRef<string[]>([]);

  useEffect(() => {
    localStorage.setItem('selectedSymbols', JSON.stringify(selectedSymbols));
    
    // Manage Subscriptions
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const toSubscribe = selectedSymbols.filter(s => !activeSubsRef.current.includes(s));
      const toUnsubscribe = activeSubsRef.current.filter(s => !selectedSymbols.includes(s));
      
      if (toSubscribe.length > 0) {
        wsRef.current.send(JSON.stringify({ type: 'SUBSCRIBE', symbols: toSubscribe }));
      }
      if (toUnsubscribe.length > 0) {
        wsRef.current.send(JSON.stringify({ type: 'UNSUBSCRIBE', symbols: toUnsubscribe }));
      }
      activeSubsRef.current = [...selectedSymbols];
    }
  }, [selectedSymbols, wsConnected]);

  useEffect(() => {
    let reconnectTimer: number;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = import.meta.env.DEV ? 'localhost:3000' : window.location.host;
      const ws = new WebSocket(`${protocol}//${host}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        activeSubsRef.current = []; // reset so the effect above re-subscribes
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'MARKET_UPDATE' && message.data) {
            setMarketData(prev => ({
              ...prev,
              [message.data.symbol]: message.data
            }));
          }
        } catch (e) {
          console.error('Error parsing WS message', e);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        reconnectTimer = setTimeout(connect, 5000);
      };
      
      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const addSymbol = (symbol: string) => {
    setSelectedSymbols(prev => prev.includes(symbol) ? prev : [...prev, symbol]);
  };

  const removeSymbol = (symbol: string) => {
    setSelectedSymbols(prev => prev.filter(s => s !== symbol));
  };

  return { selectedSymbols, marketData, wsConnected, addSymbol, removeSymbol };
};
