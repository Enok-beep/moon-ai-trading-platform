/**
 * EventBus.js - Enterprise Pub-Sub Event System
 * Cross-component communication within a single window
 * Integrates with WindowSync for cross-window events
 *
 * Moon AI Trading Platform v7.0
 */

import { getWindowSync, SYNC_EVENTS } from './WindowSync.js';

/**
 * Local event types (within single window)
 */
export const LOCAL_EVENTS = {
  // UI Events
  PANEL_OPEN: 'panel:open',
  PANEL_CLOSE: 'panel:close',
  PANEL_TOGGLE: 'panel:toggle',
  PANEL_RESIZE: 'panel:resize',
  MODAL_OPEN: 'modal:open',
  MODAL_CLOSE: 'modal:close',

  // Data Events
  DATA_LOADING: 'data:loading',
  DATA_LOADED: 'data:loaded',
  DATA_ERROR: 'data:error',

  // Chart Events
  CHART_READY: 'chart:ready',
  CHART_RENDER: 'chart:render',
  CHART_ZOOM: 'chart:zoom',
  CHART_PAN: 'chart:pan',

  // Trading Events
  ORDER_SUBMIT: 'order:submit',
  ORDER_FILL: 'order:fill',
  ORDER_CANCEL: 'order:cancel',
  POSITION_UPDATE: 'position:update',

  // User Events
  USER_LOGIN: 'user:login',
  USER_LOGOUT: 'user:logout',
  PREFERENCES_UPDATE: 'preferences:update'
};

// Re-export SYNC_EVENTS for convenience
export { SYNC_EVENTS };

/**
 * EventBus - Central pub-sub system
 */
class EventBus {
  constructor() {
    this._handlers = new Map();
    this._onceHandlers = new Map();
    this._history = [];
    this._historyLimit = 100;
    this._windowSync = null;
    this._syncEnabled = false;

    // Performance tracking
    this._metrics = {
      emitted: 0,
      handled: 0,
      errors: 0
    };
  }

  /**
   * Enable cross-window sync
   */
  enableSync(windowSyncOptions = {}) {
    if (this._syncEnabled) return;

    this._windowSync = getWindowSync(windowSyncOptions);
    this._syncEnabled = true;

    // Forward all sync events to local handlers
    this._windowSync.on('*', (event, payload, meta) => {
      this._emitLocal(event, payload, { ...meta, fromSync: true });
    });

    console.log('[EventBus] Cross-window sync enabled');
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name or wildcard '*'
   * @param {Function} handler - Event handler
   * @param {Object} options - { once: boolean, priority: number }
   * @returns {Function} Unsubscribe function
   */
  on(event, handler, options = {}) {
    const { once = false, priority = 0 } = options;

    const targetMap = once ? this._onceHandlers : this._handlers;

    if (!targetMap.has(event)) {
      targetMap.set(event, []);
    }

    const entry = { handler, priority };
    const handlers = targetMap.get(event);
    handlers.push(entry);

    // Sort by priority (higher first)
    handlers.sort((a, b) => b.priority - a.priority);

    return () => this.off(event, handler);
  }

  /**
   * Subscribe to an event once
   */
  once(event, handler, options = {}) {
    return this.on(event, handler, { ...options, once: true });
  }

  /**
   * Unsubscribe from an event
   */
  off(event, handler) {
    for (const map of [this._handlers, this._onceHandlers]) {
      if (map.has(event)) {
        const handlers = map.get(event);
        const index = handlers.findIndex(entry => entry.handler === handler);
        if (index !== -1) {
          handlers.splice(index, 1);
        }
      }
    }
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {*} payload - Event data
   * @param {Object} options - { sync: boolean, persist: boolean }
   */
  emit(event, payload = {}, options = {}) {
    const { sync = false, persist = false } = options;

    this._metrics.emitted++;

    // Add to history
    this._addToHistory(event, payload);

    // Emit locally
    this._emitLocal(event, payload, { fromSync: false });

    // Broadcast to other windows if sync enabled
    if (sync && this._syncEnabled && this._windowSync) {
      this._windowSync.broadcast(event, payload);
    }

    // Persist to localStorage if needed
    if (persist) {
      this._persistEvent(event, payload);
    }
  }

  /**
   * Emit event locally (within this window)
   */
  _emitLocal(event, payload, meta = {}) {
    const handlers = this._handlers.get(event) || [];
    const onceHandlers = this._onceHandlers.get(event) || [];
    const wildcardHandlers = this._handlers.get('*') || [];

    // Execute regular handlers
    for (const { handler } of handlers) {
      this._executeHandler(handler, event, payload, meta);
    }

    // Execute once handlers and remove them
    for (const { handler } of onceHandlers) {
      this._executeHandler(handler, event, payload, meta);
    }
    this._onceHandlers.delete(event);

    // Execute wildcard handlers
    for (const { handler } of wildcardHandlers) {
      this._executeHandler(handler, event, payload, meta);
    }
  }

  /**
   * Execute a handler safely
   */
  _executeHandler(handler, event, payload, meta) {
    try {
      handler(payload, { event, ...meta });
      this._metrics.handled++;
    } catch (error) {
      this._metrics.errors++;
      console.error(`[EventBus] Handler error for ${event}:`, error);
    }
  }

  /**
   * Add event to history
   */
  _addToHistory(event, payload) {
    this._history.push({
      event,
      payload,
      timestamp: Date.now()
    });

    // Trim history
    if (this._history.length > this._historyLimit) {
      this._history.shift();
    }
  }

  /**
   * Persist event to localStorage
   */
  _persistEvent(event, payload) {
    try {
      const key = `eventbus_${event}`;
      localStorage.setItem(key, JSON.stringify({
        payload,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.error('[EventBus] Persist error:', e);
    }
  }

  /**
   * Load persisted event
   */
  loadPersisted(event) {
    try {
      const key = `eventbus_${event}`;
      const data = localStorage.getItem(key);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('[EventBus] Load persisted error:', e);
    }
    return null;
  }

  /**
   * Get event history
   */
  getHistory(filter = {}) {
    let history = [...this._history];

    if (filter.event) {
      history = history.filter(h => h.event === filter.event);
    }

    if (filter.since) {
      history = history.filter(h => h.timestamp >= filter.since);
    }

    if (filter.limit) {
      history = history.slice(-filter.limit);
    }

    return history;
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return { ...this._metrics };
  }

  /**
   * Clear all handlers
   */
  clear() {
    this._handlers.clear();
    this._onceHandlers.clear();
    this._history = [];
  }

  /**
   * Check if event has handlers
   */
  hasHandlers(event) {
    return (
      (this._handlers.has(event) && this._handlers.get(event).length > 0) ||
      (this._onceHandlers.has(event) && this._onceHandlers.get(event).length > 0)
    );
  }

  /**
   * Get WindowSync instance
   */
  getWindowSync() {
    return this._windowSync;
  }
}

// Singleton instance
const eventBus = new EventBus();

// Helper functions for common patterns
export function emitSymbolChange(symbol, options = {}) {
  eventBus.emit(SYNC_EVENTS.SYMBOL_CHANGE, { symbol }, { sync: true, ...options });
}

export function emitTimeframeChange(timeframe, options = {}) {
  eventBus.emit(SYNC_EVENTS.TIMEFRAME_CHANGE, { timeframe }, { sync: true, ...options });
}

export function emitIndicatorAdd(indicator, options = {}) {
  eventBus.emit(SYNC_EVENTS.INDICATOR_ADD, { indicator }, { sync: true, ...options });
}

export function emitAlertTriggered(alert, options = {}) {
  eventBus.emit(SYNC_EVENTS.ALERT_TRIGGERED, { alert }, { sync: true, ...options });
}

export function emitSignalNew(signal, options = {}) {
  eventBus.emit(SYNC_EVENTS.SIGNAL_NEW, { signal }, { sync: true, ...options });
}

export function emitPanelOpen(panelId, options = {}) {
  eventBus.emit(LOCAL_EVENTS.PANEL_OPEN, { panelId }, options);
}

export function emitPanelClose(panelId, options = {}) {
  eventBus.emit(LOCAL_EVENTS.PANEL_CLOSE, { panelId }, options);
}

export default eventBus;
