#!/usr/bin/env python3
"""
Multi-Exchange WebSocket Streamer for tvpine-cli

Streams 1s/1m candles from Bybit, Binance, OKX with historical sync.
Free, no API keys required.

Usage:
    python streamer.py --symbol BTCUSDT --timeframe 1m --exchange bybit
    python streamer.py --timeframe 1s --live
"""

import websocket
import json
import pandas as pd
import requests
import argparse
import threading
import time
import os
from datetime import datetime

class MultiExchangeStreamer:
    """
    Stream live candles from multiple exchanges simultaneously.
    Supports: Bybit, Binance, OKX (all free, no API keys)
    """

    EXCHANGES = {
        'bybit': {
            'ws': 'wss://stream.bybit.com/v5/public/linear',
            'rest': 'https://api.bybit.com/v5/market/kline',
            'intervals': {'1s': '1', '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1D': 'D'}
        },
        'binance': {
            'ws': 'wss://fstream.binance.com/ws',
            'rest': 'https://fapi.binance.com/fapi/v1/klines',
            'intervals': {'1s': '1s', '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1D': '1d'}
        },
        'okx': {
            'ws': 'wss://ws.okx.com:8443/ws/v5/public',
            'rest': 'https://www.okx.com/api/v5/market/candles',
            'intervals': {'1m': '1m', '5m': '5m', '15m': '15m', '1h': '1H', '4h': '4H', '1D': '1D'}
        }
    }

    def __init__(self, symbol='BTCUSDT', timeframe='1m', exchange='bybit', output_dir='data'):
        self.symbol = symbol
        self.timeframe = timeframe
        self.exchange = exchange
        self.output_dir = output_dir
        self.candles = []
        self.ws = None
        self.running = False
        self.on_candle_callback = None

        os.makedirs(output_dir, exist_ok=True)

    def fetch_historical(self, limit=1000):
        """Fetch historical candles via REST API"""
        print(f"📥 Fetching {limit} historical {self.timeframe} candles from {self.exchange}...")

        try:
            if self.exchange == 'bybit':
                data = self._fetch_bybit_historical(limit)
            elif self.exchange == 'binance':
                data = self._fetch_binance_historical(limit)
            elif self.exchange == 'okx':
                data = self._fetch_okx_historical(limit)
            else:
                raise ValueError(f"Unknown exchange: {self.exchange}")

            self.candles = data
            self._save_csv('historical')
            print(f"✅ Loaded {len(data)} historical candles")
            return data

        except Exception as e:
            print(f"❌ Historical fetch error: {e}")
            return []

    def _fetch_bybit_historical(self, limit):
        """Fetch from Bybit API"""
        url = self.EXCHANGES['bybit']['rest']
        interval = self.EXCHANGES['bybit']['intervals'].get(self.timeframe, '1')

        params = {
            'category': 'linear',
            'symbol': self.symbol,
            'interval': interval,
            'limit': min(limit, 1000)
        }

        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        if 'result' not in data or 'list' not in data['result']:
            raise ValueError(f"Invalid Bybit response: {data}")

        candles = []
        for kline in data['result']['list']:
            candles.append({
                'timestamp': pd.to_datetime(int(kline[0]), unit='ms'),
                'open': float(kline[1]),
                'high': float(kline[2]),
                'low': float(kline[3]),
                'close': float(kline[4]),
                'volume': float(kline[5])
            })

        return sorted(candles, key=lambda x: x['timestamp'])

    def _fetch_binance_historical(self, limit):
        """Fetch from Binance Futures API"""
        url = self.EXCHANGES['binance']['rest']
        interval = self.EXCHANGES['binance']['intervals'].get(self.timeframe, '1m')

        params = {
            'symbol': self.symbol,
            'interval': interval,
            'limit': min(limit, 1500)
        }

        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        candles = []
        for kline in data:
            candles.append({
                'timestamp': pd.to_datetime(int(kline[0]), unit='ms'),
                'open': float(kline[1]),
                'high': float(kline[2]),
                'low': float(kline[3]),
                'close': float(kline[4]),
                'volume': float(kline[5])
            })

        return candles

    def _fetch_okx_historical(self, limit):
        """Fetch from OKX API"""
        url = self.EXCHANGES['okx']['rest']
        interval = self.EXCHANGES['okx']['intervals'].get(self.timeframe, '1m')
        inst_id = f"{self.symbol[:3]}-{self.symbol[3:]}-SWAP"

        params = {
            'instId': inst_id,
            'bar': interval,
            'limit': min(limit, 300)
        }

        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        if 'data' not in data:
            raise ValueError(f"Invalid OKX response: {data}")

        candles = []
        for kline in data['data']:
            candles.append({
                'timestamp': pd.to_datetime(int(kline[0]), unit='ms'),
                'open': float(kline[1]),
                'high': float(kline[2]),
                'low': float(kline[3]),
                'close': float(kline[4]),
                'volume': float(kline[5])
            })

        return sorted(candles, key=lambda x: x['timestamp'])

    def start_live(self, on_candle=None):
        """Start live WebSocket streaming"""
        self.running = True
        self.on_candle_callback = on_candle

        if self.exchange == 'bybit':
            self._start_bybit_ws()
        elif self.exchange == 'binance':
            self._start_binance_ws()
        elif self.exchange == 'okx':
            self._start_okx_ws()

    def _start_bybit_ws(self):
        """Bybit WebSocket (supports 1s)"""
        interval = self.EXCHANGES['bybit']['intervals'].get(self.timeframe, '1')

        def on_message(ws, message):
            try:
                data = json.loads(message)
                if 'data' in data and f'kline.{interval}' in data.get('topic', ''):
                    candle_data = data['data'][0]
                    candle = {
                        'timestamp': pd.to_datetime(int(candle_data['start']), unit='ms'),
                        'open': float(candle_data['open']),
                        'high': float(candle_data['high']),
                        'low': float(candle_data['low']),
                        'close': float(candle_data['close']),
                        'volume': float(candle_data['volume']),
                        'confirmed': candle_data.get('confirm', False)
                    }
                    self._process_candle(candle)
            except Exception as e:
                print(f"❌ WS message error: {e}")

        def on_open(ws):
            print(f"🚀 Connected to Bybit {self.timeframe} {self.symbol}")
            subscribe = {
                "op": "subscribe",
                "args": [f"kline.{interval}.{self.symbol}"]
            }
            ws.send(json.dumps(subscribe))

        def on_error(ws, error):
            print(f"❌ WS Error: {error}")

        def on_close(ws, close_status_code, close_msg):
            print("🔌 WebSocket closed")
            if self.running:
                print("🔄 Reconnecting in 5s...")
                time.sleep(5)
                self._start_bybit_ws()

        self.ws = websocket.WebSocketApp(
            self.EXCHANGES['bybit']['ws'],
            on_open=on_open,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close
        )
        self.ws.run_forever()

    def _start_binance_ws(self):
        """Binance Futures WebSocket"""
        interval = self.EXCHANGES['binance']['intervals'].get(self.timeframe, '1m')
        symbol_lower = self.symbol.lower()
        ws_url = f"{self.EXCHANGES['binance']['ws']}/{symbol_lower}@kline_{interval}"

        def on_message(ws, message):
            try:
                data = json.loads(message)
                if 'k' in data:
                    kline = data['k']
                    candle = {
                        'timestamp': pd.to_datetime(int(kline['t']), unit='ms'),
                        'open': float(kline['o']),
                        'high': float(kline['h']),
                        'low': float(kline['l']),
                        'close': float(kline['c']),
                        'volume': float(kline['v']),
                        'confirmed': kline['x']
                    }
                    self._process_candle(candle)
            except Exception as e:
                print(f"❌ WS message error: {e}")

        def on_open(ws):
            print(f"🚀 Connected to Binance {self.timeframe} {self.symbol}")

        self.ws = websocket.WebSocketApp(
            ws_url,
            on_open=on_open,
            on_message=on_message
        )
        self.ws.run_forever()

    def _start_okx_ws(self):
        """OKX WebSocket"""
        interval = self.EXCHANGES['okx']['intervals'].get(self.timeframe, '1m')
        inst_id = f"{self.symbol[:3]}-{self.symbol[3:]}-SWAP"

        def on_message(ws, message):
            try:
                data = json.loads(message)
                if 'data' in data:
                    for kline in data['data']:
                        candle = {
                            'timestamp': pd.to_datetime(int(kline[0]), unit='ms'),
                            'open': float(kline[1]),
                            'high': float(kline[2]),
                            'low': float(kline[3]),
                            'close': float(kline[4]),
                            'volume': float(kline[5]),
                            'confirmed': True
                        }
                        self._process_candle(candle)
            except Exception as e:
                print(f"❌ WS message error: {e}")

        def on_open(ws):
            print(f"🚀 Connected to OKX {self.timeframe} {self.symbol}")
            subscribe = {
                "op": "subscribe",
                "args": [{"channel": f"candle{interval}", "instId": inst_id}]
            }
            ws.send(json.dumps(subscribe))

        self.ws = websocket.WebSocketApp(
            self.EXCHANGES['okx']['ws'],
            on_open=on_open,
            on_message=on_message
        )
        self.ws.run_forever()

    def _process_candle(self, candle):
        """Process incoming candle"""
        self.candles.append(candle)

        # Keep last 10000 candles in memory
        if len(self.candles) > 10000:
            self.candles = self.candles[-10000:]

        # Print candle
        print(f"🕐 {candle['timestamp']} | O:{candle['open']:.4f} H:{candle['high']:.4f} L:{candle['low']:.4f} C:{candle['close']:.4f} V:{candle['volume']:.2f}")

        # Call user callback
        if self.on_candle_callback:
            self.on_candle_callback(candle)

        # Auto-save every 100 candles
        if len(self.candles) % 100 == 0:
            self._save_csv('live')

    def _save_csv(self, prefix=''):
        """Save candles to CSV"""
        if not self.candles:
            return

        df = pd.DataFrame(self.candles)
        filename = f"{self.output_dir}/{self.symbol}_{self.timeframe}_{prefix}.csv"
        df.to_csv(filename, index=False)
        print(f"💾 Saved {len(df)} candles to {filename}")

    def stop(self):
        """Stop streaming"""
        self.running = False
        if self.ws:
            self.ws.close()
        self._save_csv('final')


def main():
    parser = argparse.ArgumentParser(description='Multi-Exchange Candle Streamer')
    parser.add_argument('--symbol', '-s', default='BTCUSDT', help='Trading symbol')
    parser.add_argument('--timeframe', '-t', default='1m', help='Timeframe (1s, 1m, 5m, 15m, 1h, 4h, 1D)')
    parser.add_argument('--exchange', '-e', default='bybit', help='Exchange (bybit, binance, okx)')
    parser.add_argument('--bars', '-n', type=int, default=500, help='Historical bars to fetch')
    parser.add_argument('--live', '-l', action='store_true', help='Enable live streaming')
    parser.add_argument('--output', '-o', default='data', help='Output directory')

    args = parser.parse_args()

    print("🌙 Moon AI tvpine-cli Streamer v1.0.0\n")

    streamer = MultiExchangeStreamer(
        symbol=args.symbol,
        timeframe=args.timeframe,
        exchange=args.exchange,
        output_dir=args.output
    )

    # Fetch historical data
    streamer.fetch_historical(args.bars)

    # Start live streaming if requested
    if args.live:
        print(f"\n🔴 Starting live {args.timeframe} stream (Ctrl+C to stop)...\n")
        try:
            streamer.start_live()
        except KeyboardInterrupt:
            print("\n⏹️ Stopping...")
            streamer.stop()


if __name__ == "__main__":
    main()
