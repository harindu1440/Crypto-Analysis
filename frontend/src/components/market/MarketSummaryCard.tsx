import React from 'react';
import type { MarketSummary } from '../../types';
import { Card } from '../common/Card';

interface MarketSummaryCardProps {
  summary: MarketSummary;
}

export const MarketSummaryCard: React.FC<MarketSummaryCardProps> = ({ summary }) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '24px' }}>
      <Card title="Total Market Cap">
        <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{summary.totalMarketCap}</div>
        <div className="positive" style={{ fontSize: '12px' }}>+1.2% (24h)</div>
      </Card>
      
      <Card title="24h Volume">
        <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{summary.volume24h}</div>
        <div className="negative" style={{ fontSize: '12px' }}>-0.5% (24h)</div>
      </Card>
      
      <Card title="BTC Dominance">
        <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{summary.btcDominance}%</div>
        <div className="positive" style={{ fontSize: '12px' }}>+0.1% (24h)</div>
      </Card>
      
      <Card title="Market Sentiment">
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--color-positive)' }}>{summary.marketSentiment}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Based on top 100 assets</div>
      </Card>
    </div>
  );
};
