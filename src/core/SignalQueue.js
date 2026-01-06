/**
 * SignalQueue.js
 * Reliable signal processing queue for trade execution
 *
 * Features:
 * - FIFO queue with priority support
 * - Signal deduplication
 * - Expiry handling
 * - Persistence (localStorage)
 * - Processing rate limiting
 * - Dead letter queue for failed signals
 */

import { logger } from './Logger.js';

export class SignalQueue {
  constructor(options = {}) {
    this.name = options.name || 'signals';
    this.maxSize = options.maxSize || 1000;
    this.defaultTTL = options.defaultTTL || 60000; // 1 minute
    this.processingInterval = options.processingInterval || 100; // 100ms
    this.maxRetries = options.maxRetries || 3;
    this.persist = options.persist !== false;

    this.queue = [];
    this.deadLetterQueue = [];
    this.processing = false;
    this.paused = false;
    this.processor = null;
    this.intervalId = null;

    this.stats = {
      enqueued: 0,
      processed: 0,
      failed: 0,
      expired: 0,
      deduplicated: 0
    };

    // Load from persistence
    if (this.persist) {
      this._loadFromStorage();
    }
  }

  /**
   * Enqueue a signal
   * @param {Object} signal - Signal data
   * @param {Object} options - { priority, ttl, dedupeKey }
   */
  enqueue(signal, options = {}) {
    const entry = {
      id: this._generateId(),
      signal,
      priority: options.priority || 0, // Higher = more urgent
      createdAt: Date.now(),
      expiresAt: Date.now() + (options.ttl || this.defaultTTL),
      dedupeKey: options.dedupeKey || null,
      retries: 0,
      status: 'pending'
    };

    // Deduplication check
    if (entry.dedupeKey) {
      const exists = this.queue.some(
        e => e.dedupeKey === entry.dedupeKey && e.status === 'pending'
      );
      if (exists) {
        this.stats.deduplicated++;
        logger.debug('Signal deduplicated', { dedupeKey: entry.dedupeKey });
        return null;
      }
    }

    // Check queue size
    if (this.queue.length >= this.maxSize) {
      // Remove oldest low-priority expired items
      this._cleanExpired();

      if (this.queue.length >= this.maxSize) {
        logger.warn('Signal queue full, dropping oldest', { queueSize: this.queue.length });
        this.queue.shift();
      }
    }

    // Insert by priority (higher priority = earlier in queue)
    const insertIndex = this.queue.findIndex(e => e.priority < entry.priority);
    if (insertIndex === -1) {
      this.queue.push(entry);
    } else {
      this.queue.splice(insertIndex, 0, entry);
    }

    this.stats.enqueued++;
    logger.signal('ENQUEUED', {
      signalId: entry.id,
      type: signal.type,
      priority: entry.priority,
      queueSize: this.queue.length
    });

    this._saveToStorage();
    return entry.id;
  }

  /**
   * Set the signal processor function
   * @param {Function} processor - async (signal) => result
   */
  setProcessor(processor) {
    this.processor = processor;
  }

  /**
   * Start processing queue
   */
  start() {
    if (this.intervalId) return;

    this.processing = true;
    this.intervalId = setInterval(() => {
      this._processNext();
    }, this.processingInterval);

    logger.info('Signal queue started', { name: this.name });
  }

  /**
   * Stop processing
   */
  stop() {
    this.processing = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    logger.info('Signal queue stopped', { name: this.name });
  }

  /**
   * Pause processing (keeps queue)
   */
  pause() {
    this.paused = true;
    logger.info('Signal queue paused');
  }

  /**
   * Resume processing
   */
  resume() {
    this.paused = false;
    logger.info('Signal queue resumed');
  }

  /**
   * Process next signal in queue
   */
  async _processNext() {
    if (this.paused || !this.processor) return;

    // Clean expired signals first
    this._cleanExpired();

    // Find next pending signal
    const entry = this.queue.find(e => e.status === 'pending');
    if (!entry) return;

    entry.status = 'processing';

    try {
      const result = await this.processor(entry.signal);

      entry.status = 'completed';
      entry.result = result;
      entry.completedAt = Date.now();

      this.stats.processed++;
      logger.signal('PROCESSED', {
        signalId: entry.id,
        type: entry.signal.type,
        duration: entry.completedAt - entry.createdAt
      });

      // Remove completed entry
      this.queue = this.queue.filter(e => e.id !== entry.id);

    } catch (error) {
      entry.retries++;
      entry.lastError = error.message;

      if (entry.retries >= this.maxRetries) {
        entry.status = 'failed';
        this.stats.failed++;

        // Move to dead letter queue
        this.deadLetterQueue.push(entry);
        this.queue = this.queue.filter(e => e.id !== entry.id);

        logger.error('Signal processing failed permanently', {
          signalId: entry.id,
          type: entry.signal.type,
          retries: entry.retries,
          error: error.message
        });
      } else {
        entry.status = 'pending'; // Retry
        logger.warn('Signal processing failed, will retry', {
          signalId: entry.id,
          retries: entry.retries,
          maxRetries: this.maxRetries,
          error: error.message
        });
      }
    }

    this._saveToStorage();
  }

  /**
   * Remove expired signals
   */
  _cleanExpired() {
    const now = Date.now();
    const expired = this.queue.filter(e => e.expiresAt < now && e.status === 'pending');

    expired.forEach(e => {
      e.status = 'expired';
      this.stats.expired++;
      logger.debug('Signal expired', { signalId: e.id, type: e.signal.type });
    });

    this.queue = this.queue.filter(e => e.status !== 'expired');
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      name: this.name,
      size: this.queue.length,
      pending: this.queue.filter(e => e.status === 'pending').length,
      processing: this.queue.filter(e => e.status === 'processing').length,
      deadLetterSize: this.deadLetterQueue.length,
      paused: this.paused,
      processing: this.processing,
      stats: { ...this.stats }
    };
  }

  /**
   * Get dead letter queue entries
   */
  getDeadLetters(limit = 100) {
    return this.deadLetterQueue.slice(-limit);
  }

  /**
   * Retry a dead letter entry
   */
  retryDeadLetter(id) {
    const entry = this.deadLetterQueue.find(e => e.id === id);
    if (!entry) return false;

    entry.status = 'pending';
    entry.retries = 0;
    this.queue.push(entry);
    this.deadLetterQueue = this.deadLetterQueue.filter(e => e.id !== id);

    logger.info('Dead letter signal requeued', { signalId: id });
    return true;
  }

  /**
   * Clear the queue
   */
  clear() {
    this.queue = [];
    this._saveToStorage();
    logger.info('Signal queue cleared');
  }

  /**
   * Generate unique ID
   */
  _generateId() {
    return `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save to localStorage
   */
  _saveToStorage() {
    if (!this.persist || typeof localStorage === 'undefined') return;

    try {
      localStorage.setItem(`signalQueue_${this.name}`, JSON.stringify({
        queue: this.queue,
        deadLetterQueue: this.deadLetterQueue,
        stats: this.stats
      }));
    } catch (e) {
      // Storage might be full or unavailable
    }
  }

  /**
   * Load from localStorage
   */
  _loadFromStorage() {
    if (typeof localStorage === 'undefined') return;

    try {
      const data = localStorage.getItem(`signalQueue_${this.name}`);
      if (data) {
        const parsed = JSON.parse(data);
        this.queue = parsed.queue || [];
        this.deadLetterQueue = parsed.deadLetterQueue || [];
        this.stats = { ...this.stats, ...parsed.stats };
        logger.info('Signal queue loaded from storage', { size: this.queue.length });
      }
    } catch (e) {
      // Invalid data, start fresh
    }
  }
}

// Default signal queue instance
export const signalQueue = new SignalQueue({ name: 'default' });
