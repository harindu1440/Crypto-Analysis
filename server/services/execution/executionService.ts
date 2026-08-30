import { FinalTradePlan } from '../risk/types';
import { BinanceMarketService } from '../binance/binanceMarketService';

export const ExecutionService = {

  // Decimal safe step size normalization
  // e.g. quantity = 0.001237, stepSize = 0.0001 => 0.0012
  normalizeQuantity(quantity: number, stepSize: number): number {
    if (stepSize <= 0) return quantity;
    const precision = Math.max(0, -Math.floor(Math.log10(stepSize)));
    // Floor to avoid exceeding risk limits
    const factor = Math.pow(10, precision);
    return Math.floor(quantity * factor) / factor;
  },

  // Decimal safe tick size normalization
  // e.g. price = 105234.567, tickSize = 0.1 => 105234.5
  normalizePrice(price: number, tickSize: number): number {
    if (tickSize <= 0) return price;
    const precision = Math.max(0, -Math.floor(Math.log10(tickSize)));
    // Round to nearest tick size
    const factor = Math.pow(10, precision);
    return Math.round(price * factor) / factor;
  },

  async validateAgainstExchangeFilters(plan: FinalTradePlan) {
    const symbols = await BinanceMarketService.getSymbols();
    const symbolInfo = symbols.find(s => s.symbol === plan.symbol);

    if (!symbolInfo) {
      throw new Error(`Symbol ${plan.symbol} not found on exchange.`);
    }

    if (symbolInfo.status !== 'TRADING') {
      throw new Error(`Symbol ${plan.symbol} is currently ${symbolInfo.status}, not TRADING.`);
    }

    let minQty = 0;
    let maxQty = Infinity;
    let stepSize = 0;
    let minNotional = 0;
    let tickSize = 0;

    for (const filter of symbolInfo.filters) {
      if (filter.filterType === 'LOT_SIZE' || filter.filterType === 'MARKET_LOT_SIZE') {
        minQty = parseFloat(filter.minQty);
        maxQty = parseFloat(filter.maxQty);
        stepSize = parseFloat(filter.stepSize);
      }
      if (filter.filterType === 'MIN_NOTIONAL' || filter.filterType === 'NOTIONAL') {
        minNotional = parseFloat(filter.minNotional);
      }
      if (filter.filterType === 'PRICE_FILTER') {
        tickSize = parseFloat(filter.tickSize);
      }
    }

    // Normalize
    const normalizedQuantity = this.normalizeQuantity(plan.position.quantity, stepSize);
    const normalizedPrice = this.normalizePrice(plan.entry.reference, tickSize);
    const notional = normalizedQuantity * normalizedPrice;

    // Validate
    if (normalizedQuantity <= 0) {
      throw new Error(`Normalized quantity (${normalizedQuantity}) is <= 0.`);
    }
    if (normalizedQuantity < minQty) {
      throw new Error(`Quantity ${normalizedQuantity} is below exchange minimum (${minQty}).`);
    }
    if (normalizedQuantity > maxQty) {
      throw new Error(`Quantity ${normalizedQuantity} is above exchange maximum (${maxQty}).`);
    }
    if (notional < minNotional) {
      throw new Error(`Notional value ${notional} is below exchange minimum (${minNotional}).`);
    }

    return {
      normalizedQuantity,
      normalizedPrice,
      stepSize,
      tickSize,
      minNotional
    };
  }
};
