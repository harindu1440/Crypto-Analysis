import React from 'react';
import type { MarketAsset } from '../../types';
import { Sparkline } from '../common/Sparkline';

interface MarketTableProps {
  assets: MarketAsset[];
}

export const MarketTable: React.FC<MarketTableProps> = ({ assets }) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };
  
  const formatVolume = (value: number) => {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toLocaleString()}`;
  };

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Price</th>
            <th>24h Change</th>
            <th>Volume</th>
            <th>Trend (24h)</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <tr key={asset.symbol}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ fontWeight: 'bold' }}>{asset.symbol}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{asset.name}</div>
                </div>
              </td>
              <td style={{ fontWeight: 500 }}>{formatCurrency(asset.price)}</td>
              <td className={asset.change24h >= 0 ? 'positive' : 'negative'} style={{ fontWeight: 500 }}>
                {asset.change24h > 0 ? '+' : ''}{asset.change24h}%
              </td>
              <td>{formatVolume(asset.volume24h)}</td>
              <td>
                <Sparkline 
                  data={asset.sparkline} 
                  color={asset.change24h >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'} 
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
