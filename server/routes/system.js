const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { uploadDir, thumbsDir } = require('../config');
const { IMAGE_FILE_PATTERN, loadPhotoData } = require('../data/photoStore');

function listFiles(dir, pattern = null) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && (!pattern || pattern.test(entry.name)))
        .map((entry) => entry.name);
}

function buildDuplicateGroups(photoData) {
    const byHash = new Map();
    Object.entries(photoData).forEach(([photoId, entry]) => {
        if (!entry.contentHash) return;
        if (!byHash.has(entry.contentHash)) byHash.set(entry.contentHash, []);
        byHash.get(entry.contentHash).push({
            id: photoId,
            name: path.parse(photoId).name,
            fileSize: entry.fileSize || 0,
            eventName: entry.eventName || '',
            eventDate: entry.eventDate || ''
        });
    });
    return [...byHash.values()].filter((items) => items.length > 1);
}

function createSystemRouter() {
    const router = express.Router();

    router.get('/health', (req, res) => {
        try {
            const photos = listFiles(uploadDir, IMAGE_FILE_PATTERN);
            const thumbnails = listFiles(thumbsDir, /\.jpe?g$/i);
            const photoData = loadPhotoData();
            const photoIds = Object.keys(photoData);
            const duplicateGroups = buildDuplicateGroups(photoData);
            const orphanThumbnails = thumbnails.filter((thumbnail) => {
                const base = path.parse(thumbnail).name.toLowerCase();
                return !photos.some((photo) => path.parse(photo).name.toLowerCase() === base);
            });

            res.json({
                ok: true,
                counts: {
                    photos: photos.length,
                    thumbnails: thumbnails.length,
                    metadata: photoIds.length,
                    duplicateGroups: duplicateGroups.length
                },
                issues: {
                    missingFilesForMetadata: photoIds.filter((photoId) => !photos.includes(photoId)),
                    missingMetadataForFiles: photos.filter((photoId) => !Object.prototype.hasOwnProperty.call(photoData, photoId)),
                    orphanThumbnails
                },
                duplicates: duplicateGroups,
                paths: {
                    uploadDir,
                    thumbsDir
                }
            });
        } catch (error) {
            console.error('System health check failed:', error);
            res.status(500).json({ ok: false, error: '系统状态检查失败' });
        }
    });

    router.post('/open-uploads', (req, res) => {
        try {
            const opener = process.platform === 'win32'
                ? ['explorer.exe', [uploadDir]]
                : process.platform === 'darwin'
                    ? ['open', [uploadDir]]
                    : ['xdg-open', [uploadDir]];
            const child = spawn(opener[0], opener[1], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
            res.json({ success: true, path: uploadDir });
        } catch (error) {
            console.error('Open uploads folder failed:', error);
            res.status(500).json({ error: '打开上传目录失败' });
        }
    });

    return router;
}

module.exports = createSystemRouter;
