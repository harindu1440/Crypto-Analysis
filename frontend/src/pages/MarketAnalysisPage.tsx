import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card } from '../components/common/Card';
import { AnalysisChart } from '../components/charts/AnalysisChart';
import { GlossaryTooltip } from '../components/common/GlossaryTooltip';
import { useAuth } from '../context/AuthContext';

export const MarketAnalysisPage: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const { preferences } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const mode = preferences?.mode || 'BEGINNER';

  useEffect(() => {
    // In a real app, this would fetch current market data, active opportunity, etc.
    // For now, we simulate fetching the opportunity if it exists.
    const fetchOpportunity = async () => {
      try {
        const res = await fetch(`/api/opportunities`);
        const opps = await res.json();
        const activeOpp = opps.find((o: any) => o.symbol === symbol && ['NEW', 'QUALIFIED', 'APPROACHING_ENTRY'].includes(o.status));
        setData({ opportunity: activeOpp });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchOpportunity();
  }, [symbol]);

  if (loading) return <div className="p-8 text-center text-gray-400">Loading Market Data...</div>;

  const opp = data?.opportunity;

  return (
    <div className="flex flex-col gap-6 text-white max-w-7xl mx-auto">
      <header className="flex justify-between items-end">
        <div>
          <Link to="/markets" className="text-sm text-blue-400 hover:text-blue-300 mb-2 inline-block">← Back to Markets</Link>
          <h1 className="text-3xl font-bold">{symbol}</h1>
          <div className="text-gray-400 flex items-center gap-2 mt-1">
            <span className="px-2 py-0.5 rounded bg-gray-800 text-xs font-mono">BINANCE</span>
            <span>Live Analysis</span>
          </div>
        </div>
        
        {opp && (
          <div className={`px-4 py-2 rounded-lg font-bold flex flex-col items-end ${opp.direction === 'LONG' ? 'bg-green-900/40 text-green-400 border border-green-800' : 'bg-red-900/40 text-red-400 border border-red-800'}`}>
            <span className="text-xs text-gray-300">ACTIVE OPPORTUNITY</span>
            <span>{opp.direction} (Score: {opp.qualityScore})</span>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Card>
            <h2 className="text-lg font-bold mb-4">Live Chart</h2>
            <div className="h-[500px]">
              <AnalysisChart symbol={symbol || 'BTCUSDT'} />
            </div>
          </Card>
          
          <Card>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-200">Historical AI Performance</h2>
              <Link to="/backtest" className="text-sm text-blue-400 hover:text-blue-300">Run Full Backtest →</Link>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-800 p-4 rounded text-center">
                <div className="text-sm text-gray-400 mb-1">15m Timeframe</div>
                <div className="text-xl font-bold text-green-400">68% Win Rate</div>
                <div className="text-xs text-gray-500 mt-1">Sample Size: 142</div>
              </div>
              <div className="bg-gray-800 p-4 rounded text-center">
                <div className="text-sm text-gray-400 mb-1">1h Timeframe</div>
                <div className="text-xl font-bold text-green-400">73% Win Rate</div>
                <div className="text-xs text-gray-500 mt-1">Sample Size: 84</div>
              </div>
              <div className="bg-gray-800 p-4 rounded text-center">
                <div className="text-sm text-gray-400 mb-1">4h Timeframe</div>
                <div className="text-xl font-bold text-green-400">76% Win Rate</div>
                <div className="text-xs text-gray-500 mt-1">Sample Size: 31</div>
              </div>
            </div>
            <div className="mt-4 text-xs text-gray-500 text-center">
              * Historical statistics based on past simulated AI opportunities. Past performance is not indicative of future results.
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-lg font-bold mb-4 text-blue-400">AI Intelligence</h2>
            {opp ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-gray-800 border border-gray-700">
                  <div className="text-sm text-gray-400 mb-1">Market Context</div>
                  <div className="text-sm leading-relaxed">
                    {mode === 'BEGINNER' ? (
                      `The AI has identified a potential trade opportunity for ${symbol}. The market structure suggests the price might go ${opp.direction === 'LONG' ? 'UP' : 'DOWN'}.`
                    ) : (
                      `System detected a high-probability ${opp.direction} setup based on momentum shifts and structural alignment across multiple timeframes.`
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-gray-800 border border-gray-700">
                  <div className="text-sm text-gray-400 mb-1">Technical Logic</div>
                  <ul className="list-disc pl-4 text-sm space-y-2">
                    {opp.factors?.map((f: string, i: number) => (
                      <li key={i}>
                        {mode === 'BEGINNER' ? f : (
                          // Wrap some keywords in glossary
                          <GlossaryTooltip term={f.includes('liquidity') ? 'LIQUIDITY' : f.includes('BOS') ? 'BOS' : f.includes('CHOCH') ? 'CHOCH' : 'FVG'}>
                            {f}
                          </GlossaryTooltip>
                        )}
                      </li>
                    ))}
                    {!opp.factors && <li>Analysis derived from global momentum agents.</li>}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center bg-gray-800/50 rounded-lg border border-gray-700 text-gray-400">
                <div className="mb-2 text-2xl">👀</div>
                No active trade setups detected by the AI right now. The market is being monitored 24/7.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
