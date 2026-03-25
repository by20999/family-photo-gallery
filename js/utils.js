export function normalizeTags(tags) {
    if (!tags) return [];
    if (Array.isArray(tags)) {
        return [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))];
    }
    return [...new Set(String(tags).split(/[，,、\s]+/).map((tag) => tag.trim()).filter(Boolean))];
}

export function formatUploadMonth(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '未标记月份';
    return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function formatUploadDate(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function resizeImageFile(file, options = {}) {
    const {
        maxSize = 2560,
        quality = 0.92,
        mimeType = file.type || 'image/jpeg'
    } = options;

    return new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(file);

        image.onload = () => {
            URL.revokeObjectURL(url);
            let { width, height } = image;
            if (width <= maxSize && height <= maxSize && mimeType === file.type) {
                resolve(file);
                return;
            }

            if (width > height) {
                height = Math.round((height * maxSize) / width);
                width = maxSize;
            } else {
                width = Math.round((width * maxSize) / height);
                height = maxSize;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0, width, height);
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error('图片压缩失败'));
                    return;
                }
                resolve(new File([blob], file.name, { type: mimeType }));
            }, mimeType, quality);
        };

        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('图片读取失败'));
        };

        image.src = url;
    });
}