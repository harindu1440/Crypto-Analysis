import React, { useEffect, useState } from 'react';
import { Card } from '../common/Card';
import './AnalyticsPanel.css';

interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: string;
  grossProfit: string;
  grossLoss: string;
  netPnL: string;
  profitFactor: string;
}

export const AnalyticsPanel: React.FC = () => {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);

  useEffect(() => {
    fetch('/api/analytics/performance')
      .then(res => res.json())
      .then(data => setMetrics(data))
      .catch(err => console.error('Failed to load analytics', err));
  }, []);

  if (!metrics) return <Card title="Account Performance">Loading...</Card>;

  if (metrics.totalTrades === 0) {
    return (
      <Card title="Account Performance">
        <div className="analytics-empty">
          <p>Not enough completed trades to display performance metrics.</p>
        </div>
      </Card>
    );
  }

  const netPnlNum = parseFloat(metrics.netPnL);
  const pnlClass = netPnlNum > 0 ? 'text-positive' : (netPnlNum < 0 ? 'text-danger' : '');

  return (
    <Card title="Account Performance">
      <div className="analytics-grid">
        <div className="analytics-stat">
          <label>Total Trades</label>
          <div className="stat-val">{metrics.totalTrades}</div>
        </div>
        <div className="analytics-stat">
          <label>Win Rate</label>
          <div className="stat-val">{metrics.winRate}%</div>
        </div>
        <div className="analytics-stat">
          <label>Net PnL</label>
          <div className={`stat-val ${pnlClass}`}>${metrics.netPnL}</div>
        </div>
        <div className="analytics-stat">
          <label>Profit Factor</label>
          <div className="stat-val">{metrics.profitFactor}</div>
        </div>
      </div>
    </Card>
  );
};
