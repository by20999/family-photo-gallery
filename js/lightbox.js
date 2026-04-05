import { dom, editSliders } from './dom.js';
import { state, getCurrentPhoto, resetEditorState, updatePhotoInStore, updateGroupCoverInStore } from './state.js';
import { fetchPhotoDetails, updatePhotoDetails, setGroupCover } from './api.js';
import { normalizeTags, formatUploadDate, escapeHtml } from './utils.js';
import { getPhotoGroupName, applyTagFilter, applyGroupFilter, togglePhotoFavorite } from './gallery.js';
import { renderComments, updateReactionUI } from './comments.js';
import { showStatusNotice } from './feedback.js';

let renderGalleryHandler = () => {};
let openSingleDeleteModalHandler = () => {};
let touchStartPoint = null;

function updateNavBtns() {
    dom.lightboxPrev.disabled = state.currentPhotoIndex <= 0;
    dom.lightboxNext.disabled = state.currentPhotoIndex >= state.visiblePhotos.length - 1;
}

function syncCurrentPhotoIndex(photoId) {
    const nextIndex = state.visiblePhotos.findIndex((item) => item.id === photoId);
    if (nextIndex === -1) {
        showStatusNotice('这张照片已不在当前筛选结果中，已自动返回列表。', { tone: 'info', duration: 2600 });
        closeLightbox();
        return null;
    }
    state.currentPhotoIndex = nextIndex;
    updateNavBtns();
    return state.visiblePhotos[nextIndex];
}

function renderFavoriteBtn(photo) {
    if (!dom.favoriteBtn) return;
    const isFavorited = Boolean(photo?.favorited);
    dom.favoriteBtn.classList.toggle('active', isFavorited);
    dom.favoriteBtn.textContent = isFavorited ? '\u2605 \u5df2\u6536\u85cf' : '\u2606 \u6536\u85cf';
    dom.favoriteBtn.setAttribute('aria-pressed', isFavorited ? 'true' : 'false');
}

function renderLightboxStory(photo) {
    const tags = (photo.tags || [])
        .map((tag) => `<button class="story-tag filter-chip${tag === state.activeTagFilter ? ' active' : ''}" type="button" data-filter-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`)
        .join('');
    const groupName = getPhotoGroupName(photo);
    const groupBlock = groupName
        ? `<div class="story-tags"><button class="story-tag filter-chip${groupName === state.activeGroupName && !state.searchKeyword.trim() ? ' active' : ''}" type="button" data-filter-group="${escapeHtml(groupName)}">\u5206\u7ec4 \u00b7 ${escapeHtml(groupName)}</button></div>`
        : '';
    const isCurrentCover = photo.groupCoverPhotoId === photo.id;
    dom.photoStory.innerHTML = `
        <div class="story-header">
            <div class="story-date">${formatUploadDate(photo.uploadTime) || '\u521a\u521a\u4e0a\u4f20'}</div>
            <div class="story-header-actions">
                ${groupName ? `<button class="story-edit-btn${isCurrentCover ? ' is-current' : ''}" type="button" data-set-group-cover="true" ${isCurrentCover ? 'disabled' : ''}>${isCurrentCover ? '\u5f53\u524d\u5c01\u9762' : '\u8bbe\u4e3a\u5206\u7ec4\u5c01\u9762'}</button>` : ''}
                <button class="story-edit-btn" type="button" data-edit-details="true">${photo.caption || (photo.tags || []).length ? '\u7f16\u8f91\u4fe1\u606f' : '\u6dfb\u52a0\u4fe1\u606f'}</button>
            </div>
        </div>
        ${photo.caption ? `<div class="story-caption">${escapeHtml(photo.caption)}</div>` : '<div class="story-caption empty">\u8fd9\u5f20\u7167\u7247\u8fd8\u6ca1\u6709\u7b80\u4ecb\uff0c\u70b9\u53f3\u4e0a\u89d2\u6309\u94ae\u5c31\u53ef\u4ee5\u8865\u4e0a\u4e00\u53e5\u6545\u4e8b\u3002</div>'}
        ${groupBlock}
        ${tags ? `<div class="story-tags">${tags}</div>` : '<div class="story-caption empty" style="margin-top: 10px;">\u8fd8\u6ca1\u6709\u6807\u7b7e\uff0c\u8865\u4e0a\u6807\u7b7e\u540e\u4f1a\u66f4\u5bb9\u6613\u641c\u7d22\u548c\u6574\u7406\u3002</div>'}
    `;
}

async function setCurrentPhotoAsGroupCover() {
    const photo = getCurrentPhoto();
    if (!photo) return;
    const groupName = getPhotoGroupName(photo);
    if (!groupName || photo.groupCoverPhotoId === photo.id) return;

    try {
        const result = await setGroupCover(groupName, photo.id);
        updateGroupCoverInStore(groupName, result.coverPhotoId || photo.id);
        const latestPhoto = getCurrentPhoto();
        if (!latestPhoto) return;
        renderLightboxStory(latestPhoto);
        renderGalleryHandler();
        showStatusNotice(`\u5df2\u5c06\u8fd9\u5f20\u7167\u7247\u8bbe\u4e3a\u201c${groupName}\u201d\u5206\u7ec4\u5c01\u9762`, { tone: 'success' });
    } catch (error) {
        console.error('\u8bbe\u7f6e\u5206\u7ec4\u5c01\u9762\u5931\u8d25:', error);
        showStatusNotice(error.message || '\u8bbe\u7f6e\u5206\u7ec4\u5c01\u9762\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5', { tone: 'error' });
    }
}

async function promptEditPhotoDetails() {
    const photo = getCurrentPhoto();
    if (!photo) return;

    const rawCaption = window.prompt(
        photo.caption ? '\u4fee\u6539\u8fd9\u5f20\u7167\u7247\u7684\u7b80\u4ecb\uff0c\u7559\u7a7a\u53ef\u4ee5\u6e05\u9664\u3002' : '\u7ed9\u8fd9\u5f20\u7167\u7247\u8865\u4e00\u53e5\u7b80\u4ecb\uff0c\u7559\u7a7a\u8868\u793a\u6682\u65f6\u4e0d\u5199\u3002',
        photo.caption || ''
    );
    if (rawCaption === null) return;

    const rawTags = window.prompt(
        '\u7ed9\u8fd9\u5f20\u7167\u7247\u8865\u5145\u6807\u7b7e\uff0c\u591a\u4e2a\u6807\u7b7e\u53ef\u7528\u9017\u53f7\u3001\u987f\u53f7\u6216\u7a7a\u683c\u5206\u5f00\uff1b\u7559\u7a7a\u53ef\u6e05\u9664\u3002',
        (photo.tags || []).join('\uFF0C')
    );
    if (rawTags === null) return;

    const caption = rawCaption.trim().slice(0, 80);
    const tags = normalizeTags(rawTags).slice(0, 12);
    const sameCaption = caption === (photo.caption || '');
    const sameTags = JSON.stringify(tags) === JSON.stringify(normalizeTags(photo.tags));
    if (sameCaption && sameTags) {
        showStatusNotice('\u7167\u7247\u4fe1\u606f\u6ca1\u6709\u53d8\u5316', { tone: 'info', duration: 1800 });
        return;
    }

    try {
        const result = await updatePhotoDetails(photo.id, { caption, tags });
        updatePhotoInStore(photo.id, {
            caption: result.caption || '',
            tags: normalizeTags(result.tags)
        });
        renderGalleryHandler();
        const latestPhoto = syncCurrentPhotoIndex(photo.id);
        if (!latestPhoto) return;
        renderLightboxStory(latestPhoto);
        showStatusNotice('\u7167\u7247\u4fe1\u606f\u5df2\u66f4\u65b0', { tone: 'success' });
    } catch (error) {
        console.error('\u4fdd\u5b58\u56fe\u7247\u4fe1\u606f\u5931\u8d25:', error);
        showStatusNotice(error.message || '\u4fdd\u5b58\u56fe\u7247\u4fe1\u606f\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5', { tone: 'error' });
    }
}

function resetFilterBtns() {
    dom.filterBtns.forEach((btn) => btn.classList.remove('active'));
    const noneButton = document.querySelector('.filter-btn[data-filter="none"]');
    if (noneButton) noneButton.classList.add('active');
}

function applyImageStyle() {
    const { brightness, contrast, saturate, blur } = state.currentEdit;
    const editFilter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) blur(${blur}px)`;
    const combined = state.currentFilter === 'none' ? editFilter : `${state.currentFilter} ${editFilter}`;
    dom.lightboxImg.style.filter = combined;
}

function resetEditSliders() {
    editSliders.forEach(({ id, valId, key, unit }) => {
        const value = state.currentEdit[key];
        document.getElementById(id).value = value;
        document.getElementById(valId).textContent = `${value}${unit}`;
    });
}

export async function openLightbox(index) {
    state.currentPhotoIndex = index;
    const photo = state.visiblePhotos[index];
    if (!photo) return;

    dom.lightboxImg.src = photo.src;
    dom.lightboxImg.style.filter = '';
    resetEditorState();
    resetEditSliders();
    resetFilterBtns();
    renderLightboxStory(photo);
    renderFavoriteBtn(photo);

    dom.filterBar.classList.remove('visible');
    dom.editBar.classList.remove('visible');
    dom.editToggleBtn.classList.remove('active');
    dom.editToggleBtn.textContent = '✏️ 编辑图片';
    dom.commentsList.innerHTML = '<p style="color: #999; text-align: center;">评论加载中...</p>';
    dom.lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';

    updateNavBtns();
    updateReactionUI(photo.reactions || {});

    try {
        const details = await fetchPhotoDetails(photo.id);
        const merged = {
            likes: details.likes || 0,
            comments: details.comments || [],
            commentsCount: details.comments?.length || 0,
            reactions: details.reactions || {},
            caption: details.caption || '',
            favorited: Boolean(details.favorited),
            tags: normalizeTags(details.tags),
            groupName: details.groupName || '',
            groupCoverPhotoId: details.groupCoverPhotoId || photo.groupCoverPhotoId || '',
            thumbSrc: details.thumbSrc || photo.thumbSrc || photo.src
        };
        updatePhotoInStore(photo.id, merged);
        const latestPhoto = syncCurrentPhotoIndex(photo.id);
        if (!latestPhoto) return;
        updateReactionUI(latestPhoto.reactions || {});
        renderComments(latestPhoto.comments || []);
        renderLightboxStory(latestPhoto);
        renderFavoriteBtn(latestPhoto);
        renderGalleryHandler();
    } catch (error) {
        dom.commentsList.innerHTML = '<p style="color: #ff8aa1; text-align: center;">详情加载失败，可以稍后再试。</p>';
        console.error('加载详情失败:', error);
        showStatusNotice(error.message || '照片详情加载失败，请稍后重试', {
            tone: 'error',
            actionLabel: '重试详情',
            onAction: () => {
                if (state.currentPhotoIndex !== null) openLightbox(state.currentPhotoIndex);
            }
        });
    }
}

export function closeLightbox() {
    dom.lightbox.classList.remove('active');
    document.body.style.overflow = 'auto';
    state.currentPhotoIndex = null;
    dom.commentInput.value = '';
    dom.authorInput.value = '';
    touchStartPoint = null;
}

export function initLightbox({ onRenderGallery, onOpenSingleDeleteModal }) {
    renderGalleryHandler = onRenderGallery;
    openSingleDeleteModalHandler = onOpenSingleDeleteModal;

    dom.filterBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            state.currentFilter = btn.dataset.filter;
            applyImageStyle();
            dom.filterBtns.forEach((item) => item.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    editSliders.forEach(({ id, valId, key, unit }) => {
        const input = document.getElementById(id);
        const valueLabel = document.getElementById(valId);
        input.addEventListener('input', () => {
            state.currentEdit[key] = Number(input.value);
            valueLabel.textContent = `${input.value}${unit}`;
            applyImageStyle();
        });
    });

    dom.resetEditBtn.addEventListener('click', () => {
        resetEditorState();
        resetEditSliders();
        resetFilterBtns();
        dom.lightboxImg.style.filter = '';
    });

    dom.saveEditBtn.addEventListener('click', () => {
        const canvas = document.createElement('canvas');
        canvas.width = dom.lightboxImg.naturalWidth;
        canvas.height = dom.lightboxImg.naturalHeight;
        const context = canvas.getContext('2d');
        context.filter = dom.lightboxImg.style.filter || 'none';
        context.drawImage(dom.lightboxImg, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `edited_${Date.now()}.jpg`;
            link.click();
            URL.revokeObjectURL(link.href);
        }, 'image/jpeg', 0.92);
    });

    dom.photoStory.addEventListener('click', async (event) => {
        const editBtn = event.target.closest('[data-edit-details]');
        if (editBtn) {
            event.stopPropagation();
            await promptEditPhotoDetails();
            return;
        }

        const coverBtn = event.target.closest('[data-set-group-cover]');
        if (coverBtn) {
            event.stopPropagation();
            await setCurrentPhotoAsGroupCover();
            return;
        }

        const chip = event.target.closest('[data-filter-tag], [data-filter-group]');
        if (!chip) return;
        closeLightbox();
        if (chip.dataset.filterTag) applyTagFilter(chip.dataset.filterTag);
        else if (chip.dataset.filterGroup) applyGroupFilter(chip.dataset.filterGroup);
    });

    if (dom.favoriteBtn) {
        dom.favoriteBtn.addEventListener('click', async () => {
            const photo = getCurrentPhoto();
            if (!photo) return;
            try {
                const favorited = await togglePhotoFavorite(photo.id, { skipNotice: true });
                const latestPhoto = syncCurrentPhotoIndex(photo.id);
                if (!latestPhoto) return;
                const mergedPhoto = { ...latestPhoto, favorited };
                renderFavoriteBtn(mergedPhoto);
                renderLightboxStory(mergedPhoto);
                showStatusNotice(favorited ? '\u5df2\u52a0\u5165\u6536\u85cf' : '\u5df2\u53d6\u6d88\u6536\u85cf', { tone: 'success', duration: 1800 });
            } catch (error) {
                console.error('\u5207\u6362\u6536\u85cf\u5931\u8d25:', error);
                showStatusNotice(error.message || '\u6536\u85cf\u64cd\u4f5c\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5', { tone: 'error' });
            }
        });
    }

    dom.closeBtn.addEventListener('click', closeLightbox);
    dom.deleteBtn.addEventListener('click', openSingleDeleteModalHandler);
    dom.lightboxPrev.addEventListener('click', () => {
        if (state.currentPhotoIndex > 0) openLightbox(state.currentPhotoIndex - 1);
    });
    dom.lightboxNext.addEventListener('click', () => {
        if (state.currentPhotoIndex < state.visiblePhotos.length - 1) openLightbox(state.currentPhotoIndex + 1);
    });
    dom.editToggleBtn.addEventListener('click', () => {
        const isOpen = dom.filterBar.classList.contains('visible');
        dom.filterBar.classList.toggle('visible', !isOpen);
        dom.editBar.classList.toggle('visible', !isOpen);
        dom.editToggleBtn.classList.toggle('active', !isOpen);
        dom.editToggleBtn.textContent = isOpen ? '✏️ 编辑图片' : '✖ 关闭编辑';
    });
    if (dom.lightboxImgWrap) {
        dom.lightboxImgWrap.addEventListener('touchstart', (event) => {
            if (!dom.lightbox.classList.contains('active') || event.touches.length !== 1) return;
            const touch = event.touches[0];
            touchStartPoint = { x: touch.clientX, y: touch.clientY, time: Date.now() };
        }, { passive: true });

        dom.lightboxImgWrap.addEventListener('touchend', (event) => {
            if (!touchStartPoint || !dom.lightbox.classList.contains('active')) return;
            const touch = event.changedTouches[0];
            if (!touch) return;
            const deltaX = touch.clientX - touchStartPoint.x;
            const deltaY = touch.clientY - touchStartPoint.y;
            const absX = Math.abs(deltaX);
            const absY = Math.abs(deltaY);
            const duration = Date.now() - touchStartPoint.time;
            touchStartPoint = null;

            if (duration > 800) return;
            if (absX > 56 && absX > absY * 1.2) {
                if (deltaX < 0 && state.currentPhotoIndex < state.visiblePhotos.length - 1) openLightbox(state.currentPhotoIndex + 1);
                else if (deltaX > 0 && state.currentPhotoIndex > 0) openLightbox(state.currentPhotoIndex - 1);
                return;
            }

            if (deltaY > 96 && absY > absX * 1.1) closeLightbox();
        }, { passive: true });
    }

    dom.lightbox.addEventListener('click', (event) => {
        if (event.target === dom.lightbox) closeLightbox();
    });

    document.addEventListener('keydown', (event) => {
        if (!dom.lightbox.classList.contains('active')) return;
        if (event.key === 'Escape') closeLightbox();
        else if (event.key === 'Delete') openSingleDeleteModalHandler();
        else if (event.key === 'ArrowLeft' && state.currentPhotoIndex > 0) openLightbox(state.currentPhotoIndex - 1);
        else if (event.key === 'ArrowRight' && state.currentPhotoIndex < state.visiblePhotos.length - 1) openLightbox(state.currentPhotoIndex + 1);
    });
}
