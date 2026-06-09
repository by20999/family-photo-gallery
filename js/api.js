async function parseResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await response.json() : null;

    if (!response.ok) {
        throw new Error(data?.error || '请求失败');
    }

    return data;
}

const ADMIN_PASSWORD_KEY = 'album_admin_password';
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isWriteRequest(init = {}) {
    const method = String(init.method || 'GET').toUpperCase();
    return WRITE_METHODS.has(method);
}

function getCachedAdminPassword() {
    try {
        return sessionStorage.getItem(ADMIN_PASSWORD_KEY) || '';
    } catch {
        return '';
    }
}

function cacheAdminPassword(password) {
    try {
        if (password) sessionStorage.setItem(ADMIN_PASSWORD_KEY, password);
        else sessionStorage.removeItem(ADMIN_PASSWORD_KEY);
    } catch {
        // Session storage may be unavailable in restricted browser contexts.
    }
}

function requestAdminPassword() {
    const cached = getCachedAdminPassword();
    if (cached) return cached;

    const password = window.prompt('请输入管理密码以继续此操作');
    if (!password) {
        throw new Error('需要管理密码');
    }
    cacheAdminPassword(password);
    return password;
}

function appendAdminPassword(init = {}) {
    if (!isWriteRequest(init)) return init;

    const headers = new Headers(init.headers || {});
    if (!headers.has('X-Admin-Password')) {
        headers.set('X-Admin-Password', requestAdminPassword());
    }

    return {
        ...init,
        headers
    };
}

async function requestJson(input, init) {
    try {
        const response = await fetch(input, appendAdminPassword(init || {}));
        if (response.status === 403 && isWriteRequest(init || {})) {
            cacheAdminPassword('');
        }
        return parseResponse(response);
    } catch (error) {
        if (error instanceof Error && error.message) throw error;
        throw new Error('网络连接失败，请检查后重试');
    }
}

export async function fetchPhotos() {
    return requestJson('/api/photos');
}

export async function fetchSystemHealth() {
    return requestJson('/api/system/health');
}

export async function openUploadsFolderRequest() {
    return requestJson('/api/system/open-uploads', {
        method: 'POST'
    });
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
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
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

export async function updateBatchPhotoDetails(photoIds, payload) {
    return requestJson('/api/photos/batch/details', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoIds, ...payload })
    });
}

export async function deletePhotoRequest(photoId, password) {
    return requestJson(`/api/photos/${photoId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
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

export async function fetchStories() {
    return requestJson('/api/stories');
}

export async function createStoryRequest(name) {
    return requestJson('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
}

export async function updateStoryRequest(storyId, payload) {
    return requestJson(`/api/stories/${encodeURIComponent(storyId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

export async function deleteStoryRequest(storyId) {
    return requestJson(`/api/stories/${encodeURIComponent(storyId)}`, {
        method: 'DELETE'
    });
}

export async function addStoryItemsRequest(storyId, payload) {
    return requestJson(`/api/stories/${encodeURIComponent(storyId)}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

export async function updateStoryItemsLayoutRequest(storyId, items) {
    return requestJson(`/api/stories/${encodeURIComponent(storyId)}/items/layout`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
    });
}

export async function deleteStoryItemRequest(storyId, itemId) {
    return requestJson(`/api/stories/${encodeURIComponent(storyId)}/items/${encodeURIComponent(itemId)}`, {
        method: 'DELETE'
    });
}

export function uploadPhotos(formData, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload');
        try {
            xhr.setRequestHeader('X-Admin-Password', requestAdminPassword());
        } catch (error) {
            reject(error);
            return;
        }
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
                    if (xhr.status === 403) cacheAdminPassword('');
                    reject(new Error(data?.error || '上传失败'));
                }
            } catch {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(null);
                } else {
                    if (xhr.status === 403) cacheAdminPassword('');
                    reject(new Error('上传失败'));
                }
            }
        };
        xhr.onerror = () => reject(new Error('网络连接失败，请稍后重试'));
        xhr.send(formData);
    });
}
