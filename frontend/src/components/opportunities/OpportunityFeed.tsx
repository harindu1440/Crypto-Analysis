import React, { useEffect, useState } from 'react';
import { Card } from '../common/Card';
import './OpportunityFeed.css';
import { GlossaryTooltip } from '../common/GlossaryTooltip';

export const OpportunityFeed: React.FC = () => {
  const [opportunities, setOpportunities] = useState<any[]>([]);

  useEffect(() => {
    const fetchOpps = async () => {
      try {
        const res = await fetch('/api/opportunities');
        setOpportunities(await res.json());
      } catch (e) {
        console.error(e);
      }
    };
    
    fetchOpps();
    const int = setInterval(fetchOpps, 15000);
    return () => clearInterval(int);
  }, []);

  if (opportunities.length === 0) {
    return (
      <Card title="Live Opportunities">
        <div className="empty-feed">
          No high-confidence opportunities detected currently.
          <br />AI is continuously scanning the markets.
        </div>
      </Card>
    );
  }

  return (
    <Card title="Live Opportunities">
      <div className="opportunity-feed">
        {opportunities.map(opp => (
          <div key={opp.id} className="opportunity-card">
            <div className="opp-header">
              <span className="opp-symbol">{opp.symbol}</span>
              <span className={`opp-direction ${opp.direction.toLowerCase()}`}>
                <GlossaryTooltip term={opp.direction}>{opp.direction}</GlossaryTooltip>
              </span>
              <span className="opp-confidence">Confidence: {opp.confidence}%</span>
            </div>
            
            <div className="opp-body">
              <div className="opp-reason">
                <strong>Why this trade?</strong>
                <p>{opp.reason}</p>
                {opp.qualityBreakdown && (
                   <ul className="opp-quality-breakdown">
                     <li><strong>Structure:</strong> {opp.qualityBreakdown.structureScore}/20</li>
                     <li><strong>Momentum:</strong> {opp.qualityBreakdown.momentumScore}/10</li>
                     <li><strong>Volume:</strong> {opp.qualityBreakdown.volumeScore}/10</li>
                     <li><strong>S/R & R:R:</strong> {opp.qualityBreakdown.liquidityScore}/15</li>
                   </ul>
                )}
                {opp.rejectionReasons && opp.rejectionReasons.length > 0 && (
                  <div className="opp-rejection">
                    <strong>What to watch / Risks:</strong>
                    <ul>
                      {opp.rejectionReasons.map((r: string, idx: number) => <li key={idx}>{r}</li>)}
                    </ul>
                  </div>
                )}
              </div>
              
              <div className="opp-metrics">
                <div className="metric">
                  <label><GlossaryTooltip term="ENTRY">ENTRY</GlossaryTooltip></label>
                  <span>${opp.entryPrice.toFixed(4)}</span>
                </div>
                <div className="metric">
                  <label><GlossaryTooltip term="STOP LOSS">STOP LOSS</GlossaryTooltip></label>
                  <span>${opp.stopLoss.toFixed(4)}</span>
                </div>
                <div className="metric">
                  <label><GlossaryTooltip term="TAKE PROFIT">TAKE PROFIT</GlossaryTooltip></label>
                  <span>${opp.takeProfitTargets[0].toFixed(4)}</span>
                </div>
                <div className="metric">
                  <label><GlossaryTooltip term="RISK/REWARD">RISK/REWARD</GlossaryTooltip></label>
                  <span>1 : {opp.riskRewardRatio}</span>
                </div>
                <div className="metric">
                  <label><GlossaryTooltip term="QUALITY SCORE">OPPORTUNITY SCORE</GlossaryTooltip></label>
                  <span>{opp.qualityScore || opp.confidence}/100</span>
                </div>
              </div>
              <div className="opp-footer" style={{ marginTop: '16px', textAlign: 'right' }}>
                <a href={`/opportunities/${opp.id}`} className="view-details-btn">
                  VIEW FULL ANALYSIS →
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
