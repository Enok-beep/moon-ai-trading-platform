/**
 * WidgetbarController.js
 * Controls TradingView-style right widgetbar toolbar
 * Handles panel switching, notification badges, button states,
 * and the widgetbar-hider panel collapse/expand functionality
 *
 * Moon AI Trading Platform v6.5
 */

import { logger } from '../core/Logger.js';

/**
 * Storage key for widget state persistence
 */
const STORAGE_KEY = 'moonai_widgetbar_state';

/**
 * WidgetbarController - Manages the right toolbar widget buttons
 */
export class WidgetbarController {
  constructor() {
    // DOM elements
    this.elements = {
      widgetbar: null,
      hider: null,
      hiderTooltip: null,
      buttons: [],
      panels: {},
      rightPanels: null,
      chartArea: null,
      mainContainer: null,
      executionBar: null
    };

    // State
    this.state = {
      activePanel: 'signals', // Default active panel
      rightPanelCollapsed: false, // Panel visibility state
      notifications: {
        alerts: 1,
        community: 5,
        notifications: 3
      }
    };

    // Event handlers for cleanup
    this._keyboardHandler = null;
    this._resizeHandler = null;

    logger.debug('WidgetbarController created');
  }

  /**
   * Initialize the controller
   */
  init() {
    // Find widgetbar element
    this.elements.widgetbar = document.getElementById('widgetbar');
    if (!this.elements.widgetbar) {
      logger.warn('Widgetbar element not found');
      return false;
    }

    // Find hider element (panels-toggle with widgetbar-hider class)
    this.elements.hider = document.getElementById('panels-toggle');

    // Find all widgetbar buttons
    this.elements.buttons = Array.from(
      this.elements.widgetbar.querySelectorAll('.tv-widgetbar-btn')
    );

    // Find main layout elements
    this.elements.rightPanels = document.querySelector('.right-panels, .tv-right-panel, #right-panels');
    this.elements.chartArea = document.querySelector('.chart-area, main, .tv-chart-container');
    this.elements.mainContainer = document.querySelector('.platform-container, .tv-main');
    this.elements.executionBar = document.querySelector('.execution-bar, .tv-execution-bar');

    // Map panel IDs to DOM elements
    this._mapPanels();

    // Load saved state
    this._loadState();

    // Setup event listeners
    this._setupButtonListeners();
    this._setupHiderListener();
    this._setupKeyboardShortcuts();
    this._setupResizeListener();

    // Apply initial state
    this._applyState();
    this._applyCollapseState();

    logger.info('WidgetbarController initialized', {
      buttons: this.elements.buttons.length,
      activePanel: this.state.activePanel,
      rightPanelCollapsed: this.state.rightPanelCollapsed
    });

    return true;
  }

  /**
   * Map panel IDs to their DOM elements
   */
  _mapPanels() {
    const panelMappings = {
      watchlist: document.querySelector('.left-sidebar, .watchlist'),
      alerts: document.querySelector('#alerts-panel'),
      signals: document.querySelector('#signals-panel'),
      ai: document.querySelector('#ai-panel'),
      portfolio: document.querySelector('#portfolio-panel'),
      screener: document.querySelector('#screener-panel'),
      pine: document.querySelector('#pine-panel'),
      calendar: document.querySelector('#calendar-panel'),
      news: document.querySelector('#news-panel'),
      notifications: document.querySelector('#notifications-panel'),
      settings: document.querySelector('#settings-panel'),
      help: document.querySelector('#help-panel')
    };

    // Filter out null entries
    Object.entries(panelMappings).forEach(([key, value]) => {
      if (value) {
        this.elements.panels[key] = value;
      }
    });

    logger.debug('Panels mapped', Object.keys(this.elements.panels));
  }

  /**
   * Setup button click listeners
   */
  _setupButtonListeners() {
    this.elements.buttons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const panelName = button.dataset.panel;
        if (panelName) {
          this.togglePanel(panelName, button);
        }
      });

      // Add keyboard navigation
      button.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          button.click();
        }
        // Arrow key navigation
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this._focusNextButton(button, 1);
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          this._focusNextButton(button, -1);
        }
      });
    });

    logger.debug('Button listeners setup complete');
  }

  /**
   * Setup hider button click listener
   */
  _setupHiderListener() {
    if (!this.elements.hider) {
      logger.warn('Widgetbar hider element not found');
      return;
    }

    // Click handler
    this.elements.hider.addEventListener('click', () => {
      this.toggleRightPanel();
    });

    // Keyboard handler
    this.elements.hider.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggleRightPanel();
      }
    });

    // Get tooltip element
    this.elements.hiderTooltip = this.elements.hider.querySelector('.tv-tooltip');

    logger.debug('Hider listener setup complete');
  }

  /**
   * Setup keyboard shortcuts
   */
  _setupKeyboardShortcuts() {
    this._keyboardHandler = (e) => {
      // Only handle if not in input fields
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      // Ctrl/Cmd + ] = Toggle right panel
      if ((e.ctrlKey || e.metaKey) && e.key === ']') {
        e.preventDefault();
        this.toggleRightPanel();
      }

      // Number keys 1-9 for quick panel access (when panel is visible)
      if (!this.state.rightPanelCollapsed && e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const index = parseInt(e.key) - 1;
        if (this.elements.buttons[index]) {
          e.preventDefault();
          this.elements.buttons[index].click();
        }
      }
    };

    document.addEventListener('keydown', this._keyboardHandler);
  }

  /**
   * Setup resize listener for responsive behavior
   */
  _setupResizeListener() {
    let resizeTimeout;
    this._resizeHandler = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this._handleResize();
      }, 100);
    };

    window.addEventListener('resize', this._resizeHandler);
  }

  /**
   * Handle window resize
   */
  _handleResize() {
    // Trigger chart resize event for canvas elements
    window.dispatchEvent(new Event('widgetbar:resize'));

    // Emit custom event for chart components
    window.dispatchEvent(new CustomEvent('widgetbar:layoutChange', {
      detail: {
        rightPanelCollapsed: this.state.rightPanelCollapsed,
        windowWidth: window.innerWidth
      }
    }));
  }

  /**
   * Focus next/previous button in the toolbar
   */
  _focusNextButton(currentButton, direction) {
    const currentIndex = this.elements.buttons.indexOf(currentButton);
    const nextIndex = currentIndex + direction;

    if (nextIndex >= 0 && nextIndex < this.elements.buttons.length) {
      this.elements.buttons[nextIndex].focus();
    }
  }

  /**
   * Toggle a panel (activate/deactivate)
   */
  togglePanel(panelName, button) {
    // If panel is collapsed, expand it first
    if (this.state.rightPanelCollapsed) {
      this.expandRightPanel();
    }

    // If clicking the already active panel, deactivate it
    if (this.state.activePanel === panelName) {
      this.state.activePanel = null;
    } else {
      this.state.activePanel = panelName;
    }

    this._applyState();
    this._saveState();

    logger.debug('Panel toggled', { panel: panelName, active: this.state.activePanel === panelName });

    // Emit custom event for other components to listen
    window.dispatchEvent(new CustomEvent('widgetbar:panelChange', {
      detail: { panel: panelName, active: this.state.activePanel === panelName }
    }));
  }

  /**
   * Toggle right panel collapse/expand
   */
  toggleRightPanel() {
    this.state.rightPanelCollapsed = !this.state.rightPanelCollapsed;
    this._applyCollapseState();
    this._saveState();

    logger.debug('Right panel toggled', { collapsed: this.state.rightPanelCollapsed });

    // Trigger resize for chart components
    setTimeout(() => {
      this._handleResize();
    }, 300); // Wait for CSS transition
  }

  /**
   * Expand right panel
   */
  expandRightPanel() {
    if (this.state.rightPanelCollapsed) {
      this.state.rightPanelCollapsed = false;
      this._applyCollapseState();
      this._saveState();
    }
  }

  /**
   * Collapse right panel
   */
  collapseRightPanel() {
    if (!this.state.rightPanelCollapsed) {
      this.state.rightPanelCollapsed = true;
      this._applyCollapseState();
      this._saveState();
    }
  }

  /**
   * Apply collapse state to DOM
   */
  _applyCollapseState() {
    const { hider, rightPanels, chartArea, mainContainer, executionBar, hiderTooltip } = this.elements;
    const { rightPanelCollapsed } = this.state;

    // Update hider button
    if (hider) {
      hider.classList.toggle('collapsed', rightPanelCollapsed);
      hider.setAttribute('aria-expanded', !rightPanelCollapsed);

      // Update tooltip text
      if (hiderTooltip) {
        hiderTooltip.textContent = rightPanelCollapsed ? 'Show panel' : 'Hide panel';
      }
    }

    // Update right panels
    if (rightPanels) {
      rightPanels.classList.toggle('collapsed', rightPanelCollapsed);
      rightPanels.classList.toggle('tv-right-collapsed', rightPanelCollapsed);

      // Also apply display style for immediate effect
      if (rightPanelCollapsed) {
        rightPanels.style.width = '0';
        rightPanels.style.marginRight = '44px'; // Just widgetbar
        rightPanels.style.overflow = 'hidden';
      } else {
        rightPanels.style.width = '';
        rightPanels.style.marginRight = '';
        rightPanels.style.overflow = '';
      }
    }

    // Update main container for grid layout
    if (mainContainer) {
      mainContainer.classList.toggle('panels-collapsed', rightPanelCollapsed);
      mainContainer.classList.toggle('right-panel-collapsed', rightPanelCollapsed);
    }

    // Update chart area
    if (chartArea) {
      chartArea.classList.toggle('right-collapsed', rightPanelCollapsed);
      chartArea.classList.toggle('tv-chart-expanded', rightPanelCollapsed);
    }

    // Update execution bar
    if (executionBar) {
      if (rightPanelCollapsed) {
        executionBar.style.paddingRight = 'calc(20px + 44px)'; // Just widgetbar
      } else {
        executionBar.style.paddingRight = '';
      }
    }

    // Emit custom event
    window.dispatchEvent(new CustomEvent('widgetbar:collapseChange', {
      detail: { collapsed: rightPanelCollapsed }
    }));
  }

  /**
   * Apply current state to DOM
   */
  _applyState() {
    // Update button active states
    this.elements.buttons.forEach(button => {
      const panelName = button.dataset.panel;
      const isActive = panelName === this.state.activePanel;

      // Update classes
      button.classList.toggle('active', isActive);

      // Update aria attributes
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');

      // Update tabindex for accessibility
      button.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    // Update panel visibility
    Object.entries(this.elements.panels).forEach(([panelName, panelEl]) => {
      const isActive = panelName === this.state.activePanel;

      // Add smooth transition for panel visibility
      if (panelEl.classList.contains('tv-widgetbar-panel')) {
        panelEl.classList.toggle('open', isActive);
      }
    });

    // Update notification badges
    this._updateNotificationBadges();
  }

  /**
   * Update notification badges on buttons
   */
  _updateNotificationBadges() {
    Object.entries(this.state.notifications).forEach(([buttonName, count]) => {
      const button = this.elements.buttons.find(b => b.dataset.name === buttonName);
      if (!button) return;

      let badge = button.querySelector('.tv-counter');

      if (count > 0) {
        if (!badge) {
          // Create badge if it doesn't exist
          const counterRow = document.createElement('div');
          counterRow.className = 'tv-counter-row';
          badge = document.createElement('span');
          badge.className = 'tv-counter small color-danger';
          counterRow.appendChild(badge);
          button.appendChild(counterRow);
        }

        // Update badge value
        badge.textContent = count > 99 ? '99+' : count.toString();
        badge.setAttribute('aria-label', `${count} unread`);
      } else if (badge) {
        // Remove badge if count is 0
        badge.parentElement.remove();
      }
    });
  }

  /**
   * Set notification count for a button
   */
  setNotificationCount(buttonName, count) {
    this.state.notifications[buttonName] = Math.max(0, count);
    this._updateNotificationBadges();

    logger.debug('Notification count updated', { button: buttonName, count });
  }

  /**
   * Increment notification count
   */
  incrementNotification(buttonName, amount = 1) {
    const current = this.state.notifications[buttonName] || 0;
    this.setNotificationCount(buttonName, current + amount);
  }

  /**
   * Clear notification count
   */
  clearNotification(buttonName) {
    this.setNotificationCount(buttonName, 0);
  }

  /**
   * Clear all notifications
   */
  clearAllNotifications() {
    Object.keys(this.state.notifications).forEach(key => {
      this.state.notifications[key] = 0;
    });
    this._updateNotificationBadges();

    logger.debug('All notifications cleared');
  }

  /**
   * Save state to localStorage
   */
  _saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        activePanel: this.state.activePanel,
        rightPanelCollapsed: this.state.rightPanelCollapsed
      }));
    } catch (e) {
      logger.error('Failed to save widgetbar state', { error: e.message });
    }
  }

  /**
   * Load state from localStorage
   */
  _loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.activePanel !== undefined) {
          this.state.activePanel = parsed.activePanel;
        }
        if (parsed.rightPanelCollapsed !== undefined) {
          this.state.rightPanelCollapsed = parsed.rightPanelCollapsed;
        }
      }
    } catch (e) {
      logger.error('Failed to load widgetbar state', { error: e.message });
    }
  }

  /**
   * Get current active panel
   */
  getActivePanel() {
    return this.state.activePanel;
  }

  /**
   * Check if right panel is collapsed
   */
  isRightPanelCollapsed() {
    return this.state.rightPanelCollapsed;
  }

  /**
   * Programmatically set active panel
   */
  setActivePanel(panelName) {
    this.state.activePanel = panelName;
    this._applyState();
    this._saveState();

    logger.debug('Active panel set', { panel: panelName });
  }

  /**
   * Get button by name
   */
  getButton(buttonName) {
    return this.elements.buttons.find(b => b.dataset.name === buttonName);
  }

  /**
   * Add custom button to widgetbar
   */
  addButton(config) {
    const { name, icon, tooltip, onClick, position = 'bottom' } = config;

    const button = document.createElement('button');
    button.className = 'tv-widgetbar-btn';
    button.setAttribute('aria-label', tooltip);
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('type', 'button');
    button.dataset.name = name;
    button.dataset.tooltip = tooltip;

    // Add icon (supports SVG string or emoji)
    if (icon.startsWith('<svg')) {
      button.innerHTML = icon;
    } else {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'icon';
      iconSpan.textContent = icon;
      button.appendChild(iconSpan);
    }

    // Add tooltip
    const tooltipEl = document.createElement('span');
    tooltipEl.className = 'tv-tooltip';
    tooltipEl.textContent = tooltip;
    button.appendChild(tooltipEl);

    // Add click handler
    if (onClick) {
      button.addEventListener('click', onClick);
    }

    // Find insertion point
    const toolbar = this.elements.widgetbar.querySelector('.tv-widgetbar-toolbar');
    if (toolbar) {
      if (position === 'top') {
        toolbar.insertBefore(button, toolbar.firstChild);
      } else if (position === 'before-separator') {
        const separator = toolbar.querySelector('.tv-widgetbar-separator');
        if (separator) {
          toolbar.insertBefore(button, separator);
        } else {
          toolbar.appendChild(button);
        }
      } else {
        toolbar.appendChild(button);
      }

      this.elements.buttons.push(button);
      logger.debug('Custom button added', { name });
    }

    return button;
  }

  /**
   * Remove button from widgetbar
   */
  removeButton(buttonName) {
    const button = this.getButton(buttonName);
    if (button) {
      const index = this.elements.buttons.indexOf(button);
      if (index > -1) {
        this.elements.buttons.splice(index, 1);
      }
      button.remove();
      logger.debug('Button removed', { name: buttonName });
      return true;
    }
    return false;
  }

  /**
   * Destroy controller and cleanup
   */
  destroy() {
    if (this._keyboardHandler) {
      document.removeEventListener('keydown', this._keyboardHandler);
    }
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
    }

    this.elements.buttons = [];
    this.elements.panels = {};

    logger.debug('WidgetbarController destroyed');
  }
}

// Export singleton instance
export const widgetbarController = new WidgetbarController();
