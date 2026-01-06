/**
 * DataService.js
 * Production-grade data service with fault tolerance
 *
 * Features:
 * - CSV data loading (local files)
 * - Live WebSocket streaming from Bybit/Binance (FREE, no API keys)
 * - Historical data fetching from exchanges
 * - Multi-exchange support
 * - Circuit breaker for fault tolerance
 * - Exponential backoff reconnection
 * - Structured logging
 * - Health monitoring integration
 */

import { CircuitBreaker } from '../core/CircuitBreaker.js';
import { RetryManager } from '../core/RetryManager.js';
import { logger } from '../core/Logger.js';
import { healthMonitor } from '../core/HealthMonitor.js';

export class DataService {
  constructor() {
    this.cache = new Map();
    this.ws = null;
    this.isStreaming = false;
    this.onCandleCallbacks = [];
    this.liveCandles = [];
    this.currentSymbol = null;
    this.currentTimeframe = null;
    this.currentExchange = null;

    // Exchange configurations (FREE public APIs)
    this.exchanges = {
      bybit: {
        ws: 'wss://stream.bybit.com/v5/public/linear',
        rest: 'https://api.bybit.com/v5/market/kline',
        intervals: {
          // Second-based intervals (WebSocket ONLY - NOT supported by REST API)
          '1s': '1',    // 1 second (WebSocket only)
          '5s': '5',    // 5 seconds (WebSocket only)
          '10s': '10',  // 10 seconds (WebSocket only)
          '15s': '15',  // 15 seconds (WebSocket only)
          '30s': '30',  // 30 seconds (WebSocket only)
          // Minute-based intervals (REST API + WebSocket)
          '1': '1',     // 1 minute
          '3': '3',     // 3 minutes
          '5': '5',     // 5 minutes
          '15': '15',   // 15 minutes
          '30': '30',   // 30 minutes
          // Hour-based intervals
          '60': '60',   // 1 hour
          '120': '120', // 2 hours
          '240': '240', // 4 hours
          '360': '360', // 6 hours
          '720': '720', // 12 hours
          // Day/Week/Month intervals
          'D': 'D',     // Daily
          'W': 'W',     // Weekly
          'M': 'M',     // Monthly
          // Human-readable aliases (backward compatibility)
          '1m': '1',
          '3m': '3',
          '5m': '5',
          '15m': '15',
          '30m': '30',
          '1h': '60',
          '2h': '120',
          '4h': '240',
          '6h': '360',
          '12h': '720',
          '1D': 'D',
          '1W': 'W',
          '1M': 'M'
        }
      },
      binance: {
        ws: 'wss://fstream.binance.com/ws',
        rest: 'https://fapi.binance.com/fapi/v1/klines',
        intervals: { '1s': '1s', '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1D': '1d' }
      }
    };

    // Production infrastructure
    this.circuitBreakers = {
      bybit: new CircuitBreaker({ name: 'bybit-ws', failureThreshold: 5, timeout: 30000 }),
      binance: new CircuitBreaker({ name: 'binance-ws', failureThreshold: 5, timeout: 30000 })
    };

    this.retryManager = new RetryManager({
      name: 'data-service',
      maxAttempts: 10,
      baseDelay: 1000,
      maxDelay: 60000
    });

    // Connection stats
    this.stats = {
      connectAttempts: 0,
      successfulConnections: 0,
      disconnections: 0,
      messagesReceived: 0,
      errors: 0,
      lastConnectedAt: null,
      lastDisconnectedAt: null
    };

    // Register health check
    this._registerHealthCheck();

    // Setup circuit breaker listeners
    this._setupCircuitBreakerListeners();
  }

  /**
   * Register WebSocket health check
   */
  _registerHealthCheck() {
    healthMonitor.register('websocket', async () => {
      return {
        connected: this.isStreaming,
        exchange: this.currentExchange,
        symbol: this.currentSymbol,
        timeframe: this.currentTimeframe,
        messagesReceived: this.stats.messagesReceived,
        uptime: this.stats.lastConnectedAt
          ? Date.now() - this.stats.lastConnectedAt
          : 0
      };
    }, { critical: true });

    healthMonitor.register('dataService', async () => {
      return {
        cacheSize: this.cache.size,
        liveCandles: this.liveCandles.length,
        stats: { ...this.stats }
      };
    });
  }

  /**
   * Setup circuit breaker event listeners
   */
  _setupCircuitBreakerListeners() {
    Object.entries(this.circuitBreakers).forEach(([exchange, cb]) => {
      cb.on('stateChange', ({ oldState, newState }) => {
        logger.warn(`Circuit breaker state change`, { exchange, oldState, newState });

        if (newState === 'OPEN') {
          logger.error(`Circuit breaker OPEN - ${exchange} connection failing`, { exchange });
        } else if (newState === 'CLOSED' && oldState === 'HALF_OPEN') {
          logger.info(`Circuit breaker recovered - ${exchange} connection restored`, { exchange });
        }
      });
    });
  }

  // ============================================
  // LIVE WEBSOCKET STREAMING
  // ============================================

  /**
   * Start live WebSocket streaming from exchange
   * @param {string} symbol - Trading symbol (e.g., 'BTCUSDT')
   * @param {string} timeframe - Timeframe (1s, 1m, 5m, 15m, 1h, 4h, 1D)
   * @param {string} exchange - Exchange name (bybit, binance)
   * @param {Function} onCandle - Callback for new candles
   */
  startLiveStream(symbol = 'BTCUSDT', timeframe = '1m', exchange = 'bybit', onCandle = null) {
    if (this.isStreaming) {
      logger.warn('Stream already active. Call stopLiveStream() first.');
      return;
    }

    if (onCandle) {
      this.onCandleCallbacks.push(onCandle);
    }

    this.currentSymbol = symbol;
    this.currentTimeframe = timeframe;
    this.currentExchange = exchange;

    logger.info('Starting live stream', { symbol, timeframe, exchange });

    if (exchange === 'bybit') {
      this._startBybitStreamWithRetry(symbol, timeframe);
    } else if (exchange === 'binance') {
      this._startBinanceStreamWithRetry(symbol, timeframe);
    } else {
      throw new Error(`Unknown exchange: ${exchange}`);
    }
  }

  /**
   * Stop live WebSocket stream
   */
  stopLiveStream() {
    if (!this.isStreaming) {
      logger.debug('No active stream to stop');
      return;
    }

    logger.info('Stopping live stream', {
      symbol: this.currentSymbol,
      timeframe: this.currentTimeframe,
      exchange: this.currentExchange
    });

    // Disable auto-reconnect
    this.shouldReconnect = false;

    // Close WebSocket connection
    if (this.ws) {
      try {
        this.ws.close(1000, 'User requested stream stop');
      } catch (error) {
        logger.error('Error closing WebSocket', { error: error.message });
      }
      this.ws = null;
    }

    this.isStreaming = false;
    this.stats.disconnections++;
    this.stats.lastDisconnectedAt = Date.now();

    logger.info('Live stream stopped successfully');
  }

  /**
   * Restart live stream with new parameters
   * Useful when switching symbols or timeframes
   */
  restartLiveStream(symbol, timeframe, exchange = 'bybit', onCandle = null) {
    logger.info('Restarting live stream', { symbol, timeframe, exchange });
    this.stopLiveStream();

    // Small delay to ensure clean disconnect
    setTimeout(() => {
      this.startLiveStream(symbol, timeframe, exchange, onCandle);
    }, 100);
  }

  /**
   * Bybit WebSocket stream with retry logic (supports 1s candles)
   */
  async _startBybitStreamWithRetry(symbol, timeframe) {
    this.shouldReconnect = true;

    const connect = async () => {
      // Check circuit breaker before attempting connection
      return this.circuitBreakers.bybit.execute(async () => {
        return new Promise((resolve, reject) => {
          this._startBybitStream(symbol, timeframe, resolve, reject);
        });
      });
    };

    try {
      await this.retryManager.execute(connect, { exchange: 'bybit', symbol, timeframe });
    } catch (error) {
      logger.error('Bybit connection failed after all retries', {
        exchange: 'bybit',
        symbol,
        timeframe,
        error: error.message
      });
    }
  }

  /**
   * Bybit WebSocket stream (supports 1s candles)
   */
  _startBybitStream(symbol, timeframe, onConnect, onError) {
    const interval = this.exchanges.bybit.intervals[timeframe] || '1';
    this.stats.connectAttempts++;

    this.ws = new WebSocket(this.exchanges.bybit.ws);

    this.ws.onopen = () => {
      const subscriptionTopic = `kline.${interval}.${symbol}`;
      logger.info('Connected to Bybit WebSocket', {
        symbol,
        timeframe,
        interval,
        subscriptionTopic
      });
      this.isStreaming = true;
      this.stats.successfulConnections++;
      this.stats.lastConnectedAt = Date.now();

      const subscribe = {
        op: 'subscribe',
        args: [subscriptionTopic]
      };

      console.log('🔴 Bybit WebSocket: Sending subscription:', JSON.stringify(subscribe));
      this.ws.send(JSON.stringify(subscribe));

      if (onConnect) onConnect();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.stats.messagesReceived++;

        // Log ALL WebSocket messages for debugging
        console.log('🟢 Bybit WebSocket message received:', {
          success: data.success,
          op: data.op,
          topic: data.topic,
          type: data.type,
          hasData: !!data.data
        });

        // Handle subscription confirmation
        if (data.success && data.op === 'subscribe') {
          console.log('✅ Bybit subscription confirmed');
          return;
        }

        // Handle kline data
        if (data.data && data.topic && data.topic.includes('kline')) {
          const kline = data.data[0];
          const candle = {
            timestamp: parseInt(kline.start),  // Numeric timestamp in milliseconds
            open: parseFloat(kline.open),
            high: parseFloat(kline.high),
            low: parseFloat(kline.low),
            close: parseFloat(kline.close),
            volume: parseFloat(kline.volume),
            confirmed: kline.confirm || false
          };

          console.log('📊 Live candle received:', {
            symbol,
            interval: timeframe,
            close: candle.close,
            time: new Date(candle.timestamp).toLocaleTimeString(),
            confirmed: candle.confirmed,
            callbackCount: this.onCandleCallbacks.length
          });

          this._processLiveCandle(candle);
        }
      } catch (e) {
        console.error('❌ WebSocket message parse error:', e.message);
        console.error('   Raw data:', event.data);
        logger.error('WebSocket message parse error', { error: e.message, data: event.data });
        this.stats.errors++;
      }
    };

    this.ws.onerror = (error) => {
      logger.error('Bybit WebSocket error', { error: error.message || 'Unknown error' });
      this.stats.errors++;
      if (onError) onError(new Error('WebSocket connection error'));
    };

    this.ws.onclose = (event) => {
      logger.info('Bybit WebSocket closed', { code: event.code, reason: event.reason });
      this.isStreaming = false;
      this.stats.disconnections++;
      this.stats.lastDisconnectedAt = Date.now();

      // Auto-reconnect with exponential backoff
      if (this.shouldReconnect) {
        logger.info('Scheduling reconnection with exponential backoff');
        this._startBybitStreamWithRetry(symbol, timeframe);
      }
    };
  }

  /**
   * Binance WebSocket stream with retry logic
   */
  async _startBinanceStreamWithRetry(symbol, timeframe) {
    this.shouldReconnect = true;

    const connect = async () => {
      return this.circuitBreakers.binance.execute(async () => {
        return new Promise((resolve, reject) => {
          this._startBinanceStream(symbol, timeframe, resolve, reject);
        });
      });
    };

    try {
      await this.retryManager.execute(connect, { exchange: 'binance', symbol, timeframe });
    } catch (error) {
      logger.error('Binance connection failed after all retries', {
        exchange: 'binance',
        symbol,
        timeframe,
        error: error.message
      });
    }
  }

  /**
   * Binance WebSocket stream
   */
  _startBinanceStream(symbol, timeframe, onConnect, onError) {
    const interval = this.exchanges.binance.intervals[timeframe] || '1m';
    const symbolLower = symbol.toLowerCase();
    const wsUrl = `${this.exchanges.binance.ws}/${symbolLower}@kline_${interval}`;
    this.stats.connectAttempts++;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      logger.info('Connected to Binance WebSocket', { symbol, timeframe });
      this.isStreaming = true;
      this.stats.successfulConnections++;
      this.stats.lastConnectedAt = Date.now();

      if (onConnect) onConnect();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.stats.messagesReceived++;

        if (data.k) {
          const kline = data.k;
          const candle = {
            timestamp: new Date(kline.t),
            open: parseFloat(kline.o),
            high: parseFloat(kline.h),
            low: parseFloat(kline.l),
            close: parseFloat(kline.c),
            volume: parseFloat(kline.v),
            confirmed: kline.x
          };

          this._processLiveCandle(candle);
        }
      } catch (e) {
        logger.error('WebSocket message parse error', { error: e.message });
        this.stats.errors++;
      }
    };

    this.ws.onerror = (error) => {
      logger.error('Binance WebSocket error', { error: error.message || 'Unknown error' });
      this.stats.errors++;
      if (onError) onError(new Error('WebSocket connection error'));
    };

    this.ws.onclose = (event) => {
      logger.info('Binance WebSocket closed', { code: event.code, reason: event.reason });
      this.isStreaming = false;
      this.stats.disconnections++;
      this.stats.lastDisconnectedAt = Date.now();

      if (this.shouldReconnect) {
        logger.info('Scheduling reconnection with exponential backoff');
        this._startBinanceStreamWithRetry(symbol, timeframe);
      }
    };
  }

  /**
   * Process incoming live candle
   */
  _processLiveCandle(candle) {
    // Add to live candles buffer (keep last 1000)
    this.liveCandles.push(candle);
    if (this.liveCandles.length > 1000) {
      this.liveCandles.shift();
    }

    // Log confirmed candles
    if (candle.confirmed) {
      logger.debug('Confirmed candle received', {
        symbol: this.currentSymbol,
        close: candle.close,
        volume: candle.volume
      });
    }

    // Notify all callbacks
    this.onCandleCallbacks.forEach(callback => {
      try {
        callback(candle);
      } catch (e) {
        logger.error('Candle callback error', { error: e.message });
      }
    });
  }

  /**
   * Stop live streaming
   */
  stopLiveStream() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isStreaming = false;
    this.onCandleCallbacks = [];

    logger.info('Live stream stopped', {
      symbol: this.currentSymbol,
      exchange: this.currentExchange,
      stats: { ...this.stats }
    });

    this.currentSymbol = null;
    this.currentTimeframe = null;
    this.currentExchange = null;
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      ...this.stats,
      isStreaming: this.isStreaming,
      currentSymbol: this.currentSymbol,
      currentTimeframe: this.currentTimeframe,
      currentExchange: this.currentExchange,
      liveCandles: this.liveCandles.length,
      circuitBreakers: {
        bybit: this.circuitBreakers.bybit.getState(),
        binance: this.circuitBreakers.binance.getState()
      }
    };
  }

  /**
   * Subscribe to live candle updates
   */
  onCandle(callback) {
    this.onCandleCallbacks.push(callback);
  }

  // ============================================
  // HISTORICAL DATA FROM EXCHANGES
  // ============================================

  /**
   * Fetch historical candles from exchange REST API
   * @param {string} symbol - Trading symbol
   * @param {string} timeframe - Timeframe
   * @param {number} limit - Number of candles
   * @param {string} exchange - Exchange name
   */
  async fetchHistorical(symbol = 'BTCUSDT', timeframe = '1h', limit = 500, exchange = 'bybit') {
    const cacheKey = `${exchange}:${symbol}:${timeframe}:${limit}`;

    if (this.cache.has(cacheKey)) {
      logger.debug('Loading from cache', { cacheKey });
      return this.cache.get(cacheKey);
    }

    logger.info('Fetching historical data', { symbol, timeframe, limit, exchange });

    try {
      let data;

      if (exchange === 'bybit') {
        data = await this._fetchBybitHistorical(symbol, timeframe, limit);
      } else if (exchange === 'binance') {
        data = await this._fetchBinanceHistorical(symbol, timeframe, limit);
      } else {
        throw new Error(`Unknown exchange: ${exchange}`);
      }

      this.cache.set(cacheKey, data);
      logger.info('Historical data loaded', { exchange, symbol, candles: data.length });
      return data;

    } catch (error) {
      logger.error('Historical fetch error', { exchange, symbol, error: error.message });
      throw error;
    }
  }

  /**
   * Fetch from Bybit REST API
   */
  async _fetchBybitHistorical(symbol, timeframe, limit) {
    const interval = this.exchanges.bybit.intervals[timeframe] || '60';
    const url = `${this.exchanges.bybit.rest}?category=linear&symbol=${symbol}&interval=${interval}&limit=${Math.min(limit, 1000)}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = await response.json();

    if (!json.result || !json.result.list) {
      throw new Error('Invalid Bybit response');
    }

    return json.result.list.map(k => ({
      timestamp: parseInt(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    })).sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Fetch from Binance REST API
   */
  async _fetchBinanceHistorical(symbol, timeframe, limit) {
    const interval = this.exchanges.binance.intervals[timeframe] || '1h';
    const url = `${this.exchanges.binance.rest}?symbol=${symbol}&interval=${interval}&limit=${Math.min(limit, 1500)}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = await response.json();

    return json.map(k => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
  }

  // ============================================
  // CSV DATA LOADING (ORIGINAL)
  // ============================================

  /**
   * Load Attana CSV data from server
   * @returns {Promise<Array>} Array of candlestick data
   */
  async loadAttanaCSV() {
    // Check cache first
    if (this.cache.has('attana')) {
      logger.debug('Loading Attana data from cache');
      return this.cache.get('attana');
    }

    try {
      const response = await fetch('/attana_ohlc.csv');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const csvText = await response.text();
      logger.debug('CSV loaded, parsing', { bytes: csvText.length });

      const data = this.parseCSV(csvText);

      // Cache the data
      this.cache.set('attana', data);

      logger.info('Attana CSV loaded', { candles: data.length });
      return data;

    } catch (error) {
      logger.error('Error loading Attana CSV', { error: error.message });
      throw new Error(`Failed to load Attana data: ${error.message}`);
    }
  }

  /**
   * Parse CSV text to candlestick data
   * @param {string} csvText - Raw CSV content
   * @returns {Array} Parsed candlestick data
   */
  parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const data = [];

    // Skip header row (line 0)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].replace(/"/g, ''); // Remove quotes
      const values = line.split(',');

      if (values.length >= 5) {
        try {
          // Parse date - fix year 2025->2024 typo from Investing.com
          let dateStr = values[0].trim().replace('/2025', '/2024');
          const date = new Date(dateStr);
          const timestamp = date.getTime();

          // Parse prices - handle both Swedish (comma) and standard (period) decimals
          const close = parseFloat(values[1].replace(',', '.'));
          const open = parseFloat(values[2].replace(',', '.'));
          const high = parseFloat(values[3].replace(',', '.'));
          const low = parseFloat(values[4].replace(',', '.'));

          // Parse volume with M/K suffixes
          let volume = 1000000; // Default
          if (values.length >= 6 && values[5].trim() !== '') {
            const volStr = values[5].trim();
            if (volStr.endsWith('M')) {
              volume = parseFloat(volStr.replace('M', '').replace(',', '.')) * 1000000;
            } else if (volStr.endsWith('K')) {
              volume = parseFloat(volStr.replace('K', '').replace(',', '.')) * 1000;
            } else {
              volume = parseFloat(volStr.replace(',', '.')) || 1000000;
            }
          }

          // Validate all values
          if (this.isValidCandle(timestamp, open, high, low, close, volume)) {
            data.push({ timestamp, open, high, low, close, volume });
          } else {
            logger.debug('Skipping invalid candle', { line: i, timestamp, open, high, low, close });
          }

        } catch (error) {
          logger.debug('Error parsing CSV line', { line: i, error: error.message });
        }
      }
    }

    // Sort by timestamp (oldest first)
    return data.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Validate candlestick data
   * @returns {boolean} True if valid
   */
  isValidCandle(timestamp, open, high, low, close, volume) {
    return !isNaN(timestamp) && timestamp > 0 &&
           typeof open === 'number' && !isNaN(open) && open > 0 &&
           typeof high === 'number' && !isNaN(high) && high > 0 &&
           typeof low === 'number' && !isNaN(low) && low > 0 &&
           typeof close === 'number' && !isNaN(close) && close > 0 &&
           typeof volume === 'number' && !isNaN(volume) && volume > 0;
  }

  /**
   * Transform data for 2D chart (Lightweight Charts format)
   * @param {Array} data - Raw candlestick data
   * @returns {Object} {candles, volume}
   */
  transformFor2D(data) {
    const candlestickData = data
      .filter(d => this.isValidCandle(d.timestamp, d.open, d.high, d.low, d.close, d.volume))
      .map(d => {
        // Use Unix timestamp in SECONDS for TradingView Lightweight Charts
        // This works for ALL timeframes (intraday and daily)
        const timestamp = typeof d.timestamp === 'number' ? d.timestamp : new Date(d.timestamp).getTime();
        const timeInSeconds = Math.floor(timestamp / 1000);

        return {
          time: timeInSeconds,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        };
      });

    const volumeData = data
      .filter(d => this.isValidCandle(d.timestamp, d.open, d.high, d.low, d.close, d.volume))
      .map(d => {
        const timestamp = typeof d.timestamp === 'number' ? d.timestamp : new Date(d.timestamp).getTime();
        const timeInSeconds = Math.floor(timestamp / 1000);

        return {
          time: timeInSeconds,
          value: d.volume,
          color: d.close >= d.open ? '#00b89433' : '#ff767533'
        };
      });

    // Sort by timestamp (Lightweight Charts requirement)
    const sortedCandles = candlestickData.sort((a, b) => a.time - b.time);
    const sortedVolume = volumeData.sort((a, b) => a.time - b.time);

    logger.debug('Transformed for 2D chart', { input: data.length, output: sortedCandles.length });

    return { candles: sortedCandles, volume: sortedVolume };
  }

  /**
   * Remove duplicate timestamps
   * @param {Array} data - Sorted data
   * @returns {Array} Deduplicated data
   */
  removeDuplicates(data) {
    const unique = [];
    const seen = new Set();

    data.forEach(item => {
      if (!seen.has(item.time)) {
        unique.push(item);
        seen.add(item.time);
      }
    });

    return unique;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    logger.info('Data cache cleared');
  }
}
