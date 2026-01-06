/**
 * IndicatorEngine.js - Custom Indicator Management & Cross-Feature Sync
 * Syncs indicators across: Pine Script Editor, AI Signals, Alerts, Screeners
 *
 * Moon AI Trading Platform v7.0
 */

import { getWindowSync, SYNC_EVENTS } from './WindowSync.js';
import eventBus from './EventBus.js';

/**
 * Built-in indicator configurations
 */
export const BUILTIN_INDICATORS = {
  RSI: {
    id: 'rsi',
    name: 'Relative Strength Index',
    shortName: 'RSI',
    category: 'momentum',
    params: {
      period: { default: 14, min: 2, max: 100, step: 1 }
    },
    levels: { overbought: 70, oversold: 30 },
    calculate: (data, params) => {
      const period = params.period || 14;
      const result = [];
      let gains = 0, losses = 0;

      for (let i = 0; i < data.length; i++) {
        if (i === 0) {
          result.push(null);
          continue;
        }

        const change = data[i].close - data[i - 1].close;
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;

        if (i < period) {
          gains += gain;
          losses += loss;
          result.push(null);
        } else if (i === period) {
          gains = gains / period;
          losses = losses / period;
          const rs = losses === 0 ? 100 : gains / losses;
          result.push(100 - (100 / (1 + rs)));
        } else {
          gains = (gains * (period - 1) + gain) / period;
          losses = (losses * (period - 1) + loss) / period;
          const rs = losses === 0 ? 100 : gains / losses;
          result.push(100 - (100 / (1 + rs)));
        }
      }
      return result;
    }
  },

  MACD: {
    id: 'macd',
    name: 'Moving Average Convergence Divergence',
    shortName: 'MACD',
    category: 'momentum',
    params: {
      fastPeriod: { default: 12, min: 2, max: 50, step: 1 },
      slowPeriod: { default: 26, min: 2, max: 100, step: 1 },
      signalPeriod: { default: 9, min: 2, max: 50, step: 1 }
    },
    calculate: (data, params) => {
      const { fastPeriod = 12, slowPeriod = 26, signalPeriod = 9 } = params;

      const ema = (arr, period) => {
        const k = 2 / (period + 1);
        const result = [arr[0]];
        for (let i = 1; i < arr.length; i++) {
          result.push(arr[i] * k + result[i - 1] * (1 - k));
        }
        return result;
      };

      const closes = data.map(d => d.close);
      const fastEMA = ema(closes, fastPeriod);
      const slowEMA = ema(closes, slowPeriod);
      const macdLine = fastEMA.map((v, i) => v - slowEMA[i]);
      const signalLine = ema(macdLine, signalPeriod);
      const histogram = macdLine.map((v, i) => v - signalLine[i]);

      return data.map((_, i) => ({
        macd: macdLine[i],
        signal: signalLine[i],
        histogram: histogram[i]
      }));
    }
  },

  SMA: {
    id: 'sma',
    name: 'Simple Moving Average',
    shortName: 'SMA',
    category: 'trend',
    params: {
      period: { default: 20, min: 2, max: 200, step: 1 }
    },
    calculate: (data, params) => {
      const period = params.period || 20;
      const result = [];

      for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
          result.push(null);
        } else {
          let sum = 0;
          for (let j = 0; j < period; j++) {
            sum += data[i - j].close;
          }
          result.push(sum / period);
        }
      }
      return result;
    }
  },

  EMA: {
    id: 'ema',
    name: 'Exponential Moving Average',
    shortName: 'EMA',
    category: 'trend',
    params: {
      period: { default: 20, min: 2, max: 200, step: 1 }
    },
    calculate: (data, params) => {
      const period = params.period || 20;
      const k = 2 / (period + 1);
      const result = [];

      for (let i = 0; i < data.length; i++) {
        if (i === 0) {
          result.push(data[i].close);
        } else {
          result.push(data[i].close * k + result[i - 1] * (1 - k));
        }
      }
      return result;
    }
  },

  BB: {
    id: 'bb',
    name: 'Bollinger Bands',
    shortName: 'BB',
    category: 'volatility',
    params: {
      period: { default: 20, min: 2, max: 100, step: 1 },
      stdDev: { default: 2, min: 0.5, max: 5, step: 0.5 }
    },
    calculate: (data, params) => {
      const { period = 20, stdDev = 2 } = params;
      const result = [];

      for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
          result.push({ upper: null, middle: null, lower: null });
          continue;
        }

        let sum = 0;
        for (let j = 0; j < period; j++) {
          sum += data[i - j].close;
        }
        const sma = sum / period;

        let variance = 0;
        for (let j = 0; j < period; j++) {
          variance += Math.pow(data[i - j].close - sma, 2);
        }
        const std = Math.sqrt(variance / period);

        result.push({
          upper: sma + stdDev * std,
          middle: sma,
          lower: sma - stdDev * std
        });
      }
      return result;
    }
  },

  ATR: {
    id: 'atr',
    name: 'Average True Range',
    shortName: 'ATR',
    category: 'volatility',
    params: {
      period: { default: 14, min: 2, max: 100, step: 1 }
    },
    calculate: (data, params) => {
      const period = params.period || 14;
      const result = [];

      for (let i = 0; i < data.length; i++) {
        if (i === 0) {
          result.push(data[i].high - data[i].low);
          continue;
        }

        const tr = Math.max(
          data[i].high - data[i].low,
          Math.abs(data[i].high - data[i - 1].close),
          Math.abs(data[i].low - data[i - 1].close)
        );

        if (i < period) {
          result.push(tr);
        } else {
          result.push((result[i - 1] * (period - 1) + tr) / period);
        }
      }
      return result;
    }
  },

  VWAP: {
    id: 'vwap',
    name: 'Volume Weighted Average Price',
    shortName: 'VWAP',
    category: 'trend',
    params: {},
    calculate: (data) => {
      let cumulativeTP = 0;
      let cumulativeVolume = 0;

      return data.map(candle => {
        const typicalPrice = (candle.high + candle.low + candle.close) / 3;
        cumulativeTP += typicalPrice * candle.volume;
        cumulativeVolume += candle.volume;
        return cumulativeVolume > 0 ? cumulativeTP / cumulativeVolume : null;
      });
    }
  },

  STOCH: {
    id: 'stoch',
    name: 'Stochastic Oscillator',
    shortName: 'Stochastic',
    category: 'momentum',
    params: {
      kPeriod: { default: 14, min: 2, max: 50, step: 1 },
      dPeriod: { default: 3, min: 1, max: 20, step: 1 }
    },
    levels: { overbought: 80, oversold: 20 },
    calculate: (data, params) => {
      const { kPeriod = 14, dPeriod = 3 } = params;
      const result = [];

      for (let i = 0; i < data.length; i++) {
        if (i < kPeriod - 1) {
          result.push({ k: null, d: null });
          continue;
        }

        let highestHigh = -Infinity;
        let lowestLow = Infinity;
        for (let j = 0; j < kPeriod; j++) {
          highestHigh = Math.max(highestHigh, data[i - j].high);
          lowestLow = Math.min(lowestLow, data[i - j].low);
        }

        const k = highestHigh === lowestLow
          ? 50
          : ((data[i].close - lowestLow) / (highestHigh - lowestLow)) * 100;

        // Calculate %D (SMA of %K)
        let d = null;
        if (i >= kPeriod + dPeriod - 2) {
          let sumK = k;
          for (let j = 1; j < dPeriod; j++) {
            sumK += result[i - j].k || 0;
          }
          d = sumK / dPeriod;
        }

        result.push({ k, d });
      }
      return result;
    }
  }
};

/**
 * Indicator categories
 */
export const INDICATOR_CATEGORIES = {
  trend: { name: 'Trend', icon: '📈' },
  momentum: { name: 'Momentum', icon: '⚡' },
  volatility: { name: 'Volatility', icon: '📊' },
  volume: { name: 'Volume', icon: '📶' },
  custom: { name: 'Custom', icon: '🔧' }
};

/**
 * IndicatorEngine - Manages custom and built-in indicators
 */
class IndicatorEngine {
  constructor() {
    this.indicators = new Map();
    this.customIndicators = new Map();
    this.activeIndicators = new Map(); // Currently applied indicators
    this.conditionHandlers = new Map();
    this.windowSync = null;

    // Load built-in indicators
    Object.entries(BUILTIN_INDICATORS).forEach(([key, indicator]) => {
      this.indicators.set(indicator.id, { ...indicator, isBuiltIn: true });
    });
  }

  /**
   * Initialize with WindowSync for cross-window communication
   */
  init(options = {}) {
    this.windowSync = getWindowSync(options);

    // Listen for indicator updates from other windows
    this.windowSync.on(SYNC_EVENTS.INDICATOR_ADD, (data) => {
      if (data.indicator) {
        this._applyFromSync(data.indicator);
      }
    });

    this.windowSync.on(SYNC_EVENTS.INDICATOR_REMOVE, (data) => {
      if (data.indicatorId) {
        this._removeFromSync(data.indicatorId);
      }
    });

    this.windowSync.on(SYNC_EVENTS.INDICATOR_UPDATE, (data) => {
      if (data.indicator) {
        this._updateFromSync(data.indicator);
      }
    });

    // Load saved custom indicators from localStorage
    this._loadSavedIndicators();

    console.log('[IndicatorEngine] Initialized with', this.indicators.size, 'built-in indicators');
  }

  /**
   * Register a custom indicator
   */
  registerCustom(indicator) {
    const id = indicator.id || `custom_${Date.now()}`;

    const customIndicator = {
      id,
      name: indicator.name || 'Custom Indicator',
      shortName: indicator.shortName || indicator.name?.substring(0, 5) || 'CUST',
      category: 'custom',
      params: indicator.params || {},
      calculate: indicator.calculate,
      pineScript: indicator.pineScript || null,
      createdAt: Date.now(),
      isBuiltIn: false,
      usedIn: [] // Track where it's used: ['chart', 'screener', 'alert', 'signal']
    };

    this.customIndicators.set(id, customIndicator);
    this.indicators.set(id, customIndicator);

    // Save to localStorage
    this._saveIndicators();

    // Broadcast to other windows
    if (this.windowSync) {
      this.windowSync.broadcast(SYNC_EVENTS.INDICATOR_ADD, {
        indicator: customIndicator,
        action: 'register'
      });
    }

    // Emit local event
    eventBus.emit('indicator:registered', { indicator: customIndicator });

    console.log('[IndicatorEngine] Custom indicator registered:', id);
    return id;
  }

  /**
   * Apply an indicator to a feature
   */
  apply(indicatorId, feature, options = {}) {
    const indicator = this.indicators.get(indicatorId);
    if (!indicator) {
      console.warn(`[IndicatorEngine] Indicator not found: ${indicatorId}`);
      return null;
    }

    const key = `${indicatorId}_${feature}`;
    const instance = {
      ...indicator,
      instanceId: key,
      feature,
      params: { ...indicator.params, ...options.params },
      appliedAt: Date.now()
    };

    this.activeIndicators.set(key, instance);

    // Track usage
    if (!indicator.usedIn.includes(feature)) {
      indicator.usedIn.push(feature);
    }

    // Emit event
    eventBus.emit('indicator:applied', { indicator: instance, feature });

    console.log(`[IndicatorEngine] Applied ${indicatorId} to ${feature}`);
    return instance;
  }

  /**
   * Remove an indicator from a feature
   */
  remove(indicatorId, feature) {
    const key = `${indicatorId}_${feature}`;
    const instance = this.activeIndicators.get(key);

    if (instance) {
      this.activeIndicators.delete(key);

      // Update usage tracking
      const indicator = this.indicators.get(indicatorId);
      if (indicator) {
        indicator.usedIn = indicator.usedIn.filter(f => f !== feature);
      }

      // Emit event
      eventBus.emit('indicator:removed', { indicatorId, feature });

      console.log(`[IndicatorEngine] Removed ${indicatorId} from ${feature}`);
    }
  }

  /**
   * Calculate indicator values for data
   */
  calculate(indicatorId, data, params = {}) {
    const indicator = this.indicators.get(indicatorId);
    if (!indicator || !indicator.calculate) {
      console.warn(`[IndicatorEngine] Cannot calculate: ${indicatorId}`);
      return null;
    }

    try {
      const mergedParams = {};
      Object.entries(indicator.params || {}).forEach(([key, config]) => {
        mergedParams[key] = params[key] !== undefined ? params[key] : config.default;
      });

      return indicator.calculate(data, mergedParams);
    } catch (error) {
      console.error(`[IndicatorEngine] Calculation error for ${indicatorId}:`, error);
      return null;
    }
  }

  /**
   * Register a condition handler for alerts
   */
  onCondition(conditionName, handler) {
    if (!this.conditionHandlers.has(conditionName)) {
      this.conditionHandlers.set(conditionName, []);
    }
    this.conditionHandlers.get(conditionName).push(handler);

    return () => {
      const handlers = this.conditionHandlers.get(conditionName);
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    };
  }

  /**
   * Trigger a condition (used by alert system)
   */
  triggerCondition(conditionName, data) {
    const handlers = this.conditionHandlers.get(conditionName) || [];
    handlers.forEach(handler => {
      try {
        handler(data.symbol, data.value, data);
      } catch (error) {
        console.error(`[IndicatorEngine] Condition handler error:`, error);
      }
    });

    // Broadcast condition trigger
    if (this.windowSync) {
      this.windowSync.broadcast(SYNC_EVENTS.INDICATOR_CONDITION, {
        condition: conditionName,
        ...data,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Get all indicators
   */
  getAll() {
    return Array.from(this.indicators.values());
  }

  /**
   * Get built-in indicators
   */
  getBuiltIn() {
    return this.getAll().filter(i => i.isBuiltIn);
  }

  /**
   * Get custom indicators
   */
  getCustom() {
    return Array.from(this.customIndicators.values());
  }

  /**
   * Get indicators by category
   */
  getByCategory(category) {
    return this.getAll().filter(i => i.category === category);
  }

  /**
   * Get active indicators for a feature
   */
  getActiveForFeature(feature) {
    return Array.from(this.activeIndicators.values())
      .filter(i => i.feature === feature);
  }

  /**
   * Delete a custom indicator
   */
  deleteCustom(indicatorId) {
    if (!this.customIndicators.has(indicatorId)) {
      console.warn(`[IndicatorEngine] Custom indicator not found: ${indicatorId}`);
      return false;
    }

    // Remove from all features
    for (const [key, instance] of this.activeIndicators) {
      if (instance.id === indicatorId) {
        this.activeIndicators.delete(key);
      }
    }

    this.customIndicators.delete(indicatorId);
    this.indicators.delete(indicatorId);

    // Save changes
    this._saveIndicators();

    // Broadcast removal
    if (this.windowSync) {
      this.windowSync.broadcast(SYNC_EVENTS.INDICATOR_REMOVE, {
        indicatorId,
        action: 'delete'
      });
    }

    // Emit event
    eventBus.emit('indicator:deleted', { indicatorId });

    console.log(`[IndicatorEngine] Deleted custom indicator: ${indicatorId}`);
    return true;
  }

  /**
   * Internal: Apply indicator from sync
   */
  _applyFromSync(indicator) {
    if (!this.indicators.has(indicator.id)) {
      this.indicators.set(indicator.id, indicator);
      if (!indicator.isBuiltIn) {
        this.customIndicators.set(indicator.id, indicator);
      }
      eventBus.emit('indicator:synced', { indicator });
    }
  }

  /**
   * Internal: Remove indicator from sync
   */
  _removeFromSync(indicatorId) {
    if (this.customIndicators.has(indicatorId)) {
      this.customIndicators.delete(indicatorId);
      this.indicators.delete(indicatorId);
      eventBus.emit('indicator:syncRemoved', { indicatorId });
    }
  }

  /**
   * Internal: Update indicator from sync
   */
  _updateFromSync(indicator) {
    if (this.indicators.has(indicator.id)) {
      this.indicators.set(indicator.id, indicator);
      if (!indicator.isBuiltIn) {
        this.customIndicators.set(indicator.id, indicator);
      }
      eventBus.emit('indicator:syncUpdated', { indicator });
    }
  }

  /**
   * Save custom indicators to localStorage
   */
  _saveIndicators() {
    try {
      const toSave = Array.from(this.customIndicators.values()).map(i => ({
        ...i,
        calculate: i.calculate?.toString() // Serialize function
      }));
      localStorage.setItem('moonai_custom_indicators', JSON.stringify(toSave));
    } catch (error) {
      console.error('[IndicatorEngine] Save error:', error);
    }
  }

  /**
   * Load custom indicators from localStorage
   */
  _loadSavedIndicators() {
    try {
      const saved = localStorage.getItem('moonai_custom_indicators');
      if (saved) {
        const indicators = JSON.parse(saved);
        indicators.forEach(i => {
          // Deserialize function (if possible)
          if (typeof i.calculate === 'string') {
            try {
              i.calculate = new Function('return ' + i.calculate)();
            } catch (e) {
              i.calculate = null;
            }
          }
          this.customIndicators.set(i.id, i);
          this.indicators.set(i.id, i);
        });
        console.log(`[IndicatorEngine] Loaded ${indicators.length} custom indicators`);
      }
    } catch (error) {
      console.error('[IndicatorEngine] Load error:', error);
    }
  }
}

// Singleton instance
const indicatorEngine = new IndicatorEngine();

// Export
export { indicatorEngine, IndicatorEngine };
export default indicatorEngine;
