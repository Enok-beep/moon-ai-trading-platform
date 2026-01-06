/**
 * ContextMenu.js
 * TradingView-style context menu for chart controls
 */

export class ContextMenu {
  constructor() {
    this.menu = null;
    this.currentTarget = null;
    this.isVisible = false;
    this.init();
  }

  /**
   * Initialize context menu element
   */
  init() {
    this.menu = document.createElement('div');
    this.menu.id = 'context-menu';
    this.menu.className = 'context-menu';
    this.menu.style.cssText = `
      position: fixed;
      background: #1a1a2e;
      border: 1px solid #2d2d44;
      border-radius: 4px;
      padding: 4px 0;
      min-width: 180px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      z-index: 10000;
      display: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: #d1d4dc;
    `;

    document.body.appendChild(this.menu);

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.menu.contains(e.target)) {
        this.hide();
      }
    });

    // Close menu on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });

    console.log('✓ ContextMenu initialized');
  }

  /**
   * Show context menu at position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {Array} items - Menu items
   * @param {Object} target - Target element or data
   */
  show(x, y, items, target = null) {
    this.currentTarget = target;
    this.menu.innerHTML = '';

    // Build menu items
    items.forEach(item => {
      if (item.type === 'separator') {
        const separator = document.createElement('div');
        separator.style.cssText = `
          height: 1px;
          background: #2d2d44;
          margin: 4px 0;
        `;
        this.menu.appendChild(separator);
      } else {
        const menuItem = this.createMenuItem(item);
        this.menu.appendChild(menuItem);
      }
    });

    // Position menu
    this.menu.style.left = `${x}px`;
    this.menu.style.top = `${y}px`;
    this.menu.style.display = 'block';
    this.isVisible = true;

    // Adjust if menu goes off-screen
    requestAnimationFrame(() => {
      const rect = this.menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        this.menu.style.left = `${window.innerWidth - rect.width - 10}px`;
      }
      if (rect.bottom > window.innerHeight) {
        this.menu.style.top = `${window.innerHeight - rect.height - 10}px`;
      }
    });
  }

  /**
   * Create menu item element
   * @param {Object} item - Item config
   * @returns {HTMLElement}
   */
  createMenuItem(item) {
    const menuItem = document.createElement('div');
    menuItem.className = 'context-menu-item';
    menuItem.style.cssText = `
      padding: 8px 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: background 0.15s;
    `;

    const label = document.createElement('span');
    label.textContent = item.label;
    label.style.flex = '1';
    menuItem.appendChild(label);

    // Add checkmark for checked items
    if (item.checked) {
      const checkmark = document.createElement('span');
      checkmark.textContent = '✓';
      checkmark.style.cssText = `
        margin-left: 12px;
        color: #00b894;
        font-weight: bold;
      `;
      menuItem.appendChild(checkmark);
    }

    // Add submenu indicator
    if (item.submenu) {
      const arrow = document.createElement('span');
      arrow.textContent = '▶';
      arrow.style.cssText = `
        margin-left: 12px;
        font-size: 10px;
        color: #888;
      `;
      menuItem.appendChild(arrow);
    }

    // Disabled state
    if (item.disabled) {
      menuItem.style.opacity = '0.4';
      menuItem.style.cursor = 'not-allowed';
    } else {
      // Hover effect
      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.background = '#2d2d44';
      });
      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.background = 'transparent';
      });

      // Click handler
      menuItem.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.action) {
          item.action(this.currentTarget);
        }
        this.hide();
      });
    }

    return menuItem;
  }

  /**
   * Hide context menu
   */
  hide() {
    this.menu.style.display = 'none';
    this.isVisible = false;
    this.currentTarget = null;
  }

  /**
   * Create standard price scale menu items
   * @param {Object} chart - Chart instance with price scale
   * @returns {Array} Menu items
   */
  static createPriceScaleMenu(chart) {
    return [
      {
        label: 'Auto Scale',
        checked: true,
        action: () => {
          if (chart && chart.chart2d) {
            chart.chart2d.fitContent();
          }
        }
      },
      {
        label: 'Lock Scale',
        checked: false,
        action: () => {
          console.log('Lock scale toggled');
          // Implementation depends on chart API
        }
      },
      { type: 'separator' },
      {
        label: 'Logarithmic',
        checked: false,
        action: () => {
          console.log('Logarithmic scale toggled');
          // Implementation: chart.applyOptions({ priceScale: { mode: 1 } })
        }
      },
      {
        label: 'Percentage',
        checked: false,
        action: () => {
          console.log('Percentage scale toggled');
          // Implementation: chart.applyOptions({ priceScale: { mode: 2 } })
        }
      },
      { type: 'separator' },
      {
        label: 'Reset Scale',
        action: () => {
          if (chart && chart.chart2d) {
            chart.chart2d.fitContent();
          }
        }
      }
    ];
  }

  /**
   * Create time scale menu items
   * @param {Object} chart - Chart instance
   * @returns {Array} Menu items
   */
  static createTimeScaleMenu(chart) {
    return [
      {
        label: 'Fit to Data',
        action: () => {
          if (chart && chart.chart2d) {
            chart.chart2d.fitContent();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Zoom In',
        action: () => {
          console.log('Zoom in');
          // Implementation depends on chart API
        }
      },
      {
        label: 'Zoom Out',
        action: () => {
          console.log('Zoom out');
          // Implementation depends on chart API
        }
      },
      { type: 'separator' },
      {
        label: 'Reset Zoom',
        action: () => {
          if (chart && chart.chart2d) {
            chart.chart2d.fitContent();
          }
        }
      }
    ];
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.menu && this.menu.parentNode) {
      this.menu.parentNode.removeChild(this.menu);
    }
    this.menu = null;
    console.log('✓ ContextMenu destroyed');
  }
}
