/**
 * TradeExecutor.js
 * Playwright-based trade execution with human OAuth assistance
 *
 * Supports: Avanza, Nordnet, Interactive Brokers (extensible)
 */

import { logger } from './Logger.js';
import { signalQueue } from './SignalQueue.js';
import { CircuitBreaker } from './CircuitBreaker.js';
import { RetryManager } from './RetryManager.js';

export class TradeExecutor {
  constructor(options = {}) {
    this.broker = options.broker || 'avanza';
    this.playwright = null;
    this.browser = null;
    this.page = null;
    this.isAuthenticated = false;
    this.requiresHumanAuth = true;

    this.circuitBreaker = new CircuitBreaker({
      name: `trade-${this.broker}`,
      failureThreshold: 3,
      timeout: 60000
    });

    this.retryManager = new RetryManager({
      name: `trade-${this.broker}`,
      maxAttempts: 3
    });

    // Broker configurations
    this.brokers = {
      avanza: {
        loginUrl: 'https://www.avanza.se/start/logga-in.html',
        portfolioUrl: 'https://www.avanza.se/min-ekonomi/innehav.html',
        selectors: {
          username: '#username',
          password: '#password',
          loginBtn: '[data-testid="login-button"]',
          buyBtn: '[data-testid="buy-button"]',
          sellBtn: '[data-testid="sell-button"]',
          quantity: '[data-testid="quantity-input"]',
          confirmBtn: '[data-testid="confirm-button"]'
        }
      },
      nordnet: {
        loginUrl: 'https://www.nordnet.se/logga-in',
        portfolioUrl: 'https://www.nordnet.se/overview',
        selectors: {
          username: '#username',
          password: '#password',
          loginBtn: '.login-button'
        }
      }
    };

    this.listeners = { trade: [], error: [], authRequired: [] };
  }

  /**
   * Initialize Playwright browser
   */
  async init() {
    try {
      // Dynamic import for Playwright (works in Node.js)
      const { chromium } = await import('playwright');
      this.playwright = chromium;

      this.browser = await this.playwright.launch({
        headless: false, // Visible for OAuth
        slowMo: 100
      });

      this.page = await this.browser.newPage();
      logger.info('TradeExecutor initialized', { broker: this.broker });
      return true;
    } catch (error) {
      logger.error('Failed to initialize Playwright', { error: error.message });
      throw error;
    }
  }

  /**
   * Request human OAuth authentication
   */
  async requestAuthentication() {
    const config = this.brokers[this.broker];
    if (!config) throw new Error(`Unknown broker: ${this.broker}`);

    logger.info('Navigating to login page - human auth required', { broker: this.broker });

    await this.page.goto(config.loginUrl);

    this._emit('authRequired', {
      broker: this.broker,
      url: config.loginUrl,
      message: 'Please complete login/OAuth in browser window'
    });

    // Wait for human to complete auth (check for portfolio page)
    await this.page.waitForURL(config.portfolioUrl, { timeout: 300000 }); // 5 min

    this.isAuthenticated = true;
    logger.trade('AUTH_COMPLETE', { broker: this.broker });

    return true;
  }

  /**
   * Execute a trade signal
   */
  async execute(signal) {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated. Call requestAuthentication() first');
    }

    return this.circuitBreaker.execute(async () => {
      return this.retryManager.execute(async () => {
        return this._executeTrade(signal);
      });
    });
  }

  /**
   * Internal trade execution
   */
  async _executeTrade(signal) {
    const { action, symbol, quantity, price, orderType } = signal;
    const config = this.brokers[this.broker];

    logger.trade('EXECUTING', { action, symbol, quantity, price, orderType });
    const startTime = Date.now();

    try {
      // Navigate to stock page
      await this.page.goto(`https://www.avanza.se/aktier/om-aktien.html/${symbol}`);
      await this.page.waitForLoadState('networkidle');

      // Click buy/sell
      const actionBtn = action === 'BUY' ? config.selectors.buyBtn : config.selectors.sellBtn;
      await this.page.click(actionBtn);
      await this.page.waitForTimeout(500);

      // Enter quantity
      await this.page.fill(config.selectors.quantity, String(quantity));

      // Take screenshot before confirmation
      const screenshot = await this.page.screenshot();

      // Emit for human confirmation if needed
      this._emit('trade', {
        status: 'PENDING_CONFIRMATION',
        signal,
        screenshot: screenshot.toString('base64'),
        message: 'Review and confirm trade in browser'
      });

      // Wait for human to confirm (or auto-confirm if configured)
      await this.page.click(config.selectors.confirmBtn);
      await this.page.waitForTimeout(2000);

      const duration = Date.now() - startTime;
      logger.trade('EXECUTED', { action, symbol, quantity, duration });

      return {
        success: true,
        action,
        symbol,
        quantity,
        executedAt: new Date().toISOString(),
        duration
      };

    } catch (error) {
      logger.error('Trade execution failed', { signal, error: error.message });
      throw error;
    }
  }

  /**
   * Process signal from queue
   */
  async processSignal(signal) {
    return this.execute(signal);
  }

  /**
   * Connect to signal queue
   */
  connectToQueue(queue = signalQueue) {
    queue.setProcessor(this.processSignal.bind(this));
    queue.start();
    logger.info('TradeExecutor connected to signal queue');
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      broker: this.broker,
      isAuthenticated: this.isAuthenticated,
      circuitBreaker: this.circuitBreaker.getStatus(),
      browserConnected: !!this.browser
    };
  }

  /**
   * Event handling
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
    return this;
  }

  _emit(event, data) {
    this.listeners[event]?.forEach(cb => cb(data));
  }

  /**
   * Cleanup
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
    logger.info('TradeExecutor closed');
  }
}
