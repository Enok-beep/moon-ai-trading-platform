/**
 * Chart Renderer
 * Generates chart images using Canvas
 */

import { createCanvas } from 'canvas';
import fs from 'fs';

export class ChartRenderer {
  constructor(width = 1920, height = 1080) {
    this.width = width;
    this.height = height;

    this.colors = {
      background: '#0f0f1a',
      grid: '#1a1a2e',
      text: '#d1d4dc',
      bullish: '#00b894',
      bearish: '#ff7675',
      volume: '#26a69a33'
    };

    this.padding = {
      top: 60,
      right: 80,
      bottom: 60,
      left: 60
    };
  }

  /**
   * Render candlestick chart
   */
  async render(data, filename, options = {}) {
    const canvas = createCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, this.width, this.height);

    // Calculate chart area
    const chartWidth = this.width - this.padding.left - this.padding.right;
    const chartHeight = this.height - this.padding.top - this.padding.bottom;

    // Find price range
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const maxPrice = Math.max(...highs) * 1.02;
    const minPrice = Math.min(...lows) * 0.98;
    const priceRange = maxPrice - minPrice;

    // Calculate candle width
    const candleWidth = Math.max(1, (chartWidth / data.length) * 0.8);
    const candleGap = (chartWidth / data.length) * 0.2;

    // Draw grid
    this._drawGrid(ctx, chartWidth, chartHeight, minPrice, maxPrice);

    // Draw candles
    for (let i = 0; i < data.length; i++) {
      const candle = data[i];
      const x = this.padding.left + i * (candleWidth + candleGap);

      const isBullish = candle.close >= candle.open;
      const color = isBullish ? this.colors.bullish : this.colors.bearish;

      // Body
      const bodyTop = this.padding.top + chartHeight - ((Math.max(candle.open, candle.close) - minPrice) / priceRange) * chartHeight;
      const bodyBottom = this.padding.top + chartHeight - ((Math.min(candle.open, candle.close) - minPrice) / priceRange) * chartHeight;
      const bodyHeight = Math.max(1, bodyBottom - bodyTop);

      ctx.fillStyle = color;
      ctx.fillRect(x, bodyTop, candleWidth, bodyHeight);

      // Wicks
      const wickX = x + candleWidth / 2;
      const wickTop = this.padding.top + chartHeight - ((candle.high - minPrice) / priceRange) * chartHeight;
      const wickBottom = this.padding.top + chartHeight - ((candle.low - minPrice) / priceRange) * chartHeight;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wickX, wickTop);
      ctx.lineTo(wickX, wickBottom);
      ctx.stroke();
    }

    // Draw title
    ctx.fillStyle = this.colors.text;
    ctx.font = 'bold 24px Arial';
    ctx.fillText(options.title || 'tvpine-cli Chart', this.padding.left, 35);

    // Draw price scale
    this._drawPriceScale(ctx, chartHeight, minPrice, maxPrice);

    // Save to file
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(filename, buffer);
    console.log(`📸 Chart saved: ${filename}`);
  }

  /**
   * Draw grid lines
   */
  _drawGrid(ctx, chartWidth, chartHeight, minPrice, maxPrice) {
    ctx.strokeStyle = this.colors.grid;
    ctx.lineWidth = 1;

    // Horizontal lines
    const numLines = 10;
    for (let i = 0; i <= numLines; i++) {
      const y = this.padding.top + (chartHeight / numLines) * i;
      ctx.beginPath();
      ctx.moveTo(this.padding.left, y);
      ctx.lineTo(this.padding.left + chartWidth, y);
      ctx.stroke();
    }

    // Vertical lines
    const numVLines = 20;
    for (let i = 0; i <= numVLines; i++) {
      const x = this.padding.left + (chartWidth / numVLines) * i;
      ctx.beginPath();
      ctx.moveTo(x, this.padding.top);
      ctx.lineTo(x, this.padding.top + chartHeight);
      ctx.stroke();
    }
  }

  /**
   * Draw price scale on right side
   */
  _drawPriceScale(ctx, chartHeight, minPrice, maxPrice) {
    ctx.fillStyle = this.colors.text;
    ctx.font = '12px Arial';

    const numLabels = 10;
    const priceRange = maxPrice - minPrice;

    for (let i = 0; i <= numLabels; i++) {
      const price = minPrice + (priceRange / numLabels) * (numLabels - i);
      const y = this.padding.top + (chartHeight / numLabels) * i;

      ctx.fillText(price.toFixed(2), this.width - this.padding.right + 10, y + 4);
    }
  }

  /**
   * Add indicator overlay
   */
  addIndicator(ctx, data, indicator, color = '#ffc107') {
    const chartWidth = this.width - this.padding.left - this.padding.right;
    const chartHeight = this.height - this.padding.top - this.padding.bottom;

    const validData = indicator.filter(v => v !== null);
    const minValue = Math.min(...validData);
    const maxValue = Math.max(...validData);
    const range = maxValue - minValue || 1;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    let started = false;
    for (let i = 0; i < indicator.length; i++) {
      if (indicator[i] === null) continue;

      const x = this.padding.left + (chartWidth / data.length) * i;
      const y = this.padding.top + chartHeight - ((indicator[i] - minValue) / range) * chartHeight;

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  }
}
