/**
 * PortfolioController.js
 * Controls the Portfolio Panel UI - displays VaR, metrics, positions
 * Connects to RiskService for real-time updates
 *
 * Moon AI Trading Platform v6.5
 */

import { logger } from '../core/Logger.js';
import { riskService } from '../services/RiskService.js';

/**
 * PortfolioController - Manages portfolio panel display
 */
export class PortfolioController {
  constructor() {
    this.elements = {
      panel: null,
      totalValue: null,
      dailyChange: null,
      winRate: null,
      sharpeRatio: null,
      maxDD: null,
      profitFactor: null,
      varValue: null,
      varPercent: null,
      positionsList: null,
      positionsCount: null
    };

    this.updateInterval = null;
    this.updateFrequency = 1000; // 1 second

    logger.debug('PortfolioController created');
  }

  /**
   * Initialize the controller
   */
  init() {
    // Find DOM elements
    this.elements.panel = document.querySelector('.tv-portfolio, .portfolio-panel, #portfolio-panel');

    if (!this.elements.panel) {
      logger.warn('Portfolio panel not found');
      return false;
    }

    // Bind sub-elements
    this.elements.totalValue = this.elements.panel.querySelector('.amount, #portfolio-value, .portfolio-value .amount');
    this.elements.dailyChange = this.elements.panel.querySelector('.daily-change, #portfolio-change');
    this.elements.winRate = this.elements.panel.querySelector('#win-rate, [data-metric="win-rate"]');
    this.elements.sharpeRatio = this.elements.panel.querySelector('#sharpe-ratio, [data-metric="sharpe"]');
    this.elements.maxDD = this.elements.panel.querySelector('#max-dd, [data-metric="max-dd"]');
    this.elements.profitFactor = this.elements.panel.querySelector('#profit-factor, [data-metric="profit-factor"]');
    this.elements.varValue = this.elements.panel.querySelector('.tv-var-value, #var-value, .var-value');
    this.elements.varPercent = this.elements.panel.querySelector('.var-percentage');
    this.elements.positionsList = this.elements.panel.querySelector('.position-list, .tv-positions-list');
    this.elements.positionsCount = this.elements.panel.querySelector('.position-list-header h4, .positions-count');

    // Subscribe to risk service events
    this._subscribeToRiskService();

    // Initial render
    this.render();

    // Start auto-update
    this._startAutoUpdate();

    logger.info('PortfolioController initialized');
    return true;
  }

  /**
   * Subscribe to risk service events
   */
  _subscribeToRiskService() {
    riskService.on('portfolioValueChanged', () => this.render());
    riskService.on('positionAdded', () => this.renderPositions());
    riskService.on('positionUpdated', () => this.renderPositions());
    riskService.on('positionClosed', () => this.renderPositions());
    riskService.on('tradeAdded', () => this.renderMetrics());
  }

  /**
   * Start auto-update interval
   */
  _startAutoUpdate() {
    this.updateInterval = setInterval(() => {
      this.renderPositions(); // Update position P&L
    }, this.updateFrequency);
  }

  /**
   * Full render of portfolio panel
   */
  render() {
    this.renderValue();
    this.renderMetrics();
    this.renderVaR();
    this.renderPositions();
  }

  /**
   * Render portfolio value
   */
  renderValue() {
    const portfolio = riskService.getPortfolioValue();

    if (this.elements.totalValue) {
      this.elements.totalValue.textContent = `$${portfolio.totalValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`;
    }

    if (this.elements.dailyChange) {
      const dailyPnl = portfolio.unrealizedPnl;
      const pctChange = portfolio.cash > 0 ? (dailyPnl / portfolio.cash) * 100 : 0;
      const isPositive = dailyPnl >= 0;

      this.elements.dailyChange.textContent = `${isPositive ? '+' : ''}$${Math.abs(dailyPnl).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })} (${isPositive ? '+' : ''}${pctChange.toFixed(2)}%)`;

      this.elements.dailyChange.classList.remove('positive', 'negative');
      this.elements.dailyChange.classList.add(isPositive ? 'positive' : 'negative');
    }
  }

  /**
   * Render risk metrics
   */
  renderMetrics() {
    const metrics = riskService.calculateMetrics();

    if (this.elements.winRate && metrics.winRate) {
      this.elements.winRate.textContent = metrics.winRate;
      this._setMetricColor(this.elements.winRate, parseFloat(metrics.winRate), [50, 60], 'success');
    }

    if (this.elements.sharpeRatio) {
      this.elements.sharpeRatio.textContent = metrics.sharpeRatio || 'N/A';
      this._setMetricColor(this.elements.sharpeRatio, parseFloat(metrics.sharpeRatio), [1, 2], 'success');
    }

    if (this.elements.maxDD) {
      this.elements.maxDD.textContent = metrics.maxDrawdown || '0%';
      const ddValue = parseFloat(metrics.maxDrawdown);
      this._setMetricColor(this.elements.maxDD, -ddValue, [-20, -10], 'warning');
    }

    if (this.elements.profitFactor) {
      this.elements.profitFactor.textContent = metrics.profitFactor || 'N/A';
      this._setMetricColor(this.elements.profitFactor, parseFloat(metrics.profitFactor), [1.5, 2], 'success');
    }
  }

  /**
   * Set metric color based on thresholds
   * @param {HTMLElement} element
   * @param {number} value
   * @param {Array} thresholds - [warning, success]
   * @param {string} positiveClass
   */
  _setMetricColor(element, value, thresholds, positiveClass) {
    element.classList.remove('success', 'warning', 'danger');

    if (isNaN(value)) return;

    if (value >= thresholds[1]) {
      element.classList.add(positiveClass);
    } else if (value >= thresholds[0]) {
      element.classList.add('warning');
    } else {
      element.classList.add('danger');
    }
  }

  /**
   * Render VaR display
   */
  renderVaR() {
    // Try parametric VaR first (faster), fallback to historical
    let var95 = riskService.calculateParametricVaR(95, 1);

    if (var95.error) {
      // Not enough data, show placeholder
      if (this.elements.varValue) {
        this.elements.varValue.textContent = 'N/A';
      }
      return;
    }

    if (this.elements.varValue) {
      this.elements.varValue.textContent = `-$${Math.abs(var95.varDollar).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      })}`;
    }

    if (this.elements.varPercent) {
      this.elements.varPercent.textContent = `(-${var95.varPercent.toFixed(1)}%)`;
    }
  }

  /**
   * Render positions list
   */
  renderPositions() {
    const positions = riskService.getPositions();

    // Update count
    if (this.elements.positionsCount) {
      this.elements.positionsCount.textContent = `Open Positions (${positions.length})`;
    }

    // Render list
    if (this.elements.positionsList) {
      // Find or create container for items
      let itemsContainer = this.elements.positionsList.querySelector('.positions-items');
      if (!itemsContainer) {
        itemsContainer = this.elements.positionsList;
      }

      // Clear existing items (keep header)
      const header = itemsContainer.querySelector('.position-list-header');
      itemsContainer.innerHTML = '';
      if (header) {
        itemsContainer.appendChild(header);
      }

      if (positions.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'positions-empty';
        empty.textContent = 'No open positions';
        empty.style.cssText = 'padding: 12px; color: var(--tv-text-muted); font-size: 12px; text-align: center;';
        itemsContainer.appendChild(empty);
        return;
      }

      // Render each position
      positions.forEach(pos => {
        const item = this._createPositionItem(pos);
        itemsContainer.appendChild(item);
      });
    }
  }

  /**
   * Create position item element
   * @param {Object} pos - Position object
   * @returns {HTMLElement}
   */
  _createPositionItem(pos) {
    const item = document.createElement('div');
    item.className = 'position-item tv-position-item';

    const isPositive = pos.unrealizedPnl >= 0;

    item.innerHTML = `
      <div class="position-info">
        <span class="position-symbol">${pos.symbol}</span>
        <span class="position-size">${pos.shares} @ $${pos.entryPrice.toFixed(2)}</span>
      </div>
      <span class="position-pnl ${isPositive ? 'positive' : 'negative'}">
        ${isPositive ? '+' : ''}$${pos.unrealizedPnl.toFixed(2)}
      </span>
    `;

    // Click to view details or close
    item.addEventListener('click', () => {
      this._onPositionClick(pos);
    });

    return item;
  }

  /**
   * Handle position item click
   */
  _onPositionClick(pos) {
    // Emit event for external handling
    window.dispatchEvent(new CustomEvent('moonai:position-click', {
      detail: pos
    }));

    logger.debug('Position clicked', pos);
  }

  /**
   * Update a specific position's display
   * @param {string} symbol
   * @param {number} currentPrice
   */
  updatePosition(symbol, currentPrice) {
    riskService.updatePosition(symbol, currentPrice);
    // Re-render will be triggered by event
  }

  /**
   * Set portfolio value manually
   * @param {number} value
   */
  setPortfolioValue(value) {
    riskService.setPortfolioValue(value);
    // Re-render will be triggered by event
  }

  /**
   * Add sample data for demo
   */
  addDemoData() {
    // Add sample positions
    riskService.addPosition({
      symbol: 'MSFT',
      side: 'long',
      shares: 100,
      entryPrice: 310.31,
      currentPrice: 312.79
    });

    riskService.addPosition({
      symbol: 'NVDA',
      side: 'long',
      shares: 50,
      entryPrice: 428.15,
      currentPrice: 435.20
    });

    riskService.addPosition({
      symbol: 'TSLA',
      side: 'long',
      shares: 25,
      entryPrice: 198.40,
      currentPrice: 194.05
    });

    // Add sample trades for metrics
    const sampleTrades = [
      { symbol: 'AAPL', side: 'long', entryPrice: 170, exitPrice: 175, shares: 50 },
      { symbol: 'GOOGL', side: 'long', entryPrice: 140, exitPrice: 145, shares: 30 },
      { symbol: 'META', side: 'long', entryPrice: 350, exitPrice: 340, shares: 20 },
      { symbol: 'AMZN', side: 'long', entryPrice: 125, exitPrice: 132, shares: 40 },
      { symbol: 'MSFT', side: 'long', entryPrice: 300, exitPrice: 310, shares: 60 },
    ];

    sampleTrades.forEach(t => riskService.addTrade(t));

    // Add sample returns for VaR
    for (let i = 0; i < 50; i++) {
      riskService.returns.push((Math.random() - 0.5) * 0.04); // Random returns ±2%
    }

    this.render();
    logger.info('Demo data added');
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    logger.debug('PortfolioController destroyed');
  }
}

// Export singleton instance
export const portfolioController = new PortfolioController();
