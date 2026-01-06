#!/usr/bin/env node
/**
 * tvpine-cli - Local Pine Script Runner
 *
 * Run Pine Script indicators/strategies locally with free exchange data.
 * No TradingView account needed.
 *
 * Usage:
 *   tvpine script.pine --symbol BTCUSDT --timeframe 1h
 *   tvpine script.pine --backtest --monte-carlo 1000
 *   tvpine --live --symbol BTCUSDT --timeframe 1m
 */

import { Command } from 'commander';
import { DataFeed } from './datafeed/index.js';
import { PineParser } from './parser/index.js';
import { ChartRenderer } from './renderer/index.js';
import { Backtester } from './backtest/index.js';
import { IndicatorEngine } from './indicators/index.js';
import fs from 'fs';
import path from 'path';

const program = new Command();

program
  .name('tvpine')
  .description('Local Pine Script runner with free exchange data')
  .version('1.0.0');

program
  .argument('[script]', 'Pine Script file to run')
  .option('-s, --symbol <symbol>', 'Trading symbol', 'BTCUSDT')
  .option('-t, --timeframe <tf>', 'Timeframe (1s, 1m, 5m, 15m, 1h, 4h, 1D)', '1h')
  .option('-e, --exchange <exchange>', 'Exchange (binance, bybit, okx)', 'bybit')
  .option('-n, --bars <number>', 'Number of bars to fetch', '500')
  .option('--screenshot [filename]', 'Generate chart screenshot')
  .option('--csv [filename]', 'Export data to CSV')
  .option('--backtest', 'Run backtest mode')
  .option('--monte-carlo <runs>', 'Monte Carlo simulation runs')
  .option('--live', 'Enable live streaming mode')
  .option('--validate', 'Validate Pine Script syntax only')
  .option('--indicators <list>', 'Comma-separated indicator list')
  .action(async (script, options) => {
    try {
      console.log('🌙 Moon AI tvpine-cli v1.0.0\n');

      // Initialize datafeed
      const datafeed = new DataFeed(options.exchange);

      // Fetch historical data
      console.log(`📊 Fetching ${options.bars} ${options.timeframe} bars for ${options.symbol}...`);
      const data = await datafeed.fetchHistorical(
        options.symbol,
        options.timeframe,
        parseInt(options.bars)
      );
      console.log(`✅ Loaded ${data.length} candles\n`);

      // Export to CSV if requested
      if (options.csv) {
        const csvFile = typeof options.csv === 'string'
          ? options.csv
          : `${options.symbol}_${options.timeframe}.csv`;
        await datafeed.exportCSV(data, csvFile);
        console.log(`💾 Exported to ${csvFile}`);
      }

      // Initialize indicator engine
      const indicators = new IndicatorEngine(data);

      // Run built-in indicators if specified
      if (options.indicators) {
        const indicatorList = options.indicators.split(',');
        for (const ind of indicatorList) {
          const result = indicators.calculate(ind.trim());
          console.log(`📈 ${ind}: ${JSON.stringify(result.slice(-3))}`);
        }
      }

      // Parse and run Pine Script if provided
      if (script) {
        const scriptPath = path.resolve(script);
        if (!fs.existsSync(scriptPath)) {
          console.error(`❌ Script not found: ${scriptPath}`);
          process.exit(1);
        }

        const pineCode = fs.readFileSync(scriptPath, 'utf8');
        const parser = new PineParser();

        if (options.validate) {
          const validation = parser.validate(pineCode);
          console.log(validation.valid ? '✅ Syntax OK' : `❌ ${validation.error}`);
          process.exit(validation.valid ? 0 : 1);
        }

        console.log(`🔧 Running ${path.basename(script)}...`);
        const result = parser.execute(pineCode, data);

        console.log(`📊 Generated ${result.plots.length} plot points`);
        console.log(`📍 Signals: ${result.signals.length}`);

        // Backtest mode
        if (options.backtest && result.isStrategy) {
          const backtester = new Backtester(data, result);
          const stats = backtester.run(options.monteCarlo ? parseInt(options.monteCarlo) : 0);
          console.log('\n📈 Backtest Results:');
          console.table(stats);
        }
      }

      // Generate screenshot if requested
      if (options.screenshot) {
        const renderer = new ChartRenderer();
        const filename = typeof options.screenshot === 'string'
          ? options.screenshot
          : `${options.symbol}_${options.timeframe}_chart.png`;
        await renderer.render(data, filename);
        console.log(`📸 Screenshot saved: ${filename}`);
      }

      // Live streaming mode
      if (options.live) {
        console.log('\n🔴 Starting live stream (Ctrl+C to stop)...');
        await datafeed.streamLive(options.symbol, options.timeframe, (candle) => {
          console.log(`🕐 ${candle.timestamp} | O:${candle.open.toFixed(2)} H:${candle.high.toFixed(2)} L:${candle.low.toFixed(2)} C:${candle.close.toFixed(2)}`);

          // Re-run indicators on new candle
          if (options.indicators) {
            indicators.addCandle(candle);
            const indicatorList = options.indicators.split(',');
            for (const ind of indicatorList) {
              const result = indicators.calculate(ind.trim());
              console.log(`  📈 ${ind}: ${result[result.length - 1]}`);
            }
          }
        });
      }

      console.log('\n✅ Done');

    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
