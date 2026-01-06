/**
 * PanelController.js
 * Controls responsive panel collapse/expand behavior
 * TradingView-style magnetic panel system
 *
 * Moon AI Trading Platform v6.5
 */

import { logger } from '../core/Logger.js';

/**
 * Breakpoint definitions
 */
const BREAKPOINTS = {
  desktop: 1400,
  tablet: 1200,
  mobile: 768
};

/**
 * Panel state persistence key
 */
const STORAGE_KEY = 'moonai_panel_state';

/**
 * PanelController - Manages all panel collapse/expand behavior
 */
export class PanelController {
  constructor() {
    // Panel elements
    this.elements = {
      main: null,
      leftPanel: null,
      rightPanel: null,
      leftToggle: null,
      rightToggle: null,
      chartArea: null
    };

    // Panel state
    this.state = {
      leftCollapsed: false,
      rightCollapsed: false,
      isMobile: false,
      isTablet: false,
      leftOpen: false,  // For mobile overlay mode
      rightOpen: false
    };

    // Event listeners for cleanup
    this._resizeHandler = null;
    this._keyboardHandler = null;

    // Animation callbacks
    this._animationCallbacks = [];

    logger.debug('PanelController created');
  }

  /**
   * Initialize the controller
   */
  init() {
    // Find DOM elements
    this.elements.main = document.querySelector('.tv-main, .platform-container');
    this.elements.leftPanel = document.querySelector('.tv-left, .left-sidebar');
    this.elements.rightPanel = document.querySelector('.tv-right, .right-panels');
    this.elements.leftToggle = document.querySelector('.sidebar-toggle, .tv-left-toggle, #sidebar-toggle');
    this.elements.rightToggle = document.querySelector('.panels-toggle, .tv-right-toggle, #panels-toggle');
    this.elements.chartArea = document.querySelector('.tv-chart-container, .chart-area, main');

    if (!this.elements.main) {
      logger.warn('Main container not found for PanelController');
      return false;
    }

    // Load saved state
    this._loadState();

    // Setup event listeners
    this._setupToggleListeners();
    this._setupResizeListener();
    this._setupKeyboardShortcuts();
    this._setupTouchGestures();

    // Initial responsive check
    this._checkBreakpoint();

    // Apply initial state
    this._applyState();

    logger.info('PanelController initialized', this.state);
    return true;
  }

  /**
   * Setup toggle button listeners
   */
  _setupToggleListeners() {
    // Left panel toggle
    if (this.elements.leftToggle) {
      this.elements.leftToggle.addEventListener('click', () => this.toggleLeft());
    }

    // Right panel toggle
    if (this.elements.rightToggle) {
      this.elements.rightToggle.addEventListener('click', () => this.toggleRight());
    }

    // Click outside to close on mobile
    document.addEventListener('click', (e) => {
      if (!this.state.isMobile && !this.state.isTablet) return;

      const clickedLeft = this.elements.leftPanel?.contains(e.target) ||
                          this.elements.leftToggle?.contains(e.target);
      const clickedRight = this.elements.rightPanel?.contains(e.target) ||
                           this.elements.rightToggle?.contains(e.target);

      if (!clickedLeft && this.state.leftOpen) {
        this.closeLeft();
      }
      if (!clickedRight && this.state.rightOpen) {
        this.closeRight();
      }
    });
  }

  /**
   * Setup window resize listener with debounce
   */
  _setupResizeListener() {
    let resizeTimeout;
    this._resizeHandler = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this._checkBreakpoint();
      }, 100);
    };

    window.addEventListener('resize', this._resizeHandler);
  }

  /**
   * Setup keyboard shortcuts
   */
  _setupKeyboardShortcuts() {
    this._keyboardHandler = (e) => {
      // Ctrl+B or Cmd+B = Toggle left panel
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        this.toggleLeft();
      }

      // Ctrl+Shift+B = Toggle right panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        this.toggleRight();
      }

      // Escape = Close panels on mobile
      if (e.key === 'Escape' && (this.state.isMobile || this.state.isTablet)) {
        if (this.state.leftOpen) this.closeLeft();
        if (this.state.rightOpen) this.closeRight();
      }
    };

    document.addEventListener('keydown', this._keyboardHandler);
  }

  /**
   * Setup touch gestures for mobile
   */
  _setupTouchGestures() {
    let touchStartX = 0;
    let touchStartY = 0;
    const swipeThreshold = 50;

    document.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      if (!this.state.isMobile && !this.state.isTablet) return;

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;

      // Only handle horizontal swipes
      if (Math.abs(deltaX) < Math.abs(deltaY)) return;
      if (Math.abs(deltaX) < swipeThreshold) return;

      // Swipe right from left edge → Open left panel
      if (deltaX > 0 && touchStartX < 50 && !this.state.leftOpen) {
        this.openLeft();
      }

      // Swipe left from right edge → Open right panel
      if (deltaX < 0 && touchStartX > window.innerWidth - 50 && !this.state.rightOpen) {
        this.openRight();
      }

      // Swipe left when left panel is open → Close it
      if (deltaX < 0 && this.state.leftOpen) {
        this.closeLeft();
      }

      // Swipe right when right panel is open → Close it
      if (deltaX > 0 && this.state.rightOpen) {
        this.closeRight();
      }
    }, { passive: true });
  }

  /**
   * Check current breakpoint and update state
   */
  _checkBreakpoint() {
    const width = window.innerWidth;
    const wassMobile = this.state.isMobile;
    const wasTablet = this.state.isTablet;

    this.state.isMobile = width < BREAKPOINTS.mobile;
    this.state.isTablet = width >= BREAKPOINTS.mobile && width < BREAKPOINTS.tablet;

    // If switching from desktop to mobile/tablet, close panels
    if ((this.state.isMobile || this.state.isTablet) && !wassMobile && !wasTablet) {
      this.state.leftOpen = false;
      this.state.rightOpen = false;
      this._applyMobileState();
    }

    // If switching to desktop, apply desktop state
    if (!this.state.isMobile && !this.state.isTablet && (wassMobile || wasTablet)) {
      this._applyState();
    }

    logger.debug('Breakpoint checked', {
      width,
      isMobile: this.state.isMobile,
      isTablet: this.state.isTablet
    });
  }

  // ============================================
  // PANEL TOGGLE METHODS
  // ============================================

  /**
   * Toggle left panel
   */
  toggleLeft() {
    if (this.state.isMobile || this.state.isTablet) {
      this.state.leftOpen ? this.closeLeft() : this.openLeft();
    } else {
      this.state.leftCollapsed = !this.state.leftCollapsed;
      this._applyState();
      this._saveState();
    }
  }

  /**
   * Toggle right panel
   */
  toggleRight() {
    if (this.state.isMobile || this.state.isTablet) {
      this.state.rightOpen ? this.closeRight() : this.openRight();
    } else {
      this.state.rightCollapsed = !this.state.rightCollapsed;
      this._applyState();
      this._saveState();
    }
  }

  /**
   * Open left panel (mobile/tablet overlay mode)
   */
  openLeft() {
    this.state.leftOpen = true;
    this.state.rightOpen = false; // Close right panel
    this._applyMobileState();

    logger.debug('Left panel opened');
  }

  /**
   * Close left panel
   */
  closeLeft() {
    this.state.leftOpen = false;
    this._applyMobileState();

    logger.debug('Left panel closed');
  }

  /**
   * Open right panel (mobile/tablet overlay mode)
   */
  openRight() {
    this.state.rightOpen = true;
    this.state.leftOpen = false; // Close left panel
    this._applyMobileState();

    logger.debug('Right panel opened');
  }

  /**
   * Close right panel
   */
  closeRight() {
    this.state.rightOpen = false;
    this._applyMobileState();

    logger.debug('Right panel closed');
  }

  /**
   * Collapse both panels (maximize chart)
   */
  collapseAll() {
    this.state.leftCollapsed = true;
    this.state.rightCollapsed = true;
    this._applyState();
    this._saveState();

    logger.debug('All panels collapsed');
  }

  /**
   * Expand both panels
   */
  expandAll() {
    this.state.leftCollapsed = false;
    this.state.rightCollapsed = false;
    this._applyState();
    this._saveState();

    logger.debug('All panels expanded');
  }

  // ============================================
  // STATE APPLICATION
  // ============================================

  /**
   * Apply desktop state to DOM
   */
  _applyState() {
    if (!this.elements.main) return;

    // Update main container classes
    this.elements.main.classList.toggle('left-collapsed', this.state.leftCollapsed);
    this.elements.main.classList.toggle('right-collapsed', this.state.rightCollapsed);
    this.elements.main.classList.toggle('both-collapsed', this.state.leftCollapsed && this.state.rightCollapsed);

    // Update panel classes
    if (this.elements.leftPanel) {
      this.elements.leftPanel.classList.toggle('collapsed', this.state.leftCollapsed);
    }
    if (this.elements.rightPanel) {
      this.elements.rightPanel.classList.toggle('collapsed', this.state.rightCollapsed);
    }

    // Update toggle button icons
    if (this.elements.leftToggle) {
      const icon = this.elements.leftToggle.querySelector('span');
      if (icon) {
        icon.textContent = this.state.leftCollapsed ? '▶' : '◀';
      }
    }
    if (this.elements.rightToggle) {
      // Check if using widgetbar-hider style (SVG toggle)
      if (this.elements.rightToggle.classList.contains('widgetbar-hider')) {
        // Update tooltip for SVG-style toggle
        const tooltip = this.elements.rightToggle.querySelector('.tv-tooltip');
        if (tooltip) {
          tooltip.textContent = this.state.rightCollapsed ? 'Show panel' : 'Hide panel';
        }
        this.elements.rightToggle.setAttribute('aria-expanded', !this.state.rightCollapsed);
      } else {
        // Legacy span-based toggle
        const icon = this.elements.rightToggle.querySelector('span');
        if (icon) {
          icon.textContent = this.state.rightCollapsed ? '◀' : '▶';
        }
      }
    }

    // Trigger animation callbacks
    this._triggerAnimationCallbacks();

    logger.debug('State applied', this.state);
  }

  /**
   * Apply mobile/tablet overlay state
   */
  _applyMobileState() {
    if (!this.elements.leftPanel || !this.elements.rightPanel) return;

    // Toggle 'open' class for overlay mode
    this.elements.leftPanel.classList.toggle('open', this.state.leftOpen);
    this.elements.rightPanel.classList.toggle('open', this.state.rightOpen);

    // Update body scroll lock
    document.body.classList.toggle('panel-open', this.state.leftOpen || this.state.rightOpen);

    // Update overlay backdrop
    let backdrop = document.querySelector('.panel-backdrop');
    if (this.state.leftOpen || this.state.rightOpen) {
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'panel-backdrop';
        backdrop.addEventListener('click', () => {
          this.closeLeft();
          this.closeRight();
        });
        document.body.appendChild(backdrop);
      }
      backdrop.classList.add('visible');
    } else if (backdrop) {
      backdrop.classList.remove('visible');
    }

    logger.debug('Mobile state applied', {
      leftOpen: this.state.leftOpen,
      rightOpen: this.state.rightOpen
    });
  }

  // ============================================
  // PERSISTENCE
  // ============================================

  /**
   * Save state to localStorage
   */
  _saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        leftCollapsed: this.state.leftCollapsed,
        rightCollapsed: this.state.rightCollapsed
      }));
    } catch (e) {
      logger.error('Failed to save panel state', { error: e.message });
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
        this.state.leftCollapsed = parsed.leftCollapsed || false;
        this.state.rightCollapsed = parsed.rightCollapsed || false;
      }
    } catch (e) {
      logger.error('Failed to load panel state', { error: e.message });
    }
  }

  // ============================================
  // ANIMATION CALLBACKS
  // ============================================

  /**
   * Register callback for animation completion (useful for chart resize)
   */
  onAnimationComplete(callback) {
    this._animationCallbacks.push(callback);
  }

  /**
   * Trigger animation callbacks after transition
   */
  _triggerAnimationCallbacks() {
    // Wait for CSS transition to complete (250ms)
    setTimeout(() => {
      this._animationCallbacks.forEach(cb => {
        try { cb(this.state); }
        catch (e) { logger.error('Animation callback error', { error: e.message }); }
      });
    }, 250);
  }

  // ============================================
  // STATUS
  // ============================================

  /**
   * Get current panel state
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Check if left panel is visible
   */
  isLeftVisible() {
    if (this.state.isMobile || this.state.isTablet) {
      return this.state.leftOpen;
    }
    return !this.state.leftCollapsed;
  }

  /**
   * Check if right panel is visible
   */
  isRightVisible() {
    if (this.state.isMobile || this.state.isTablet) {
      return this.state.rightOpen;
    }
    return !this.state.rightCollapsed;
  }

  // ============================================
  // CLEANUP
  // ============================================

  /**
   * Destroy controller and cleanup
   */
  destroy() {
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
    }
    if (this._keyboardHandler) {
      document.removeEventListener('keydown', this._keyboardHandler);
    }

    // Remove backdrop if exists
    const backdrop = document.querySelector('.panel-backdrop');
    if (backdrop) {
      backdrop.remove();
    }

    this._animationCallbacks = [];
    logger.debug('PanelController destroyed');
  }
}

// Export singleton instance
export const panelController = new PanelController();
