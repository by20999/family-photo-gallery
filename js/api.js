async function parseResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await response.json() : null;

    if (!response.ok) {
        throw new Error(data?.error || '请求失败');
    }

    return data;
}

async function requestJson(input, init) {
    try {
        const response = await fetch(input, init);
        return parseResponse(response);
    } catch (error) {
        if (error instanceof Error && error.message) throw error;
        throw new Error('网络连接失败，请检查后重试');
    }
}

export async function fetchPhotos() {
    return requestJson('/api/photos');
}

export async function fetchPhotoDetails(photoId) {
    return requestJson(`/api/photos/${photoId}`);
}

export async function reorderPhotos(orderedIds) {
    return requestJson('/api/photos/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds })
    });
}

export async function createGroup(name, photoIds) {
    return requestJson('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, photoIds })
    });
}

export async function renameGroup(oldName, name) {
    return requestJson(`/api/groups/${encodeURIComponent(oldName)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
}

export async function setGroupCover(groupName, photoId) {
    return requestJson(`/api/groups/${encodeURIComponent(groupName)}/cover`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId })
    });
}

export async function deleteGroupRequest(groupName, password) {
    return requestJson(`/api/groups/${encodeURIComponent(groupName)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    });
}

export async function updatePhotoDetails(photoId, payload) {
    return requestJson(`/api/photos/${photoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

export async function updatePhotoCaption(photoId, caption) {
    return updatePhotoDetails(photoId, { caption });
}

export async function updatePhotoFavorite(photoId, favorited) {
    return requestJson(`/api/photos/${photoId}/favorite`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorited })
    });
}

export async function updateBatchPhotoCaption(photoIds, caption) {
    return requestJson('/api/photos/batch/caption', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoIds, caption })
    });
}

export async function deletePhotoRequest(photoId, password) {
    return requestJson(`/api/photos/${photoId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    });
}

export async function reactToPhoto(photoId, emoji) {
    return requestJson(`/api/photos/${photoId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji })
    });
}

export async function submitPhotoComment(photoId, text, author) {
    return requestJson(`/api/photos/${photoId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, author })
    });
}

export async function deletePhotoComment(photoId, commentId) {
    return requestJson(`/api/photos/${photoId}/comment/${commentId}`, {
        method: 'DELETE'
    });
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
        xhr.onerror = () => reject(new Error('网络连接失败，请稍后重试'));
        xhr.send(formData);
    });
}
