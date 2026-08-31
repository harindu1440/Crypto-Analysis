import crypto from 'crypto';
import { BinanceAccountSnapshot, BinanceOrderStatus } from '../account/types';

export const BinanceAccountApi = {
  getApiBaseUrl() {
    const mode = process.env.BINANCE_MODE || 'testnet';
    return mode === 'live'
      ? 'https://api.binance.com'
      : 'https://testnet.binance.vision';
  },

  getCredentials() {
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;
    if (!apiKey || !apiSecret || apiKey.trim() === '' || apiSecret.trim() === '') {
      return null;
    }
    return { apiKey, apiSecret };
  },

  async signedRequest(endpoint: string, method: string = 'GET', queryParams: string = '') {
    const creds = this.getCredentials();
    if (!creds) {
      throw new Error('NO_CREDENTIALS: API keys not configured.');
    }
    const { apiKey, apiSecret } = creds;
    const timestamp = Date.now();
    
    let queryString = `timestamp=${timestamp}&recvWindow=5000`;
    if (queryParams) {
      queryString = `${queryParams}&${queryString}`;
    }

    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(queryString)
      .digest('hex');

    const url = `${this.getApiBaseUrl()}${endpoint}?${queryString}&signature=${signature}`;

    const response = await fetch(url, {
      method,
      headers: {
        'X-MBX-APIKEY': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      const safeErrorMsg = data.msg || `Binance HTTP ${response.status} Error`;
      throw new Error(`Binance API Error on ${endpoint}: ${safeErrorMsg}`);
    }

    return data;
  },

  async getAccount(): Promise<BinanceAccountSnapshot> {
    const data = await this.signedRequest('/api/v3/account');
    
    return {
      timestamp: data.updateTime || Date.now(),
      balances: (data.balances || []).map((b: any) => ({
        asset: b.asset,
        free: parseFloat(b.free),
        locked: parseFloat(b.locked)
      }))
    };
  },

  async getOpenOrders(symbol?: string): Promise<BinanceOrderStatus[]> {
    const query = symbol ? `symbol=${symbol}` : '';
    const data = await this.signedRequest('/api/v3/openOrders', 'GET', query);
    
    return data.map((o: any) => ({
      symbol: o.symbol,
      orderId: o.orderId.toString(),
      clientOrderId: o.clientOrderId,
      status: o.status,
      side: o.side,
      type: o.type,
      origQty: parseFloat(o.origQty),
      executedQty: parseFloat(o.executedQty),
      price: parseFloat(o.price),
      avgPrice: parseFloat(o.avgPrice || '0'), // Sometimes avgPrice isn't on openOrders until filled
      time: o.time,
      updateTime: o.updateTime
    }));
  },

  async getOrder(symbol: string, clientOrderId?: string, orderId?: string): Promise<BinanceOrderStatus> {
    let query = `symbol=${symbol}`;
    if (clientOrderId) query += `&origClientOrderId=${clientOrderId}`;
    if (orderId) query += `&orderId=${orderId}`;

    const data = await this.signedRequest('/api/v3/order', 'GET', query);
    
    return {
      symbol: data.symbol,
      orderId: data.orderId.toString(),
      clientOrderId: data.clientOrderId,
      status: data.status,
      side: data.side,
      type: data.type,
      origQty: parseFloat(data.origQty),
      executedQty: parseFloat(data.executedQty),
      price: parseFloat(data.price),
      avgPrice: parseFloat(data.avgPrice || '0'),
      time: data.time,
      updateTime: data.updateTime
    };
  },

  async getExchangeInfo(symbol?: string): Promise<any> {
    const query = symbol ? `symbol=${symbol}` : '';
    const url = `${this.getApiBaseUrl()}/api/v3/exchangeInfo${query ? '?' + query : ''}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Binance API Error on exchangeInfo: ${data.msg}`);
    }

    return data;
  }
};
