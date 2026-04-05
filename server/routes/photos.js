const express = require('express');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const multer = require('multer');
const { DELETE_PASSWORD, uploadDir } = require('../config');
const {
    loadPhotoData,
    savePhotoData,
    listPhotoFiles,
    normalizePhotoEntry,
    normalizeTags,
    getPhotoMeta,
    getPhotoDetails,
    getThumbnailSrc,
    ensurePhotoOrders,
    sortPhotos
} = require('../data/photoStore');
const { ensureAndPersistThumbnails } = require('../services/thumbnailService');
const { loadGroupData, saveGroupData, syncGroupDataWithPhotos } = require('../data/groupStore');

function createPhotosRouter() {
    const router = express.Router();

    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => {
            const uniqueName = Date.now() + '-' + Math.random().toString(36).substr(2, 9) + path.extname(file.originalname);
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
                const meta = getPhotoMeta(file, photoData);
                return {
                    id: file,
                    src: `/uploads/${file}`,
                    thumbSrc: getThumbnailSrc(file, photoData[file]) || `/uploads/${file}`,
                    name: file,
                    uploadTime: stats.mtimeMs,
                    likes: meta.likes,
                    commentsCount: meta.commentsCount,
                    reactions: meta.reactions,
                    caption: meta.caption,
                    favorited: meta.favorited,
                    tags: meta.tags,
                    order: meta.order,
                    groupName: meta.groupName,
                    groupCoverPhotoId: meta.groupName ? (groupData[meta.groupName]?.coverPhotoId || '') : ''
                };
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
        const photoId = req.params.id;
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
            likes: details.likes,
            comments: details.comments,
            reactions: details.reactions,
            caption: details.caption,
            favorited: details.favorited,
            tags: details.tags,
            order: details.order,
            groupName: details.groupName,
            groupCoverPhotoId: details.groupName ? (groupData[details.groupName]?.coverPhotoId || '') : ''
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

    router.patch('/photos/:id/favorite', (req, res) => {
        const photoId = req.params.id;
        const filePath = path.join(uploadDir, photoId);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: '\u56fe\u7247\u4e0d\u5b58\u5728' });
        }

        if (typeof req.body?.favorited !== 'boolean') {
            return res.status(400).json({ error: '\u6536\u85cf\u72b6\u6001\u65e0\u6548' });
        }

        const photoData = loadPhotoData();
        const entry = normalizePhotoEntry(photoData[photoId]);
        entry.favorited = req.body.favorited;
        photoData[photoId] = entry;
        savePhotoData(photoData);
        res.json({ success: true, photoId, favorited: entry.favorited });
    });

    router.patch('/photos/:id', (req, res) => {
        const photoId = req.params.id;
        const filePath = path.join(uploadDir, photoId);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: '图片不存在' });
        }

        const body = req.body || {};
        const hasCaption = Object.prototype.hasOwnProperty.call(body, 'caption');
        const hasTags = Object.prototype.hasOwnProperty.call(body, 'tags');

        if (!hasCaption && !hasTags) {
            return res.status(400).json({ error: '没有可更新的内容' });
        }

        const photoData = loadPhotoData();
        const entry = normalizePhotoEntry(photoData[photoId]);
        const caption = hasCaption ? String(body.caption || '').trim().slice(0, 80) : entry.caption;
        const tags = hasTags ? normalizeTags(body.tags).slice(0, 12) : entry.tags;

        photoData[photoId] = {
            ...entry,
            caption,
            tags
        };
        savePhotoData(photoData);
        res.json({ success: true, photoId, caption, tags });
    });

    router.post('/upload', upload.array('photos', 10), async (req, res) => {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: '没有上传文件' });
            }

            const caption = typeof req.body.caption === 'string' ? req.body.caption.trim() : '';
            const tags = normalizeTags(req.body.tags);
            const groupName = typeof req.body.groupName === 'string' ? req.body.groupName.trim() : '';
            const photoData = loadPhotoData();
            const existingOrders = Object.values(photoData)
                .map((entry) => normalizePhotoEntry(entry).order)
                .filter((order) => order !== null);
            const minOrder = existingOrders.length ? Math.min(...existingOrders) : 0;
            const startOrder = minOrder - req.files.length;

            req.files.forEach((file, index) => {
                const existing = normalizePhotoEntry(photoData[file.filename]);
                const order = startOrder + index;
                photoData[file.filename] = {
                    ...existing,
                    caption,
                    tags,
                    order,
                    groupName
                };
            });

            let groupData = loadGroupData();
            if (groupName && !groupData[groupName]?.coverPhotoId && req.files[0]) {
                groupData[groupName] = { coverPhotoId: req.files[0].filename };
            }
            groupData = syncGroupDataWithPhotos(groupData, photoData);

            await ensureAndPersistThumbnails(req.files.map((file) => file.filename), photoData);
            savePhotoData(photoData);
            saveGroupData(groupData);

            const photos = req.files.map((file, index) => ({
                id: file.filename,
                src: `/uploads/${file.filename}`,
                thumbSrc: getThumbnailSrc(file.filename, photoData[file.filename]) || `/uploads/${file.filename}`,
                name: file.originalname,
                caption,
                tags,
                order: startOrder + index,
                groupName,
                groupCoverPhotoId: groupName ? (groupData[groupName]?.coverPhotoId || '') : ''
            }));

            res.json({ success: true, photos });
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
        const photoId = req.params.id;
        const { password } = req.body;

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
                const thumbPath = path.join(require('../config').thumbsDir, thumbFileName);
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
        const photoId = req.params.id;
        const photoData = loadPhotoData();
        const entry = normalizePhotoEntry(photoData[photoId]);
        entry.likes += 1;
        photoData[photoId] = entry;
        savePhotoData(photoData);
        res.json({ success: true, likes: entry.likes });
    });

    router.post('/photos/:id/react', (req, res) => {
        const photoId = req.params.id;
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
        const photoId = req.params.id;
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
        const { photoId, commentId } = req.params;
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