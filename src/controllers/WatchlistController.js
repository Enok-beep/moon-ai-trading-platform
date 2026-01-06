/**
 * WatchlistController.js
 * Controls left sidebar watchlist - makes stock items clickable to change chart symbol
 *
 * Moon AI Trading Platform - Quick Win Week 1
 */

import { logger } from '../core/Logger.js';

export class WatchlistController {
  constructor() {
    this.elements = {
      watchlistContainer: null,
      stockItems: []
    };

    this.currentSymbol = null;
    this.app = null; // Reference to main app

    logger.debug('WatchlistController created');
  }

  /**
   * Initialize controller
   * @param {Object} app - Main app reference
   */
  init(app) {
    this.app = app;

    // Find watchlist container
    this.elements.watchlistContainer = document.querySelector('#watchlist-container');

    if (!this.elements.watchlistContainer) {
      logger.warn('Watchlist container not found');
      return false;
    }

    // Find all stock items
    this.elements.stockItems = Array.from(document.querySelectorAll('.stock-item'));

    if (this.elements.stockItems.length === 0) {
      logger.warn('No stock items found in watchlist');
      return false;
    }

    // Setup event listeners
    this._setupEventListeners();

    // Set first item as active by default (visual only, no data fetch)
    if (this.elements.stockItems.length > 0) {
      const firstItem = this.elements.stockItems.find(item => item.classList.contains('active'));
      if (firstItem) {
        const symbol = this._getSymbolFromElement(firstItem);
        if (symbol) {
          this.currentSymbol = symbol;
          logger.debug('Default symbol set', { symbol });
        }
      }
    }

    logger.info('WatchlistController initialized', { itemCount: this.elements.stockItems.length });
    return true;
  }

  /**
   * Setup event listeners on stock items
   */
  _setupEventListeners() {
    console.log('🔧 WatchlistController: Setting up event listeners on', this.elements.stockItems.length, 'items');

    this.elements.stockItems.forEach((item, index) => {
      const symbol = this._getSymbolFromElement(item);
      console.log(`  Item ${index}: ${symbol}`);

      item.addEventListener('click', (e) => {
        console.log('👆 CLICK detected on watchlist item!', symbol);
        const clickedSymbol = this._getSymbolFromElement(item);
        if (clickedSymbol) {
          this.selectSymbol(clickedSymbol, item);
        }
      });

      // Add hover effect
      item.style.cursor = 'pointer';
    });

    console.log('✓ WatchlistController: Event listeners setup complete');
  }

  /**
   * Get symbol from stock item element
   * @param {HTMLElement} element
   * @returns {string|null}
   */
  _getSymbolFromElement(element) {
    // Try data attribute first
    if (element.dataset.symbol) {
      return element.dataset.symbol;
    }

    // Try to extract from stock-symbol class
    const symbolEl = element.querySelector('.stock-symbol');
    if (symbolEl) {
      return symbolEl.textContent.trim();
    }

    return null;
  }

  /**
   * Select symbol and update chart
   * @param {string} symbol
   * @param {HTMLElement} itemElement
   */
  async selectSymbol(symbol, itemElement) {
    console.log('🔵 WatchlistController: selectSymbol called', symbol);

    if (this.currentSymbol === symbol) {
      console.log('⚠️ WatchlistController: Symbol already selected', symbol);
      return; // Already selected
    }

    logger.info('Symbol selected', { symbol });
    console.log('✓ WatchlistController: Processing symbol selection', symbol);

    // Update active state
    this.elements.stockItems.forEach(item => {
      item.classList.remove('active');
    });

    if (itemElement) {
      itemElement.classList.add('active');
    }

    this.currentSymbol = symbol;

    // Update chart via app
    if (this.app && this.app.setSymbol) {
      try {
        await this.app.setSymbol(symbol);
      } catch (error) {
        logger.error('Failed to set symbol', { symbol, error: error.message });
      }
    }

    // Emit custom event for other components
    window.dispatchEvent(new CustomEvent('moonai:symbol-change', {
      detail: { symbol }
    }));
  }

  /**
   * Update price for a symbol in the watchlist
   * @param {string} symbol
   * @param {number} price
   * @param {number} change - Percent change
   */
  updatePrice(symbol, price, change) {
    const item = this.elements.stockItems.find(el =>
      this._getSymbolFromElement(el) === symbol
    );

    if (!item) return;

    // Update price
    const priceEl = item.querySelector('.stock-price');
    if (priceEl) {
      priceEl.textContent = `$${price.toFixed(2)}`;
    }

    // Update change
    const changeEl = item.querySelector('.stock-change');
    if (changeEl) {
      const isPositive = change >= 0;
      changeEl.textContent = `${isPositive ? '+' : ''}${change.toFixed(2)}%`;
      changeEl.classList.remove('positive', 'negative');
      changeEl.classList.add(isPositive ? 'positive' : 'negative');
    }
  }

  /**
   * Get current selected symbol
   * @returns {string|null}
   */
  getCurrentSymbol() {
    return this.currentSymbol;
  }

  /**
   * Cleanup
   */
  destroy() {
    this.elements.stockItems = [];
    logger.debug('WatchlistController destroyed');
  }
}

// Export singleton instance
export const watchlistController = new WatchlistController();
export default watchlistController;
