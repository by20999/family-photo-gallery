import { dom } from './dom.js';
import { uploadPhotos } from './api.js';
import { resizeImageFile, normalizeTags } from './utils.js';
import { showLocalUploadPreviews, clearLocalUploadPreviews, prependUploadedPhotos } from './gallery.js';

const uploadButtonHtml = dom.uploadBtn.innerHTML;

function buildLocalUploadPreviews(files, caption, tags) {
    const baseTime = Date.now();
    return files.map((file, index) => {
        const previewUrl = URL.createObjectURL(file);
        return {
            id: `local-upload-${baseTime}-${index}`,
            src: previewUrl,
            thumbSrc: previewUrl,
            previewUrl,
            name: file.name,
            caption,
            tags,
            likes: 0,
            commentsCount: 0,
            reactions: {},
            groupName: '',
            uploadTime: baseTime + index,
            isLocalPreview: true
        };
    });
}

function revokePreviewUrls(previews) {
    previews.forEach((photo) => {
        if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl);
    });
}

export function initUpload({ onLoadPhotos }) {
    dom.fileInput.addEventListener('change', async (event) => {
        const files = Array.from(event.target.files).filter((file) => file.type.startsWith('image/'));
        if (files.length === 0) return;

        const caption = dom.captionInput.value.trim();
        const rawTags = dom.tagsInput.value.trim();
        const tags = normalizeTags(rawTags);
        const previews = buildLocalUploadPreviews(files, caption, tags);

        showLocalUploadPreviews(previews);
        dom.uploadBtn.style.pointerEvents = 'none';
        dom.uploadBtn.style.opacity = '0.6';
        dom.uploadProgressWrap.classList.add('visible');

        try {
            const formData = new FormData();
            formData.append('caption', caption);
            formData.append('tags', rawTags);

            for (let index = 0; index < files.length; index += 1) {
                dom.uploadProgressText.textContent = `压缩中 ${index + 1} / ${files.length}...`;
                dom.uploadProgressBar.style.width = `${((index + 0.5) / files.length) * 50}%`;
                const compressed = await resizeImageFile(files[index], { maxSize: 2560, quality: 0.92 });
                formData.append('photos', compressed, files[index].name);
            }

            dom.uploadProgressText.textContent = '上传中...';
            dom.uploadProgressBar.style.width = '60%';

            const result = await uploadPhotos(formData, (progressEvent) => {
                const pct = 60 + (progressEvent.loaded / progressEvent.total) * 35;
                dom.uploadProgressBar.style.width = `${pct}%`;
                dom.uploadProgressText.textContent = `上传中 ${Math.round(progressEvent.loaded / 1024)}KB / ${Math.round(progressEvent.total / 1024)}KB`;
            });

            clearLocalUploadPreviews(previews.map((photo) => photo.id));
            revokePreviewUrls(previews);

            if (Array.isArray(result?.photos) && result.photos.length > 0) {
                prependUploadedPhotos(result.photos);
            }

            dom.uploadProgressBar.style.width = '100%';
            dom.uploadProgressText.textContent = `上传成功 ${files.length} 张 ✓`;
            await onLoadPhotos();
            dom.captionInput.value = '';
            dom.tagsInput.value = '';
            setTimeout(() => {
                dom.uploadProgressWrap.classList.remove('visible');
                dom.uploadProgressBar.style.width = '0%';
            }, 1200);
        } catch (error) {
            console.error('上传失败:', error);
            clearLocalUploadPreviews(previews.map((photo) => photo.id));
            revokePreviewUrls(previews);
            dom.uploadProgressText.textContent = '上传失败，请重试';
            dom.uploadProgressBar.style.background = '#ff4757';
            setTimeout(() => {
                dom.uploadProgressWrap.classList.remove('visible');
                dom.uploadProgressBar.style.width = '0%';
                dom.uploadProgressBar.style.background = '';
            }, 2000);
        } finally {
            dom.uploadBtn.innerHTML = uploadButtonHtml;
            dom.uploadBtn.style.pointerEvents = 'auto';
            dom.uploadBtn.style.opacity = '1';
            dom.fileInput.value = '';
        }
    });
}