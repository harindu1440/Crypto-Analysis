import React, { useEffect, useState } from 'react';
import { Card } from '../common/Card';
import './LiveTradingPanel.css';

interface AccountStatus {
  connected: boolean;
  mode: string;
  lastSyncAt: number;
  balanceAvailable: boolean;
  error?: string;
}

interface UpcomingPlan {
  planId: string;
  status: string;
  scheduledAt: number;
}

export const LiveTradingPanel: React.FC = () => {
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingPlan[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const accRes = await fetch('/api/account/status');
        setAccount(await accRes.json());
        
        const upRes = await fetch('/api/execution/upcoming');
        setUpcoming(await upRes.json());
      } catch (e) {
        console.error('Failed to fetch live trading data', e);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card title="Live Trading Control">
      <div className="live-trading-panel">
        <div className="status-section">
          <h3>Binance Account</h3>
          {account ? (
            <div className="status-grid">
              <div>Status: {account.connected ? <span className="text-positive">Connected</span> : <span className="text-danger">Disconnected</span>}</div>
              <div>Mode: <span className="tag">{account.mode.toUpperCase()}</span></div>
              <div>Funds: {account.balanceAvailable ? 'Available' : 'Unavailable'}</div>
            </div>
          ) : (
            <div>Loading...</div>
          )}
        </div>

        <div className="upcoming-section">
          <h3>Upcoming Executions</h3>
          {upcoming.length > 0 ? (
            upcoming.map(plan => (
              <div key={plan.planId} className="upcoming-item">
                <div>Plan: {plan.planId.split('-')[0]}</div>
                <div>Status: <span className={`tag ${plan.status.toLowerCase()}`}>{plan.status}</span></div>
                <div>Time: {new Date(plan.scheduledAt).toLocaleTimeString()}</div>
              </div>
            ))
          ) : (
            <div className="empty-state">No upcoming trades.</div>
          )}
        </div>
      </div>
    </Card>
  );
};
