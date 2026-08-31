import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const GLOSSARY = {
  LONG: {
    beginner: "A trade expecting the price to go UP. You buy now to sell higher later.",
    advanced: "A position taken with the expectation that the asset's price will appreciate."
  },
  SHORT: {
    beginner: "A trade expecting the price to go DOWN. You sell borrowed assets now to buy them back cheaper later.",
    advanced: "A position taken with the expectation that the asset's price will depreciate."
  },
  BOS: {
    beginner: "Break of Structure - When the price breaks past an old high or low, proving the trend is continuing.",
    advanced: "Break of Structure - Confirmation of trend continuation when price convincingly breaks previous swing points."
  },
  CHOCH: {
    beginner: "Change of Character - The first sign that a trend might be reversing direction.",
    advanced: "Change of Character - An early structural shift indicating a potential trend reversal."
  },
  LIQUIDITY: {
    beginner: "Areas on the chart where many traders have placed their stop losses, acting like a magnet for the price.",
    advanced: "Areas of high order concentration, typically above old highs and below old lows."
  },
  FVG: {
    beginner: "Fair Value Gap - A sudden, fast price movement that left a gap on the chart. Price often returns to fill it.",
    advanced: "Fair Value Gap - An imbalance in price action leaving unmitigated price levels."
  },
  ENTRY: {
    beginner: "The exact price where you should start the trade.",
    advanced: "The calculated price level for optimal execution based on structure and risk."
  },
  'STOP LOSS': {
    beginner: "Your safety net. If the price hits this level, the trade automatically closes to prevent a larger loss.",
    advanced: "The invalidation level where the technical premise of the trade is proven wrong."
  },
  'TAKE PROFIT': {
    beginner: "Your target price. When the price hits this level, the trade automatically closes to secure your profit.",
    advanced: "The target level for partial or full position exit based on structural resistance/support."
  }
};

interface GlossaryTooltipProps {
  term: string;
  children: React.ReactNode;
}

export const GlossaryTooltip: React.FC<GlossaryTooltipProps> = ({ term, children }) => {
  const [show, setShow] = useState(false);
  const { preferences } = useAuth();
  const mode = preferences?.mode || 'BEGINNER';
  
  const definition = GLOSSARY[term.toUpperCase() as keyof typeof GLOSSARY];

  if (!definition) {
    return <span className="font-semibold text-gray-200">{children}</span>;
  }

  return (
    <span 
      className="relative inline-block border-b border-dashed border-blue-400 cursor-help text-blue-400 hover:text-blue-300"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      
      {show && (
        <div className="absolute z-50 w-64 p-3 mt-2 text-sm text-white bg-[#1F2937] border border-gray-600 rounded shadow-xl left-1/2 transform -translate-x-1/2">
          <div className="font-bold mb-1 text-blue-400">{term.toUpperCase()}</div>
          <div className="text-gray-300">
            {mode === 'BEGINNER' ? definition.beginner : definition.advanced}
          </div>
        </div>
      )}
    </span>
  );
};
