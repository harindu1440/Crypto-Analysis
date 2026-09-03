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
  
  analyzeStructure(swings: SwingPoint[]): 'BULLISH' | 'BEARISH' | 'CHOP' | 'CONSOLIDATION' {
    if (swings.length < 4) return 'CHOP';
    
    const recent = swings.slice(-4);
    
    const hasHH = recent.some(s => s.type === 'HH');
    const hasHL = recent.some(s => s.type === 'HL');
    const hasLL = recent.some(s => s.type === 'LL');
    const hasLH = recent.some(s => s.type === 'LH');
    
    if (hasHH && hasHL && !hasLL && !hasLH) return 'BULLISH';
    if (hasLL && hasLH && !hasHH && !hasHL) return 'BEARISH';
    if (!hasHH && !hasLL) return 'CONSOLIDATION';
    
    return 'CHOP';
  }
};
