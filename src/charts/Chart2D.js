/**
 * Chart2D.js
 * TradingView Lightweight Charts wrapper for professional 2D candlestick charts
 */

export class Chart2D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container ${containerId} not found`);
    }

    this.chart = null;
    this.candlestickSeries = null;
    this.volumeSeries = null;
    this.data = null;

    this.init();
  }

  /**
   * Initialize the 2D chart
   */
  init() {
    // Check if Lightweight Charts library is loaded
    if (typeof LightweightCharts === 'undefined') {
      throw new Error('Lightweight Charts library not loaded');
    }

    // Create chart with TradingView styling
    this.chart = LightweightCharts.createChart(this.container, {
      width: this.container.clientWidth,
      height: this.container.clientHeight,
      layout: {
        background: { color: '#0f0f1a' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#1a1a2e' },
        horzLines: { color: '#1a1a2e' },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: '#2a2e39',
      },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Add candlestick series
    this.candlestickSeries = this.chart.addCandlestickSeries({
      upColor: '#00b894',
      downColor: '#ff7675',
      borderDownColor: '#ff7675',
      borderUpColor: '#00b894',
      wickDownColor: '#ff7675',
      wickUpColor: '#00b894',
    });

    // Add volume series
    this.volumeSeries = this.chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    // Make chart responsive
    this.setupResizeObserver();

    console.log('✓ 2D Chart initialized');
  }

  /**
   * Set chart data
   * @param {Object} data - {candles, volume}
   */
  setData(data) {
    if (!data || !data.candles || !data.volume) {
      throw new Error('Invalid data format. Expected {candles, volume}');
    }

    try {
      this.candlestickSeries.setData(data.candles);
      this.volumeSeries.setData(data.volume);

      // Fit content to screen
      this.chart.timeScale().fitContent();

      this.data = data;
      console.log(`✓ 2D Chart loaded: ${data.candles.length} candles`);

      // Hide chart loading indicator
      const chartLoading = document.getElementById('chart-loading');
      if (chartLoading) {
        chartLoading.style.opacity = '0';
        setTimeout(() => {
          chartLoading.style.display = 'none';
        }, 300);
        console.log('✓ Chart loading indicator hidden');
      }

      return true;
    } catch (error) {
      console.error('Error setting 2D chart data:', error);
      throw error;
    }
  }

  /**
   * Update single candlestick (for real-time updates)
   * @param {Object} candle - New candle data
   */
  update(candle) {
    if (!this.candlestickSeries) return;

    try {
      this.candlestickSeries.update(candle);
    } catch (error) {
      console.error('Error updating 2D chart:', error);
    }
  }

  /**
   * Fit chart content to visible area
   */
  fitContent() {
    if (this.chart) {
      this.chart.timeScale().fitContent();
    }
  }

  /**
   * Scroll to latest candles
   */
  scrollToRealtime() {
    if (this.chart) {
      this.chart.timeScale().scrollToRealtime();
    }
  }

  /**
   * Set chart type (candlestick, line, or area)
   * @param {string} type - 'candlestick', 'line', or 'area'
   */
  setChartType(type) {
    if (!this.chart || !this.data) {
      console.warn('Chart not initialized or no data available');
      return;
    }

    // Remove existing series
    if (this.candlestickSeries) {
      this.chart.removeSeries(this.candlestickSeries);
      this.candlestickSeries = null;
    }

    // Create new series based on type
    switch (type.toLowerCase()) {
      case 'line':
        this.candlestickSeries = this.chart.addLineSeries({
          color: '#00b894',
          lineWidth: 2,
        });
        // Convert candles to line data (use close price)
        const lineData = this.data.candles.map(c => ({
          time: c.time,
          value: c.close
        }));
        this.candlestickSeries.setData(lineData);
        break;

      case 'area':
        this.candlestickSeries = this.chart.addAreaSeries({
          topColor: 'rgba(0, 184, 148, 0.4)',
          bottomColor: 'rgba(0, 184, 148, 0.0)',
          lineColor: '#00b894',
          lineWidth: 2,
        });
        // Convert candles to area data (use close price)
        const areaData = this.data.candles.map(c => ({
          time: c.time,
          value: c.close
        }));
        this.candlestickSeries.setData(areaData);
        break;

      case 'candlestick':
      default:
        this.candlestickSeries = this.chart.addCandlestickSeries({
          upColor: '#00b894',
          downColor: '#ff7675',
          borderDownColor: '#ff7675',
          borderUpColor: '#00b894',
          wickDownColor: '#ff7675',
          wickUpColor: '#00b894',
        });
        this.candlestickSeries.setData(this.data.candles);
        break;
    }

    console.log(`✓ Chart type changed to ${type}`);
  }

  /**
   * Setup responsive resize handling
   */
  setupResizeObserver() {
    const resizeObserver = new ResizeObserver(() => {
      if (this.chart && this.isVisible()) {
        this.chart.applyOptions({
          width: this.container.clientWidth,
          height: this.container.clientHeight
        });
      }
    });

    resizeObserver.observe(this.container);
  }

  /**
   * Check if chart is visible
   */
  isVisible() {
    return this.container.style.display !== 'none';
  }

  /**
   * Show chart
   */
  show() {
    this.container.style.display = 'block';
    // Resize after showing
    if (this.chart) {
      this.chart.applyOptions({
        width: this.container.clientWidth,
        height: this.container.clientHeight
      });
    }
  }

  /**
   * Hide chart
   */
  hide() {
    this.container.style.display = 'none';
  }

  /**
   * Destroy chart and cleanup
   */
  destroy() {
    if (this.chart) {
      this.chart.remove();
      this.chart = null;
      this.candlestickSeries = null;
      this.volumeSeries = null;
      console.log('✓ 2D Chart destroyed');
    }
  }
}
