/**
 * Toast.js
 * Notification system for user feedback
 */

export class Toast {
  constructor() {
    this.container = null;
    this.activeToasts = new Set();
    this.init();
  }

  /**
   * Initialize toast container
   */
  init() {
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10001;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(this.container);
    console.log('✓ Toast system initialized');
  }

  /**
   * Show toast notification
   * @param {string} message - Toast message
   * @param {string} type - Toast type: 'success', 'error', 'warning', 'info'
   * @param {number} duration - Duration in ms (0 = no auto-dismiss)
   */
  show(message, type = 'info', duration = 3000) {
    const toast = this.createToast(message, type);
    this.container.appendChild(toast);
    this.activeToasts.add(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(0)';
      toast.style.opacity = '1';
    });

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(toast);
      }, duration);
    }

    return toast;
  }

  /**
   * Create toast element
   * @param {string} message - Toast message
   * @param {string} type - Toast type
   * @returns {HTMLElement}
   */
  createToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const colors = {
      success: { bg: '#00b894', icon: '✓' },
      error: { bg: '#ff7675', icon: '✕' },
      warning: { bg: '#fdcb6e', icon: '⚠' },
      info: { bg: '#74b9ff', icon: 'ℹ' }
    };

    const config = colors[type] || colors.info;

    toast.style.cssText = `
      background: ${config.bg};
      color: #fff;
      padding: 12px 16px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 250px;
      max-width: 400px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      transform: translateX(400px);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: auto;
      cursor: pointer;
    `;

    // Icon
    const icon = document.createElement('span');
    icon.textContent = config.icon;
    icon.style.cssText = `
      font-size: 18px;
      font-weight: bold;
      flex-shrink: 0;
    `;
    toast.appendChild(icon);

    // Message
    const text = document.createElement('span');
    text.textContent = message;
    text.style.cssText = `
      flex: 1;
      line-height: 1.4;
    `;
    toast.appendChild(text);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: #fff;
      font-size: 20px;
      cursor: pointer;
      padding: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.8;
      transition: opacity 0.2s;
      flex-shrink: 0;
    `;
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.opacity = '1';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.opacity = '0.8';
    });
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismiss(toast);
    });
    toast.appendChild(closeBtn);

    // Click to dismiss
    toast.addEventListener('click', () => {
      this.dismiss(toast);
    });

    return toast;
  }

  /**
   * Dismiss toast
   * @param {HTMLElement} toast - Toast element
   */
  dismiss(toast) {
    if (!this.activeToasts.has(toast)) return;

    toast.style.transform = 'translateX(400px)';
    toast.style.opacity = '0';

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      this.activeToasts.delete(toast);
    }, 300);
  }

  /**
   * Dismiss all toasts
   */
  dismissAll() {
    this.activeToasts.forEach(toast => {
      this.dismiss(toast);
    });
  }

  /**
   * Convenience methods
   */
  success(message, duration = 3000) {
    return this.show(message, 'success', duration);
  }

  error(message, duration = 4000) {
    return this.show(message, 'error', duration);
  }

  warning(message, duration = 3500) {
    return this.show(message, 'warning', duration);
  }

  info(message, duration = 3000) {
    return this.show(message, 'info', duration);
  }

  /**
   * Show loading toast (no auto-dismiss)
   * @param {string} message - Loading message
   * @returns {Object} Toast with update/dismiss methods
   */
  loading(message) {
    const toast = this.show(message, 'info', 0);

    // Add spinner
    const icon = toast.querySelector('span:first-child');
    icon.textContent = '⏳';
    icon.style.animation = 'spin 1s linear infinite';

    // Add spinner animation if not exists
    if (!document.getElementById('toast-spinner-style')) {
      const style = document.createElement('style');
      style.id = 'toast-spinner-style';
      style.textContent = `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    return {
      update: (newMessage) => {
        const text = toast.querySelector('span:nth-child(2)');
        if (text) text.textContent = newMessage;
      },
      dismiss: () => this.dismiss(toast),
      success: (message) => {
        this.dismiss(toast);
        return this.success(message);
      },
      error: (message) => {
        this.dismiss(toast);
        return this.error(message);
      }
    };
  }

  /**
   * Cleanup
   */
  destroy() {
    this.dismissAll();
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    console.log('✓ Toast system destroyed');
  }
}

// Create singleton instance
export const toast = new Toast();
