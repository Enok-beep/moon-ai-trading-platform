/**
 * config.js - Application Configuration
 * Centralized configuration for Moon AI Trading Platform
 */

export const config = {
  // Default trading settings
  defaultSymbol: 'BTCUSDT',
  defaultTimeframe: '1m',

  // API endpoints
  apiEndpoints: {
    market: '/api/market',
    signals: '/api/signals',
    alerts: '/api/alerts',
    portfolio: '/api/portfolio'
  },

  // Theme
  theme: 'dark',

  // Chart settings
  chart: {
    defaultType: '3d', // '3d' or '2d'
    candleColors: {
      bull: '#00d26a',
      bear: '#ff5252'
    },
    gridColor: 'rgba(255, 255, 255, 0.04)'
  },

  // Layout dimensions (mirror CSS variables)
  layout: {
    headerHeight: 52,
    sidebarWidth: 240,
    rightPanelWidth: 320,
    widgetbarWidth: 44,
    executionBarHeight: 64
  },

  // WebSocket settings
  websocket: {
    reconnectInterval: 5000,
    maxReconnectAttempts: 5
  },

  // Signal grade thresholds
  signalGrades: {
    'A+': { minConfidence: 0.95, color: '#ff4757' },
    'A': { minConfidence: 0.85, color: '#ffd700' },
    'B': { minConfidence: 0.70, color: '#3498db' },
    'C': { minConfidence: 0.50, color: '#95a5a6' }
  }
};

export default config;
