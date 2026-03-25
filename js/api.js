async function parseResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await response.json() : null;

    if (!response.ok) {
        throw new Error(data?.error || '请求失败');
    }

    return data;
}

export async function fetchPhotos() {
    return parseResponse(await fetch('/api/photos'));
}

export async function fetchPhotoDetails(photoId) {
    return parseResponse(await fetch(`/api/photos/${photoId}`));
}

export async function reorderPhotos(orderedIds) {
    return parseResponse(await fetch('/api/photos/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds })
    }));
}

export async function createGroup(name, photoIds) {
    return parseResponse(await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, photoIds })
    }));
}

export async function deletePhotoRequest(photoId, password) {
    return parseResponse(await fetch(`/api/photos/${photoId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    }));
}

export async function reactToPhoto(photoId, emoji) {
    return parseResponse(await fetch(`/api/photos/${photoId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji })
    }));
}

export async function submitPhotoComment(photoId, text, author) {
    return parseResponse(await fetch(`/api/photos/${photoId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, author })
    }));
}

export async function deletePhotoComment(photoId, commentId) {
    return parseResponse(await fetch(`/api/photos/${photoId}/comment/${commentId}`, {
        method: 'DELETE'
    }));
}

export function uploadPhotos(formData, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload');
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && typeof onProgress === 'function') {
                onProgress(event);
            }
        };
        xhr.onload = () => {
            try {
                const data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(data);
                } else {
                    reject(new Error(data?.error || '上传失败'));
                }
            } catch {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(null);
                } else {
                    reject(new Error('上传失败'));
                }
            }
        };
        xhr.onerror = () => reject(new Error('网络错误'));
        xhr.send(formData);
    });
}