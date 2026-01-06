/**
 * UniversalSearch.js - AI-Powered Universal Asset Search
 * Natural language queries across all features
 *
 * Moon AI Trading Platform v7.0
 */

import { getWindowSync, SYNC_EVENTS } from '../core/WindowSync.js';
import eventBus from '../core/EventBus.js';

/**
 * Search result types and their configurations
 */
export const SEARCH_RESULT_TYPES = {
  symbol: {
    icon: '📈',
    label: 'Symbol',
    color: '#2962ff',
    action: 'loadChart'
  },
  alert: {
    icon: '🔔',
    label: 'Alert',
    color: '#ff9800',
    action: 'openAlert'
  },
  signal: {
    icon: '⚡',
    label: 'Signal',
    color: '#26a69a',
    action: 'showSignal'
  },
  indicator: {
    icon: '📊',
    label: 'Indicator',
    color: '#6c5ce7',
    action: 'applyIndicator'
  },
  strategy: {
    icon: '🎯',
    label: 'Strategy',
    color: '#00cec9',
    action: 'loadStrategy'
  },
  news: {
    icon: '📰',
    label: 'News',
    color: '#fd79a8',
    action: 'openNews'
  },
  watchlist: {
    icon: '📋',
    label: 'Watchlist',
    color: '#fdcb6e',
    action: 'openWatchlist'
  },
  screener: {
    icon: '🔍',
    label: 'Screener',
    color: '#74b9ff',
    action: 'runScreener'
  }
};

/**
 * Natural language query patterns
 */
const NLP_PATTERNS = [
  {
    pattern: /(?:show|find|get|search)\s+(.+)\s+(?:with|where|having)\s+rsi\s+(?:below|under|<)\s+(\d+)/i,
    type: 'screener',
    builder: (matches) => ({
      query: matches[1],
      filters: [{ indicator: 'RSI', condition: '<', value: parseInt(matches[2]) }]
    })
  },
  {
    pattern: /(?:show|find|get|search)\s+(.+)\s+(?:with|where|having)\s+rsi\s+(?:above|over|>)\s+(\d+)/i,
    type: 'screener',
    builder: (matches) => ({
      query: matches[1],
      filters: [{ indicator: 'RSI', condition: '>', value: parseInt(matches[2]) }]
    })
  },
  {
    pattern: /(?:tech|technology)\s+stocks?\s+(?:with|where|having)\s+(.+)/i,
    type: 'screener',
    builder: (matches) => ({
      sector: 'Technology',
      additionalQuery: matches[1]
    })
  },
  {
    pattern: /(?:crypto|cryptocurrency|bitcoin|eth)\s+(?:above|over)\s+(\d+)\s*(?:day)?\s*(?:sma|ema|ma)/i,
    type: 'screener',
    builder: (matches) => ({
      assetType: 'crypto',
      filters: [{ indicator: 'SMA', period: parseInt(matches[1]), condition: 'above' }]
    })
  },
  {
    pattern: /dividend\s+(?:stocks?|yield(?:ing)?)\s+(?:over|above|>)\s+(\d+(?:\.\d+)?)\s*%?/i,
    type: 'screener',
    builder: (matches) => ({
      filters: [{ metric: 'dividendYield', condition: '>', value: parseFloat(matches[1]) }]
    })
  },
  {
    pattern: /(?:similar\s+to|like)\s+(\w+)/i,
    type: 'related',
    builder: (matches) => ({
      baseSymbol: matches[1].toUpperCase()
    })
  },
  {
    pattern: /(?:alert|notify)\s+(?:me\s+)?(?:when|if)\s+(\w+)\s+(?:crosses?|reaches?|hits?)\s+\$?(\d+(?:\.\d+)?)/i,
    type: 'alert',
    builder: (matches) => ({
      symbol: matches[1].toUpperCase(),
      price: parseFloat(matches[2]),
      condition: 'crosses'
    })
  },
  {
    pattern: /(?:apply|add|use)\s+(\w+)\s+(?:indicator|to\s+chart)/i,
    type: 'indicator',
    builder: (matches) => ({
      indicator: matches[1].toUpperCase()
    })
  }
];

/**
 * Sample data sources for search (would be replaced with real data)
 */
const SAMPLE_SYMBOLS = [
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', type: 'stock' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology', type: 'stock' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology', type: 'stock' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer Cyclical', type: 'stock' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology', type: 'stock' },
  { symbol: 'META', name: 'Meta Platforms Inc.', sector: 'Technology', type: 'stock' },
  { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Consumer Cyclical', type: 'stock' },
  { symbol: 'BTC', name: 'Bitcoin', sector: 'Cryptocurrency', type: 'crypto' },
  { symbol: 'ETH', name: 'Ethereum', sector: 'Cryptocurrency', type: 'crypto' },
  { symbol: 'SOL', name: 'Solana', sector: 'Cryptocurrency', type: 'crypto' }
];

const SAMPLE_INDICATORS = [
  { id: 'rsi', name: 'RSI - Relative Strength Index', category: 'momentum' },
  { id: 'macd', name: 'MACD', category: 'momentum' },
  { id: 'sma', name: 'SMA - Simple Moving Average', category: 'trend' },
  { id: 'ema', name: 'EMA - Exponential Moving Average', category: 'trend' },
  { id: 'bb', name: 'Bollinger Bands', category: 'volatility' }
];

/**
 * UniversalSearch - AI-powered search across all features
 */
class UniversalSearch {
  constructor() {
    this.container = null;
    this.inputElement = null;
    this.resultsElement = null;
    this.isOpen = false;
    this.selectedIndex = -1;
    this.results = [];
    this.searchHistory = [];
    this.windowSync = null;

    // Debounce timer
    this.searchTimer = null;
    this.debounceMs = 150;
  }

  /**
   * Initialize the search component
   */
  init(containerSelector = '#universal-search') {
    this.container = typeof containerSelector === 'string'
      ? document.querySelector(containerSelector)
      : containerSelector;

    if (!this.container) {
      // Create container if not exists
      this.container = this._createContainer();
    }

    this._render();
    this._setupEventListeners();

    // Initialize WindowSync
    this.windowSync = getWindowSync();

    // Load search history
    this._loadHistory();

    console.log('[UniversalSearch] Initialized');
  }

  /**
   * Create the search container
   */
  _createContainer() {
    const container = document.createElement('div');
    container.id = 'universal-search';
    container.className = 'universal-search-container';

    // Insert into header or body
    const header = document.querySelector('.platform-header, .tv-header, header');
    if (header) {
      header.appendChild(container);
    } else {
      document.body.appendChild(container);
    }

    return container;
  }

  /**
   * Render the search component
   */
  _render() {
    this.container.innerHTML = `
      <div class="universal-search">
        <div class="search-input-wrapper">
          <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            class="search-input"
            placeholder="Search symbols, indicators, alerts... (try: 'tech stocks with RSI below 30')"
            autocomplete="off"
            spellcheck="false"
          />
          <div class="search-shortcut">
            <kbd>Ctrl</kbd>
            <kbd>K</kbd>
          </div>
        </div>
        <div class="search-results" style="display: none;">
          <div class="search-results-inner">
            <!-- Results will be rendered here -->
          </div>
        </div>
      </div>
    `;

    this.inputElement = this.container.querySelector('.search-input');
    this.resultsElement = this.container.querySelector('.search-results');

    // Add styles
    this._injectStyles();
  }

  /**
   * Setup event listeners
   */
  _setupEventListeners() {
    // Input events
    this.inputElement.addEventListener('input', (e) => {
      this._onInputChange(e.target.value);
    });

    this.inputElement.addEventListener('focus', () => {
      if (this.inputElement.value || this.searchHistory.length > 0) {
        this._showResults();
      }
    });

    this.inputElement.addEventListener('blur', () => {
      // Delay to allow click on results
      setTimeout(() => this._hideResults(), 200);
    });

    // Keyboard navigation
    this.inputElement.addEventListener('keydown', (e) => {
      this._handleKeydown(e);
    });

    // Global keyboard shortcut (Ctrl/Cmd + K)
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.inputElement.focus();
        this.inputElement.select();
      }

      // Escape to close
      if (e.key === 'Escape' && this.isOpen) {
        this._hideResults();
        this.inputElement.blur();
      }
    });

    // Result clicks
    this.resultsElement.addEventListener('click', (e) => {
      const resultItem = e.target.closest('.search-result-item');
      if (resultItem) {
        const index = parseInt(resultItem.dataset.index);
        this._selectResult(index);
      }
    });
  }

  /**
   * Handle input changes with debounce
   */
  _onInputChange(value) {
    clearTimeout(this.searchTimer);

    if (!value.trim()) {
      this._showHistory();
      return;
    }

    this.searchTimer = setTimeout(() => {
      this._performSearch(value);
    }, this.debounceMs);
  }

  /**
   * Perform the search
   */
  async _performSearch(query) {
    const trimmedQuery = query.trim().toLowerCase();

    // Try NLP patterns first
    const nlpResult = this._parseNaturalLanguage(query);
    if (nlpResult) {
      this.results = [nlpResult];
      this._renderResults();
      this._showResults();
      return;
    }

    // Search across all sources
    const results = [];

    // Search symbols
    const symbolMatches = SAMPLE_SYMBOLS.filter(s =>
      s.symbol.toLowerCase().includes(trimmedQuery) ||
      s.name.toLowerCase().includes(trimmedQuery)
    ).slice(0, 5);

    symbolMatches.forEach(s => {
      results.push({
        type: 'symbol',
        title: s.symbol,
        subtitle: s.name,
        data: s
      });
    });

    // Search indicators
    const indicatorMatches = SAMPLE_INDICATORS.filter(i =>
      i.id.toLowerCase().includes(trimmedQuery) ||
      i.name.toLowerCase().includes(trimmedQuery)
    ).slice(0, 3);

    indicatorMatches.forEach(i => {
      results.push({
        type: 'indicator',
        title: i.name,
        subtitle: i.category,
        data: i
      });
    });

    // Search commands
    if (trimmedQuery.startsWith('/')) {
      results.push({
        type: 'screener',
        title: 'Run Screener',
        subtitle: `Search for: ${query.substring(1)}`,
        data: { query: query.substring(1) }
      });
    }

    this.results = results;
    this._renderResults();
    this._showResults();
  }

  /**
   * Parse natural language queries
   */
  _parseNaturalLanguage(query) {
    for (const pattern of NLP_PATTERNS) {
      const matches = query.match(pattern.pattern);
      if (matches) {
        const parsed = pattern.builder(matches);
        return {
          type: pattern.type,
          title: `AI Search: ${pattern.type}`,
          subtitle: query,
          data: parsed,
          isNLP: true
        };
      }
    }
    return null;
  }

  /**
   * Render search results
   */
  _renderResults() {
    const inner = this.resultsElement.querySelector('.search-results-inner');

    if (this.results.length === 0) {
      inner.innerHTML = `
        <div class="search-no-results">
          <div class="no-results-icon">🔍</div>
          <div class="no-results-text">No results found</div>
          <div class="no-results-hint">Try searching for symbols, indicators, or use natural language</div>
        </div>
      `;
      return;
    }

    inner.innerHTML = this.results.map((result, index) => {
      const config = SEARCH_RESULT_TYPES[result.type] || SEARCH_RESULT_TYPES.symbol;
      const isSelected = index === this.selectedIndex;

      return `
        <div class="search-result-item ${isSelected ? 'selected' : ''} ${result.isNLP ? 'nlp-result' : ''}"
             data-index="${index}"
             data-type="${result.type}">
          <div class="result-icon" style="color: ${config.color}">${config.icon}</div>
          <div class="result-content">
            <div class="result-title">${this._highlight(result.title)}</div>
            <div class="result-subtitle">${result.subtitle || ''}</div>
          </div>
          <div class="result-type" style="background: ${config.color}20; color: ${config.color}">
            ${config.label}
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Highlight matching text
   */
  _highlight(text) {
    const query = this.inputElement.value.trim();
    if (!query) return text;

    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  /**
   * Show search history
   */
  _showHistory() {
    if (this.searchHistory.length === 0) {
      this._hideResults();
      return;
    }

    const inner = this.resultsElement.querySelector('.search-results-inner');
    inner.innerHTML = `
      <div class="search-history-header">Recent Searches</div>
      ${this.searchHistory.slice(0, 5).map((item, index) => `
        <div class="search-result-item history-item" data-index="${index}" data-query="${item.query}">
          <div class="result-icon">🕐</div>
          <div class="result-content">
            <div class="result-title">${item.query}</div>
            <div class="result-subtitle">${item.type || 'Search'}</div>
          </div>
        </div>
      `).join('')}
    `;

    this._showResults();
  }

  /**
   * Handle keyboard navigation
   */
  _handleKeydown(e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.results.length - 1);
        this._renderResults();
        break;

      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
        this._renderResults();
        break;

      case 'Enter':
        e.preventDefault();
        if (this.selectedIndex >= 0) {
          this._selectResult(this.selectedIndex);
        } else if (this.results.length > 0) {
          this._selectResult(0);
        }
        break;

      case 'Tab':
        if (this.results.length > 0) {
          e.preventDefault();
          // Autocomplete with first result
          const first = this.results[0];
          if (first.type === 'symbol') {
            this.inputElement.value = first.title;
          }
        }
        break;
    }
  }

  /**
   * Select a result
   */
  _selectResult(index) {
    const result = this.results[index];
    if (!result) return;

    const config = SEARCH_RESULT_TYPES[result.type];

    // Add to history
    this._addToHistory(this.inputElement.value, result.type);

    // Execute action based on type
    switch (result.type) {
      case 'symbol':
        this._loadChart(result.data.symbol);
        break;

      case 'indicator':
        this._applyIndicator(result.data.id);
        break;

      case 'screener':
        this._runScreener(result.data);
        break;

      case 'alert':
        this._createAlert(result.data);
        break;

      case 'related':
        this._findRelated(result.data.baseSymbol);
        break;

      default:
        console.log(`[UniversalSearch] Action: ${config?.action}`, result.data);
    }

    // Emit event
    eventBus.emit('search:selected', { result, type: result.type });

    // Clear and close
    this.inputElement.value = '';
    this._hideResults();
    this.inputElement.blur();
  }

  /**
   * Load chart for symbol
   */
  _loadChart(symbol) {
    // Broadcast symbol change
    if (this.windowSync) {
      this.windowSync.broadcast(SYNC_EVENTS.SYMBOL_CHANGE, { symbol });
    }

    eventBus.emit(SYNC_EVENTS.SYMBOL_CHANGE, { symbol });
    console.log(`[UniversalSearch] Loading chart for: ${symbol}`);
  }

  /**
   * Apply indicator
   */
  _applyIndicator(indicatorId) {
    eventBus.emit('indicator:apply', { indicatorId });
    console.log(`[UniversalSearch] Applying indicator: ${indicatorId}`);
  }

  /**
   * Run screener
   */
  _runScreener(params) {
    eventBus.emit('screener:run', params);
    console.log(`[UniversalSearch] Running screener:`, params);
  }

  /**
   * Create alert
   */
  _createAlert(params) {
    eventBus.emit('alert:create', params);
    console.log(`[UniversalSearch] Creating alert:`, params);
  }

  /**
   * Find related assets
   */
  _findRelated(baseSymbol) {
    eventBus.emit('search:related', { baseSymbol });
    console.log(`[UniversalSearch] Finding assets related to: ${baseSymbol}`);
  }

  /**
   * Show results dropdown
   */
  _showResults() {
    this.resultsElement.style.display = 'block';
    this.isOpen = true;
    this.selectedIndex = -1;
  }

  /**
   * Hide results dropdown
   */
  _hideResults() {
    this.resultsElement.style.display = 'none';
    this.isOpen = false;
  }

  /**
   * Add to search history
   */
  _addToHistory(query, type) {
    if (!query.trim()) return;

    // Remove duplicates
    this.searchHistory = this.searchHistory.filter(h => h.query !== query);

    // Add to front
    this.searchHistory.unshift({ query, type, timestamp: Date.now() });

    // Keep only last 20
    this.searchHistory = this.searchHistory.slice(0, 20);

    // Save
    this._saveHistory();
  }

  /**
   * Save history to localStorage
   */
  _saveHistory() {
    try {
      localStorage.setItem('moonai_search_history', JSON.stringify(this.searchHistory));
    } catch (e) {
      console.error('[UniversalSearch] Save history error:', e);
    }
  }

  /**
   * Load history from localStorage
   */
  _loadHistory() {
    try {
      const saved = localStorage.getItem('moonai_search_history');
      if (saved) {
        this.searchHistory = JSON.parse(saved);
      }
    } catch (e) {
      console.error('[UniversalSearch] Load history error:', e);
    }
  }

  /**
   * Inject CSS styles
   */
  _injectStyles() {
    if (document.getElementById('universal-search-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'universal-search-styles';
    styles.textContent = `
      .universal-search-container {
        position: relative;
        width: 100%;
        max-width: 500px;
      }

      .universal-search {
        position: relative;
      }

      .search-input-wrapper {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--color-surface, #1e222d);
        border: 1px solid var(--color-border, rgba(255,255,255,0.06));
        border-radius: 6px;
        padding: 8px 12px;
        transition: all 150ms ease;
      }

      .search-input-wrapper:focus-within {
        border-color: var(--color-primary, #2962ff);
        box-shadow: 0 0 0 3px var(--color-primary-light, rgba(41,98,255,0.2));
      }

      .search-icon {
        color: var(--color-text-muted, rgba(255,255,255,0.4));
        flex-shrink: 0;
      }

      .search-input {
        flex: 1;
        background: transparent;
        border: none;
        color: var(--color-text, rgba(255,255,255,0.9));
        font-size: 13px;
        outline: none;
      }

      .search-input::placeholder {
        color: var(--color-text-muted, rgba(255,255,255,0.4));
      }

      .search-shortcut {
        display: flex;
        gap: 4px;
        flex-shrink: 0;
      }

      .search-shortcut kbd {
        background: var(--color-bg, #131722);
        border: 1px solid var(--color-border, rgba(255,255,255,0.06));
        border-radius: 4px;
        padding: 2px 6px;
        font-size: 10px;
        color: var(--color-text-muted, rgba(255,255,255,0.4));
        font-family: inherit;
      }

      .search-results {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        margin-top: 4px;
        background: var(--color-surface, #1e222d);
        border: 1px solid var(--color-border, rgba(255,255,255,0.06));
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        z-index: 1000;
        max-height: 400px;
        overflow-y: auto;
      }

      .search-results-inner {
        padding: 8px;
      }

      .search-result-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 6px;
        cursor: pointer;
        transition: background 100ms ease;
      }

      .search-result-item:hover,
      .search-result-item.selected {
        background: var(--color-surface-hover, #2a2e39);
      }

      .search-result-item.nlp-result {
        background: var(--color-primary-lighter, rgba(41,98,255,0.1));
        border: 1px solid var(--color-primary-light, rgba(41,98,255,0.2));
      }

      .result-icon {
        font-size: 20px;
        width: 28px;
        text-align: center;
        flex-shrink: 0;
      }

      .result-content {
        flex: 1;
        min-width: 0;
      }

      .result-title {
        font-size: 13px;
        font-weight: 500;
        color: var(--color-text, rgba(255,255,255,0.9));
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .result-title mark {
        background: var(--color-warning, #ff9800);
        color: #000;
        padding: 0 2px;
        border-radius: 2px;
      }

      .result-subtitle {
        font-size: 11px;
        color: var(--color-text-muted, rgba(255,255,255,0.4));
        margin-top: 2px;
      }

      .result-type {
        font-size: 10px;
        font-weight: 500;
        padding: 3px 8px;
        border-radius: 4px;
        flex-shrink: 0;
      }

      .search-no-results {
        text-align: center;
        padding: 24px;
      }

      .no-results-icon {
        font-size: 32px;
        margin-bottom: 8px;
      }

      .no-results-text {
        font-size: 14px;
        color: var(--color-text, rgba(255,255,255,0.9));
      }

      .no-results-hint {
        font-size: 12px;
        color: var(--color-text-muted, rgba(255,255,255,0.4));
        margin-top: 4px;
      }

      .search-history-header {
        font-size: 11px;
        font-weight: 600;
        color: var(--color-text-muted, rgba(255,255,255,0.4));
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding: 8px 12px;
      }
    `;

    document.head.appendChild(styles);
  }

  /**
   * Destroy the component
   */
  destroy() {
    if (this.container) {
      this.container.remove();
    }
    const styles = document.getElementById('universal-search-styles');
    if (styles) {
      styles.remove();
    }
  }
}

// Singleton instance
const universalSearch = new UniversalSearch();

// Export
export { universalSearch, UniversalSearch };
export default universalSearch;
