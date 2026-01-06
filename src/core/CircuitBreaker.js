/**
 * CircuitBreaker.js
 * Production-grade circuit breaker pattern for fault tolerance
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failure threshold exceeded, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 */

export class CircuitBreaker {
  static STATES = {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN'
  };

  constructor(options = {}) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 30000; // 30s before trying again
    this.monitorInterval = options.monitorInterval || 10000;

    this.state = CircuitBreaker.STATES.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;

    this.listeners = {
      stateChange: [],
      failure: [],
      success: []
    };

    // Start monitoring
    this._startMonitor();
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute(fn) {
    if (this.state === CircuitBreaker.STATES.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new CircuitBreakerOpenError(
          `Circuit breaker ${this.name} is OPEN. Next attempt at ${new Date(this.nextAttemptTime).toISOString()}`
        );
      }
      // Time to try again
      this._transition(CircuitBreaker.STATES.HALF_OPEN);
    }

    try {
      const result = await fn();
      this._recordSuccess();
      return result;
    } catch (error) {
      this._recordFailure(error);
      throw error;
    }
  }

  /**
   * Record a successful call
   */
  _recordSuccess() {
    this.failures = 0;
    this.successes++;

    this._emit('success', { successes: this.successes });

    if (this.state === CircuitBreaker.STATES.HALF_OPEN) {
      if (this.successes >= this.successThreshold) {
        this._transition(CircuitBreaker.STATES.CLOSED);
      }
    }
  }

  /**
   * Record a failed call
   */
  _recordFailure(error) {
    this.failures++;
    this.successes = 0;
    this.lastFailureTime = Date.now();

    this._emit('failure', { failures: this.failures, error });

    if (this.state === CircuitBreaker.STATES.HALF_OPEN) {
      this._transition(CircuitBreaker.STATES.OPEN);
    } else if (this.failures >= this.failureThreshold) {
      this._transition(CircuitBreaker.STATES.OPEN);
    }
  }

  /**
   * Transition to a new state
   */
  _transition(newState) {
    const oldState = this.state;
    this.state = newState;

    if (newState === CircuitBreaker.STATES.OPEN) {
      this.nextAttemptTime = Date.now() + this.timeout;
    } else if (newState === CircuitBreaker.STATES.CLOSED) {
      this.failures = 0;
      this.successes = 0;
      this.nextAttemptTime = null;
    }

    console.log(`🔌 Circuit breaker [${this.name}]: ${oldState} → ${newState}`);
    this._emit('stateChange', { oldState, newState });
  }

  /**
   * Check if circuit is allowing requests
   */
  isAllowed() {
    if (this.state === CircuitBreaker.STATES.CLOSED) return true;
    if (this.state === CircuitBreaker.STATES.HALF_OPEN) return true;
    if (this.state === CircuitBreaker.STATES.OPEN) {
      return Date.now() >= this.nextAttemptTime;
    }
    return false;
  }

  /**
   * Force circuit to open (manual trip)
   */
  trip() {
    this._transition(CircuitBreaker.STATES.OPEN);
  }

  /**
   * Force circuit to close (manual reset)
   */
  reset() {
    this._transition(CircuitBreaker.STATES.CLOSED);
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      isAllowed: this.isAllowed()
    };
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * Emit event
   */
  _emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error('Circuit breaker listener error:', e);
        }
      });
    }
  }

  /**
   * Start health monitor
   */
  _startMonitor() {
    setInterval(() => {
      if (this.state === CircuitBreaker.STATES.OPEN && Date.now() >= this.nextAttemptTime) {
        this._transition(CircuitBreaker.STATES.HALF_OPEN);
      }
    }, this.monitorInterval);
  }
}

/**
 * Custom error for circuit breaker open state
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.isCircuitBreakerError = true;
  }
}
