import { dom } from './dom.js';
import { uploadPhotos } from './api.js';
import { resizeImageFile, normalizeTags } from './utils.js';
import { showLocalUploadPreviews, clearLocalUploadPreviews, prependUploadedPhotos } from './gallery.js';
import { showStatusNotice } from './feedback.js';

const uploadButtonHtml = dom.uploadBtn.innerHTML;
const defaultUploadHint = dom.uploadDropHint?.textContent || '\u652f\u6301\u62d6\u62fd\u4e0a\u4f20\uff0c\u4f1a\u81ea\u52a8\u6cbf\u7528\u5f53\u524d\u63cf\u8ff0\u3001\u6807\u7b7e\u548c\u5206\u7ec4';

function setUploadHint(text, isActive = false) {
    if (!dom.uploadDropHint) return;
    dom.uploadDropHint.textContent = text || defaultUploadHint;
    dom.uploadDropHint.classList.toggle('active', isActive);
}

function setUploadSectionState(className, active) {
    if (!dom.uploadSection) return;
    dom.uploadSection.classList.toggle(className, active);
}

function buildLocalUploadPreviews(files, caption, tags, groupName) {
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
            favorited: false,
            likes: 0,
            commentsCount: 0,
            reactions: {},
            groupName,
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

async function handleSelectedFiles(fileList, onLoadPhotos) {
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) {
        showStatusNotice('\u8fd9\u6b21\u6ca1\u6709\u8bc6\u522b\u5230\u53ef\u4e0a\u4f20\u7684\u56fe\u7247\u6587\u4ef6\u3002', { tone: 'info', duration: 2200 });
        setUploadHint(defaultUploadHint, false);
        return;
    }

    const caption = dom.captionInput.value.trim();
    const rawTags = dom.tagsInput.value.trim();
    const tags = normalizeTags(rawTags);
    const groupName = dom.uploadGroupSelect.value.trim();
    const previews = buildLocalUploadPreviews(files, caption, tags, groupName);

    showLocalUploadPreviews(previews, groupName || '\u5168\u90e8\u56fe\u7247');
    dom.uploadBtn.style.pointerEvents = 'none';
    dom.uploadBtn.style.opacity = '0.6';
    dom.uploadProgressWrap.classList.add('visible');
    setUploadSectionState('is-uploading', true);
    setUploadHint(`\u672c\u6b21\u5c06\u4e0a\u4f20 ${files.length} \u5f20\u7167\u7247\uff0c\u4f1a\u6cbf\u7528\u5f53\u524d\u63cf\u8ff0\u3001\u6807\u7b7e\u548c\u5206\u7ec4\u3002`, true);

    try {
        const formData = new FormData();
        formData.append('caption', caption);
        formData.append('tags', rawTags);
        formData.append('groupName', groupName);

        for (let index = 0; index < files.length; index += 1) {
            dom.uploadProgressText.textContent = `\u538b\u7f29\u4e2d ${index + 1} / ${files.length}...`;
            dom.uploadProgressBar.style.width = `${((index + 0.5) / files.length) * 50}%`;
            const compressed = await resizeImageFile(files[index], { maxSize: 2560, quality: 0.92 });
            formData.append('photos', compressed, files[index].name);
        }

        dom.uploadProgressText.textContent = '\u4e0a\u4f20\u4e2d...';
        dom.uploadProgressBar.style.width = '60%';

        const result = await uploadPhotos(formData, (progressEvent) => {
            const pct = 60 + (progressEvent.loaded / progressEvent.total) * 35;
            dom.uploadProgressBar.style.width = `${pct}%`;
            dom.uploadProgressText.textContent = `\u4e0a\u4f20\u4e2d ${Math.round(progressEvent.loaded / 1024)}KB / ${Math.round(progressEvent.total / 1024)}KB`;
        });

        clearLocalUploadPreviews(previews.map((photo) => photo.id));
        revokePreviewUrls(previews);

        if (Array.isArray(result?.photos) && result.photos.length > 0) {
            prependUploadedPhotos(result.photos);
        }

        dom.uploadProgressBar.style.width = '100%';
        dom.uploadProgressText.textContent = `\u4e0a\u4f20\u6210\u529f ${files.length} \u5f20 \u2713`; 
        await onLoadPhotos();
        dom.captionInput.value = '';
        dom.tagsInput.value = '';
        showStatusNotice(`\u5df2\u4e0a\u4f20 ${files.length} \u5f20\u7167\u7247\uff0c\u53ef\u4ee5\u7ee7\u7eed\u8865\u5145\u6545\u4e8b\u6216\u6807\u7b7e\u3002`, { tone: 'success' });
        dom.gallery.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setUploadHint('\u4e0a\u4f20\u5b8c\u6210\uff0c\u53ef\u4ee5\u7ee7\u7eed\u62d6\u62fd\u6216\u7ee7\u7eed\u9009\u62e9\u7167\u7247\u3002', true);
        setTimeout(() => {
            dom.uploadProgressWrap.classList.remove('visible');
            dom.uploadProgressBar.style.width = '0%';
            setUploadHint(defaultUploadHint, false);
        }, 1200);
    } catch (error) {
        console.error('\u4e0a\u4f20\u5931\u8d25:', error);
        clearLocalUploadPreviews(previews.map((photo) => photo.id));
        revokePreviewUrls(previews);
        dom.uploadProgressText.textContent = '\u4e0a\u4f20\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5';
        dom.uploadProgressBar.style.background = '#ff4757';
        showStatusNotice(error.message || '\u4e0a\u4f20\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5', { tone: 'error' });
        setUploadHint('\u4e0a\u4f20\u5931\u8d25\u4e86\uff0c\u91cd\u65b0\u62d6\u8fdb\u6765\u6216\u91cd\u65b0\u9009\u62e9\u6587\u4ef6\u5373\u53ef\u3002', true);
        setTimeout(() => {
            dom.uploadProgressWrap.classList.remove('visible');
            dom.uploadProgressBar.style.width = '0%';
            dom.uploadProgressBar.style.background = '';
            setUploadHint(defaultUploadHint, false);
        }, 2000);
    } finally {
        dom.uploadBtn.innerHTML = uploadButtonHtml;
        dom.uploadBtn.style.pointerEvents = 'auto';
        dom.uploadBtn.style.opacity = '1';
        dom.fileInput.value = '';
        setUploadSectionState('is-uploading', false);
        setUploadSectionState('is-dragover', false);
    }
}

export function initUpload({ onLoadPhotos }) {
    dom.fileInput.addEventListener('change', async (event) => {
        await handleSelectedFiles(event.target.files, onLoadPhotos);
    });

    if (!dom.uploadSection) return;

    ['dragenter', 'dragover'].forEach((eventName) => {
        dom.uploadSection.addEventListener(eventName, (event) => {
            event.preventDefault();
            if (dom.uploadSection.classList.contains('is-uploading')) return;
            setUploadSectionState('is-dragover', true);
            setUploadHint('\u677e\u5f00\u5373\u53ef\u5f00\u59cb\u4e0a\u4f20\uff0c\u4f1a\u81ea\u52a8\u6cbf\u7528\u5f53\u524d\u63cf\u8ff0\u3001\u6807\u7b7e\u548c\u5206\u7ec4\u3002', true);
        });
    });

    ['dragleave', 'dragend'].forEach((eventName) => {
        dom.uploadSection.addEventListener(eventName, (event) => {
            if (event.relatedTarget && dom.uploadSection.contains(event.relatedTarget)) return;
            setUploadSectionState('is-dragover', false);
            if (!dom.uploadSection.classList.contains('is-uploading')) setUploadHint(defaultUploadHint, false);
        });
    });

    dom.uploadSection.addEventListener('drop', async (event) => {
        event.preventDefault();
        setUploadSectionState('is-dragover', false);
        if (dom.uploadSection.classList.contains('is-uploading')) return;
        await handleSelectedFiles(event.dataTransfer?.files, onLoadPhotos);
    });
}
