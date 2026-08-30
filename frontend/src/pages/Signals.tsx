import React from 'react';
import { Card } from '../components/common/Card';
import { mockSignals } from '../data/mockMarketData';

const Signals: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <header>
        <h1 style={{ fontSize: '24px', margin: '0 0 8px 0' }}>Trading Signals</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Algorithmic trading recommendations <span style={{ color: 'var(--color-warning)', marginLeft: '8px', fontSize: '12px', padding: '2px 6px', border: '1px solid var(--color-warning)', borderRadius: '4px' }}>UI DEMO</span></p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
        {mockSignals.map((signal, idx) => {
          const isBuy = signal.action === 'BUY';
          const isSell = signal.action === 'SELL';
          const color = isBuy ? 'var(--color-positive)' : isSell ? 'var(--color-negative)' : 'var(--text-secondary)';
          
          return (
            <Card key={idx}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0 }}>{signal.symbol}</h3>
                <span style={{ 
                  padding: '4px 8px', 
                  backgroundColor: `${color}22`, 
                  color: color,
                  border: `1px solid ${color}`,
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}>{signal.action}</span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Confidence</span>
                <span style={{ fontWeight: 'bold' }}>{signal.confidence}%</span>
              </div>
              
              <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-color)', borderRadius: '3px', marginBottom: '16px', overflow: 'hidden' }}>
                <div style={{ width: `${signal.confidence}%`, height: '100%', backgroundColor: color }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span>Timeframe: {signal.timeframe}</span>
                <span>Generated: Just now</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Signals;
