/**
 * IndicatorService.js
 * Technical Indicator Engine for Moon AI Trading Platform
 *
 * Features:
 * - TD Sequential (Tom DeMark) - multi-timeframe analysis
 * - Moving Averages (SMA, EMA)
 * - Pivot Points detection
 * - Fibonacci extensions
 * - Custom indicator injection system
 *
 * Ported from Attana Trading System with browser compatibility
 */

// ============================================
// TD SEQUENTIAL CONFIGURATION
// ============================================

const TD_CONFIG = {
  SETUP_LOOKBACK: 4,        // Compare to N bars ago
  SETUP_COUNT: 9,           // Perfect setup count
  COUNTDOWN_LOOKBACK: 2,    // Compare to N bars ago
  COUNTDOWN_COUNT: 13,      // Perfect countdown
  PERFECTION_BARS: [8, 9],  // Bars to check for perfection

  RISK_LEVELS: {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    EXTREME: 'EXTREME'
  }
};

export class IndicatorService {
  constructor(data = []) {
    this.data = data;
    this.indicators = new Map();
    this.customIndicators = new Map();

    // Register built-in indicators
    this._registerBuiltInIndicators();
  }

  /**
   * Set price data
   * @param {Array} data - OHLCV candle data
   */
  setData(data) {
    this.data = data;
    this.indicators.clear(); // Clear cached calculations
  }

  /**
   * Add a single candle (for live updates)
   */
  addCandle(candle) {
    this.data.push(candle);
    // Keep buffer reasonable
    if (this.data.length > 10000) {
      this.data.shift();
    }
    this.indicators.clear(); // Invalidate cache
  }

  // ============================================
  // TD SEQUENTIAL
  // ============================================

  /**
   * Calculate TD Setup for price data
   * Setup counts consecutive closes higher/lower than N bars ago
   *
   * @param {Array} priceData - Array of { open, high, low, close }
   * @returns {Array} Array with TD Setup counts added
   */
  calculateTDSetup(priceData = null) {
    const data = priceData || this.data;

    if (!data || data.length < TD_CONFIG.SETUP_LOOKBACK + 1) {
      return [];
    }

    const result = [];
    let buySetupCount = 0;
    let sellSetupCount = 0;

    for (let i = 0; i < data.length; i++) {
      const bar = data[i];
      const entry = {
        timestamp: bar.timestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        buySetup: 0,
        sellSetup: 0,
        buySetupComplete: false,
        sellSetupComplete: false,
        signal: null
      };

      if (i >= TD_CONFIG.SETUP_LOOKBACK) {
        const compareBar = data[i - TD_CONFIG.SETUP_LOOKBACK];

        // Buy Setup: Close < Close 4 bars ago
        if (bar.close < compareBar.close) {
          buySetupCount++;
          sellSetupCount = 0;
          entry.buySetup = buySetupCount;

          if (buySetupCount >= TD_CONFIG.SETUP_COUNT) {
            entry.buySetupComplete = true;
            entry.signal = 'BUY_SETUP_COMPLETE';
            buySetupCount = 0;
          }
        }
        // Sell Setup: Close > Close 4 bars ago
        else if (bar.close > compareBar.close) {
          sellSetupCount++;
          buySetupCount = 0;
          entry.sellSetup = sellSetupCount;

          if (sellSetupCount >= TD_CONFIG.SETUP_COUNT) {
            entry.sellSetupComplete = true;
            entry.signal = 'SELL_SETUP_COMPLETE';
            sellSetupCount = 0;
          }
        }
        // Price flip - reset counts
        else {
          buySetupCount = 0;
          sellSetupCount = 0;
        }
      }

      result.push(entry);
    }

    return result;
  }

  /**
   * Calculate TD Countdown after Setup completion
   * Countdown counts closes below/above 2 bars ago
   *
   * @param {Array} setupData - Data with TD Setup calculated
   * @returns {Array} Array with TD Countdown added
   */
  calculateTDCountdown(setupData) {
    if (!setupData || setupData.length < TD_CONFIG.COUNTDOWN_LOOKBACK + 1) {
      return setupData;
    }

    let buyCountdown = 0;
    let sellCountdown = 0;
    let inBuyCountdown = false;
    let inSellCountdown = false;

    for (let i = 0; i < setupData.length; i++) {
      const bar = setupData[i];
      bar.buyCountdown = 0;
      bar.sellCountdown = 0;
      bar.buyCountdownComplete = false;
      bar.sellCountdownComplete = false;

      // Start countdown after setup completes
      if (bar.buySetupComplete) {
        inBuyCountdown = true;
        buyCountdown = 0;
        inSellCountdown = false;
        sellCountdown = 0;
      }
      if (bar.sellSetupComplete) {
        inSellCountdown = true;
        sellCountdown = 0;
        inBuyCountdown = false;
        buyCountdown = 0;
      }

      // Count countdown bars
      if (i >= TD_CONFIG.COUNTDOWN_LOOKBACK) {
        const compareBar = setupData[i - TD_CONFIG.COUNTDOWN_LOOKBACK];

        // Buy Countdown: Close <= Low 2 bars ago
        if (inBuyCountdown && bar.close <= compareBar.low) {
          buyCountdown++;
          bar.buyCountdown = buyCountdown;

          if (buyCountdown >= TD_CONFIG.COUNTDOWN_COUNT) {
            bar.buyCountdownComplete = true;
            bar.signal = 'BUY_EXHAUSTION';
            inBuyCountdown = false;
            buyCountdown = 0;
          }
        }

        // Sell Countdown: Close >= High 2 bars ago
        if (inSellCountdown && bar.close >= compareBar.high) {
          sellCountdown++;
          bar.sellCountdown = sellCountdown;

          if (sellCountdown >= TD_CONFIG.COUNTDOWN_COUNT) {
            bar.sellCountdownComplete = true;
            bar.signal = 'SELL_EXHAUSTION';
            inSellCountdown = false;
            sellCountdown = 0;
          }
        }
      }
    }

    return setupData;
  }

  /**
   * Run full TD Sequential analysis
   * @returns {Object} TD analysis with setup and countdown
   */
  calculateTDSequential(priceData = null) {
    const data = priceData || this.data;
    const setup = this.calculateTDSetup(data);
    const full = this.calculateTDCountdown(setup);
    return full;
  }

  /**
   * Run multi-timeframe TD analysis
   * @returns {Object} TD analysis for daily, weekly, monthly
   */
  runMultiTimeframeTD() {
    if (!this.data || this.data.length < 15) {
      return {
        daily: { signal: null, buySetup: 0, sellSetup: 0 },
        weekly: { signal: null, buySetup: 0, sellSetup: 0 },
        monthly: { signal: null, buySetup: 0, sellSetup: 0 },
        composite: { signal: 'NEUTRAL', risk: 'UNKNOWN' }
      };
    }

    // Calculate TD for each timeframe
    const dailyTD = this.calculateTDSequential(this.data);
    const weeklyData = this._aggregateToWeekly(this.data);
    const weeklyTD = this.calculateTDSequential(weeklyData);
    const monthlyData = this._aggregateToMonthly(this.data);
    const monthlyTD = this.calculateTDSequential(monthlyData);

    // Get latest values
    const latestDaily = dailyTD.length > 0 ? dailyTD[dailyTD.length - 1] : {};
    const latestWeekly = weeklyTD.length > 0 ? weeklyTD[weeklyTD.length - 1] : {};
    const latestMonthly = monthlyTD.length > 0 ? monthlyTD[monthlyTD.length - 1] : {};

    // Calculate composite signal
    const composite = this._calculateCompositeSignal(latestDaily, latestWeekly, latestMonthly);

    return {
      timestamp: new Date().toISOString(),
      daily: {
        buySetup: latestDaily.buySetup || 0,
        sellSetup: latestDaily.sellSetup || 0,
        buyCountdown: latestDaily.buyCountdown || 0,
        sellCountdown: latestDaily.sellCountdown || 0,
        signal: latestDaily.signal
      },
      weekly: {
        buySetup: latestWeekly.buySetup || 0,
        sellSetup: latestWeekly.sellSetup || 0,
        buyCountdown: latestWeekly.buyCountdown || 0,
        sellCountdown: latestWeekly.sellCountdown || 0,
        signal: latestWeekly.signal
      },
      monthly: {
        buySetup: latestMonthly.buySetup || 0,
        sellSetup: latestMonthly.sellSetup || 0,
        buyCountdown: latestMonthly.buyCountdown || 0,
        sellCountdown: latestMonthly.sellCountdown || 0,
        signal: latestMonthly.signal
      },
      composite: composite,
      history: {
        daily: dailyTD.slice(-30),
        weekly: weeklyTD.slice(-12),
        monthly: monthlyTD.slice(-12)
      }
    };
  }

  /**
   * Calculate composite signal from multiple timeframes
   */
  _calculateCompositeSignal(daily, weekly, monthly) {
    let buyStrength = 0;
    let sellStrength = 0;
    const signals = [];

    // Daily signals (weight: 1)
    if (daily.signal) {
      signals.push({ timeframe: 'D', signal: daily.signal });
      if (daily.signal.includes('BUY')) buyStrength += 1;
      if (daily.signal.includes('SELL')) sellStrength += 1;
    }
    if (daily.buySetup >= 7) buyStrength += 0.5;
    if (daily.sellSetup >= 7) sellStrength += 0.5;

    // Weekly signals (weight: 2)
    if (weekly.signal) {
      signals.push({ timeframe: 'W', signal: weekly.signal });
      if (weekly.signal.includes('BUY')) buyStrength += 2;
      if (weekly.signal.includes('SELL')) sellStrength += 2;
    }
    if (weekly.buySetup >= 7) buyStrength += 1;
    if (weekly.sellSetup >= 7) sellStrength += 1;

    // Monthly signals (weight: 3)
    if (monthly.signal) {
      signals.push({ timeframe: 'M', signal: monthly.signal });
      if (monthly.signal.includes('BUY')) buyStrength += 3;
      if (monthly.signal.includes('SELL')) sellStrength += 3;
    }
    if (monthly.buySetup >= 7) buyStrength += 1.5;
    if (monthly.sellSetup >= 7) sellStrength += 1.5;

    // Determine composite signal
    let compositeSignal = 'NEUTRAL';
    let riskLevel = TD_CONFIG.RISK_LEVELS.LOW;

    if (buyStrength >= 3 && buyStrength > sellStrength) {
      compositeSignal = 'STRONG_BUY';
      riskLevel = buyStrength >= 5 ? TD_CONFIG.RISK_LEVELS.EXTREME : TD_CONFIG.RISK_LEVELS.HIGH;
    } else if (sellStrength >= 3 && sellStrength > buyStrength) {
      compositeSignal = 'STRONG_SELL';
      riskLevel = sellStrength >= 5 ? TD_CONFIG.RISK_LEVELS.EXTREME : TD_CONFIG.RISK_LEVELS.HIGH;
    } else if (buyStrength >= 1.5) {
      compositeSignal = 'BUY';
      riskLevel = TD_CONFIG.RISK_LEVELS.MEDIUM;
    } else if (sellStrength >= 1.5) {
      compositeSignal = 'SELL';
      riskLevel = TD_CONFIG.RISK_LEVELS.MEDIUM;
    }

    return {
      signal: compositeSignal,
      risk: riskLevel,
      buyStrength: buyStrength,
      sellStrength: sellStrength,
      conflict: buyStrength > 0 && sellStrength > 0,
      activeSignals: signals
    };
  }

  // ============================================
  // TIMEFRAME AGGREGATION
  // ============================================

  /**
   * Aggregate daily data to weekly bars
   */
  _aggregateToWeekly(dailyData) {
    if (!dailyData || dailyData.length === 0) return [];

    const weeklyBars = [];
    let currentWeek = null;
    let weekBar = null;

    dailyData.forEach(bar => {
      const date = new Date(bar.timestamp);
      const weekStart = this._getWeekStart(date);
      const weekKey = weekStart.toISOString().split('T')[0];

      if (weekKey !== currentWeek) {
        if (weekBar) weeklyBars.push(weekBar);
        currentWeek = weekKey;
        weekBar = {
          timestamp: weekStart.getTime(),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume || 0
        };
      } else if (weekBar) {
        weekBar.high = Math.max(weekBar.high, bar.high);
        weekBar.low = Math.min(weekBar.low, bar.low);
        weekBar.close = bar.close;
        weekBar.volume += bar.volume || 0;
      }
    });

    if (weekBar) weeklyBars.push(weekBar);
    return weeklyBars;
  }

  /**
   * Aggregate daily data to monthly bars
   */
  _aggregateToMonthly(dailyData) {
    if (!dailyData || dailyData.length === 0) return [];

    const monthlyBars = [];
    let currentMonth = null;
    let monthBar = null;

    dailyData.forEach(bar => {
      const date = new Date(bar.timestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (monthKey !== currentMonth) {
        if (monthBar) monthlyBars.push(monthBar);
        currentMonth = monthKey;
        monthBar = {
          timestamp: new Date(date.getFullYear(), date.getMonth(), 1).getTime(),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume || 0
        };
      } else if (monthBar) {
        monthBar.high = Math.max(monthBar.high, bar.high);
        monthBar.low = Math.min(monthBar.low, bar.low);
        monthBar.close = bar.close;
        monthBar.volume += bar.volume || 0;
      }
    });

    if (monthBar) monthlyBars.push(monthBar);
    return monthlyBars;
  }

  /**
   * Get week start date (Monday)
   */
  _getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  }

  // ============================================
  // MOVING AVERAGES
  // ============================================

  /**
   * Calculate Simple Moving Average
   * @param {number} period - SMA period
   * @param {string} source - Price source (close, open, high, low)
   */
  sma(period = 20, source = 'close') {
    const cacheKey = `sma_${period}_${source}`;
    if (this.indicators.has(cacheKey)) {
      return this.indicators.get(cacheKey);
    }

    const result = [];
    const prices = this.data.map(d => d[source]);

    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) {
        result.push(null);
      } else {
        const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        result.push(sum / period);
      }
    }

    this.indicators.set(cacheKey, result);
    return result;
  }

  /**
   * Calculate Exponential Moving Average
   * @param {number} period - EMA period
   * @param {string} source - Price source
   */
  ema(period = 20, source = 'close') {
    const cacheKey = `ema_${period}_${source}`;
    if (this.indicators.has(cacheKey)) {
      return this.indicators.get(cacheKey);
    }

    const result = [];
    const prices = this.data.map(d => d[source]);
    const multiplier = 2 / (period + 1);

    for (let i = 0; i < prices.length; i++) {
      if (i === 0) {
        result.push(prices[i]);
      } else if (i < period - 1) {
        // Use SMA for initial values
        const sum = prices.slice(0, i + 1).reduce((a, b) => a + b, 0);
        result.push(sum / (i + 1));
      } else {
        const emaValue = (prices[i] - result[i - 1]) * multiplier + result[i - 1];
        result.push(emaValue);
      }
    }

    this.indicators.set(cacheKey, result);
    return result;
  }

  // ============================================
  // PIVOT POINTS
  // ============================================

  /**
   * Detect pivot highs and lows
   * @param {number} leftBars - Bars to left
   * @param {number} rightBars - Bars to right
   */
  detectPivots(leftBars = 5, rightBars = 5) {
    const result = [];

    for (let i = leftBars; i < this.data.length - rightBars; i++) {
      const current = this.data[i];
      let isPivotHigh = true;
      let isPivotLow = true;

      // Check left bars
      for (let j = 1; j <= leftBars; j++) {
        if (this.data[i - j].high >= current.high) isPivotHigh = false;
        if (this.data[i - j].low <= current.low) isPivotLow = false;
      }

      // Check right bars
      for (let j = 1; j <= rightBars; j++) {
        if (this.data[i + j].high >= current.high) isPivotHigh = false;
        if (this.data[i + j].low <= current.low) isPivotLow = false;
      }

      result.push({
        index: i,
        timestamp: current.timestamp,
        isPivotHigh,
        isPivotLow,
        price: isPivotHigh ? current.high : (isPivotLow ? current.low : null)
      });
    }

    return result.filter(p => p.isPivotHigh || p.isPivotLow);
  }

  // ============================================
  // FIBONACCI
  // ============================================

  /**
   * Calculate Fibonacci retracement/extension levels
   * @param {number} high - Swing high
   * @param {number} low - Swing low
   * @param {boolean} isUptrend - Direction
   */
  fibonacciLevels(high, low, isUptrend = true) {
    const diff = high - low;
    const levels = {
      0: isUptrend ? low : high,
      0.236: isUptrend ? low + diff * 0.236 : high - diff * 0.236,
      0.382: isUptrend ? low + diff * 0.382 : high - diff * 0.382,
      0.5: isUptrend ? low + diff * 0.5 : high - diff * 0.5,
      0.618: isUptrend ? low + diff * 0.618 : high - diff * 0.618,
      0.786: isUptrend ? low + diff * 0.786 : high - diff * 0.786,
      1: isUptrend ? high : low,
      1.272: isUptrend ? low + diff * 1.272 : high - diff * 1.272,
      1.618: isUptrend ? low + diff * 1.618 : high - diff * 1.618,
      2.0: isUptrend ? low + diff * 2.0 : high - diff * 2.0,
      2.618: isUptrend ? low + diff * 2.618 : high - diff * 2.618
    };

    return levels;
  }

  // ============================================
  // CUSTOM INDICATOR INJECTION
  // ============================================

  /**
   * Register a custom indicator
   * @param {string} name - Indicator name
   * @param {Function} fn - Calculation function (receives data, returns array)
   */
  registerIndicator(name, fn) {
    this.customIndicators.set(name, fn);
    console.log(`✓ Registered custom indicator: ${name}`);
  }

  /**
   * Calculate a custom indicator
   * @param {string} name - Indicator name
   * @param  {...any} args - Additional arguments
   */
  calculate(name, ...args) {
    // Check custom indicators first
    if (this.customIndicators.has(name)) {
      return this.customIndicators.get(name)(this.data, ...args);
    }

    // Built-in indicators
    switch (name.toLowerCase()) {
      case 'sma':
        return this.sma(args[0] || 20, args[1] || 'close');
      case 'ema':
        return this.ema(args[0] || 20, args[1] || 'close');
      case 'td':
      case 'tdsequential':
        return this.calculateTDSequential();
      case 'td_mtf':
        return this.runMultiTimeframeTD();
      case 'pivots':
        return this.detectPivots(args[0] || 5, args[1] || 5);
      default:
        throw new Error(`Unknown indicator: ${name}`);
    }
  }

  /**
   * Register built-in indicators
   */
  _registerBuiltInIndicators() {
    // RSI
    this.registerIndicator('rsi', (data, period = 14) => {
      const result = [];
      const prices = data.map(d => d.close);

      for (let i = 0; i < prices.length; i++) {
        if (i < period) {
          result.push(null);
          continue;
        }

        let gains = 0;
        let losses = 0;

        for (let j = i - period + 1; j <= i; j++) {
          const change = prices[j] - prices[j - 1];
          if (change > 0) gains += change;
          else losses -= change;
        }

        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        result.push(100 - (100 / (1 + rs)));
      }

      return result;
    });

    // ATR
    this.registerIndicator('atr', (data, period = 14) => {
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
    });

    // MACD
    this.registerIndicator('macd', (data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
      const closes = data.map(d => d.close);
      const fastEma = [];
      const slowEma = [];
      const macdLine = [];
      const signalLine = [];
      const histogram = [];

      const fastMult = 2 / (fastPeriod + 1);
      const slowMult = 2 / (slowPeriod + 1);
      const signalMult = 2 / (signalPeriod + 1);

      for (let i = 0; i < closes.length; i++) {
        // Fast EMA
        if (i === 0) {
          fastEma.push(closes[i]);
          slowEma.push(closes[i]);
        } else {
          fastEma.push((closes[i] - fastEma[i - 1]) * fastMult + fastEma[i - 1]);
          slowEma.push((closes[i] - slowEma[i - 1]) * slowMult + slowEma[i - 1]);
        }

        // MACD line
        const macd = fastEma[i] - slowEma[i];
        macdLine.push(macd);

        // Signal line
        if (i === 0) {
          signalLine.push(macd);
        } else {
          signalLine.push((macd - signalLine[i - 1]) * signalMult + signalLine[i - 1]);
        }

        // Histogram
        histogram.push(macdLine[i] - signalLine[i]);
      }

      return { macd: macdLine, signal: signalLine, histogram };
    });
  }

  /**
   * Get all available indicators
   */
  listIndicators() {
    const builtIn = ['sma', 'ema', 'rsi', 'atr', 'macd', 'td', 'tdsequential', 'td_mtf', 'pivots', 'fibonacci'];
    const custom = Array.from(this.customIndicators.keys());
    return { builtIn, custom };
  }
}

// Export singleton for convenience
export const indicators = new IndicatorService();
