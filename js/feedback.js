import { dom } from './dom.js';

let hideTimer = null;
let currentAction = null;

function renderStatus(message, tone = 'info', actionLabel = '') {
    dom.galleryStatus.hidden = false;
    dom.galleryStatus.className = `gallery-status ${tone}`.trim();
    dom.galleryStatus.innerHTML = `
        <div class="gallery-status-text">${message}</div>
        ${actionLabel ? `<button class="gallery-status-action" type="button">${actionLabel}</button>` : ''}
        <button class="gallery-status-close" type="button" aria-label="关闭提示">×</button>
    `;

    const actionBtn = dom.galleryStatus.querySelector('.gallery-status-action');
    const closeBtn = dom.galleryStatus.querySelector('.gallery-status-close');

    if (actionBtn) {
        actionBtn.addEventListener('click', () => {
            const handler = currentAction;
            clearStatusNotice();
            if (typeof handler === 'function') handler();
        }, { once: true });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', clearStatusNotice, { once: true });
    }
}

export function clearStatusNotice() {
    if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }
    currentAction = null;
    dom.galleryStatus.hidden = true;
    dom.galleryStatus.className = 'gallery-status';
    dom.galleryStatus.innerHTML = '';
}

export function showStatusNotice(message, options = {}) {
    const {
        tone = 'info',
        duration = tone === 'error' ? 0 : 3200,
        actionLabel = '',
        onAction = null
    } = options;

    if (!message) {
        clearStatusNotice();
        return;
    }

    if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }

    currentAction = onAction;
    renderStatus(message, tone, actionLabel);

    if (duration > 0) {
        hideTimer = setTimeout(() => {
            clearStatusNotice();
        }, duration);
    }
}
