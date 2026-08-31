import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, LineChart, Activity, Radio, Star, Settings, FileClock } from 'lucide-react';

export const Sidebar: React.FC = () => {
  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} /> },
    { name: 'Markets', path: '/markets', icon: <LineChart size={20} /> },
    { name: 'Analysis', path: '/analysis', icon: <Activity size={20} /> },
    { name: 'Signals', path: '/signals', icon: <Radio size={20} /> },
    { name: 'Backtest', path: '/backtest', icon: <FileClock size={20} /> },
    { name: 'Watchlist', path: '/watchlist', icon: <Star size={20} /> },
    { name: 'Settings', path: '/settings', icon: <Settings size={20} /> },
  ];

  return (
    <aside style={{
      width: '240px',
      backgroundColor: 'var(--panel-bg)',
      borderRight: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        padding: '24px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          backgroundColor: 'var(--color-accent)',
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          color: 'var(--bg-color)',
          fontWeight: 'bold'
        }}>CA</div>
        <h2 style={{ margin: 0, fontSize: '18px' }}>Crypto Analysis</h2>
      </div>
      
      <nav style={{ flex: 1, padding: '16px 0' }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {navItems.map((item) => (
            <li key={item.name}>
              <NavLink 
                to={item.path}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 24px',
                  color: isActive ? 'var(--color-accent)' : 'var(--text-secondary)',
                  backgroundColor: isActive ? 'rgba(252, 213, 53, 0.05)' : 'transparent',
                  borderRight: isActive ? '3px solid var(--color-accent)' : '3px solid transparent',
                  textDecoration: 'none',
                  transition: 'all 0.2s',
                  fontWeight: isActive ? 600 : 400
                })}
              >
                {item.icon}
                {item.name}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};
