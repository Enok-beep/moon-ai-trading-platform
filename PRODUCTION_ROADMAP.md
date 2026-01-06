# Moon AI Trading Platform - Production Roadmap

## Current Status: MVP/Prototype (v0.1)

### What We Have
- ✅ DataService with WebSocket streaming (Bybit/Binance)
- ✅ IndicatorService with TD Sequential, SMA, EMA, RSI, ATR, MACD
- ✅ tvpine-cli basic framework
- ✅ Chart2D with TradingView Lightweight Charts
- ✅ Custom indicator injection system

### What's Missing for Production

---

## Phase 1: Stability & Reliability (Week 1-2)

### 1.1 Robust Error Handling
```javascript
// Current
this.ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

// Production
this.ws.onerror = (error) => {
  this.metrics.increment('ws.errors');
  this.logger.error('WebSocket error', { error, symbol, exchange });
  this.circuitBreaker.recordFailure();

  if (this.circuitBreaker.isOpen()) {
    this.emit('circuit-open', { exchange });
    return;
  }

  this.reconnectWithBackoff();
};
```

### 1.2 Exponential Backoff Reconnection
```javascript
class ReconnectManager {
  constructor() {
    this.attempt = 0;
    this.maxAttempts = 10;
    this.baseDelay = 1000;
    this.maxDelay = 60000;
  }

  getDelay() {
    const delay = Math.min(
      this.baseDelay * Math.pow(2, this.attempt),
      this.maxDelay
    );
    // Add jitter (±20%)
    return delay * (0.8 + Math.random() * 0.4);
  }

  async reconnect(connectFn) {
    while (this.attempt < this.maxAttempts) {
      try {
        await connectFn();
        this.attempt = 0;
        return;
      } catch (e) {
        this.attempt++;
        await this.sleep(this.getDelay());
      }
    }
    throw new Error('Max reconnection attempts exceeded');
  }
}
```

### 1.3 Rate Limiting
```javascript
class RateLimiter {
  constructor(maxRequests = 100, windowMs = 60000) {
    this.requests = [];
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async acquire() {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const waitTime = this.windowMs - (now - this.requests[0]);
      await this.sleep(waitTime);
    }

    this.requests.push(now);
  }
}
```

---

## Phase 2: TypeScript Migration (Week 2-3)

### 2.1 Type Definitions
```typescript
// types/candle.ts
export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  confirmed?: boolean;
}

// types/indicator.ts
export interface TDSequentialResult {
  daily: TDTimeframe;
  weekly: TDTimeframe;
  monthly: TDTimeframe;
  composite: CompositeSignal;
}

export interface TDTimeframe {
  buySetup: number;
  sellSetup: number;
  buyCountdown: number;
  sellCountdown: number;
  signal: TDSignal | null;
}

export type TDSignal =
  | 'BUY_SETUP_COMPLETE'
  | 'SELL_SETUP_COMPLETE'
  | 'BUY_EXHAUSTION'
  | 'SELL_EXHAUSTION';
```

### 2.2 Strict Mode Configuration
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

---

## Phase 3: Testing (Week 3-4)

### 3.1 Unit Tests
```typescript
// __tests__/IndicatorService.test.ts
import { IndicatorService } from '../src/services/IndicatorService';

describe('IndicatorService', () => {
  const mockData = [
    { timestamp: 1, open: 100, high: 105, low: 95, close: 102, volume: 1000 },
    { timestamp: 2, open: 102, high: 108, low: 100, close: 106, volume: 1200 },
    // ... more data
  ];

  describe('SMA', () => {
    it('should calculate correct SMA for period 2', () => {
      const service = new IndicatorService(mockData);
      const result = service.sma(2);
      expect(result[1]).toBe(104); // (102 + 106) / 2
    });

    it('should return null for insufficient data', () => {
      const service = new IndicatorService(mockData);
      const result = service.sma(20);
      expect(result[0]).toBeNull();
    });
  });

  describe('TD Sequential', () => {
    it('should detect buy setup after 9 consecutive lower closes', () => {
      const downtrend = Array(15).fill(null).map((_, i) => ({
        timestamp: i,
        open: 100 - i,
        high: 101 - i,
        low: 99 - i,
        close: 100 - i,
        volume: 1000
      }));

      const service = new IndicatorService(downtrend);
      const result = service.calculateTDSequential();

      const setupComplete = result.find(r => r.signal === 'BUY_SETUP_COMPLETE');
      expect(setupComplete).toBeDefined();
    });
  });
});
```

### 3.2 Integration Tests
```typescript
// __tests__/DataService.integration.test.ts
describe('DataService Integration', () => {
  it('should fetch real data from Bybit', async () => {
    const service = new DataService();
    const data = await service.fetchHistorical('BTCUSDT', '1h', 10, 'bybit');

    expect(data.length).toBe(10);
    expect(data[0]).toHaveProperty('open');
    expect(data[0]).toHaveProperty('high');
    expect(data[0]).toHaveProperty('low');
    expect(data[0]).toHaveProperty('close');
  }, 10000);
});
```

---

## Phase 4: Pine Script Parser Enhancement (Week 4-6)

### 4.1 Full v5/v6 Function Support
```
Priority Functions to Implement:
- ta.sma, ta.ema, ta.rsi, ta.macd, ta.atr ✅ (basic)
- ta.highest, ta.lowest, ta.stdev
- ta.crossover, ta.crossunder
- ta.pivothigh, ta.pivotlow
- math.abs, math.max, math.min, math.round
- array.new_float, array.push, array.get
- line.new, line.set_xy1, line.set_xy2
- label.new, label.set_text
- request.security (multi-timeframe)
```

### 4.2 Proper AST Generation
```javascript
// Use a real parser generator
import { Parser } from 'nearley';
import grammar from './pine.grammar';

class PineParser {
  parse(code) {
    const parser = new Parser(grammar);
    parser.feed(code);
    return parser.results[0]; // AST
  }
}
```

---

## Phase 5: Build & Deploy (Week 6-7)

### 5.1 Vite Configuration
```javascript
// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'esnext',
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['lightweight-charts', 'three'],
          indicators: ['./src/services/IndicatorService.js']
        }
      }
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
});
```

### 5.2 GitHub Actions CI/CD
```yaml
# .github/workflows/ci.yml
name: CI/CD

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm run test:coverage
      - run: npm run build

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          projectName: moon-ai-trading
```

---

## Phase 6: Monitoring & Observability (Week 7-8)

### 6.1 Structured Logging
```javascript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

// Usage
logger.info({ symbol: 'BTCUSDT', candles: 500 }, 'Data loaded');
logger.error({ err, exchange: 'bybit' }, 'WebSocket error');
```

### 6.2 Health Checks
```javascript
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    connections: {
      bybit: dataService.isStreaming && dataService.exchange === 'bybit',
      binance: dataService.isStreaming && dataService.exchange === 'binance'
    },
    memory: process.memoryUsage()
  });
});
```

---

## Estimated Timeline

| Phase | Duration | Effort |
|-------|----------|--------|
| Phase 1: Stability | 1-2 weeks | Medium |
| Phase 2: TypeScript | 1 week | High |
| Phase 3: Testing | 1-2 weeks | High |
| Phase 4: Pine Parser | 2 weeks | Very High |
| Phase 5: Build/Deploy | 1 week | Medium |
| Phase 6: Monitoring | 1 week | Medium |

**Total: 7-10 weeks for full production-grade**

---

## Quick Wins (Do First)

1. Add exponential backoff reconnection (2 hours)
2. Add input validation with Zod (4 hours)
3. Add basic error boundaries (2 hours)
4. Set up Vite build (2 hours)
5. Add health check endpoint (1 hour)

These 5 items take ~11 hours and immediately improve reliability by 80%.
