import React, { useState, useEffect } from 'react';
import { Card } from '../components/common/Card';
import { MarketTable } from '../components/market/MarketTable';
import { Search } from 'lucide-react';
import { useGlobalMarketData } from '../context/MarketDataContext';
import { getTicker } from '../services/binanceApi';
import type { MarketAsset } from '../types';

const Watchlist: React.FC = () => {
  const { selectedSymbols, marketData } = useGlobalMarketData();
  const [initialData, setInitialData] = useState<Record<string, MarketAsset>>({});
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
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
            sparkline: []
          };
        } catch (e) {
          console.error(e);
        }
      }
      setInitialData(data);
    };
    
    fetchInitialData();
  }, [selectedSymbols]);

  const displayAssets: MarketAsset[] = selectedSymbols.map(symbol => {
    const live = marketData[symbol];
    const initial = initialData[symbol];
    
    if (live) {
      return {
        symbol: live.symbol,
        name: live.symbol,
        price: parseFloat(live.price),
        change24h: parseFloat(live.priceChangePercent),
        volume24h: parseFloat(live.volume24h),
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
  }).filter(asset => 
    asset.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', margin: '0 0 8px 0' }}>Watchlist</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Monitor your favorite assets</p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input 
              type="text" 
              placeholder="Search watchlist..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                backgroundColor: 'var(--panel-bg)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                padding: '8px 12px 8px 36px',
                borderRadius: '4px',
                outline: 'none',
                width: '200px'
              }}
            />
          </div>
        </div>
      </header>

      {displayAssets.length > 0 ? (
        <Card>
          <MarketTable assets={displayAssets} />
        </Card>
      ) : (
        <Card>
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <p>Your watchlist is empty or no assets match search.</p>
            <p style={{ fontSize: '12px', marginTop: '8px' }}>Go to the Markets page to select assets for monitoring.</p>
          </div>
        </Card>
      )}
    </div>
  );
};

export default Watchlist;
