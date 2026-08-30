import React, { useState } from 'react';
import { Card } from '../components/common/Card';
import { Activity } from 'lucide-react';
import { useGlobalMarketData } from '../context/MarketDataContext';

const Analysis: React.FC = () => {
  const { selectedSymbols, marketData } = useGlobalMarketData();
  const [asset, setAsset] = useState(selectedSymbols[0] || 'BTCUSDT');
  const [timeframe, setTimeframe] = useState('1h');
  
  const currentAssetData = marketData[asset];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <header>
        <h1 style={{ fontSize: '24px', margin: '0 0 8px 0' }}>Technical Analysis</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Advanced charting and technical indicators</p>
      </header>

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <select 
          value={asset}
          onChange={(e) => setAsset(e.target.value)}
          style={{ padding: '8px 12px', backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px' }}
        >
          {selectedSymbols.length === 0 && <option value="">No assets selected</option>}
          {selectedSymbols.map(sym => (
            <option key={sym} value={sym}>{sym}</option>
          ))}
        </select>
        
        <div style={{ display: 'flex', backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
          {['1m', '5m', '15m', '1h', '4h', '1d'].map(tf => (
            <button 
              key={tf}
              onClick={() => setTimeframe(tf)}
              style={{
                padding: '8px 16px',
                backgroundColor: timeframe === tf ? 'var(--border-color)' : 'transparent',
                color: timeframe === tf ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: 'none',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      
      {currentAssetData && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Live Price</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>${parseFloat(currentAssetData.price).toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>24h Change</div>
              <div className={parseFloat(currentAssetData.priceChange) >= 0 ? 'positive' : 'negative'} style={{ fontSize: '18px', fontWeight: 'bold' }}>
                {parseFloat(currentAssetData.priceChange) > 0 ? '+' : ''}{parseFloat(currentAssetData.priceChangePercent).toFixed(2)}%
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div style={{ height: '300px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', backgroundColor: 'var(--bg-color)', borderRadius: '4px', border: '1px dashed var(--border-color)' }}>
          <Activity size={48} color="var(--text-secondary)" style={{ marginBottom: '16px' }} />
          <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-secondary)' }}>Analysis Chart Placeholder</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{asset} • {timeframe}</p>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
        <Card title="Indicators">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['RSI', 'MACD', 'EMA', 'SMA'].map(ind => (
              <span key={ind} style={{ padding: '4px 8px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12px' }}>{ind}</span>
            ))}
          </div>
        </Card>
        <Card title="Status">
          <div style={{ color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-warning)' }} />
            AI Analysis Engine: Not Connected
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Analysis;
