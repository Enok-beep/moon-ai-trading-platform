/**
 * RiskService.js
 * Enterprise-grade risk management calculations
 * Kelly Criterion, VaR, Position Sizing, Portfolio Metrics
 *
 * Moon AI Trading Platform v6.5
 */

import { logger } from '../core/Logger.js';

/**
 * Risk calculation constants
 */
const CONFIDENCE_LEVELS = {
  90: 1.282,
  95: 1.645,
  99: 2.326
};

/**
 * RiskService - Professional risk management
 */
export class RiskService {
  constructor() {
    // Portfolio state
    this.portfolioValue = 100000;
    this.positions = new Map();
    this.trades = [];
    this.maxTrades = 1000;

    // Risk parameters
    this.maxRiskPerTrade = 0.02; // 2%
    this.maxPortfolioRisk = 0.06; // 6%
    this.riskFreeRate = 0.05; // 5% annual

    // Performance tracking
    this.returns = [];
    this.maxDrawdown = 0;
    this.peakValue = this.portfolioValue;

    // Event listeners
    this.listeners = new Map();

    logger.info('RiskService initialized', {
      portfolioValue: this.portfolioValue,
      maxRiskPerTrade: this.maxRiskPerTrade
    });
  }

  // ============================================
  // KELLY CRITERION
  // ============================================

  /**
   * Calculate Kelly Criterion optimal position size
   * Kelly % = W - [(1-W)/R]
   * Where W = Win probability, R = Win/Loss ratio
   *
   * @param {number} winRate - Historical win rate (0-1)
   * @param {number} avgWin - Average winning trade amount
   * @param {number} avgLoss - Average losing trade amount
   * @param {number} fraction - Kelly fraction (0.5 = half Kelly for safety)
   * @returns {Object} Kelly calculation result
   */
  calculateKelly(winRate, avgWin, avgLoss, fraction = 0.5) {
    // Validate inputs
    if (winRate < 0 || winRate > 1) {
      throw new Error('Win rate must be between 0 and 1');
    }
    if (avgLoss <= 0) {
      throw new Error('Average loss must be positive');
    }

    const winLossRatio = avgWin / Math.abs(avgLoss);
    const lossRate = 1 - winRate;

    // Full Kelly percentage
    const fullKelly = winRate - (lossRate / winLossRatio);

    // Apply fraction (half Kelly is common for safety)
    const kellyPercent = fullKelly * fraction;

    // Clamp to reasonable bounds
    const clampedKelly = Math.max(0, Math.min(kellyPercent, this.maxRiskPerTrade * 5));

    // Calculate position sizes
    const positionValue = this.portfolioValue * clampedKelly;
    const maxLoss = positionValue * (avgLoss / avgWin);

    const result = {
      fullKelly: fullKelly * 100,
      adjustedKelly: clampedKelly * 100,
      positionValue,
      positionPercent: clampedKelly * 100,
      expectedEdge: (winRate * avgWin) - (lossRate * Math.abs(avgLoss)),
      maxLoss,
      winLossRatio,
      fraction,
      recommendation: this._getKellyRecommendation(fullKelly)
    };

    logger.debug('Kelly calculated', result);
    return result;
  }

  /**
   * Calculate Kelly from trade history
   */
  calculateKellyFromHistory() {
    if (this.trades.length < 20) {
      return {
        error: 'Insufficient trade history',
        minTrades: 20,
        currentTrades: this.trades.length
      };
    }

    const wins = this.trades.filter(t => t.pnl > 0);
    const losses = this.trades.filter(t => t.pnl < 0);

    if (losses.length === 0) {
      return { error: 'No losing trades to calculate ratio' };
    }

    const winRate = wins.length / this.trades.length;
    const avgWin = wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length;
    const avgLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length);

    return this.calculateKelly(winRate, avgWin, avgLoss);
  }

  /**
   * Get Kelly recommendation text
   */
  _getKellyRecommendation(kelly) {
    if (kelly <= 0) return 'AVOID - Negative edge';
    if (kelly < 0.05) return 'SMALL - Minimal position';
    if (kelly < 0.10) return 'MODERATE - Standard position';
    if (kelly < 0.20) return 'AGGRESSIVE - High conviction';
    return 'MAXIMUM - Full position';
  }

  // ============================================
  // VALUE AT RISK (VaR)
  // ============================================

  /**
   * Calculate Historical VaR
   * @param {number} confidenceLevel - Confidence level (90, 95, 99)
   * @param {number} holdingPeriod - Days to hold
   * @returns {Object} VaR calculation result
   */
  calculateHistoricalVaR(confidenceLevel = 95, holdingPeriod = 1) {
    if (this.returns.length < 30) {
      return {
        error: 'Insufficient return history',
        minReturns: 30,
        currentReturns: this.returns.length
      };
    }

    // Sort returns ascending
    const sortedReturns = [...this.returns].sort((a, b) => a - b);

    // Find percentile index
    const percentile = (100 - confidenceLevel) / 100;
    const index = Math.floor(sortedReturns.length * percentile);

    // VaR at percentile
    const varPercent = Math.abs(sortedReturns[index]);

    // Scale for holding period (sqrt of time)
    const scaledVar = varPercent * Math.sqrt(holdingPeriod);

    // Dollar VaR
    const varDollar = this.portfolioValue * scaledVar;

    const result = {
      method: 'historical',
      confidenceLevel,
      holdingPeriod,
      varPercent: scaledVar * 100,
      varDollar,
      portfolioValue: this.portfolioValue,
      samplesUsed: this.returns.length
    };

    logger.debug('Historical VaR calculated', result);
    return result;
  }

  /**
   * Calculate Parametric VaR (Variance-Covariance)
   * @param {number} confidenceLevel - Confidence level
   * @param {number} holdingPeriod - Days
   * @returns {Object} VaR result
   */
  calculateParametricVaR(confidenceLevel = 95, holdingPeriod = 1) {
    if (this.returns.length < 30) {
      return {
        error: 'Insufficient return history',
        minReturns: 30,
        currentReturns: this.returns.length
      };
    }

    // Calculate mean and standard deviation
    const mean = this.returns.reduce((a, b) => a + b, 0) / this.returns.length;
    const variance = this.returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / this.returns.length;
    const stdDev = Math.sqrt(variance);

    // Z-score for confidence level
    const zScore = CONFIDENCE_LEVELS[confidenceLevel] || 1.645;

    // VaR = z * σ * √t (assuming mean = 0 for conservative estimate)
    const varPercent = zScore * stdDev * Math.sqrt(holdingPeriod);
    const varDollar = this.portfolioValue * varPercent;

    const result = {
      method: 'parametric',
      confidenceLevel,
      holdingPeriod,
      varPercent: varPercent * 100,
      varDollar,
      mean: mean * 100,
      stdDev: stdDev * 100,
      zScore,
      portfolioValue: this.portfolioValue
    };

    logger.debug('Parametric VaR calculated', result);
    return result;
  }

  /**
   * Calculate Monte Carlo VaR
   * @param {number} simulations - Number of simulations
   * @param {number} confidenceLevel - Confidence level
   * @param {number} holdingPeriod - Days
   * @returns {Object} VaR result
   */
  calculateMonteCarloVaR(simulations = 10000, confidenceLevel = 95, holdingPeriod = 1) {
    if (this.returns.length < 30) {
      return {
        error: 'Insufficient return history',
        minReturns: 30,
        currentReturns: this.returns.length
      };
    }

    // Calculate historical mean and stddev
    const mean = this.returns.reduce((a, b) => a + b, 0) / this.returns.length;
    const variance = this.returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / this.returns.length;
    const stdDev = Math.sqrt(variance);

    // Run simulations
    const simulatedReturns = [];
    for (let i = 0; i < simulations; i++) {
      let totalReturn = 0;
      for (let d = 0; d < holdingPeriod; d++) {
        // Box-Muller transform for normal distribution
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        totalReturn += mean + stdDev * z;
      }
      simulatedReturns.push(totalReturn);
    }

    // Sort and find percentile
    simulatedReturns.sort((a, b) => a - b);
    const percentile = (100 - confidenceLevel) / 100;
    const index = Math.floor(simulations * percentile);
    const varPercent = Math.abs(simulatedReturns[index]);

    const result = {
      method: 'monteCarlo',
      confidenceLevel,
      holdingPeriod,
      simulations,
      varPercent: varPercent * 100,
      varDollar: this.portfolioValue * varPercent,
      portfolioValue: this.portfolioValue
    };

    logger.debug('Monte Carlo VaR calculated', result);
    return result;
  }

  // ============================================
  // POSITION SIZING
  // ============================================

  /**
   * Calculate position size based on risk parameters
   * @param {number} entryPrice - Entry price
   * @param {number} stopLoss - Stop loss price
   * @param {number} riskPercent - Risk percentage (default: maxRiskPerTrade)
   * @returns {Object} Position sizing result
   */
  calculatePositionSize(entryPrice, stopLoss, riskPercent = null) {
    riskPercent = riskPercent || this.maxRiskPerTrade;

    const riskPerShare = Math.abs(entryPrice - stopLoss);
    if (riskPerShare === 0) {
      return { error: 'Stop loss cannot equal entry price' };
    }

    const dollarRisk = this.portfolioValue * riskPercent;
    const shares = Math.floor(dollarRisk / riskPerShare);
    const positionValue = shares * entryPrice;
    const positionPercent = positionValue / this.portfolioValue;

    const result = {
      shares,
      positionValue,
      positionPercent: positionPercent * 100,
      dollarRisk,
      riskPercent: riskPercent * 100,
      riskPerShare,
      entryPrice,
      stopLoss,
      reward: null // Will be set if takeProfit provided
    };

    logger.debug('Position size calculated', result);
    return result;
  }

  /**
   * Calculate position size with risk/reward ratio
   * @param {number} entryPrice
   * @param {number} stopLoss
   * @param {number} takeProfit
   * @param {number} riskPercent
   * @returns {Object} Position sizing with R:R
   */
  calculatePositionWithRR(entryPrice, stopLoss, takeProfit, riskPercent = null) {
    const position = this.calculatePositionSize(entryPrice, stopLoss, riskPercent);
    if (position.error) return position;

    const risk = Math.abs(entryPrice - stopLoss);
    const reward = Math.abs(takeProfit - entryPrice);
    const rrRatio = reward / risk;

    position.takeProfit = takeProfit;
    position.potentialReward = position.shares * reward;
    position.riskRewardRatio = rrRatio.toFixed(2) + ':1';

    return position;
  }

  // ============================================
  // PORTFOLIO METRICS
  // ============================================

  /**
   * Add a completed trade to history
   * @param {Object} trade - Trade details
   */
  addTrade(trade) {
    const normalizedTrade = {
      id: trade.id || `trade-${Date.now()}`,
      symbol: trade.symbol,
      side: trade.side,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      shares: trade.shares,
      pnl: trade.pnl || ((trade.exitPrice - trade.entryPrice) * trade.shares * (trade.side === 'long' ? 1 : -1)),
      entryTime: trade.entryTime || Date.now(),
      exitTime: trade.exitTime || Date.now()
    };

    this.trades.push(normalizedTrade);

    // Keep only recent trades
    if (this.trades.length > this.maxTrades) {
      this.trades = this.trades.slice(-this.maxTrades);
    }

    // Update portfolio value
    this.portfolioValue += normalizedTrade.pnl;

    // Calculate return and add to returns array
    const returnPercent = normalizedTrade.pnl / (this.portfolioValue - normalizedTrade.pnl);
    this.returns.push(returnPercent);

    // Keep only recent returns
    if (this.returns.length > 252) { // ~1 year of daily returns
      this.returns = this.returns.slice(-252);
    }

    // Update drawdown tracking
    if (this.portfolioValue > this.peakValue) {
      this.peakValue = this.portfolioValue;
    }
    const drawdown = (this.peakValue - this.portfolioValue) / this.peakValue;
    if (drawdown > this.maxDrawdown) {
      this.maxDrawdown = drawdown;
    }

    this._emit('tradeAdded', normalizedTrade);
    logger.debug('Trade added', normalizedTrade);

    return normalizedTrade;
  }

  /**
   * Calculate comprehensive portfolio metrics
   * @returns {Object} Portfolio metrics
   */
  calculateMetrics() {
    if (this.trades.length === 0) {
      return {
        totalTrades: 0,
        message: 'No trades to analyze'
      };
    }

    const wins = this.trades.filter(t => t.pnl > 0);
    const losses = this.trades.filter(t => t.pnl < 0);

    const totalPnl = this.trades.reduce((sum, t) => sum + t.pnl, 0);
    const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

    // Win rate
    const winRate = wins.length / this.trades.length;

    // Average win/loss
    const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;

    // Profit factor
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : Infinity;

    // Expectancy (average trade)
    const expectancy = totalPnl / this.trades.length;

    // Sharpe ratio (assuming 252 trading days)
    let sharpeRatio = 0;
    if (this.returns.length > 0) {
      const avgReturn = this.returns.reduce((a, b) => a + b, 0) / this.returns.length;
      const variance = this.returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / this.returns.length;
      const stdDev = Math.sqrt(variance);
      const annualizedReturn = avgReturn * 252;
      const annualizedStdDev = stdDev * Math.sqrt(252);
      sharpeRatio = annualizedStdDev > 0 ? (annualizedReturn - this.riskFreeRate) / annualizedStdDev : 0;
    }

    // Sortino ratio (downside deviation only)
    let sortinoRatio = 0;
    if (this.returns.length > 0) {
      const avgReturn = this.returns.reduce((a, b) => a + b, 0) / this.returns.length;
      const downsideReturns = this.returns.filter(r => r < 0);
      if (downsideReturns.length > 0) {
        const downsideVariance = downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length;
        const downsideDeviation = Math.sqrt(downsideVariance);
        const annualizedDownside = downsideDeviation * Math.sqrt(252);
        const annualizedReturn = avgReturn * 252;
        sortinoRatio = annualizedDownside > 0 ? (annualizedReturn - this.riskFreeRate) / annualizedDownside : 0;
      }
    }

    const metrics = {
      // Trade counts
      totalTrades: this.trades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: (winRate * 100).toFixed(1) + '%',

      // P&L
      totalPnl,
      grossProfit,
      grossLoss,
      avgWin,
      avgLoss,

      // Ratios
      profitFactor: profitFactor.toFixed(2),
      expectancy,
      winLossRatio: avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : 'N/A',

      // Risk metrics
      maxDrawdown: (this.maxDrawdown * 100).toFixed(2) + '%',
      sharpeRatio: sharpeRatio.toFixed(2),
      sortinoRatio: sortinoRatio.toFixed(2),

      // Portfolio
      portfolioValue: this.portfolioValue,
      peakValue: this.peakValue
    };

    return metrics;
  }

  // ============================================
  // POSITION MANAGEMENT
  // ============================================

  /**
   * Add an open position
   * @param {Object} position
   */
  addPosition(position) {
    const pos = {
      id: position.id || `pos-${Date.now()}`,
      symbol: position.symbol,
      side: position.side,
      shares: position.shares,
      entryPrice: position.entryPrice,
      currentPrice: position.currentPrice || position.entryPrice,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      openedAt: position.openedAt || Date.now()
    };

    pos.unrealizedPnl = (pos.currentPrice - pos.entryPrice) * pos.shares * (pos.side === 'long' ? 1 : -1);
    pos.unrealizedPercent = ((pos.currentPrice - pos.entryPrice) / pos.entryPrice) * (pos.side === 'long' ? 100 : -100);

    this.positions.set(pos.symbol, pos);
    this._emit('positionAdded', pos);

    return pos;
  }

  /**
   * Update position with current price
   * @param {string} symbol
   * @param {number} currentPrice
   */
  updatePosition(symbol, currentPrice) {
    const pos = this.positions.get(symbol);
    if (pos) {
      pos.currentPrice = currentPrice;
      pos.unrealizedPnl = (pos.currentPrice - pos.entryPrice) * pos.shares * (pos.side === 'long' ? 1 : -1);
      pos.unrealizedPercent = ((pos.currentPrice - pos.entryPrice) / pos.entryPrice) * (pos.side === 'long' ? 100 : -100);

      this._emit('positionUpdated', pos);
    }
    return pos;
  }

  /**
   * Close a position
   * @param {string} symbol
   * @param {number} exitPrice
   */
  closePosition(symbol, exitPrice) {
    const pos = this.positions.get(symbol);
    if (pos) {
      const trade = {
        symbol: pos.symbol,
        side: pos.side,
        entryPrice: pos.entryPrice,
        exitPrice,
        shares: pos.shares,
        entryTime: pos.openedAt,
        exitTime: Date.now()
      };

      this.positions.delete(symbol);
      this.addTrade(trade);
      this._emit('positionClosed', { position: pos, exitPrice, pnl: trade.pnl });

      return trade;
    }
    return null;
  }

  /**
   * Get all open positions
   */
  getPositions() {
    return Array.from(this.positions.values());
  }

  /**
   * Calculate total portfolio exposure
   */
  calculateExposure() {
    const positions = this.getPositions();

    const longExposure = positions
      .filter(p => p.side === 'long')
      .reduce((sum, p) => sum + (p.shares * p.currentPrice), 0);

    const shortExposure = positions
      .filter(p => p.side === 'short')
      .reduce((sum, p) => sum + (p.shares * p.currentPrice), 0);

    const netExposure = longExposure - shortExposure;
    const grossExposure = longExposure + shortExposure;
    const totalUnrealizedPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);

    return {
      longExposure,
      shortExposure,
      netExposure,
      grossExposure,
      longExposurePercent: (longExposure / this.portfolioValue * 100).toFixed(1),
      shortExposurePercent: (shortExposure / this.portfolioValue * 100).toFixed(1),
      netExposurePercent: (netExposure / this.portfolioValue * 100).toFixed(1),
      totalUnrealizedPnl,
      positionsCount: positions.length
    };
  }

  // ============================================
  // PORTFOLIO VALUE MANAGEMENT
  // ============================================

  /**
   * Set portfolio value
   * @param {number} value
   */
  setPortfolioValue(value) {
    this.portfolioValue = value;
    this.peakValue = Math.max(this.peakValue, value);
    this._emit('portfolioValueChanged', { value });
  }

  /**
   * Get current portfolio value
   */
  getPortfolioValue() {
    const exposure = this.calculateExposure();
    return {
      cash: this.portfolioValue,
      unrealizedPnl: exposure.totalUnrealizedPnl,
      totalValue: this.portfolioValue + exposure.totalUnrealizedPnl
    };
  }

  // ============================================
  // EVENT SYSTEM
  // ============================================

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(callback);
      if (index > -1) handlers.splice(index, 1);
    }
  }

  _emit(event, data) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(cb => {
        try { cb(data); }
        catch (e) { logger.error('Event handler error', { event, error: e.message }); }
      });
    }
  }

  // ============================================
  // PERSISTENCE
  // ============================================

  /**
   * Export risk data to JSON
   */
  export() {
    return {
      portfolioValue: this.portfolioValue,
      peakValue: this.peakValue,
      maxDrawdown: this.maxDrawdown,
      positions: this.getPositions(),
      trades: this.trades.slice(-100),
      returns: this.returns.slice(-100),
      metrics: this.calculateMetrics(),
      exportedAt: Date.now()
    };
  }

  /**
   * Import risk data from JSON
   */
  import(data) {
    if (data.portfolioValue) this.portfolioValue = data.portfolioValue;
    if (data.peakValue) this.peakValue = data.peakValue;
    if (data.maxDrawdown) this.maxDrawdown = data.maxDrawdown;
    if (data.trades) this.trades = data.trades;
    if (data.returns) this.returns = data.returns;
    if (data.positions) {
      data.positions.forEach(p => this.addPosition(p));
    }
    logger.info('Risk data imported');
  }
}

// Export singleton instance
export const riskService = new RiskService();
