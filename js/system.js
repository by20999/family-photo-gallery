import { dom } from './dom.js';
import { fetchSystemHealth, openUploadsFolderRequest } from './api.js';
import { showStatusNotice } from './feedback.js';

function countIssues(issues = {}) {
    return Object.values(issues).reduce((total, list) => total + (Array.isArray(list) ? list.length : 0), 0);
}

function renderSystemHealth(data) {
    if (!dom.systemStatusBody) return;

    const issueCount = countIssues(data.issues);
    const duplicateCount = data.counts?.duplicateGroups || 0;
    const statusText = issueCount === 0 && duplicateCount === 0 ? '状态正常' : '需要查看';
    const statusTone = issueCount === 0 && duplicateCount === 0 ? 'good' : 'warn';

    dom.systemStatusBody.innerHTML = `
        <div class="system-status-summary ${statusTone}">
            <strong>${statusText}</strong>
            <span>${issueCount === 0 ? '没有发现丢图或孤儿缩略图' : `发现 ${issueCount} 个数据问题`}</span>
        </div>
        <div class="system-metrics">
            <div><strong>${data.counts?.photos || 0}</strong><span>照片</span></div>
            <div><strong>${data.counts?.thumbnails || 0}</strong><span>缩略图</span></div>
            <div><strong>${data.counts?.metadata || 0}</strong><span>元数据</span></div>
            <div><strong>${duplicateCount}</strong><span>重复组</span></div>
        </div>
        <div class="system-issues">
            <p>缺失原图：${data.issues?.missingFilesForMetadata?.length || 0}</p>
            <p>缺失元数据：${data.issues?.missingMetadataForFiles?.length || 0}</p>
            <p>孤儿缩略图：${data.issues?.orphanThumbnails?.length || 0}</p>
        </div>
        ${duplicateCount > 0 ? `<div class="system-duplicates">检测到 ${duplicateCount} 组重复照片，后续可在相册中手动删除不需要的副本。</div>` : ''}
    `;
}

async function refreshSystemHealth() {
    if (!dom.systemStatusBody) return;
    dom.systemStatusBody.innerHTML = '<div class="system-loading">正在检查相册数据...</div>';
    try {
        const data = await fetchSystemHealth();
        renderSystemHealth(data);
    } catch (error) {
        dom.systemStatusBody.innerHTML = `<div class="system-error">${error.message || '系统状态检查失败'}</div>`;
    }
}

export function initSystemPanel() {
    if (!dom.systemPanel || !dom.systemToggleBtn) return;

    dom.systemToggleBtn.addEventListener('click', async () => {
        const nextHidden = !dom.systemPanel.hidden;
        dom.systemPanel.hidden = nextHidden;
        dom.systemToggleBtn.setAttribute('aria-expanded', nextHidden ? 'false' : 'true');
        if (!nextHidden) await refreshSystemHealth();
    });

    dom.systemRefreshBtn?.addEventListener('click', refreshSystemHealth);

    dom.systemOpenUploadsBtn?.addEventListener('click', async () => {
        try {
            await openUploadsFolderRequest();
            showStatusNotice('已尝试打开 uploads 文件夹', { tone: 'success', duration: 1800 });
        } catch (error) {
            showStatusNotice(error.message || '打开 uploads 文件夹失败', { tone: 'error' });
        }
    });
}
