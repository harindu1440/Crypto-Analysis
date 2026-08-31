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
                <GlossaryTooltip term={opp.direction} />
              </span>
              <span className="opp-confidence">Confidence: {opp.confidence}%</span>
            </div>
            
            <div className="opp-body">
              <div className="opp-reason">
                <strong>Why this trade?</strong>
                <p>{opp.reason}</p>
                <p><strong>Setup:</strong> {opp.setup}</p>
              </div>
              
              <div className="opp-metrics">
                <div className="metric">
                  <label><GlossaryTooltip term="ENTRY" /></label>
                  <span>${opp.entryPrice.toFixed(4)}</span>
                </div>
                <div className="metric">
                  <label><GlossaryTooltip term="STOP LOSS" /></label>
                  <span>${opp.stopLoss.toFixed(4)}</span>
                </div>
                <div className="metric">
                  <label><GlossaryTooltip term="TAKE PROFIT" /></label>
                  <span>${opp.takeProfitTargets[0].toFixed(4)}</span>
                </div>
                <div className="metric">
                  <label><GlossaryTooltip term="RISK/REWARD" /></label>
                  <span>1 : {opp.riskRewardRatio}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
