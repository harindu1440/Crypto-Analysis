import React from 'react';

interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ title, children, className = '' }) => {
  return (
    <div className={`card ${className}`} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {title && <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>{title}</h3>}
      <div>{children}</div>
    </div>
  );
};
