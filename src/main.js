/**
 * main.js v7.0
 * Application entry point - orchestrates all modules with dependency injection
 *
 * Moon AI Trading Platform
 * - Modular architecture with strict separation of concerns
 * - Dependency injection pattern for testability
 * - Enterprise-grade multi-window sync
 */

// ============================================
// IMPORTS - All dependencies at top level
// ============================================

// Core Services
import { DataService } from './services/DataService.js';
import { IndicatorService } from './services/IndicatorService.js';
import { chartSync } from './services/ChartSyncService.js';
import { riskService } from './services/RiskService.js';

// Charts
import { ChartManager } from './charts/ChartManager.js';

// Components
import { ContextMenu } from './components/ContextMenu.js';

// Controllers
import { executionBar } from './controllers/ExecutionBarController.js';
import { panelController } from './controllers/PanelController.js';
import { portfolioController } from './controllers/PortfolioController.js';
import { signalsController } from './controllers/SignalsController.js';
import { widgetbarController } from './controllers/WidgetbarController.js';
import { watchlistController } from './controllers/WatchlistController.js';
import { TimeframeController } from './controllers/TimeframeController.js';
import { SearchController } from './controllers/SearchController.js';

// Core Infrastructure
import { logger } from './core/Logger.js';
import { signalQueue } from './core/SignalQueue.js';
import { healthMonitor } from './core/HealthMonitor.js';

// UI Utilities
import { toast } from './utils/Toast.js';

// Configuration
import { config } from './config.js';

// TradeExecutor (Node.js only - uses Playwright)
let TradeExecutor = null;
try {
  const module = await import('./core/TradeExecutor.js');
  TradeExecutor = module.TradeExecutor;
} catch (e) {
  logger.info('TradeExecutor not available in browser context (requires Node.js + Playwright)');
}

// ============================================
// MAIN APPLICATION CLASS
// ============================================

/**
 * MoonAITradingPlatform
 * Main application controller - wires together all modules
 */
class MoonAITradingPlatform {
  constructor() {
    // Services (initialized in init())
    this.dataService = null;
    this.indicatorService = null;
    this.chartManager = null;
    this.contextMenu = null;
    this.chart3d = null;

    // Controllers (passed as dependencies)
    this.chartSync = chartSync;
    this.riskService = riskService;
    this.executionBar = executionBar;
    this.panelController = panelController;
    this.portfolioController = portfolioController;
    this.signalsController = signalsController;
    this.widgetbarController = widgetbarController;
    this.watchlistController = watchlistController;
    this.timeframeController = null; // Instantiated in init() after dataService
    this.searchController = null; // Instantiated in init() after dataService

    // Trade execution
    this.tradeExecutor = null;
    this.signalQueue = signalQueue;
    this.autoTradeEnabled = false;
    this.currentBroker = null;

    // State
    this.isInitialized = false;
    this.isLiveStreaming = false;

    logger.info('Moon AI Trading Platform initializing');
  }

  /**
   * Initialize the application
   * Entry point that orchestrates all modules
   */
  async init() {
    try {
      // 1. DOM references (ONLY place with querySelector)
      const domRefs = this._getDOMReferences();

      // 2. Initialize core services
      this.dataService = new DataService();
      this.indicatorService = new IndicatorService();
      this.contextMenu = new ContextMenu();

      // 3. Initialize chart manager
      this.chartManager = new ChartManager(
        domRefs.chart3dContainer ? 'chart-3d-container' : null,
        'chart-2d-container'
      );
      this.chartManager.init2DChart();

      // Force 2D view if no 3D container
      if (!domRefs.chart3dContainer) {
        this.chartManager.currentView = '2d';
      }

      // 3b. Initialize timeframe controller (NEW - Week 1 Quick Win)
      this.timeframeController = new TimeframeController(this.dataService, this.chartManager);

      // 3c. Initialize search controller (NEW - Week 1 Quick Win)
      this.searchController = new SearchController(this.dataService, this);

      // 4. Setup signal queue processor (pass dependencies)
      this._setupSignalProcessor();

      // 5. Start health monitoring
      healthMonitor.start();

      // 6. Load data
      await this.loadData();

      // 7. Initialize controllers (pass dependencies explicitly)
      this._initControllers();

      // 8. Setup event listeners (pass DOM refs)
      this._setupEventListeners(domRefs);

      // 9. Setup keyboard shortcuts
      this._setupKeyboardShortcuts();

      this.isInitialized = true;
      logger.info('Moon AI Trading Platform initialized successfully');
      toast.success('Platform loaded successfully');

      // IMPORTANT: Hide loading overlay after successful initialization
      this._hideLoadingOverlay();

      return true;
    } catch (error) {
      logger.error('Failed to initialize platform', { error: error.message });
      toast.error('Failed to initialize platform');

      // IMPORTANT: Hide loading overlay even on error
      this._hideLoadingOverlay(error.message);

      return false;
    }
  }

  /**
   * Get DOM references - ONLY place with querySelector
   * @private
   */
  _getDOMReferences() {
    return {
      chart3dContainer: document.getElementById('chart-3d-container'),
      chart2dContainer: document.getElementById('chart-2d-container'),
      viewToggleBtn: document.getElementById('view-toggle-btn'),
      loadingOverlay: document.getElementById('loading-overlay'),
      // Add more as needed
    };
  }

  /**
   * Hide loading overlay after initialization
   * @private
   * @param {string} errorMessage - Optional error message if initialization failed
   */
  _hideLoadingOverlay(errorMessage = null) {
    const overlay = document.getElementById('loading-overlay');
    const chartLoading = document.getElementById('chart-loading');

    if (!overlay) {
      logger.warn('Loading overlay not found in DOM');
      return;
    }

    // If there's an error, show it briefly before hiding
    if (errorMessage) {
      const messageEl = overlay.querySelector('.loading-message');
      if (messageEl) {
        messageEl.textContent = `Error: ${errorMessage}`;
        messageEl.style.color = '#ef5350';
      }

      // Hide after 2 seconds to let user see the error
      setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => {
          overlay.style.display = 'none';
        }, 300);
      }, 2000);
    } else {
      // Successful initialization - hide immediately with fade effect
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 300);
    }

    // CRITICAL FIX: Also hide chart-specific loading indicator
    if (chartLoading) {
      chartLoading.style.opacity = '0';
      setTimeout(() => {
        chartLoading.style.display = 'none';
      }, 300);
      logger.info('Chart loading indicator hidden');
    }

    logger.info('Loading overlay hidden');
  }

  /**
   * Setup signal queue processor
   * @private
   */
  _setupSignalProcessor() {
    this.signalQueue.setProcessor(async (signal) => {
      logger.signal('PROCESSING', { type: signal.type, symbol: signal.symbol });

      if (this.autoTradeEnabled && this.tradeExecutor) {
        try {
          const result = await this.tradeExecutor.executeSignal(signal);
          logger.trade(signal.type, {
            symbol: signal.symbol,
            result: result.success ? 'SUCCESS' : 'FAILED',
            ...result
          });
          return result;
        } catch (error) {
          logger.error('Trade execution failed', { signal, error: error.message });
          throw error;
        }
      } else {
        logger.signal('MANUAL_REQUIRED', {
          type: signal.type,
          symbol: signal.symbol,
          price: signal.price,
          message: 'Auto-trade disabled or executor not connected'
        });
        return { success: true, mode: 'manual', signal };
      }
    });

    this.signalQueue.start();
    logger.info('Signal queue processor started');
  }

  /**
   * Initialize controllers with dependency injection
   * Each controller is wrapped in its own try-catch for error isolation
   * @private
   */
  _initControllers() {
    console.log('🚀 _initControllers() STARTING');

    let panelInitialized = false;
    let portfolioInitialized = false;
    let signalsInitialized = false;
    let execBarInitialized = false;
    let widgetbarInitialized = false;
    let watchlistInitialized = false;

    // Panel controller
    try {
      console.log('  1. Initializing panelController...');
      this.panelController.init();
      panelInitialized = true;
      console.log('  ✓ panelController initialized');
    } catch (error) {
      console.error('  ✗ panelController FAILED:', error.message);
      logger.error('Panel controller failed', { error: error.message });
    }

    // Portfolio controller
    try {
      console.log('  2. Initializing portfolioController...');
      portfolioInitialized = this.portfolioController.init();
      if (portfolioInitialized) {
        this.portfolioController.addDemoData();
      }
      console.log('  ✓ portfolioController initialized:', portfolioInitialized);
    } catch (error) {
      console.error('  ✗ portfolioController FAILED:', error.message);
      logger.error('Portfolio controller failed', { error: error.message });
    }

    // Signals controller
    try {
      console.log('  3. Initializing signalsController...');
      signalsInitialized = this.signalsController.init();
      if (signalsInitialized) {
        this.signalsController.addDemoSignals();
      }
      console.log('  ✓ signalsController initialized:', signalsInitialized);
    } catch (error) {
      console.error('  ✗ signalsController FAILED:', error.message);
      logger.error('Signals controller failed', { error: error.message });
    }

    // Execution bar controller
    try {
      console.log('  4. Initializing executionBar...');
      execBarInitialized = this.executionBar.init();
      if (execBarInitialized) {
        this.executionBar.setApp(this);
        this.executionBar.updatePrice(config.defaultSymbol === 'BTCUSDT' ? 50000 : 312.79, 0.80);
      }
      console.log('  ✓ executionBar initialized:', execBarInitialized);
    } catch (error) {
      console.error('  ✗ executionBar FAILED:', error.message);
      logger.error('Execution bar failed', { error: error.message });
    }

    // Widgetbar controller
    try {
      console.log('  5. Initializing widgetbarController...');
      widgetbarInitialized = this.widgetbarController.init();
      console.log('  ✓ widgetbarController initialized:', widgetbarInitialized);
    } catch (error) {
      console.error('  ✗ widgetbarController FAILED:', error.message);
      logger.error('Widgetbar controller failed', { error: error.message });
    }

    // Watchlist controller (CRITICAL - Week 1 Quick Win)
    try {
      console.log('  6. Initializing watchlistController...');
      watchlistInitialized = this.watchlistController.init(this);
      console.log('  ✓ watchlistController initialized:', watchlistInitialized);
      if (watchlistInitialized) {
        logger.info('Watchlist controller initialized - left sidebar now clickable');
      }
    } catch (error) {
      console.error('  ✗ watchlistController FAILED:', error.message);
      logger.error('Watchlist controller failed', { error: error.message });
    }

    // Timeframe controller (NEW - Week 1 Quick Win)
    let timeframeInitialized = false;
    try {
      console.log('  7. Initializing timeframeController...');
      timeframeInitialized = this.timeframeController.init();
      console.log('  ✓ timeframeController initialized:', timeframeInitialized);
      if (timeframeInitialized) {
        logger.info('Timeframe controller initialized - interval buttons now clickable');
      }
    } catch (error) {
      console.error('  ✗ timeframeController FAILED:', error.message);
      logger.error('Timeframe controller failed', { error: error.message });
    }

    // Search controller (NEW - Week 1 Quick Win)
    let searchInitialized = false;
    try {
      console.log('  8. Initializing searchController...');
      searchInitialized = this.searchController.init();
      console.log('  ✓ searchController initialized:', searchInitialized);
      if (searchInitialized) {
        logger.info('Search controller initialized - search bar now functional');
      }
    } catch (error) {
      console.error('  ✗ searchController FAILED:', error.message);
      logger.error('Search controller failed', { error: error.message });
    }

    // Setup risk service
    try {
      this.riskService.setPortfolioValue(124847.50);
    } catch (error) {
      console.error('  ✗ riskService FAILED:', error.message);
    }

    console.log('🏁 _initControllers() COMPLETE');
    console.log('   Results:', {
      panel: panelInitialized,
      portfolio: portfolioInitialized,
      signals: signalsInitialized,
      executionBar: execBarInitialized,
      widgetbar: widgetbarInitialized,
      watchlist: watchlistInitialized,
      timeframe: timeframeInitialized
    });

    logger.info('Controllers initialized', {
      panel: panelInitialized,
      portfolio: portfolioInitialized,
      signals: signalsInitialized,
      executionBar: execBarInitialized,
      widgetbar: widgetbarInitialized,
      watchlist: watchlistInitialized,
      timeframe: timeframeInitialized
    });
  }

  /**
   * Load data - loads real Bybit data with live WebSocket streaming
   */
  async loadData() {
    const loadingToast = toast.loading('Loading Bitcoin 1h data from Bybit...');

    try {
      // Load real Bitcoin data from Bybit (default symbol and interval)
      const defaultSymbol = 'BTCUSDT';
      const defaultInterval = '60'; // 1 hour

      const rawData = await this.dataService.fetchHistorical(defaultSymbol, defaultInterval, 500, 'bybit');

      if (!rawData || rawData.length === 0) {
        throw new Error('No data loaded from Bybit');
      }

      const transformedData = this.dataService.transformFor2D(rawData);
      this.chartManager.setData(rawData, transformedData);

      // Start live WebSocket stream for real-time updates
      this.dataService.startLiveStream(
        defaultSymbol,
        defaultInterval,
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
            logger.debug('Live candle update', {
              symbol: defaultSymbol,
              interval: defaultInterval,
              close: candle.close
            });
          }
        }
      );

      loadingToast.success(`Loaded ${transformedData.candles.length} ${defaultSymbol} candles - Live updates active`);
      logger.info('Bybit data loaded with live stream', {
        symbol: defaultSymbol,
        interval: defaultInterval,
        rawCandles: rawData.length,
        uniqueCandles: transformedData.candles.length,
        liveStream: true
      });

      this.indicatorService.setData(rawData);
      logger.info('Indicator service initialized', { candles: rawData.length });

      // Set initial symbol in timeframe controller
      if (this.timeframeController) {
        this.timeframeController.setSymbol(defaultSymbol);
      }

      return { rawData, transformedData };
    } catch (error) {
      logger.error('Error loading Bybit data', { error: error.message });
      loadingToast.error('Failed to load Bybit data');
      throw error;
    }
  }

  /**
   * Set symbol for the chart (NEW - Week 1 Quick Win)
   * Called by watchlistController when user clicks a stock
   * @param {string} symbol - Trading symbol (e.g., 'BTCUSDT')
   */
  async setSymbol(symbol) {
    const loadingToast = toast.loading(`Loading ${symbol}...`);

    try {
      logger.info('Setting symbol', { symbol });

      // Notify timeframe controller of symbol change
      if (this.timeframeController) {
        this.timeframeController.setSymbol(symbol);
      }

      // Get current interval from timeframe controller (or default to 1h)
      const interval = this.timeframeController ? this.timeframeController.getCurrentInterval() : '60';

      // Fetch historical data from Bybit
      const rawData = await this.dataService.fetchHistorical(symbol, interval, 500, 'bybit');

      if (!rawData || rawData.length === 0) {
        throw new Error(`No data available for ${symbol}`);
      }

      // Transform for 2D chart
      const transformedData = this.dataService.transformFor2D(rawData);

      // Update chart
      this.chartManager.setData(rawData, transformedData);

      // Restart WebSocket stream for the new symbol
      this.dataService.restartLiveStream(
        symbol,
        interval,
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
            logger.debug('Live candle update', {
              symbol,
              interval,
              close: candle.close
            });
          }
        }
      );

      // Update indicator service
      this.indicatorService.setData(rawData);

      // Update execution bar with latest price
      if (rawData.length > 0) {
        const latestCandle = rawData[rawData.length - 1];
        const previousCandle = rawData[rawData.length - 2];
        const change = previousCandle
          ? ((latestCandle.close - previousCandle.close) / previousCandle.close) * 100
          : 0;

        this.executionBar.updatePrice(latestCandle.close, change);

        // Update chart header
        const chartPriceEl = document.getElementById('chart-price');
        if (chartPriceEl) {
          chartPriceEl.textContent = latestCandle.close.toFixed(2);
        }

        const chartSymbolEl = document.getElementById('chart-symbol');
        if (chartSymbolEl) {
          chartSymbolEl.textContent = symbol;
        }
      }

      loadingToast.success(`${symbol} loaded (${transformedData.candles.length} candles)`);
      logger.info('Symbol changed successfully', { symbol, candles: rawData.length });

      return true;
    } catch (error) {
      logger.error('Error setting symbol', { symbol, error: error.message });
      loadingToast.error(`Failed to load ${symbol}: ${error.message}`);
      return false;
    }
  }

  /**
   * Setup UI event listeners
   * @private
   */
  _setupEventListeners(domRefs) {
    // View toggle button
    if (domRefs.viewToggleBtn) {
      domRefs.viewToggleBtn.addEventListener('click', () => {
        const newView = this.chartManager.toggleView();
        domRefs.viewToggleBtn.textContent = newView === '3d' ? 'Switch to 2D' : 'Switch to 3D';
        toast.info(`Switched to ${newView.toUpperCase()} view`);
      });
    }

    // Chart type buttons (NEW - Week 1 Quick Win)
    const chartTypeButtons = document.querySelectorAll('.chart-type-btn');
    if (chartTypeButtons.length > 0) {
      chartTypeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const chartType = btn.dataset.type;

          if (this.chartManager.chart2d) {
            // Update button active states
            chartTypeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Change chart type
            this.chartManager.chart2d.setChartType(chartType);

            logger.info('Chart type changed', { type: chartType });
            toast.info(`Chart type: ${chartType}`);
          }
        });
      });
      logger.info('Chart type buttons initialized', { count: chartTypeButtons.length });
    }

    // Context menu for 2D chart
    if (domRefs.chart2dContainer) {
      domRefs.chart2dContainer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (this.chartManager.getCurrentView() === '2d') {
          const items = ContextMenu.createPriceScaleMenu(this.chartManager);
          this.contextMenu.show(e.clientX, e.clientY, items, this.chartManager);
        }
      });
    }

    // Window resize handler (debounced)
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (this.chartManager.getCurrentView() === '2d' && this.chartManager.chart2d) {
          const container = document.getElementById('chart-2d-container');
          if (container) {
            this.chartManager.chart2d.chart.applyOptions({
              width: container.clientWidth,
              height: container.clientHeight
            });
          }
        }
      }, 250);
    });

    logger.debug('Event listeners setup');
  }

  /**
   * Setup keyboard shortcuts
   * @private
   */
  _setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (this.chartManager.getCurrentView() !== '2d') return;

      const chart2d = this.chartManager.chart2d;
      if (!chart2d || !chart2d.chart) return;

      // Toggle views (T)
      if (e.key === 't' || e.key === 'T') {
        const toggleBtn = document.getElementById('view-toggle-btn');
        if (toggleBtn) toggleBtn.click();
        return;
      }

      // Fit content (F)
      if (e.key === 'f' || e.key === 'F') {
        chart2d.fitContent();
        toast.info('Chart fitted to content');
        return;
      }

      // Reset (Home)
      if (e.key === 'Home') {
        e.preventDefault();
        chart2d.fitContent();
        toast.info('Chart reset');
        return;
      }

      // Pan to latest (End)
      if (e.key === 'End') {
        e.preventDefault();
        chart2d.fitContent();
        return;
      }
    });

    logger.debug('Keyboard shortcuts setup');
  }

  // ============================================
  // PUBLIC API - Business Logic Methods
  // ============================================

  /**
   * Start live streaming from exchange
   */
  startLiveStream(symbol = config.defaultSymbol, timeframe = config.defaultTimeframe, exchange = 'bybit') {
    if (this.isLiveStreaming) {
      logger.warn('Already streaming. Stop first.');
      return;
    }

    logger.info('Starting live stream', { symbol, timeframe, exchange });
    toast.info(`Connecting to ${exchange}...`);

    this.dataService.startLiveStream(symbol, timeframe, exchange, (candle) => {
      this.indicatorService.addCandle(candle);

      if (this.chartManager.getCurrentView() === '2d' && this.chartManager.chart2d) {
        const chartCandle = {
          time: this._formatTime(candle.timestamp),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close
        };
        this.chartManager.chart2d.update(chartCandle);
      }

      // Check for TD signals on confirmed candles
      if (candle.confirmed) {
        const td = this.indicatorService.runMultiTimeframeTD();
        if (td.composite.signal && td.composite.signal !== 'NEUTRAL') {
          logger.signal('TD_COMPOSITE', {
            signal: td.composite.signal,
            risk: td.composite.risk,
            confidence: td.composite.confidence,
            price: candle.close
          });

          toast.info(`TD Signal: ${td.composite.signal} (${td.composite.risk})`);

          if (this.autoTradeEnabled) {
            this.submitSignal(
              td.composite.signal === 'BUY' ? 'BUY' : 'SELL',
              symbol,
              {
                price: candle.close,
                source: 'td_sequential',
                confidence: td.composite.confidence,
                risk: td.composite.risk,
                priority: td.composite.risk === 'LOW' ? 2 : 1
              }
            );
          }
        }
      }
    });

    this.isLiveStreaming = true;
    toast.success(`Live: ${symbol} ${timeframe}`);
  }

  /**
   * Stop live streaming
   */
  stopLiveStream() {
    this.dataService.stopLiveStream();
    this.isLiveStreaming = false;
    toast.info('Live stream stopped');
  }

  /**
   * Fetch historical data from exchange
   */
  async fetchFromExchange(symbol = config.defaultSymbol, timeframe = '1h', limit = 500, exchange = 'bybit') {
    const loadingToast = toast.loading(`Fetching ${symbol} from ${exchange}...`);

    try {
      const data = await this.dataService.fetchHistorical(symbol, timeframe, limit, exchange);
      this.indicatorService.setData(data);

      const transformed = this.dataService.transformFor2D(data);
      this.chartManager.setData(data, transformed);

      loadingToast.success(`Loaded ${data.length} candles`);
      return data;
    } catch (error) {
      loadingToast.error(`Failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get TD Sequential analysis
   */
  getTDSequential() {
    return this.indicatorService.runMultiTimeframeTD();
  }

  /**
   * Calculate indicator
   */
  calculateIndicator(name, ...args) {
    return this.indicatorService.calculate(name, ...args);
  }

  /**
   * Register custom indicator
   */
  registerIndicator(name, fn) {
    this.indicatorService.registerIndicator(name, fn);
    toast.success(`Indicator registered: ${name}`);
  }

  /**
   * List available indicators
   */
  listIndicators() {
    return this.indicatorService.listIndicators();
  }

  /**
   * Connect to broker for trade execution
   */
  async connectBroker(broker = 'avanza') {
    if (!TradeExecutor) {
      logger.warn('TradeExecutor not available - requires Node.js with Playwright');
      toast.error('Trade execution requires Node.js environment with Playwright');
      return false;
    }

    logger.info('Connecting to broker', { broker });
    toast.info(`Connecting to ${broker}... Please complete login in browser.`);

    try {
      this.tradeExecutor = new TradeExecutor({ broker });

      this.tradeExecutor.on('authRequired', ({ broker, url, message }) => {
        toast.info(message);
        logger.info('Authentication required', { broker, url });
      });

      this.tradeExecutor.on('authenticated', ({ broker }) => {
        toast.success(`Connected to ${broker}!`);
        logger.info('Broker authenticated', { broker });
        this.currentBroker = broker;
      });

      await this.tradeExecutor.init();
      await this.tradeExecutor.authenticate();

      return true;
    } catch (error) {
      logger.error('Broker connection failed', { broker, error: error.message });
      toast.error(`Failed to connect to ${broker}`);
      this.tradeExecutor = null;
      return false;
    }
  }

  /**
   * Disconnect from broker
   */
  async disconnectBroker() {
    if (this.tradeExecutor) {
      await this.tradeExecutor.close();
      this.tradeExecutor = null;
      this.currentBroker = null;
      this.autoTradeEnabled = false;
      logger.info('Broker disconnected');
      toast.info('Disconnected from broker');
    }
  }

  /**
   * Enable automatic trade execution
   */
  enableAutoTrade() {
    if (!this.tradeExecutor || !this.currentBroker) {
      toast.error('Connect to a broker first');
      return false;
    }

    this.autoTradeEnabled = true;
    logger.info('Auto-trade enabled', { broker: this.currentBroker });
    toast.success('Auto-trade ENABLED - signals will be executed automatically');
    return true;
  }

  /**
   * Disable automatic trade execution
   */
  disableAutoTrade() {
    this.autoTradeEnabled = false;
    logger.info('Auto-trade disabled');
    toast.info('Auto-trade disabled');
  }

  /**
   * Submit trade signal to queue
   */
  submitSignal(type, symbol, options = {}) {
    const signal = {
      type: type.toUpperCase(),
      symbol,
      price: options.price || null,
      quantity: options.quantity || null,
      source: options.source || 'manual',
      timestamp: Date.now(),
      ...options
    };

    const signalId = this.signalQueue.enqueue(signal, {
      priority: options.priority || 0,
      ttl: options.ttl || 60000,
      dedupeKey: `${type}-${symbol}-${Math.floor(Date.now() / 10000)}`
    });

    if (signalId) {
      logger.signal('SUBMITTED', { signalId, type, symbol });
      toast.info(`Signal queued: ${type} ${symbol}`);
    }

    return signalId;
  }

  /**
   * Get signal queue status
   */
  getSignalQueueStatus() {
    return this.signalQueue.getStatus();
  }

  /**
   * Get failed signals
   */
  getFailedSignals() {
    return this.signalQueue.getDeadLetters();
  }

  /**
   * Retry failed signal
   */
  retryFailedSignal(signalId) {
    const success = this.signalQueue.retryDeadLetter(signalId);
    if (success) {
      toast.info('Signal requeued for retry');
    } else {
      toast.error('Signal not found');
    }
    return success;
  }

  /**
   * Get system health status
   */
  getHealthStatus() {
    return healthMonitor.getStatus();
  }

  /**
   * Get trade audit log
   */
  getTradeAudit(limit = 100) {
    return logger.getTradeAudit(limit);
  }

  /**
   * Export trade audit to JSON
   */
  exportTradeAudit() {
    return logger.exportTradeAudit();
  }

  /**
   * Set 3D chart reference (backward compatibility)
   */
  set3DChart(chart3d) {
    this.chart3d = chart3d;
    this.chartManager.set3DChart(chart3d);
    logger.info('3D chart linked to main application');
  }

  /**
   * Update chart with real-time data
   */
  update(candle) {
    if (this.chartManager) {
      this.chartManager.update(candle);
    }
  }

  /**
   * Format timestamp for Lightweight Charts
   * @private
   */
  _formatTime(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Cleanup and destroy
   */
  async destroy() {
    if (this.signalQueue) {
      this.signalQueue.stop();
    }

    if (this.tradeExecutor) {
      await this.tradeExecutor.close();
      this.tradeExecutor = null;
    }

    healthMonitor.stop();

    if (this.isLiveStreaming) {
      this.dataService.stopLiveStream();
    }

    if (this.chartManager) {
      this.chartManager.destroy();
      this.chartManager = null;
    }

    if (this.contextMenu) {
      this.contextMenu.destroy();
      this.contextMenu = null;
    }

    this.dataService = null;
    this.indicatorService = null;
    this.chart3d = null;
    this.isInitialized = false;
    this.autoTradeEnabled = false;

    logger.info('Moon AI Trading Platform destroyed');
  }
}

// ============================================
// INITIALIZATION & EXPORT
// ============================================

// Create singleton instance
export const app = new MoonAITradingPlatform();

// Fail-safe: Force hide loading overlay after maximum timeout (10 seconds)
// This ensures the overlay NEVER gets stuck permanently
setTimeout(() => {
  const overlay = document.getElementById('loading-overlay');
  if (overlay && overlay.style.display !== 'none') {
    logger.warn('Force hiding loading overlay after timeout');
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 300);

    // Show error toast if app didn't initialize
    if (!app.isInitialized) {
      toast.error('Initialization timeout - please refresh the page');
    }
  }
}, 10000);

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    app.init().catch(err => {
      logger.error('Failed to initialize app', { error: err.message });
    });
  });
} else {
  // DOM already loaded
  app.init().catch(err => {
    logger.error('Failed to initialize app', { error: err.message });
  });
}

// Make app globally accessible for debugging and console access
window.moonAI = app;

// Console help command
window.moonAI.help = () => {
  console.log(`
=== Moon AI Trading Platform Console Commands ===

LIVE STREAMING:
  moonAI.startLiveStream('BTCUSDT', '1m', 'bybit')  - Start live stream
  moonAI.stopLiveStream()                           - Stop live stream

EXCHANGE DATA:
  moonAI.fetchFromExchange('BTCUSDT', '1h', 500)    - Fetch historical data

INDICATORS:
  moonAI.getTDSequential()                          - Get TD Sequential analysis
  moonAI.calculateIndicator('sma', 20)              - Calculate indicator
  moonAI.listIndicators()                           - List available indicators

TRADE EXECUTION:
  moonAI.connectBroker('avanza')                    - Connect to broker (opens browser)
  moonAI.disconnectBroker()                         - Disconnect from broker
  moonAI.enableAutoTrade()                          - Enable auto-execution
  moonAI.disableAutoTrade()                         - Disable auto-execution
  moonAI.submitSignal('BUY', 'BTCUSDT', {price: X}) - Manual signal

MONITORING:
  moonAI.getSignalQueueStatus()                     - Signal queue status
  moonAI.getFailedSignals()                         - View failed signals
  moonAI.getHealthStatus()                          - System health
  moonAI.getTradeAudit()                            - Trade history
  moonAI.dataService.getStats()                     - Connection stats

  `);
};

logger.info('main.js v7.0 loaded - type moonAI.help() for commands');
