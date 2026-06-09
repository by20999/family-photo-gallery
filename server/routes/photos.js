const express = require('express');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { DELETE_PASSWORD, uploadDir, thumbsDir } = require('../config');
const {
    loadPhotoData,
    savePhotoData,
    listPhotoFiles,
    normalizePhotoEntry,
    normalizeTags,
    getPhotoMeta,
    getPhotoDetails,
    getThumbnailFilename,
    getThumbnailPath,
    getThumbnailSrc,
    ensurePhotoOrders,
    sortPhotos,
    isImageFilename
} = require('../data/photoStore');
const { ensureAndPersistThumbnails } = require('../services/thumbnailService');
const { loadGroupData, saveGroupData, syncGroupDataWithPhotos } = require('../data/groupStore');

const WINDOWS_RESERVED_FILENAME_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function hashFile(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

function normalizeEventDate(value) {
    const raw = typeof value === 'string' ? value.trim() : '';
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function normalizeEventName(value) {
    return typeof value === 'string' ? value.trim().slice(0, 40) : '';
}

function sanitizePhotoBaseName(rawName) {
    const parsed = path.parse(String(rawName || '').trim());
    const withoutExtension = parsed.name || parsed.base || '';
    const sanitized = withoutExtension
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[. ]+$/g, '')
        .trim()
        .slice(0, 80);

    if (!sanitized) return 'photo';
    return WINDOWS_RESERVED_FILENAME_PATTERN.test(sanitized) ? `${sanitized}-file` : sanitized;
}

function buildUniquePhotoFilename(rawName, extension, existingFileNames, currentPhotoId = '') {
    const normalizedExtension = (extension || path.extname(currentPhotoId) || '.jpg').toLowerCase();
    const baseSeed = sanitizePhotoBaseName(rawName);
    const occupiedBaseNames = new Set(
        existingFileNames
            .filter((fileName) => fileName !== currentPhotoId)
            .map((fileName) => path.parse(fileName).name.toLowerCase())
    );

    let candidateBase = baseSeed;
    let suffix = 2;
    while (occupiedBaseNames.has(candidateBase.toLowerCase())) {
        candidateBase = `${baseSeed}-${suffix}`;
        suffix += 1;
    }

    return `${candidateBase}${normalizedExtension}`;
}

function listPhotoFilesSync() {
    if (!fs.existsSync(uploadDir)) return [];
    return fs.readdirSync(uploadDir).filter((fileName) => isImageFilename(fileName));
}

function normalizePhotoIdParam(value) {
    const photoId = String(value || '').trim();
    if (!photoId || path.basename(photoId) !== photoId || photoId.includes('/') || photoId.includes('\\')) {
        return '';
    }
    return isImageFilename(photoId) ? photoId : '';
}

function getExistingPhotoId(req, res, paramName = 'id') {
    const photoId = normalizePhotoIdParam(req.params[paramName]);
    if (!photoId) {
        res.status(400).json({ error: '图片 ID 无效' });
        return '';
    }

    if (!fs.existsSync(path.join(uploadDir, photoId))) {
        res.status(404).json({ error: '图片不存在' });
        return '';
    }

    return photoId;
}

function updateGroupCoverPhotoIds(groupData, oldPhotoId, nextPhotoId) {
    return Object.fromEntries(
        Object.entries(groupData).map(([groupName, entry]) => [
            groupName,
            {
                ...entry,
                coverPhotoId: entry?.coverPhotoId === oldPhotoId ? nextPhotoId : (entry?.coverPhotoId || '')
            }
        ])
    );
}

function buildPhotoResponse(photoId, photoData, groupData, uploadTime) {
    const meta = getPhotoMeta(photoId, photoData);
    return {
        id: photoId,
        src: `/uploads/${photoId}`,
        thumbSrc: getThumbnailSrc(photoId, photoData[photoId]) || `/uploads/${photoId}`,
        name: path.parse(photoId).name,
        uploadTime,
        likes: meta.likes,
        commentsCount: meta.commentsCount,
        reactions: meta.reactions,
        caption: meta.caption,
        favorited: meta.favorited,
        tags: meta.tags,
        order: meta.order,
        groupName: meta.groupName,
        groupCoverPhotoId: meta.groupName ? (groupData[meta.groupName]?.coverPhotoId || '') : '',
        eventDate: meta.eventDate,
        eventName: meta.eventName,
        duplicateKey: meta.contentHash
    };
}

function createPhotosRouter() {
    const router = express.Router();

    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => {
            if (!req._reservedUploadNames) req._reservedUploadNames = new Set();
            const existingFileNames = [...listPhotoFilesSync(), ...req._reservedUploadNames];
            const uniqueName = buildUniquePhotoFilename(file.originalname, path.extname(file.originalname), existingFileNames);
            req._reservedUploadNames.add(uniqueName);
            cb(null, uniqueName);
        }
    });

    const upload = multer({
        storage,
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            if (file.mimetype.startsWith('image/')) cb(null, true);
            else cb(new Error('只允许上传图片文件'));
        }
    });

    router.get('/photos', async (req, res) => {
        try {
            const files = await listPhotoFiles();
            const photoData = loadPhotoData();
            const rawGroupData = loadGroupData();
            const groupData = syncGroupDataWithPhotos(rawGroupData, photoData);
            const groupDataChanged = JSON.stringify(rawGroupData) !== JSON.stringify(groupData);
            const thumbnailChanged = await ensureAndPersistThumbnails(files, photoData);
            const statsEntries = await Promise.all(files.map(async (file) => [file, await fsp.stat(path.join(uploadDir, file))]));
            const statsMap = new Map(statsEntries);
            const photos = files.map((file) => {
                const stats = statsMap.get(file);
                return buildPhotoResponse(file, photoData, groupData, stats.mtimeMs);
            });

            const orderChanged = ensurePhotoOrders(photos, photoData);
            if (thumbnailChanged && !orderChanged) {
                savePhotoData(photoData);
            }
            if (groupDataChanged) {
                saveGroupData(groupData);
            }

            const sortedPhotos = sortPhotos(photos.map((photo) => ({
                ...photo,
                order: getPhotoMeta(photo.id, photoData).order
            })));

            res.json(sortedPhotos);
        } catch (error) {
            console.error('读取图片失败:', error);
            res.status(500).json({ error: '读取图片失败' });
        }
    });

    router.get('/photos/:id', (req, res) => {
        const photoId = getExistingPhotoId(req, res);
        if (!photoId) return;
        const filePath = path.join(uploadDir, photoId);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: '图片不存在' });
        }

        const photoData = loadPhotoData();
        const rawGroupData = loadGroupData();
        const groupData = syncGroupDataWithPhotos(rawGroupData, photoData);
        if (JSON.stringify(rawGroupData) !== JSON.stringify(groupData)) {
            saveGroupData(groupData);
        }
        const details = getPhotoDetails(photoId, photoData);

        res.json({
            id: photoId,
            src: `/uploads/${photoId}`,
            thumbSrc: getThumbnailSrc(photoId, photoData[photoId]) || `/uploads/${photoId}`,
            name: path.parse(photoId).name,
            likes: details.likes,
            comments: details.comments,
            reactions: details.reactions,
            caption: details.caption,
            favorited: details.favorited,
            tags: details.tags,
            order: details.order,
            groupName: details.groupName,
            groupCoverPhotoId: details.groupName ? (groupData[details.groupName]?.coverPhotoId || '') : '',
            eventDate: details.eventDate,
            eventName: details.eventName,
            duplicateKey: details.contentHash
        });
    });

    router.patch('/photos/batch/caption', async (req, res) => {
        const rawIds = Array.isArray(req.body?.photoIds) ? req.body.photoIds : [];
        const photoIds = [...new Set(rawIds.map((photoId) => String(photoId || '').trim()).filter(Boolean))];

        if (photoIds.length === 0) {
            return res.status(400).json({ error: '请选择要更新的照片' });
        }

        const existingFiles = new Set(await listPhotoFiles());
        const hasUnknownId = photoIds.some((photoId) => !existingFiles.has(photoId));
        if (hasUnknownId) {
            return res.status(400).json({ error: '包含不存在的照片' });
        }

        const rawCaption = typeof req.body.caption === 'string' ? req.body.caption.trim() : '';
        const caption = rawCaption.slice(0, 80);
        const photoData = loadPhotoData();

        photoIds.forEach((photoId) => {
            const entry = normalizePhotoEntry(photoData[photoId]);
            photoData[photoId] = {
                ...entry,
                caption
            };
        });

        savePhotoData(photoData);
        res.json({ success: true, updatedCount: photoIds.length, caption });
    });

    router.patch('/photos/batch/details', async (req, res) => {
        const rawIds = Array.isArray(req.body?.photoIds) ? req.body.photoIds : [];
        const photoIds = [...new Set(rawIds.map((photoId) => String(photoId || '').trim()).filter(Boolean))];

        if (photoIds.length === 0) {
            return res.status(400).json({ error: '请选择要整理的照片' });
        }

        const existingFiles = new Set(await listPhotoFiles());
        const hasUnknownId = photoIds.some((photoId) => !existingFiles.has(photoId));
        if (hasUnknownId) {
            return res.status(400).json({ error: '包含不存在的照片' });
        }

        const body = req.body || {};
        const hasCaption = Object.prototype.hasOwnProperty.call(body, 'caption');
        const hasTags = Object.prototype.hasOwnProperty.call(body, 'tags');
        const hasEventDate = Object.prototype.hasOwnProperty.call(body, 'eventDate');
        const hasEventName = Object.prototype.hasOwnProperty.call(body, 'eventName');

        if (!hasCaption && !hasTags && !hasEventDate && !hasEventName) {
            return res.status(400).json({ error: '没有可更新的整理字段' });
        }

        const caption = hasCaption ? String(body.caption || '').trim().slice(0, 80) : null;
        const tags = hasTags ? normalizeTags(body.tags).slice(0, 12) : null;
        const eventDate = hasEventDate ? normalizeEventDate(body.eventDate) : null;
        const eventName = hasEventName ? normalizeEventName(body.eventName) : null;
        const photoData = loadPhotoData();

        photoIds.forEach((photoId) => {
            const entry = normalizePhotoEntry(photoData[photoId]);
            photoData[photoId] = {
                ...entry,
                ...(hasCaption ? { caption } : {}),
                ...(hasTags ? { tags } : {}),
                ...(hasEventDate ? { eventDate } : {}),
                ...(hasEventName ? { eventName } : {})
            };
        });

        savePhotoData(photoData);
        res.json({
            success: true,
            updatedCount: photoIds.length,
            ...(hasCaption ? { caption } : {}),
            ...(hasTags ? { tags } : {}),
            ...(hasEventDate ? { eventDate } : {}),
            ...(hasEventName ? { eventName } : {})
        });
    });

    router.patch('/photos/:id/favorite', (req, res) => {
        const photoId = getExistingPhotoId(req, res);
        if (!photoId) return;
        const filePath = path.join(uploadDir, photoId);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: '图片不存在' });
        }

        if (typeof req.body?.favorited !== 'boolean') {
            return res.status(400).json({ error: '收藏状态无效' });
        }

        const photoData = loadPhotoData();
        const entry = normalizePhotoEntry(photoData[photoId]);
        entry.favorited = req.body.favorited;
        photoData[photoId] = entry;
        savePhotoData(photoData);
        res.json({ success: true, photoId, favorited: entry.favorited });
    });

    router.patch('/photos/:id', async (req, res) => {
        const photoId = getExistingPhotoId(req, res);
        if (!photoId) return;
        const filePath = path.join(uploadDir, photoId);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: '图片不存在' });
        }

        const body = req.body || {};
        const hasCaption = Object.prototype.hasOwnProperty.call(body, 'caption');
        const hasTags = Object.prototype.hasOwnProperty.call(body, 'tags');
        const hasRename = Object.prototype.hasOwnProperty.call(body, 'renameTo');
        const hasEventDate = Object.prototype.hasOwnProperty.call(body, 'eventDate');
        const hasEventName = Object.prototype.hasOwnProperty.call(body, 'eventName');

        if (!hasCaption && !hasTags && !hasRename && !hasEventDate && !hasEventName) {
            return res.status(400).json({ error: '没有可更新的内容' });
        }

        const photoData = loadPhotoData();
        const entry = normalizePhotoEntry(photoData[photoId]);
        const caption = hasCaption ? String(body.caption || '').trim().slice(0, 80) : entry.caption;
        const tags = hasTags ? normalizeTags(body.tags).slice(0, 12) : entry.tags;
        const eventDate = hasEventDate ? normalizeEventDate(body.eventDate) : entry.eventDate;
        const eventName = hasEventName ? normalizeEventName(body.eventName) : entry.eventName;
        const existingFiles = await listPhotoFiles();
        const nextPhotoId = hasRename
            ? buildUniquePhotoFilename(body.renameTo, path.extname(photoId), existingFiles, photoId)
            : photoId;
        const didRename = nextPhotoId !== photoId;
        const nextFilePath = path.join(uploadDir, nextPhotoId);
        const nextThumbnailFilename = `${path.parse(nextPhotoId).name}.jpg`;
        const currentThumbnailPath = getThumbnailPath(photoId, entry);
        const nextThumbnailPath = path.join(thumbsDir, nextThumbnailFilename);

        let nextPhotoData = { ...photoData };
        let nextGroupData = loadGroupData();
        let renamedMainFile = false;
        let renamedThumbnail = false;

        try {
            if (didRename) {
                if (fs.existsSync(nextFilePath)) {
                    return res.status(400).json({ error: '这个名字已经被用了，请换一个试试' });
                }
                fs.renameSync(filePath, nextFilePath);
                renamedMainFile = true;

                if (fs.existsSync(currentThumbnailPath) && currentThumbnailPath !== nextThumbnailPath) {
                    if (fs.existsSync(nextThumbnailPath)) {
                        throw new Error('目标缩略图文件已存在');
                    }
                    fs.renameSync(currentThumbnailPath, nextThumbnailPath);
                    renamedThumbnail = true;
                }

                delete nextPhotoData[photoId];
                nextGroupData = updateGroupCoverPhotoIds(nextGroupData, photoId, nextPhotoId);
            }

            nextPhotoData[nextPhotoId] = {
                ...entry,
                caption,
                tags,
                eventDate,
                eventName,
                thumbnail: nextThumbnailFilename
            };
            nextGroupData = syncGroupDataWithPhotos(nextGroupData, nextPhotoData);

            savePhotoData(nextPhotoData);
            saveGroupData(nextGroupData);

            const resultEntry = normalizePhotoEntry(nextPhotoData[nextPhotoId]);
            res.json({
                success: true,
                photoId: nextPhotoId,
                oldPhotoId: photoId,
                src: `/uploads/${nextPhotoId}`,
                thumbSrc: getThumbnailSrc(nextPhotoId, resultEntry) || `/uploads/${nextPhotoId}`,
                name: path.parse(nextPhotoId).name,
                caption: resultEntry.caption,
                tags: resultEntry.tags,
                eventDate: resultEntry.eventDate,
                eventName: resultEntry.eventName,
                groupName: resultEntry.groupName,
                groupCoverPhotoId: resultEntry.groupName ? (nextGroupData[resultEntry.groupName]?.coverPhotoId || '') : ''
            });
        } catch (error) {
            try {
                if (renamedThumbnail && fs.existsSync(nextThumbnailPath) && !fs.existsSync(currentThumbnailPath)) {
                    fs.renameSync(nextThumbnailPath, currentThumbnailPath);
                }
                if (renamedMainFile && fs.existsSync(nextFilePath) && !fs.existsSync(filePath)) {
                    fs.renameSync(nextFilePath, filePath);
                }
            } catch (rollbackError) {
                console.error('回滚重命名失败:', rollbackError);
            }
            console.error('更新图片信息失败:', error);
            res.status(500).json({ error: error.message || '更新图片信息失败，请稍后重试' });
        }
    });

    router.post('/upload', upload.array('photos', 10), async (req, res) => {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: '没有上传文件' });
            }

            const caption = typeof req.body.caption === 'string' ? req.body.caption.trim() : '';
            const tags = normalizeTags(req.body.tags);
            const groupName = typeof req.body.groupName === 'string' ? req.body.groupName.trim() : '';
            const eventDate = normalizeEventDate(req.body.eventDate);
            const eventName = normalizeEventName(req.body.eventName);
            const photoData = loadPhotoData();
            const existingHashes = new Map(
                Object.entries(photoData)
                    .map(([photoId, entry]) => [normalizePhotoEntry(entry).contentHash, photoId])
                    .filter(([contentHash]) => contentHash)
            );
            const acceptedFiles = [];
            const duplicates = [];

            for (const file of req.files) {
                const filePath = path.join(uploadDir, file.filename);
                const contentHash = await hashFile(filePath);
                const duplicateOf = existingHashes.get(contentHash);
                if (duplicateOf) {
                    fs.unlinkSync(filePath);
                    duplicates.push({
                        originalName: file.originalname,
                        duplicateOf
                    });
                    continue;
                }
                existingHashes.set(contentHash, file.filename);
                acceptedFiles.push({
                    ...file,
                    contentHash
                });
            }

            if (acceptedFiles.length === 0) {
                return res.status(409).json({
                    error: '这些照片已经上传过了，没有新增内容。',
                    duplicates
                });
            }

            const existingOrders = Object.values(photoData)
                .map((entry) => normalizePhotoEntry(entry).order)
                .filter((order) => order !== null);
            const minOrder = existingOrders.length ? Math.min(...existingOrders) : 0;
            const startOrder = minOrder - acceptedFiles.length;

            acceptedFiles.forEach((file, index) => {
                const existing = normalizePhotoEntry(photoData[file.filename]);
                const order = startOrder + index;
                photoData[file.filename] = {
                    ...existing,
                    caption,
                    tags,
                    order,
                    groupName,
                    eventDate,
                    eventName,
                    contentHash: file.contentHash,
                    fileSize: file.size
                };
            });

            let groupData = loadGroupData();
            if (groupName && !groupData[groupName]?.coverPhotoId && acceptedFiles[0]) {
                groupData[groupName] = { coverPhotoId: acceptedFiles[0].filename };
            }
            groupData = syncGroupDataWithPhotos(groupData, photoData);

            await ensureAndPersistThumbnails(acceptedFiles.map((file) => file.filename), photoData);
            savePhotoData(photoData);
            saveGroupData(groupData);

            const photos = acceptedFiles.map((file, index) => ({
                id: file.filename,
                src: `/uploads/${file.filename}`,
                thumbSrc: getThumbnailSrc(file.filename, photoData[file.filename]) || `/uploads/${file.filename}`,
                name: path.parse(file.filename).name,
                caption,
                tags,
                order: startOrder + index,
                groupName,
                groupCoverPhotoId: groupName ? (groupData[groupName]?.coverPhotoId || '') : '',
                eventDate,
                eventName,
                duplicateKey: file.contentHash
            }));

            res.json({ success: true, photos, duplicates });
        } catch (error) {
            console.error('上传失败:', error);
            res.status(500).json({ error: '上传失败' });
        }
    });

    router.post('/photos/reorder', async (req, res) => {
        const { orderedIds } = req.body;
        if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
            return res.status(400).json({ error: '排序数据无效' });
        }

        const existingFiles = await listPhotoFiles();
        const existingSet = new Set(existingFiles);

        if (orderedIds.length !== existingFiles.length) {
            return res.status(400).json({ error: '排序数量不匹配' });
        }

        const uniqueIds = new Set(orderedIds);
        if (uniqueIds.size !== orderedIds.length) {
            return res.status(400).json({ error: '排序数据重复' });
        }

        const hasUnknownId = orderedIds.some((photoId) => !existingSet.has(photoId));
        if (hasUnknownId) {
            return res.status(400).json({ error: '包含无效图片' });
        }

        const photoData = loadPhotoData();
        orderedIds.forEach((photoId, index) => {
            const entry = normalizePhotoEntry(photoData[photoId]);
            photoData[photoId] = {
                ...entry,
                order: index
            };
        });
        savePhotoData(photoData);
        res.json({ success: true });
    });

    router.delete('/photos/:id', (req, res) => {
        const photoId = getExistingPhotoId(req, res);
        if (!photoId) return;
        const password = typeof req.body?.password === 'string'
            ? req.body.password
            : (req.get('x-admin-password') || '');

        if (!password || password !== DELETE_PASSWORD) {
            return res.status(403).json({ error: '密码错误' });
        }

        const filePath = path.join(uploadDir, photoId);
        const photoData = loadPhotoData();
        fs.unlink(filePath, (err) => {
            if (err) return res.status(500).json({ error: '删除失败' });

            const thumbSrc = getThumbnailSrc(photoId, photoData[photoId]);
            if (thumbSrc) {
                const thumbFileName = thumbSrc.replace('/thumbnails/', '');
                const thumbPath = path.join(thumbsDir, thumbFileName);
                if (fs.existsSync(thumbPath)) {
                    fs.unlinkSync(thumbPath);
                }
            }
            delete photoData[photoId];
            const groupData = syncGroupDataWithPhotos(loadGroupData(), photoData);
            savePhotoData(photoData);
            saveGroupData(groupData);
            res.json({ success: true });
        });
    });

    router.post('/photos/:id/like', (req, res) => {
        const photoId = getExistingPhotoId(req, res);
        if (!photoId) return;
        const photoData = loadPhotoData();
        const entry = normalizePhotoEntry(photoData[photoId]);
        entry.likes += 1;
        photoData[photoId] = entry;
        savePhotoData(photoData);
        res.json({ success: true, likes: entry.likes });
    });

    router.post('/photos/:id/react', (req, res) => {
        const photoId = getExistingPhotoId(req, res);
        if (!photoId) return;
        const { emoji } = req.body;
        const allowed = ['❤️', '😂', '😮', '😢', '👍'];

        if (!emoji || !allowed.includes(emoji)) {
            return res.status(400).json({ error: '无效的表情' });
        }

        const photoData = loadPhotoData();
        const entry = normalizePhotoEntry(photoData[photoId]);
        entry.reactions[emoji] = (entry.reactions[emoji] || 0) + 1;
        photoData[photoId] = entry;
        savePhotoData(photoData);
        res.json({ success: true, reactions: entry.reactions });
    });

    router.post('/photos/:id/comment', (req, res) => {
        const photoId = getExistingPhotoId(req, res);
        if (!photoId) return;
        const { text, author } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({ error: '评论内容不能为空' });
        }

        const photoData = loadPhotoData();
        const entry = normalizePhotoEntry(photoData[photoId]);
        const comment = {
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            text: text.trim(),
            author: author || '匿名',
            time: new Date().toISOString()
        };

        entry.comments.push(comment);
        photoData[photoId] = entry;
        savePhotoData(photoData);
        res.json({ success: true, comment });
    });

    router.delete('/photos/:photoId/comment/:commentId', (req, res) => {
        const { commentId } = req.params;
        const photoId = getExistingPhotoId(req, res, 'photoId');
        if (!photoId) return;
        const photoData = loadPhotoData();

        if (!photoData[photoId]) {
            return res.status(404).json({ error: '图片不存在' });
        }

        const entry = normalizePhotoEntry(photoData[photoId]);
        entry.comments = entry.comments.filter((comment) => comment.id !== commentId);
        photoData[photoId] = entry;
        savePhotoData(photoData);
        res.json({ success: true });
    });

    return router;
}

module.exports = createPhotosRouter;
