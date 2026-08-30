"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinanceExecution = void 0;
const crypto_1 = __importDefault(require("crypto"));
exports.BinanceExecution = {
    getApiBaseUrl() {
        const mode = process.env.BINANCE_MODE || 'testnet';
        return mode === 'live'
            ? 'https://api.binance.com'
            : 'https://testnet.binance.vision';
    },
    async executeOrder(symbol, side, quantity, clientOrderId, price) {
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
        const signature = crypto_1.default
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
    }
};
