import React, { useState } from 'react';
import { Card } from '../components/common/Card';
import { Play, TrendingUp, TrendingDown, Target, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const BacktestDashboard: React.FC = () => {
  const { preferences } = useAuth();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const mode = preferences?.mode || 'BEGINNER';

  const runBacktest = async () => {
    try {
      setRunning(true);
      setError(null);
      setResults(null);
      setProgress(0);
      
      const res = await fetch('/api/backtest/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}` // assuming token is here or cookie handled
        },
        body: JSON.stringify({
          // Run on everything by default
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setJobId(data.jobId);
      pollStatus(data.jobId);
    } catch (err: any) {
      setError(err.message);
      setRunning(false);
    }
  };

  const pollStatus = async (id: string) => {
    try {
      const res = await fetch(`/api/backtest/status/${id}`);
      const data = await res.json();
      
      if (data.total > 0) {
        setProgress(Math.round((data.progress / data.total) * 100));
      }
      
      if (data.status === 'COMPLETED') {
        const res2 = await fetch(`/api/backtest/results/${id}`);
        const data2 = await res2.json();
        setResults(data2.metrics.overall);
        setRunning(false);
      } else if (data.status === 'FAILED') {
        setError('Backtest job failed internally.');
        setRunning(false);
      } else {
        setTimeout(() => pollStatus(id), 1000);
      }
    } catch (e) {
      console.error(e);
      setTimeout(() => pollStatus(id), 1000);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto text-white">
      <header>
        <h1 className="text-2xl font-bold mb-2">Historical AI Performance</h1>
        <p className="text-gray-400">Evaluate how the AI's trading opportunities performed historically across the market.</p>
      </header>

      {error && (
        <div className="p-4 bg-red-900/50 border border-red-500 rounded text-red-200">
          {error}
        </div>
      )}

      <Card>
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold">Run Backtest</h2>
            <p className="text-sm text-gray-400">Simulate historical trades using saved AI opportunities.</p>
          </div>
          <button 
            onClick={runBacktest} 
            disabled={running}
            className={`flex items-center gap-2 px-6 py-2 rounded font-bold ${running ? 'bg-gray-700 cursor-not-allowed text-gray-500' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
          >
            {running ? <Clock size={16} className="animate-spin" /> : <Play size={16} />}
            {running ? 'Running...' : 'Start Evaluation'}
          </button>
        </div>
        
        {running && (
          <div className="mt-6">
            <div className="flex justify-between text-sm mb-2 text-gray-400">
              <span>Simulation Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        )}
      </Card>

      {results && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <div className="text-gray-400 text-sm">Win Rate</div>
            <div className="text-3xl font-bold text-white mt-1">{results.winRate.toFixed(1)}%</div>
            <div className="text-xs text-gray-500 mt-2">
              {results.wins} Wins / {results.losses} Losses
            </div>
          </Card>
          
          <Card>
            <div className="text-gray-400 text-sm">Expectancy</div>
            <div className="text-3xl font-bold text-white mt-1">{results.expectancy > 0 ? '+' : ''}{results.expectancy.toFixed(2)}R</div>
            {mode === 'BEGINNER' && (
              <div className="text-xs text-gray-500 mt-2">
                Average expected return per trade.
              </div>
            )}
          </Card>
          
          <Card>
            <div className="text-gray-400 text-sm">Profit Factor</div>
            <div className="text-3xl font-bold text-white mt-1">{results.profitFactor.toFixed(2)}</div>
            {mode === 'BEGINNER' && (
              <div className="text-xs text-gray-500 mt-2">
                The AI historically made more profitable trades than losing ones.
              </div>
            )}
          </Card>

          <Card>
            <div className="text-gray-400 text-sm">Max Drawdown</div>
            <div className="text-3xl font-bold text-red-400 mt-1">-{results.maxDrawdown.toFixed(1)}R</div>
            <div className="text-xs text-gray-500 mt-2">
              Worst historical losing streak.
            </div>
          </Card>
        </div>
      )}
      
      {results && (
        <Card title="Simulation Details">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between py-2 border-b border-gray-800">
              <span className="text-gray-400">Total AI Signals</span>
              <span>{results.totalSignals}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-800">
              <span className="text-gray-400">Entries Triggered</span>
              <span>{results.entriesTriggered}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-800">
              <span className="text-gray-400">No Entry (Missed)</span>
              <span>{results.noEntry}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-800">
              <span className="text-gray-400">Invalidated Before Entry</span>
              <span>{results.invalidated}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-800">
              <span className="text-gray-400">Average R Multiple</span>
              <span className={results.averageR > 0 ? 'text-green-400' : 'text-red-400'}>
                {results.averageR > 0 ? '+' : ''}{results.averageR.toFixed(2)}R
              </span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
