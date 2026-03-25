const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { uploadDir } = require('../config');
const { getThumbnailFilename, getThumbnailPath, normalizePhotoEntry, savePhotoData } = require('../data/photoStore');

const THUMB_SIZE = 640;
const THUMB_QUALITY = 82;
const THUMB_CONCURRENCY = 4;

async function ensureThumbnailForPhoto(photoId, photoData) {
    const entry = normalizePhotoEntry(photoData[photoId]);
    const thumbFilename = getThumbnailFilename(photoId, entry);
    const thumbPath = getThumbnailPath(photoId, entry);
    const nextEntry = { ...entry, thumbnail: thumbFilename };

    if (fs.existsSync(thumbPath)) {
        if (entry.thumbnail !== thumbFilename) {
            photoData[photoId] = nextEntry;
            return true;
        }
        return false;
    }

    await sharp(path.join(uploadDir, photoId))
        .rotate()
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
        .toFile(thumbPath);

    photoData[photoId] = nextEntry;
    return true;
}

async function ensureThumbnails(photoIds, photoData) {
    let changed = false;
    let index = 0;

    async function worker() {
        while (index < photoIds.length) {
            const currentIndex = index;
            index += 1;
            const photoId = photoIds[currentIndex];
            try {
                const didChange = await ensureThumbnailForPhoto(photoId, photoData);
                if (didChange) changed = true;
            } catch (error) {
                console.error(`生成缩略图失败: ${photoId}`, error);
            }
        }
    }

    const workerCount = Math.min(THUMB_CONCURRENCY, Math.max(photoIds.length, 1));
    await Promise.all(Array.from({ length: workerCount }, worker));

    return changed;
}

async function ensureAndPersistThumbnails(photoIds, photoData) {
    const changed = await ensureThumbnails(photoIds, photoData);
    if (changed) {
        savePhotoData(photoData);
    }
    return changed;
}

module.exports = {
    THUMB_SIZE,
    ensureThumbnailForPhoto,
    ensureThumbnails,
    ensureAndPersistThumbnails
};