import { dom } from './dom.js';
import { state, setPhotos, setVisiblePhotos, setLocalUploadPreviews, GALLERY_IMAGE_PLACEHOLDER, MAX_PARALLEL_IMAGE_LOADS, IMAGE_RETRY_LIMIT } from './state.js';
import { fetchPhotos, reorderPhotos, createGroup, renameGroup, updateBatchPhotoCaption, updatePhotoFavorite } from './api.js';
import { escapeHtml, formatUploadMonth, formatUploadDate } from './utils.js';
import { showStatusNotice, clearStatusNotice } from './feedback.js';

const DEFAULT_GROUP_NAME = '\u5168\u90e8\u56fe\u7247';
const UNGROUPED_GROUP_NAME = '\u672a\u5206\u7ec4';
const SORT_LABELS = { custom: '\u624b\u52a8\u987a\u5e8f', newest: '\u6700\u65b0\u4e0a\u4f20', oldest: '\u6700\u65e9\u4e0a\u4f20', name: '\u6309\u540d\u79f0' };
const CONTENT_FILTER_LABELS = { all: '\u5168\u90e8\u7167\u7247', captioned: '\u4ec5\u770b\u6709\u7b80\u4ecb', favorites: '\u4ec5\u770b\u6536\u85cf' };
const MEMORY_CARD_LIMIT = 6;

let openLightboxHandler = () => {};
let openBatchDeleteModalHandler = () => {};
let openGroupDeleteModalHandler = () => {};

function normalizeCompare(value) {
    return String(value || '').trim().toLowerCase();
}

function getPhotoLikeCount(photo) {
    const reactions = photo.reactions || {};
    return (photo.likes || 0) + (reactions['\u2764\ufe0f'] || 0) + (reactions['\ud83d\udc4d'] || 0);
}

export function getPhotoGroupName(photo) {
    return typeof photo.groupName === 'string' ? photo.groupName.trim() : '';
}

function getAllPhotos() {
    return [...state.localUploadPreviews, ...state.photos];
}

function getPersistedPhotos() {
    return [...state.photos];
}

function isHomeView() {
    return state.activeGroupName === DEFAULT_GROUP_NAME
        && state.contentFilter === 'all'
        && !state.searchKeyword.trim()
        && !state.activeTagFilter
        && !state.batchMode;
}

function getRecentMemoryPhotos() {
    return [...getPersistedPhotos()]
        .sort((a, b) => (b.uploadTime || 0) - (a.uploadTime || 0))
        .slice(0, MEMORY_CARD_LIMIT);
}

function getTodayMemoryPhotos() {
    const now = new Date();
    const month = now.getMonth();
    const day = now.getDate();
    const year = now.getFullYear();
    return [...getPersistedPhotos()]
        .filter((photo) => {
            const date = new Date(photo.uploadTime);
            return !Number.isNaN(date.getTime())
                && date.getMonth() === month
                && date.getDate() === day
                && date.getFullYear() < year;
        })
        .sort((a, b) => (b.uploadTime || 0) - (a.uploadTime || 0))
        .slice(0, MEMORY_CARD_LIMIT);
}

function getCustomGroups() {
    return [...new Set(getAllPhotos().map((photo) => getPhotoGroupName(photo)).filter(Boolean))];
}

function getGroupItems(groupName) {
    return getAllPhotos().filter((photo) => getPhotoGroupName(photo) === groupName);
}

function getGroupSummaries() {
    const allPhotos = getAllPhotos();
    const summaries = [{ name: DEFAULT_GROUP_NAME, count: allPhotos.length, coverPhoto: allPhotos[0] || null }];
    getCustomGroups().forEach((groupName) => {
        const items = getGroupItems(groupName);
        const coverPhotoId = items.find((photo) => photo.groupCoverPhotoId)?.groupCoverPhotoId || '';
        const coverPhoto = items.find((photo) => photo.id === coverPhotoId) || items[0] || null;
        summaries.push({ name: groupName, count: items.length, coverPhoto });
    });
    return summaries;
}

function renderUploadGroupOptions() {
    const previousValue = dom.uploadGroupSelect.value;
    const groupNames = getCustomGroups();
    dom.uploadGroupSelect.innerHTML = '<option value="">\u4e0d\u52a0\u5165\u5206\u7ec4</option>';
    groupNames.forEach((groupName) => {
        const option = document.createElement('option');
        option.value = groupName;
        option.textContent = `\u52a0\u5165\u5206\u7ec4\uff1a${groupName}`;
        dom.uploadGroupSelect.appendChild(option);
    });
    if (previousValue && groupNames.includes(previousValue)) dom.uploadGroupSelect.value = previousValue;
}

function getSearchableText(photo) {
    return [photo.name, photo.caption, (photo.tags || []).join(' '), getPhotoGroupName(photo), formatUploadMonth(photo.uploadTime)].join(' ').toLowerCase();
}

function getSortLabel(mode = state.sortMode) {
    return SORT_LABELS[mode] || SORT_LABELS.custom;
}

function getContentFilterLabel(mode = state.contentFilter) {
    return CONTENT_FILTER_LABELS[mode] || CONTENT_FILTER_LABELS.all;
}

function matchesContentFilter(photo) {
    if (state.contentFilter === 'captioned') return Boolean((photo.caption || '').trim());
    if (state.contentFilter === 'favorites') return Boolean(photo.favorited);
    return true;
}

function matchesTagFilter(photo) {
    const activeTag = normalizeCompare(state.activeTagFilter);
    if (!activeTag) return true;
    return (photo.tags || []).some((tag) => normalizeCompare(tag) === activeTag);
}

function highlightText(text) {
    const raw = String(text || '');
    const keyword = state.searchKeyword.trim();
    if (!keyword) return escapeHtml(raw);
    const lowerRaw = raw.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();
    if (!lowerRaw.includes(lowerKeyword)) return escapeHtml(raw);

    let result = '';
    let cursor = 0;
    while (cursor < raw.length) {
        const index = lowerRaw.indexOf(lowerKeyword, cursor);
        if (index === -1) {
            result += escapeHtml(raw.slice(cursor));
            break;
        }
        result += escapeHtml(raw.slice(cursor, index));
        result += `<mark class="search-highlight">${escapeHtml(raw.slice(index, index + keyword.length))}</mark>`;
        cursor = index + keyword.length;
    }
    return result;
}

function buildFilterChip(labelHtml, attributeName, value, active = false) {
    return `<button class="card-tag filter-chip${active ? ' active' : ''}" type="button" ${attributeName}="${escapeHtml(value)}">${labelHtml}</button>`;
}

function buildSearchMatchHint(photo) {
    const keyword = normalizeCompare(state.searchKeyword);
    if (!keyword) return '';
    const matches = [];
    if (normalizeCompare(photo.name).includes(keyword)) matches.push('\u6587\u4ef6\u540d');
    if (normalizeCompare(photo.caption).includes(keyword)) matches.push('\u7b80\u4ecb');
    if ((photo.tags || []).some((tag) => normalizeCompare(tag).includes(keyword))) matches.push('\u6807\u7b7e');
    if (normalizeCompare(getPhotoGroupName(photo)).includes(keyword)) matches.push('\u5206\u7ec4');
    if (matches.length === 0) return '';
    return `<div class="card-search-note">\u5339\u914d\uff1a${matches.slice(0, 3).join(' / ')}</div>`;
}

function sortPhotoList(photos) {
    const list = [...photos];
    if (state.sortMode === 'newest') return list.sort((a, b) => (b.uploadTime || 0) - (a.uploadTime || 0));
    if (state.sortMode === 'oldest') return list.sort((a, b) => (a.uploadTime || 0) - (b.uploadTime || 0));
    if (state.sortMode === 'name') return list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN', { numeric: true, sensitivity: 'base' }));
    return list;
}

function getActiveGroupPhotos() {
    const photos = state.activeGroupName === DEFAULT_GROUP_NAME ? getAllPhotos() : getGroupItems(state.activeGroupName);
    return sortPhotoList(photos.filter((photo) => matchesContentFilter(photo) && matchesTagFilter(photo)));
}

function buildGroups() {
    const keyword = state.searchKeyword.trim().toLowerCase();
    if (keyword || state.activeTagFilter) {
        const grouped = new Map();
        getAllPhotos().filter((photo) => matchesContentFilter(photo) && matchesTagFilter(photo) && (!keyword || getSearchableText(photo).includes(keyword))).forEach((photo) => {
            const key = getPhotoGroupName(photo) || UNGROUPED_GROUP_NAME;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(photo);
        });
        return [...grouped.entries()].map(([title, items]) => ({ title, items: sortPhotoList(items) }));
    }
    return [{ title: state.activeGroupName === DEFAULT_GROUP_NAME ? '' : state.activeGroupName, items: getActiveGroupPhotos() }];
}

function updateHeaderStats(totalCount, filteredCount) {
    const pieces = [`\u5171 ${totalCount} \u5f20\u7167\u7247`];
    if (state.localUploadPreviews.length > 0) pieces.push(`\u4e0a\u4f20\u4e2d ${state.localUploadPreviews.length} \u5f20`);
    if (state.activeGroupName !== DEFAULT_GROUP_NAME) pieces.push(`\u5f53\u524d\u5206\u7ec4\uff1a${state.activeGroupName}`);
    if (state.activeTagFilter) pieces.push(`\u6807\u7b7e\u7b5b\u9009\uff1a#${state.activeTagFilter}`);
    if (state.searchKeyword.trim()) pieces.push(`\u641c\u7d22\u201c${state.searchKeyword.trim()}\u201d\u5171 ${filteredCount} \u5f20`);
    if (state.sortMode !== 'custom') pieces.push(`\u6392\u5e8f\uff1a${getSortLabel()}`);
    if (state.contentFilter !== 'all') pieces.push(getContentFilterLabel());
    dom.headerStats.textContent = pieces.join(' · ');
}
function getGroupPromptMessage() {
    const groupNames = getCustomGroups();
    if (groupNames.length === 0) return '\u8bf7\u8f93\u5165\u5206\u7ec4\u540d\u79f0';
    const previewNames = groupNames.slice(0, 6).join('\u3001');
    const suffix = groupNames.length > 6 ? ` \u7b49 ${groupNames.length} \u4e2a\u5206\u7ec4` : '';
    return `\u8f93\u5165\u65b0\u5206\u7ec4\u540d\u79f0\uff0c\u6216\u8f93\u5165\u5df2\u6709\u5206\u7ec4\u540d\u628a\u7167\u7247\u52a0\u5165\u8be5\u5206\u7ec4\u3002\n\u5df2\u6709\u5206\u7ec4\uff1a${previewNames}${suffix}`;
}

function clearSearchAndTagFilters() {
    dom.searchInput.value = '';
    state.searchKeyword = '';
    state.activeTagFilter = '';
    renderGallery();
}

export function applyGroupFilter(groupName) {
    state.activeGroupName = groupName && String(groupName).trim() ? String(groupName).trim() : DEFAULT_GROUP_NAME;
    state.searchKeyword = '';
    state.activeTagFilter = '';
    dom.searchInput.value = '';
    renderGallery();
}

export function applyTagFilter(tag) {
    const keyword = String(tag || '').trim();
    if (!keyword) return;
    state.activeGroupName = DEFAULT_GROUP_NAME;
    state.searchKeyword = '';
    state.activeTagFilter = keyword;
    dom.searchInput.value = '';
    renderGallery();
}

function renderGroupNav() {
    dom.groupNav.innerHTML = '';
    getGroupSummaries().forEach((summary) => {
        const button = document.createElement('button');
        button.className = 'group-nav-card';
        button.type = 'button';
        button.setAttribute('aria-pressed', summary.name === state.activeGroupName ? 'true' : 'false');
        if (summary.name === state.activeGroupName) button.classList.add('active');

        const cover = document.createElement('div');
        cover.className = 'group-nav-cover';
        if (summary.coverPhoto) {
            const coverImg = document.createElement('img');
            coverImg.src = summary.coverPhoto.thumbSrc || summary.coverPhoto.src || GALLERY_IMAGE_PLACEHOLDER;
            coverImg.alt = `${summary.name} \u5c01\u9762`;
            cover.appendChild(coverImg);
        } else {
            const fallback = document.createElement('div');
            fallback.className = 'group-nav-cover-fallback';
            fallback.textContent = summary.name === DEFAULT_GROUP_NAME ? '\u5168' : summary.name.slice(0, 1);
            cover.appendChild(fallback);
        }

        const meta = document.createElement('div');
        meta.className = 'group-nav-meta';
        const title = document.createElement('strong');
        title.className = 'group-nav-title';
        title.textContent = summary.name;
        const count = document.createElement('span');
        count.className = 'group-nav-count';
        count.textContent = `${summary.count} \u5f20`;
        meta.appendChild(title);
        meta.appendChild(count);
        button.appendChild(cover);
        button.appendChild(meta);
        button.addEventListener('click', () => applyGroupFilter(summary.name));
        dom.groupNav.appendChild(button);
    });
}

function canManageActiveGroup() {
    return state.activeGroupName !== DEFAULT_GROUP_NAME && !state.searchKeyword.trim() && !state.activeTagFilter && !state.batchMode;
}

function buildMemoryCard(photo) {
    const caption = photo.caption ? escapeHtml(photo.caption) : '<span class="memory-card-empty">\u8fd8\u6ca1\u5199\u6545\u4e8b</span>';
    const dateLabel = formatUploadDate(photo.uploadTime) || '\u672a\u8bb0\u5f55\u65e5\u671f';
    return `
        <button class="memory-card" type="button" data-memory-photo-id="${escapeHtml(photo.id)}">
            <div class="memory-card-cover">
                <img src="${escapeHtml(photo.thumbSrc || photo.src || GALLERY_IMAGE_PLACEHOLDER)}" alt="${escapeHtml(photo.name || '\u5bb6\u5ead\u7167\u7247')}" loading="lazy">
                ${photo.favorited ? '<span class=\"memory-card-badge\">\u2605 \u6536\u85cf</span>' : ''}
            </div>
            <div class="memory-card-meta">
                <strong>${escapeHtml(photo.name || '\u5bb6\u5ead\u7167\u7247')}</strong>
                <span>${escapeHtml(dateLabel)}</span>
                <p>${caption}</p>
            </div>
        </button>
    `;
}

function renderMemoryStrip(container, photos, emptyText) {
    if (!container) return;
    if (!Array.isArray(photos) || photos.length === 0) {
        container.innerHTML = `<div class="memory-empty">${escapeHtml(emptyText)}</div>`;
        return;
    }
    container.innerHTML = photos.map((photo) => buildMemoryCard(photo)).join('');
    container.querySelectorAll('[data-memory-photo-id]').forEach((button) => {
        button.addEventListener('click', () => openPhotoById(button.dataset.memoryPhotoId));
    });
}

function renderMemoryBoard() {
    if (!dom.memoryBoard || !dom.memoryRecentList || !dom.memoryTodayList) return;
    if (!isHomeView()) {
        dom.memoryBoard.hidden = true;
        return;
    }

    const recentPhotos = getRecentMemoryPhotos();
    const todayPhotos = getTodayMemoryPhotos();
    if (recentPhotos.length === 0 && todayPhotos.length === 0) {
        dom.memoryBoard.hidden = true;
        return;
    }

    dom.memoryBoard.hidden = false;
    renderMemoryStrip(dom.memoryRecentList, recentPhotos, '\u4e0a\u4f20\u51e0\u5f20\u65b0\u7167\u7247\u540e\uff0c\u8fd9\u91cc\u4f1a\u81ea\u52a8\u66f4\u65b0\u3002');
    renderMemoryStrip(dom.memoryTodayList, todayPhotos, '\u4eca\u5e74\u7684\u4eca\u5929\u8fd8\u6ca1\u6709\u627e\u5230\u5f80\u5e74\u56de\u5fc6\u3002');
}

function clearDragOverState() {
    document.querySelectorAll('.photo-card.drag-over-before, .photo-card.drag-over-after').forEach((item) => {
        item.classList.remove('drag-over-before', 'drag-over-after');
    });
}

function getDropInsertAfter(card, event) {
    const rect = card.getBoundingClientRect();
    const useHorizontal = window.innerWidth > 768;
    return useHorizontal
        ? event.clientX > rect.left + rect.width / 2
        : event.clientY > rect.top + rect.height / 2;
}

function getPhotoById(photoId) {
    return state.photos.find((photo) => photo.id === photoId) || state.visiblePhotos.find((photo) => photo.id === photoId) || null;
}

function renderGroupActions() {
    const visible = canManageActiveGroup();
    dom.groupActions.hidden = !visible;
    if (!visible) return;
    dom.renameGroupBtn.textContent = `\u91cd\u547d\u540d\u201c${state.activeGroupName}\u201d`;
    dom.deleteGroupBtn.textContent = `\u5220\u9664\u201c${state.activeGroupName}\u201d`;
}

function updateSearchHint(filteredCount) {
    const tips = [];
    if (state.activeTagFilter) tips.push(`\u6b63\u5728\u6309\u6807\u7b7e #${state.activeTagFilter} \u7cbe\u786e\u7b5b\u9009\uff0c\u5171 ${filteredCount} \u5f20\u3002`);
    if (state.searchKeyword.trim()) tips.push(`\u6b63\u5728\u641c\u7d22\u201c${state.searchKeyword.trim()}\u201d\uff0c\u7ed3\u679c\u4f1a\u6309\u5206\u7ec4\u5c55\u793a\uff0c\u5e76\u5df2\u7981\u7528\u62d6\u62fd\u6392\u5e8f\u3002`);
    if (!state.searchKeyword.trim() && !state.activeTagFilter) {
        if (state.localUploadPreviews.length > 0) tips.push('\u65b0\u4e0a\u4f20\u7684\u7167\u7247\u4f1a\u5148\u4ee5\u672c\u5730\u9884\u89c8\u663e\u793a\uff0c\u4e0a\u4f20\u5b8c\u6210\u540e\u81ea\u52a8\u66ff\u6362\u6210\u6b63\u5f0f\u56fe\u7247\u3002\u4e0a\u4f20\u671f\u95f4\u5df2\u7981\u7528\u62d6\u62fd\u6392\u5e8f\u3002');
        else if (state.batchMode) tips.push('\u6279\u91cf\u6a21\u5f0f\u4e0b\u5df2\u7981\u7528\u62d6\u62fd\u6392\u5e8f\uff0c\u907f\u514d\u548c\u591a\u9009\u64cd\u4f5c\u51b2\u7a81\u3002');
        else if (state.activeGroupName !== DEFAULT_GROUP_NAME) tips.push(`\u5f53\u524d\u6b63\u5728\u67e5\u770b\u201c${state.activeGroupName}\u201d\u5206\u7ec4\u3002\u82e5\u8be5\u5206\u7ec4\u7167\u7247\u5168\u90e8\u5220\u9664\uff0c\u5bfc\u822a\u91cc\u4f1a\u81ea\u52a8\u79fb\u9664\u5b83\u3002`);
        else if (state.reorderSaving) tips.push('\u6b63\u5728\u4fdd\u5b58\u65b0\u7684\u7167\u7247\u987a\u5e8f...');
        else {
            tips.push(`\u53ef\u4ee5\u76f4\u63a5\u641c\u7d22\u5206\u7ec4\u540d\u3001\u7167\u7247\u540d\u79f0\u3001\u63cf\u8ff0\u6216\u6807\u7b7e\u3002\u5f53\u524d\u5171 ${filteredCount} \u5f20\u3002`);
            tips.push('\u70b9\u51fb\u5361\u7247\u4e0a\u7684\u6807\u7b7e\u53ef\u76f4\u63a5\u7b5b\u9009\u3002');
            if (canDragReorder()) tips.push('\u5168\u90e8\u56fe\u7247\u4e0b\u652f\u6301\u9f20\u6807\u62d6\u52a8\u6392\u5e8f\u3002');
        }
    }
    if (state.sortMode !== 'custom') tips.push(`\u5f53\u524d\u6309\u201c${getSortLabel()}\u201d\u6392\u5e8f\u3002`);
    if (state.contentFilter === 'favorites') tips.push('\u5df2\u5207\u6362\u5230\u6536\u85cf\u89c6\u56fe\uff0c\u53d6\u6d88\u661f\u6807\u540e\u4f1a\u81ea\u52a8\u4ece\u8fd9\u91cc\u79fb\u51fa\u3002');
    else if (state.contentFilter !== 'all') tips.push(`\u5df2\u542f\u7528\u201c${getContentFilterLabel()}\u201d\u3002`);
    dom.searchHint.textContent = tips.join(' ');
    dom.clearSearchBtn.hidden = !state.searchKeyword.trim() && !state.activeTagFilter;
    dom.clearSearchBtn.textContent = state.activeTagFilter ? '\u6e05\u7a7a\u7b5b\u9009' : '\u6e05\u7a7a\u641c\u7d22';
}

function canDragReorder() {
    return state.activeGroupName === DEFAULT_GROUP_NAME && state.sortMode === 'custom' && state.contentFilter === 'all' && !state.batchMode && !state.searchKeyword.trim() && !state.activeTagFilter && !state.reorderSaving && state.localUploadPreviews.length === 0;
}

function movePhotoToTarget(photoList, draggedId, targetId, insertAfter = false) {
    const fromIndex = photoList.findIndex((photo) => photo.id === draggedId);
    const toIndex = photoList.findIndex((photo) => photo.id === targetId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return false;
    const nextPhotos = [...photoList];
    const [dragged] = nextPhotos.splice(fromIndex, 1);
    const adjustedTargetIndex = nextPhotos.findIndex((photo) => photo.id === targetId);
    if (adjustedTargetIndex === -1) return false;
    nextPhotos.splice(adjustedTargetIndex + (insertAfter ? 1 : 0), 0, dragged);
    setPhotos(nextPhotos);
    setVisiblePhotos([...nextPhotos]);
    return true;
}

async function persistPhotoOrder() {
    state.reorderSaving = true;
    updateSearchHint(state.visiblePhotos.length);
    try {
        await reorderPhotos(state.photos.map((photo) => photo.id));
        showStatusNotice('\u7167\u7247\u987a\u5e8f\u5df2\u4fdd\u5b58', { tone: 'success', duration: 1800 });
    } catch (error) {
        console.error('\u4fdd\u5b58\u6392\u5e8f\u5931\u8d25:', error);
        showStatusNotice('\u7167\u7247\u987a\u5e8f\u4fdd\u5b58\u5931\u8d25\uff0c\u5df2\u6062\u590d\u5230\u6700\u8fd1\u4e00\u6b21\u4fdd\u5b58\u7684\u987a\u5e8f\u3002', {
            tone: 'error',
            actionLabel: '\u91cd\u65b0\u52a0\u8f7d',
            onAction: () => loadPhotos()
        });
        await loadPhotos();
    } finally {
        state.reorderSaving = false;
        renderGallery();
    }
}
function clearImageLoadQueue() {
    state.imageLoadQueue.length = 0;
}

function finishImageLoad() {
    state.activeImageLoads = Math.max(0, state.activeImageLoads - 1);
    flushImageLoadQueue();
}

function markImageLoaded(img) {
    img.dataset.loading = 'done';
    img.classList.remove('lazy', 'loading-error');
    img.classList.add('loaded');
}

function markImageFailed(img) {
    img.dataset.loading = 'failed';
    img.classList.remove('lazy');
    img.classList.add('loading-error');
}

function queueImageLoad(img) {
    if (!img || !img.dataset.src) return;
    const currentState = img.dataset.loading;
    if (currentState === 'queued' || currentState === 'loading' || currentState === 'done') return;
    img.dataset.loading = 'queued';
    state.imageLoadQueue.push(img);
    flushImageLoadQueue();
}

function flushImageLoadQueue() {
    while (state.activeImageLoads < MAX_PARALLEL_IMAGE_LOADS && state.imageLoadQueue.length > 0) {
        const img = state.imageLoadQueue.shift();
        if (!img || !img.isConnected || !img.dataset.src || img.dataset.loading === 'done') continue;
        state.activeImageLoads += 1;
        const retryCount = Number(img.dataset.retryCount || '0');
        const requestSrc = retryCount === 0 ? img.dataset.src : `${img.dataset.src}${img.dataset.src.includes('?') ? '&' : '?'}retry=${retryCount}`;
        img.dataset.loading = 'loading';
        img.onload = () => {
            img.onload = null;
            img.onerror = null;
            markImageLoaded(img);
            finishImageLoad();
        };
        img.onerror = () => {
            img.onload = null;
            img.onerror = null;
            if (retryCount < IMAGE_RETRY_LIMIT) {
                img.dataset.retryCount = String(retryCount + 1);
                img.dataset.loading = 'idle';
                queueImageLoad(img);
            } else {
                markImageFailed(img);
            }
            finishImageLoad();
        };
        img.src = requestSrc;
    }
}

function getSelectableVisiblePhotos() {
    return state.visiblePhotos.filter((photo) => !photo.isLocalPreview);
}

function syncBatchSelectionToVisible() {
    const visibleIds = new Set(getSelectableVisiblePhotos().map((photo) => photo.id));
    [...state.selectedIds].forEach((photoId) => {
        if (!visibleIds.has(photoId)) state.selectedIds.delete(photoId);
    });
}

function areAllSelectablePhotosSelected() {
    const selectablePhotos = getSelectableVisiblePhotos();
    return selectablePhotos.length > 0 && selectablePhotos.every((photo) => state.selectedIds.has(photo.id));
}

function updateBatchCount() {
    const selectedCount = state.selectedIds.size;
    const selectableCount = getSelectableVisiblePhotos().length;
    const disabled = selectedCount === 0;
    dom.batchCount.textContent = `\u5df2\u9009 ${selectedCount} \u5f20`;
    dom.batchDeleteBtn.disabled = disabled;
    dom.batchGroupBtn.disabled = disabled;
    dom.batchCaptionBtn.disabled = disabled;
    dom.batchSelectAllBtn.disabled = selectableCount === 0;
    dom.batchSelectAllBtn.textContent = areAllSelectablePhotosSelected() ? '\u53d6\u6d88\u5168\u9009' : '\u5168\u9009\u5f53\u524d\u7ed3\u679c';
}

function bindCardFilterChips(container) {
    container.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-filter-tag], [data-filter-group]');
        if (!chip) return;
        event.stopPropagation();
        if (chip.dataset.filterTag) applyTagFilter(chip.dataset.filterTag);
        else if (chip.dataset.filterGroup) applyGroupFilter(chip.dataset.filterGroup);
    });
}

async function promptBatchGroupAssignment() {
    if (state.selectedIds.size === 0) {
        showStatusNotice('\u8bf7\u5148\u9009\u62e9\u8981\u52a0\u5165\u5206\u7ec4\u7684\u7167\u7247', { tone: 'info', duration: 2200 });
        return;
    }
    const defaultGroupName = state.activeGroupName !== DEFAULT_GROUP_NAME ? state.activeGroupName : '';
    const name = window.prompt(getGroupPromptMessage(), defaultGroupName);
    const groupName = name ? name.trim() : '';
    if (!groupName) return;
    try {
        const data = await createGroup(groupName, [...state.selectedIds]);
        state.activeGroupName = data.groupName;
        state.searchKeyword = '';
        state.activeTagFilter = '';
        dom.searchInput.value = '';
        exitBatchMode();
        await loadPhotos();
        showStatusNotice(`\u5df2\u66f4\u65b0\u5206\u7ec4\u201c${data.groupName}\u201d`, { tone: 'success' });
    } catch (error) {
        console.error('\u5206\u7ec4\u64cd\u4f5c\u5931\u8d25:', error);
        showStatusNotice(error.message || '\u5206\u7ec4\u64cd\u4f5c\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5', { tone: 'error' });
    }
}

async function promptBatchCaptionUpdate() {
    if (state.selectedIds.size === 0) {
        showStatusNotice('\u8bf7\u5148\u9009\u62e9\u8981\u5199\u7b80\u4ecb\u7684\u7167\u7247', { tone: 'info', duration: 2200 });
        return;
    }
    const raw = window.prompt(`\u7ed9\u9009\u4e2d\u7684 ${state.selectedIds.size} \u5f20\u7167\u7247\u8bbe\u7f6e\u7edf\u4e00\u7b80\u4ecb\uff0c\u7559\u7a7a\u53ef\u4ee5\u6e05\u9664\u3002`, '');
    if (raw === null) return;
    const caption = raw.trim().slice(0, 80);
    try {
        await updateBatchPhotoCaption([...state.selectedIds], caption);
        exitBatchMode();
        await loadPhotos();
        showStatusNotice('\u6279\u91cf\u7b80\u4ecb\u5df2\u66f4\u65b0', { tone: 'success' });
    } catch (error) {
        console.error('\u6279\u91cf\u66f4\u65b0\u7b80\u4ecb\u5931\u8d25:', error);
        showStatusNotice(error.message || '\u6279\u91cf\u66f4\u65b0\u7b80\u4ecb\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5', { tone: 'error' });
    }
}

export function showLocalUploadPreviews(previews, nextActiveGroupName = DEFAULT_GROUP_NAME) {
    setLocalUploadPreviews(Array.isArray(previews) ? previews : []);
    state.activeGroupName = nextActiveGroupName && String(nextActiveGroupName).trim() ? String(nextActiveGroupName).trim() : DEFAULT_GROUP_NAME;
    state.searchKeyword = '';
    state.activeTagFilter = '';
    dom.searchInput.value = '';
    renderGallery();
}

export function clearLocalUploadPreviews(ids) {
    if (Array.isArray(ids) && ids.length > 0) {
        const previewIds = new Set(ids);
        setLocalUploadPreviews(state.localUploadPreviews.filter((photo) => !previewIds.has(photo.id)));
    } else {
        setLocalUploadPreviews([]);
    }
    renderGallery();
}

export function prependUploadedPhotos(photos) {
    if (!Array.isArray(photos) || photos.length === 0) return;
    const baseTime = Date.now();
    const normalized = photos.map((photo, index) => ({ likes: 0, commentsCount: 0, reactions: {}, uploadTime: photo.uploadTime || baseTime + index, ...photo }));
    const newIds = new Set(normalized.map((photo) => photo.id));
    setPhotos([...normalized, ...state.photos.filter((photo) => !newIds.has(photo.id))]);
    renderGallery();
}

export async function togglePhotoFavorite(photoId, options = {}) {
    const photo = getPhotoById(photoId);
    if (!photo || photo.isLocalPreview) return Boolean(photo?.favorited);

    const previousFavorited = Boolean(photo.favorited);
    const nextFavorited = typeof options.force === 'boolean' ? options.force : !previousFavorited;
    updatePhotoInStore(photoId, { favorited: nextFavorited });
    renderGallery();

    try {
        const result = await updatePhotoFavorite(photoId, nextFavorited);
        const resolvedFavorited = Boolean(result?.favorited);
        updatePhotoInStore(photoId, { favorited: resolvedFavorited });
        renderGallery();
        if (!options.skipNotice) showStatusNotice(resolvedFavorited ? '\u5df2\u52a0\u5165\u6536\u85cf' : '\u5df2\u53d6\u6d88\u6536\u85cf', { tone: 'success', duration: 1800 });
        return resolvedFavorited;
    } catch (error) {
        updatePhotoInStore(photoId, { favorited: previousFavorited });
        renderGallery();
        if (!options.skipNotice) showStatusNotice(error.message || '\u6536\u85cf\u64cd\u4f5c\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5', { tone: 'error' });
        throw error;
    }
}

export function openPhotoById(photoId) {
    const targetPhoto = getPhotoById(photoId);
    if (!targetPhoto) {
        showStatusNotice('\u8fd9\u5f20\u7167\u7247\u6682\u65f6\u65e0\u6cd5\u6253\u5f00\uff0c\u8bf7\u5237\u65b0\u540e\u91cd\u8bd5\u3002', { tone: 'error' });
        return;
    }

    state.activeGroupName = DEFAULT_GROUP_NAME;
    state.searchKeyword = '';
    state.activeTagFilter = '';
    state.contentFilter = 'all';
    dom.searchInput.value = '';
    dom.contentFilterSelect.value = 'all';
    renderGallery();

    const index = state.visiblePhotos.findIndex((photo) => photo.id === photoId);
    if (index === -1) {
        showStatusNotice('\u7167\u7247\u672a\u51fa\u73b0\u5728\u5f53\u524d\u5217\u8868\u91cc\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002', { tone: 'error' });
        return;
    }
    openLightboxHandler(index);
}

function renderEmptyState() {
    const isSearching = Boolean(state.searchKeyword.trim() || state.activeTagFilter);
    const isLoadError = Boolean(state.loadErrorMessage && getAllPhotos().length === 0);
    const title = isLoadError
        ? '\u7167\u7247\u52a0\u8f7d\u5931\u8d25'
        : isSearching
            ? (state.activeTagFilter ? `\u8fd8\u6ca1\u6709\u627e\u5230\u5e26\u6709 #${state.activeTagFilter} \u7684\u7167\u7247` : '\u6ca1\u6709\u627e\u5230\u5339\u914d\u7684\u7167\u7247')
            : state.contentFilter === 'captioned'
                ? '\u8fd8\u6ca1\u6709\u5e26\u7b80\u4ecb\u7684\u7167\u7247'
                : state.contentFilter === 'favorites'
                    ? '\u8fd8\u6ca1\u6709\u6536\u85cf\u7684\u7167\u7247'
                    : state.activeGroupName !== DEFAULT_GROUP_NAME
                    ? `\u201c${state.activeGroupName}\u201d\u5206\u7ec4\u91cc\u8fd8\u6ca1\u6709\u56fe\u7247`
                    : '\u8fd9\u91cc\u8fd8\u6ca1\u6709\u5bb6\u5ead\u7167\u7247';
    const desc = isLoadError
        ? state.loadErrorMessage
        : isSearching
            ? '\u8bd5\u8bd5\u6362\u4e00\u4e2a\u5173\u952e\u8bcd\uff0c\u6216\u8005\u5148\u6e05\u7a7a\u5f53\u524d\u641c\u7d22\u4e0e\u6807\u7b7e\u7b5b\u9009\u3002'
            : state.contentFilter === 'captioned'
                ? '\u4f60\u53ef\u4ee5\u5148\u5207\u56de\u201c\u5168\u90e8\u7167\u7247\u201d\uff0c\u6216\u8005\u7ed9\u7167\u7247\u8865\u4e0a\u4e00\u53e5\u6545\u4e8b\u3002'
                : state.contentFilter === 'favorites'
                    ? '\u9047\u5230\u60f3\u5e38\u770b\u7684\u7167\u7247\u65f6\uff0c\u70b9\u4e00\u4e0b\u661f\u6807\uff0c\u5b83\u5c31\u4f1a\u51fa\u73b0\u5728\u8fd9\u91cc\u3002'
                    : state.activeGroupName !== DEFAULT_GROUP_NAME
                    ? '\u53ef\u4ee5\u5148\u4e0a\u4f20\u5230\u8fd9\u4e2a\u5206\u7ec4\uff0c\u6216\u8005\u8fd4\u56de\u5168\u90e8\u56fe\u7247\u7ee7\u7eed\u6d4f\u89c8\u3002'
                    : '\u5148\u4e0a\u4f20\u7b2c\u4e00\u5f20\u7167\u7247\u5427\uff0c\u4e4b\u540e\u53ef\u4ee5\u8865\u5145\u7b80\u4ecb\u3001\u6807\u7b7e\u548c\u5206\u7ec4\uff0c\u628a\u56de\u5fc6\u6162\u6162\u6574\u7406\u8d77\u6765\u3002';
    const actions = isLoadError
        ? '<button class="gallery-empty-action primary" type="button" data-empty-action="retry">\u91cd\u65b0\u52a0\u8f7d</button>'
        : isSearching
            ? '<button class="gallery-empty-action primary" type="button" data-empty-action="clear-filters">\u6e05\u7a7a\u7b5b\u9009</button>'
            : state.contentFilter === 'captioned'
                ? '<button class="gallery-empty-action primary" type="button" data-empty-action="clear-content-filter">\u67e5\u770b\u5168\u90e8\u7167\u7247</button>'
                : state.contentFilter === 'favorites'
                    ? '<button class="gallery-empty-action primary" type="button" data-empty-action="clear-content-filter">\u8fd4\u56de\u5168\u90e8\u7167\u7247</button>'
                    : state.activeGroupName !== DEFAULT_GROUP_NAME
                    ? '<button class="gallery-empty-action primary" type="button" data-empty-action="upload">\u4e0a\u4f20\u7167\u7247</button><button class="gallery-empty-action" type="button" data-empty-action="back-all">\u8fd4\u56de\u5168\u90e8\u56fe\u7247</button>'
                    : '<button class="gallery-empty-action primary" type="button" data-empty-action="upload">\u4e0a\u4f20\u7b2c\u4e00\u5f20\u7167\u7247</button>';
    dom.gallery.innerHTML = `
        <div class="gallery-empty">
            <div class="gallery-empty-icon">${isLoadError ? '\u26A0' : isSearching ? '\u2315' : state.contentFilter === 'captioned' ? '\u270D' : state.contentFilter === 'favorites' ? '\u2605' : '\u25A3'}</div>
            <div class="gallery-empty-title">${title}</div>
            <div class="gallery-empty-desc">${desc}</div>
            <div class="gallery-empty-actions">${actions}</div>
        </div>
    `;
    dom.gallery.querySelectorAll('[data-empty-action]').forEach((button) => {
        button.addEventListener('click', async () => {
            const action = button.dataset.emptyAction;
            if (action === 'retry') await loadPhotos();
            else if (action === 'clear-filters') clearSearchAndTagFilters();
            else if (action === 'clear-content-filter') {
                state.contentFilter = 'all';
                dom.contentFilterSelect.value = 'all';
                renderGallery();
            } else if (action === 'back-all') applyGroupFilter(DEFAULT_GROUP_NAME);
            else if (action === 'upload') dom.fileInput.click();
        });
    });
}
export function enterBatchMode() {
    state.batchMode = true;
    state.selectedIds.clear();
    dom.batchDeleteToggleBtn.classList.add('active');
    dom.batchBar.classList.add('visible');
    updateBatchCount();
    renderGallery();
}

export function exitBatchMode() {
    state.batchMode = false;
    state.selectedIds.clear();
    dom.batchDeleteToggleBtn.classList.remove('active');
    dom.batchBar.classList.remove('visible');
    renderGallery();
}

export function renderGallery() {
    const groups = buildGroups();
    setVisiblePhotos(groups.flatMap((group) => group.items));
    const visibleIndexMap = new Map(state.visiblePhotos.map((photo, index) => [photo.id, index]));
    const dragEnabled = canDragReorder();
    dom.gallery.innerHTML = '';
    clearImageLoadQueue();
    renderGroupNav();
    renderGroupActions();
    renderUploadGroupOptions();
    renderMemoryBoard();
    dom.sortSelect.value = state.sortMode;
    dom.contentFilterSelect.value = state.contentFilter;
    updateHeaderStats(getAllPhotos().length, state.visiblePhotos.length);
    updateSearchHint(state.visiblePhotos.length);
    dom.gallery.classList.toggle('drag-enabled', dragEnabled);
    dom.gallery.classList.toggle('is-sorting', Boolean(state.draggedPhotoId));
    dom.gallery.classList.toggle('sorting-pending', state.reorderSaving);
    if (state.batchMode) {
        dom.gallery.classList.add('batch-mode');
        syncBatchSelectionToVisible();
        updateBatchCount();
    } else {
        dom.gallery.classList.remove('batch-mode');
        state.selectedIds.clear();
    }
    if (state.visiblePhotos.length === 0) {
        renderEmptyState();
        return;
    }

    const fragment = document.createDocumentFragment();
    let animationIndex = 0;
    groups.forEach((group) => {
        if (group.title) {
            const groupTitle = document.createElement('div');
            groupTitle.className = 'gallery-group-title';
            groupTitle.innerHTML = `<span>${escapeHtml(group.title)}</span><em>${group.items.length} \u5f20</em>`;
            fragment.appendChild(groupTitle);
        }
        group.items.forEach((photo) => {
            const visibleIndex = visibleIndexMap.get(photo.id);
            const card = document.createElement('div');
            card.className = 'photo-card';
            if (photo.isLocalPreview) card.classList.add('upload-preview');
            if (state.batchMode && state.selectedIds.has(photo.id)) card.classList.add('selected');
            if (dragEnabled && !photo.isLocalPreview) {
                card.classList.add('draggable-card');
                card.setAttribute('draggable', 'true');
            }
            card.style.animationDelay = `${animationIndex * 0.04}s`;
            animationIndex += 1;

            const img = document.createElement('img');
            img.alt = photo.name || '\u65b0\u4e0a\u4f20\u7684\u7167\u7247';
            if (photo.isLocalPreview) {
                img.src = photo.thumbSrc || photo.src || GALLERY_IMAGE_PLACEHOLDER;
                img.dataset.loading = 'done';
                img.classList.add('loaded');
            } else {
                img.dataset.src = photo.thumbSrc || photo.src;
                img.dataset.loading = 'idle';
                img.dataset.retryCount = '0';
                img.src = GALLERY_IMAGE_PLACEHOLDER;
                img.loading = visibleIndex < 8 ? 'eager' : 'lazy';
                img.decoding = 'async';
                img.setAttribute('fetchpriority', visibleIndex < 4 ? 'high' : 'low');
                img.classList.add('lazy');
            }

            const caption = photo.caption ? `<div class="card-caption">${highlightText(photo.caption)}</div>` : '';
            const tags = (photo.tags || []).slice(0, 3).map((tag) => buildFilterChip(`#${highlightText(tag)}`, 'data-filter-tag', tag, normalizeCompare(tag) === normalizeCompare(state.activeTagFilter))).join('');
            const groupName = getPhotoGroupName(photo);
            const groupBadge = groupName ? buildFilterChip(`\u5206\u7ec4 · ${highlightText(groupName)}`, 'data-filter-group', groupName, groupName === state.activeGroupName && !state.searchKeyword.trim() && !state.activeTagFilter) : '';
            const coverBadge = groupName && photo.groupCoverPhotoId === photo.id ? '<span class="card-tag group-cover-chip">\u5206\u7ec4\u5c01\u9762</span>' : '';
            const uploadBadge = photo.isLocalPreview ? '<span class="card-tag upload-chip">\u4e0a\u4f20\u4e2d</span>' : '';
            const favoriteBadge = photo.favorited ? '<span class="card-tag favorite-chip">\u2605 \u5df2\u6536\u85cf</span>' : '';
            const reactions = photo.reactions || {};
            const reactionSummary = Object.keys(reactions).filter((emoji) => reactions[emoji] > 0).slice(0, 3).join('');
            const matchHint = buildSearchMatchHint(photo);
            const cardInfo = document.createElement('div');
            cardInfo.className = 'card-info';
            cardInfo.innerHTML = `
                <div class="card-meta-row">
                    <div class="likes-count"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span>${getPhotoLikeCount(photo)}</span></div>
                    <div class="comments-count"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>${photo.commentsCount || 0}</span></div>
                    ${reactionSummary ? `<div class="card-reactions">${reactionSummary}</div>` : ''}
                </div>
                ${caption}
                ${matchHint}
                ${(uploadBadge || favoriteBadge || coverBadge || tags || groupBadge) ? `<div class="card-tags">${uploadBadge}${favoriteBadge}${coverBadge}${groupBadge}${tags}</div>` : ''}
            `;
            bindCardFilterChips(cardInfo);
            if (!photo.isLocalPreview) {
                const favoriteBtn = document.createElement('button');
                favoriteBtn.className = `card-favorite-btn${photo.favorited ? ' active' : ''}`;
                favoriteBtn.type = 'button';
                favoriteBtn.setAttribute('aria-label', photo.favorited ? '\u53d6\u6d88\u6536\u85cf' : '\u6536\u85cf\u7167\u7247');
                favoriteBtn.textContent = photo.favorited ? '\u2605' : '\u2606';
                favoriteBtn.addEventListener('click', async (event) => {
                    event.stopPropagation();
                    try {
                        await togglePhotoFavorite(photo.id);
                    } catch (error) {
                        console.error('\u5207\u6362\u6536\u85cf\u5931\u8d25:', error);
                    }
                });
                card.appendChild(favoriteBtn);
            }
            card.appendChild(img);
            card.appendChild(cardInfo);

            if (dragEnabled && !photo.isLocalPreview) {
                card.addEventListener('dragstart', (event) => {
                    state.draggedPhotoId = photo.id;
                    state.dragMoved = false;
                    card.classList.add('dragging');
                    dom.gallery.classList.add('is-sorting');
                    clearDragOverState();
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', photo.id);
                });
                card.addEventListener('dragover', (event) => {
                    event.preventDefault();
                    if (!state.draggedPhotoId || state.draggedPhotoId === photo.id) return;
                    const insertAfter = getDropInsertAfter(card, event);
                    clearDragOverState();
                    card.classList.add(insertAfter ? 'drag-over-after' : 'drag-over-before');
                });
                card.addEventListener('dragleave', () => {
                    card.classList.remove('drag-over-before', 'drag-over-after');
                });
                card.addEventListener('drop', async (event) => {
                    event.preventDefault();
                    if (!state.draggedPhotoId || state.draggedPhotoId === photo.id) return;
                    const insertAfter = getDropInsertAfter(card, event);
                    clearDragOverState();
                    const moved = movePhotoToTarget(state.photos, state.draggedPhotoId, photo.id, insertAfter);
                    state.draggedPhotoId = null;
                    state.dragMoved = moved;
                    dom.gallery.classList.remove('is-sorting');
                    if (!moved) return;
                    renderGallery();
                    await persistPhotoOrder();
                });
                card.addEventListener('dragend', () => {
                    state.draggedPhotoId = null;
                    card.classList.remove('dragging');
                    dom.gallery.classList.remove('is-sorting');
                    clearDragOverState();
                    setTimeout(() => {
                        state.dragMoved = false;
                    }, 0);
                });
            }

            card.addEventListener('click', () => {
                if (state.dragMoved || photo.isLocalPreview) return;
                if (state.batchMode) {
                    if (state.selectedIds.has(photo.id)) { state.selectedIds.delete(photo.id); card.classList.remove('selected'); }
                    else { state.selectedIds.add(photo.id); card.classList.add('selected'); }
                    updateBatchCount();
                } else {
                    openLightboxHandler(visibleIndex);
                }
            });
            fragment.appendChild(card);
        });
    });
    dom.gallery.appendChild(fragment);
    if (state.galleryObserver) state.galleryObserver.disconnect();
    state.galleryObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => { if (entry.isIntersecting) { queueImageLoad(entry.target); state.galleryObserver.unobserve(entry.target); } });
    }, { rootMargin: '160px 0px', threshold: 0.01 });
    [...document.querySelectorAll('img.lazy')].forEach((img, index) => { if (index < 8) queueImageLoad(img); else state.galleryObserver.observe(img); });
}

export async function loadPhotos() {
    try {
        const photos = await fetchPhotos();
        setPhotos(photos);
        state.loadErrorMessage = '';
        clearStatusNotice();
        if (state.activeGroupName !== DEFAULT_GROUP_NAME && !getCustomGroups().includes(state.activeGroupName)) state.activeGroupName = DEFAULT_GROUP_NAME;
        renderGallery();
    } catch (error) {
        console.error('\u52a0\u8f7d\u56fe\u7247\u5931\u8d25:', error);
        state.loadErrorMessage = error.message || '\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5';
        showStatusNotice(state.loadErrorMessage, { tone: 'error', actionLabel: '\u91cd\u65b0\u52a0\u8f7d', onAction: () => loadPhotos() });
        if (getAllPhotos().length === 0) renderGallery();
    }
}

export function initGallery({ onOpenLightbox, onOpenBatchDeleteModal, onOpenGroupDeleteModal }) {
    openLightboxHandler = onOpenLightbox;
    openBatchDeleteModalHandler = onOpenBatchDeleteModal;
    openGroupDeleteModalHandler = onOpenGroupDeleteModal;

    dom.batchDeleteToggleBtn.addEventListener('click', () => {
        if (state.batchMode) exitBatchMode();
        else enterBatchMode();
    });

    dom.batchCancelBtn.addEventListener('click', exitBatchMode);

    dom.batchSelectAllBtn.addEventListener('click', () => {
        const selectablePhotos = getSelectableVisiblePhotos();
        const allSelected = selectablePhotos.length > 0
            && selectablePhotos.every((photo) => state.selectedIds.has(photo.id));
        if (allSelected) state.selectedIds.clear();
        else selectablePhotos.forEach((photo) => state.selectedIds.add(photo.id));
        updateBatchCount();
        renderGallery();
    });

    dom.batchGroupBtn.addEventListener('click', promptBatchGroupAssignment);
    dom.batchCaptionBtn.addEventListener('click', promptBatchCaptionUpdate);

    dom.batchDeleteBtn.addEventListener('click', () => {
        if (state.selectedIds.size === 0) return;
        openBatchDeleteModalHandler();
    });

    dom.searchInput.addEventListener('input', () => {
        state.searchKeyword = dom.searchInput.value.trim();
        if (state.searchKeyword) state.activeTagFilter = '';
        renderGallery();
    });

    dom.sortSelect.addEventListener('change', () => {
        state.sortMode = dom.sortSelect.value || 'custom';
        renderGallery();
    });

    dom.contentFilterSelect.addEventListener('change', () => {
        state.contentFilter = dom.contentFilterSelect.value || 'all';
        renderGallery();
    });

    dom.clearSearchBtn.addEventListener('click', clearSearchAndTagFilters);

    dom.renameGroupBtn.addEventListener('click', async () => {
        if (!canManageActiveGroup()) return;

        const currentGroupName = state.activeGroupName.trim();
        const name = window.prompt('\u8bf7\u8f93\u5165\u65b0\u7684\u5206\u7ec4\u540d\u79f0', currentGroupName);
        const nextGroupName = name ? name.trim() : '';
        if (!nextGroupName) return;

        if (nextGroupName === currentGroupName) {
            showStatusNotice('\u5206\u7ec4\u540d\u79f0\u6ca1\u6709\u53d8\u5316', { tone: 'info', duration: 1800 });
            return;
        }
        if (nextGroupName === DEFAULT_GROUP_NAME) {
            showStatusNotice('\u201c\u5168\u90e8\u56fe\u7247\u201d\u662f\u7cfb\u7edf\u4fdd\u7559\u5206\u7ec4\u540d', { tone: 'info', duration: 2200 });
            return;
        }
        if (getCustomGroups().includes(nextGroupName)) {
            showStatusNotice('\u5df2\u5b58\u5728\u540c\u540d\u5206\u7ec4\uff0c\u8bf7\u6362\u4e00\u4e2a\u540d\u5b57', { tone: 'info', duration: 2200 });
            return;
        }

        try {
            const data = await renameGroup(currentGroupName, nextGroupName);
            state.activeGroupName = data.groupName;
            await loadPhotos();
            showStatusNotice('\u5206\u7ec4\u5df2\u91cd\u547d\u540d', { tone: 'success' });
        } catch (error) {
            console.error('\u91cd\u547d\u540d\u5206\u7ec4\u5931\u8d25:', error);
            showStatusNotice(error.message || '\u91cd\u547d\u540d\u5206\u7ec4\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5', { tone: 'error' });
        }
    });

    dom.deleteGroupBtn.addEventListener('click', () => {
        if (!canManageActiveGroup()) return;
        openGroupDeleteModalHandler(state.activeGroupName);
    });

    dom.createGroupBtn.addEventListener('click', async () => {
        if (!state.batchMode) {
            enterBatchMode();
            showStatusNotice('\u8bf7\u5148\u591a\u9009\u7167\u7247\uff0c\u7136\u540e\u53ef\u4ee5\u4f7f\u7528\u4e0b\u65b9\u6309\u94ae\u6279\u91cf\u52a0\u5165\u5206\u7ec4\u6216\u6279\u91cf\u5199\u7b80\u4ecb\u3002', {
                tone: 'info',
                duration: 3200
            });
            return;
        }
        await promptBatchGroupAssignment();
    });
}
