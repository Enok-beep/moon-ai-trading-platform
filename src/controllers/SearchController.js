/**
 * SearchController.js
 * Handles symbol search with real-time Bybit API integration
 * Supports auto-complete and symbol selection
 *
 * Moon AI Trading Platform - Week 1 Quick Win
 */

import { logger } from '../core/Logger.js';
import { toast } from '../utils/Toast.js';

export class SearchController {
  constructor(dataService, app) {
    this.dataService = dataService;
    this.app = app;

    this.elements = {
      searchInput: null,
      searchResults: null
    };

    this.searchTimeout = null;
    this.searchDelay = 300; // ms debounce

    // Popular crypto symbols for auto-complete
    this.popularSymbols = [
      { symbol: 'BTCUSDT', name: 'Bitcoin', category: 'Major' },
      { symbol: 'ETHUSDT', name: 'Ethereum', category: 'Major' },
      { symbol: 'BNBUSDT', name: 'Binance Coin', category: 'Major' },
      { symbol: 'SOLUSDT', name: 'Solana', category: 'Major' },
      { symbol: 'XRPUSDT', name: 'Ripple', category: 'Major' },
      { symbol: 'ADAUSDT', name: 'Cardano', category: 'Major' },
      { symbol: 'DOGEUSDT', name: 'Dogecoin', category: 'Meme' },
      { symbol: 'DOTUSDT', name: 'Polkadot', category: 'Major' },
      { symbol: 'MATICUSDT', name: 'Polygon', category: 'Layer 2' },
      { symbol: 'AVAXUSDT', name: 'Avalanche', category: 'Layer 1' },
      { symbol: 'LINKUSDT', name: 'Chainlink', category: 'Oracle' },
      { symbol: 'UNIUSDT', name: 'Uniswap', category: 'DeFi' },
      { symbol: 'ATOMUSDT', name: 'Cosmos', category: 'Layer 1' },
      { symbol: 'LTCUSDT', name: 'Litecoin', category: 'Major' },
      { symbol: 'NEARUSDT', name: 'NEAR Protocol', category: 'Layer 1' },
      { symbol: 'APTUSDT', name: 'Aptos', category: 'Layer 1' },
      { symbol: 'ARBUSDT', name: 'Arbitrum', category: 'Layer 2' },
      { symbol: 'OPUSDT', name: 'Optimism', category: 'Layer 2' },
      { symbol: 'INJUSDT', name: 'Injective', category: 'DeFi' },
      { symbol: 'SUIUSDT', name: 'Sui', category: 'Layer 1' }
    ];

    logger.debug('SearchController created');
  }

  /**
   * Initialize controller
   */
  init() {
    // Find search input (topbar search)
    this.elements.searchInput = document.querySelector('.search-bar input, #search-input, [placeholder*="Search"]');

    if (!this.elements.searchInput) {
      logger.warn('No search input found');
      return false;
    }

    // Create results dropdown if it doesn't exist
    this._createResultsDropdown();

    // Setup event listeners
    this._setupEventListeners();

    logger.info('SearchController initialized');
    return true;
  }

  /**
   * Create results dropdown element
   */
  _createResultsDropdown() {
    // Check if dropdown already exists
    let dropdown = document.getElementById('search-results-dropdown');

    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'search-results-dropdown';
      dropdown.className = 'search-results-dropdown';
      dropdown.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: var(--panel-bg, #1e222d);
        border: 1px solid var(--border-color, #2a2e39);
        border-radius: 8px;
        margin-top: 4px;
        max-height: 400px;
        overflow-y: auto;
        display: none;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      `;

      // Insert after search input
      this.elements.searchInput.parentElement.style.position = 'relative';
      this.elements.searchInput.parentElement.appendChild(dropdown);
    }

    this.elements.searchResults = dropdown;
  }

  /**
   * Setup event listeners
   */
  _setupEventListeners() {
    // Search input typing
    this.elements.searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      this._handleSearch(query);
    });

    // Focus shows popular results
    this.elements.searchInput.addEventListener('focus', (e) => {
      const query = e.target.value.trim();
      if (query.length === 0) {
        this._showPopularSymbols();
      }
    });

    // Click outside closes results
    document.addEventListener('click', (e) => {
      if (!this.elements.searchInput.contains(e.target) &&
          !this.elements.searchResults.contains(e.target)) {
        this._hideResults();
      }
    });

    // Keyboard navigation (Enter, Escape, Arrow keys)
    this.elements.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._hideResults();
        this.elements.searchInput.blur();
      } else if (e.key === 'Enter') {
        const firstResult = this.elements.searchResults.querySelector('.search-result-item');
        if (firstResult) {
          firstResult.click();
        }
      }
    });

    logger.info('Search event listeners setup complete');
  }

  /**
   * Handle search with debouncing
   */
  _handleSearch(query) {
    // Clear existing timeout
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    // Debounce search
    this.searchTimeout = setTimeout(() => {
      if (query.length === 0) {
        this._showPopularSymbols();
      } else {
        this._performSearch(query);
      }
    }, this.searchDelay);
  }

  /**
   * Perform search across popular symbols
   */
  _performSearch(query) {
    const upperQuery = query.toUpperCase();

    // Filter popular symbols by query
    const results = this.popularSymbols.filter(item => {
      const symbolMatch = item.symbol.toUpperCase().includes(upperQuery);
      const nameMatch = item.name.toUpperCase().includes(upperQuery);
      const shortSymbol = item.symbol.replace('USDT', '').toUpperCase();
      const shortMatch = shortSymbol === upperQuery;

      return symbolMatch || nameMatch || shortMatch;
    });

    this._displayResults(results, query);

    logger.debug('Search performed', { query, results: results.length });
  }

  /**
   * Show popular symbols (when no query)
   */
  _showPopularSymbols() {
    const popular = this.popularSymbols.slice(0, 10); // Top 10
    this._displayResults(popular, '', 'Popular Symbols');
  }

  /**
   * Display search results
   */
  _displayResults(results, query, title = null) {
    if (results.length === 0) {
      this.elements.searchResults.innerHTML = `
        <div style="padding: 16px; text-align: center; color: var(--text-muted);">
          No symbols found for "${query}"
        </div>
      `;
      this.elements.searchResults.style.display = 'block';
      return;
    }

    let html = '';

    if (title) {
      html += `
        <div style="padding: 8px 12px; font-size: 11px; color: var(--text-muted);
                    border-bottom: 1px solid var(--border-color); font-weight: 600;">
          ${title}
        </div>
      `;
    }

    results.forEach(item => {
      const shortSymbol = item.symbol.replace('USDT', '');
      html += `
        <div class="search-result-item" data-symbol="${item.symbol}"
             style="padding: 12px; cursor: pointer; display: flex; justify-content: space-between;
                    align-items: center; border-bottom: 1px solid var(--border-color, #2a2e39);
                    transition: background 0.2s;">
          <div>
            <div style="font-weight: 600; color: var(--text-primary, #d1d4dc);">${shortSymbol}</div>
            <div style="font-size: 11px; color: var(--text-muted, #787b86);">${item.name}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 10px; color: var(--text-muted);
                        padding: 2px 6px; background: rgba(108, 92, 231, 0.2);
                        border-radius: 4px; display: inline-block;">
              ${item.category}
            </div>
          </div>
        </div>
      `;
    });

    this.elements.searchResults.innerHTML = html;
    this.elements.searchResults.style.display = 'block';

    // Add click handlers
    this.elements.searchResults.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const symbol = item.dataset.symbol;
        this._selectSymbol(symbol);
      });

      item.addEventListener('mouseenter', () => {
        item.style.background = 'rgba(108, 92, 231, 0.1)';
      });

      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
      });
    });
  }

  /**
   * Hide results dropdown
   */
  _hideResults() {
    if (this.elements.searchResults) {
      this.elements.searchResults.style.display = 'none';
    }
  }

  /**
   * Select symbol and update chart
   */
  async _selectSymbol(symbol) {
    this._hideResults();
    this.elements.searchInput.value = symbol.replace('USDT', '');

    logger.info('Symbol selected from search', { symbol });

    // Call app.setSymbol to update chart
    if (this.app && this.app.setSymbol) {
      try {
        await this.app.setSymbol(symbol);
        toast.success(`Switched to ${symbol}`);
      } catch (error) {
        logger.error('Failed to set symbol from search', { symbol, error: error.message });
        toast.error(`Failed to load ${symbol}`);
      }
    } else {
      logger.error('App.setSymbol not available');
    }
  }

  /**
   * Get current search query
   */
  getQuery() {
    return this.elements.searchInput ? this.elements.searchInput.value.trim() : '';
  }
}
