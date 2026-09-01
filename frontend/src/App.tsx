import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import Dashboard from './pages/Dashboard';
import Markets from './pages/Markets';
import { MarketAnalysisPage } from './pages/MarketAnalysisPage';
import Analysis from './pages/Analysis';
import Signals from './pages/Signals';
import Watchlist from './pages/Watchlist';
import Settings from './pages/Settings';
import OpportunityDetail from './pages/OpportunityDetail';
import { BacktestDashboard } from './pages/BacktestDashboard';
import { AIIntelligenceDashboard } from './pages/AIIntelligenceDashboard';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="markets" element={<Markets />} />
          <Route path="markets/:symbol" element={<MarketAnalysisPage />} />
          <Route path="analysis" element={<Analysis />} />
          <Route path="opportunities/:id" element={<OpportunityDetail />} />
          <Route path="signals" element={<Signals />} />
          <Route path="watchlist" element={<Watchlist />} />
          <Route path="backtest" element={<BacktestDashboard />} />
          <Route path="intelligence" element={<AIIntelligenceDashboard />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <h1 style={{ color: 'var(--color-negative)' }}>404</h1>
              <p style={{ color: 'var(--text-secondary)' }}>Page not found.</p>
            </div>
          } />
        </Route>
      </Route>
    </Routes>
  );
};

export default App;
