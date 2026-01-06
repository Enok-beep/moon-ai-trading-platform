/**
 * ChartSyncService.js
 * TradingView-style multi-chart synchronization system
 * Handles symbol sync, crosshair sync, timeframe sync across charts/tabs/devices
 *
 * Moon AI Trading Platform v6.5
 */

import { logger } from '../core/Logger.js';

/**
 * Sync configuration for a layout
 */
const DEFAULT_SYNC_CONFIG = {
  symbol: true,
  timeframe: false,
  crosshair: true,
  zoom: false,
  drawings: false,
  indicators: false
};

/**
 * Device priority for conflict resolution
 * Higher number = higher priority
 */
const DEVICE_PRIORITY = {
  desktop: 1000,
  web: 800,
  tablet: 600,
  mobile: 500
};

/**
 * ChartSyncService - Enterprise-grade chart synchronization
 */
export class ChartSyncService {
  constructor() {
    // Sync state
    this.layouts = new Map();
    this.activeLayout = 'default';
    this.syncConfig = { ...DEFAULT_SYNC_CONFIG };

    // Device identification
    this.deviceId = this._generateDeviceId();
    this.deviceType = this._detectDeviceType();

    // Chart registry
    this.charts = new Map();
    this.activeChart = null;

    // Crosshair state
    this.crosshairPosition = { time: null, price: null };

    // Event listeners
    this.listeners = new Map();

    // Tab sync via localStorage
    this.tabSyncEnabled = true;
    this.tabColorGroup = null;

    // WebSocket connection (optional cloud sync)
    this.ws = null;
    this.wsConnected = false;

    // Conflict resolution
    this.pendingChanges = [];
    this.lastSyncTimestamp = Date.now();

    this._initTabSync();

    logger.info('ChartSyncService initialized', {
      deviceId: this.deviceId,
      deviceType: this.deviceType
    });
  }

  /**
   * Generate unique device identifier
   */
  _generateDeviceId() {
    let deviceId = localStorage.getItem('moonai_device_id');
    if (!deviceId) {
      deviceId = `${this._detectDeviceType()}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('moonai_device_id', deviceId);
    }
    return deviceId;
  }

  /**
   * Detect device type for priority
   */
  _detectDeviceType() {
    const ua = navigator.userAgent.toLowerCase();
    if (/electron/i.test(ua)) return 'desktop';
    if (/ipad|tablet/i.test(ua)) return 'tablet';
    if (/mobile|android|iphone/i.test(ua)) return 'mobile';
    return 'web';
  }

  /**
   * Initialize cross-tab synchronization via localStorage
   */
  _initTabSync() {
    // Listen for storage events from other tabs
    window.addEventListener('storage', (event) => {
      if (!this.tabSyncEnabled) return;

      if (event.key === 'moonai_symbol_sync') {
        const data = JSON.parse(event.newValue);
        if (data && data.colorGroup === this.tabColorGroup && data.deviceId !== this.deviceId) {
          this._handleIncomingSymbolSync(data);
        }
      }

      if (event.key === 'moonai_layout_sync') {
        const data = JSON.parse(event.newValue);
        if (data && data.layoutId === this.activeLayout && data.deviceId !== this.deviceId) {
          this._handleIncomingLayoutSync(data);
        }
      }
    });

    // Load tab color group from storage
    this.tabColorGroup = sessionStorage.getItem('moonai_tab_color') || null;
  }

  // ============================================
  // LAYOUT MANAGEMENT
  // ============================================

  /**
   * Create a new layout with sync configuration
   * @param {string} layoutId - Unique layout identifier
   * @param {Object} config - Sync configuration
   */
  createLayout(layoutId, config = {}) {
    const layout = {
      id: layoutId,
      name: config.name || layoutId,
      sync: { ...DEFAULT_SYNC_CONFIG, ...config.sync },
      charts: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1
    };

    this.layouts.set(layoutId, layout);
    logger.info('Layout created', { layoutId, sync: layout.sync });

    return layout;
  }

  /**
   * Set active layout
   * @param {string} layoutId
   */
  setActiveLayout(layoutId) {
    if (!this.layouts.has(layoutId)) {
      this.createLayout(layoutId);
    }

    this.activeLayout = layoutId;
    this.syncConfig = this.layouts.get(layoutId).sync;

    this._emit('layoutChanged', { layoutId });
    logger.debug('Active layout changed', { layoutId });
  }

  /**
   * Update sync configuration for active layout
   * @param {Object} config - Partial sync config
   */
  updateSyncConfig(config) {
    const layout = this.layouts.get(this.activeLayout);
    if (layout) {
      layout.sync = { ...layout.sync, ...config };
      layout.updatedAt = Date.now();
      layout.version++;

      this.syncConfig = layout.sync;
      this._emit('syncConfigChanged', { layoutId: this.activeLayout, sync: layout.sync });
      this._broadcastLayoutSync();
    }
  }

  // ============================================
  // CHART REGISTRATION
  // ============================================

  /**
   * Register a chart instance for synchronization
   * @param {string} chartId - Unique chart identifier
   * @param {Object} chartInstance - Chart instance with setSymbol, setTimeframe methods
   * @param {Object} options - Registration options
   */
  registerChart(chartId, chartInstance, options = {}) {
    const chart = {
      id: chartId,
      instance: chartInstance,
      symbol: options.symbol || 'BTCUSDT',
      timeframe: options.timeframe || '1m',
      syncGroup: options.syncGroup || 'primary',
      layoutId: options.layoutId || this.activeLayout,
      isActive: false
    };

    this.charts.set(chartId, chart);

    // Add to layout
    const layout = this.layouts.get(chart.layoutId);
    if (layout) {
      layout.charts.push(chartId);
    }

    logger.debug('Chart registered', { chartId, symbol: chart.symbol, syncGroup: chart.syncGroup });

    return chart;
  }

  /**
   * Unregister a chart
   * @param {string} chartId
   */
  unregisterChart(chartId) {
    const chart = this.charts.get(chartId);
    if (chart) {
      const layout = this.layouts.get(chart.layoutId);
      if (layout) {
        layout.charts = layout.charts.filter(id => id !== chartId);
      }
      this.charts.delete(chartId);
      logger.debug('Chart unregistered', { chartId });
    }
  }

  /**
   * Set active chart (receives keyboard/scroll events)
   * @param {string} chartId
   */
  setActiveChart(chartId) {
    // Deactivate previous
    if (this.activeChart) {
      const prev = this.charts.get(this.activeChart);
      if (prev) prev.isActive = false;
    }

    // Activate new
    const chart = this.charts.get(chartId);
    if (chart) {
      chart.isActive = true;
      this.activeChart = chartId;
      this._emit('activeChartChanged', { chartId });
    }
  }

  // ============================================
  // SYMBOL SYNCHRONIZATION
  // ============================================

  /**
   * Change symbol with synchronization
   * @param {string} symbol - New symbol
   * @param {string} sourceChartId - Chart that initiated the change
   */
  setSymbol(symbol, sourceChartId = null) {
    const timestamp = Date.now();

    // Update source chart
    if (sourceChartId) {
      const sourceChart = this.charts.get(sourceChartId);
      if (sourceChart) {
        sourceChart.symbol = symbol;
        sourceChart.instance?.setSymbol?.(symbol);
      }
    }

    // Sync to other charts if enabled
    if (this.syncConfig.symbol) {
      const layout = this.layouts.get(this.activeLayout);
      if (layout) {
        this.charts.forEach((chart, chartId) => {
          if (chartId !== sourceChartId &&
              chart.layoutId === this.activeLayout &&
              this._shouldSync(chartId, sourceChartId)) {
            chart.symbol = symbol;
            chart.instance?.setSymbol?.(symbol);
          }
        });
      }
    }

    // Broadcast to other tabs
    this._broadcastSymbolSync(symbol, timestamp);

    // Emit event
    this._emit('symbolChanged', { symbol, sourceChartId, timestamp });

    logger.debug('Symbol changed', { symbol, sourceChartId, synced: this.syncConfig.symbol });
  }

  /**
   * Handle incoming symbol sync from another tab/device
   */
  _handleIncomingSymbolSync(data) {
    const { symbol, timestamp, deviceId } = data;

    // Conflict resolution: newer timestamp wins
    if (timestamp > this.lastSyncTimestamp) {
      this.lastSyncTimestamp = timestamp;

      // Update all synced charts
      this.charts.forEach((chart) => {
        if (chart.layoutId === this.activeLayout && this.syncConfig.symbol) {
          chart.symbol = symbol;
          chart.instance?.setSymbol?.(symbol);
        }
      });

      this._emit('symbolSynced', { symbol, fromDevice: deviceId });
      logger.debug('Symbol synced from other tab', { symbol, deviceId });
    }
  }

  /**
   * Broadcast symbol change to other tabs
   */
  _broadcastSymbolSync(symbol, timestamp) {
    if (!this.tabSyncEnabled || !this.tabColorGroup) return;

    const data = {
      symbol,
      timestamp,
      deviceId: this.deviceId,
      colorGroup: this.tabColorGroup,
      layoutId: this.activeLayout
    };

    localStorage.setItem('moonai_symbol_sync', JSON.stringify(data));
  }

  // ============================================
  // TIMEFRAME SYNCHRONIZATION
  // ============================================

  /**
   * Change timeframe with synchronization
   * @param {string} timeframe - New timeframe
   * @param {string} sourceChartId - Chart that initiated the change
   */
  setTimeframe(timeframe, sourceChartId = null) {
    const timestamp = Date.now();

    // Update source chart
    if (sourceChartId) {
      const sourceChart = this.charts.get(sourceChartId);
      if (sourceChart) {
        sourceChart.timeframe = timeframe;
        sourceChart.instance?.setTimeframe?.(timeframe);
      }
    }

    // Sync to other charts if enabled
    if (this.syncConfig.timeframe) {
      this.charts.forEach((chart, chartId) => {
        if (chartId !== sourceChartId &&
            chart.layoutId === this.activeLayout &&
            this._shouldSync(chartId, sourceChartId)) {
          chart.timeframe = timeframe;
          chart.instance?.setTimeframe?.(timeframe);
        }
      });
    }

    this._emit('timeframeChanged', { timeframe, sourceChartId, timestamp });
    logger.debug('Timeframe changed', { timeframe, sourceChartId, synced: this.syncConfig.timeframe });
  }

  // ============================================
  // CROSSHAIR SYNCHRONIZATION
  // ============================================

  /**
   * Update crosshair position across all charts
   * @param {number} time - Timestamp
   * @param {number} price - Price level
   * @param {string} sourceChartId - Chart that moved crosshair
   */
  setCrosshairPosition(time, price, sourceChartId = null) {
    if (!this.syncConfig.crosshair) return;

    this.crosshairPosition = { time, price };

    // Update all other charts
    this.charts.forEach((chart, chartId) => {
      if (chartId !== sourceChartId && chart.layoutId === this.activeLayout) {
        chart.instance?.setCrosshairPosition?.(time, price);
      }
    });

    this._emit('crosshairMoved', { time, price, sourceChartId });
  }

  /**
   * Clear crosshair from all charts
   */
  clearCrosshair() {
    this.crosshairPosition = { time: null, price: null };

    this.charts.forEach((chart) => {
      chart.instance?.clearCrosshair?.();
    });
  }

  // ============================================
  // TAB COLOR GROUPS (TradingView Feature)
  // ============================================

  /**
   * Set tab color group for cross-tab sync
   * @param {string} color - Color name (red, blue, green, yellow, null for independent)
   */
  setTabColorGroup(color) {
    this.tabColorGroup = color;
    sessionStorage.setItem('moonai_tab_color', color || '');

    this._emit('tabColorChanged', { color });
    logger.debug('Tab color group set', { color });
  }

  /**
   * Get current tab color group
   */
  getTabColorGroup() {
    return this.tabColorGroup;
  }

  // ============================================
  // EMOJI SYNC GROUPS (Advanced TradingView)
  // ============================================

  /**
   * Set sync group for a chart using emoji
   * @param {string} chartId
   * @param {string} emoji - Sync group emoji
   */
  setChartSyncGroup(chartId, emoji) {
    const chart = this.charts.get(chartId);
    if (chart) {
      chart.syncGroup = emoji;
      this._emit('chartSyncGroupChanged', { chartId, syncGroup: emoji });
    }
  }

  /**
   * Check if two charts should sync based on their groups
   */
  _shouldSync(chartId1, chartId2) {
    const chart1 = this.charts.get(chartId1);
    const chart2 = this.charts.get(chartId2);

    if (!chart1 || !chart2) return false;

    // Same sync group = should sync
    return chart1.syncGroup === chart2.syncGroup;
  }

  // ============================================
  // WEBSOCKET CLOUD SYNC (Optional)
  // ============================================

  /**
   * Connect to cloud sync service
   * @param {string} url - WebSocket URL
   */
  connectCloudSync(url = 'wss://sync.moonai.com') {
    if (this.ws) {
      this.ws.close();
    }

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.wsConnected = true;
        this._emit('cloudConnected');
        logger.info('Cloud sync connected');

        // Subscribe to active layout
        this._sendWS({
          type: 'subscribe',
          layoutId: this.activeLayout,
          deviceId: this.deviceId
        });
      };

      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        this._handleCloudMessage(msg);
      };

      this.ws.onclose = () => {
        this.wsConnected = false;
        this._emit('cloudDisconnected');
        logger.info('Cloud sync disconnected');

        // Auto-reconnect after 5s
        setTimeout(() => {
          if (this.ws) this.connectCloudSync(url);
        }, 5000);
      };

      this.ws.onerror = (error) => {
        logger.error('Cloud sync error', { error: error.message });
      };

    } catch (error) {
      logger.error('Failed to connect cloud sync', { error: error.message });
    }
  }

  /**
   * Disconnect from cloud sync
   */
  disconnectCloudSync() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Send message to cloud
   */
  _sendWS(data) {
    if (this.wsConnected && this.ws) {
      this.ws.send(JSON.stringify({
        ...data,
        timestamp: Date.now(),
        deviceId: this.deviceId,
        deviceType: this.deviceType
      }));
    }
  }

  /**
   * Handle incoming cloud message
   */
  _handleCloudMessage(msg) {
    if (msg.deviceId === this.deviceId) return; // Ignore own messages

    const { type, timestamp } = msg;

    // Conflict resolution: newer timestamp wins, desktop priority on tie
    if (timestamp < this.lastSyncTimestamp) {
      // Our changes are newer, ignore incoming
      if (DEVICE_PRIORITY[this.deviceType] >= DEVICE_PRIORITY[msg.deviceType]) {
        return;
      }
    }

    this.lastSyncTimestamp = timestamp;

    switch (type) {
      case 'symbol_sync':
        this._handleIncomingSymbolSync(msg);
        break;
      case 'layout_sync':
        this._handleIncomingLayoutSync(msg);
        break;
      case 'crosshair_sync':
        if (this.syncConfig.crosshair) {
          this.setCrosshairPosition(msg.time, msg.price, null);
        }
        break;
    }
  }

  /**
   * Handle incoming layout sync
   */
  _handleIncomingLayoutSync(data) {
    const { layoutId, sync, version } = data;

    const layout = this.layouts.get(layoutId);
    if (layout && version > layout.version) {
      layout.sync = sync;
      layout.version = version;
      layout.updatedAt = Date.now();

      if (layoutId === this.activeLayout) {
        this.syncConfig = sync;
      }

      this._emit('layoutSynced', { layoutId });
    }
  }

  /**
   * Broadcast layout sync
   */
  _broadcastLayoutSync() {
    const layout = this.layouts.get(this.activeLayout);
    if (!layout) return;

    const data = {
      layoutId: this.activeLayout,
      sync: layout.sync,
      version: layout.version,
      timestamp: Date.now(),
      deviceId: this.deviceId
    };

    // Local storage for tab sync
    localStorage.setItem('moonai_layout_sync', JSON.stringify(data));

    // WebSocket for cloud sync
    this._sendWS({ type: 'layout_sync', ...data });
  }

  // ============================================
  // EVENT SYSTEM
  // ============================================

  /**
   * Subscribe to sync events
   * @param {string} event - Event name
   * @param {Function} callback - Event handler
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Unsubscribe from sync events
   */
  off(event, callback) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(callback);
      if (index > -1) handlers.splice(index, 1);
    }
  }

  /**
   * Emit event to all listeners
   */
  _emit(event, data) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger.error('Event handler error', { event, error: error.message });
        }
      });
    }
  }

  // ============================================
  // PERSISTENCE
  // ============================================

  /**
   * Save all layouts to localStorage
   */
  saveLayouts() {
    const data = {
      layouts: Array.from(this.layouts.entries()),
      activeLayout: this.activeLayout,
      savedAt: Date.now()
    };

    localStorage.setItem('moonai_layouts', JSON.stringify(data));
    logger.debug('Layouts saved');
  }

  /**
   * Load layouts from localStorage
   */
  loadLayouts() {
    try {
      const data = JSON.parse(localStorage.getItem('moonai_layouts'));
      if (data && data.layouts) {
        this.layouts = new Map(data.layouts);
        if (data.activeLayout && this.layouts.has(data.activeLayout)) {
          this.activeLayout = data.activeLayout;
          this.syncConfig = this.layouts.get(this.activeLayout).sync;
        }
        logger.debug('Layouts loaded', { count: this.layouts.size });
      }
    } catch (error) {
      logger.error('Failed to load layouts', { error: error.message });
    }
  }

  // ============================================
  // STATUS & DIAGNOSTICS
  // ============================================

  /**
   * Get current sync status
   */
  getStatus() {
    return {
      deviceId: this.deviceId,
      deviceType: this.deviceType,
      activeLayout: this.activeLayout,
      syncConfig: { ...this.syncConfig },
      chartsCount: this.charts.size,
      activeChart: this.activeChart,
      tabColorGroup: this.tabColorGroup,
      cloudConnected: this.wsConnected,
      lastSync: this.lastSyncTimestamp
    };
  }

  /**
   * Get layout details
   */
  getLayout(layoutId = this.activeLayout) {
    const layout = this.layouts.get(layoutId);
    if (layout) {
      return {
        ...layout,
        charts: layout.charts.map(id => {
          const chart = this.charts.get(id);
          return chart ? {
            id,
            symbol: chart.symbol,
            timeframe: chart.timeframe,
            syncGroup: chart.syncGroup,
            isActive: chart.isActive
          } : null;
        }).filter(Boolean)
      };
    }
    return null;
  }

  /**
   * Cleanup
   */
  destroy() {
    this.saveLayouts();
    this.disconnectCloudSync();
    this.charts.clear();
    this.layouts.clear();
    this.listeners.clear();
    logger.info('ChartSyncService destroyed');
  }
}

// Export singleton instance
export const chartSync = new ChartSyncService();
