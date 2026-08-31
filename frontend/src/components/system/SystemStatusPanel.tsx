import React, { useEffect, useState } from 'react';
import { Card } from '../common/Card';
import './SystemStatusPanel.css';

interface SystemHealth {
  overall: string;
  database: string;
  binanceMarket: string;
  binanceAccount: string;
  monitoring: string;
  timestamp: number;
}

export const SystemStatusPanel: React.FC = () => {
  const [health, setHealth] = useState<SystemHealth | null>(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/system/health');
        setHealth(await res.json());
      } catch (e) {
        setHealth({
          overall: 'OFFLINE',
          database: 'OFFLINE',
          binanceMarket: 'OFFLINE',
          binanceAccount: 'OFFLINE',
          monitoring: 'OFFLINE',
          timestamp: Date.now()
        });
      }
    };
    
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    if (status === 'HEALTHY') return '🟢';
    if (status === 'DEGRADED') return '🟡';
    return '🔴';
  };

  if (!health) return <Card title="System Status">Loading...</Card>;

  return (
    <Card title="System Status">
      <div className="system-status-panel">
        <div className={`overall-status ${health.overall.toLowerCase()}`}>
          SYSTEM: {health.overall}
        </div>
        <div className="status-grid">
          <div className="status-item">
            <span>Database</span>
            <span>{getStatusIcon(health.database)}</span>
          </div>
          <div className="status-item">
            <span>Binance Market</span>
            <span>{getStatusIcon(health.binanceMarket)}</span>
          </div>
          <div className="status-item">
            <span>Binance Account</span>
            <span>{getStatusIcon(health.binanceAccount)}</span>
          </div>
          <div className="status-item">
            <span>Monitoring Engine</span>
            <span>{getStatusIcon(health.monitoring)}</span>
          </div>
        </div>
        <div className="last-updated">
          Last updated: {new Date(health.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </Card>
  );
};
