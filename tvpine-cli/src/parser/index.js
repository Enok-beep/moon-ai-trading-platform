/**
 * Pine Script Parser
 * Basic Pine Script v5/v6 parser for indicator validation and execution
 */

export class PineParser {
  constructor() {
    this.functions = new Map();
    this.variables = new Map();

    // Register built-in functions
    this._registerBuiltIns();
  }

  /**
   * Validate Pine Script syntax
   */
  validate(code) {
    try {
      // Check for version
      if (!code.includes('//@version=')) {
        return { valid: false, error: 'Missing //@version directive' };
      }

      // Check for indicator/strategy declaration
      if (!code.includes('indicator(') && !code.includes('strategy(')) {
        return { valid: false, error: 'Missing indicator() or strategy() declaration' };
      }

      // Check for balanced braces
      const openBraces = (code.match(/\{/g) || []).length;
      const closeBraces = (code.match(/\}/g) || []).length;
      if (openBraces !== closeBraces) {
        return { valid: false, error: `Unbalanced braces: ${openBraces} open, ${closeBraces} close` };
      }

      // Check for balanced parentheses
      const openParens = (code.match(/\(/g) || []).length;
      const closeParens = (code.match(/\)/g) || []).length;
      if (openParens !== closeParens) {
        return { valid: false, error: `Unbalanced parentheses: ${openParens} open, ${closeParens} close` };
      }

      return { valid: true, error: null };

    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Parse Pine Script to AST
   */
  parse(code) {
    const ast = {
      version: this._extractVersion(code),
      type: code.includes('strategy(') ? 'strategy' : 'indicator',
      title: this._extractTitle(code),
      inputs: this._extractInputs(code),
      variables: [],
      plots: [],
      conditions: []
    };

    // Extract plot statements
    const plotMatches = code.matchAll(/plot\s*\(([^)]+)\)/g);
    for (const match of plotMatches) {
      ast.plots.push({
        type: 'plot',
        expression: match[1].trim()
      });
    }

    // Extract plotshape statements
    const shapeMatches = code.matchAll(/plotshape\s*\(([^)]+)\)/g);
    for (const match of shapeMatches) {
      ast.plots.push({
        type: 'plotshape',
        expression: match[1].trim()
      });
    }

    // Extract line.new statements
    const lineMatches = code.matchAll(/line\.new\s*\(([^)]+)\)/g);
    for (const match of lineMatches) {
      ast.plots.push({
        type: 'line',
        expression: match[1].trim()
      });
    }

    return ast;
  }

  /**
   * Execute Pine Script on data
   */
  execute(code, data) {
    const validation = this.validate(code);
    if (!validation.valid) {
      throw new Error(`Invalid Pine Script: ${validation.error}`);
    }

    const ast = this.parse(code);
    const result = {
      isStrategy: ast.type === 'strategy',
      title: ast.title,
      plots: [],
      signals: [],
      values: new Map()
    };

    // Initialize context
    const ctx = this._createContext(data);

    // Execute for each bar
    for (let i = 0; i < data.length; i++) {
      ctx.bar_index = i;
      ctx.close = data[i].close;
      ctx.open = data[i].open;
      ctx.high = data[i].high;
      ctx.low = data[i].low;
      ctx.volume = data[i].volume;

      // Evaluate plots
      for (const plot of ast.plots) {
        try {
          const value = this._evaluateExpression(plot.expression, ctx, data, i);
          result.plots.push({
            bar: i,
            type: plot.type,
            value: value
          });
        } catch (e) {
          // Skip invalid plots
        }
      }
    }

    return result;
  }

  /**
   * Create execution context
   */
  _createContext(data) {
    return {
      bar_index: 0,
      close: 0,
      open: 0,
      high: 0,
      low: 0,
      volume: 0,
      na: NaN,
      true: true,
      false: false
    };
  }

  /**
   * Evaluate a Pine expression
   */
  _evaluateExpression(expr, ctx, data, index) {
    // Handle ta.sma
    if (expr.includes('ta.sma')) {
      const match = expr.match(/ta\.sma\s*\(\s*(\w+)\s*,\s*(\d+)\s*\)/);
      if (match) {
        const source = match[1];
        const period = parseInt(match[2]);
        return this._sma(data, source, period, index);
      }
    }

    // Handle ta.ema
    if (expr.includes('ta.ema')) {
      const match = expr.match(/ta\.ema\s*\(\s*(\w+)\s*,\s*(\d+)\s*\)/);
      if (match) {
        const source = match[1];
        const period = parseInt(match[2]);
        return this._ema(data, source, period, index);
      }
    }

    // Handle simple variables
    if (ctx[expr] !== undefined) {
      return ctx[expr];
    }

    // Handle numeric literals
    if (!isNaN(parseFloat(expr))) {
      return parseFloat(expr);
    }

    return null;
  }

  /**
   * Calculate SMA
   */
  _sma(data, source, period, index) {
    if (index < period - 1) return null;

    let sum = 0;
    for (let i = index - period + 1; i <= index; i++) {
      sum += data[i][source] || data[i].close;
    }
    return sum / period;
  }

  /**
   * Calculate EMA
   */
  _ema(data, source, period, index) {
    if (index === 0) return data[0][source] || data[0].close;

    const multiplier = 2 / (period + 1);
    const prevEma = this._ema(data, source, period, index - 1);
    const currentValue = data[index][source] || data[index].close;

    return (currentValue - prevEma) * multiplier + prevEma;
  }

  /**
   * Extract version from code
   */
  _extractVersion(code) {
    const match = code.match(/\/\/@version=(\d+)/);
    return match ? parseInt(match[1]) : 5;
  }

  /**
   * Extract title from code
   */
  _extractTitle(code) {
    const match = code.match(/(?:indicator|strategy)\s*\(\s*["']([^"']+)["']/);
    return match ? match[1] : 'Untitled';
  }

  /**
   * Extract inputs from code
   */
  _extractInputs(code) {
    const inputs = [];
    const matches = code.matchAll(/(\w+)\s*=\s*input\s*\(([^)]+)\)/g);

    for (const match of matches) {
      inputs.push({
        name: match[1],
        params: match[2]
      });
    }

    return inputs;
  }

  /**
   * Register built-in functions
   */
  _registerBuiltIns() {
    this.functions.set('ta.sma', (data, source, period) => {
      // Implementation above
    });

    this.functions.set('ta.ema', (data, source, period) => {
      // Implementation above
    });

    this.functions.set('ta.rsi', (data, source, period) => {
      // RSI implementation
    });
  }
}
