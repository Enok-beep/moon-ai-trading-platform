/**
 * DetachablePanel.js - Webull-style Detachable Panel System
 * Allows panels to be detached to separate windows and synced
 *
 * Moon AI Trading Platform v7.0
 */

import { getWindowSync, createWindowSync, SYNC_EVENTS, LINK_COLORS } from './WindowSync.js';
import eventBus, { LOCAL_EVENTS } from './EventBus.js';

/**
 * Panel configurations
 */
export const PANEL_CONFIGS = {
  watchlist: {
    id: 'watchlist-panel',
    title: 'Watchlist',
    icon: 'watchlist',
    width: 350,
    height: 600,
    minWidth: 280,
    minHeight: 400,
    detachable: true,
    resizable: true
  },
  alerts: {
    id: 'alerts-panel',
    title: 'Alerts',
    icon: 'alerts',
    width: 400,
    height: 500,
    minWidth: 320,
    minHeight: 300,
    detachable: true,
    resizable: true
  },
  signals: {
    id: 'signals-panel',
    title: 'AI Signals',
    icon: 'signals',
    width: 380,
    height: 600,
    minWidth: 300,
    minHeight: 400,
    detachable: true,
    resizable: true
  },
  ai: {
    id: 'ai-combined-panel',
    title: 'AI Intelligence',
    icon: 'ai',
    width: 420,
    height: 650,
    minWidth: 350,
    minHeight: 450,
    detachable: true,
    resizable: true
  },
  screener: {
    id: 'screener-panel',
    title: 'Screener',
    icon: 'screener',
    width: 500,
    height: 700,
    minWidth: 400,
    minHeight: 500,
    detachable: true,
    resizable: true
  },
  pine: {
    id: 'pine-panel',
    title: 'Pine Script Editor',
    icon: 'pine',
    width: 600,
    height: 700,
    minWidth: 500,
    minHeight: 500,
    detachable: true,
    resizable: true
  },
  calendar: {
    id: 'calendar-panel',
    title: 'Economic Calendar',
    icon: 'calendar',
    width: 450,
    height: 600,
    minWidth: 350,
    minHeight: 400,
    detachable: true,
    resizable: true
  },
  news: {
    id: 'news-combined-panel',
    title: 'News & Sentiment',
    icon: 'news',
    width: 400,
    height: 600,
    minWidth: 320,
    minHeight: 400,
    detachable: true,
    resizable: true
  },
  notifications: {
    id: 'notifications-panel',
    title: 'Notifications',
    icon: 'notifications',
    width: 380,
    height: 500,
    minWidth: 300,
    minHeight: 350,
    detachable: true,
    resizable: true
  },
  settings: {
    id: 'settings-panel',
    title: 'Settings',
    icon: 'settings',
    width: 450,
    height: 600,
    minWidth: 350,
    minHeight: 450,
    detachable: true,
    resizable: true
  },
  help: {
    id: 'help-panel',
    title: 'Help Center',
    icon: 'help',
    width: 500,
    height: 650,
    minWidth: 400,
    minHeight: 500,
    detachable: true,
    resizable: true
  }
};

/**
 * DetachablePanel - Manages a panel that can be detached
 */
export class DetachablePanel {
  constructor(panelKey, options = {}) {
    const config = PANEL_CONFIGS[panelKey];
    if (!config) {
      throw new Error(`Unknown panel: ${panelKey}`);
    }

    this.panelKey = panelKey;
    this.config = { ...config, ...options };
    this.panelId = this.config.id;
    this.isDetached = false;
    this.detachedWindow = null;
    this.linkColor = options.linkColor || LINK_COLORS.BLUE;
    this.parentWindowId = options.parentWindowId || null;

    // DOM elements
    this.element = null;
    this.headerElement = null;
    this.contentElement = null;

    // State
    this.state = {
      position: { x: 100, y: 100 },
      size: { width: this.config.width, height: this.config.height },
      isMinimized: false,
      isMaximized: false
    };

    // Sync manager (will be main window's or own for detached)
    this.syncManager = getWindowSync();

    this._init();
  }

  /**
   * Initialize the panel
   */
  _init() {
    // Find the panel element
    this.element = document.getElementById(this.panelId);

    if (!this.element) {
      console.warn(`[DetachablePanel] Element not found: ${this.panelId}`);
      return;
    }

    // Find or create header
    this.headerElement = this.element.querySelector('.panel-header, .tv-panel-header');
    this.contentElement = this.element.querySelector('.panel-content');

    // Add detach UI
    this._addDetachUI();

    // Setup context menu
    this._setupContextMenu();

    // Listen for sync events
    this._setupSyncListeners();

    // Load saved state
    this._loadState();

    console.log(`[DetachablePanel] Initialized: ${this.panelKey}`);
  }

  /**
   * Add detach button and link indicator to header
   */
  _addDetachUI() {
    if (!this.headerElement) return;

    // Check if UI already exists
    if (this.headerElement.querySelector('.panel-detach-ui')) return;

    // Create detach UI container
    const detachUI = document.createElement('div');
    detachUI.className = 'panel-detach-ui';
    detachUI.innerHTML = `
      <div class="link-indicator" data-color="${this.linkColor}" title="Link color for sync">
        <div class="link-dot"></div>
        <select class="link-selector" aria-label="Link color">
          <option value="none" ${this.linkColor === 'none' ? 'selected' : ''}>Unlinked</option>
          <option value="blue" ${this.linkColor === 'blue' ? 'selected' : ''}>Blue</option>
          <option value="green" ${this.linkColor === 'green' ? 'selected' : ''}>Green</option>
          <option value="orange" ${this.linkColor === 'orange' ? 'selected' : ''}>Orange</option>
          <option value="purple" ${this.linkColor === 'purple' ? 'selected' : ''}>Purple</option>
          <option value="master" ${this.linkColor === 'master' ? 'selected' : ''}>Master</option>
        </select>
      </div>
      <button class="panel-detach-btn" title="Detach to new window (Ctrl+Shift+D)" aria-label="Detach panel">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 4V12H10V10H11V12C11 12.55 10.55 13 10 13H2C1.45 13 1 12.55 1 12V4C1 3.45 1.45 3 2 3H4V4H2Z" fill="currentColor"/>
          <path d="M6 1H13V8H11V3.41L5.71 8.71L5 8L10.29 2.71L6 2.71V1Z" fill="currentColor"/>
        </svg>
      </button>
    `;

    // Insert at end of header
    const controls = this.headerElement.querySelector('.tv-panel-controls, .panel-controls');
    if (controls) {
      controls.insertBefore(detachUI, controls.firstChild);
    } else {
      this.headerElement.appendChild(detachUI);
    }

    // Setup detach button
    const detachBtn = detachUI.querySelector('.panel-detach-btn');
    detachBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.detach();
    });

    // Setup link selector
    const linkSelector = detachUI.querySelector('.link-selector');
    linkSelector.addEventListener('change', (e) => {
      this.setLinkColor(e.target.value);
    });

    // Setup double-click to detach
    this.headerElement.addEventListener('dblclick', (e) => {
      if (e.target.closest('.panel-detach-ui')) return;
      this.detach();
    });
  }

  /**
   * Setup right-click context menu
   */
  _setupContextMenu() {
    if (!this.headerElement) return;

    this.headerElement.addEventListener('contextmenu', (e) => {
      e.preventDefault();

      // Create context menu
      const menu = document.createElement('div');
      menu.className = 'panel-context-menu';
      menu.innerHTML = `
        <div class="context-menu-item" data-action="detach">
          <span class="icon">⧉</span>
          Detach Window
          <span class="shortcut">Ctrl+Shift+D</span>
        </div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="link-blue">
          <span class="icon link-dot-blue"></span>
          Link Blue
        </div>
        <div class="context-menu-item" data-action="link-green">
          <span class="icon link-dot-green"></span>
          Link Green
        </div>
        <div class="context-menu-item" data-action="link-orange">
          <span class="icon link-dot-orange"></span>
          Link Orange
        </div>
        <div class="context-menu-item" data-action="link-purple">
          <span class="icon link-dot-purple"></span>
          Link Purple
        </div>
        <div class="context-menu-item" data-action="link-none">
          <span class="icon link-dot-none"></span>
          Unlink
        </div>
      `;

      menu.style.position = 'fixed';
      menu.style.left = `${e.clientX}px`;
      menu.style.top = `${e.clientY}px`;
      menu.style.zIndex = '10000';

      document.body.appendChild(menu);

      // Handle clicks
      menu.addEventListener('click', (ev) => {
        const action = ev.target.closest('.context-menu-item')?.dataset.action;
        if (action === 'detach') {
          this.detach();
        } else if (action?.startsWith('link-')) {
          this.setLinkColor(action.replace('link-', ''));
        }
        menu.remove();
      });

      // Close on click outside
      setTimeout(() => {
        document.addEventListener('click', () => menu.remove(), { once: true });
      }, 0);
    });
  }

  /**
   * Setup sync event listeners
   */
  _setupSyncListeners() {
    // Listen for reattach requests from detached window
    this.syncManager.on(SYNC_EVENTS.PANEL_REATTACH, (payload) => {
      if (payload.panelKey === this.panelKey && payload.parentWindowId === this.syncManager.windowId) {
        this._handleReattachRequest(payload);
      }
    });

    // Listen for window close
    this.syncManager.on(SYNC_EVENTS.WINDOW_CLOSE, (payload) => {
      if (this.detachedWindow && payload.windowId === this._detachedWindowId) {
        this._onDetachedWindowClosed();
      }
    });
  }

  /**
   * Detach panel to new window
   */
  detach() {
    if (this.isDetached || !this.config.detachable) return;

    // Calculate window position (offset from current screen position)
    const rect = this.element.getBoundingClientRect();
    const screenX = window.screenX + rect.left;
    const screenY = window.screenY + rect.top;

    // Create window features
    const features = [
      `width=${this.config.width}`,
      `height=${this.config.height}`,
      `left=${screenX}`,
      `top=${screenY}`,
      'menubar=no',
      'toolbar=no',
      'location=no',
      'status=no',
      'resizable=yes',
      'scrollbars=yes'
    ].join(',');

    // Generate detached window URL
    const params = new URLSearchParams({
      panelKey: this.panelKey,
      detached: 'true',
      parentWindowId: this.syncManager.windowId,
      linkColor: this.linkColor
    });

    const url = `/panel.html?${params.toString()}`;

    // Open new window
    this._detachedWindowId = `detached_${this.panelKey}_${Date.now()}`;
    this.detachedWindow = window.open(url, this._detachedWindowId, features);

    if (!this.detachedWindow) {
      console.error('[DetachablePanel] Failed to open window - popup blocked?');
      this._showPopupBlockedMessage();
      return;
    }

    this.isDetached = true;

    // Hide panel in main window
    this.element.classList.add('detached', 'hidden');

    // Broadcast detach event
    this.syncManager.broadcast(SYNC_EVENTS.PANEL_DETACH, {
      panelKey: this.panelKey,
      panelId: this.panelId,
      parentWindowId: this.syncManager.windowId,
      linkColor: this.linkColor
    });

    // Emit local event
    eventBus.emit(LOCAL_EVENTS.PANEL_CLOSE, { panelId: this.panelId, reason: 'detached' });

    // Save state
    this._saveState();

    console.log(`[DetachablePanel] Detached: ${this.panelKey}`);

    // Watch for window close
    const checkClosed = setInterval(() => {
      if (this.detachedWindow?.closed) {
        clearInterval(checkClosed);
        this._onDetachedWindowClosed();
      }
    }, 500);
  }

  /**
   * Reattach panel back to main window
   */
  reattach() {
    if (!this.isDetached) return;

    // Close detached window if still open
    if (this.detachedWindow && !this.detachedWindow.closed) {
      this.detachedWindow.close();
    }

    this.isDetached = false;
    this.detachedWindow = null;
    this._detachedWindowId = null;

    // Show panel in main window
    this.element.classList.remove('detached', 'hidden');

    // Broadcast reattach event
    this.syncManager.broadcast(SYNC_EVENTS.PANEL_REATTACH, {
      panelKey: this.panelKey,
      panelId: this.panelId
    });

    // Emit local event
    eventBus.emit(LOCAL_EVENTS.PANEL_OPEN, { panelId: this.panelId });

    // Save state
    this._saveState();

    console.log(`[DetachablePanel] Reattached: ${this.panelKey}`);
  }

  /**
   * Handle detached window closed
   */
  _onDetachedWindowClosed() {
    if (!this.isDetached) return;

    console.log(`[DetachablePanel] Detached window closed: ${this.panelKey}`);
    this.reattach();
  }

  /**
   * Handle reattach request from detached window
   */
  _handleReattachRequest(payload) {
    console.log(`[DetachablePanel] Reattach request received: ${this.panelKey}`);
    this.reattach();
  }

  /**
   * Set link color
   */
  setLinkColor(color) {
    if (!Object.values(LINK_COLORS).includes(color)) {
      console.warn(`[DetachablePanel] Invalid link color: ${color}`);
      return;
    }

    this.linkColor = color;

    // Update UI
    const indicator = this.element?.querySelector('.link-indicator');
    if (indicator) {
      indicator.dataset.color = color;
    }

    const selector = this.element?.querySelector('.link-selector');
    if (selector) {
      selector.value = color;
    }

    // Update sync manager
    this.syncManager.setLinkColor(color);

    // Save state
    this._saveState();

    console.log(`[DetachablePanel] Link color changed: ${this.panelKey} -> ${color}`);
  }

  /**
   * Show popup blocked message
   */
  _showPopupBlockedMessage() {
    // Could integrate with toast system
    alert('Popup was blocked. Please allow popups for this site to detach panels.');
  }

  /**
   * Load saved state
   */
  _loadState() {
    try {
      const saved = localStorage.getItem(`panel_state_${this.panelKey}`);
      if (saved) {
        const state = JSON.parse(saved);
        this.state = { ...this.state, ...state };
        this.linkColor = state.linkColor || this.linkColor;
      }
    } catch (e) {
      console.error('[DetachablePanel] Load state error:', e);
    }
  }

  /**
   * Save state
   */
  _saveState() {
    try {
      localStorage.setItem(`panel_state_${this.panelKey}`, JSON.stringify({
        ...this.state,
        linkColor: this.linkColor,
        isDetached: this.isDetached
      }));
    } catch (e) {
      console.error('[DetachablePanel] Save state error:', e);
    }
  }

  /**
   * Get panel element
   */
  getElement() {
    return this.element;
  }

  /**
   * Check if panel is detached
   */
  getIsDetached() {
    return this.isDetached;
  }

  /**
   * Get link color
   */
  getLinkColor() {
    return this.linkColor;
  }

  /**
   * Destroy the panel manager
   */
  destroy() {
    if (this.isDetached) {
      this.reattach();
    }

    // Remove UI elements
    const detachUI = this.element?.querySelector('.panel-detach-ui');
    if (detachUI) {
      detachUI.remove();
    }
  }
}

/**
 * DetachablePanelManager - Manages all detachable panels
 */
export class DetachablePanelManager {
  constructor() {
    this.panels = new Map();
    this.initialized = false;
  }

  /**
   * Initialize all panels
   */
  init() {
    if (this.initialized) return;

    // Initialize panels for all configured panels that exist in DOM
    for (const [key, config] of Object.entries(PANEL_CONFIGS)) {
      const element = document.getElementById(config.id);
      if (element && config.detachable) {
        this.panels.set(key, new DetachablePanel(key));
      }
    }

    // Setup keyboard shortcuts
    this._setupKeyboardShortcuts();

    this.initialized = true;
    console.log(`[DetachablePanelManager] Initialized ${this.panels.size} panels`);
  }

  /**
   * Setup keyboard shortcuts
   */
  _setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+D - Detach active panel
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        this._detachActivePanel();
      }
    });
  }

  /**
   * Detach the currently active/focused panel
   */
  _detachActivePanel() {
    // Find focused panel
    const focusedPanel = document.querySelector('.panel:focus-within, .panel.active');
    if (focusedPanel) {
      const panelId = focusedPanel.id;
      for (const [key, panel] of this.panels) {
        if (panel.panelId === panelId) {
          panel.detach();
          return;
        }
      }
    }
  }

  /**
   * Get panel by key
   */
  getPanel(panelKey) {
    return this.panels.get(panelKey);
  }

  /**
   * Detach panel by key
   */
  detachPanel(panelKey) {
    const panel = this.panels.get(panelKey);
    if (panel) {
      panel.detach();
    }
  }

  /**
   * Reattach panel by key
   */
  reattachPanel(panelKey) {
    const panel = this.panels.get(panelKey);
    if (panel) {
      panel.reattach();
    }
  }

  /**
   * Set link color for panel
   */
  setPanelLinkColor(panelKey, color) {
    const panel = this.panels.get(panelKey);
    if (panel) {
      panel.setLinkColor(color);
    }
  }

  /**
   * Get all detached panels
   */
  getDetachedPanels() {
    return Array.from(this.panels.values()).filter(p => p.getIsDetached());
  }

  /**
   * Reattach all panels
   */
  reattachAll() {
    for (const panel of this.panels.values()) {
      if (panel.getIsDetached()) {
        panel.reattach();
      }
    }
  }

  /**
   * Destroy manager
   */
  destroy() {
    for (const panel of this.panels.values()) {
      panel.destroy();
    }
    this.panels.clear();
    this.initialized = false;
  }
}

// Export singleton
export const detachablePanelManager = new DetachablePanelManager();

export default DetachablePanel;
