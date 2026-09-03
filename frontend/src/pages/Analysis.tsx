import React, { useState, useEffect } from 'react';
import { Card } from '../components/common/Card';
import { AnalysisChart } from '../components/charts/AnalysisChart';
import { Cpu, AlertTriangle, CheckCircle, Settings, ShieldCheck, XCircle, Clock, Send, Ban, Activity, Power, PowerOff, Plus, Trash2, Play, Pause } from 'lucide-react';
import { useGlobalMarketData } from '../context/MarketDataContext';
import { 
  triggerAiAnalysis, getRiskConfig, validateTradePlan, 
  getUpcomingExecutions, scheduleExecution, cancelExecution,
  getMonitoringStatus, getMonitoringEvents, startMonitoring, stopMonitoring,
  addMonitoredAsset, removeMonitoredAsset, enableMonitoredAsset, disableMonitoredAsset,
  getAccountStatus, getAccountBalances, getAccountOrders
} from '../services/binanceApi';

const Analysis: React.FC = () => {
  const { selectedSymbols } = useGlobalMarketData();
  const [asset, setAsset] = useState(selectedSymbols[0] || 'BTCUSDT');
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Phase 6: Risk Management State
  const [riskConfig, setRiskConfig] = useState<any>(null);
  const [showRiskConfig, setShowRiskConfig] = useState(false);
  const [tradePlan, setTradePlan] = useState<any>(null);
  const [planLoading, setPlanLoading] = useState(false);
  
  // Phase 7: Execution State
  const [upcomingExecutions, setUpcomingExecutions] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // Phase 8: Monitoring State
  const [monitorStatus, setMonitorStatus] = useState<any>(null);
  const [monitorEvents, setMonitorEvents] = useState<any[]>([]);
  const [newAssetInput, setNewAssetInput] = useState('');

  // Phase 9: Account State
  const [accountStatus, setAccountStatus] = useState<any>(null);
  const [accountBalances, setAccountBalances] = useState<any[]>([]);
  const [accountOrders, setAccountOrders] = useState<any[]>([]);

  useEffect(() => {
    getRiskConfig().then(config => setRiskConfig(config)).catch(console.error);
    
    // Poll upcoming executions and monitoring status every 2 seconds
    const pollSystem = async () => {
      try {
        const [executions, mStatus, mEvents, aStatus, aBals, aOrds] = await Promise.all([
          getUpcomingExecutions().catch(() => []),
          getMonitoringStatus().catch(() => null),
          getMonitoringEvents().catch(() => []),
          getAccountStatus().catch(() => null),
          getAccountBalances().catch(() => []),
          getAccountOrders().catch(() => [])
        ]);
        setUpcomingExecutions(executions);
        setMonitorStatus(mStatus);
        
        // We will merge polled events with SSE, but polling is safe fallback
        setMonitorEvents(prev => {
          // Deduplicate by id if possible, simple approach: just use new for now
          return mEvents.length > 0 ? mEvents : prev;
        });

        setAccountStatus(aStatus);
        setAccountBalances(aBals);
        setAccountOrders(aOrds);
      } catch (e) {
        console.error("Failed to poll system status", e);
      }
    };
    
    pollSystem();
    const interval = setInterval(pollSystem, 5000); // reduced frequency
    
    // SSE for real-time alerts
    const evtSource = new EventSource('/api/events');
    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.eventType === 'SYSTEM_ALERT') {
          setMonitorEvents(prev => [{
            id: Date.now().toString(),
            timestamp: Date.now(),
            type: 'WARNING',
            symbol: 'SYSTEM',
            message: data.payload.message
          }, ...prev].slice(0, 50));
        } else if (data.eventType === 'OPPORTUNITY_CREATED' || data.eventType === 'OPPORTUNITY_UPDATED') {
          setMonitorEvents(prev => [{
            id: Date.now().toString(),
            timestamp: Date.now(),
            type: 'INFO',
            symbol: data.symbol,
            message: `Opportunity ${data.payload?.to || 'Updated'}`
          }, ...prev].slice(0, 50));
        }
      } catch (e) {}
    };

    return () => {
      clearInterval(interval);
      evtSource.close();
    };
  }, []);

  // Update clock every second for countdowns
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // --- MANUAL ANALYSIS HANDLERS ---
  const handleRunAi = async () => {
    setAiLoading(true);
    setTradePlan(null);
    try {
      const result = await triggerAiAnalysis(asset);
      setAiResult(result);
    } catch (e: any) {
      console.error(e);
      alert('AI Analysis failed: ' + e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleValidatePlan = async () => {
    setPlanLoading(true);
    try {
      const result = await validateTradePlan(asset, riskConfig);
      setTradePlan(result);
    } catch (e: any) {
      console.error(e);
      alert('Trade Plan validation failed: ' + e.message);
    } finally {
      setPlanLoading(false);
    }
  };

  const handleScheduleExecution = async (planId: string) => {
    setScheduleLoading(true);
    try {
      await scheduleExecution(planId);
      const executions = await getUpcomingExecutions();
      setUpcomingExecutions(executions);
      setTradePlan(null);
    } catch (e: any) {
      console.error(e);
      alert('Scheduling failed: ' + e.message);
    } finally {
      setScheduleLoading(false);
    }
  };

  const handleCancelExecution = async (planId: string) => {
    try {
      await cancelExecution(planId);
      const executions = await getUpcomingExecutions();
      setUpcomingExecutions(executions);
    } catch (e: any) {
      console.error(e);
      alert('Cancellation failed: ' + e.message);
    }
  };

  const handleConfigChange = (key: string, value: string) => {
    setRiskConfig({ ...riskConfig, [key]: parseFloat(value) || 0 });
  };

  // --- MONITORING HANDLERS ---
  const handleToggleMonitoring = async () => {
    if (!monitorStatus) return;
    try {
      if (monitorStatus.running) await stopMonitoring();
      else await startMonitoring();
      const st = await getMonitoringStatus();
      setMonitorStatus(st);
    } catch (e: any) {
      alert('Failed to toggle monitor: ' + e.message);
    }
  };

  const handleAddMonitoredAsset = async () => {
    if (!newAssetInput) return;
    try {
      await addMonitoredAsset(newAssetInput.toUpperCase());
      setNewAssetInput('');
      const st = await getMonitoringStatus();
      setMonitorStatus(st);
    } catch (e: any) {
      alert('Failed to add asset: ' + e.message);
    }
  };

  const handleRemoveMonitoredAsset = async (sym: string) => {
    try {
      await removeMonitoredAsset(sym);
      const st = await getMonitoringStatus();
      setMonitorStatus(st);
    } catch (e: any) {
      alert('Failed to remove asset: ' + e.message);
    }
  };

  const handleToggleAsset = async (sym: string, currentlyEnabled: boolean) => {
    try {
      if (currentlyEnabled) await disableMonitoredAsset(sym);
      else await enableMonitoredAsset(sym);
      const st = await getMonitoringStatus();
      setMonitorStatus(st);
    } catch (e: any) {
      alert('Failed to toggle asset: ' + e.message);
    }
  };

  // Countdown Formatter
  const formatCountdown = (targetTime: number) => {
    const diff = targetTime - currentTime;
    if (diff <= 0) return "00:00";
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', margin: '0 0 8px 0' }}>Technical & AI Analysis</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Multi-agent AI market evaluation and deterministic indicators</p>
        </div>
        <button 
          onClick={() => setShowRiskConfig(!showRiskConfig)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px', cursor: 'pointer' }}
        >
          <Settings size={16} /> Risk Config
        </button>
      </header>

      {/* PHASE 9: BINANCE ACCOUNT DASHBOARD */}
      <Card>
        <h2 style={{ fontSize: '18px', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary-color)' }}>
          <ShieldCheck size={20} /> Binance Account ({accountStatus?.mode?.toUpperCase() || 'UNKNOWN'})
        </h2>
        
        {accountStatus?.error ? (
          <div style={{ padding: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-negative)', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
             <AlertTriangle size={16} /> ACCOUNT SYNC UNAVAILABLE: {accountStatus.error}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Connection</div>
              <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', color: accountStatus?.connected ? 'var(--color-positive)' : 'var(--color-negative)' }}>
                {accountStatus?.connected ? <CheckCircle size={14}/> : <XCircle size={14}/>} {accountStatus?.connected ? 'CONNECTED' : 'DISCONNECTED'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Last Sync</div>
              <div style={{ fontWeight: 'bold' }}>{accountStatus?.lastSyncAt ? new Date(accountStatus.lastSyncAt).toLocaleTimeString() : 'Never'}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Available USDT</div>
              <div style={{ fontWeight: 'bold', fontSize: '18px', color: 'var(--color-positive)' }}>
                ${accountBalances.find(b => b.asset === 'USDT')?.free?.toLocaleString() || '0.00'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Open Orders</div>
              <div style={{ fontWeight: 'bold' }}>{accountOrders.length}</div>
            </div>
          </div>
        )}
      </Card>

      {/* PHASE 8: CONTINUOUS MONITORING PANEL */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', margin: '0', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary-color)' }}>
            <Activity size={20} /> Continuous Asset Monitoring
          </h2>
          <button 
            onClick={handleToggleMonitoring}
            style={{ 
              padding: '6px 16px', 
              backgroundColor: monitorStatus?.running ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)', 
              color: monitorStatus?.running ? 'var(--color-negative)' : 'var(--color-positive)', 
              border: `1px solid ${monitorStatus?.running ? 'var(--color-negative)' : 'var(--color-positive)'}`, 
              borderRadius: '4px', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              fontWeight: 'bold'
            }}
          >
            {monitorStatus?.running ? <PowerOff size={16} /> : <Power size={16} />}
            {monitorStatus?.running ? 'STOP MONITOR' : 'START MONITOR'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
          <input 
            type="text" 
            placeholder="e.g. BTCUSDT" 
            value={newAssetInput} 
            onChange={(e) => setNewAssetInput(e.target.value)}
            style={{ padding: '8px 12px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px' }}
          />
          <button 
            onClick={handleAddMonitoredAsset}
            style={{ padding: '8px 16px', backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} /> Add Asset
          </button>
        </div>

        {monitorStatus?.assets?.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {monitorStatus.assets.map((ast: any) => (
              <div key={ast.symbol} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', backgroundColor: 'var(--bg-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {ast.symbol}
                      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: ast.enabled ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: ast.enabled ? 'var(--color-positive)' : 'var(--color-negative)' }}>
                        {ast.enabled ? 'ACTIVE' : 'PAUSED'}
                      </span>
                    </h3>
                    <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{ast.lastPrice ? `$${ast.lastPrice.toLocaleString()}` : 'Waiting for tick...'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleToggleAsset(ast.symbol, ast.enabled)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }} title={ast.enabled ? 'Pause' : 'Resume'}>
                      {ast.enabled ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <button onClick={() => handleRemoveMonitoredAsset(ast.symbol)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-negative)' }} title="Remove">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <div>Status: <span style={{ color: ast.analysisInProgress ? 'var(--color-positive)' : 'var(--text-primary)' }}>{ast.analysisInProgress ? 'ANALYZING...' : 'IDLE'}</span></div>
                    <div>Decision: <strong style={{ color: ast.lastDecision === 'CANDIDATE_TRADE' ? 'var(--color-positive)' : 'var(--text-secondary)' }}>{ast.lastDecision || '-'}</strong></div>
                  </div>
                  <div>
                    <div>Last Checked: {ast.lastAnalysisAt ? new Date(ast.lastAnalysisAt).toLocaleTimeString() : 'Never'}</div>
                    {ast.lastError && <div style={{ color: 'var(--color-negative)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={ast.lastError}>Err: {ast.lastError}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Mini Event Log */}
        {monitorEvents.length > 0 && (
          <div style={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 'bold', backgroundColor: 'var(--panel-bg)', borderBottom: '1px solid var(--border-color)' }}>Monitoring Event Log</div>
            <div style={{ maxHeight: '150px', overflowY: 'auto', padding: '8px', fontSize: '12px', fontFamily: 'monospace' }}>
              {monitorEvents.slice(0, 50).map((ev: any) => (
                <div key={ev.id} style={{ marginBottom: '4px', display: 'flex', gap: '8px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                  <span style={{ 
                    color: ev.type === 'ERROR' ? 'var(--color-negative)' : 
                           ev.type === 'WARNING' ? '#eab308' : 
                           ev.type === 'SUCCESS' ? 'var(--color-positive)' : 
                           'var(--text-primary)', 
                    width: '60px' 
                  }}>[{ev.symbol === 'SYSTEM' ? 'SYS' : ev.symbol}]</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{ev.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* PHASE 7: UPCOMING EXECUTIONS DASHBOARD */}
      {upcomingExecutions.length > 0 && (
        <Card>
          <h2 style={{ fontSize: '18px', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary-color)' }}>
            <Clock size={20} /> Scheduled Trade Executions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {upcomingExecutions.map(exec => {
              const timeRemaining = exec.scheduledAt - currentTime;
              const isAlert = timeRemaining <= 5 * 60 * 1000 && timeRemaining > 0;
              const isExecuting = timeRemaining <= 0;
              
              return (
                <div key={exec.planId} style={{ border: `1px solid ${isAlert ? '#eab308' : isExecuting ? 'var(--color-positive)' : 'var(--border-color)'}`, borderRadius: '8px', padding: '16px', backgroundColor: isAlert ? 'rgba(234, 179, 8, 0.05)' : isExecuting ? 'rgba(34, 197, 94, 0.05)' : 'var(--panel-bg)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {exec.symbol}
                        {isAlert && <span style={{ fontSize: '10px', backgroundColor: '#eab308', color: 'black', padding: '2px 6px', borderRadius: '4px' }}>NEW OPPORTUNITY</span>}
                      </div>
                      <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Status: <strong style={{ color: isAlert ? '#eab308' : 'var(--text-primary)' }}>{exec.status}</strong></div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Countdown</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'monospace', color: isExecuting ? 'var(--color-positive)' : 'var(--text-primary)' }}>
                        {isExecuting && !['EXECUTED', 'FAILED'].includes(exec.status) ? 'EXECUTING...' : 
                         exec.status === 'EXECUTION_UNCERTAIN' ? 'RECONCILING...' :
                         ['EXECUTED', 'FAILED'].includes(exec.status) ? 'FINISHED' :
                         formatCountdown(exec.scheduledAt)}
                      </div>
                    </div>
                  </div>
                  
                  {['EXECUTED', 'FAILED', 'EXECUTION_UNCERTAIN'].includes(exec.status) && (
                    <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                      <div><div style={{ color: 'var(--text-secondary)' }}>Actual Fill</div><strong>${exec.actualFillPrice?.toLocaleString() || '-'}</strong></div>
                      <div><div style={{ color: 'var(--text-secondary)' }}>Executed Qty</div><strong>{exec.executedQuantity || '-'}</strong></div>
                      <div><div style={{ color: 'var(--text-secondary)' }}>Order ID</div><strong>{exec.orderId || '-'}</strong></div>
                      <div><div style={{ color: 'var(--text-secondary)' }}>Error</div><strong style={{ color: 'var(--color-negative)' }}>{exec.error || 'None'}</strong></div>
                    </div>
                  )}

                  {isAlert && (
                    <div style={{ marginTop: '12px', padding: '8px', backgroundColor: 'rgba(234, 179, 8, 0.1)', color: '#eab308', borderRadius: '4px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertTriangle size={14} /> TRADE EXECUTION ALERT: Execution scheduled in less than 5 minutes.
                    </div>
                  )}

                  <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                     <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>ID: {exec.planId}</div>
                    {!isExecuting && (
                      <button onClick={() => handleCancelExecution(exec.planId)} style={{ padding: '6px 12px', backgroundColor: 'transparent', border: '1px solid var(--color-negative)', color: 'var(--color-negative)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}><Ban size={12} /> Cancel Execution</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* RISK CONFIGURATION PANEL */}
      {showRiskConfig && riskConfig && (
        <Card title="Risk Configuration (Paper Trading)">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div><label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Account Equity (USDT)</label><input type="number" value={riskConfig.accountEquity} onChange={(e) => handleConfigChange('accountEquity', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)' }} /></div>
            <div><label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Risk per Trade (%)</label><input type="number" step="0.1" value={riskConfig.riskPerTradePercent} onChange={(e) => handleConfigChange('riskPerTradePercent', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)' }} /></div>
            <div><label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Max Exposure (%)</label><input type="number" step="1" value={riskConfig.maxExposurePercent} onChange={(e) => handleConfigChange('maxExposurePercent', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)' }} /></div>
            <div><label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Minimum R:R</label><input type="number" step="0.1" value={riskConfig.minimumRiskReward} onChange={(e) => handleConfigChange('minimumRiskReward', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)' }} /></div>
          </div>
        </Card>
      )}

      {/* MANUAL ANALYSIS SECTION */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', marginTop: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>Manual Analysis:</h3>
        <select value={asset} onChange={(e) => setAsset(e.target.value)} style={{ padding: '8px 12px', backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px' }}>
          {selectedSymbols.length === 0 && <option value="">No assets selected</option>}
          {selectedSymbols.map(sym => <option key={sym} value={sym}>{sym}</option>)}
        </select>
        <button onClick={handleRunAi} disabled={aiLoading || !asset} style={{ padding: '8px 16px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '4px', cursor: aiLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', fontWeight: 'bold' }}><Cpu size={16} />{aiLoading ? 'Agents Analyzing...' : 'Run Master AI Analysis'}</button>
      </div>

      {asset && (
        <div style={{ marginTop: '16px', marginBottom: '16px' }}>
          <AnalysisChart symbol={asset} />
        </div>
      )}
      
      {aiResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', border: '1px solid var(--primary-color)', borderRadius: '8px', padding: '16px', backgroundColor: 'rgba(59, 130, 246, 0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}><Cpu size={20} color="var(--primary-color)" /> Master AI Decision (Manual)</h2>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '16px' }}><span>Analysis Generated: {new Date(aiResult.timestamp).toLocaleString()}</span><span>Provider: {aiResult.provider}</span></div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: aiResult.decision === 'CANDIDATE_TRADE' ? 'var(--color-positive)' : aiResult.decision === 'NO_TRADE' ? 'var(--color-negative)' : 'var(--text-primary)' }}>{aiResult.decision.replace('_', ' ')}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>AI Confidence: {aiResult.confidence}%</div>
            </div>
          </div>

          {aiResult.decision === 'CANDIDATE_TRADE' && aiResult.tradeCandidate && (
             <Card>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                 <h3 style={{ margin: '0', fontSize: '16px', color: 'var(--color-positive)', display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle size={16} /> AI-Generated Trade Candidate</h3>
                 <button onClick={handleValidatePlan} disabled={planLoading} style={{ padding: '8px 16px', backgroundColor: 'var(--color-positive)', color: 'white', border: 'none', borderRadius: '4px', cursor: planLoading ? 'not-allowed' : 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldCheck size={16} /> {planLoading ? 'Validating...' : 'Validate Trade Plan'}</button>
               </div>
               <div style={{ fontSize: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-negative)', padding: '8px', borderRadius: '4px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><AlertTriangle size={14} /> This is an analytical setup only. The system DOES NOT execute trades immediately.</div>
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' }}>
                 <div><div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Side</div><div style={{ fontWeight: 'bold', color: aiResult.tradeCandidate.side === 'LONG' ? 'var(--color-positive)' : 'var(--color-negative)' }}>{aiResult.tradeCandidate.side}</div></div>
                 <div><div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Entry Zone</div><div style={{ fontWeight: 'bold' }}>${aiResult.tradeCandidate.entryZone.min.toLocaleString()} - ${aiResult.tradeCandidate.entryZone.max.toLocaleString()}</div></div>
                 <div><div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Stop Loss</div><div style={{ fontWeight: 'bold', color: 'var(--color-negative)' }}>${aiResult.tradeCandidate.stopLoss.toLocaleString()}</div></div>
                 <div><div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Target</div><div style={{ fontWeight: 'bold', color: 'var(--color-positive)' }}>${aiResult.tradeCandidate.takeProfitLevels[0]?.toLocaleString()}</div></div>
               </div>
             </Card>
          )}

          {tradePlan && (
            <Card>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                 <h3 style={{ margin: '0', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', color: tradePlan.validation.status === 'VALID' ? 'var(--color-positive)' : 'var(--color-negative)' }}>
                   {tradePlan.validation.status === 'VALID' ? <ShieldCheck size={20} /> : <XCircle size={20} />} 
                   FINAL TRADE PLAN: {tradePlan.validation.status}
                 </h3>
                 {tradePlan.validation.status === 'VALID' && (
                   <button onClick={() => handleScheduleExecution(tradePlan.planId)} disabled={scheduleLoading} style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: scheduleLoading ? 'not-allowed' : 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}><Send size={16} /> {scheduleLoading ? 'Scheduling...' : 'Schedule Execution'}</button>
                 )}
               </div>
               
               {tradePlan.validation.status === 'REJECTED' && (
                 <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-negative)', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}><strong style={{ color: 'var(--color-negative)' }}>Rejection Reasons:</strong><ul style={{ margin: '8px 0 0 0', paddingLeft: '16px', color: 'var(--text-primary)', fontSize: '14px' }}>{tradePlan.validation.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul></div>
               )}

               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', padding: '16px', backgroundColor: 'var(--bg-color)', borderRadius: '4px' }}>
                 <div><div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Position Size</div><div style={{ fontWeight: 'bold', fontSize: '16px' }}>{tradePlan.position.quantity.toFixed(5)} {tradePlan.symbol.replace('USDT', '')}</div></div>
                 <div><div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Notional Value</div><div style={{ fontWeight: 'bold', fontSize: '16px' }}>${tradePlan.position.notionalValue.toFixed(2)}</div></div>
                 <div><div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Planned Risk Amount</div><div style={{ fontWeight: 'bold', fontSize: '16px', color: 'var(--color-negative)' }}>${tradePlan.risk.riskAmount.toFixed(2)} ({tradePlan.risk.riskPercent}%)</div></div>
               </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default Analysis;
