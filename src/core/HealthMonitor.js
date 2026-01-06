/**
 * HealthMonitor.js
 * System health monitoring and alerting
 */

import { logger } from './Logger.js';

export class HealthMonitor {
  constructor(options = {}) {
    this.checks = new Map();
    this.interval = options.interval || 30000; // 30s
    this.alertThreshold = options.alertThreshold || 3;
    this.intervalId = null;
    this.status = 'unknown';
    this.lastCheck = null;
    this.consecutiveFailures = {};
    this.listeners = { healthy: [], unhealthy: [], alert: [] };
  }

  /**
   * Register a health check
   */
  register(name, checkFn, options = {}) {
    this.checks.set(name, {
      fn: checkFn,
      critical: options.critical !== false,
      timeout: options.timeout || 5000,
      lastResult: null
    });
    this.consecutiveFailures[name] = 0;
  }

  /**
   * Run all health checks
   */
  async runChecks() {
    const results = {};
    let allHealthy = true;

    for (const [name, check] of this.checks) {
      try {
        const start = Date.now();
        const result = await Promise.race([
          check.fn(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), check.timeout)
          )
        ]);

        results[name] = {
          status: 'healthy',
          duration: Date.now() - start,
          ...result
        };
        this.consecutiveFailures[name] = 0;
        check.lastResult = results[name];

      } catch (error) {
        this.consecutiveFailures[name]++;
        results[name] = {
          status: 'unhealthy',
          error: error.message,
          consecutiveFailures: this.consecutiveFailures[name]
        };
        check.lastResult = results[name];

        if (check.critical) allHealthy = false;

        if (this.consecutiveFailures[name] >= this.alertThreshold) {
          this._emit('alert', { check: name, failures: this.consecutiveFailures[name] });
        }
      }
    }

    this.lastCheck = Date.now();
    const newStatus = allHealthy ? 'healthy' : 'unhealthy';

    if (newStatus !== this.status) {
      this.status = newStatus;
      this._emit(newStatus, { results });
    }

    return { status: this.status, timestamp: this.lastCheck, checks: results };
  }

  /**
   * Start monitoring
   */
  start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.runChecks(), this.interval);
    this.runChecks(); // Initial check
    logger.info('Health monitor started');
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    const checks = {};
    for (const [name, check] of this.checks) {
      checks[name] = check.lastResult || { status: 'unknown' };
    }
    return {
      status: this.status,
      lastCheck: this.lastCheck,
      uptime: process.uptime?.() || (Date.now() - window.performance?.timing?.navigationStart) / 1000,
      checks
    };
  }

  on(event, callback) {
    this.listeners[event]?.push(callback);
    return this;
  }

  _emit(event, data) {
    this.listeners[event]?.forEach(cb => cb(data));
  }
}

// Default instance with common checks
export const healthMonitor = new HealthMonitor();

// Register default checks
healthMonitor.register('memory', async () => {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024)
    };
  }
  return { status: 'browser' };
});

healthMonitor.register('websocket', async () => {
  // Will be set by DataService
  return { connected: false };
}, { critical: true });
