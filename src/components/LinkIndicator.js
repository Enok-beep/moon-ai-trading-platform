/**
 * LinkIndicator.js - Color-Coded Linking Component
 * TradeStation/NinjaTrader/Webull style symbol linking
 *
 * Moon AI Trading Platform v7.0
 */

import { getWindowSync, LINK_COLORS } from '../core/WindowSync.js';

/**
 * Link color configuration with UI details
 */
export const LINK_COLOR_CONFIG = {
  [LINK_COLORS.NONE]: {
    name: 'Unlinked',
    color: '#5a5a6a',
    description: 'Independent - no sync'
  },
  [LINK_COLORS.BLUE]: {
    name: 'Blue Group',
    color: '#2962ff',
    description: 'Sync with blue-linked windows'
  },
  [LINK_COLORS.GREEN]: {
    name: 'Green Group',
    color: '#26a69a',
    description: 'Sync with green-linked windows'
  },
  [LINK_COLORS.ORANGE]: {
    name: 'Orange Group',
    color: '#ff9800',
    description: 'Sync with orange-linked windows'
  },
  [LINK_COLORS.PURPLE]: {
    name: 'Purple Group',
    color: '#6c5ce7',
    description: 'Sync with purple-linked windows'
  },
  [LINK_COLORS.MASTER]: {
    name: 'Master',
    color: '#ffffff',
    description: 'Receives all broadcasts'
  }
};

/**
 * LinkIndicator - Visual component for link color selection
 */
export class LinkIndicator {
  constructor(container, options = {}) {
    this.container = typeof container === 'string'
      ? document.querySelector(container)
      : container;

    if (!this.container) {
      throw new Error('LinkIndicator: Container not found');
    }

    this.options = {
      size: options.size || 'md', // sm, md, lg
      showLabel: options.showLabel !== false,
      showDropdown: options.showDropdown !== false,
      initialColor: options.initialColor || LINK_COLORS.BLUE,
      onChange: options.onChange || null
    };

    this.currentColor = this.options.initialColor;
    this.syncManager = getWindowSync();
    this.element = null;
    this.isOpen = false;

    this._init();
  }

  /**
   * Initialize the component
   */
  _init() {
    this.element = document.createElement('div');
    this.element.className = `link-indicator link-indicator-${this.options.size}`;
    this.element.setAttribute('data-color', this.currentColor);

    this._render();
    this.container.appendChild(this.element);

    this._setupEventListeners();

    // Sync with WindowSync
    this.syncManager.setLinkColor(this.currentColor);
  }

  /**
   * Render the component
   */
  _render() {
    const colorConfig = LINK_COLOR_CONFIG[this.currentColor];

    this.element.innerHTML = `
      <button class="link-indicator-button"
              aria-label="Link color: ${colorConfig.name}"
              aria-haspopup="listbox"
              aria-expanded="${this.isOpen}">
        <span class="link-dot" style="background-color: ${colorConfig.color}"></span>
        ${this.options.showLabel ? `<span class="link-label">${colorConfig.name}</span>` : ''}
        ${this.options.showDropdown ? `
          <svg class="link-chevron" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
          </svg>
        ` : ''}
      </button>
      ${this.options.showDropdown ? this._renderDropdown() : ''}
    `;
  }

  /**
   * Render dropdown menu
   */
  _renderDropdown() {
    const options = Object.entries(LINK_COLOR_CONFIG).map(([value, config]) => `
      <div class="link-dropdown-item ${value === this.currentColor ? 'selected' : ''}"
           data-value="${value}"
           role="option"
           aria-selected="${value === this.currentColor}">
        <span class="link-dot" style="background-color: ${config.color}"></span>
        <span class="link-item-name">${config.name}</span>
        <span class="link-item-desc">${config.description}</span>
      </div>
    `).join('');

    return `
      <div class="link-dropdown ${this.isOpen ? 'open' : ''}" role="listbox">
        ${options}
      </div>
    `;
  }

  /**
   * Setup event listeners
   */
  _setupEventListeners() {
    // Toggle dropdown
    this.element.querySelector('.link-indicator-button').addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleDropdown();
    });

    // Handle dropdown item clicks
    this.element.addEventListener('click', (e) => {
      const item = e.target.closest('.link-dropdown-item');
      if (item) {
        const value = item.dataset.value;
        this.setColor(value);
        this._closeDropdown();
      }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!this.element.contains(e.target)) {
        this._closeDropdown();
      }
    });

    // Keyboard navigation
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._closeDropdown();
      } else if (e.key === 'ArrowDown' && this.isOpen) {
        e.preventDefault();
        this._focusNextItem();
      } else if (e.key === 'ArrowUp' && this.isOpen) {
        e.preventDefault();
        this._focusPrevItem();
      } else if (e.key === 'Enter' && this.isOpen) {
        const focused = this.element.querySelector('.link-dropdown-item:focus');
        if (focused) {
          this.setColor(focused.dataset.value);
          this._closeDropdown();
        }
      }
    });
  }

  /**
   * Toggle dropdown
   */
  _toggleDropdown() {
    this.isOpen = !this.isOpen;
    this._render();

    if (this.isOpen) {
      // Focus first item
      const dropdown = this.element.querySelector('.link-dropdown');
      const firstItem = dropdown?.querySelector('.link-dropdown-item');
      firstItem?.focus();
    }
  }

  /**
   * Close dropdown
   */
  _closeDropdown() {
    if (this.isOpen) {
      this.isOpen = false;
      this._render();
    }
  }

  /**
   * Focus next item in dropdown
   */
  _focusNextItem() {
    const items = Array.from(this.element.querySelectorAll('.link-dropdown-item'));
    const currentIndex = items.findIndex(item => item === document.activeElement);
    const nextIndex = (currentIndex + 1) % items.length;
    items[nextIndex]?.focus();
  }

  /**
   * Focus previous item in dropdown
   */
  _focusPrevItem() {
    const items = Array.from(this.element.querySelectorAll('.link-dropdown-item'));
    const currentIndex = items.findIndex(item => item === document.activeElement);
    const prevIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
    items[prevIndex]?.focus();
  }

  /**
   * Set link color
   */
  setColor(color) {
    if (!LINK_COLOR_CONFIG[color]) {
      console.warn(`LinkIndicator: Invalid color: ${color}`);
      return;
    }

    const previousColor = this.currentColor;
    this.currentColor = color;
    this.element.setAttribute('data-color', color);
    this._render();

    // Update WindowSync
    this.syncManager.setLinkColor(color);

    // Call onChange callback
    if (this.options.onChange) {
      this.options.onChange(color, previousColor);
    }

    console.log(`[LinkIndicator] Color changed: ${previousColor} -> ${color}`);
  }

  /**
   * Get current color
   */
  getColor() {
    return this.currentColor;
  }

  /**
   * Get color config
   */
  getColorConfig() {
    return LINK_COLOR_CONFIG[this.currentColor];
  }

  /**
   * Destroy the component
   */
  destroy() {
    this.element.remove();
  }
}

/**
 * Create link indicator with inline styles (for panels without full CSS)
 */
export function createInlineLinkIndicator(currentColor = LINK_COLORS.BLUE) {
  const config = LINK_COLOR_CONFIG[currentColor];

  const html = `
    <div class="link-indicator-inline" style="
      display: inline-flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
    ">
      <div class="link-dot-inline" style="
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: ${config.color};
        box-shadow: 0 0 4px ${config.color}40;
      "></div>
    </div>
  `;

  return html;
}

/**
 * CSS styles for LinkIndicator
 */
export const LINK_INDICATOR_STYLES = `
  .link-indicator {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .link-indicator-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: transparent;
    border: 1px solid var(--color-border, rgba(255,255,255,0.06));
    border-radius: var(--radius-sm, 4px);
    color: var(--color-text-secondary, rgba(255,255,255,0.6));
    font-size: var(--font-xs, 11px);
    cursor: pointer;
    transition: all 150ms ease;
  }

  .link-indicator-button:hover {
    background: var(--color-surface-hover, #2a2e39);
    border-color: var(--color-border-hover, rgba(255,255,255,0.12));
    color: var(--color-text, rgba(255,255,255,0.9));
  }

  .link-indicator[data-color="none"] .link-indicator-button {
    opacity: 0.6;
  }

  .link-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 6px currentColor;
  }

  .link-label {
    white-space: nowrap;
  }

  .link-chevron {
    transition: transform 150ms ease;
  }

  .link-indicator-button[aria-expanded="true"] .link-chevron {
    transform: rotate(180deg);
  }

  /* Dropdown */
  .link-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: auto;
    margin-top: 4px;
    min-width: 200px;
    background: var(--color-surface, #1e222d);
    border: 1px solid var(--color-border, rgba(255,255,255,0.06));
    border-radius: var(--radius-md, 6px);
    box-shadow: var(--shadow-dropdown, 0 4px 16px rgba(0,0,0,0.4));
    z-index: var(--z-dropdown, 300);
    opacity: 0;
    visibility: hidden;
    transform: translateY(-8px);
    transition: all 150ms ease;
  }

  .link-dropdown.open {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }

  .link-dropdown-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    cursor: pointer;
    transition: background 100ms ease;
    outline: none;
  }

  .link-dropdown-item:hover,
  .link-dropdown-item:focus {
    background: var(--color-surface-hover, #2a2e39);
  }

  .link-dropdown-item.selected {
    background: var(--color-primary-light, rgba(41,98,255,0.2));
  }

  .link-item-name {
    font-weight: 500;
    color: var(--color-text, rgba(255,255,255,0.9));
    font-size: var(--font-sm, 12px);
  }

  .link-item-desc {
    font-size: var(--font-xs, 11px);
    color: var(--color-text-muted, rgba(255,255,255,0.4));
    margin-left: auto;
  }

  /* Size variants */
  .link-indicator-sm .link-indicator-button {
    padding: 2px 6px;
    gap: 4px;
  }

  .link-indicator-sm .link-dot {
    width: 8px;
    height: 8px;
  }

  .link-indicator-lg .link-indicator-button {
    padding: 6px 12px;
    gap: 8px;
  }

  .link-indicator-lg .link-dot {
    width: 12px;
    height: 12px;
  }

  /* Context menu link dots */
  .link-dot-blue { background-color: #2962ff; }
  .link-dot-green { background-color: #26a69a; }
  .link-dot-orange { background-color: #ff9800; }
  .link-dot-purple { background-color: #6c5ce7; }
  .link-dot-none { background-color: #5a5a6a; }
  .link-dot-master { background-color: #ffffff; }
`;

export default LinkIndicator;
