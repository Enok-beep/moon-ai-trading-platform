/**
 * SignalsController.js
 * Controls the AI Signals Panel - displays, grades, and manages trading signals
 * Integrates with SignalQueue for processing and RiskService for position sizing
 *
 * Moon AI Trading Platform v6.5
 */

import { logger } from '../core/Logger.js';
import { signalQueue } from '../core/SignalQueue.js';
import { riskService } from '../services/RiskService.js';

/**
 * Signal Grade Configuration
 * Grade thresholds based on confidence + confluence
 */
const GRADE_CONFIG = {
  'A+': { min: 0.90, color: '#00d4aa', label: 'Excellent', icon: '⭐' },
  'A':  { min: 0.80, color: '#00c853', label: 'Strong', icon: '✓' },
  'B+': { min: 0.70, color: '#8bc34a', label: 'Good', icon: '↑' },
  'B':  { min: 0.60, color: '#ffc107', label: 'Moderate', icon: '→' },
  'C':  { min: 0.50, color: '#ff9800', label: 'Weak', icon: '↓' },
  'D':  { min: 0.00, color: '#f44336', label: 'Poor', icon: '✗' }
};

/**
 * SignalsController - Manages AI signals display and interaction
 */
export class SignalsController {
  constructor() {
    this.elements = {
      panel: null,
      signalsList: null,
      signalsCount: null,
      filterBtns: null,
      clearBtn: null,
      autoTradeToggle: null
    };

    this.signals = [];
    this.maxSignals = 50; // Keep last 50 signals
    this.currentFilter = 'all'; // all, buy, sell, pending
    this.autoTradeEnabled = false;
    this.autoTradeMinGrade = 'B+'; // Minimum grade for auto-trade

    // Sound notifications
    this.soundEnabled = true;
    this.audioContext = null;

    logger.debug('SignalsController created');
  }

  /**
   * Initialize the controller
   */
  init() {
    // Find DOM elements
    this.elements.panel = document.querySelector('.tv-signals-panel, .signals-panel, #signals-panel');

    if (!this.elements.panel) {
      logger.warn('Signals panel not found');
      return false;
    }

    // Bind sub-elements
    this.elements.signalsList = this.elements.panel.querySelector('.signals-list, .tv-signals-list');
    this.elements.signalsCount = this.elements.panel.querySelector('.signals-count, .panel-header .count');
    this.elements.filterBtns = this.elements.panel.querySelectorAll('.signal-filter-btn, [data-filter]');
    this.elements.clearBtn = this.elements.panel.querySelector('.clear-signals-btn, #clear-signals');
    this.elements.autoTradeToggle = this.elements.panel.querySelector('#auto-trade-toggle, .auto-trade-toggle');

    // Setup event listeners
    this._setupEventListeners();

    // Subscribe to signal queue
    // NOTE: Temporarily disabled - SignalQueue needs EventEmitter implementation
    // this._subscribeToSignalQueue();

    // Initial render
    this.render();

    logger.info('SignalsController initialized');
    return true;
  }

  /**
   * Setup event listeners
   */
  _setupEventListeners() {
    // Filter buttons
    this.elements.filterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const filter = e.target.dataset.filter || e.target.textContent.toLowerCase();
        this.setFilter(filter);
      });
    });

    // Clear button
    if (this.elements.clearBtn) {
      this.elements.clearBtn.addEventListener('click', () => this.clearSignals());
    }

    // Auto-trade toggle
    if (this.elements.autoTradeToggle) {
      this.elements.autoTradeToggle.addEventListener('change', (e) => {
        this.setAutoTrade(e.target.checked);
      });
    }
  }

  /**
   * Subscribe to signal queue events
   */
  _subscribeToSignalQueue() {
    // New signal received
    signalQueue.on('signalAdded', (signal) => {
      this.addSignal(signal);
    });

    // Signal processed
    signalQueue.on('signalProcessed', (result) => {
      this.updateSignalStatus(result.signal.id, 'executed', result);
    });

    // Signal failed
    signalQueue.on('signalFailed', ({ signal, error }) => {
      this.updateSignalStatus(signal.id, 'failed', { error: error.message });
    });
  }

  // ============================================
  // SIGNAL MANAGEMENT
  // ============================================

  /**
   * Add a new signal
   * @param {Object} signal
   */
  addSignal(signal) {
    // Calculate grade if not provided
    if (!signal.grade) {
      signal.grade = this._calculateGrade(signal);
    }

    // Add metadata
    const enrichedSignal = {
      id: signal.id || `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: signal.timestamp || Date.now(),
      status: 'pending',
      ...signal,
      gradeConfig: GRADE_CONFIG[signal.grade] || GRADE_CONFIG['D']
    };

    // Add to beginning of array
    this.signals.unshift(enrichedSignal);

    // Trim to max
    if (this.signals.length > this.maxSignals) {
      this.signals = this.signals.slice(0, this.maxSignals);
    }

    // Play notification sound
    this._playNotificationSound(enrichedSignal.grade);

    // Check auto-trade
    if (this.autoTradeEnabled && this._shouldAutoTrade(enrichedSignal)) {
      this._executeAutoTrade(enrichedSignal);
    }

    // Render
    this.render();

    logger.info('Signal added', enrichedSignal);

    // Emit event
    window.dispatchEvent(new CustomEvent('moonai:signal-added', {
      detail: enrichedSignal
    }));
  }

  /**
   * Calculate signal grade based on confidence and confluence
   * @param {Object} signal
   * @returns {string} Grade (A+, A, B+, B, C, D)
   */
  _calculateGrade(signal) {
    const confidence = signal.confidence || 0.5;
    const confluence = signal.confluence || 1;

    // Weighted score: 70% confidence, 30% confluence bonus
    const confluenceBonus = Math.min(confluence / 5, 1) * 0.3;
    const score = confidence * 0.7 + confluenceBonus;

    // Determine grade
    for (const [grade, config] of Object.entries(GRADE_CONFIG)) {
      if (score >= config.min) {
        return grade;
      }
    }
    return 'D';
  }

  /**
   * Update signal status
   * @param {string} signalId
   * @param {string} status - pending, executed, failed, cancelled
   * @param {Object} result - Additional result data
   */
  updateSignalStatus(signalId, status, result = {}) {
    const signal = this.signals.find(s => s.id === signalId);
    if (signal) {
      signal.status = status;
      signal.result = result;
      signal.completedAt = Date.now();
      this.renderSignalItem(signal);
      logger.debug('Signal status updated', { signalId, status });
    }
  }

  /**
   * Set filter
   * @param {string} filter
   */
  setFilter(filter) {
    this.currentFilter = filter;

    // Update filter button states
    this.elements.filterBtns.forEach(btn => {
      const btnFilter = btn.dataset.filter || btn.textContent.toLowerCase();
      btn.classList.toggle('active', btnFilter === filter);
    });

    this.render();
  }

  /**
   * Clear all signals
   */
  clearSignals() {
    this.signals = [];
    this.render();
    logger.info('Signals cleared');
  }

  /**
   * Get filtered signals
   * @returns {Array}
   */
  getFilteredSignals() {
    if (this.currentFilter === 'all') {
      return this.signals;
    }
    return this.signals.filter(s => {
      if (this.currentFilter === 'buy') return s.type === 'BUY' || s.type === 'LONG';
      if (this.currentFilter === 'sell') return s.type === 'SELL' || s.type === 'SHORT';
      if (this.currentFilter === 'pending') return s.status === 'pending';
      return true;
    });
  }

  // ============================================
  // AUTO-TRADE
  // ============================================

  /**
   * Set auto-trade enabled
   * @param {boolean} enabled
   */
  setAutoTrade(enabled) {
    this.autoTradeEnabled = enabled;

    if (this.elements.autoTradeToggle) {
      this.elements.autoTradeToggle.checked = enabled;
    }

    logger.info('Auto-trade ' + (enabled ? 'enabled' : 'disabled'));
  }

  /**
   * Check if signal qualifies for auto-trade
   * @param {Object} signal
   * @returns {boolean}
   */
  _shouldAutoTrade(signal) {
    const gradeOrder = ['A+', 'A', 'B+', 'B', 'C', 'D'];
    const signalGradeIndex = gradeOrder.indexOf(signal.grade);
    const minGradeIndex = gradeOrder.indexOf(this.autoTradeMinGrade);

    return signalGradeIndex <= minGradeIndex && signal.status === 'pending';
  }

  /**
   * Execute auto-trade for signal
   * @param {Object} signal
   */
  _executeAutoTrade(signal) {
    // Use Kelly for position sizing
    const kelly = riskService.calculateKellyFromHistory();
    let shares = signal.quantity;

    if (!kelly.error && kelly.positionValue > 0) {
      shares = Math.floor(kelly.positionValue / signal.price);
    }

    // Submit to queue
    signalQueue.addSignal({
      ...signal,
      quantity: shares,
      source: 'auto_trade'
    });

    this.updateSignalStatus(signal.id, 'queued');
    logger.info('Auto-trade executed', { signal, shares });
  }

  // ============================================
  // RENDERING
  // ============================================

  /**
   * Full render
   */
  render() {
    this.renderCount();
    this.renderList();
  }

  /**
   * Render signal count
   */
  renderCount() {
    if (this.elements.signalsCount) {
      const pending = this.signals.filter(s => s.status === 'pending').length;
      this.elements.signalsCount.textContent = `${pending} pending`;
    }
  }

  /**
   * Render signals list
   */
  renderList() {
    if (!this.elements.signalsList) return;

    const signals = this.getFilteredSignals();

    // Clear list
    this.elements.signalsList.innerHTML = '';

    if (signals.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'signals-empty';
      empty.innerHTML = `
        <div class="empty-icon">📡</div>
        <p>No signals yet</p>
        <span>AI signals will appear here</span>
      `;
      this.elements.signalsList.appendChild(empty);
      return;
    }

    // Render each signal
    signals.forEach(signal => {
      const item = this._createSignalItem(signal);
      this.elements.signalsList.appendChild(item);
    });
  }

  /**
   * Create signal item element
   * @param {Object} signal
   * @returns {HTMLElement}
   */
  _createSignalItem(signal) {
    const item = document.createElement('div');
    item.className = `signal-item tv-signal-item status-${signal.status}`;
    item.dataset.signalId = signal.id;

    const gradeConfig = signal.gradeConfig || GRADE_CONFIG['D'];
    const isBuy = signal.type === 'BUY' || signal.type === 'LONG';
    const timeAgo = this._formatTimeAgo(signal.timestamp);

    item.innerHTML = `
      <div class="signal-header">
        <span class="signal-grade" style="background: ${gradeConfig.color}">
          ${signal.grade}
        </span>
        <span class="signal-symbol">${signal.symbol}</span>
        <span class="signal-type ${isBuy ? 'buy' : 'sell'}">${signal.type}</span>
      </div>
      <div class="signal-body">
        <div class="signal-price">
          <span class="label">Entry</span>
          <span class="value">$${signal.price?.toFixed(2) || 'N/A'}</span>
        </div>
        ${signal.stopLoss ? `
        <div class="signal-stop">
          <span class="label">Stop</span>
          <span class="value">$${signal.stopLoss.toFixed(2)}</span>
        </div>
        ` : ''}
        ${signal.takeProfit ? `
        <div class="signal-target">
          <span class="label">Target</span>
          <span class="value">$${signal.takeProfit.toFixed(2)}</span>
        </div>
        ` : ''}
      </div>
      <div class="signal-footer">
        <span class="signal-time">${timeAgo}</span>
        <span class="signal-status">${this._getStatusLabel(signal.status)}</span>
      </div>
      <div class="signal-actions">
        ${signal.status === 'pending' ? `
        <button class="signal-action-btn execute" data-action="execute">Execute</button>
        <button class="signal-action-btn dismiss" data-action="dismiss">Dismiss</button>
        ` : ''}
      </div>
    `;

    // Bind action buttons
    const executeBtn = item.querySelector('[data-action="execute"]');
    const dismissBtn = item.querySelector('[data-action="dismiss"]');

    if (executeBtn) {
      executeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._onExecuteSignal(signal);
      });
    }

    if (dismissBtn) {
      dismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._onDismissSignal(signal);
      });
    }

    // Click to expand details
    item.addEventListener('click', () => {
      this._onSignalClick(signal);
    });

    return item;
  }

  /**
   * Re-render single signal item
   * @param {Object} signal
   */
  renderSignalItem(signal) {
    const existing = this.elements.signalsList?.querySelector(`[data-signal-id="${signal.id}"]`);
    if (existing) {
      const newItem = this._createSignalItem(signal);
      existing.replaceWith(newItem);
    }
  }

  /**
   * Get status label
   * @param {string} status
   * @returns {string}
   */
  _getStatusLabel(status) {
    const labels = {
      pending: '⏳ Pending',
      queued: '📤 Queued',
      executed: '✅ Executed',
      failed: '❌ Failed',
      cancelled: '🚫 Cancelled'
    };
    return labels[status] || status;
  }

  /**
   * Format time ago
   * @param {number} timestamp
   * @returns {string}
   */
  _formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  // ============================================
  // ACTIONS
  // ============================================

  /**
   * Handle execute signal
   * @param {Object} signal
   */
  _onExecuteSignal(signal) {
    // Submit to queue for execution
    signalQueue.addSignal({
      ...signal,
      source: 'manual_execute'
    });

    this.updateSignalStatus(signal.id, 'queued');

    logger.info('Signal execution requested', signal);
  }

  /**
   * Handle dismiss signal
   * @param {Object} signal
   */
  _onDismissSignal(signal) {
    this.updateSignalStatus(signal.id, 'cancelled');
    logger.info('Signal dismissed', signal);
  }

  /**
   * Handle signal click
   * @param {Object} signal
   */
  _onSignalClick(signal) {
    // Emit event for external handling (e.g., show details modal)
    window.dispatchEvent(new CustomEvent('moonai:signal-click', {
      detail: signal
    }));
  }

  // ============================================
  // NOTIFICATIONS
  // ============================================

  /**
   * Play notification sound based on grade
   * @param {string} grade
   */
  _playNotificationSound(grade) {
    if (!this.soundEnabled) return;

    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // Different tones for different grades
      const frequencies = {
        'A+': 880, // High A
        'A': 784,  // G
        'B+': 698, // F
        'B': 587,  // D
        'C': 523,  // C
        'D': 440   // A
      };

      oscillator.frequency.value = frequencies[grade] || 523;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.3);

    } catch (e) {
      // Audio not supported or blocked
      logger.debug('Audio notification failed', { error: e.message });
    }
  }

  /**
   * Set sound enabled
   * @param {boolean} enabled
   */
  setSoundEnabled(enabled) {
    this.soundEnabled = enabled;
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Add demo signals for testing
   */
  addDemoSignals() {
    const demoSignals = [
      {
        type: 'BUY',
        symbol: 'NVDA',
        price: 435.20,
        stopLoss: 420.00,
        takeProfit: 460.00,
        confidence: 0.92,
        confluence: 4,
        source: 'AI_SCANNER'
      },
      {
        type: 'SELL',
        symbol: 'TSLA',
        price: 194.05,
        stopLoss: 205.00,
        takeProfit: 175.00,
        confidence: 0.78,
        confluence: 3,
        source: 'AI_SCANNER'
      },
      {
        type: 'BUY',
        symbol: 'MSFT',
        price: 312.79,
        stopLoss: 305.00,
        takeProfit: 330.00,
        confidence: 0.85,
        confluence: 5,
        source: 'PATTERN_DETECTOR'
      },
      {
        type: 'BUY',
        symbol: 'AAPL',
        price: 178.50,
        stopLoss: 172.00,
        takeProfit: 190.00,
        confidence: 0.65,
        confluence: 2,
        source: 'MOMENTUM'
      }
    ];

    demoSignals.forEach((signal, i) => {
      setTimeout(() => {
        this.addSignal({
          ...signal,
          timestamp: Date.now() - (i * 60000) // Stagger timestamps
        });
      }, i * 200);
    });

    logger.info('Demo signals added');
  }

  /**
   * Get signals summary
   * @returns {Object}
   */
  getSummary() {
    const pending = this.signals.filter(s => s.status === 'pending');
    const executed = this.signals.filter(s => s.status === 'executed');
    const buySignals = this.signals.filter(s => s.type === 'BUY' || s.type === 'LONG');
    const sellSignals = this.signals.filter(s => s.type === 'SELL' || s.type === 'SHORT');

    return {
      total: this.signals.length,
      pending: pending.length,
      executed: executed.length,
      buySignals: buySignals.length,
      sellSignals: sellSignals.length,
      avgGrade: this._calculateAvgGrade()
    };
  }

  /**
   * Calculate average grade
   * @returns {string}
   */
  _calculateAvgGrade() {
    if (this.signals.length === 0) return 'N/A';

    const gradeValues = { 'A+': 6, 'A': 5, 'B+': 4, 'B': 3, 'C': 2, 'D': 1 };
    const total = this.signals.reduce((sum, s) => sum + (gradeValues[s.grade] || 1), 0);
    const avg = total / this.signals.length;

    if (avg >= 5.5) return 'A+';
    if (avg >= 4.5) return 'A';
    if (avg >= 3.5) return 'B+';
    if (avg >= 2.5) return 'B';
    if (avg >= 1.5) return 'C';
    return 'D';
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.audioContext) {
      this.audioContext.close();
    }
    logger.debug('SignalsController destroyed');
  }
}

// Export singleton instance
export const signalsController = new SignalsController();
