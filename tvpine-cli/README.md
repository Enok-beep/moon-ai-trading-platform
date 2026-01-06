# tvpine-cli

Local Pine Script runner with FREE exchange data. No TradingView account needed.

## Features

- **Free Data**: Bybit, Binance WebSocket & REST APIs (no API keys)
- **1s/1m Live Streaming**: Real-time candle updates
- **Pine Script Parser**: Basic v5/v6 syntax validation
- **Chart Renderer**: PNG candlestick charts
- **Backtester**: Strategy testing with Monte Carlo
- **Indicator Engine**: SMA, EMA, RSI, ATR, MACD, TD Sequential

## Installation

```bash
cd tvpine-cli
npm install
```

## Usage

### Fetch Historical Data
```bash
# Fetch 500 1h candles from Bybit
node src/cli.js --symbol BTCUSDT --timeframe 1h --bars 500 --exchange bybit

# Export to CSV
node src/cli.js --symbol BTCUSDT --timeframe 1h --csv btc_1h.csv
```

### Live Streaming
```bash
# Stream 1m candles
node src/cli.js --symbol BTCUSDT --timeframe 1m --live

# Stream with indicators
node src/cli.js --symbol BTCUSDT --timeframe 1m --live --indicators "sma,rsi"
```

### Run Pine Script
```bash
# Validate syntax
node src/cli.js scripts/test.pine --validate

# Run and generate screenshot
node src/cli.js scripts/test.pine --symbol BTCUSDT --timeframe 1h --screenshot

# Backtest strategy
node src/cli.js scripts/strategy.pine --backtest --monte-carlo 1000
```

### Python Streamer
```bash
# Install Python deps
pip install websocket-client pandas requests

# Stream 1m candles from Bybit
python src/datafeed/streamer.py --symbol BTCUSDT --timeframe 1m --exchange bybit --live

# Fetch historical + stream
python src/datafeed/streamer.py --symbol BTCUSDT --timeframe 1m --bars 1000 --live
```

## Supported Timeframes

| Timeframe | Bybit | Binance |
|-----------|-------|---------|
| 1s        | ✅    | ✅      |
| 1m        | ✅    | ✅      |
| 5m        | ✅    | ✅      |
| 15m       | ✅    | ✅      |
| 1h        | ✅    | ✅      |
| 4h        | ✅    | ✅      |
| 1D        | ✅    | ✅      |

## Available Indicators

- `sma(period)` - Simple Moving Average
- `ema(period)` - Exponential Moving Average
- `rsi(period)` - Relative Strength Index
- `atr(period)` - Average True Range
- `macd(fast, slow, signal)` - MACD
- `bb(period, stdDev)` - Bollinger Bands
- `td` - TD Sequential

## Integration with Moon AI

The tvpine-cli integrates with Moon AI Trading Platform:

```javascript
// In browser console
moonAI.startLiveStream('BTCUSDT', '1m', 'bybit');
moonAI.getTDSequential();
moonAI.calculateIndicator('sma', 20);
moonAI.registerIndicator('myIndicator', (data) => { ... });
```

## License

MIT
