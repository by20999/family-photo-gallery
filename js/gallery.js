import { dom } from './dom.js';
import { state, setPhotos, setVisiblePhotos, setLocalUploadPreviews, updatePhotoInStore, GALLERY_IMAGE_PLACEHOLDER, MAX_PARALLEL_IMAGE_LOADS, IMAGE_RETRY_LIMIT } from './state.js';
import { fetchPhotos, reorderPhotos, createGroup, renameGroup, updateBatchPhotoDetails, updatePhotoFavorite } from './api.js';
import { escapeHtml, formatUploadMonth, formatUploadDate } from './utils.js';
import { showStatusNotice, clearStatusNotice } from './feedback.js';
import { promptAddPhotoToStory, promptAddGroupToStory } from './story.js';

const DEFAULT_GROUP_NAME = '\u5168\u90e8\u56fe\u7247';
const UNGROUPED_GROUP_NAME = '\u672a\u5206\u7ec4';
const SORT_LABELS = { custom: '\u624b\u52a8\u987a\u5e8f', newest: '\u6700\u65b0\u4e0a\u4f20', oldest: '\u6700\u65e9\u4e0a\u4f20', name: '\u6309\u540d\u79f0' };
const CONTENT_FILTER_LABELS = { all: '\u5168\u90e8\u7167\u7247', captioned: '\u4ec5\u770b\u6709\u7b80\u4ecb', favorites: '\u4ec5\u770b\u6536\u85cf' };
const VIEW_MODE_LABELS = { grid: '\u7f51\u683c', timeline: '\u65f6\u95f4\u7ebf' };
const MEMORY_CARD_LIMIT = 6;
const TIMELINE_PREVIEW_LIMIT = 4;
const RECENT_UPLOAD_HIGHLIGHT_MS = 2400;

let openLightboxHandler = () => {};
let openBatchDeleteModalHandler = () => {};
let openGroupDeleteModalHandler = () => {};
let recentUploadedPhotoIds = new Set();
let recentUploadCleanupTimer = null;

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

function getViewModeLabel(mode = state.viewMode) {
    return VIEW_MODE_LABELS[mode] || VIEW_MODE_LABELS.grid;
}

function getPhotoDateValue(photo) {
    return photo.eventDate || photo.uploadTime;
}

function getPhotoDateLabel(photo) {
    return photo.eventDate || formatUploadDate(photo.uploadTime) || '未记录日期';
}

function getTimelineMonthSortValue(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return -1;
    return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

function getTimelineMonthLabel(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '未标记月份';
    return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function getTimelineYearLabel(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '未标记年份';
    return `${date.getFullYear()}年`;
}

function getTimelinePhotos(photos) {
    return [...photos].sort((a, b) => (b.uploadTime || 0) - (a.uploadTime || 0));
}

function getTopTags(photos, limit = 3) {
    const counts = new Map();
    photos.forEach((photo) => {
        (photo.tags || []).forEach((tag) => {
            const normalized = String(tag || '').trim();
            if (!normalized) return;
            counts.set(normalized, (counts.get(normalized) || 0) + 1);
        });
    });
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
        .slice(0, limit)
        .map(([tag]) => tag);
}

function getStoryPhotoCount(photos) {
    return photos.filter((photo) => Boolean((photo.caption || '').trim())).length;
}

function getTimelineGroupsFromPhotos(photos) {
    const groups = new Map();
    getTimelinePhotos(photos).forEach((photo) => {
        const label = getTimelineMonthLabel(getPhotoDateValue(photo));
        if (!groups.has(label)) {
            groups.set(label, {
                label,
                yearLabel: getTimelineYearLabel(getPhotoDateValue(photo)),
                sortValue: getTimelineMonthSortValue(getPhotoDateValue(photo)),
                items: []
            });
        }
        groups.get(label).items.push(photo);
    });
    return [...groups.values()].sort((a, b) => b.sortValue - a.sortValue || (b.items[0]?.uploadTime || 0) - (a.items[0]?.uploadTime || 0));
}

function buildTimelineSummary(group) {
    const storyCount = getStoryPhotoCount(group.items);
    const favoriteCount = group.items.filter((photo) => photo.favorited).length;
    const topTags = getTopTags(group.items, 3);
    const pieces = [`收进了 ${group.items.length} 张照片`];
    if (storyCount > 0) pieces.push(`${storyCount} 张写下了记录`);
    else pieces.push('还可以补上一句描述让这一页更完整');
    if (favoriteCount > 0) pieces.push(`${favoriteCount} 张被特别收藏`);
    if (topTags.length > 0) pieces.push(`关键词是 ${topTags.map((tag) => `#${tag}`).join('、')}`);
    return `${pieces.join('，')}。`;
}


function getMonthMoodMeta(dateValue) {
    const date = new Date(dateValue);
    const month = Number.isNaN(date.getTime()) ? 0 : date.getMonth() + 1;
    if (month >= 3 && month <= 5) {
        return {
            key: 'spring',
            label: '花气上升',
            copy: '散步、咖啡和新鲜日常，适合被排成一页柔软的春天切片。'
        };
    }
    if (month >= 6 && month <= 8) {
        return {
            key: 'summer',
            label: '热感存档',
            copy: '海风、live、晚霞和强光下的瞬间，会让这一页有更直接的生命力。'
        };
    }
    if (month >= 9 && month <= 11) {
        return {
            key: 'autumn',
            label: '琥珀颗粒',
            copy: '暖色、街灯和出行片段，会让这个月更像一本有颗粒感的小杂志。'
        };
    }
    if (month === 12 || month === 1 || month === 2) {
        return {
            key: 'winter',
            label: '夜雾留白',
            copy: '夜景、房间光线和安静时刻，很适合被留在更克制的冬日底片里。'
        };
    }
    return {
        key: 'archive',
        label: '归档页',
        copy: '这一页还没有明确的时间气候，但它已经在你的相册里占好了位置。'
    };
}

function isRecentUploadedPhoto(photoId) {
    return recentUploadedPhotoIds.has(photoId);
}

function markRecentlyUploadedPhotos(photos) {
    const nextIds = Array.isArray(photos) ? photos.map((photo) => photo.id).filter(Boolean) : [];
    if (nextIds.length === 0) return;

    nextIds.forEach((photoId) => recentUploadedPhotoIds.add(photoId));
    document.body.classList.add('upload-celebration');
    dom.gallery.classList.add('upload-celebration');

    if (recentUploadCleanupTimer) clearTimeout(recentUploadCleanupTimer);
    recentUploadCleanupTimer = window.setTimeout(() => {
        recentUploadedPhotoIds.clear();
        document.body.classList.remove('upload-celebration');
        dom.gallery.classList.remove('upload-celebration');
        renderGallery();
    }, RECENT_UPLOAD_HIGHLIGHT_MS);
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
    return [
        photo.name,
        photo.caption,
        photo.eventName,
        photo.eventDate,
        (photo.tags || []).join(' '),
        getPhotoGroupName(photo),
        formatUploadMonth(getPhotoDateValue(photo))
    ].join(' ').toLowerCase();
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
    if (normalizeCompare(photo.eventName).includes(keyword) || normalizeCompare(photo.eventDate).includes(keyword)) matches.push('事件');
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
    const pieces = [`共 ${totalCount} 张照片`];
    if (state.localUploadPreviews.length > 0) pieces.push(`上传中 ${state.localUploadPreviews.length} 张`);
    if (state.activeGroupName !== DEFAULT_GROUP_NAME) pieces.push(`当前分组：${state.activeGroupName}`);
    if (state.activeTagFilter) pieces.push(`标签筛选：#${state.activeTagFilter}`);
    if (state.searchKeyword.trim()) pieces.push(`搜索“${state.searchKeyword.trim()}”共 ${filteredCount} 张`);
    if (state.sortMode !== 'custom') pieces.push(`排序：${getSortLabel()}`);
    if (state.contentFilter !== 'all') pieces.push(getContentFilterLabel());
    if (state.viewMode !== 'grid') pieces.push(`视图：${getViewModeLabel()}`);
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

        if (summary.name !== DEFAULT_GROUP_NAME && summary.count > 0) {
            const storyBtn = document.createElement('span');
            storyBtn.className = 'group-nav-story-btn';
            storyBtn.setAttribute('role', 'button');
            storyBtn.setAttribute('tabindex', '0');
            storyBtn.textContent = '加入故事';
            storyBtn.addEventListener('click', async (event) => {
                event.stopPropagation();
                await promptAddGroupToStory(summary.name);
            });
            storyBtn.addEventListener('keydown', async (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                await promptAddGroupToStory(summary.name);
            });
            button.appendChild(storyBtn);
        }
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
    renderMemoryStrip(dom.memoryRecentList, recentPhotos, '上传几张新照片后，这里会自动更新。');
    renderMemoryStrip(dom.memoryTodayList, todayPhotos, '今年的今天暂时还没有刷出往年存下的照片。');
}

function scrollGalleryIntoView() {
    if (!dom.gallery || typeof dom.gallery.scrollIntoView !== 'function') return;
    dom.gallery.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildRitualCards() {
    const persistedPhotos = getPersistedPhotos();
    if (persistedPhotos.length === 0) return [];

    const timelineGroups = getTimelineGroupsFromPhotos(persistedPhotos);
    const latestGroup = timelineGroups[0] || null;
    const incompleteStoryPhoto = getTimelinePhotos(persistedPhotos)
        .find((photo) => !photo.isLocalPreview && (!String(photo.caption || '').trim() || (photo.tags || []).length === 0)) || null;
    const favorites = getTimelinePhotos(persistedPhotos).filter((photo) => photo.favorited);
    const oldestPhoto = [...persistedPhotos].sort((a, b) => (a.uploadTime || 0) - (b.uploadTime || 0))[0] || null;
    const todayPhotos = getTodayMemoryPhotos();
    const highlightedStoryPhoto = incompleteStoryPhoto
        || getTimelinePhotos(persistedPhotos).find((photo) => Boolean((photo.caption || '').trim()))
        || latestGroup?.items[0]
        || oldestPhoto;

    const cards = [];
    if (latestGroup?.items[0]) {
        cards.push({
            kicker: '时间线视图',
            title: `从 ${latestGroup.label} 开始翻这一册`,
            desc: buildTimelineSummary(latestGroup),
            action: 'timeline',
            buttonLabel: '切到时间线'
        });
    }

    if (highlightedStoryPhoto) {
        const missingPieces = [];
        if (!String(highlightedStoryPhoto.caption || '').trim()) missingPieces.push('一句描述');
        if ((highlightedStoryPhoto.tags || []).length === 0) missingPieces.push('几个关键词');
        cards.push({
            kicker: '故事模式',
            title: missingPieces.length > 0 ? '把这张照片补成完整记录' : '打开一段已经写好的照片片段',
            desc: missingPieces.length > 0
                ? `这张照片还差 ${missingPieces.join('和')}，点开后就能继续把它补完整。`
                : '这张照片已经有了文字和线索，适合继续看看评论、表情和前后片段。',
            action: 'photo',
            photoId: highlightedStoryPhoto.id,
            buttonLabel: missingPieces.length > 0 ? '继续写故事' : '打开故事模式'
        });
    }

    if (todayPhotos[0]) {
        cards.push({
            kicker: '今日灵感卡',
            title: '把往年今日再刷一遍',
            desc: `今天刚好有 ${todayPhotos.length} 张往年今日照片，适合重新翻到同一天留下的画面。`,
            action: 'photo',
            photoId: todayPhotos[0].id,
            buttonLabel: '打开往年今日'
        });
    } else if (favorites[0]) {
        cards.push({
            kicker: '今日灵感卡',
            title: '翻翻那些你特别偏爱的照片',
            desc: `你已经收藏了 ${favorites.length} 张照片，切到收藏视图就能快速回看最常点开的那些瞬间。`,
            action: 'favorites',
            buttonLabel: '查看收藏'
        });
    } else if (oldestPhoto) {
        cards.push({
            kicker: '今日灵感卡',
            title: '回到第一张被放进相册的照片',
            desc: '偶尔从最早的一页重新开始翻，会更容易看见自己的照片流是怎么慢慢长出来的。',
            action: 'photo',
            photoId: oldestPhoto.id,
            buttonLabel: '回到最开始'
        });
    }

    return cards.slice(0, 3);
}

function renderRitualBoard() {
    if (!dom.ritualBoard) return;
    if (!isHomeView()) {
        dom.ritualBoard.hidden = true;
        return;
    }

    const cards = buildRitualCards();
    if (cards.length === 0) {
        dom.ritualBoard.hidden = true;
        return;
    }

    dom.ritualBoard.hidden = false;
    dom.ritualBoard.innerHTML = `
        <div class="ritual-board-head">
            <div>
                <span class="ritual-eyebrow">今日灵感卡</span>
                <h2>让相册不只是存照片，也变成你会反复打开的小空间</h2>
            </div>
            <p>翻一页时间线、补一句描述、重看一张偏爱的照片，内容会慢慢长出只属于你的节奏。</p>
        </div>
        <div class="ritual-grid">
            ${cards.map((card) => `
                <article class="ritual-card">
                    <span class="ritual-card-kicker">${escapeHtml(card.kicker)}</span>
                    <h3>${escapeHtml(card.title)}</h3>
                    <p>${escapeHtml(card.desc)}</p>
                    <button class="ritual-card-btn" type="button" data-ritual-action="${escapeHtml(card.action)}" ${card.photoId ? `data-ritual-photo-id="${escapeHtml(card.photoId)}"` : ''}>
                        ${escapeHtml(card.buttonLabel)}
                    </button>
                </article>
            `).join('')}
        </div>
    `;

    dom.ritualBoard.querySelectorAll('[data-ritual-action]').forEach((button) => {
        button.addEventListener('click', () => {
            const action = button.dataset.ritualAction;
            if (action === 'timeline') {
                state.viewMode = 'timeline';
                renderGallery();
                scrollGalleryIntoView();
                return;
            }
            if (action === 'favorites') {
                state.activeGroupName = DEFAULT_GROUP_NAME;
                state.searchKeyword = '';
                state.activeTagFilter = '';
                state.viewMode = 'grid';
                state.contentFilter = 'favorites';
                dom.searchInput.value = '';
                dom.contentFilterSelect.value = 'favorites';
                renderGallery();
                scrollGalleryIntoView();
                return;
            }
            if (action === 'photo' && button.dataset.ritualPhotoId) {
                openPhotoById(button.dataset.ritualPhotoId);
            }
        });
    });
}

function renderTimelineGallery(visibleIndexMap) {
    const timelineGroups = getTimelineGroupsFromPhotos(state.visiblePhotos);
    dom.gallery.innerHTML = timelineGroups.map((group) => {
        const featured = group.items[0];
        const featuredIndex = visibleIndexMap.get(featured.id);
        const featuredOpenable = !featured.isLocalPreview && typeof featuredIndex === 'number';
        const featuredTitle = featured.caption || featured.name || '这一页记录';
        const featuredDate = formatUploadDate(featured.uploadTime) || '还没有记录日期';
        const topTags = getTopTags(group.items, 3);
        const favoriteCount = group.items.filter((photo) => photo.favorited).length;
        const storyCount = getStoryPhotoCount(group.items);
        const groupName = getPhotoGroupName(featured);
        const mood = getMonthMoodMeta(featured.uploadTime);
        const hasRecentUpload = group.items.some((photo) => isRecentUploadedPhoto(photo.id));
        const thumbs = group.items.slice(1, TIMELINE_PREVIEW_LIMIT + 1).map((photo) => {
            const thumbIndex = visibleIndexMap.get(photo.id);
            const thumbOpenable = !photo.isLocalPreview && typeof thumbIndex === 'number';
            return `
                <button class="timeline-thumb${thumbOpenable ? '' : ' is-disabled'}${isRecentUploadedPhoto(photo.id) ? ' recent-upload' : ''}" type="button" ${thumbOpenable ? `data-timeline-index="${thumbIndex}"` : 'disabled'}>
                    <img src="${escapeHtml(photo.thumbSrc || photo.src || GALLERY_IMAGE_PLACEHOLDER)}" alt="${escapeHtml(photo.name || '时间线照片')}" loading="lazy">
                    <span class="timeline-thumb-label">${escapeHtml(photo.caption || photo.name || '还没补描述')}</span>
                </button>
            `;
        }).join('');

        return `
            <article class="timeline-block${hasRecentUpload ? ' has-recent-upload' : ''}" data-month-mood="${escapeHtml(mood.key)}">
                <div class="timeline-rail">
                    <span class="timeline-year">${escapeHtml(group.yearLabel)}</span>
                    <span class="timeline-dot"></span>
                </div>
                <div class="timeline-card">
                    <div class="timeline-card-head">
                        <div>
                            <span class="timeline-month">${escapeHtml(group.label)}</span>
                            <h3>${escapeHtml(featuredTitle)}</h3>
                        </div>
                        <span class="timeline-count">${group.items.length} 张</span>
                    </div>
                    <p class="timeline-summary">${escapeHtml(buildTimelineSummary(group))}</p>
                    <div class="timeline-mood-line">
                        <span class="timeline-mood-pill">${escapeHtml(mood.label)}</span>
                        <p>${escapeHtml(mood.copy)}</p>
                    </div>
                    <div class="timeline-feature">
                        <button class="timeline-feature-media${featuredOpenable ? '' : ' is-disabled'}${isRecentUploadedPhoto(featured.id) ? ' recent-upload' : ''}" type="button" ${featuredOpenable ? `data-timeline-index="${featuredIndex}"` : 'disabled'}>
                            <img src="${escapeHtml(featured.thumbSrc || featured.src || GALLERY_IMAGE_PLACEHOLDER)}" alt="${escapeHtml(featured.name || '时间线封面')}" loading="lazy">
                            ${featured.favorited ? '<span class="timeline-photo-badge">收藏</span>' : ''}
                            ${featured.isLocalPreview ? '<span class="timeline-photo-badge upload">上传中</span>' : ''}
                        </button>
                        <div class="timeline-feature-copy">
                            <div class="timeline-feature-meta">
                                <span>${escapeHtml(featuredDate)}</span>
                                ${groupName ? `<span>分组 · ${escapeHtml(groupName)}</span>` : ''}
                                ${storyCount > 0 ? `<span>${storyCount} 张有描述</span>` : ''}
                                ${favoriteCount > 0 ? `<span>${favoriteCount} 张收藏</span>` : ''}
                            </div>
                            <div class="timeline-chip-row">
                                ${topTags.map((tag) => `<span class="timeline-chip">#${escapeHtml(tag)}</span>`).join('')}
                            </div>
                            ${featuredOpenable ? `<button class="timeline-open-btn" type="button" data-timeline-index="${featuredIndex}">打开这一页记录</button>` : '<span class="timeline-open-tip">上传完成后会出现在正式时间线上</span>'}
                        </div>
                    </div>
                    <div class="timeline-thumbs${thumbs ? '' : ' is-empty'}">
                        ${thumbs || '<div class="timeline-thumb-empty">这个月暂时只有这一页，等再添几张照片，这里会慢慢长成一条更完整的个人时间线。</div>'}
                    </div>
                </div>
            </article>
        `;
    }).join('');

    dom.gallery.querySelectorAll('[data-timeline-index]').forEach((button) => {
        button.addEventListener('click', () => {
            const index = Number(button.dataset.timelineIndex);
            if (Number.isNaN(index)) return;
            openLightboxHandler(index);
        });
    });
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
    if (state.activeTagFilter) tips.push(`正在按标签 #${state.activeTagFilter} 精准筛图，共 ${filteredCount} 张。`);
    if (state.searchKeyword.trim()) tips.push(`正在搜索“${state.searchKeyword.trim()}”，结果会按分组展开，并已关闭拖拽排序。`);
    if (!state.searchKeyword.trim() && !state.activeTagFilter) {
        if (state.localUploadPreviews.length > 0) tips.push('新上传的照片会先以本地预览显示，上传完成后自动替换成正式图片。上传期间已禁用拖拽排序。');
        else if (state.batchMode) tips.push('批量模式下已禁用拖拽排序，避免和多选操作冲突。');
        else if (state.activeGroupName !== DEFAULT_GROUP_NAME) tips.push(`当前正在看“${state.activeGroupName}”分组。如果这里的照片都被删掉，导航里也会自动消失。`);
        else if (state.reorderSaving) tips.push('正在保存新的照片顺序...');
        else {
            tips.push(`可以直接搜分组、照片名、描述、标签或月份。当前共 ${filteredCount} 张。`);
            tips.push('点卡片上的标签就能一键继续筛。');
            if (canDragReorder()) tips.push('全部图片下支持鼠标拖动排序。');
        }
    }
    if (state.viewMode === 'timeline') tips.push('已切到时间线视图，当前结果会按月份归档展示，并暂停拖拽排序。');
    if (state.sortMode !== 'custom') tips.push(`当前按“${getSortLabel()}”排序。`);
    if (state.contentFilter === 'favorites') tips.push('已切换到收藏视图，取消星标后会自动从这里移出。');
    else if (state.contentFilter !== 'all') tips.push(`已启用“${getContentFilterLabel()}”。`);
    dom.searchHint.textContent = tips.join(' ');
    dom.clearSearchBtn.hidden = !state.searchKeyword.trim() && !state.activeTagFilter;
    dom.clearSearchBtn.textContent = state.activeTagFilter ? '清空筛选' : '清空搜索';
}

function canDragReorder() {
    return state.viewMode === 'grid'
        && state.activeGroupName === DEFAULT_GROUP_NAME
        && state.sortMode === 'custom'
        && state.contentFilter === 'all'
        && !state.batchMode
        && !state.searchKeyword.trim()
        && !state.activeTagFilter
        && !state.reorderSaving
        && state.localUploadPreviews.length === 0;
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

async function promptBatchDetailsUpdate() {
    if (state.selectedIds.size === 0) {
        showStatusNotice('请先选择要整理的照片', { tone: 'info', duration: 2200 });
        return;
    }

    const count = state.selectedIds.size;
    const rawCaption = window.prompt(`给选中的 ${count} 张照片设置统一描述；留空会清除描述，取消则停止整理。`, '');
    if (rawCaption === null) return;

    const rawTags = window.prompt('设置统一标签，多个标签可用逗号、顿号或空格分开；留空会清除标签。', '');
    if (rawTags === null) return;

    const rawEventDate = window.prompt('设置事件日期，格式 YYYY-MM-DD；留空会清除事件日期。', '');
    if (rawEventDate === null) return;

    const rawEventName = window.prompt('设置事件名称，例如：春节、生日、旅行；留空会清除事件名称。', '');
    if (rawEventName === null) return;

    const caption = rawCaption.trim().slice(0, 80);
    const tags = normalizeTags(rawTags).slice(0, 12);
    const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(rawEventDate.trim()) ? rawEventDate.trim() : '';
    const eventName = rawEventName.trim().slice(0, 40);

    try {
        await updateBatchPhotoDetails([...state.selectedIds], {
            caption,
            tags,
            eventDate,
            eventName
        });
        exitBatchMode();
        await loadPhotos();
        showStatusNotice('批量整理信息已更新', { tone: 'success' });
    } catch (error) {
        console.error('批量整理失败:', error);
        showStatusNotice(error.message || '批量整理失败，请重试', { tone: 'error' });
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
    markRecentlyUploadedPhotos(normalized);
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
    state.viewMode = 'grid';
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
    const groupedPhotos = groups.flatMap((group) => group.items);
    const nextVisiblePhotos = state.viewMode === 'timeline' ? getTimelinePhotos(groupedPhotos) : groupedPhotos;
    setVisiblePhotos(nextVisiblePhotos);
    const visibleIndexMap = new Map(state.visiblePhotos.map((photo, index) => [photo.id, index]));
    const dragEnabled = canDragReorder();
    dom.gallery.innerHTML = '';
    clearImageLoadQueue();
    if (state.galleryObserver) state.galleryObserver.disconnect();
    renderGroupNav();
    renderGroupActions();
    renderUploadGroupOptions();
    renderMemoryBoard();
    renderRitualBoard();
    dom.sortSelect.value = state.sortMode;
    dom.contentFilterSelect.value = state.contentFilter;
    dom.viewToggleBtns.forEach((button) => {
        const active = button.dataset.viewMode === state.viewMode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    updateHeaderStats(getAllPhotos().length, state.visiblePhotos.length);
    updateSearchHint(state.visiblePhotos.length);
    dom.gallery.classList.toggle('timeline-mode', state.viewMode === 'timeline');
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

    if (state.viewMode === 'timeline') {
        renderTimelineGallery(visibleIndexMap);
        return;
    }

    const fragment = document.createDocumentFragment();
    let animationIndex = 0;
    groups.forEach((group) => {
        if (group.title) {
            const groupTitle = document.createElement('div');
            groupTitle.className = 'gallery-group-title';
            groupTitle.innerHTML = `<span>${escapeHtml(group.title)}</span><em>${group.items.length} 张</em>`;
            fragment.appendChild(groupTitle);
        }
        group.items.forEach((photo) => {
            const visibleIndex = visibleIndexMap.get(photo.id);
            const card = document.createElement('div');
            card.className = 'photo-card';
            if (photo.isLocalPreview) card.classList.add('upload-preview');
            if (isRecentUploadedPhoto(photo.id)) card.classList.add('recent-upload');
            if (state.batchMode && state.selectedIds.has(photo.id)) card.classList.add('selected');
            if (dragEnabled && !photo.isLocalPreview) {
                card.classList.add('draggable-card');
                card.setAttribute('draggable', 'true');
            }
            card.style.animationDelay = `${animationIndex * 0.04}s`;
            animationIndex += 1;

            const img = document.createElement('img');
            img.alt = photo.name || '新上传的照片';
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

            const hoverMeta = document.createElement('div');
            hoverMeta.className = 'card-hover-meta';
            hoverMeta.innerHTML = `
                <span class="card-date-badge">${escapeHtml(getPhotoDateLabel(photo))}</span>
                <span class="card-file-badge">${escapeHtml(photo.name || '未命名照片')}</span>
            `;

            const cardFrame = document.createElement('span');
            cardFrame.className = 'card-frame';

            const caption = photo.caption ? `<div class="card-caption">${highlightText(photo.caption)}</div>` : '';
            const tags = (photo.tags || []).slice(0, 3).map((tag) => buildFilterChip(`#${highlightText(tag)}`, 'data-filter-tag', tag, normalizeCompare(tag) === normalizeCompare(state.activeTagFilter))).join('');
            const groupName = getPhotoGroupName(photo);
            const groupBadge = groupName ? buildFilterChip(`分组 · ${highlightText(groupName)}`, 'data-filter-group', groupName, groupName === state.activeGroupName && !state.searchKeyword.trim() && !state.activeTagFilter) : '';
            const eventBadge = photo.eventName ? `<span class="card-tag event-chip">${highlightText(photo.eventName)}</span>` : '';
            const coverBadge = groupName && photo.groupCoverPhotoId === photo.id ? '<span class="card-tag group-cover-chip">分组封面</span>' : '';
            const uploadBadge = photo.isLocalPreview ? '<span class="card-tag upload-chip">上传中</span>' : '';
            const favoriteBadge = photo.favorited ? '<span class="card-tag favorite-chip">★ 已收藏</span>' : '';
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
                ${(uploadBadge || favoriteBadge || coverBadge || eventBadge || tags || groupBadge) ? `<div class="card-tags">${uploadBadge}${favoriteBadge}${coverBadge}${eventBadge}${groupBadge}${tags}</div>` : ''}
            `;
            bindCardFilterChips(cardInfo);
            if (!photo.isLocalPreview) {
                const favoriteBtn = document.createElement('button');
                favoriteBtn.className = `card-favorite-btn${photo.favorited ? ' active' : ''}`;
                favoriteBtn.type = 'button';
                favoriteBtn.setAttribute('aria-label', photo.favorited ? '取消收藏' : '收藏照片');
                favoriteBtn.textContent = photo.favorited ? '★' : '☆';
                favoriteBtn.addEventListener('click', async (event) => {
                    event.stopPropagation();
                    try {
                        await togglePhotoFavorite(photo.id);
                    } catch (error) {
                        console.error('切换收藏失败:', error);
                    }
                });
                card.appendChild(favoriteBtn);

                const storyBtn = document.createElement('button');
                storyBtn.className = 'card-story-btn';
                storyBtn.type = 'button';
                storyBtn.setAttribute('aria-label', '加入图片故事');
                storyBtn.textContent = '加入故事';
                storyBtn.addEventListener('click', async (event) => {
                    event.stopPropagation();
                    await promptAddPhotoToStory(photo.id);
                });
                card.appendChild(storyBtn);
            }
            card.appendChild(hoverMeta);
            card.appendChild(img);
            card.appendChild(cardFrame);
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
    dom.batchCaptionBtn.addEventListener('click', promptBatchDetailsUpdate);

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

    dom.viewToggleBtns.forEach((button) => {
        button.addEventListener('click', () => {
            const nextMode = button.dataset.viewMode || 'grid';
            if (nextMode === state.viewMode) return;
            if (state.batchMode && nextMode === 'timeline') {
                showStatusNotice('批量模式下先使用网格视图，避免和多选操作冲突。', { tone: 'info', duration: 2200 });
                return;
            }
            state.viewMode = nextMode;
            renderGallery();
        });
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
