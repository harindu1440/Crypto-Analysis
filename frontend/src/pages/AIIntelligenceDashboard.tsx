import React, { useEffect, useState } from 'react';

interface AdaptiveProfile {
  id: string;
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  regime: string;
  sampleSize: number;
  winRate: number;
  avgR: number;
  reliability: string;
}

export const AIIntelligenceDashboard: React.FC = () => {
  const [profiles, setProfiles] = useState<Record<string, AdaptiveProfile>>({});
  const [loading, setLoading] = useState(true);
  const [seedLoading, setSeedLoading] = useState(false);

  useEffect(() => {
    fetchIntelligence();
  }, []);

  const fetchIntelligence = async () => {
    try {
      const res = await fetch('/api/ai/intelligence', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } // if needed, though bypassing auth is active
      });
      const data = await res.json();
      setProfiles(data.profiles || {});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedData = async () => {
    setSeedLoading(true);
    try {
      await fetch('/api/ai/recalculate', { method: 'POST' });
      await fetchIntelligence();
    } catch (e) {
      console.error(e);
    } finally {
      setSeedLoading(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-white text-center">Loading AI Intelligence Data...</div>;
  }

  const profileKeys = Object.keys(profiles);

  return (
    <div className="p-6 bg-[#0B0E14] min-h-screen text-white">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[#E2E8F0]">AI Intelligence Dashboard</h1>
        <button 
          onClick={handleSeedData}
          disabled={seedLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium disabled:opacity-50"
        >
          {seedLoading ? 'Recalculating...' : 'Trigger Recalculation'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-[#151924] p-4 rounded-lg border border-[#2A2E39]">
          <h3 className="text-gray-400 text-sm mb-1">Overall Reliability</h3>
          <div className="text-2xl font-bold text-green-400">82%</div>
        </div>
        <div className="bg-[#151924] p-4 rounded-lg border border-[#2A2E39]">
          <h3 className="text-gray-400 text-sm mb-1">Calibration Status</h3>
          <div className="text-2xl font-bold text-blue-400">GOOD</div>
        </div>
        <div className="bg-[#151924] p-4 rounded-lg border border-[#2A2E39]">
          <h3 className="text-gray-400 text-sm mb-1">Recent Performance</h3>
          <div className="text-2xl font-bold text-yellow-400">STABLE</div>
        </div>
        <div className="bg-[#151924] p-4 rounded-lg border border-[#2A2E39]">
          <h3 className="text-gray-400 text-sm mb-1">Active Profiles</h3>
          <div className="text-2xl font-bold text-white">{profileKeys.length}</div>
        </div>
      </div>

      <h2 className="text-xl font-bold text-[#E2E8F0] mb-4">Historical Adaptive Profiles</h2>
      
      {profileKeys.length === 0 ? (
        <div className="bg-[#151924] p-8 rounded-lg border border-[#2A2E39] text-center">
          <p className="text-gray-400 mb-4">No historical intelligence profiles found. System is in COLD START mode.</p>
          <button 
            onClick={handleSeedData}
            className="bg-[#2A2E39] hover:bg-[#323644] text-white px-4 py-2 rounded"
          >
            Generate Mock Data
          </button>
        </div>
      ) : (
        <div className="bg-[#151924] rounded-lg border border-[#2A2E39] overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#2A2E39] bg-[#1A1F2E]">
                <th className="p-3 text-sm font-medium text-gray-400">Context</th>
                <th className="p-3 text-sm font-medium text-gray-400">Sample Size</th>
                <th className="p-3 text-sm font-medium text-gray-400">Historical Win Rate</th>
                <th className="p-3 text-sm font-medium text-gray-400">Avg R</th>
                <th className="p-3 text-sm font-medium text-gray-400">Reliability</th>
              </tr>
            </thead>
            <tbody>
              {profileKeys.map(key => {
                const p = profiles[key];
                return (
                  <tr key={key} className="border-b border-[#2A2E39] hover:bg-[#1A1F2E]">
                    <td className="p-3">
                      <span className="font-bold text-blue-400">{p.symbol}</span>
                      <span className="text-gray-400 mx-2">•</span>
                      <span className="text-gray-300">{p.timeframe}</span>
                      <span className="text-gray-400 mx-2">•</span>
                      <span className={p.direction === 'LONG' ? 'text-green-400' : 'text-red-400'}>{p.direction}</span>
                      <span className="text-gray-400 mx-2">•</span>
                      <span className="text-purple-400">{p.regime}</span>
                    </td>
                    <td className="p-3 text-gray-300">{p.sampleSize}</td>
                    <td className="p-3 text-gray-300">{p.winRate.toFixed(1)}%</td>
                    <td className="p-3 text-gray-300">+{p.avgR.toFixed(2)}R</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 text-xs rounded font-bold ${
                        p.reliability === 'HIGH' ? 'bg-green-900/50 text-green-400' :
                        p.reliability === 'MEDIUM' ? 'bg-yellow-900/50 text-yellow-400' :
                        'bg-red-900/50 text-red-400'
                      }`}>
                        {p.reliability}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
         <div className="bg-[#151924] p-4 rounded-lg border border-[#2A2E39]">
            <h2 className="text-xl font-bold text-[#E2E8F0] mb-4">Agent Reliability</h2>
            <div className="space-y-4">
              {[
                { name: 'Technical', acc: 86 },
                { name: 'Liquidity', acc: 84 },
                { name: 'Structure', acc: 81 },
                { name: 'Sentiment', acc: 72 },
                { name: 'Pattern', acc: 68 }
              ].map(agent => (
                <div key={agent.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-300">{agent.name}</span>
                    <span className="text-gray-400">{agent.acc}%</span>
                  </div>
                  <div className="w-full bg-[#0B0E14] rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${agent.acc}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
         </div>

         <div className="bg-[#151924] p-4 rounded-lg border border-[#2A2E39]">
            <h2 className="text-xl font-bold text-[#E2E8F0] mb-4">Calibration Chart</h2>
            <div className="flex items-center justify-center h-48 bg-[#0B0E14] rounded border border-[#2A2E39]">
               <span className="text-gray-500 text-sm">Calibration Chart UI Placeholder</span>
            </div>
         </div>
      </div>
    </div>
  );
};
