import React from 'react';
import { Card } from '../components/common/Card';
import { useBackendStatus } from '../hooks/useBackendStatus';
import { BinanceConnection } from '../components/account/BinanceConnection';

const Settings: React.FC = () => {
  const backendStatus = useBackendStatus();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '800px' }}>
      <header>
        <h1 style={{ fontSize: '24px', margin: '0 0 8px 0' }}>Settings</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Configure your platform preferences</p>
      </header>

      <BinanceConnection />

      <Card title="Appearance">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-color)' }}>
          <div>
            <div style={{ fontWeight: 500 }}>Theme</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Select your preferred theme</div>
          </div>
          <select style={{ padding: '8px 12px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px' }}>
            <option value="dark">Dark Theme (Professional)</option>
            <option value="light" disabled>Light Theme (Coming Soon)</option>
          </select>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
          <div>
            <div style={{ fontWeight: 500 }}>Display Density</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Adjust the spacing of tables and cards</div>
          </div>
          <select style={{ padding: '8px 12px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px' }}>
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
          </select>
        </div>
      </Card>

      <Card title="Connection Status">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
          <div>
            <div style={{ fontWeight: 500 }}>Backend API</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Data stream and execution engine status</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              backgroundColor: backendStatus === 'connected' ? 'var(--color-positive)' : 'var(--color-negative)' 
            }} />
            <span style={{ textTransform: 'capitalize' }}>{backendStatus}</span>
          </div>
        </div>
      </Card>
      
      <Card title="Application">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
          <div>
            <div style={{ fontWeight: 500 }}>Version</div>
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>v1.0.0-beta (Phase 2)</div>
        </div>
      </Card>
    </div>
  );
};

export default Settings;
