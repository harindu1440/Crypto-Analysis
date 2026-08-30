import { NormalizedCandle, PatternDetection, SupportResistanceLevel, VolumeCondition, TrendDirection } from './types';

export const CandleService = {
  detectPatterns(candles: NormalizedCandle[]): PatternDetection[] {
    const patterns: PatternDetection[] = [];
    if (candles.length < 3) return patterns;

    const latest = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const prev2 = candles[candles.length - 3];

    const body = Math.abs(latest.close - latest.open);
    const range = latest.high - latest.low;
    
    // Doji
    if (body <= range * 0.1) {
      patterns.push({ pattern: 'Doji', direction: 'NEUTRAL', confidence: 60, index: 0 });
    }
    
    // Bullish Engulfing
    if (prev.close < prev.open && latest.close > latest.open && latest.close > prev.open && latest.open < prev.close) {
      patterns.push({ pattern: 'Bullish Engulfing', direction: 'BULLISH', confidence: 80, index: 0 });
    }
    
    // Bearish Engulfing
    if (prev.close > prev.open && latest.close < latest.open && latest.close < prev.open && latest.open > prev.close) {
      patterns.push({ pattern: 'Bearish Engulfing', direction: 'BEARISH', confidence: 80, index: 0 });
    }

    // Hammer
    const lowerWick = Math.min(latest.open, latest.close) - latest.low;
    const upperWick = latest.high - Math.max(latest.open, latest.close);
    if (lowerWick > body * 2 && upperWick < body * 0.2 && latest.close > latest.open) {
      patterns.push({ pattern: 'Hammer', direction: 'BULLISH', confidence: 75, index: 0 });
    }

    // Inverted Hammer
    if (upperWick > body * 2 && lowerWick < body * 0.2 && latest.close > latest.open) {
      patterns.push({ pattern: 'Inverted Hammer', direction: 'BULLISH', confidence: 70, index: 0 });
    }

    // Morning Star
    if (prev2.close < prev2.open && 
        Math.abs(prev.close - prev.open) < (prev.high - prev.low) * 0.3 && 
        latest.close > latest.open && latest.close > (prev2.open + prev2.close) / 2) {
      patterns.push({ pattern: 'Morning Star', direction: 'BULLISH', confidence: 85, index: 0 });
    }

    // Evening Star
    if (prev2.close > prev2.open && 
        Math.abs(prev.close - prev.open) < (prev.high - prev.low) * 0.3 && 
        latest.close < latest.open && latest.close < (prev2.open + prev2.close) / 2) {
      patterns.push({ pattern: 'Evening Star', direction: 'BEARISH', confidence: 85, index: 0 });
    }

    return patterns;
  },

  findSupportResistance(candles: NormalizedCandle[]): { support: SupportResistanceLevel[], resistance: SupportResistanceLevel[] } {
    if (candles.length < 20) return { support: [], resistance: [] };
    
    // Extremely simplified swing high/low logic for demonstration
    // A real engine would use pivot points, volume profiling, or KDE.
    const support: SupportResistanceLevel[] = [];
    const resistance: SupportResistanceLevel[] = [];
    
    // Look for pivots over a rolling window
    const window = 5;
    for (let i = window; i < candles.length - window; i++) {
      let isSwingHigh = true;
      let isSwingLow = true;
      
      for (let j = 1; j <= window; j++) {
        if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
          isSwingHigh = false;
        }
        if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
          isSwingLow = false;
        }
      }
      
      if (isSwingHigh) resistance.push({ type: 'resistance', price: candles[i].high, strength: 3 });
      if (isSwingLow) support.push({ type: 'support', price: candles[i].low, strength: 3 });
    }
    
    // Keep only the most relevant recent ones (e.g. closest to current price)
    const currentPrice = candles[candles.length - 1].close;
    
    const sortedResistance = resistance.filter(r => r.price > currentPrice).sort((a, b) => a.price - b.price).slice(0, 3);
    const sortedSupport = support.filter(s => s.price < currentPrice).sort((a, b) => b.price - a.price).slice(0, 3);

    return { support: sortedSupport, resistance: sortedResistance };
  },

  analyzeVolume(candles: NormalizedCandle[]): VolumeCondition {
    if (candles.length < 20) return 'NORMAL_VOLUME';
    
    const recent = candles.slice(-20);
    const avgVolume = recent.reduce((sum, c) => sum + c.volume, 0) / 20;
    const latestVolume = candles[candles.length - 1].volume;
    
    if (latestVolume > avgVolume * 1.5) return 'HIGH_VOLUME';
    if (latestVolume < avgVolume * 0.5) return 'LOW_VOLUME';
    return 'NORMAL_VOLUME';
  }
};
