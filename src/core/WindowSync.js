/**
 * WindowSync.js - Enterprise-grade Multi-Window Synchronization
 * Uses BroadcastChannel API for cross-window communication
 * Inspired by Webull/TradeStation color-coded linking
 *
 * Moon AI Trading Platform v7.0
 */

/**
 * Event types for cross-window communication
 */
export const SYNC_EVENTS = {
  // Symbol & Chart
  SYMBOL_CHANGE: 'symbol:change',
  TIMEFRAME_CHANGE: 'timeframe:change',
  CHART_UPDATE: 'chart:update',

  // Indicators
  INDICATOR_ADD: 'indicator:add',
  INDICATOR_REMOVE: 'indicator:remove',
  INDICATOR_UPDATE: 'indicator:update',
  INDICATOR_CONDITION: 'indicator:condition',

  // Alerts & Signals
  ALERT_CREATE: 'alert:create',
  ALERT_TRIGGERED: 'alert:triggered',
  ALERT_DELETE: 'alert:delete',
  SIGNAL_NEW: 'signal:new',
  SIGNAL_EXECUTE: 'signal:execute',

  // Panels & UI
  PANEL_DETACH: 'panel:detach',
  PANEL_REATTACH: 'panel:reattach',
  PANEL_FOCUS: 'panel:focus',
  THEME_CHANGE: 'theme:change',

  // System
  SYNC_REQUEST: 'sync:request',
  SYNC_RESPONSE: 'sync:response',
  HEARTBEAT: 'heartbeat',
  WINDOW_CLOSE: 'window:close'
};

/**
 * Link colors for color-coded synchronization (TradeStation/NinjaTrader style)
 */
export const LINK_COLORS = {
  NONE: 'none',      // Gray - Unlinked, independent
  BLUE: 'blue',      // Group A
  GREEN: 'green',    // Group B
  ORANGE: 'orange',  // Group C
  PURPLE: 'purple',  // Group D
  MASTER: 'master'   // White - Receives ALL broadcasts
};

/**
 * WindowSyncManager - Manages cross-window communication
 */
export class WindowSyncManager {
  constructor(options = {}) {
    this.channelName = options.channelName || 'moonai_sync';
    this.windowId = this._generateWindowId();
    this.windowName = options.windowName || window.name || 'main';
    this.linkColor = options.linkColor || LINK_COLORS.NONE;
    this.isDetached = options.isDetached || false;
    this.parentWindowId = options.parentWindowId || null;

    // Event handlers
    this._handlers = new Map();
    this._channel = null;
    this._heartbeatInterval = null;
    this._connectedWindows = new Map();

    // State
    this._state = {
      symbol: 'MSFT',
      timeframe: '1D',
      indicators: [],
      theme: 'dark'
    };

    // Initialize
    this._init();
  }

  /**
   * Initialize the sync manager
   */
  _init() {
    // Check for BroadcastChannel support
    if (typeof BroadcastChannel === 'undefined') {
      console.warn('[WindowSync] BroadcastChannel not supported, falling back to localStorage');
      this._initLocalStorageFallback();
      return;
    }

    // Create broadcast channel
    this._channel = new BroadcastChannel(this.channelName);
    this._channel.onmessage = (event) => this._handleMessage(event.data);

    // Start heartbeat
    this._startHeartbeat();

    // Announce presence
    this._announce();

    // Handle window close
    window.addEventListener('beforeunload', () => {
      this.broadcast(SYNC_EVENTS.WINDOW_CLOSE, { windowId: this.windowId });
      this._channel?.close();
    });

    // Request sync from existing windows
    this.broadcast(SYNC_EVENTS.SYNC_REQUEST, {});

    console.log(`[WindowSync] Initialized - Window: ${this.windowId}, Link: ${this.linkColor}`);
  }

  /**
   * Generate unique window ID
   */
  _generateWindowId() {
    return `win_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * LocalStorage fallback for browsers without BroadcastChannel
   */
  _initLocalStorageFallback() {
    // Use storage events for cross-tab communication
    window.addEventListener('storage', (event) => {
      if (event.key === `${this.channelName}_message`) {
        try {
          const data = JSON.parse(event.newValue);
          this._handleMessage(data);
        } catch (e) {
          console.error('[WindowSync] LocalStorage parse error:', e);
        }
      }
    });
  }

  /**
   * Broadcast message to all windows via localStorage (fallback)
   */
  _broadcastViaLocalStorage(message) {
    localStorage.setItem(`${this.channelName}_message`, JSON.stringify(message));
    // Clear after a short delay to allow next message
    setTimeout(() => localStorage.removeItem(`${this.channelName}_message`), 100);
  }

  /**
   * Announce this window's presence
   */
  _announce() {
    this.broadcast(SYNC_EVENTS.HEARTBEAT, {
      windowName: this.windowName,
      linkColor: this.linkColor,
      isDetached: this.isDetached
    });
  }

  /**
   * Start heartbeat to track connected windows
   */
  _startHeartbeat() {
    this._heartbeatInterval = setInterval(() => {
      this._announce();

      // Remove stale windows (no heartbeat for 10 seconds)
      const now = Date.now();
      for (const [id, info] of this._connectedWindows) {
        if (now - info.lastSeen > 10000) {
          this._connectedWindows.delete(id);
          this._emit('windowDisconnected', { windowId: id });
        }
      }
    }, 3000);
  }

  /**
   * Handle incoming message
   */
  _handleMessage(data) {
    // Ignore messages from self
    if (data.sourceWindow === this.windowId) return;

    // Check link color matching
    if (!this._shouldReceive(data)) return;

    const { type, payload, sourceWindow, linkColor, timestamp } = data;

    // Update connected windows list
    if (type === SYNC_EVENTS.HEARTBEAT) {
      this._connectedWindows.set(sourceWindow, {
        ...payload,
        lastSeen: Date.now()
      });
      return;
    }

    // Handle window close
    if (type === SYNC_EVENTS.WINDOW_CLOSE) {
      this._connectedWindows.delete(sourceWindow);
      this._emit('windowDisconnected', payload);
      return;
    }

    // Handle sync request
    if (type === SYNC_EVENTS.SYNC_REQUEST) {
      this.broadcast(SYNC_EVENTS.SYNC_RESPONSE, {
        state: this._state,
        requestedBy: sourceWindow
      });
      return;
    }

    // Handle sync response
    if (type === SYNC_EVENTS.SYNC_RESPONSE) {
      if (payload.requestedBy === this.windowId) {
        this._state = { ...this._state, ...payload.state };
        this._emit('stateSync', payload.state);
      }
      return;
    }

    // Emit event to local handlers
    this._emit(type, payload, { sourceWindow, linkColor, timestamp });
  }

  /**
   * Check if this window should receive the message based on link color
   */
  _shouldReceive(data) {
    // Always receive if we're MASTER or sender is MASTER
    if (this.linkColor === LINK_COLORS.MASTER || data.linkColor === LINK_COLORS.MASTER) {
      return true;
    }

    // If unlinked, only receive if sender is also unlinked and it's a global event
    if (this.linkColor === LINK_COLORS.NONE) {
      return data.linkColor === LINK_COLORS.NONE;
    }

    // Same color = receive
    return this.linkColor === data.linkColor;
  }

  /**
   * Broadcast message to all linked windows
   */
  broadcast(type, payload) {
    const message = {
      type,
      payload,
      sourceWindow: this.windowId,
      linkColor: this.linkColor,
      timestamp: Date.now()
    };

    if (this._channel) {
      this._channel.postMessage(message);
    } else {
      this._broadcastViaLocalStorage(message);
    }

    // Also persist to localStorage for state recovery
    if (type.startsWith('symbol:') || type.startsWith('indicator:')) {
      this._persistState(type, payload);
    }
  }

  /**
   * Persist state to localStorage for recovery
   */
  _persistState(type, payload) {
    try {
      if (type === SYNC_EVENTS.SYMBOL_CHANGE) {
        this._state.symbol = payload.symbol;
      } else if (type === SYNC_EVENTS.TIMEFRAME_CHANGE) {
        this._state.timeframe = payload.timeframe;
      } else if (type === SYNC_EVENTS.INDICATOR_ADD) {
        this._state.indicators.push(payload.indicator);
      } else if (type === SYNC_EVENTS.INDICATOR_REMOVE) {
        this._state.indicators = this._state.indicators.filter(i => i.id !== payload.indicatorId);
      }

      localStorage.setItem(`${this.channelName}_state_${this.linkColor}`, JSON.stringify(this._state));
    } catch (e) {
      console.error('[WindowSync] State persist error:', e);
    }
  }

  /**
   * Register event handler
   */
  on(event, handler) {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set());
    }
    this._handlers.get(event).add(handler);

    return () => this.off(event, handler);
  }

  /**
   * Remove event handler
   */
  off(event, handler) {
    if (this._handlers.has(event)) {
      this._handlers.get(event).delete(handler);
    }
  }

  /**
   * Emit event to local handlers
   */
  _emit(event, payload, meta = {}) {
    if (this._handlers.has(event)) {
      for (const handler of this._handlers.get(event)) {
        try {
          handler(payload, meta);
        } catch (e) {
          console.error(`[WindowSync] Handler error for ${event}:`, e);
        }
      }
    }

    // Also emit to wildcard handlers
    if (this._handlers.has('*')) {
      for (const handler of this._handlers.get('*')) {
        try {
          handler(event, payload, meta);
        } catch (e) {
          console.error('[WindowSync] Wildcard handler error:', e);
        }
      }
    }
  }

  /**
   * Set link color
   */
  setLinkColor(color) {
    if (!Object.values(LINK_COLORS).includes(color)) {
      console.warn(`[WindowSync] Invalid link color: ${color}`);
      return;
    }

    this.linkColor = color;
    this._announce();

    // Load state for this link color
    this._loadStateForColor(color);

    console.log(`[WindowSync] Link color changed to: ${color}`);
  }

  /**
   * Load persisted state for a link color
   */
  _loadStateForColor(color) {
    try {
      const saved = localStorage.getItem(`${this.channelName}_state_${color}`);
      if (saved) {
        const state = JSON.parse(saved);
        this._state = { ...this._state, ...state };
        this._emit('stateSync', state);
      }
    } catch (e) {
      console.error('[WindowSync] State load error:', e);
    }
  }

  /**
   * Get connected windows
   */
  getConnectedWindows() {
    return Array.from(this._connectedWindows.entries()).map(([id, info]) => ({
      id,
      ...info
    }));
  }

  /**
   * Get current state
   */
  getState() {
    return { ...this._state };
  }

  /**
   * Destroy the sync manager
   */
  destroy() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
    }

    this.broadcast(SYNC_EVENTS.WINDOW_CLOSE, { windowId: this.windowId });

    if (this._channel) {
      this._channel.close();
      this._channel = null;
    }

    this._handlers.clear();
    this._connectedWindows.clear();

    console.log(`[WindowSync] Destroyed - Window: ${this.windowId}`);
  }
}

// Singleton instance for main window
let _instance = null;

/**
 * Get or create singleton instance
 */
export function getWindowSync(options = {}) {
  if (!_instance) {
    _instance = new WindowSyncManager(options);
  }
  return _instance;
}

/**
 * Create a new instance (for detached windows)
 */
export function createWindowSync(options = {}) {
  return new WindowSyncManager(options);
}

export default WindowSyncManager;
