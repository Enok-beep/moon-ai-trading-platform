/**
 * Logger.js
 * Production-grade structured logging system
 *
 * Features:
 * - Log levels (debug, info, warn, error, fatal)
 * - Structured JSON output
 * - Context enrichment
 * - Log rotation hooks
 * - Trade audit trail
 */

export class Logger {
  static LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    FATAL: 4
  };

  static LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
  static LEVEL_COLORS = {
    DEBUG: '#6c757d',
    INFO: '#17a2b8',
    WARN: '#ffc107',
    ERROR: '#dc3545',
    FATAL: '#721c24'
  };

  constructor(options = {}) {
    this.name = options.name || 'MoonAI';
    this.level = Logger.LEVELS[options.level?.toUpperCase()] ?? Logger.LEVELS.INFO;
    this.context = options.context || {};
    this.handlers = options.handlers || [this._consoleHandler.bind(this)];
    this.tradeAuditLog = [];
    this.maxAuditEntries = options.maxAuditEntries || 10000;
  }

  /**
   * Create child logger with additional context
   */
  child(context) {
    return new Logger({
      name: this.name,
      level: Logger.LEVEL_NAMES[this.level],
      context: { ...this.context, ...context },
      handlers: this.handlers
    });
  }

  /**
   * Log methods
   */
  debug(message, data = {}) {
    this._log(Logger.LEVELS.DEBUG, message, data);
  }

  info(message, data = {}) {
    this._log(Logger.LEVELS.INFO, message, data);
  }

  warn(message, data = {}) {
    this._log(Logger.LEVELS.WARN, message, data);
  }

  error(message, data = {}) {
    this._log(Logger.LEVELS.ERROR, message, data);
  }

  fatal(message, data = {}) {
    this._log(Logger.LEVELS.FATAL, message, data);
  }

  /**
   * Trade audit logging (always logged, regardless of level)
   */
  trade(action, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      ...data,
      ...this.context
    };

    this.tradeAuditLog.push(entry);

    // Trim old entries
    if (this.tradeAuditLog.length > this.maxAuditEntries) {
      this.tradeAuditLog = this.tradeAuditLog.slice(-this.maxAuditEntries);
    }

    // Always log trade actions
    this._log(Logger.LEVELS.INFO, `TRADE: ${action}`, data, true);

    return entry;
  }

  /**
   * Signal logging
   */
  signal(type, data = {}) {
    this._log(Logger.LEVELS.INFO, `SIGNAL: ${type}`, {
      signalType: type,
      ...data
    });
  }

  /**
   * Performance logging
   */
  perf(operation, durationMs, data = {}) {
    this._log(Logger.LEVELS.DEBUG, `PERF: ${operation}`, {
      operation,
      durationMs,
      ...data
    });
  }

  /**
   * Core logging method
   */
  _log(level, message, data = {}, force = false) {
    if (!force && level < this.level) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level: Logger.LEVEL_NAMES[level],
      logger: this.name,
      message,
      ...this.context,
      ...data
    };

    // Handle error objects
    if (data.error instanceof Error) {
      entry.error = {
        name: data.error.name,
        message: data.error.message,
        stack: data.error.stack
      };
    }

    // Send to all handlers
    this.handlers.forEach(handler => {
      try {
        handler(entry, level);
      } catch (e) {
        console.error('Logger handler error:', e);
      }
    });
  }

  /**
   * Default console handler with colors
   */
  _consoleHandler(entry, level) {
    const levelName = entry.level;
    const color = Logger.LEVEL_COLORS[levelName];

    // Handle both string and numeric timestamps
    let timestamp;
    if (typeof entry.timestamp === 'string' && entry.timestamp.includes('T')) {
      timestamp = entry.timestamp.split('T')[1].split('.')[0];
    } else if (typeof entry.timestamp === 'number') {
      timestamp = new Date(entry.timestamp).toTimeString().split(' ')[0];
    } else {
      timestamp = new Date().toTimeString().split(' ')[0];
    }

    const prefix = `%c[${timestamp}] [${levelName}]`;
    const style = `color: ${color}; font-weight: bold`;

    // Extract message and data
    const { timestamp: _, level: __, logger, message, ...data } = entry;

    if (Object.keys(data).length > 0) {
      console.log(prefix, style, `[${logger}]`, message, data);
    } else {
      console.log(prefix, style, `[${logger}]`, message);
    }
  }

  /**
   * Add custom log handler
   */
  addHandler(handler) {
    this.handlers.push(handler);
  }

  /**
   * Set log level
   */
  setLevel(level) {
    this.level = Logger.LEVELS[level.toUpperCase()] ?? Logger.LEVELS.INFO;
  }

  /**
   * Get trade audit log
   */
  getTradeAudit(limit = 100) {
    return this.tradeAuditLog.slice(-limit);
  }

  /**
   * Export trade audit to JSON
   */
  exportTradeAudit() {
    return JSON.stringify(this.tradeAuditLog, null, 2);
  }

  /**
   * Clear trade audit log
   */
  clearTradeAudit() {
    this.tradeAuditLog = [];
  }
}

// Global logger instance
export const logger = new Logger({ name: 'MoonAI' });

// Convenience exports
export const log = {
  debug: (msg, data) => logger.debug(msg, data),
  info: (msg, data) => logger.info(msg, data),
  warn: (msg, data) => logger.warn(msg, data),
  error: (msg, data) => logger.error(msg, data),
  fatal: (msg, data) => logger.fatal(msg, data),
  trade: (action, data) => logger.trade(action, data),
  signal: (type, data) => logger.signal(type, data)
};
