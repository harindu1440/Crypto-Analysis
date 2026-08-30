import crypto from 'crypto';

export const BinanceExecution = {
  getApiBaseUrl() {
    const mode = process.env.BINANCE_MODE || 'testnet';
    return mode === 'live' 
      ? 'https://api.binance.com' 
      : 'https://testnet.binance.vision';
  },

  async executeOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number, clientOrderId?: string, price?: number) {
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new Error('BINANCE_API_KEY and BINANCE_API_SECRET must be configured.');
    }

    const timestamp = Date.now();
    const type = price ? 'LIMIT' : 'MARKET';
    const timeInForce = price ? '&timeInForce=GTC' : '';
    const priceParam = price ? `&price=${price}` : '';
    
    // Create unique Client Order ID if not provided
    const id = clientOrderId || `CAP_${timestamp}_${Math.floor(Math.random() * 10000)}`;

    const queryString = `symbol=${symbol}&side=${side}&type=${type}&quantity=${quantity}${priceParam}${timeInForce}&newClientOrderId=${id}&recvWindow=5000&timestamp=${timestamp}`;
    
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(queryString)
      .digest('hex');

    const url = `${this.getApiBaseUrl()}/api/v3/order?${queryString}&signature=${signature}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      // Safe error message to avoid exposing keys or raw signatures
      const safeErrorMsg = data.msg || `Binance HTTP ${response.status} Error`;
      throw new Error(`Binance Order Failed: ${safeErrorMsg}`);
    }

    return {
      orderId: data.orderId,
      clientOrderId: data.clientOrderId,
      status: data.status,
      executedQty: data.executedQty,
      cummulativeQuoteQty: data.cummulativeQuoteQty,
      raw: data // Note: DO NOT log the raw payload entirely in production logs
    };
  },

  async executeOCOOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number, price: number, stopPrice: number, stopLimitPrice?: number) {
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new Error('BINANCE_API_KEY and BINANCE_API_SECRET must be configured.');
    }

    const timestamp = Date.now();
    const listClientOrderId = `CAP_OCO_${timestamp}_${Math.floor(Math.random() * 10000)}`;

    let queryString = `symbol=${symbol}&side=${side}&quantity=${quantity}&price=${price}&stopPrice=${stopPrice}&listClientOrderId=${listClientOrderId}&recvWindow=5000&timestamp=${timestamp}`;
    
    if (stopLimitPrice) {
      queryString += `&stopLimitPrice=${stopLimitPrice}&stopLimitTimeInForce=GTC`;
    }

    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(queryString)
      .digest('hex');

    const url = `${this.getApiBaseUrl()}/api/v3/order/oco?${queryString}&signature=${signature}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      const safeErrorMsg = data.msg || `Binance HTTP ${response.status} Error`;
      throw new Error(`Binance OCO Failed: ${safeErrorMsg}`);
    }

    return {
      orderListId: data.orderListId,
      listClientOrderId: data.listClientOrderId,
      orders: data.orders
    };
  }
};
