import { NormalizedCandle, MomentumState, VolumeCondition, IndicatorSnapshot } from './types';

export const MomentumVolumeEngine = {
  analyzeMomentum(indicators: IndicatorSnapshot): MomentumState {
    const rsi = indicators.rsi[14] || 50;
    const macdHist = indicators.macd.histogram;
    const adx = indicators.adx || 0;
    
    // Simplistic previous state checks - in a real engine we'd compare historical array,
    // but for now we infer from MACD histogram direction and ADX strength.
    
    if (adx > 25 && Math.abs(macdHist) > 0) { // Should ideally check if macdHist is growing
      if (rsi > 60 || rsi < 40) return 'MOMENTUM_ACCELERATING';
    }
    
    if (adx < 20 && Math.abs(macdHist) < 0.01) {
      return 'MOMENTUM_STABLE';
    }
    
    if (adx > 30 && (rsi > 70 || rsi < 30)) {
      // Potentially overextended or exhausting
      return 'MOMENTUM_WEAKENING';
    }

    // Default
    return 'MOMENTUM_STABLE';
  },
  
  analyzeVolume(candles: NormalizedCandle[], volumeSma: number): VolumeCondition {
    if (candles.length < 2) return 'NORMAL_VOLUME';
    
    const current = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    
    if (current.volume > volumeSma * 2) return 'VOLUME_BREAKOUT';
    if (current.volume > volumeSma * 1.5) return 'VOLUME_EXPANSION';
    if (current.volume < volumeSma * 0.5) return 'VOLUME_CONTRACTION';
    if (current.volume < volumeSma * 0.8) return 'LOW_VOLUME';
    if (current.volume > volumeSma * 1.2) return 'HIGH_VOLUME';
    
    return 'NORMAL_VOLUME';
  }
};
