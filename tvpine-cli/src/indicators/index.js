/**
 * Indicator Engine for tvpine-cli
 * Technical analysis indicators
 */

export class IndicatorEngine {
  constructor(data = []) {
    this.data = data;
    this.cache = new Map();
  }

  /**
   * Set data
   */
  setData(data) {
    this.data = data;
    this.cache.clear();
  }

  /**
   * Add a candle
   */
  addCandle(candle) {
    this.data.push(candle);
    if (this.data.length > 10000) {
      this.data.shift();
    }
    this.cache.clear();
  }

  /**
   * Calculate indicator by name
   */
  calculate(name, ...args) {
    const key = `${name}_${args.join('_')}`;

    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    let result;

    switch (name.toLowerCase()) {
      case 'sma':
        result = this.sma(args[0] || 20, args[1] || 'close');
        break;
      case 'ema':
        result = this.ema(args[0] || 20, args[1] || 'close');
        break;
      case 'rsi':
        result = this.rsi(args[0] || 14);
        break;
      case 'atr':
        result = this.atr(args[0] || 14);
        break;
      case 'macd':
        result = this.macd(args[0] || 12, args[1] || 26, args[2] || 9);
        break;
      case 'bb':
      case 'bollinger':
        result = this.bollingerBands(args[0] || 20, args[1] || 2);
        break;
      case 'td':
      case 'tdsequential':
        result = this.tdSequential();
        break;
      default:
        throw new Error(`Unknown indicator: ${name}`);
    }

    this.cache.set(key, result);
    return result;
  }

  /**
   * Simple Moving Average
   */
  sma(period = 20, source = 'close') {
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

    return result;
  }

  /**
   * Exponential Moving Average
   */
  ema(period = 20, source = 'close') {
    const result = [];
    const prices = this.data.map(d => d[source]);
    const multiplier = 2 / (period + 1);

    for (let i = 0; i < prices.length; i++) {
      if (i === 0) {
        result.push(prices[i]);
      } else {
        result.push((prices[i] - result[i - 1]) * multiplier + result[i - 1]);
      }
    }

    return result;
  }

  /**
   * Relative Strength Index
   */
  rsi(period = 14) {
    const result = [];
    const prices = this.data.map(d => d.close);

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
  }

  /**
   * Average True Range
   */
  atr(period = 14) {
    const result = [];

    for (let i = 0; i < this.data.length; i++) {
      if (i === 0) {
        result.push(this.data[i].high - this.data[i].low);
        continue;
      }

      const tr = Math.max(
        this.data[i].high - this.data[i].low,
        Math.abs(this.data[i].high - this.data[i - 1].close),
        Math.abs(this.data[i].low - this.data[i - 1].close)
      );

      if (i < period) {
        result.push(tr);
      } else {
        result.push((result[i - 1] * (period - 1) + tr) / period);
      }
    }

    return result;
  }

  /**
   * MACD
   */
  macd(fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const fastEma = this.ema(fastPeriod, 'close');
    const slowEma = this.ema(slowPeriod, 'close');

    const macdLine = fastEma.map((f, i) => f - slowEma[i]);

    // Signal line (EMA of MACD)
    const signalLine = [];
    const multiplier = 2 / (signalPeriod + 1);

    for (let i = 0; i < macdLine.length; i++) {
      if (i === 0) {
        signalLine.push(macdLine[i]);
      } else {
        signalLine.push((macdLine[i] - signalLine[i - 1]) * multiplier + signalLine[i - 1]);
      }
    }

    const histogram = macdLine.map((m, i) => m - signalLine[i]);

    return { macd: macdLine, signal: signalLine, histogram };
  }

  /**
   * Bollinger Bands
   */
  bollingerBands(period = 20, stdDev = 2) {
    const sma = this.sma(period, 'close');
    const upper = [];
    const lower = [];
    const prices = this.data.map(d => d.close);

    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) {
        upper.push(null);
        lower.push(null);
      } else {
        const slice = prices.slice(i - period + 1, i + 1);
        const mean = sma[i];
        const variance = slice.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / period;
        const std = Math.sqrt(variance);

        upper.push(mean + std * stdDev);
        lower.push(mean - std * stdDev);
      }
    }

    return { upper, middle: sma, lower };
  }

  /**
   * TD Sequential (simplified)
   */
  tdSequential() {
    const result = [];
    let buySetup = 0;
    let sellSetup = 0;

    for (let i = 0; i < this.data.length; i++) {
      if (i < 4) {
        result.push({ buySetup: 0, sellSetup: 0, signal: null });
        continue;
      }

      const current = this.data[i];
      const compare = this.data[i - 4];

      if (current.close < compare.close) {
        buySetup++;
        sellSetup = 0;
      } else if (current.close > compare.close) {
        sellSetup++;
        buySetup = 0;
      } else {
        buySetup = 0;
        sellSetup = 0;
      }

      let signal = null;
      if (buySetup >= 9) {
        signal = 'BUY_SETUP_COMPLETE';
        buySetup = 0;
      } else if (sellSetup >= 9) {
        signal = 'SELL_SETUP_COMPLETE';
        sellSetup = 0;
      }

      result.push({
        buySetup: buySetup,
        sellSetup: sellSetup,
        signal: signal
      });
    }

    return result;
  }

  /**
   * List available indicators
   */
  list() {
    return [
      'sma(period, source)',
      'ema(period, source)',
      'rsi(period)',
      'atr(period)',
      'macd(fast, slow, signal)',
      'bb(period, stdDev)',
      'tdsequential()'
    ];
  }
}
