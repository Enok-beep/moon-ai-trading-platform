/**
 * ChartManager.js
 * Manages switching between 3D and 2D chart views
 */

import { Chart2D } from './Chart2D.js';

export class ChartManager {
  constructor(container3dId, container2dId) {
    this.container3d = container3dId ? document.getElementById(container3dId) : null;
    this.container2d = document.getElementById(container2dId);

    if (!this.container2d) {
      throw new Error('2D Chart container not found');
    }

    this.chart2d = null;
    this.chart3d = null; // Will be initialized by the existing 3D chart code
    this.currentView = this.container3d ? '3d' : '2d';
    this.rawData = null;

    console.log('✓ ChartManager initialized (3D:', !!this.container3d, ', 2D:', !!this.container2d, ')');
  }

  /**
   * Initialize 2D chart
   */
  init2DChart() {
    if (!this.chart2d) {
      this.chart2d = new Chart2D('chart-2d-container');
      console.log('✓ 2D Chart created');
    }
    return this.chart2d;
  }

  /**
   * Set data for both charts
   * @param {Array} rawData - Raw candlestick data
   */
  setData(rawData, transformedData) {
    this.rawData = rawData;

    // Set 3D chart data (existing chart object)
    if (this.chart3d && rawData) {
      this.chart3d.setData(rawData);
    }

    // Set 2D chart data (if initialized)
    if (this.chart2d && transformedData) {
      this.chart2d.setData(transformedData);
    }
  }

  /**
   * Set reference to existing 3D chart
   * @param {Object} chart3d - The 3D chart instance
   */
  set3DChart(chart3d) {
    this.chart3d = chart3d;
    console.log('✓ 3D Chart reference set');
  }

  /**
   * Toggle between 3D and 2D views
   * @returns {string} Current view after toggle
   */
  toggleView() {
    if (this.currentView === '3d') {
      return this.switchTo2D();
    } else {
      return this.switchTo3D();
    }
  }

  /**
   * Switch to 2D view
   */
  switchTo2D() {
    // Hide 3D (if exists), show 2D
    if (this.container3d) {
      this.container3d.style.display = 'none';
    }
    if (this.container2d) {
      this.container2d.style.display = 'block';
    }
    this.currentView = '2d';

    // Initialize 2D chart if not done yet
    if (!this.chart2d) {
      this.init2DChart();
    }

    // Resize 2D chart to fit container
    if (this.chart2d && this.chart2d.chart && this.container2d) {
      this.chart2d.chart.applyOptions({
        width: this.container2d.clientWidth,
        height: this.container2d.clientHeight
      });
    }

    console.log('✓ Switched to 2D view');
    return '2d';
  }

  /**
   * Switch to 3D view
   */
  switchTo3D() {
    // Only switch if 3D container exists
    if (!this.container3d) {
      console.warn('3D container not available, staying in 2D mode');
      return this.currentView;
    }

    // Show 3D, hide 2D
    this.container3d.style.display = 'block';
    if (this.container2d) {
      this.container2d.style.display = 'none';
    }
    this.currentView = '3d';

    console.log('✓ Switched to 3D view');
    return '3d';
  }

  /**
   * Get current view
   */
  getCurrentView() {
    return this.currentView;
  }

  /**
   * Update single candle (for real-time)
   */
  update(candle) {
    if (this.currentView === '2d' && this.chart2d) {
      this.chart2d.update(candle);
    }
    // 3D chart updates are handled by its own animation loop
  }

  /**
   * Set symbol for the chart (triggers data reload)
   * @param {string} symbol - Trading symbol (e.g., 'BTCUSDT')
   * @param {Function} dataFetcher - Async function to fetch data for symbol
   */
  async setSymbol(symbol, dataFetcher) {
    console.log(`✓ ChartManager: Setting symbol to ${symbol}`);

    if (dataFetcher && typeof dataFetcher === 'function') {
      try {
        const data = await dataFetcher(symbol);
        if (data) {
          this.setData(data.raw, data.transformed);
        }
      } catch (error) {
        console.error('ChartManager: Failed to fetch data for symbol', symbol, error);
      }
    }
  }

  /**
   * Set chart type (candlestick, line, area)
   * @param {string} type - Chart type ('candlestick', 'line', 'area')
   */
  setChartType(type) {
    if (this.currentView === '2d' && this.chart2d) {
      this.chart2d.setChartType(type);
      console.log(`✓ ChartManager: Chart type set to ${type}`);
    } else {
      console.warn('ChartManager: Chart type change only supported in 2D view');
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.chart2d) {
      this.chart2d.destroy();
      this.chart2d = null;
    }
    console.log('✓ ChartManager destroyed');
  }
}
