/**
 * SidebarController.js - Unified Sidebar Management
 * Radio mode panel switching with detachable support
 *
 * Moon AI Trading Platform v7.0
 */

import { getWindowSync, SYNC_EVENTS, LINK_COLORS } from '../core/WindowSync.js';
import { DetachablePanel, PANEL_CONFIGS, initializeDetachablePanels } from '../core/DetachablePanel.js';
import eventBus, { LOCAL_EVENTS } from '../core/EventBus.js';

/**
 * Panel group configuration
 * Maps widgetbar button IDs to their panel configurations
 */
export const SIDEBAR_PANELS = {
  watchlist: {
    id: 'watchlist-panel',
    buttonId: 'btn-watchlist',
    icon: 'watchlist',
    title: 'Watchlist',
    badge: () => window.moonAI?.getWatchlistCount?.() || 0,
    detachable: true,
    defaultOpen: false
  },
  alerts: {
    id: 'alerts-panel',
    buttonId: 'btn-alerts',
    icon: 'bell',
    title: 'Alerts',
    badge: () => window.moonAI?.getActiveAlertsCount?.() || 0,
    detachable: true,
    defaultOpen: false
  },
  signals: {
    id: 'signals-panel',
    buttonId: 'btn-signals',
    icon: 'lightning',
    title: 'AI Signals',
    badge: () => window.moonAI?.getPendingSignalsCount?.() || 0,
    detachable: true,
    defaultOpen: true // Default active panel
  },
  ai: {
    id: 'ai-combined-panel',
    buttonId: 'btn-ai',
    icon: 'brain',
    title: 'AI Assistant',
    badge: null,
    detachable: true,
    defaultOpen: false
  },
  screener: {
    id: 'screener-panel',
    buttonId: 'btn-screener',
    icon: 'filter',
    title: 'Screener',
    badge: null,
    detachable: true,
    defaultOpen: false
  },
  pine: {
    id: 'pine-panel',
    buttonId: 'btn-pine',
    icon: 'code',
    title: 'Pine Script',
    badge: null,
    detachable: true,
    defaultOpen: false
  },
  calendar: {
    id: 'calendar-panel',
    buttonId: 'btn-calendar',
    icon: 'calendar',
    title: 'Calendar',
    badge: () => window.moonAI?.getTodayEventsCount?.() || 0,
    detachable: true,
    defaultOpen: false
  },
  news: {
    id: 'news-panel',
    buttonId: 'btn-news',
    icon: 'news',
    title: 'News & Sentiment',
    badge: () => window.moonAI?.getUnreadNewsCount?.() || 0,
    detachable: true,
    defaultOpen: false
  },
  notifications: {
    id: 'notifications-panel',
    buttonId: 'btn-notifications',
    icon: 'notification',
    title: 'Notifications',
    badge: () => window.moonAI?.getUnreadNotifications?.() || 0,
    detachable: true,
    defaultOpen: false
  },
  settings: {
    id: 'settings-panel',
    buttonId: 'btn-settings',
    icon: 'settings',
    title: 'Settings',
    badge: null,
    detachable: false,
    defaultOpen: false
  },
  help: {
    id: 'help-panel',
    buttonId: 'btn-help',
    icon: 'help',
    title: 'Help',
    badge: null,
    detachable: false,
    defaultOpen: false
  }
};

/**
 * SidebarController - Manages all sidebar panels
 */
class SidebarController {
  constructor() {
    this.activePanel = null;
    this.isCollapsed = false;
    this.panels = new Map();
    this.detachablePanels = new Map();
    this.windowSync = null;
    this.badgeUpdateInterval = null;

    // Animation settings
    this.animationDuration = 250;
    this.animationEasing = 'cubic-bezier(0.4, 0, 0.2, 1)';

    // DOM elements
    this.elements = {
      container: null,
      rightPanels: null,
      widgetbar: null,
      toggleButton: null,
      chartArea: null
    };
  }

  /**
   * Initialize the sidebar controller
   */
  init(options = {}) {
    // Get DOM elements
    this.elements.container = document.querySelector('.platform-container, .tv-main');
    this.elements.rightPanels = document.querySelector('.right-panels, .tv-right-panel, #right-panels');
    this.elements.widgetbar = document.getElementById('widgetbar');
    this.elements.toggleButton = document.getElementById('panels-toggle');
    this.elements.chartArea = document.querySelector('.chart-area, .tv-chart-area, #chart-container');

    if (!this.elements.rightPanels) {
      console.warn('[SidebarController] Right panels container not found');
      return false;
    }

    // Initialize WindowSync
    this.windowSync = getWindowSync({
      windowName: 'main',
      linkColor: options.linkColor || LINK_COLORS.BLUE
    });

    // Enable EventBus sync
    eventBus.enableSync();

    // Initialize panels
    this._initializePanels();

    // Setup event listeners
    this._setupEventListeners();

    // Start badge updates
    this._startBadgeUpdates();

    // Set default panel
    const defaultPanel = Object.entries(SIDEBAR_PANELS).find(([_, config]) => config.defaultOpen);
    if (defaultPanel) {
      this.showPanel(defaultPanel[0], { animate: false });
    }

    // Load saved state
    this._loadState();

    console.log('[SidebarController] Initialized');
    return true;
  }

  /**
   * Initialize all panels
   */
  _initializePanels() {
    Object.entries(SIDEBAR_PANELS).forEach(([key, config]) => {
      const panelElement = document.getElementById(config.id);

      if (panelElement) {
        this.panels.set(key, {
          element: panelElement,
          config,
          isVisible: false
        });

        // Initialize as detachable if configured
        if (config.detachable) {
          const detachable = new DetachablePanel(key, {
            ...PANEL_CONFIGS[key],
            onDetach: () => this._handlePanelDetach(key),
            onReattach: () => this._handlePanelReattach(key)
          });
          this.detachablePanels.set(key, detachable);
        }

        // Initially hide all panels
        panelElement.style.display = 'none';
      }
    });
  }

  /**
   * Setup event listeners
   */
  _setupEventListeners() {
    // Widgetbar button clicks
    if (this.elements.widgetbar) {
      this.elements.widgetbar.addEventListener('click', (e) => {
        const button = e.target.closest('.tv-widgetbar-btn, [data-panel]');
        if (button) {
          const panelKey = this._getPanelKeyFromButton(button);
          if (panelKey) {
            this.togglePanel(panelKey);
          }
        }
      });
    }

    // Toggle button (collapse/expand sidebar)
    if (this.elements.toggleButton) {
      this.elements.toggleButton.addEventListener('click', () => {
        this.toggleCollapse();
      });
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + \ to toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        this.toggleCollapse();
      }

      // Number keys 1-9 for quick panel access
      if (e.altKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const panelIndex = parseInt(e.key) - 1;
        const panelKeys = Object.keys(SIDEBAR_PANELS);
        if (panelIndex < panelKeys.length) {
          this.togglePanel(panelKeys[panelIndex]);
        }
      }
    });

    // Listen for panel events from EventBus
    eventBus.on(LOCAL_EVENTS.PANEL_OPEN, (data) => {
      if (data.panelId) {
        this.showPanel(data.panelId);
      }
    });

    eventBus.on(LOCAL_EVENTS.PANEL_CLOSE, (data) => {
      if (data.panelId) {
        this.hidePanel(data.panelId);
      }
    });

    eventBus.on(LOCAL_EVENTS.PANEL_TOGGLE, (data) => {
      if (data.panelId) {
        this.togglePanel(data.panelId);
      }
    });

    // Listen for cross-window sync events
    this.windowSync.on(SYNC_EVENTS.PANEL_FOCUS, (data) => {
      if (data.panelId && this.panels.has(data.panelId)) {
        this.showPanel(data.panelId, { broadcast: false });
      }
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      this._handleResize();
    });
  }

  /**
   * Get panel key from button element
   */
  _getPanelKeyFromButton(button) {
    // Check data-panel attribute
    const dataPanel = button.dataset.panel;
    if (dataPanel && SIDEBAR_PANELS[dataPanel]) {
      return dataPanel;
    }

    // Check button ID
    const buttonId = button.id;
    for (const [key, config] of Object.entries(SIDEBAR_PANELS)) {
      if (config.buttonId === buttonId) {
        return key;
      }
    }

    // Check for specific classes
    const classList = Array.from(button.classList);
    for (const [key] of Object.entries(SIDEBAR_PANELS)) {
      if (classList.some(cls => cls.includes(key))) {
        return key;
      }
    }

    return null;
  }

  /**
   * Show a panel (radio mode - hides all others)
   */
  showPanel(panelKey, options = {}) {
    const { animate = true, broadcast = true } = options;

    if (!this.panels.has(panelKey)) {
      console.warn(`[SidebarController] Panel not found: ${panelKey}`);
      return;
    }

    const panel = this.panels.get(panelKey);

    // If already active, just ensure it's visible
    if (this.activePanel === panelKey && panel.isVisible) {
      return;
    }

    // Hide current active panel
    if (this.activePanel && this.activePanel !== panelKey) {
      this._hidePanel(this.activePanel, animate);
    }

    // Show new panel
    this._showPanel(panelKey, animate);

    // Update button states
    this._updateButtonStates(panelKey);

    // Expand sidebar if collapsed
    if (this.isCollapsed) {
      this.expand({ animate });
    }

    // Emit event
    eventBus.emit(LOCAL_EVENTS.PANEL_OPEN, { panelId: panelKey });

    // Broadcast to other windows
    if (broadcast) {
      this.windowSync.broadcast(SYNC_EVENTS.PANEL_FOCUS, { panelId: panelKey });
    }

    // Save state
    this._saveState();
  }

  /**
   * Hide a panel
   */
  hidePanel(panelKey, options = {}) {
    const { animate = true } = options;

    if (!this.panels.has(panelKey)) {
      return;
    }

    this._hidePanel(panelKey, animate);

    if (this.activePanel === panelKey) {
      this.activePanel = null;
    }

    // Update button states
    this._updateButtonStates(null);

    // Emit event
    eventBus.emit(LOCAL_EVENTS.PANEL_CLOSE, { panelId: panelKey });

    // Save state
    this._saveState();
  }

  /**
   * Toggle panel visibility
   */
  togglePanel(panelKey) {
    if (this.activePanel === panelKey) {
      // Clicking active panel hides it
      this.hidePanel(panelKey);
    } else {
      // Show the clicked panel
      this.showPanel(panelKey);
    }
  }

  /**
   * Internal show panel
   */
  _showPanel(panelKey, animate = true) {
    const panel = this.panels.get(panelKey);
    if (!panel) return;

    const element = panel.element;

    if (animate) {
      element.style.display = 'flex';
      element.style.opacity = '0';
      element.style.transform = 'translateX(20px)';

      requestAnimationFrame(() => {
        element.style.transition = `opacity ${this.animationDuration}ms ${this.animationEasing}, transform ${this.animationDuration}ms ${this.animationEasing}`;
        element.style.opacity = '1';
        element.style.transform = 'translateX(0)';
      });
    } else {
      element.style.display = 'flex';
      element.style.opacity = '1';
      element.style.transform = 'translateX(0)';
    }

    panel.isVisible = true;
    this.activePanel = panelKey;
  }

  /**
   * Internal hide panel
   */
  _hidePanel(panelKey, animate = true) {
    const panel = this.panels.get(panelKey);
    if (!panel) return;

    const element = panel.element;

    if (animate) {
      element.style.transition = `opacity ${this.animationDuration}ms ${this.animationEasing}, transform ${this.animationDuration}ms ${this.animationEasing}`;
      element.style.opacity = '0';
      element.style.transform = 'translateX(20px)';

      setTimeout(() => {
        if (!panel.isVisible) {
          element.style.display = 'none';
        }
      }, this.animationDuration);
    } else {
      element.style.display = 'none';
    }

    panel.isVisible = false;
  }

  /**
   * Update widgetbar button states
   */
  _updateButtonStates(activeKey) {
    if (!this.elements.widgetbar) return;

    const buttons = this.elements.widgetbar.querySelectorAll('.tv-widgetbar-btn, [data-panel]');

    buttons.forEach(button => {
      const panelKey = this._getPanelKeyFromButton(button);
      const isActive = panelKey === activeKey;

      button.classList.toggle('active', isActive);
      button.classList.toggle('tv-widgetbar-btn--active', isActive);
      button.setAttribute('aria-pressed', isActive.toString());
    });
  }

  /**
   * Collapse sidebar
   */
  collapse(options = {}) {
    const { animate = true } = options;

    if (this.isCollapsed) return;

    this.isCollapsed = true;

    if (this.elements.rightPanels) {
      if (animate) {
        this.elements.rightPanels.style.transition = `width ${this.animationDuration}ms ${this.animationEasing}, opacity ${this.animationDuration}ms ${this.animationEasing}`;
      }

      this.elements.rightPanels.classList.add('collapsed');
      this.elements.rightPanels.style.width = '0';
      this.elements.rightPanels.style.opacity = '0';
    }

    if (this.elements.container) {
      this.elements.container.classList.add('right-collapsed');
    }

    // Update toggle button
    this._updateToggleButton();

    // Trigger chart resize
    this._triggerChartResize();

    // Save state
    this._saveState();
  }

  /**
   * Expand sidebar
   */
  expand(options = {}) {
    const { animate = true } = options;

    if (!this.isCollapsed) return;

    this.isCollapsed = false;

    if (this.elements.rightPanels) {
      if (animate) {
        this.elements.rightPanels.style.transition = `width ${this.animationDuration}ms ${this.animationEasing}, opacity ${this.animationDuration}ms ${this.animationEasing}`;
      }

      this.elements.rightPanels.classList.remove('collapsed');
      this.elements.rightPanels.style.width = '';
      this.elements.rightPanels.style.opacity = '1';
    }

    if (this.elements.container) {
      this.elements.container.classList.remove('right-collapsed');
    }

    // Update toggle button
    this._updateToggleButton();

    // Trigger chart resize
    setTimeout(() => this._triggerChartResize(), this.animationDuration);

    // Save state
    this._saveState();
  }

  /**
   * Toggle sidebar collapse state
   */
  toggleCollapse() {
    if (this.isCollapsed) {
      this.expand();
    } else {
      this.collapse();
    }
  }

  /**
   * Update toggle button appearance
   */
  _updateToggleButton() {
    if (!this.elements.toggleButton) return;

    const chevron = this.elements.toggleButton.querySelector('.widgetbar-hider-chevron, svg');
    if (chevron) {
      chevron.style.transition = `transform ${this.animationDuration}ms ${this.animationEasing}`;
      chevron.style.transform = this.isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
    }

    // Update tooltip
    const tooltip = this.elements.toggleButton.querySelector('.tooltip-text');
    if (tooltip) {
      tooltip.textContent = this.isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar';
    }

    // Update aria attributes
    this.elements.toggleButton.setAttribute('aria-expanded', (!this.isCollapsed).toString());
    this.elements.toggleButton.setAttribute('title', this.isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar');
  }

  /**
   * Trigger chart resize event
   */
  _triggerChartResize() {
    // Dispatch resize event for chart libraries
    window.dispatchEvent(new Event('resize'));

    // TradingView chart specific resize
    if (window.tvWidget?.onChartReady) {
      window.tvWidget.onChartReady(() => {
        window.tvWidget.chart()?.resize?.();
      });
    }

    // Emit event for other components
    eventBus.emit(LOCAL_EVENTS.PANEL_RESIZE, { collapsed: this.isCollapsed });
  }

  /**
   * Handle window resize
   */
  _handleResize() {
    // Adjust for mobile if needed
    if (window.innerWidth < 768 && !this.isCollapsed) {
      this.collapse({ animate: false });
    }
  }

  /**
   * Handle panel detach
   */
  _handlePanelDetach(panelKey) {
    const panel = this.panels.get(panelKey);
    if (panel) {
      panel.element.style.display = 'none';
      panel.isVisible = false;
    }

    if (this.activePanel === panelKey) {
      this.activePanel = null;
      this._updateButtonStates(null);
    }
  }

  /**
   * Handle panel reattach
   */
  _handlePanelReattach(panelKey) {
    // Show the panel when reattached
    this.showPanel(panelKey);
  }

  /**
   * Start badge counter updates
   */
  _startBadgeUpdates() {
    this.badgeUpdateInterval = setInterval(() => {
      this._updateBadges();
    }, 5000); // Update every 5 seconds

    // Initial update
    this._updateBadges();
  }

  /**
   * Update all badge counters
   */
  _updateBadges() {
    if (!this.elements.widgetbar) return;

    Object.entries(SIDEBAR_PANELS).forEach(([key, config]) => {
      if (config.badge && typeof config.badge === 'function') {
        const count = config.badge();
        this._updateBadge(config.buttonId, count);
      }
    });
  }

  /**
   * Update single badge
   */
  _updateBadge(buttonId, count) {
    const button = document.getElementById(buttonId);
    if (!button) return;

    let badge = button.querySelector('.badge');

    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'badge';
        button.appendChild(badge);
      }
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = 'flex';
    } else if (badge) {
      badge.style.display = 'none';
    }
  }

  /**
   * Detach a panel
   */
  detachPanel(panelKey) {
    const detachable = this.detachablePanels.get(panelKey);
    if (detachable) {
      detachable.detach();
    }
  }

  /**
   * Save state to localStorage
   */
  _saveState() {
    try {
      const state = {
        activePanel: this.activePanel,
        isCollapsed: this.isCollapsed
      };
      localStorage.setItem('moonai_sidebar_state', JSON.stringify(state));
    } catch (e) {
      console.error('[SidebarController] Save state error:', e);
    }
  }

  /**
   * Load state from localStorage
   */
  _loadState() {
    try {
      const saved = localStorage.getItem('moonai_sidebar_state');
      if (saved) {
        const state = JSON.parse(saved);

        if (state.isCollapsed) {
          this.collapse({ animate: false });
        }

        if (state.activePanel && this.panels.has(state.activePanel)) {
          this.showPanel(state.activePanel, { animate: false });
        }
      }
    } catch (e) {
      console.error('[SidebarController] Load state error:', e);
    }
  }

  /**
   * Get current state
   */
  getState() {
    return {
      activePanel: this.activePanel,
      isCollapsed: this.isCollapsed,
      panels: Array.from(this.panels.entries()).map(([key, panel]) => ({
        key,
        isVisible: panel.isVisible
      }))
    };
  }

  /**
   * Destroy the controller
   */
  destroy() {
    if (this.badgeUpdateInterval) {
      clearInterval(this.badgeUpdateInterval);
    }

    this.detachablePanels.forEach(panel => panel.destroy());
    this.detachablePanels.clear();
    this.panels.clear();

    console.log('[SidebarController] Destroyed');
  }
}

// Singleton instance
const sidebarController = new SidebarController();

// Export
export { sidebarController, SidebarController };
export default sidebarController;
