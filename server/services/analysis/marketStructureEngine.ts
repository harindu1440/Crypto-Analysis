import { NormalizedCandle, SwingPoint } from './types';

export const MarketStructureEngine = {
  detectSwingPoints(candles: NormalizedCandle[], leftBars: number = 3, rightBars: number = 3): SwingPoint[] {
    const rawSwings: { type: 'HIGH' | 'LOW'; price: number; index: number; timestamp: number }[] = [];

    for (let i = leftBars; i < candles.length - rightBars; i++) {
      let isHigh = true;
      let isLow = true;

      const currentHigh = candles[i].high;
      const currentLow = candles[i].low;

      for (let j = 1; j <= leftBars; j++) {
        if (candles[i - j].high >= currentHigh) isHigh = false;
        if (candles[i - j].low <= currentLow) isLow = false;
      }

      for (let j = 1; j <= rightBars; j++) {
        if (candles[i + j].high >= currentHigh) isHigh = false;
        if (candles[i + j].low <= currentLow) isLow = false;
      }

      if (isHigh) {
        rawSwings.push({ type: 'HIGH', price: currentHigh, index: i, timestamp: candles[i].closeTime });
      }

      if (isLow) {
        rawSwings.push({ type: 'LOW', price: currentLow, index: i, timestamp: candles[i].closeTime });
      }
    }

    return this.classifySwings(rawSwings.sort((a, b) => a.index - b.index));
  },

  classifySwings(rawSwings: { type: 'HIGH' | 'LOW'; price: number; index: number; timestamp: number }[]): SwingPoint[] {
    const classified: SwingPoint[] = [];
    let lastHighPrice = -1;
    let lastLowPrice = -1;

    for (const raw of rawSwings) {
      if (raw.type === 'HIGH') {
        let type: 'HH' | 'LH' | 'UNKNOWN' = 'UNKNOWN';
        if (lastHighPrice !== -1) {
          type = raw.price > lastHighPrice ? 'HH' : 'LH';
        }
        lastHighPrice = raw.price;
        classified.push({ type, price: raw.price, index: raw.index, timestamp: raw.timestamp });
      } else {
        let type: 'HL' | 'LL' | 'UNKNOWN' = 'UNKNOWN';
        if (lastLowPrice !== -1) {
          type = raw.price > lastLowPrice ? 'HL' : 'LL';
        }
        lastLowPrice = raw.price;
        classified.push({ type, price: raw.price, index: raw.index, timestamp: raw.timestamp });
      }
    }
    
    return classified;
  },
  
  analyzeStructure(swings: SwingPoint[], candles?: NormalizedCandle[]): { trend: 'BULLISH' | 'BEARISH' | 'CHOP' | 'CONSOLIDATION', bos: boolean, choch: boolean, breakout: boolean } {
    const result = { trend: 'CHOP' as 'BULLISH' | 'BEARISH' | 'CHOP' | 'CONSOLIDATION', bos: false, choch: false, breakout: false };
    if (swings.length < 4) return result;
    
    const recent = swings.slice(-4);
    
    const hasHH = recent.some(s => s.type === 'HH');
    const hasHL = recent.some(s => s.type === 'HL');
    const hasLL = recent.some(s => s.type === 'LL');
    const hasLH = recent.some(s => s.type === 'LH');
    
    if (hasHH && hasHL && !hasLL && !hasLH) result.trend = 'BULLISH';
    else if (hasLL && hasLH && !hasHH && !hasHL) result.trend = 'BEARISH';
    else if (!hasHH && !hasLL) result.trend = 'CONSOLIDATION';
    
    // Detect BOS and CHoCH
    // A BOS (Break of Structure) happens when a trend continues by breaking the last high/low.
    // A CHoCH (Change of Character) happens when a previous HL is broken (bullish to bearish) or LH is broken (bearish to bullish).
    
    if (recent.length >= 2) {
       const last = recent[recent.length - 1];
       const prev = recent[recent.length - 2];
       if (last.type === 'HH' || last.type === 'LL') result.bos = true;
       
       if (last.type === 'LL' && prev.type === 'HH') result.choch = true; // Bullish to Bearish
       if (last.type === 'HH' && prev.type === 'LL') result.choch = true; // Bearish to Bullish
    }
    
    // Breakout detection
    if (candles && candles.length > 0 && result.trend === 'CONSOLIDATION') {
       const current = candles[candles.length - 1];
       const recentHigh = Math.max(...recent.map(s => s.type === 'HH' || s.type === 'LH' || s.type === 'UNKNOWN' && s.price > current.low ? s.price : 0));
       const recentLow = Math.min(...recent.map(s => s.type === 'LL' || s.type === 'HL' || s.type === 'UNKNOWN' && s.price < current.high ? s.price : Infinity));
       if (current.close > recentHigh || current.close < recentLow) result.breakout = true;
    }

    return result;
  }
};
