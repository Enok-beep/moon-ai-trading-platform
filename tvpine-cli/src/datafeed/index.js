/**
 * DataFeed Module
 * Fetches historical and live data from exchanges
 */

import axios from 'axios';
import WebSocket from 'ws';
import { stringify } from 'csv-stringify/sync';
import fs from 'fs';

export class DataFeed {
  constructor(exchange = 'bybit') {
    this.exchange = exchange;

    this.exchanges = {
      bybit: {
        rest: 'https://api.bybit.com/v5/market/kline',
        ws: 'wss://stream.bybit.com/v5/public/linear',
        intervals: { '1s': '1', '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1D': 'D' }
      },
      binance: {
        rest: 'https://fapi.binance.com/fapi/v1/klines',
        ws: 'wss://fstream.binance.com/ws',
        intervals: { '1s': '1s', '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1D': '1d' }
      }
    };

    this.ws = null;
  }

  /**
   * Fetch historical candles
   */
  async fetchHistorical(symbol, timeframe, limit = 500) {
    const config = this.exchanges[this.exchange];

    if (this.exchange === 'bybit') {
      return this._fetchBybit(symbol, timeframe, limit);
    } else if (this.exchange === 'binance') {
      return this._fetchBinance(symbol, timeframe, limit);
    }

    throw new Error(`Unknown exchange: ${this.exchange}`);
  }

  async _fetchBybit(symbol, timeframe, limit) {
    const interval = this.exchanges.bybit.intervals[timeframe] || '60';
    const url = `${this.exchanges.bybit.rest}?category=linear&symbol=${symbol}&interval=${interval}&limit=${Math.min(limit, 1000)}`;

    const response = await axios.get(url);

    if (!response.data.result || !response.data.result.list) {
      throw new Error('Invalid Bybit response');
    }

    return response.data.result.list.map(k => ({
      timestamp: parseInt(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    })).sort((a, b) => a.timestamp - b.timestamp);
  }

  async _fetchBinance(symbol, timeframe, limit) {
    const interval = this.exchanges.binance.intervals[timeframe] || '1h';
    const url = `${this.exchanges.binance.rest}?symbol=${symbol}&interval=${interval}&limit=${Math.min(limit, 1500)}`;

    const response = await axios.get(url);

    return response.data.map(k => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
  }

  /**
   * Export data to CSV
   */
  async exportCSV(data, filename) {
    const csv = stringify(data, {
      header: true,
      columns: ['timestamp', 'open', 'high', 'low', 'close', 'volume']
    });

    fs.writeFileSync(filename, csv);
    console.log(`💾 Exported ${data.length} rows to ${filename}`);
  }

  /**
   * Stream live candles
   */
  async streamLive(symbol, timeframe, onCandle) {
    const config = this.exchanges[this.exchange];

    if (this.exchange === 'bybit') {
      await this._streamBybit(symbol, timeframe, onCandle);
    } else if (this.exchange === 'binance') {
      await this._streamBinance(symbol, timeframe, onCandle);
    }
  }

  async _streamBybit(symbol, timeframe, onCandle) {
    const interval = this.exchanges.bybit.intervals[timeframe] || '1';

    this.ws = new WebSocket(this.exchanges.bybit.ws);

    this.ws.on('open', () => {
      console.log(`🚀 Connected to Bybit ${timeframe} ${symbol}`);
      const subscribe = {
        op: 'subscribe',
        args: [`kline.${interval}.${symbol}`]
      };
      this.ws.send(JSON.stringify(subscribe));
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.data && msg.topic && msg.topic.includes('kline')) {
          const kline = msg.data[0];
          const candle = {
            timestamp: new Date(parseInt(kline.start)),
            open: parseFloat(kline.open),
            high: parseFloat(kline.high),
            low: parseFloat(kline.low),
            close: parseFloat(kline.close),
            volume: parseFloat(kline.volume),
            confirmed: kline.confirm || false
          };
          onCandle(candle);
        }
      } catch (e) {
        console.error('WS message error:', e.message);
      }
    });

    this.ws.on('error', (error) => {
      console.error('WS error:', error.message);
    });

    // Keep connection alive
    return new Promise((resolve) => {
      this.ws.on('close', () => {
        console.log('🔌 WebSocket closed');
        resolve();
      });
    });
  }

  async _streamBinance(symbol, timeframe, onCandle) {
    const interval = this.exchanges.binance.intervals[timeframe] || '1m';
    const symbolLower = symbol.toLowerCase();
    const wsUrl = `${this.exchanges.binance.ws}/${symbolLower}@kline_${interval}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log(`🚀 Connected to Binance ${timeframe} ${symbol}`);
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.k) {
          const kline = msg.k;
          const candle = {
            timestamp: new Date(kline.t),
            open: parseFloat(kline.o),
            high: parseFloat(kline.h),
            low: parseFloat(kline.l),
            close: parseFloat(kline.c),
            volume: parseFloat(kline.v),
            confirmed: kline.x
          };
          onCandle(candle);
        }
      } catch (e) {
        console.error('WS message error:', e.message);
      }
    });

    return new Promise((resolve) => {
      this.ws.on('close', resolve);
    });
  }

  /**
   * Close connection
   */
  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
