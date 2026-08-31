import React, { useEffect, useState } from 'react';
import { MarketSummaryCard } from '../components/market/MarketSummaryCard';
import { MarketTable } from '../components/market/MarketTable';
import { mockMarketSummary } from '../data/mockMarketData';
import { Card } from '../components/common/Card';
import { LiveTradingPanel } from '../components/trading/LiveTradingPanel';
import { SystemStatusPanel } from '../components/system/SystemStatusPanel';
import { AnalyticsPanel } from '../components/analytics/AnalyticsPanel';
import { OpportunityFeed } from '../components/opportunities/OpportunityFeed';
import { useGlobalMarketData } from '../context/MarketDataContext';
import { getTicker } from '../services/binanceApi';
import type { MarketAsset } from '../types';

const Dashboard: React.FC = () => {
  const { selectedSymbols, marketData, wsConnected } = useGlobalMarketData();
  const [initialData, setInitialData] = useState<Record<string, MarketAsset>>({});

  useEffect(() => {
    // Fetch initial REST data for selected symbols to populate before WS updates
    const fetchInitialData = async () => {
      const data: Record<string, MarketAsset> = {};
      for (const symbol of selectedSymbols) {
        try {
          const ticker = await getTicker(symbol);
          data[symbol] = {
            symbol: ticker.symbol,
            name: ticker.symbol,
            price: parseFloat(ticker.lastPrice),
            change24h: parseFloat(ticker.priceChangePercent),
            volume24h: parseFloat(ticker.quoteVolume),
            sparkline: [] // Implement sparkline later if needed
          };
        } catch (e) {
          console.error(e);
        }
      }
      setInitialData(data);
    };
    
    fetchInitialData();
  }, [selectedSymbols]);

  // Merge initial REST data with live WS data
  const displayAssets: MarketAsset[] = selectedSymbols.map(symbol => {
    const live = marketData[symbol];
    const initial = initialData[symbol];
    
    if (live) {
      return {
        symbol: live.symbol,
        name: live.symbol,
        price: parseFloat(live.price),
        change24h: parseFloat(live.priceChangePercent),
        volume24h: parseFloat(live.volume24h), // For Binance, quote volume is usually preferred but we'll use whatever comes in WS
        sparkline: [] 
      };
    } else if (initial) {
      return initial;
    } else {
      return {
        symbol,
        name: symbol,
        price: 0,
        change24h: 0,
        volume24h: 0,
        sparkline: []
      };
    }
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <header>
        <h1 style={{ fontSize: '24px', margin: '0 0 8px 0' }}>Market Overview</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          Real-time cryptocurrency market analysis 
          {wsConnected ? (
            <span style={{ color: 'var(--color-positive)', marginLeft: '8px', fontSize: '12px', padding: '2px 6px', border: '1px solid var(--color-positive)', borderRadius: '4px' }}>LIVE BINANCE DATA</span>
          ) : (
            <span style={{ color: 'var(--color-warning)', marginLeft: '8px', fontSize: '12px', padding: '2px 6px', border: '1px solid var(--color-warning)', borderRadius: '4px' }}>CONNECTING...</span>
          )}
        </p>
      </header>

      {/* Keep mock market summary for now as calculating total market cap needs more complex logic */}
      <MarketSummaryCard summary={mockMarketSummary} />

      <LiveTradingPanel />

      <div className="status-analytics-row" style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
        <div style={{ flex: 1 }}><SystemStatusPanel /></div>
        <div style={{ flex: 1 }}><AnalyticsPanel /></div>
      </div>

      <div style={{ marginTop: '16px' }}>
        <OpportunityFeed />
      </div>

      <Card title="My Markets">
        {displayAssets.length > 0 ? (
          <MarketTable assets={displayAssets} />
        ) : (
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No assets selected. Add assets from the Markets page.</p>
        )}
      </Card>
    </div>
  );
};

export default Dashboard;
