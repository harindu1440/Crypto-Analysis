import React, { useState } from 'react';
import './GlossaryTooltip.css';

const DICTIONARY: Record<string, string> = {
  'LONG': 'A trade that expects the price to increase. (Buy low, sell high)',
  'SHORT': 'A trade that expects the price to decrease. (Sell high, buy back low)',
  'STOP LOSS': 'A safety level that limits potential loss if the market moves against the trade.',
  'TAKE PROFIT': 'A price level where the system plans to take profit from a successful trade.',
  'RISK/REWARD': 'Compares potential loss with potential profit. E.g. 1:3 means risking $10 to make $30.',
  'ENTRY': 'The price or price zone where the trade is planned to begin.',
  'LIQUIDITY': 'Areas where many buy/sell orders or stops may be concentrated.',
  'MARKET STRUCTURE': 'The way price forms highs and lows, indicating trend.',
  'VOLATILITY': 'How strongly and quickly the price is moving.'
};

interface Props {
  term: string;
}

export const GlossaryTooltip: React.FC<Props> = ({ term }) => {
  const [visible, setVisible] = useState(false);
  
  const cleanTerm = term.toUpperCase().trim();
  const definition = DICTIONARY[cleanTerm];
  
  if (!definition) return <span>{term}</span>;

  return (
    <span 
      className="glossary-term"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {term}
      {visible && (
        <div className="glossary-tooltip">
          <strong>{cleanTerm}</strong>
          <p>{definition}</p>
        </div>
      )}
    </span>
  );
};
