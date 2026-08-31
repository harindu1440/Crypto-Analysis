import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Markets from './pages/Markets';
import Analysis from './pages/Analysis';
import Signals from './pages/Signals';
import Watchlist from './pages/Watchlist';
import Settings from './pages/Settings';
import OpportunityDetail from './pages/OpportunityDetail';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="markets" element={<Markets />} />
        <Route path="analysis" element={<Analysis />} />
        <Route path="opportunities/:id" element={<OpportunityDetail />} />
        <Route path="signals" element={<Signals />} />
        <Route path="watchlist" element={<Watchlist />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <h1 style={{ color: 'var(--color-negative)' }}>404</h1>
            <p style={{ color: 'var(--text-secondary)' }}>Page not found.</p>
          </div>
        } />
      </Route>
    </Routes>
  );
};

export default App;
