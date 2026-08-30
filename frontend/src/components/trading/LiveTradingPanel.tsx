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
  const [positions, setPositions] = useState<any[]>([]);
  const [isEmergencyStopped, setIsEmergencyStopped] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const accRes = await fetch('/api/account/status');
        setAccount(await accRes.json());
        
        const upRes = await fetch('/api/execution/upcoming');
        setUpcoming(await upRes.json());
        
        const posRes = await fetch('/api/trading/positions');
        setPositions(await posRes.json());
        
        const stopRes = await fetch('/api/trading/emergency-stop');
        const stopData = await stopRes.json();
        setIsEmergencyStopped(stopData.isHalted);
      } catch (e) {
        console.error('Failed to fetch live trading data', e);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const toggleEmergencyStop = async () => {
    if (!window.confirm(`Are you sure you want to ${isEmergencyStopped ? 'ENABLE' : 'DISABLE'} trading?`)) return;
    setLoading(true);
    try {
      const res = await fetch('/api/trading/emergency-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ halted: !isEmergencyStopped })
      });
      const data = await res.json();
      setIsEmergencyStopped(data.isHalted);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const closePosition = async (id: string, symbol: string) => {
    if (!window.confirm(`Are you sure you want to CLOSE the position for ${symbol}? This will place a real market order.`)) return;
    
    try {
      await fetch(`/api/trading/positions/${id}/close`, { method: 'POST' });
      const posRes = await fetch('/api/trading/positions');
      setPositions(await posRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Card title="Live Trading Control">
      <div className="live-trading-panel">
        
        <div className={`emergency-banner ${isEmergencyStopped ? 'halted' : 'active'}`}>
          <div className="banner-text">
            {isEmergencyStopped ? 'TRADING HALTED (EMERGENCY STOP ACTIVE)' : 'SYSTEM ACTIVE (LIVE TRADING)'}
          </div>
          <button 
            className={`btn ${isEmergencyStopped ? 'btn-resume' : 'btn-danger'}`} 
            onClick={toggleEmergencyStop}
            disabled={loading}
          >
            {isEmergencyStopped ? 'RESUME TRADING' : 'EMERGENCY STOP'}
          </button>
        </div>
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

        <div className="positions-section">
          <h3>Active Positions</h3>
          {positions.length > 0 ? (
            positions.map(pos => (
              <div key={pos.id} className="position-item">
                <div className="pos-header">
                  <strong>{pos.symbol}</strong> <span className={`tag ${pos.side.toLowerCase()}`}>{pos.side}</span>
                </div>
                <div className="pos-details">
                  <div>Entry: ${pos.entryPrice}</div>
                  <div>Size: {pos.quantity}</div>
                  <div>Unrealized PnL: <span className={pos.unrealizedPnL >= 0 ? 'text-positive' : 'text-danger'}>${pos.unrealizedPnL.toFixed(2)}</span></div>
                </div>
                <div className="pos-actions">
                  <button className="btn btn-close" onClick={() => closePosition(pos.id, pos.symbol)}>CLOSE POSITION</button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">No active positions.</div>
          )}
        </div>
      </div>
    </Card>
  );
};
