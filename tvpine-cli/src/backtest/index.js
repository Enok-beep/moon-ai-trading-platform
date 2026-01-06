/**
 * Backtester Module
 * Strategy backtesting with performance metrics
 */

export class Backtester {
  constructor(data, strategyResult) {
    this.data = data;
    this.strategyResult = strategyResult;
    this.trades = [];
    this.equity = [];
  }

  /**
   * Run backtest
   */
  run(monteCarloRuns = 0) {
    const startingCapital = 10000;
    let capital = startingCapital;
    let position = 0;
    let entryPrice = 0;

    // Process signals
    const signals = this.strategyResult.signals || [];

    for (let i = 0; i < this.data.length; i++) {
      const bar = this.data[i];
      const signal = signals.find(s => s.bar === i);

      if (signal) {
        if (signal.type === 'BUY' && position === 0) {
          // Enter long
          position = capital / bar.close;
          entryPrice = bar.close;
          capital = 0;

          this.trades.push({
            type: 'BUY',
            bar: i,
            price: bar.close,
            size: position
          });
        } else if (signal.type === 'SELL' && position > 0) {
          // Exit long
          capital = position * bar.close;
          const pnl = (bar.close - entryPrice) / entryPrice * 100;

          this.trades.push({
            type: 'SELL',
            bar: i,
            price: bar.close,
            size: position,
            pnl: pnl
          });

          position = 0;
          entryPrice = 0;
        }
      }

      // Track equity
      const currentEquity = position > 0 ? position * bar.close : capital;
      this.equity.push({
        bar: i,
        equity: currentEquity
      });
    }

    // Close any open position at end
    if (position > 0) {
      capital = position * this.data[this.data.length - 1].close;
    }

    // Calculate stats
    const stats = this._calculateStats(startingCapital, capital);

    // Monte Carlo simulation
    if (monteCarloRuns > 0) {
      stats.monteCarlo = this._runMonteCarlo(monteCarloRuns);
    }

    return stats;
  }

  /**
   * Calculate performance statistics
   */
  _calculateStats(startingCapital, finalCapital) {
    const returns = this.equity.map((e, i) => {
      if (i === 0) return 0;
      return (e.equity - this.equity[i - 1].equity) / this.equity[i - 1].equity;
    });

    const winningTrades = this.trades.filter(t => t.type === 'SELL' && t.pnl > 0);
    const losingTrades = this.trades.filter(t => t.type === 'SELL' && t.pnl <= 0);

    const totalReturn = (finalCapital - startingCapital) / startingCapital * 100;
    const winRate = this.trades.length > 0 ? winningTrades.length / (winningTrades.length + losingTrades.length) * 100 : 0;

    // Sharpe Ratio (simplified, assuming 0% risk-free rate)
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
    const sharpe = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    // Max Drawdown
    let maxEquity = 0;
    let maxDrawdown = 0;
    for (const e of this.equity) {
      if (e.equity > maxEquity) maxEquity = e.equity;
      const drawdown = (maxEquity - e.equity) / maxEquity * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // Profit Factor
    const grossProfit = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Average trade
    const avgWin = winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length : 0;

    return {
      'Total Return %': totalReturn.toFixed(2),
      'Win Rate %': winRate.toFixed(2),
      'Profit Factor': profitFactor.toFixed(2),
      'Sharpe Ratio': sharpe.toFixed(2),
      'Max Drawdown %': maxDrawdown.toFixed(2),
      'Total Trades': Math.floor(this.trades.length / 2),
      'Winning Trades': winningTrades.length,
      'Losing Trades': losingTrades.length,
      'Avg Win %': avgWin.toFixed(2),
      'Avg Loss %': avgLoss.toFixed(2),
      'Starting Capital': startingCapital,
      'Final Capital': finalCapital.toFixed(2)
    };
  }

  /**
   * Run Monte Carlo simulation
   */
  _runMonteCarlo(runs) {
    const results = [];
    const tradePnLs = this.trades.filter(t => t.pnl !== undefined).map(t => t.pnl);

    if (tradePnLs.length === 0) {
      return { message: 'No trades to simulate' };
    }

    for (let i = 0; i < runs; i++) {
      // Shuffle trade returns
      const shuffled = [...tradePnLs].sort(() => Math.random() - 0.5);

      // Calculate equity curve
      let equity = 10000;
      let maxEquity = equity;
      let maxDrawdown = 0;

      for (const pnl of shuffled) {
        equity *= (1 + pnl / 100);
        if (equity > maxEquity) maxEquity = equity;
        const dd = (maxEquity - equity) / maxEquity * 100;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }

      results.push({
        finalEquity: equity,
        maxDrawdown: maxDrawdown,
        totalReturn: (equity - 10000) / 10000 * 100
      });
    }

    // Calculate percentiles
    results.sort((a, b) => a.totalReturn - b.totalReturn);

    return {
      runs: runs,
      'Median Return %': results[Math.floor(runs / 2)].totalReturn.toFixed(2),
      '5th Percentile %': results[Math.floor(runs * 0.05)].totalReturn.toFixed(2),
      '95th Percentile %': results[Math.floor(runs * 0.95)].totalReturn.toFixed(2),
      'Worst Case %': results[0].totalReturn.toFixed(2),
      'Best Case %': results[runs - 1].totalReturn.toFixed(2),
      'Avg Max Drawdown %': (results.reduce((sum, r) => sum + r.maxDrawdown, 0) / runs).toFixed(2)
    };
  }
}
