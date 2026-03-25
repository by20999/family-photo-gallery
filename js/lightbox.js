import { dom, editSliders } from './dom.js';
import { state, resetEditorState, updatePhotoInStore } from './state.js';
import { fetchPhotoDetails } from './api.js';
import { normalizeTags, formatUploadDate, escapeHtml } from './utils.js';
import { getPhotoGroupName, applyTagFilter, applyGroupFilter } from './gallery.js';
import { renderComments, updateReactionUI } from './comments.js';

let renderGalleryHandler = () => {};
let openSingleDeleteModalHandler = () => {};

function updateNavBtns() {
    dom.lightboxPrev.disabled = state.currentPhotoIndex <= 0;
    dom.lightboxNext.disabled = state.currentPhotoIndex >= state.visiblePhotos.length - 1;
}

function renderLightboxStory(photo) {
    const tags = (photo.tags || [])
        .map((tag) => `<button class="story-tag filter-chip" type="button" data-filter-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`)
        .join('');
    const groupName = getPhotoGroupName(photo);
    const groupBlock = groupName
        ? `<div class="story-tags"><button class="story-tag filter-chip" type="button" data-filter-group="${escapeHtml(groupName)}">分组 · ${escapeHtml(groupName)}</button></div>`
        : '';
    dom.photoStory.innerHTML = `
        <div class="story-date">${formatUploadDate(photo.uploadTime) || '刚刚上传'}</div>
        ${photo.caption ? `<div class="story-caption">${escapeHtml(photo.caption)}</div>` : '<div class="story-caption empty">这张照片还没有描述，上传下一组时可以顺手写一句小故事。</div>'}
        ${groupBlock}
        ${tags ? `<div class="story-tags">${tags}</div>` : ''}
    `;
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
            tags: normalizeTags(details.tags),
            groupName: details.groupName || '',
            thumbSrc: details.thumbSrc || photo.thumbSrc || photo.src
        };
        updatePhotoInStore(photo.id, merged);
        const latestPhoto = state.currentPhotoIndex === null ? null : state.visiblePhotos[state.currentPhotoIndex];
        if (!latestPhoto) return;
        updateReactionUI(latestPhoto.reactions || {});
        renderComments(latestPhoto.comments || []);
        renderLightboxStory(latestPhoto);
        renderGalleryHandler();
    } catch (error) {
        dom.commentsList.innerHTML = '<p style="color: #ff4757; text-align: center;">评论加载失败，请重试</p>';
        console.error('加载详情失败:', error);
    }
}

export function closeLightbox() {
    dom.lightbox.classList.remove('active');
    document.body.style.overflow = 'auto';
    state.currentPhotoIndex = null;
    dom.commentInput.value = '';
    dom.authorInput.value = '';
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

    dom.photoStory.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-filter-tag], [data-filter-group]');
        if (!chip) return;
        closeLightbox();
        if (chip.dataset.filterTag) applyTagFilter(chip.dataset.filterTag);
        else if (chip.dataset.filterGroup) applyGroupFilter(chip.dataset.filterGroup);
    });

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