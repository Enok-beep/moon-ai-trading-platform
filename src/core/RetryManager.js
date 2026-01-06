/**
 * RetryManager.js
 * Production-grade retry logic with exponential backoff and jitter
 *
 * Features:
 * - Exponential backoff (1s, 2s, 4s, 8s, ...)
 * - Jitter to prevent thundering herd
 * - Max attempts limit
 * - Retry-able error detection
 * - Event hooks for monitoring
 */

export class RetryManager {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.maxAttempts = options.maxAttempts || 10;
    this.baseDelay = options.baseDelay || 1000; // 1 second
    this.maxDelay = options.maxDelay || 60000; // 1 minute
    this.jitterFactor = options.jitterFactor || 0.2; // ±20%
    this.exponentialBase = options.exponentialBase || 2;

    // Retry-able error codes
    this.retryableErrors = options.retryableErrors || [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EAI_AGAIN',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'EPIPE',
      'ERR_STREAM_DESTROYED'
    ];

    // Retry-able HTTP status codes
    this.retryableStatusCodes = options.retryableStatusCodes || [
      408, // Request Timeout
      429, // Too Many Requests
      500, // Internal Server Error
      502, // Bad Gateway
      503, // Service Unavailable
      504  // Gateway Timeout
    ];

    this.attempt = 0;
    this.listeners = {
      retry: [],
      success: [],
      failure: [],
      exhausted: []
    };
  }

  /**
   * Execute with retry logic
   * @param {Function} fn - Async function to execute
   * @param {Object} context - Context for logging
   */
  async execute(fn, context = {}) {
    this.attempt = 0;

    while (this.attempt < this.maxAttempts) {
      this.attempt++;

      try {
        const result = await fn();
        this._emit('success', { attempt: this.attempt, context });
        return result;

      } catch (error) {
        const isRetryable = this._isRetryable(error);
        const isLastAttempt = this.attempt >= this.maxAttempts;

        if (!isRetryable || isLastAttempt) {
          if (isLastAttempt) {
            this._emit('exhausted', { attempt: this.attempt, error, context });
          }
          throw error;
        }

        const delay = this._calculateDelay();
        this._emit('retry', {
          attempt: this.attempt,
          nextAttempt: this.attempt + 1,
          delay,
          error: error.message,
          context
        });

        console.log(
          `🔄 [${this.name}] Retry ${this.attempt}/${this.maxAttempts} in ${delay}ms - ${error.message}`
        );

        await this._sleep(delay);
      }
    }
  }

  /**
   * Calculate delay with exponential backoff + jitter
   */
  _calculateDelay() {
    // Exponential backoff: baseDelay * 2^attempt
    const exponentialDelay = this.baseDelay * Math.pow(this.exponentialBase, this.attempt - 1);

    // Cap at maxDelay
    const cappedDelay = Math.min(exponentialDelay, this.maxDelay);

    // Add jitter (±jitterFactor)
    const jitterRange = cappedDelay * this.jitterFactor;
    const jitter = (Math.random() * 2 - 1) * jitterRange;

    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Check if error is retryable
   */
  _isRetryable(error) {
    // Check error code
    if (error.code && this.retryableErrors.includes(error.code)) {
      return true;
    }

    // Check HTTP status
    if (error.status && this.retryableStatusCodes.includes(error.status)) {
      return true;
    }

    // Check for common retryable patterns
    const message = error.message?.toLowerCase() || '';
    const retryablePatterns = [
      'timeout',
      'timed out',
      'econnreset',
      'econnrefused',
      'socket hang up',
      'network error',
      'fetch failed',
      'aborted',
      'rate limit',
      'too many requests',
      'temporarily unavailable',
      'service unavailable',
      'bad gateway',
      'gateway timeout'
    ];

    return retryablePatterns.some(pattern => message.includes(pattern));
  }

  /**
   * Sleep utility
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
    return this; // Chainable
  }

  /**
   * Emit event
   */
  _emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try {
          cb({ ...data, manager: this.name });
        } catch (e) {
          console.error('RetryManager listener error:', e);
        }
      });
    }
  }

  /**
   * Reset attempt counter
   */
  reset() {
    this.attempt = 0;
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      name: this.name,
      attempt: this.attempt,
      maxAttempts: this.maxAttempts,
      baseDelay: this.baseDelay,
      maxDelay: this.maxDelay
    };
  }
}

/**
 * Convenience function for one-off retries
 */
export async function retryWithBackoff(fn, options = {}) {
  const manager = new RetryManager(options);
  return manager.execute(fn);
}
