import { dom } from './dom.js';
import {
    state,
    setPhotos,
    setVisiblePhotos,
    setLocalUploadPreviews,
    GALLERY_IMAGE_PLACEHOLDER,
    MAX_PARALLEL_IMAGE_LOADS,
    IMAGE_RETRY_LIMIT
} from './state.js';
import { fetchPhotos, reorderPhotos, createGroup } from './api.js';
import { escapeHtml, formatUploadMonth } from './utils.js';

let openLightboxHandler = () => {};
let openBatchDeleteModalHandler = () => {};

function getPhotoLikeCount(photo) {
    const reactions = photo.reactions || {};
    return (photo.likes || 0) + (reactions['❤️'] || 0) + (reactions['👍'] || 0);
}

export function getPhotoGroupName(photo) {
    return typeof photo.groupName === 'string' ? photo.groupName.trim() : '';
}

function getAllPhotos() {
    return [...state.localUploadPreviews, ...state.photos];
}

function getCustomGroups() {
    return [...new Set(getAllPhotos().map((photo) => getPhotoGroupName(photo)).filter(Boolean))];
}

function getSearchableText(photo) {
    return [photo.name, photo.caption, (photo.tags || []).join(' '), getPhotoGroupName(photo), formatUploadMonth(photo.uploadTime)]
        .join(' ')
        .toLowerCase();
}

function getMatchedPhotos() {
    const keyword = state.searchKeyword.trim().toLowerCase();
    if (!keyword) return getAllPhotos();
    return getAllPhotos().filter((photo) => getSearchableText(photo).includes(keyword));
}

function getActiveGroupPhotos() {
    if (state.activeGroupName === '全部图片') return getAllPhotos();
    return getAllPhotos().filter((photo) => getPhotoGroupName(photo) === state.activeGroupName);
}

function buildGroups() {
    if (state.searchKeyword.trim()) {
        const grouped = new Map();
        getMatchedPhotos().forEach((photo) => {
            const key = getPhotoGroupName(photo) || '未分组';
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(photo);
        });
        return [...grouped.entries()].map(([title, items]) => ({ title, items }));
    }

    return [{ title: state.activeGroupName === '全部图片' ? '' : state.activeGroupName, items: getActiveGroupPhotos() }];
}

function updateHeaderStats(totalCount, filteredCount) {
    const pieces = [`共 ${totalCount} 张照片`];
    if (state.localUploadPreviews.length > 0) pieces.push(`上传中 ${state.localUploadPreviews.length} 张`);
    if (state.activeGroupName !== '全部图片') pieces.push(`当前分组：${state.activeGroupName}`);
    if (state.searchKeyword.trim()) pieces.push(`搜索到 ${filteredCount} 张`);
    dom.headerStats.textContent = pieces.join(' · ');
}

export function applyGroupFilter(groupName) {
    state.activeGroupName = groupName && String(groupName).trim() ? String(groupName).trim() : '全部图片';
    state.searchKeyword = '';
    dom.searchInput.value = '';
    renderGallery();
}

export function applyTagFilter(tag) {
    const keyword = String(tag || '').trim();
    if (!keyword) return;
    state.activeGroupName = '全部图片';
    state.searchKeyword = keyword;
    dom.searchInput.value = keyword;
    renderGallery();
}

function renderGroupNav() {
    const groupNames = ['全部图片', ...getCustomGroups()];
    dom.groupNav.innerHTML = '';

    groupNames.forEach((groupName) => {
        const button = document.createElement('button');
        button.className = 'group-nav-btn';
        button.type = 'button';
        button.textContent = groupName;
        if (groupName === state.activeGroupName) button.classList.add('active');
        button.addEventListener('click', () => {
            applyGroupFilter(groupName);
        });
        dom.groupNav.appendChild(button);
    });
}

function updateSearchHint(filteredCount) {
    if (state.searchKeyword.trim()) {
        dom.searchHint.textContent = `正在搜索“${state.searchKeyword.trim()}”，结果会按所属分组返回，搜索结果中已禁用拖拽排序。`;
        dom.clearSearchBtn.hidden = false;
        return;
    }

    if (state.localUploadPreviews.length > 0) {
        dom.searchHint.textContent = '新上传的照片会先以本地预览显示，上传完成后自动替换成正式图片。上传期间已禁用拖拽排序。';
    } else if (state.batchMode) {
        dom.searchHint.textContent = '批量模式下已禁用拖拽排序，避免和多选操作冲突。';
    } else if (state.activeGroupName !== '全部图片') {
        dom.searchHint.textContent = `当前正在查看“${state.activeGroupName}”分组。若该分组照片全部删除，导航里会自动移除它。`;
    } else if (state.reorderSaving) {
        dom.searchHint.textContent = '正在保存新的照片顺序...';
    } else {
        dom.searchHint.textContent = `可以直接搜索分组名、照片名称、描述或标签。当前共 ${filteredCount} 张，全部图片下支持鼠标拖动排序。`;
    }
    dom.clearSearchBtn.hidden = true;
}

function canDragReorder() {
    return state.activeGroupName === '全部图片'
        && !state.batchMode
        && !state.searchKeyword.trim()
        && !state.reorderSaving
        && state.localUploadPreviews.length === 0;
}

function movePhotoToTarget(photoList, draggedId, targetId) {
    const fromIndex = photoList.findIndex((photo) => photo.id === draggedId);
    const toIndex = photoList.findIndex((photo) => photo.id === targetId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return false;

    const nextPhotos = [...photoList];
    const [dragged] = nextPhotos.splice(fromIndex, 1);
    nextPhotos.splice(toIndex, 0, dragged);
    setPhotos(nextPhotos);
    setVisiblePhotos([...nextPhotos]);
    return true;
}

async function persistPhotoOrder() {
    state.reorderSaving = true;
    updateSearchHint(state.visiblePhotos.length);
    try {
        await reorderPhotos(state.photos.map((photo) => photo.id));
    } catch (error) {
        console.error('保存排序失败:', error);
        alert('照片顺序保存失败，请重试');
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
        if (!img || !img.isConnected || !img.dataset.src) continue;
        if (img.dataset.loading === 'done') continue;

        state.activeImageLoads += 1;
        const retryCount = Number(img.dataset.retryCount || '0');
        const requestSrc = retryCount === 0
            ? img.dataset.src
            : `${img.dataset.src}${img.dataset.src.includes('?') ? '&' : '?'}retry=${retryCount}`;

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

function updateBatchCount() {
    dom.batchCount.textContent = `已选 ${state.selectedIds.size} 张`;
    dom.batchDeleteBtn.disabled = state.selectedIds.size === 0;
}

function buildFilterChip(label, attributeName, value) {
    return `<button class="card-tag filter-chip" type="button" ${attributeName}="${escapeHtml(value)}">${label}</button>`;
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

export function showLocalUploadPreviews(previews) {
    setLocalUploadPreviews(Array.isArray(previews) ? previews : []);
    state.activeGroupName = '全部图片';
    state.searchKeyword = '';
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
    const normalized = photos.map((photo, index) => ({
        likes: 0,
        commentsCount: 0,
        reactions: {},
        uploadTime: photo.uploadTime || baseTime + index,
        ...photo
    }));
    const newIds = new Set(normalized.map((photo) => photo.id));
    setPhotos([...normalized, ...state.photos.filter((photo) => !newIds.has(photo.id))]);
    renderGallery();
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
    updateHeaderStats(getAllPhotos().length, state.visiblePhotos.length);
    updateSearchHint(state.visiblePhotos.length);
    dom.gallery.classList.toggle('drag-enabled', dragEnabled);

    if (state.visiblePhotos.length === 0) {
        dom.gallery.innerHTML = `
            <div class="gallery-empty">
                <div class="gallery-empty-icon">📷</div>
                <div class="gallery-empty-title">${state.searchKeyword.trim() ? '没有找到匹配的照片' : '这个分组里还没有图片'}</div>
                <div class="gallery-empty-desc">${state.searchKeyword.trim() ? '试试换一个分组名、标签或更短的关键词。' : '先上传图片，或者在多选后创建一个新的分组。'}</div>
            </div>
        `;
        return;
    }

    if (state.batchMode) {
        dom.gallery.classList.add('batch-mode');
    } else {
        dom.gallery.classList.remove('batch-mode');
        state.selectedIds.clear();
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

            const caption = photo.caption ? `<div class="card-caption">${escapeHtml(photo.caption)}</div>` : '';
            const tags = (photo.tags || []).slice(0, 2)
                .map((tag) => buildFilterChip(`#${escapeHtml(tag)}`, 'data-filter-tag', tag))
                .join('');
            const groupName = getPhotoGroupName(photo);
            const groupBadge = groupName
                ? buildFilterChip(`分组 · ${escapeHtml(groupName)}`, 'data-filter-group', groupName)
                : '';
            const uploadBadge = photo.isLocalPreview ? '<span class="card-tag upload-chip">上传中</span>' : '';
            const reactions = photo.reactions || {};
            const reactionSummary = Object.keys(reactions).filter((emoji) => reactions[emoji] > 0).slice(0, 3).join('');

            const cardInfo = document.createElement('div');
            cardInfo.className = 'card-info';
            cardInfo.innerHTML = `
                <div class="card-meta-row">
                    <div class="likes-count">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                        <span>${getPhotoLikeCount(photo)}</span>
                    </div>
                    <div class="comments-count">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        <span>${photo.commentsCount || 0}</span>
                    </div>
                    ${reactionSummary ? `<div class="card-reactions">${reactionSummary}</div>` : ''}
                </div>
                ${caption}
                ${(uploadBadge || tags || groupBadge) ? `<div class="card-tags">${uploadBadge}${groupBadge}${tags}</div>` : ''}
            `;
            bindCardFilterChips(cardInfo);

            card.appendChild(img);
            card.appendChild(cardInfo);

            if (dragEnabled && !photo.isLocalPreview) {
                card.addEventListener('dragstart', (event) => {
                    state.draggedPhotoId = photo.id;
                    state.dragMoved = false;
                    card.classList.add('dragging');
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', photo.id);
                });

                card.addEventListener('dragover', (event) => {
                    event.preventDefault();
                    if (state.draggedPhotoId && state.draggedPhotoId !== photo.id) {
                        card.classList.add('drag-over');
                    }
                });

                card.addEventListener('dragleave', () => {
                    card.classList.remove('drag-over');
                });

                card.addEventListener('drop', async (event) => {
                    event.preventDefault();
                    card.classList.remove('drag-over');
                    if (!state.draggedPhotoId || state.draggedPhotoId === photo.id) return;
                    const moved = movePhotoToTarget(state.photos, state.draggedPhotoId, photo.id);
                    state.draggedPhotoId = null;
                    state.dragMoved = moved;
                    if (!moved) return;
                    renderGallery();
                    await persistPhotoOrder();
                });

                card.addEventListener('dragend', () => {
                    state.draggedPhotoId = null;
                    card.classList.remove('dragging');
                    document.querySelectorAll('.photo-card.drag-over').forEach((item) => item.classList.remove('drag-over'));
                    setTimeout(() => { state.dragMoved = false; }, 0);
                });
            }

            card.addEventListener('click', () => {
                if (state.dragMoved || photo.isLocalPreview) return;
                if (state.batchMode) {
                    if (state.selectedIds.has(photo.id)) {
                        state.selectedIds.delete(photo.id);
                        card.classList.remove('selected');
                    } else {
                        state.selectedIds.add(photo.id);
                        card.classList.add('selected');
                    }
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
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                queueImageLoad(entry.target);
                state.galleryObserver.unobserve(entry.target);
            }
        });
    }, { rootMargin: '160px 0px', threshold: 0.01 });

    [...document.querySelectorAll('img.lazy')].forEach((img, index) => {
        if (index < 8) queueImageLoad(img);
        else state.galleryObserver.observe(img);
    });
}

export async function loadPhotos() {
    try {
        const photos = await fetchPhotos();
        setPhotos(photos);
        if (state.activeGroupName !== '全部图片' && !getCustomGroups().includes(state.activeGroupName)) {
            state.activeGroupName = '全部图片';
        }
        renderGallery();
    } catch (error) {
        console.error('加载图片失败:', error);
    }
}

export function initGallery({ onOpenLightbox, onOpenBatchDeleteModal }) {
    openLightboxHandler = onOpenLightbox;
    openBatchDeleteModalHandler = onOpenBatchDeleteModal;

    dom.batchDeleteToggleBtn.addEventListener('click', () => {
        if (state.batchMode) exitBatchMode();
        else enterBatchMode();
    });

    dom.batchCancelBtn.addEventListener('click', exitBatchMode);

    dom.batchSelectAllBtn.addEventListener('click', () => {
        const allSelected = state.selectedIds.size === state.visiblePhotos.length;
        if (allSelected) state.selectedIds.clear();
        else state.visiblePhotos.forEach((photo) => state.selectedIds.add(photo.id));
        updateBatchCount();
        renderGallery();
    });

    dom.batchDeleteBtn.addEventListener('click', () => {
        if (state.selectedIds.size === 0) return;
        openBatchDeleteModalHandler();
    });

    dom.searchInput.addEventListener('input', () => {
        state.searchKeyword = dom.searchInput.value.trim();
        renderGallery();
    });

    dom.clearSearchBtn.addEventListener('click', () => {
        dom.searchInput.value = '';
        state.searchKeyword = '';
        renderGallery();
    });

    dom.createGroupBtn.addEventListener('click', async () => {
        if (!state.batchMode) {
            enterBatchMode();
            alert('请先多选要加入分组的照片，再点击一次“新建分组”完成创建。');
            return;
        }

        if (state.selectedIds.size === 0) {
            alert('请先选择要加入分组的照片');
            return;
        }

        const name = window.prompt('请输入分组名称');
        const groupName = name ? name.trim() : '';
        if (!groupName) return;

        try {
            const data = await createGroup(groupName, [...state.selectedIds]);
            state.activeGroupName = data.groupName;
            state.searchKeyword = '';
            dom.searchInput.value = '';
            exitBatchMode();
            await loadPhotos();
        } catch (error) {
            console.error('创建分组失败:', error);
            alert(error.message || '创建分组失败，请重试');
        }
    });
}