import { NormalizedCandle, SwingPoint, SupportResistanceLevel } from './types';

export const SupportResistanceEngine = {
  calculateLevels(candles: NormalizedCandle[], swings: SwingPoint[]): { support: SupportResistanceLevel[], resistance: SupportResistanceLevel[] } {
    const support: SupportResistanceLevel[] = [];
    const resistance: SupportResistanceLevel[] = [];
    
    // Group swings into clusters within a certain price threshold (e.g., 0.5%)
    const clusterThreshold = 0.005; 
    
    const clusters: { price: number, count: number, type: 'HIGH' | 'LOW' }[] = [];

    for (const swing of swings) {
      const isHigh = swing.type === 'HH' || swing.type === 'LH' || swing.type === 'UNKNOWN'; // We didn't perfectly map UNKNOWN, but typically we want all high swings
      // A safer check is comparing with candle high/low, but let's assume HH/LH are resistance, HL/LL are support.
      
      const type = (swing.type === 'HH' || swing.type === 'LH') ? 'HIGH' : 'LOW';
      
      let foundCluster = false;
      for (const cluster of clusters) {
        if (cluster.type === type) {
          const diff = Math.abs(cluster.price - swing.price) / cluster.price;
          if (diff <= clusterThreshold) {
            cluster.count++;
            // Move center of gravity slightly
            cluster.price = (cluster.price * (cluster.count - 1) + swing.price) / cluster.count;
            foundCluster = true;
            break;
          }
        }
      }
      
      if (!foundCluster) {
        clusters.push({ price: swing.price, count: 1, type });
      }
    }

    const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;

    for (const cluster of clusters) {
      // Filter out isolated points
      if (cluster.count >= 2) {
        const level: SupportResistanceLevel = {
          type: cluster.type === 'HIGH' ? 'resistance' : 'support',
          price: cluster.price,
          strength: Math.min(100, cluster.count * 20),
          touches: cluster.count,
          distancePercent: currentPrice > 0 ? Math.abs(cluster.price - currentPrice) / currentPrice * 100 : 0
        };
        
        if (level.type === 'resistance') resistance.push(level);
        else support.push(level);
      }
    }

    return {
      support: support.sort((a, b) => b.price - a.price), // highest support first
      resistance: resistance.sort((a, b) => a.price - b.price) // lowest resistance first
    };
  }
};
