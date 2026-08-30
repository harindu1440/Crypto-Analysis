import React from 'react';
import { useBackendStatus } from '../../hooks/useBackendStatus';
import { StatusBadge } from '../common/StatusBadge';

export const Header: React.FC = () => {
  const backendStatus = useBackendStatus();

  return (
    <header style={{
      height: '70px',
      borderBottom: '1px solid var(--border-color)',
      backgroundColor: 'var(--panel-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
    }}>
      <div>
        <h1 style={{ fontSize: '20px', margin: 0 }}>Terminal</h1>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <StatusBadge status={backendStatus} />
      </div>
    </header>
  );
};
