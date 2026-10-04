// Notification Manager with deduplication, queue throttling, and limit management

export class NotificationManager {
  constructor(containerElement) {
    this.container = containerElement;
    this.queue = [];
    this.activeToasts = [];
    this.maxActive = 3;
    this.recentKeys = new Map(); // text -> timestamp
    this.isProcessing = false;
    this.quietMode = false;
  }

  push(text, type = 'info', force = false) {
    if (this.quietMode && !force) return;

    // Ambient news never queues behind real events, and the queue stays short at high speed
    if (!force) {
      if (type === 'minor' && (this.queue.length > 0 || this.activeToasts.length >= this.maxActive)) return;
      if (this.queue.length >= 8) return;
    }

    // Deduplicate: Don't repeat the exact same notification within 15 seconds
    const now = Date.now();
    if (this.recentKeys.has(text)) {
      const lastTime = this.recentKeys.get(text);
      if (now - lastTime < 15000 && !force) {
        return; // Suppress duplicate
      }
    }
    this.recentKeys.set(text, now);

    this.queue.push({ text, type });
    this.processQueue();
  }

  processQueue() {
    if (this.queue.length === 0 || this.activeToasts.length >= this.maxActive || this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    const item = this.queue.shift();

    const toast = document.createElement('div');
    toast.className = `toast toast-${item.type}`;
    toast.innerHTML = `
      <span class="toast-content">${item.text}</span>
      <button class="toast-close" title="Dismiss">&times;</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    const dismiss = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => {
        toast.remove();
        const idx = this.activeToasts.indexOf(toast);
        if (idx !== -1) this.activeToasts.splice(idx, 1);
        this.processQueue();
      }, 300);
    };

    closeBtn.addEventListener('click', dismiss);
    this.container.appendChild(toast);
    this.activeToasts.push(toast);

    // Auto dismiss after 4.5 seconds
    setTimeout(dismiss, 4500);

    setTimeout(() => {
      this.isProcessing = false;
      this.processQueue();
    }, 700); // 700ms pacing between notifications
  }

  clearAll() {
    this.queue = [];
    for (const t of this.activeToasts) {
      t.remove();
    }
    this.activeToasts = [];
  }
}
