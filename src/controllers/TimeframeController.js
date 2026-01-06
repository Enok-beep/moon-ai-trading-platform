/**
 * TimeframeController.js
 * Controls candle interval buttons (1m, 5m, 15m, 1h, 4h, 1D, 1W, 1M)
 * Maps UI intervals to Bybit API intervals for real-time data fetching
 *
 * Moon AI Trading Platform - Week 1 Quick Win
 */

import { logger } from '../core/Logger.js';
import { toast } from '../utils/Toast.js';

export class TimeframeController {
  constructor(dataService, chartManager) {
    this.dataService = dataService;
    this.chartManager = chartManager;

    this.elements = {
      intervalButtons: []
    };

    this.currentInterval = '60'; // Default: 1 hour candles
    this.currentSymbol = 'BTCUSDT'; // Default symbol

    logger.debug('TimeframeController created');
  }

  /**
   * Initialize controller
   */
  init() {
    // Find all interval buttons
    this.elements.intervalButtons = Array.from(document.querySelectorAll('.interval-btn'));

    if (this.elements.intervalButtons.length === 0) {
      logger.warn('No interval buttons found');
      return false;
    }

    // Find active button to set current interval
    const activeBtn = this.elements.intervalButtons.find(btn => btn.classList.contains('active'));
    if (activeBtn) {
      this.currentInterval = activeBtn.dataset.interval;
    }

    // Setup event listeners
    this._setupEventListeners();

    logger.info('TimeframeController initialized', {
      buttonCount: this.elements.intervalButtons.length,
      defaultInterval: this.currentInterval
    });
    return true;
  }

  /**
   * Setup event listeners on interval buttons
   */
  _setupEventListeners() {
    console.log('🔧 TimeframeController: Setting up event listeners on', this.elements.intervalButtons.length, 'buttons');

    this.elements.intervalButtons.forEach((btn, index) => {
      const interval = btn.dataset.interval;
      console.log(`  Interval button ${index}: ${interval} (${btn.textContent})`);

      btn.addEventListener('click', async (e) => {
        console.log('👆 CLICK detected on interval button!', interval);
        await this.setInterval(interval, btn);
      });

      // Add hover effect
      btn.style.cursor = 'pointer';
    });

    console.log('✓ TimeframeController: Event listeners setup complete');
  }

  /**
   * Set new interval and fetch data
   * @param {string} interval - Bybit interval (1,5,15,60,240,D,W,M)
   * @param {HTMLElement} buttonElement - Clicked button element
   */
  async setInterval(interval, buttonElement) {
    console.log('🔵 TimeframeController: setInterval called', interval);

    if (this.currentInterval === interval) {
      console.log('⚠️ TimeframeController: Interval already selected', interval);
      return; // Already selected
    }

    // Update active state
    this.elements.intervalButtons.forEach(btn => btn.classList.remove('active'));
    if (buttonElement) {
      buttonElement.classList.add('active');
    }

    this.currentInterval = interval;
    logger.info('Interval changed', { interval, symbol: this.currentSymbol });

    // Fetch new data with the new interval
    await this.fetchDataWithCurrentInterval();
  }

  /**
   * Fetch data for current symbol with current interval
   * Also restarts WebSocket stream for real-time updates
   */
  async fetchDataWithCurrentInterval() {
    if (!this.currentSymbol) {
      logger.warn('Cannot fetch data: no symbol set');
      return;
    }

    const isWebSocketOnly = this._isWebSocketOnly();
    const loadingToast = toast.loading(
      isWebSocketOnly
        ? `Starting ${this._getIntervalLabel()} WebSocket stream...`
        : `Loading ${this.currentSymbol} ${this._getIntervalLabel()} candles...`
    );

    try {
      logger.info('Fetching data with interval', {
        symbol: this.currentSymbol,
        interval: this.currentInterval,
        webSocketOnly: isWebSocketOnly
      });

      // For WebSocket-only intervals (seconds), skip REST API fetch
      if (!isWebSocketOnly) {
        // Fetch historical data from Bybit REST API
        const data = await this.dataService.fetchHistorical(
          this.currentSymbol,
          this.currentInterval,
          500 // Bybit max limit
        );

        if (!data || data.length === 0) {
          throw new Error('No data returned from API');
        }

        // Transform for 2D chart
        const transformedData = this.dataService.transformFor2D(data);

        // Update chart with historical data
        this.chartManager.setData(data, transformedData);
      } else {
        // Clear chart for WebSocket-only intervals
        logger.warn('Second-based intervals only support WebSocket streaming (no historical data)');
      }

      // Restart WebSocket stream for this interval to get real-time updates
      this.dataService.restartLiveStream(
        this.currentSymbol,
        this.currentInterval,
        'bybit',
        (candle) => {
          // Real-time candle callback - update chart
          if (this.chartManager.chart2d) {
            const transformedCandle = {
              time: Math.floor(candle.timestamp / 1000),
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close
            };
            this.chartManager.chart2d.update(transformedCandle);
            logger.debug('Real-time candle updated', {
              symbol: this.currentSymbol,
              interval: this._getIntervalLabel(),
              close: candle.close
            });
          }
        }
      );

      if (isWebSocketOnly) {
        loadingToast.success(`${this._getIntervalLabel()} WebSocket stream active - Building chart from live data...`);
      } else {
        const transformedData = this.dataService.transformFor2D(
          await this.dataService.fetchHistorical(this.currentSymbol, this.currentInterval, 500)
        );
        loadingToast.success(`${this.currentSymbol} loaded (${transformedData.candles.length} ${this._getIntervalLabel()} candles) - Live updates active`);
      }

      logger.info('Interval data loaded successfully with live stream', {
        symbol: this.currentSymbol,
        interval: this.currentInterval,
        webSocketOnly: isWebSocketOnly
      });

    } catch (error) {
      logger.error('Failed to fetch interval data', {
        error: error.message,
        symbol: this.currentSymbol,
        interval: this.currentInterval
      });
      loadingToast.error(`Failed to load ${this._getIntervalLabel()} candles`);
    }
  }

  /**
   * Update current symbol (called by WatchlistController or main app)
   * @param {string} symbol - Symbol like 'BTCUSDT'
   */
  setSymbol(symbol) {
    console.log('🔵 TimeframeController: setSymbol called', symbol);
    this.currentSymbol = symbol;
  }

  /**
   * Check if interval is WebSocket-only (second-based)
   */
  _isWebSocketOnly() {
    return ['1s', '5s', '10s', '15s', '30s'].includes(this.currentInterval);
  }

  /**
   * Get human-readable interval label
   */
  _getIntervalLabel() {
    const labels = {
      // Second-based intervals
      '1s': '1s',
      '5s': '5s',
      '10s': '10s',
      '15s': '15s',
      '30s': '30s',
      // Minute-based intervals
      '1': '1m',
      '3': '3m',
      '5': '5m',
      '15': '15m',
      '30': '30m',
      // Hour-based intervals
      '60': '1h',
      '120': '2h',
      '240': '4h',
      '360': '6h',
      '720': '12h',
      // Day/Week/Month intervals
      'D': '1D',
      'W': '1W',
      'M': '1M'
    };
    return labels[this.currentInterval] || this.currentInterval;
  }

  /**
   * Get current interval
   */
  getCurrentInterval() {
    return this.currentInterval;
  }
}
