import { NormalizedCandle } from './types';

export const IndicatorService = {
  sma(data: number[], period: number): number | null {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / period;
  },

  ema(data: number[], period: number): number | null {
    if (data.length < period) return null;
    const k = 2 / (period + 1);
    
    // Start with SMA for the initial value
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    // Calculate EMA for the rest of the array
    for (let i = period; i < data.length; i++) {
      ema = (data[i] * k) + (ema * (1 - k));
    }
    return ema;
  },

  rsi(data: number[], period: number): number | null {
    if (data.length <= period) return null;
    
    let gains = 0;
    let losses = 0;

    // Calculate initial average gain/loss
    for (let i = 1; i <= period; i++) {
      const difference = data[i] - data[i - 1];
      if (difference >= 0) {
        gains += difference;
      } else {
        losses -= difference;
      }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Smoothed RSI for the remaining data
    for (let i = period + 1; i < data.length; i++) {
      const difference = data[i] - data[i - 1];
      if (difference >= 0) {
        avgGain = (avgGain * (period - 1) + difference) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) - difference) / period;
      }
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  },

  macd(data: number[], fast: number, slow: number, signalPeriod: number) {
    if (data.length < slow + signalPeriod) return { macdLine: 0, signalLine: 0, histogram: 0 };

    const macdLineArr: number[] = [];
    
    // We need to calculate MACD line for enough periods to get the signal EMA
    for (let i = slow; i <= data.length; i++) {
      const slice = data.slice(0, i);
      const fastEma = this.ema(slice, fast);
      const slowEma = this.ema(slice, slow);
      if (fastEma !== null && slowEma !== null) {
        macdLineArr.push(fastEma - slowEma);
      }
    }

    if (macdLineArr.length < signalPeriod) return { macdLine: 0, signalLine: 0, histogram: 0 };

    const macdLine = macdLineArr[macdLineArr.length - 1];
    const signalLine = this.ema(macdLineArr, signalPeriod) || 0;
    const histogram = macdLine - signalLine;

    return { macdLine, signalLine, histogram };
  },

  bollingerBands(data: number[], period: number, multiplier: number) {
    const middle = this.sma(data, period);
    if (middle === null) return { upper: 0, middle: 0, lower: 0 };

    const slice = data.slice(-period);
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    return {
      upper: middle + (stdDev * multiplier),
      middle: middle,
      lower: middle - (stdDev * multiplier)
    };
  },

  atr(candles: NormalizedCandle[], period: number): number | null {
    if (candles.length <= period) return null;
    
    const trueRanges: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      
      const tr1 = high - low;
      const tr2 = Math.abs(high - prevClose);
      const tr3 = Math.abs(low - prevClose);
      
      trueRanges.push(Math.max(tr1, tr2, tr3));
    }
    
    // Basic Wilder's Smoothing for ATR
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < trueRanges.length; i++) {
      atr = ((atr * (period - 1)) + trueRanges[i]) / period;
    }
    
    return atr;
  },

  volumeSma(data: number[], period: number): number | null {
    return this.sma(data, period);
  },

  stochastic(candles: NormalizedCandle[], period: number, smoothK: number = 3, smoothD: number = 3) {
    if (candles.length < period) return null;
    
    const kValues: number[] = [];
    
    for (let i = period - 1; i < candles.length; i++) {
      const slice = candles.slice(i - period + 1, i + 1);
      const high = Math.max(...slice.map(c => c.high));
      const low = Math.min(...slice.map(c => c.low));
      const currentClose = candles[i].close;
      
      let k = 50;
      if (high - low !== 0) {
         k = ((currentClose - low) / (high - low)) * 100;
      }
      kValues.push(k);
    }
    
    if (kValues.length < smoothK) return null;
    
    // Smooth K with SMA
    const smoothedKArr: number[] = [];
    for (let i = smoothK - 1; i < kValues.length; i++) {
      const slice = kValues.slice(i - smoothK + 1, i + 1);
      const smaK = slice.reduce((a, b) => a + b, 0) / smoothK;
      smoothedKArr.push(smaK);
    }
    
    if (smoothedKArr.length < smoothD) return null;
    
    // Smooth D with SMA of smoothed K
    const sliceD = smoothedKArr.slice(-smoothD);
    const d = sliceD.reduce((a, b) => a + b, 0) / smoothD;
    
    return {
      k: smoothedKArr[smoothedKArr.length - 1],
      d: d
    };
  },

  adx(candles: NormalizedCandle[], period: number): number | null {
    if (candles.length <= period * 2) return null; // Need extra data to smooth ADX

    let plusDM = [];
    let minusDM = [];
    let tr = [];

    for (let i = 1; i < candles.length; i++) {
      const highDiff = candles[i].high - candles[i - 1].high;
      const lowDiff = candles[i - 1].low - candles[i].low;

      let pDM = 0;
      let mDM = 0;

      if (highDiff > lowDiff && highDiff > 0) pDM = highDiff;
      if (lowDiff > highDiff && lowDiff > 0) mDM = lowDiff;

      plusDM.push(pDM);
      minusDM.push(mDM);

      const tr1 = candles[i].high - candles[i].low;
      const tr2 = Math.abs(candles[i].high - candles[i - 1].close);
      const tr3 = Math.abs(candles[i].low - candles[i - 1].close);
      tr.push(Math.max(tr1, tr2, tr3));
    }

    // Smoothed values
    const smooth = (val: number, prev: number) => prev - (prev / period) + val;

    let smoothedTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
    let smoothedPDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
    let smoothedMDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

    const dx: number[] = [];

    for (let i = period; i < tr.length; i++) {
      smoothedTR = smooth(tr[i], smoothedTR);
      smoothedPDM = smooth(plusDM[i], smoothedPDM);
      smoothedMDM = smooth(minusDM[i], smoothedMDM);

      const pDI = (smoothedPDM / smoothedTR) * 100;
      const mDI = (smoothedMDM / smoothedTR) * 100;
      
      let currentDX = 0;
      if (pDI + mDI !== 0) {
        currentDX = (Math.abs(pDI - mDI) / (pDI + mDI)) * 100;
      }
      dx.push(currentDX);
    }

    if (dx.length < period) return null;

    let adx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dx.length; i++) {
      adx = ((adx * (period - 1)) + dx[i]) / period;
    }

    return adx;
  }
};
