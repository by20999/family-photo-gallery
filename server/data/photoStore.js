const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { dataFile, uploadDir, thumbsDir } = require('../config');

const IMAGE_FILE_PATTERN = /\.(jpg|jpeg|png|gif|webp)$/i;

function isImageFilename(fileName) {
    return IMAGE_FILE_PATTERN.test(fileName);
}

function normalizeTags(tags) {
    if (!tags) return [];
    if (Array.isArray(tags)) {
        return [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))];
    }
    return [...new Set(String(tags).split(/[，,、\s]+/).map((tag) => tag.trim()).filter(Boolean))];
}

function normalizeOrder(order) {
    return Number.isFinite(Number(order)) ? Number(order) : null;
}

function normalizePhotoEntry(entry = {}) {
    return {
        likes: Number(entry.likes) || 0,
        comments: Array.isArray(entry.comments) ? entry.comments : [],
        reactions: entry.reactions && typeof entry.reactions === 'object' ? entry.reactions : {},
        caption: typeof entry.caption === 'string' ? entry.caption.trim() : '',
        favorited: Boolean(entry.favorited),
        tags: normalizeTags(entry.tags),
        order: normalizeOrder(entry.order),
        groupName: typeof entry.groupName === 'string' ? entry.groupName.trim() : '',
        thumbnail: typeof entry.thumbnail === 'string' ? entry.thumbnail.trim() : '',
        eventDate: typeof entry.eventDate === 'string' ? entry.eventDate.trim().slice(0, 10) : '',
        eventName: typeof entry.eventName === 'string' ? entry.eventName.trim().slice(0, 40) : '',
        contentHash: typeof entry.contentHash === 'string' ? entry.contentHash.trim() : '',
        fileSize: Number.isFinite(Number(entry.fileSize)) ? Number(entry.fileSize) : 0
    };
}

function loadPhotoData() {
    if (!fs.existsSync(dataFile)) return {};
    try {
        const raw = fs.readFileSync(dataFile, 'utf8').trim();
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return Object.fromEntries(Object.entries(parsed).map(([photoId, entry]) => [photoId, normalizePhotoEntry(entry)]));
    } catch {
        return {};
    }
}

function savePhotoData(data) {
    const normalized = Object.fromEntries(Object.entries(data).map(([photoId, entry]) => [photoId, normalizePhotoEntry(entry)]));
    const tempFile = `${dataFile}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(normalized, null, 2));
    fs.renameSync(tempFile, dataFile);
}

async function listPhotoFiles() {
    const entries = await fsp.readdir(uploadDir, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile() && isImageFilename(entry.name))
        .map((entry) => entry.name);
}

function getThumbnailFilename(photoId, photoDataEntry) {
    const entry = normalizePhotoEntry(photoDataEntry);
    return entry.thumbnail || `${path.parse(photoId).name}.jpg`;
}

function getThumbnailPath(photoId, photoDataEntry) {
    return path.join(thumbsDir, getThumbnailFilename(photoId, photoDataEntry));
}

function getThumbnailSrc(photoId, photoDataEntry) {
    const thumbFilename = getThumbnailFilename(photoId, photoDataEntry);
    return fs.existsSync(path.join(thumbsDir, thumbFilename)) ? `/thumbnails/${thumbFilename}` : null;
}

function getPhotoMeta(photoId, photoData) {
    const data = normalizePhotoEntry(photoData[photoId]);
    return {
        likes: data.likes,
        commentsCount: data.comments.length,
        reactions: data.reactions,
        caption: data.caption,
        favorited: data.favorited,
        tags: data.tags,
        order: data.order,
        groupName: data.groupName,
        thumbnail: data.thumbnail,
        eventDate: data.eventDate,
        eventName: data.eventName,
        contentHash: data.contentHash,
        fileSize: data.fileSize
    };
}

function getPhotoDetails(photoId, photoData) {
    const data = normalizePhotoEntry(photoData[photoId]);
    return {
        likes: data.likes,
        comments: data.comments,
        reactions: data.reactions,
        caption: data.caption,
        favorited: data.favorited,
        tags: data.tags,
        order: data.order,
        groupName: data.groupName,
        thumbnail: data.thumbnail,
        eventDate: data.eventDate,
        eventName: data.eventName,
        contentHash: data.contentHash,
        fileSize: data.fileSize
    };
}

function ensurePhotoOrders(photos, photoData) {
    let changed = false;
    const ordered = [...photos].sort((a, b) => b.uploadTime - a.uploadTime);
    ordered.forEach((photo, index) => {
        const entry = normalizePhotoEntry(photoData[photo.id]);
        if (entry.order === null) {
            entry.order = index;
            photoData[photo.id] = entry;
            changed = true;
        }
    });
    if (changed) savePhotoData(photoData);
    return changed;
}

function sortPhotos(photos) {
    return photos.sort((a, b) => {
        const aOrder = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
        const bOrder = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return b.uploadTime - a.uploadTime;
    });
}

module.exports = {
    IMAGE_FILE_PATTERN,
    isImageFilename,
    normalizeTags,
    normalizeOrder,
    normalizePhotoEntry,
    loadPhotoData,
    savePhotoData,
    listPhotoFiles,
    getThumbnailFilename,
    getThumbnailPath,
    getThumbnailSrc,
    getPhotoMeta,
    getPhotoDetails,
    ensurePhotoOrders,
    sortPhotos
};
