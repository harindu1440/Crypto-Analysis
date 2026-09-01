import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/common/Card';
import { GlossaryTooltip } from '../components/common/GlossaryTooltip';
import { AnalysisChart } from '../components/charts/AnalysisChart';
import { AlertTriangle, Clock, ArrowLeft, Send } from 'lucide-react';
import './OpportunityDetail.css';

export default function OpportunityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [opp, setOpp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [liveData, setLiveData] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  
  
  // Execution state
  const [account, setAccount] = useState<any>(null);
  const [executing, setExecuting] = useState(false);
  const [scheduleTime, setScheduleTime] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Risk Calculator State
  const [calcAccountSize, setCalcAccountSize] = useState(1000);
  const [calcRiskPct, setCalcRiskPct] = useState(1);

  useEffect(() => {
    const fetchOpp = async () => {
      try {
        const res = await fetch(`/api/opportunities/${id}`);
        if (res.ok) setOpp(await res.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    
    const fetchAccount = async () => {
      try {
        const res = await fetch('/api/account');
        if (res.ok) setAccount(await res.json());
      } catch (e) {
        console.error(e);
      }
    };

    const fetchTimeline = async () => {
      try {
        const res = await fetch(`/api/opportunities/${id}/timeline`);
        if (res.ok) setTimeline(await res.json());
      } catch (e) {
        console.error(e);
      }
    };

    fetchOpp();
    fetchAccount();
    fetchTimeline();

    // SSE Connection for Live Updates
    const evtSource = new EventSource('/api/events');
    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.eventType === 'MARKET_UPDATE' && data.symbol === opp?.symbol) {
          setLiveData(data.payload);
        } else if (
          (data.eventType === 'OPPORTUNITY_UPDATED' || 
           data.eventType === 'OPPORTUNITY_APPROACHING' || 
           data.eventType === 'ENTRY_TRIGGERED' || 
           data.eventType === 'OPPORTUNITY_INVALIDATED') && 
          data.payload.opportunityId === id
        ) {
          fetchOpp();
          fetchTimeline();
        }
      } catch (e) {
        console.error('Error parsing SSE event:', e);
      }
    };

    const int = setInterval(() => {
      fetchOpp();
      fetchTimeline();
      setCurrentTime(Date.now());
    }, 5000); // reduced polling frequency since we have SSE
    
    return () => {
      clearInterval(int);
      evtSource.close();
    };
  }, [id, opp?.symbol]);

  if (loading) return <div>Loading Opportunity...</div>;
  if (!opp) return <div className="not-found">Opportunity not found or expired.</div>;

  const isLive = opp.status === 'ACTIVE' || opp.status === 'DETECTED';

  // Calculator Logic
  const plannedRiskAmount = (calcAccountSize * calcRiskPct) / 100;
  const entryPrice = opp.entryPrice;
  const stopLoss = opp.stopLoss;
  const riskPerCoin = Math.abs(entryPrice - stopLoss);
  const suggestedQty = riskPerCoin > 0 ? plannedRiskAmount / riskPerCoin : 0;
  
  const handleExecute = async () => {
    if (!account?.automatedTradingEnabled) return;
    setExecuting(true);
    try {
      const res = await fetch(`/api/risk/validate/${opp.symbol}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           accountEquity: calcAccountSize,
           riskPerTradePercent: calcRiskPct
        })
      });
      const tradePlan = await res.json();
      
      if (tradePlan.validation.status === 'VALID') {
        const executeAt = Date.now() + 5000; // Simulated entry timer
        await fetch(`/api/execution/schedule/${tradePlan.planId}`, { method: 'POST' });
        setScheduleTime(executeAt);
        alert('Trade Scheduled successfully!');
      } else {
        alert('Validation failed: ' + tradePlan.validation.reasons.join(', '));
      }
    } catch (e: any) {
      alert('Execution failed: ' + e.message);
    } finally {
      setExecuting(false);
    }
  };

  const timeRemaining = Math.max(0, scheduleTime - currentTime);

  return (
    <div className="opportunity-detail-container">
      <button className="back-btn" onClick={() => navigate('/dashboard')}><ArrowLeft size={16}/> Back to Dashboard</button>
      
      {/* 2. TOP LEVEL DECISION */}
      <div className={`decision-banner ${opp.direction.toLowerCase()}`}>
        <div className="decision-header">
          <div className="flex flex-col gap-1">
            <h1>{opp.symbol}</h1>
            {liveData && (
              <span className="text-xl text-gray-300 font-mono">
                Live Price: ${liveData.price.toFixed(4)}
              </span>
            )}
          </div>
          <div className="decision-badge">
            {opp.direction === 'LONG' ? '🟢 LONG' : opp.direction === 'SHORT' ? '🔴 SHORT' : '⚪ NO TRADE'}
          </div>
        </div>
        <div className="decision-sub">
          <span><GlossaryTooltip term="AI Confidence">AI Confidence</GlossaryTooltip>: {opp.confidence}%</span>
          <span>Market: {opp.marketStructure || 'Unknown'}</span>
          <span className={`status-badge ${opp.status.toLowerCase()}`}>
            Status: {opp.status}
          </span>
        </div>
      </div>

      {opp.adaptiveIntelligence && opp.adaptiveIntelligence.adaptiveStatus !== 'NOT_APPLICABLE' && (
        <div className="adaptive-banner mb-6 p-4 rounded-lg bg-[#151924] border border-[#2A2E39]">
          <h3 className="text-blue-400 font-bold mb-2 flex items-center gap-2">
            <GlossaryTooltip term="ADAPTIVE CONFIDENCE">Adaptive Intelligence</GlossaryTooltip> 
            <span className={`px-2 py-0.5 text-xs rounded ${opp.adaptiveIntelligence.adaptiveStatus === 'COLD_START' ? 'bg-gray-700 text-gray-300' : 'bg-blue-900/50 text-blue-300'}`}>
              {opp.adaptiveIntelligence.adaptiveStatus}
            </span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            <div>
              <div className="text-gray-400 text-xs">Quality Score</div>
              <div className="font-bold text-lg">{opp.qualityScore} / 100</div>
            </div>
            <div>
               <div className="text-gray-400 text-xs"><GlossaryTooltip term="SAMPLE SIZE">Sample Size</GlossaryTooltip></div>
               <div className="font-bold text-lg">{opp.adaptiveIntelligence.sampleSize}</div>
            </div>
            <div className="col-span-2">
               <div className="text-gray-400 text-xs">Historical Context</div>
               <div className="text-sm text-gray-300 mt-1">{opp.adaptiveIntelligence.historicalContext}</div>
            </div>
          </div>
        </div>
      )}

      {/* TIMELINE SECTION */}
      {timeline.length > 0 && (
        <div className="mb-6 p-5 rounded-xl bg-[#11141D] border border-[#2A2E39]">
          <h3 className="text-gray-300 font-bold mb-4">Signal Lifecycle</h3>
          <div className="flex gap-4 items-center overflow-x-auto pb-2">
            {timeline.map((step, idx) => (
              <div key={idx} className="flex items-center">
                <div className="flex flex-col items-center min-w-[120px]">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-[#1A1F2C] border-2 border-blue-500 text-blue-400 z-10">
                    {idx + 1}
                  </div>
                  <span className="text-xs text-gray-400 mt-2 text-center break-words">{step.status}</span>
                  <span className="text-[10px] text-gray-500 text-center">{new Date(step.timestamp).toLocaleTimeString()}</span>
                </div>
                {idx < timeline.length - 1 && (
                  <div className="w-12 h-[2px] bg-blue-900/50 -ml-2 -mr-2 mt-[-24px]"></div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid-layout main-grid">
        <div className="left-column">
          
          {/* 3. DECISION SUMMARY */}
          <Card title="Why AI Likes This Setup">
            <div className="reasoning-box">
              <p>{opp.reason}</p>
            </div>
          </Card>

          {/* 14. INTERACTIVE CHART ENHANCEMENT */}
          <div className="chart-section">
            <AnalysisChart symbol={opp.symbol} />
          </div>

          {/* 5, 6, 7. ENTRY, SL, TP ZONES */}
          <div className="trade-zones">
            <Card title="Trade Parameters">
              <div className="zone-grid">
                <div className="zone-item entry-zone">
                  <label><GlossaryTooltip term="ENTRY ZONE">ENTRY ZONE</GlossaryTooltip></label>
                  <div className="price-range">${opp.entryZone.min.toFixed(4)} - ${opp.entryZone.max.toFixed(4)}</div>
                  <div className="explanation">Condition: Wait for confirmation in this zone.</div>
                </div>
                
                <div className="zone-item sl-zone">
                  <label><GlossaryTooltip term="STOP LOSS">STOP LOSS</GlossaryTooltip></label>
                  <div className="price-value">${opp.stopLoss.toFixed(4)}</div>
                  <div className="explanation">Invalidates the setup if hit.</div>
                </div>
                
                <div className="zone-item tp-zone">
                  <label><GlossaryTooltip term="TAKE PROFIT">TAKE PROFIT</GlossaryTooltip></label>
                  {opp.takeProfitTargets.map((tp: number, i: number) => (
                    <div key={i} className="price-value tp-val">TP{i+1}: ${tp.toFixed(4)}</div>
                  ))}
                  <div className="explanation">Targets for securing profit.</div>
                </div>
              </div>
            </Card>
          </div>
          
          <div className="mt-6 mb-6 p-5 rounded-xl bg-[#0f1219] border border-blue-900/30">
            <h3 className="text-blue-300 font-bold mb-2">What Happens Next?</h3>
            <p className="text-gray-300 text-sm mb-2">
              The AI has detected this setup, but it is currently <strong className="text-white">{opp.status}</strong>.
            </p>
            <ul className="list-disc list-inside text-sm text-gray-400 space-y-1 ml-2">
              <li>If the Live Price drops below the Stop Loss before reaching the Entry Zone, this setup will be INVALIDATED.</li>
              <li>When the Live Price enters the Entry Zone, the system will mark this as ENTRY_TRIGGERED.</li>
              <li>You can optionally schedule an automated execution below, which will wait until the entry is triggered.</li>
            </ul>
          </div>

          {/* 11 & 12. AI CONSENSUS & MULTI-TIMEFRAME */}
          <div className="grid-layout half-grid">
            <Card title="AI Consensus">
              <div className="consensus-panel">
                {opp.agents?.map((agent: any) => (
                  <div key={agent.name} className="agent-row">
                    <span>{agent.name}</span>
                    <strong className={agent.bias.toLowerCase()}>{agent.bias}</strong>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Multi-Timeframe">
              <div className="timeframe-panel">
                 {opp.timeframes?.map((tf: any) => (
                  <div key={tf.timeframe} className="tf-row">
                    <span>{tf.timeframe}</span>
                    <strong className={tf.bias.toLowerCase()}>{tf.bias}</strong>
                  </div>
                ))}
              </div>
            </Card>
          </div>

        </div>

        <div className="right-column">
          
          {/* 4. WHAT SHOULD I DO GUIDE */}
          <Card title="What Happens Next?">
            <div className="beginner-guide">
              <ol>
                <li>Wait for price to enter the <strong>Entry Zone</strong>.</li>
                <li>If the setup remains valid, the trade can trigger.</li>
                <li><strong>Stop Loss</strong> protects against excessive downside.</li>
                <li><strong>Take Profit</strong> levels define potential exit areas.</li>
                <li>If the invalidation condition occurs, the setup is cancelled.</li>
              </ol>
            </div>
          </Card>

          {/* 8. RISK / REWARD VISUALIZER */}
          <Card title="Risk / Reward">
            <div className="rr-visualizer">
              <div className="rr-bar">
                <div className="risk-part" style={{ flex: 1 }}></div>
                <div className="reward-part" style={{ flex: opp.riskRewardRatio }}></div>
              </div>
              <div className="rr-text">
                R:R = 1 : {opp.riskRewardRatio?.toFixed(2)}
              </div>
              <p className="rr-tooltip"><GlossaryTooltip term="RISK/REWARD">Risk / Reward Ratio</GlossaryTooltip></p>
            </div>
          </Card>

          {/* 9 & 10. POSITION SIZE CALCULATOR */}
          <Card title="Position Size Calculator (Planning)">
            <div className="calculator-form">
              <div className="form-group">
                <label>Account Size (USDT)</label>
                <input type="number" value={calcAccountSize} onChange={e => setCalcAccountSize(Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label>Risk Percentage (%)</label>
                <input type="number" step="0.1" value={calcRiskPct} onChange={e => setCalcRiskPct(Number(e.target.value))} />
              </div>
              
              <div className="calc-result">
                <div className="max-risk-warn">
                  <AlertTriangle size={14}/> MAX PLANNED RISK: ${plannedRiskAmount.toFixed(2)}
                </div>
                <div className="calc-details">
                  <div className="detail-row"><span>Suggested Qty:</span> <strong>{suggestedQty.toFixed(4)} {opp.symbol.replace('USDT','')}</strong></div>
                  <div className="detail-row"><span>Est. Risk Amount:</span> <strong>${plannedRiskAmount.toFixed(2)}</strong></div>
                </div>
              </div>
            </div>
          </Card>

          {/* 17. SETUP INVALIDATION */}
          <Card title="Setup Invalidation">
            <div className="invalidation-box">
              <p>{opp.invalidationCondition}</p>
            </div>
          </Card>

          {/* 23 & 24. EXECUTION CTA */}
          <Card title="Execution">
            <div className="execution-panel">
              <div className="binance-status-display">
                <span>BINANCE ACCOUNT</span>
                <strong>{account?.status === 'CONNECTED' ? 'Connected' : 'Not Connected'}</strong>
              </div>
              
              {!account || account.status !== 'CONNECTED' ? (
                <div className="no-execute">
                  <p>Connect Binance to enable automated execution.</p>
                  <button className="cta-btn secondary" onClick={() => navigate('/settings')}>Go to Settings</button>
                </div>
              ) : !account.automatedTradingEnabled ? (
                <div className="no-execute">
                  <p>Automated Trading is OFF in Settings.</p>
                  <button className="cta-btn secondary" onClick={() => navigate('/settings')}>ENABLE AUTOMATED TRADING</button>
                </div>
              ) : (
                <div className="live-execute">
                  <div className="live-warn">LIVE AUTOMATED TRADING ON</div>
                  
                  {scheduleTime > 0 && timeRemaining > 0 ? (
                    <div className="countdown-box">
                      <Clock size={16}/> ENTRY WINDOW: {Math.floor(timeRemaining / 60000)}:{(Math.floor(timeRemaining/1000)%60).toString().padStart(2,'0')}
                    </div>
                  ) : (
                    <button 
                      className={`cta-btn primary ${executing ? 'loading' : ''}`}
                      onClick={handleExecute}
                      disabled={!isLive || executing}
                    >
                      <Send size={16}/> {executing ? 'Scheduling...' : 'TRADE AUTOMATION ACTIVE (TEST LIVE ORDER)'}
                    </button>
                  )}
                  <p className="execution-note">This will send a real order to Binance based on the global risk settings.</p>
                </div>
              )}
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
