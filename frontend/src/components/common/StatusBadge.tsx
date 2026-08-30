import React from 'react';

interface StatusBadgeProps {
  status: 'connected' | 'disconnected' | 'loading';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const colorMap = {
    connected: 'var(--color-positive)',
    disconnected: 'var(--color-negative)',
    loading: 'var(--color-warning)',
  };

  const textMap = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    loading: 'Connecting...',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
      <div 
        style={{ 
          width: '8px', 
          height: '8px', 
          borderRadius: '50%', 
          backgroundColor: colorMap[status],
          boxShadow: `0 0 8px ${colorMap[status]}` 
        }} 
      />
      <span style={{ color: 'var(--text-secondary)' }}>Backend: {textMap[status]}</span>
    </div>
  );
};
