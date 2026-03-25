const express = require('express');
const { listPhotoFiles, loadPhotoData, normalizePhotoEntry, savePhotoData } = require('../data/photoStore');

function createGroupsRouter() {
    const router = express.Router();

    router.post('/', async (req, res) => {
        const { name, photoIds } = req.body;
        const groupName = typeof name === 'string' ? name.trim() : '';

        if (!groupName) {
            return res.status(400).json({ error: '分组名称不能为空' });
        }

        if (!Array.isArray(photoIds) || photoIds.length === 0) {
            return res.status(400).json({ error: '请选择要加入分组的照片' });
        }

        const existingFiles = new Set(await listPhotoFiles());
        const hasUnknownId = photoIds.some((photoId) => !existingFiles.has(photoId));
        if (hasUnknownId) {
            return res.status(400).json({ error: '包含无效图片' });
        }

        const photoData = loadPhotoData();
        photoIds.forEach((photoId) => {
            const entry = normalizePhotoEntry(photoData[photoId]);
            photoData[photoId] = {
                ...entry,
                groupName
            };
        });

        savePhotoData(photoData);
        res.json({ success: true, groupName, photoIds });
    });

    return router;
}

module.exports = createGroupsRouter;