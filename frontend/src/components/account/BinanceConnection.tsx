import React, { useEffect, useState } from 'react';
import { Card } from '../common/Card';
import './BinanceConnection.css';

interface AccountState {
  status: string;
  automatedTradingEnabled: boolean;
  error?: string;
}

export const BinanceConnection: React.FC = () => {
  const [account, setAccount] = useState<AccountState | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAccount = async () => {
    try {
      const res = await fetch('/api/account');
      setAccount(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccount();
  }, []);

  const toggleAutomatedTrading = async (enabled: boolean) => {
    try {
      await fetch('/api/account/automated-trading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      await fetchAccount();
    } catch (e) {
      console.error(e);
      alert('Failed to toggle automated trading');
    }
  };

  if (loading) return <Card title="Binance Account">Loading...</Card>;

  if (!account || account.status === 'NOT_CONNECTED') {
    return (
      <Card title="Binance Account">
        <div className="binance-status not-connected">
          <div className="status-indicator">🔴</div>
          <div>
            <h3>Not Connected</h3>
            <p>Connect your Binance account to enable automated execution.</p>
            <p className="note">Market Intelligence & AI Scanning remains fully active globally.</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Binance Account">
      <div className="binance-status connected">
        <div className="status-indicator">🟢</div>
        <div>
          <h3>Connected</h3>
          <p>Your Binance account is linked.</p>
        </div>
      </div>
      
      <div className="automated-trading-toggle">
        <div className="toggle-info">
          <h4>Automated Trading</h4>
          <p>Allow the Risk Engine to place trades automatically based on AI signals.</p>
        </div>
        <label className="switch">
          <input 
            type="checkbox" 
            checked={account.automatedTradingEnabled} 
            onChange={(e) => toggleAutomatedTrading(e.target.checked)} 
          />
          <span className="slider round"></span>
        </label>
      </div>
    </Card>
  );
};
