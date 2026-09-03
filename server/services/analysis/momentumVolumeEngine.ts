import { NormalizedCandle, MomentumState, VolumeCondition, IndicatorSnapshot } from './types';

export const MomentumVolumeEngine = {
  analyzeMomentum(indicators: IndicatorSnapshot): MomentumState {
    const rsi = indicators.rsi[14] || 50;
    const macdHist = indicators.macd.histogram;
    const adx = indicators.adx || 0;
    const priceVelocity = indicators.priceVelocity || 0;
    const volumeRatio = indicators.volumeRatio || 1;
    
    if (adx >= 25 && Math.abs(priceVelocity) > 0 && volumeRatio >= 1.2) {
      if (rsi > 60 || rsi < 40) return 'MOMENTUM_ACCELERATING';
    }
    
    if (adx < 20 || volumeRatio < 0.8) {
      return 'MOMENTUM_STABLE';
    }
    
    if (adx >= 25 && volumeRatio < 1 && Math.abs(priceVelocity) < (indicators.averageCandleRange || 1) * 0.5) {
      return 'MOMENTUM_WEAKENING';
    }
    
    // Divergence or quick flip
    if ((rsi > 70 && priceVelocity < 0) || (rsi < 30 && priceVelocity > 0)) {
      return 'MOMENTUM_REVERSING';
    }

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
