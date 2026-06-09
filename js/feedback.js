import { dom } from './dom.js';

let hideTimer = null;
let currentAction = null;

function getStatusHost() {
    return dom.globalStatus || dom.galleryStatus;
}

function renderStatus(message, tone = 'info', actionLabel = '') {
    const host = getStatusHost();
    if (!host) return;

    host.hidden = false;
    host.className = `gallery-status global-status ${tone}`.trim();
    host.replaceChildren();

    const textNode = document.createElement('div');
    textNode.className = 'gallery-status-text';
    textNode.textContent = message;
    host.appendChild(textNode);

    if (actionLabel) {
        const actionButton = document.createElement('button');
        actionButton.className = 'gallery-status-action';
        actionButton.type = 'button';
        actionButton.textContent = actionLabel;
        host.appendChild(actionButton);
    }

    const closeButton = document.createElement('button');
    closeButton.className = 'gallery-status-close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', '关闭提示');
    closeButton.textContent = '×';
    host.appendChild(closeButton);

    const actionBtn = host.querySelector('.gallery-status-action');
    const closeBtn = host.querySelector('.gallery-status-close');

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
    const host = getStatusHost();
    if (!host) return;

    if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }
    currentAction = null;
    host.hidden = true;
    host.className = 'gallery-status global-status';
    host.innerHTML = '';
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
