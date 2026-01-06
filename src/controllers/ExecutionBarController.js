/**
 * ExecutionBarController.js
 * Controls the 1-click trading execution bar
 * Wires UI to RiskService, ChartSyncService, and SignalQueue
 *
 * Moon AI Trading Platform v6.5
 */

import { logger } from '../core/Logger.js';
import { riskService } from '../services/RiskService.js';
import { chartSync } from '../services/ChartSyncService.js';
import { toast } from '../utils/Toast.js';

/**
 * ExecutionBarController - Full integration of trading execution UI
 */
export class ExecutionBarController {
  constructor(options = {}) {
    // DOM elements (will be bound on init)
    this.elements = {
      bar: null,
      symbol: null,
      price: null,
      change: null,
      livePnl: null,
      sharesInput: null,
      dollarInput: null,
      riskInput: null,
      kellyBtn: null,
      buyBtn: null,
      sellBtn: null,
      emergencyBtn: null
    };

    // State
    this.currentSymbol = options.symbol || 'MSFT';
    this.currentPrice = options.price || 0;
    this.previousPrice = 0;
    this.isConnected = false;

    // App reference (will be set)
    this.app = options.app || null;

    // Event listeners cleanup
    this._boundListeners = new Map();

    logger.debug('ExecutionBarController created');
  }

  /**
   * Initialize the controller and bind to DOM
   */
  init() {
    // Find DOM elements
    this.elements.bar = document.getElementById('execution-bar') ||
                        document.querySelector('.tv-execution-bar') ||
                        document.querySelector('.execution-bar');

    if (!this.elements.bar) {
      logger.warn('Execution bar element not found');
      return false;
    }

    // Bind all elements
    this.elements.symbol = this.elements.bar.querySelector('#trade-symbol, .tv-trade-symbol .symbol, .symbol');
    this.elements.price = this.elements.bar.querySelector('#trade-price, .tv-trade-symbol .price, .price');
    this.elements.change = this.elements.bar.querySelector('#trade-change, .tv-trade-symbol .change, .change');
    this.elements.livePnl = this.elements.bar.querySelector('#live-pnl, .live-pnl');
    this.elements.sharesInput = this.elements.bar.querySelector('#shares-input, [name="shares"]');
    this.elements.dollarInput = this.elements.bar.querySelector('#dollar-input, [name="dollar"]');
    this.elements.riskInput = this.elements.bar.querySelector('#risk-input, [name="risk"]');
    this.elements.kellyBtn = this.elements.bar.querySelector('#kelly-btn, .tv-kelly-btn, .kelly-btn');
    this.elements.buyBtn = this.elements.bar.querySelector('#buy-btn, .tv-trade-btn.buy, .trade-button.buy');
    this.elements.sellBtn = this.elements.bar.querySelector('#sell-btn, .tv-trade-btn.sell, .trade-button.sell');
    this.elements.emergencyBtn = this.elements.bar.querySelector('#emergency-stop, .tv-emergency-btn, .emergency-stop');

    // Setup event listeners
    this._setupEventListeners();

    // Subscribe to chart sync events
    this._subscribeToChartSync();

    // Subscribe to risk service events
    this._subscribeToRiskService();

    // Initial UI update
    this._updateUI();

    logger.info('ExecutionBarController initialized');
    return true;
  }

  /**
   * Set app reference for signal submission
   */
  setApp(app) {
    this.app = app;
  }

  /**
   * Setup all event listeners
   */
  _setupEventListeners() {
    // Shares input → recalculate dollar value
    if (this.elements.sharesInput) {
      const sharesHandler = (e) => this._onSharesChange(e.target.value);
      this.elements.sharesInput.addEventListener('input', sharesHandler);
      this._boundListeners.set('shares', { el: this.elements.sharesInput, type: 'input', fn: sharesHandler });
    }

    // Dollar input → recalculate shares
    if (this.elements.dollarInput) {
      const dollarHandler = (e) => this._onDollarChange(e.target.value);
      this.elements.dollarInput.addEventListener('input', dollarHandler);
      this._boundListeners.set('dollar', { el: this.elements.dollarInput, type: 'input', fn: dollarHandler });
    }

    // Risk input → recalculate position
    if (this.elements.riskInput) {
      const riskHandler = (e) => this._onRiskChange(e.target.value);
      this.elements.riskInput.addEventListener('input', riskHandler);
      this._boundListeners.set('risk', { el: this.elements.riskInput, type: 'input', fn: riskHandler });
    }

    // Kelly Criterion button
    if (this.elements.kellyBtn) {
      const kellyHandler = () => this._onKellyClick();
      this.elements.kellyBtn.addEventListener('click', kellyHandler);
      this._boundListeners.set('kelly', { el: this.elements.kellyBtn, type: 'click', fn: kellyHandler });
    }

    // Buy button
    if (this.elements.buyBtn) {
      const buyHandler = () => this._onBuyClick();
      this.elements.buyBtn.addEventListener('click', buyHandler);
      this._boundListeners.set('buy', { el: this.elements.buyBtn, type: 'click', fn: buyHandler });
    }

    // Sell button
    if (this.elements.sellBtn) {
      const sellHandler = () => this._onSellClick();
      this.elements.sellBtn.addEventListener('click', sellHandler);
      this._boundListeners.set('sell', { el: this.elements.sellBtn, type: 'click', fn: sellHandler });
    }

    // Emergency close all
    if (this.elements.emergencyBtn) {
      const emergencyHandler = () => this._onEmergencyClick();
      this.elements.emergencyBtn.addEventListener('click', emergencyHandler);
      this._boundListeners.set('emergency', { el: this.elements.emergencyBtn, type: 'click', fn: emergencyHandler });
    }

    logger.debug('Event listeners setup');
  }

  /**
   * Subscribe to chart sync events
   */
  _subscribeToChartSync() {
    chartSync.on('symbolChanged', (data) => {
      this.setSymbol(data.symbol);
    });
  }

  /**
   * Subscribe to risk service events
   */
  _subscribeToRiskService() {
    riskService.on('portfolioValueChanged', () => {
      this._updateLivePnl();
    });

    riskService.on('positionUpdated', (pos) => {
      if (pos.symbol === this.currentSymbol) {
        this._updateLivePnl();
      }
    });
  }

  // ============================================
  // SYMBOL & PRICE UPDATES
  // ============================================

  /**
   * Set current symbol
   * @param {string} symbol
   */
  setSymbol(symbol) {
    this.currentSymbol = symbol;
    if (this.elements.symbol) {
      this.elements.symbol.textContent = symbol;
    }
    logger.debug('Symbol updated', { symbol });
  }

  /**
   * Update price display
   * @param {number} price
   * @param {number} change - Percent change
   */
  updatePrice(price, change = null) {
    this.previousPrice = this.currentPrice;
    this.currentPrice = price;

    if (this.elements.price) {
      this.elements.price.textContent = `$${price.toFixed(2)}`;

      // Flash animation on price change
      if (this.previousPrice !== price) {
        this.elements.price.classList.remove('flash-up', 'flash-down');
        void this.elements.price.offsetWidth; // Trigger reflow
        this.elements.price.classList.add(price > this.previousPrice ? 'flash-up' : 'flash-down');
      }
    }

    if (this.elements.change && change !== null) {
      const isPositive = change >= 0;
      this.elements.change.textContent = `${isPositive ? '+' : ''}${change.toFixed(2)}%`;
      this.elements.change.classList.remove('positive', 'negative');
      this.elements.change.classList.add(isPositive ? 'positive' : 'negative');
    }

    // Recalculate dollar value based on current shares
    if (this.elements.sharesInput && this.elements.dollarInput) {
      const shares = parseInt(this.elements.sharesInput.value) || 0;
      this.elements.dollarInput.value = Math.round(shares * price);
    }
  }

  // ============================================
  // INPUT HANDLERS
  // ============================================

  /**
   * Handle shares input change
   */
  _onSharesChange(value) {
    const shares = parseInt(value) || 0;
    if (this.elements.dollarInput && this.currentPrice > 0) {
      this.elements.dollarInput.value = Math.round(shares * this.currentPrice);
    }
  }

  /**
   * Handle dollar input change
   */
  _onDollarChange(value) {
    const dollars = parseFloat(value) || 0;
    if (this.elements.sharesInput && this.currentPrice > 0) {
      this.elements.sharesInput.value = Math.floor(dollars / this.currentPrice);
    }
  }

  /**
   * Handle risk percentage change
   */
  _onRiskChange(value) {
    const riskPercent = parseFloat(value) || 2;

    // Calculate position size based on risk
    const portfolioValue = riskService.portfolioValue;
    const dollarRisk = portfolioValue * (riskPercent / 100);

    // Assume 5% stop loss for calculation
    const stopLossPercent = 0.05;
    const riskPerShare = this.currentPrice * stopLossPercent;
    const shares = Math.floor(dollarRisk / riskPerShare);
    const dollarValue = shares * this.currentPrice;

    if (this.elements.sharesInput) {
      this.elements.sharesInput.value = shares;
    }
    if (this.elements.dollarInput) {
      this.elements.dollarInput.value = Math.round(dollarValue);
    }

    logger.debug('Risk-based position calculated', { riskPercent, shares, dollarValue });
  }

  // ============================================
  // BUTTON HANDLERS
  // ============================================

  /**
   * Handle Kelly button click
   */
  _onKellyClick() {
    try {
      const kelly = riskService.calculateKellyFromHistory();

      if (kelly.error) {
        toast.info(kelly.error);
        return;
      }

      // Apply Kelly position size
      const shares = Math.floor(kelly.positionValue / this.currentPrice);
      const dollarValue = shares * this.currentPrice;

      if (this.elements.sharesInput) {
        this.elements.sharesInput.value = shares;
      }
      if (this.elements.dollarInput) {
        this.elements.dollarInput.value = Math.round(dollarValue);
      }

      toast.success(`Kelly: ${kelly.adjustedKelly.toFixed(1)}% → ${shares} shares`);
      logger.info('Kelly applied', kelly);

    } catch (error) {
      toast.error('Kelly calculation failed');
      logger.error('Kelly error', { error: error.message });
    }
  }

  /**
   * Handle buy button click
   */
  _onBuyClick() {
    const shares = parseInt(this.elements.sharesInput?.value) || 0;

    if (shares <= 0) {
      toast.error('Enter position size');
      return;
    }

    this._submitTrade('BUY', shares);
  }

  /**
   * Handle sell button click
   */
  _onSellClick() {
    const shares = parseInt(this.elements.sharesInput?.value) || 0;

    if (shares <= 0) {
      toast.error('Enter position size');
      return;
    }

    this._submitTrade('SELL', shares);
  }

  /**
   * Submit trade signal
   */
  _submitTrade(type, shares) {
    const signal = {
      type,
      symbol: this.currentSymbol,
      price: this.currentPrice,
      quantity: shares,
      source: 'execution_bar',
      timestamp: Date.now()
    };

    // Submit to app if available
    if (this.app && this.app.submitSignal) {
      this.app.submitSignal(type, this.currentSymbol, {
        price: this.currentPrice,
        quantity: shares,
        source: 'execution_bar'
      });
    } else {
      // Fallback: emit event
      window.dispatchEvent(new CustomEvent('moonai:trade', { detail: signal }));
      toast.info(`${type} ${shares} ${this.currentSymbol} @ $${this.currentPrice.toFixed(2)}`);
    }

    logger.trade(type, signal);

    // Visual feedback
    const btn = type === 'BUY' ? this.elements.buyBtn : this.elements.sellBtn;
    if (btn) {
      btn.classList.add('clicked');
      setTimeout(() => btn.classList.remove('clicked'), 200);
    }
  }

  /**
   * Handle emergency close all
   */
  _onEmergencyClick() {
    // Confirm dialog
    const positions = riskService.getPositions();

    if (positions.length === 0) {
      toast.info('No open positions');
      return;
    }

    const confirmed = confirm(`Close ALL ${positions.length} positions?`);
    if (!confirmed) return;

    // Close all positions
    positions.forEach(pos => {
      riskService.closePosition(pos.symbol, this.currentPrice);
    });

    toast.warning(`Closed ${positions.length} positions`);
    logger.warn('Emergency close all triggered', { positions: positions.length });

    // Visual feedback
    if (this.elements.emergencyBtn) {
      this.elements.emergencyBtn.classList.add('activated');
      setTimeout(() => this.elements.emergencyBtn.classList.remove('activated'), 500);
    }
  }

  // ============================================
  // UI UPDATES
  // ============================================

  /**
   * Update live P&L display
   */
  _updateLivePnl() {
    if (!this.elements.livePnl) return;

    const { totalUnrealizedPnl } = riskService.calculateExposure();
    const isPositive = totalUnrealizedPnl >= 0;

    this.elements.livePnl.textContent = `${isPositive ? '+' : ''}$${Math.abs(totalUnrealizedPnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    this.elements.livePnl.classList.remove('positive', 'negative');
    this.elements.livePnl.classList.add(isPositive ? 'positive' : 'negative');
  }

  /**
   * Full UI update
   */
  _updateUI() {
    this.setSymbol(this.currentSymbol);
    this.updatePrice(this.currentPrice, 0);
    this._updateLivePnl();
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  /**
   * Show/hide execution bar
   */
  setVisible(visible) {
    if (this.elements.bar) {
      this.elements.bar.style.display = visible ? 'flex' : 'none';
    }
  }

  /**
   * Cleanup and destroy
   */
  destroy() {
    // Remove all event listeners
    this._boundListeners.forEach(({ el, type, fn }) => {
      el.removeEventListener(type, fn);
    });
    this._boundListeners.clear();

    logger.debug('ExecutionBarController destroyed');
  }
}

// Export singleton instance
export const executionBar = new ExecutionBarController();
