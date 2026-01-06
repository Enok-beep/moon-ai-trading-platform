# Moon AI Trading Platform - Architecture v7.0

## Enterprise-Grade Multi-Window Trading Platform

---

## 🏗️ **Project Structure**

```
moon-ai-trading-platform/
├── src/                          # Source code (modular)
│   ├── core/                     # Enterprise Core Systems (NEW v7.0)
│   │   ├── WindowSync.js        # BroadcastChannel multi-window sync
│   │   ├── EventBus.js          # Cross-component pub-sub
│   │   ├── DetachablePanel.js   # Webull-style detachable panels
│   │   └── IndicatorEngine.js   # Custom indicator management + sync
│   ├── charts/                   # Chart implementations
│   │   ├── Chart3D.js           # 3D WebGL chart class
│   │   ├── Chart2D.js           # TradingView Lightweight Charts wrapper
│   │   └── ChartManager.js      # Manages switching between charts
│   ├── controllers/              # UI Controllers (NEW v7.0)
│   │   ├── SidebarController.js # Unified sidebar management
│   │   ├── WidgetbarController.js # Right widgetbar controls
│   │   └── PanelController.js   # Panel collapse/expand
│   ├── services/                 # Business logic & data
│   │   ├── DataService.js       # CSV loading, data fetching
│   │   ├── IndicatorService.js  # Technical indicators (TD Sequential, etc.)
│   │   └── RealtimeService.js   # Real-time updates
│   ├── components/               # UI Components
│   │   ├── LinkIndicator.js     # Color-coded linking UI (NEW v7.0)
│   │   ├── UniversalSearch.js   # AI-powered search (NEW v7.0)
│   │   ├── ContextMenu.js       # Right-click menu
│   │   ├── Toolbar.js           # Chart controls
│   │   ├── Sidebar.js           # Left sidebar (watchlist, etc.)
│   │   └── RightPanel.js        # Right panel (predictions, news)
│   ├── styles/                   # CSS Styles (NEW v7.0)
│   │   ├── design-tokens.css    # Unified design system
│   │   └── tradingview-atomic.css # TradingView atomic styles
│   ├── ui/                       # UI utilities
│   │   ├── Toast.js             # Notification system
│   │   ├── Modal.js             # Modal dialogs
│   │   └── LoadingOverlay.js    # Loading states
│   ├── utils/                    # Helper functions
│   │   ├── logger.js            # Logging utility
│   │   ├── validators.js        # Data validation
│   │   └── formatters.js        # Price/date formatters
│   ├── config/                   # Configuration
│   │   └── constants.js         # Colors, settings, etc.
│   └── main.js                   # Entry point
├── public/                       # Static assets
│   ├── index.html               # Main HTML (clean, minimal)
│   ├── css/
│   │   ├── main.css             # Base styles
│   │   ├── charts.css           # Chart-specific styles
│   │   └── components.css       # Component styles
│   ├── js/                      # External libraries
│   │   ├── three.min.js
│   │   └── lightweight-charts.js
│   ├── data/
│   │   └── attana_ohlc.csv     # Market data
│   └── assets/                  # Images, icons
├── package.json                  # Dependencies
├── webpack.config.js             # Build configuration
└── README.md                     # Documentation
```

---

## 📦 **Module Responsibilities**

### **1. Charts Module** (`src/charts/`)
- **Chart3D.js**: WebGL 3D candlestick chart with Three.js
  - Methods: `setData()`, `resetView()`, `jumpToLatest()`, `animate()`
  - Features: Gravitational lens, time-warp, VR mode

- **Chart2D.js**: Professional 2D chart wrapper
  - Uses TradingView Lightweight Charts library
  - Methods: `setData()`, `update()`, `fitContent()`
  - Features: Zoom, pan, crosshair, volume bars

- **ChartManager.js**: Orchestrates chart switching
  - Manages 3D ↔ 2D transitions
  - Syncs data between both views

### **2. Services Module** (`src/services/`)
- **DataService.js**: Centralized data management
  ```javascript
  class DataService {
    async loadAttanaData()          // Load CSV from server
    async fetchLiveData(symbol)      // Real-time API calls
    validateData(data)               // Data quality checks
    transformToChartFormat(data)     // Convert to chart-ready format
  }
  ```

- **IndicatorService.js**: Technical analysis
  ```javascript
  class IndicatorService {
    calculateTDSequential(data)      // Tom DeMark indicator
    calculateMovingAverage(data, period)
    detectPatterns(data)             // Candlestick patterns
  }
  ```

- **RealtimeService.js**: Live updates
  ```javascript
  class RealtimeService {
    connect(symbol)                  // WebSocket connection
    onUpdate(callback)               // Subscribe to updates
    disconnect()
  }
  ```

### **3. Components Module** (`src/components/`)
Each component is self-contained with its own:
- HTML structure (template)
- Event handlers
- State management

**Example: ContextMenu.js**
```javascript
export class ContextMenu {
  constructor(container) {
    this.container = container;
    this.menu = this.createMenu();
    this.attachEvents();
  }

  show(x, y) { /* ... */ }
  hide() { /* ... */ }
  onAction(action, handler) { /* ... */ }
}
```

### **4. UI Module** (`src/ui/`)
Reusable UI utilities:
- **Toast**: `showToast('success', 'Title', 'Message')`
- **Modal**: `showModal({ title, content, onConfirm })`
- **LoadingOverlay**: `showLoading()` / `hideLoading()`

### **5. Utils Module** (`src/utils/`)
- **logger.js**: Structured logging
  ```javascript
  logger.info('Chart loaded', { candles: 481 });
  logger.error('Data fetch failed', error);
  ```

- **validators.js**: Data validation
  ```javascript
  validateCandle(candle)      // Check OHLC values
  validateTimestamp(date)      // Check date validity
  ```

---

## 🔧 **Build System (Webpack)**

```javascript
// webpack.config.js
module.exports = {
  entry: './src/main.js',
  output: {
    filename: 'bundle.js',
    path: './public/dist'
  },
  module: {
    rules: [
      { test: /\.js$/, use: 'babel-loader' },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] }
    ]
  },
  devServer: {
    contentBase: './public',
    port: 3001,
    hot: true  // Hot module replacement
  }
};
```

---

## 🎯 **Benefits of Modular Architecture**

### **1. Maintainability** ✅
- Each file has **one clear purpose**
- Easy to find and fix bugs
- Changes are isolated (no ripple effects)

### **2. Scalability** ✅
- Add new chart types without touching existing code
- Plugin system for indicators
- Easy to add new data sources

### **3. Testability** ✅
- Unit test each module independently
- Mock services for testing components
- Integration tests for full workflows

### **4. Performance** ✅
- Code splitting: Load only what's needed
- Tree shaking: Remove unused code
- Lazy loading: Load charts on demand

### **5. Collaboration** ✅
- Multiple developers can work simultaneously
- Clear ownership of modules
- Git conflicts are minimized

---

## 🚀 **Migration Strategy**

### **Phase 1: Extract Services** (Day 1)
1. Move CSV loader → `DataService.js`
2. Move TD Sequential → `IndicatorService.js`
3. Test: Data still loads correctly

### **Phase 2: Extract Charts** (Day 2)
1. Move 3D chart code → `Chart3D.js`
2. Move 2D chart code → `Chart2D.js`
3. Create `ChartManager.js` for switching
4. Test: Both charts work, toggle works

### **Phase 3: Extract Components** (Day 3)
1. Move context menu → `ContextMenu.js`
2. Move toolbar → `Toolbar.js`
3. Move sidebars → `Sidebar.js`, `RightPanel.js`
4. Test: All UI interactions work

### **Phase 4: Build System** (Day 4)
1. Set up Webpack
2. Configure dev server with hot reload
3. Test: `npm run dev` works
4. Production build: `npm run build`

### **Phase 5: Polish** (Day 5)
1. Add error boundaries
2. Improve logging
3. Write documentation
4. Performance optimization

---

## 📝 **Example: Refactored main.js**

**Before (4000+ lines):**
```javascript
// Everything in one file 😱
<script>
  // Chart code
  // Data loading
  // UI components
  // Event handlers
  // ... 4000 lines
</script>
```

**After (Clean & modular):**
```javascript
// main.js (50 lines)
import { ChartManager } from './charts/ChartManager.js';
import { DataService } from './services/DataService.js';
import { Toolbar } from './components/Toolbar.js';
import { ContextMenu } from './components/ContextMenu.js';
import { logger } from './utils/logger.js';

class TradingApp {
  async init() {
    try {
      // Initialize services
      this.dataService = new DataService();
      this.chartManager = new ChartManager('#chart-container');

      // Load data
      const data = await this.dataService.loadAttanaData();
      this.chartManager.setData(data);

      // Setup UI
      this.toolbar = new Toolbar('#toolbar');
      this.contextMenu = new ContextMenu('#chart-container');

      // Event handlers
      this.toolbar.onViewToggle(() => this.chartManager.toggleView());

      logger.info('App initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize app', error);
    }
  }
}

// Start app
const app = new TradingApp();
app.init();
```

---

## 🛡️ **Error Handling Strategy**

### **1. Service Level**
```javascript
// DataService.js
async loadAttanaData() {
  try {
    const data = await fetch('/attana_ohlc.csv');
    return this.validateData(data);
  } catch (error) {
    logger.error('Data load failed', error);
    throw new DataLoadError('Failed to load Attana data', error);
  }
}
```

### **2. Component Level**
```javascript
// Chart3D.js
setData(data) {
  try {
    this.validateData(data);
    this.renderCandlesticks(data);
  } catch (error) {
    logger.error('Chart render failed', error);
    this.showError('Failed to render chart');
  }
}
```

### **3. App Level**
```javascript
// main.js
window.addEventListener('error', (event) => {
  logger.error('Unhandled error', event.error);
  showToast('error', 'Application Error', 'Please refresh the page');
});
```

---

## 📊 **Performance Optimizations**

1. **Lazy Loading**
   - Load 3D chart only when switching to 3D view
   - Load indicators on demand

2. **Code Splitting**
   - Separate bundles for charts, services, components
   - Load what's needed for initial render

3. **Caching**
   - Cache CSV data in memory
   - Cache processed indicators

4. **Debouncing**
   - Debounce resize events
   - Throttle real-time updates

---

---

## 🆕 **Enterprise Core Systems (v7.0)**

### **1. Multi-Window Sync System** (`src/core/WindowSync.js`)

Uses BroadcastChannel API for cross-window communication:

```javascript
import { getWindowSync, SYNC_EVENTS, LINK_COLORS } from './core/WindowSync.js';

// Get singleton instance
const sync = getWindowSync({ windowName: 'main', linkColor: LINK_COLORS.BLUE });

// Broadcast symbol change to all linked windows
sync.broadcast(SYNC_EVENTS.SYMBOL_CHANGE, { symbol: 'AAPL' });

// Listen for events from other windows
sync.on(SYNC_EVENTS.SYMBOL_CHANGE, (data) => {
  loadChart(data.symbol);
});
```

**Link Colors (TradeStation/NinjaTrader style):**
| Color | Behavior |
|-------|----------|
| Gray | Unlinked - independent window |
| Blue | Group A - syncs symbol + timeframe |
| Green | Group B - syncs symbol + timeframe |
| Orange | Group C - syncs symbol + timeframe |
| Purple | Group D - syncs symbol + timeframe |
| White | Master - receives ALL broadcasts |

### **2. EventBus** (`src/core/EventBus.js`)

Central pub-sub system for cross-component communication:

```javascript
import eventBus, { LOCAL_EVENTS, SYNC_EVENTS } from './core/EventBus.js';

// Subscribe to events
eventBus.on('panel:open', (data) => console.log('Panel opened:', data.panelId));

// Emit events (optionally sync across windows)
eventBus.emit('panel:open', { panelId: 'signals' }, { sync: true });

// Enable cross-window sync
eventBus.enableSync();
```

### **3. Detachable Panels** (`src/core/DetachablePanel.js`)

Webull-style panels that can be detached to separate windows:

```javascript
import { DetachablePanel, PANEL_CONFIGS } from './core/DetachablePanel.js';

// Create a detachable panel
const signalsPanel = new DetachablePanel('signals', {
  onDetach: () => console.log('Panel detached'),
  onReattach: () => console.log('Panel reattached')
});

// Detach to new window
signalsPanel.detach();

// Change link color for sync group
signalsPanel.setLinkColor('blue');
```

### **4. Indicator Engine** (`src/core/IndicatorEngine.js`)

Custom indicator management with cross-feature sync:

```javascript
import indicatorEngine, { BUILTIN_INDICATORS } from './core/IndicatorEngine.js';

// Initialize
indicatorEngine.init();

// Register custom indicator
const id = indicatorEngine.registerCustom({
  name: 'My RSI Alert',
  params: { period: { default: 14 } },
  calculate: (data, params) => { /* ... */ }
});

// Apply to feature (chart, screener, alert, signal)
indicatorEngine.apply('rsi', 'chart', { params: { period: 14 } });

// Listen for conditions
indicatorEngine.onCondition('RSI_oversold', (symbol, value) => {
  createAlert({ symbol, condition: 'RSI < 30', value });
});
```

### **5. Universal Search** (`src/components/UniversalSearch.js`)

AI-powered search across all features:

```javascript
import universalSearch from './components/UniversalSearch.js';

// Initialize
universalSearch.init('#universal-search');

// Supports natural language queries:
// - "tech stocks with RSI below 30"
// - "crypto above 50-day SMA"
// - "similar to AAPL"
// - "alert me when NVDA crosses $500"
```

---

## 🎛️ **Panel Configuration**

### Widgetbar Buttons → Panel Mapping

| Button | Panel ID | Features | Detachable |
|--------|----------|----------|------------|
| Watchlist | `watchlist-panel` | Symbol tracking, price alerts | Yes |
| Alerts | `alerts-panel` | Price/indicator alerts | Yes |
| Signals | `signals-panel` | AI trading signals | Yes |
| AI | `ai-combined-panel` | Predictions + Chat tabs | Yes |
| Screener | `screener-panel` | Stocks/Crypto/Custom tabs | Yes |
| Pine | `pine-panel` | Strategy editor | Yes |
| Calendar | `calendar-panel` | Economic events | Yes |
| News | `news-panel` | News + Sentiment tabs | Yes |
| Notifications | `notifications-panel` | System alerts | Yes |
| Settings | `settings-panel` | App preferences | No |
| Help | `help-panel` | Keyboard shortcuts | No |

---

## 🎨 **Design Tokens** (`src/styles/design-tokens.css`)

Unified design system with CSS custom properties:

```css
:root {
  /* Colors */
  --color-primary: #2962ff;
  --color-success: #26a69a;
  --color-danger: #ef5350;
  --color-bg: #131722;

  /* Link Colors */
  --color-link-blue: #2962ff;
  --color-link-green: #26a69a;
  --color-link-orange: #ff9800;
  --color-link-purple: #6c5ce7;

  /* Typography */
  --font-xs: 11px;
  --font-sm: 12px;
  --font-md: 13px;

  /* Spacing (4px grid) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;

  /* Animation */
  --duration-normal: 250ms;
  --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

## ✅ **Implementation Complete**

- [x] WindowSync.js - Multi-window communication
- [x] EventBus.js - Cross-component pub-sub
- [x] DetachablePanel.js - Webull-style detachable panels
- [x] LinkIndicator.js - Color-coded linking UI
- [x] SidebarController.js - Unified sidebar control
- [x] IndicatorEngine.js - Custom indicator sync
- [x] UniversalSearch.js - AI-powered search
- [x] design-tokens.css - Unified design system
- [x] All panel HTML structures with detach/link UI
- [x] Radio mode panel switching
- [x] Smooth 250ms animations
