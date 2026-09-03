import React, { useEffect, useState, useMemo } from 'react';
import { Card } from '../components/common/Card';
import { useAuth } from '../context/AuthContext';
import { GlossaryTooltip } from '../components/common/GlossaryTooltip';
import { Activity, ShieldCheck, AlertTriangle, ArrowRight, Ban, Filter, BarChart2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Signals: React.FC = () => {
  const { preferences, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();

  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [aiStatus, setAiStatus] = useState<any>(null);
  const [monitorStatus, setMonitorStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Filters & Sorting
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'WATCHLIST' | 'LONG' | 'SHORT' | 'HIGH_QUALITY' | 'APPROACHING' | 'NEW'>('ALL');
  const [sortBy, setSortBy] = useState<'QUALITY' | 'NEWEST' | 'CONFIDENCE'>('QUALITY');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [oppRes, watchRes, aiRes, monRes] = await Promise.all([
          fetch('/api/opportunities').catch(() => null),
          fetch('/api/user/watchlist').catch(() => null),
          fetch('/api/ai/status').catch(() => null),
          fetch('/api/monitoring/status').catch(() => null)
        ]);
        
        if (oppRes?.ok) setOpportunities(await oppRes.json());
        else setError(true);
        
        if (watchRes?.ok) setWatchlist(await watchRes.json());
        if (aiRes?.ok) setAiStatus(await aiRes.json());
        if (monRes?.ok) setMonitorStatus(await monRes.json());
      } catch (err) {
        console.error(err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();

    // SSE Real-time Updates
    const evtSource = new EventSource('/api/events');
    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.eventType === 'OPPORTUNITY_CREATED' || 
          data.eventType === 'OPPORTUNITY_UPDATED' || 
          data.eventType === 'OPPORTUNITY_INVALIDATED' || 
          data.eventType === 'OPPORTUNITY_APPROACHING' ||
          data.eventType === 'ENTRY_TRIGGERED'
        ) {
           // We just refetch the opportunities list on any state change for simplicity and consistency
           fetch('/api/opportunities')
             .then(res => res.ok ? res.json() : [])
             .then(opps => setOpportunities(opps));
        }
      } catch (e) {
        console.error('SSE Error:', e);
      }
    };

    const interval = setInterval(() => setCurrentTime(Date.now()), 60000); // 1 min updates for expiry

    return () => {
      evtSource.close();
      clearInterval(interval);
    };
  }, []);

  const handleRetry = () => {
    setLoading(true);
    setError(false);
    fetch('/api/opportunities')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(setOpportunities)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  const filteredAndSortedOpps = useMemo(() => {
    // 1. Base User Preference Filtering
    let filtered = opportunities.filter(opp => {
      if (opp.status === 'EXPIRED' || opp.expiresAt < currentTime) return false;
      if (opp.status === 'INVALIDATED' || opp.status === 'CANCELLED') return false;
      
      // Global User Preferences
      if (preferences?.minQualityScore && opp.qualityScore < preferences.minQualityScore) return false;
      if (preferences?.direction && preferences.direction !== 'BOTH' && opp.direction !== preferences.direction) return false;
      
      return true;
    });

    // 2. Active UI Filter
    filtered = filtered.filter(opp => {
      switch (activeFilter) {
        case 'WATCHLIST': return watchlist.includes(opp.symbol);
        case 'LONG': return opp.direction === 'LONG';
        case 'SHORT': return opp.direction === 'SHORT';
        case 'HIGH_QUALITY': return opp.qualityScore >= 85;
        case 'APPROACHING': return opp.status === 'APPROACHING_ENTRY' || opp.status === 'ENTRY_TRIGGERED';
        case 'NEW': return (currentTime - opp.createdAt) < 3600000; // < 1 hour old
        default: return true;
      }
    });

    // 3. Sorting
    filtered.sort((a, b) => {
      if (sortBy === 'QUALITY') return b.qualityScore - a.qualityScore;
      if (sortBy === 'NEWEST') return b.createdAt - a.createdAt;
      if (sortBy === 'CONFIDENCE') return b.confidence - a.confidence;
      return 0;
    });

    return filtered;
  }, [opportunities, activeFilter, sortBy, preferences, watchlist, currentTime]);

  if (loading || isAuthLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-secondary)' }}>
        <Activity size={32} className="animate-spin mb-4" />
        <p>Loading AI opportunities...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <AlertTriangle size={32} color="var(--color-negative)" style={{ marginBottom: '16px' }} />
        <h2 style={{ margin: '0 0 8px 0' }}>Unable to load live opportunities.</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>Market intelligence is still running.</p>
        <button 
          onClick={handleRetry}
          style={{ padding: '8px 16px', backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px', cursor: 'pointer' }}
        >
          RETRY
        </button>
      </div>
    );
  }

  const isAiOffline = aiStatus?.status === 'OFFLINE';
  const isQuotaExhausted = aiStatus?.status === 'QUOTA_EXHAUSTED';
  const mode = preferences?.mode || 'BEGINNER';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      
      {/* 24. REAL-TIME SYSTEM INDICATOR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--panel-bg)', padding: '12px 24px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
            <Activity size={18} color="var(--color-positive)" />
            MARKET INTELLIGENCE <span style={{ color: 'var(--color-positive)', fontSize: '12px' }}>● LIVE</span>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', gap: '16px', borderLeft: '1px solid var(--border-color)', paddingLeft: '16px' }}>
            <span>{monitorStatus?.assets?.length || 0} Assets Monitored</span>
            <span>{opportunities.filter(o => !['EXPIRED', 'INVALIDATED'].includes(o.status)).length} Active Opportunities</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            AI Engine: <span style={{ color: isAiOffline ? 'var(--color-negative)' : 'var(--color-positive)', fontWeight: 'bold' }}>{aiStatus?.status || 'UNKNOWN'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            Market: <span style={{ color: monitorStatus?.running ? 'var(--color-positive)' : 'var(--color-negative)', fontWeight: 'bold' }}>{monitorStatus?.running ? 'LIVE' : 'PAUSED'}</span>
          </div>
        </div>
      </div>

      {aiStatus?.providers && aiStatus.providers.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          {aiStatus.providers.map((p: any) => (
            <div key={p.name} style={{ backgroundColor: 'var(--panel-bg)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <strong style={{ textTransform: 'capitalize' }}>{p.name.replace('-provider', '')}</strong>
                <span style={{ 
                  color: p.health.status === 'HEALTHY' ? 'var(--color-positive)' : 
                         p.health.status === 'DEGRADED' ? 'var(--color-warning)' : 'var(--color-negative)',
                  fontWeight: 'bold' 
                }}>
                  {p.health.status}
                </span>
              </div>
              <div style={{ color: 'var(--text-secondary)' }}>Role: {p.role}</div>
            </div>
          ))}
        </div>
      )}

      {isQuotaExhausted && (
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-negative)', padding: '16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Ban size={20} color="var(--color-negative)" />
          <div>
            <h3 style={{ margin: '0 0 4px 0', color: 'var(--color-negative)' }}>AI ENGINE 🔴 QUOTA EXHAUSTED</h3>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>Daily API quota has been reached. Market monitoring: LIVE | AI analysis: PAUSED. Existing opportunities will continue to be monitored.</p>
          </div>
        </div>
      )}

      {isAiOffline && !isQuotaExhausted && (
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-negative)', padding: '16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Ban size={20} color="var(--color-negative)" />
          <div>
            <h3 style={{ margin: '0 0 4px 0', color: 'var(--color-negative)' }}>AI ANALYSIS PAUSED</h3>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>Market data: LIVE | AI Engine: OFFLINE. Existing opportunities will continue to be monitored safely.</p>
          </div>
        </div>
      )}

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '24px', margin: '0 0 8px 0' }}>Trading Signals</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Live AI-generated trade opportunities based on your risk profile.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
           <Filter size={16} color="var(--text-secondary)" />
           <select 
             value={activeFilter} 
             onChange={(e) => setActiveFilter(e.target.value as any)}
             style={{ padding: '6px 12px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px', fontSize: '12px' }}
           >
             <option value="ALL">All Qualified</option>
             <option value="WATCHLIST">My Watchlist</option>
             <option value="LONG">Long Only</option>
             <option value="SHORT">Short Only</option>
             <option value="HIGH_QUALITY">High Quality (85+)</option>
             <option value="APPROACHING">Approaching Entry</option>
             <option value="NEW">New (Last 1h)</option>
           </select>

           <BarChart2 size={16} color="var(--text-secondary)" style={{ marginLeft: '8px' }} />
           <select 
             value={sortBy} 
             onChange={(e) => setSortBy(e.target.value as any)}
             style={{ padding: '6px 12px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px', fontSize: '12px' }}
           >
             <option value="QUALITY">Highest Quality</option>
             <option value="NEWEST">Newest</option>
             <option value="CONFIDENCE">Highest Confidence</option>
           </select>
        </div>
      </header>

      {filteredAndSortedOpps.length === 0 ? (
        <div style={{ backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '40px', textAlign: 'center' }}>
          <ShieldCheck size={48} color="var(--primary-color)" style={{ margin: '0 auto 16px auto', opacity: 0.5 }} />
          <h2 style={{ margin: '0 0 8px 0', fontSize: '20px' }}>NO ACTIVE OPPORTUNITIES</h2>
          <p style={{ margin: '0 0 16px 0', color: 'var(--text-secondary)' }}>The AI is continuously monitoring the market for setups matching your criteria.</p>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {monitorStatus?.assets?.length || 0} assets currently monitored.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          {filteredAndSortedOpps.map((opp) => {
            const isLong = opp.direction === 'LONG';
            const color = isLong ? 'var(--color-positive)' : 'var(--color-negative)';
            
            // Risk Reward Calculation
            const risk = Math.abs(opp.entryPrice - opp.stopLoss);
            const reward = Math.abs(opp.takeProfitTargets[0] - opp.entryPrice);
            const rr = risk > 0 ? (reward / risk).toFixed(1) : 'N/A';

            return (
              <Card key={opp.id} className={`signal-card ${opp.status.toLowerCase()}`} style={{ borderTop: `4px solid ${color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div>
                    <h3 
                      style={{ margin: '0 0 4px 0', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                      onClick={() => navigate(`/markets/${opp.symbol}`)}
                    >
                      {isLong ? '🟢' : '🔴'} {opp.symbol}
                    </h3>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '12px' }}>
                      <span style={{ fontWeight: 'bold', color }}>{opp.direction}</span>
                      <span><GlossaryTooltip term="Quality Score">Quality Score</GlossaryTooltip>: <strong style={{ color: 'var(--text-primary)' }}>{opp.qualityScore}/100</strong></span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Status</div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', padding: '4px 8px', backgroundColor: 'var(--bg-color)', borderRadius: '4px', border: '1px solid var(--border-color)', marginTop: '4px' }}>
                      {opp.status.replace('_', ' ')}
                    </div>
                  </div>
                </div>
                
                {mode === 'BEGINNER' ? (
                  <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.05)', padding: '12px', borderRadius: '4px', marginBottom: '16px', fontSize: '13px' }}>
                    <strong style={{ color: 'var(--primary-color)', display: 'block', marginBottom: '4px' }}>What this means:</strong>
                    <span style={{ color: 'var(--text-secondary)' }}>The AI sees a potential opportunity for price to move {isLong ? 'higher' : 'lower'}.</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', fontSize: '12px', paddingBottom: '16px', borderBottom: '1px dashed var(--border-color)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span><GlossaryTooltip term="Market Regime">Regime</GlossaryTooltip>: <strong>{opp.marketStructure || 'TRENDING'}</strong></span>
                      <span><GlossaryTooltip term="AI Confidence">Confidence</GlossaryTooltip>: <strong>{opp.confidence}%</strong></span>
                    </div>
                    {opp.adaptiveIntelligence && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'right' }}>
                         <span><GlossaryTooltip term="ADAPTIVE CONFIDENCE">Adaptive</GlossaryTooltip>: <strong>{opp.adaptiveIntelligence.adaptiveStatus}</strong></span>
                         <span><GlossaryTooltip term="SAMPLE SIZE">Sample</GlossaryTooltip>: <strong>{opp.adaptiveIntelligence.sampleSize}</strong></span>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px', fontSize: '13px' }}>
                   <div>
                     <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginBottom: '2px' }}><GlossaryTooltip term="ENTRY ZONE">Entry Zone</GlossaryTooltip></div>
                     <div style={{ fontWeight: 'bold' }}>${opp.entryZone.min.toLocaleString()} - ${opp.entryZone.max.toLocaleString()}</div>
                   </div>
                   <div>
                     <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginBottom: '2px' }}><GlossaryTooltip term="STOP LOSS">Stop Loss</GlossaryTooltip></div>
                     <div style={{ fontWeight: 'bold', color: 'var(--color-negative)' }}>${opp.stopLoss.toLocaleString()}</div>
                     {mode === 'BEGINNER' && <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>Safety net if wrong</div>}
                   </div>
                   <div>
                     <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginBottom: '2px' }}><GlossaryTooltip term="TAKE PROFIT">Take Profit</GlossaryTooltip></div>
                     <div style={{ fontWeight: 'bold', color: 'var(--color-positive)' }}>${opp.takeProfitTargets[0].toLocaleString()}</div>
                   </div>
                   <div>
                     <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginBottom: '2px' }}>Risk/Reward</div>
                     <div style={{ fontWeight: 'bold' }}>1 : {rr}</div>
                   </div>
                </div>

                <button 
                  onClick={() => navigate(`/opportunities/${opp.id}`)}
                  style={{ width: '100%', padding: '12px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--primary-color)', color: 'var(--primary-color)', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontWeight: 'bold', transition: 'all 0.2s' }}
                  onMouseOver={(e) => { (e.currentTarget as any).style.backgroundColor = 'var(--primary-color)'; (e.currentTarget as any).style.color = 'white'; }}
                  onMouseOut={(e) => { (e.currentTarget as any).style.backgroundColor = 'var(--bg-color)'; (e.currentTarget as any).style.color = 'var(--primary-color)'; }}
                >
                  VIEW FULL ANALYSIS <ArrowRight size={16} />
                </button>

              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Signals;
