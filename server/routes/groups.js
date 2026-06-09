const express = require('express');
const { DELETE_PASSWORD } = require('../config');
const { listPhotoFiles, loadPhotoData, normalizePhotoEntry, savePhotoData } = require('../data/photoStore');
const { loadGroupData, saveGroupData, syncGroupDataWithPhotos } = require('../data/groupStore');

const RESERVED_GROUP_NAME = '\u5168\u90e8\u56fe\u7247';

function normalizeGroupName(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function getExistingGroupNames(photoData) {
    return [...new Set(
        Object.values(photoData)
            .map((entry) => normalizePhotoEntry(entry).groupName)
            .filter(Boolean)
    )];
}

function createGroupsRouter() {
    const router = express.Router();

    router.post('/', async (req, res) => {
        const { name, photoIds } = req.body;
        const groupName = normalizeGroupName(name);

        if (!groupName) {
            return res.status(400).json({ error: '\u5206\u7ec4\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a' });
        }

        if (groupName === RESERVED_GROUP_NAME) {
            return res.status(400).json({ error: '\u201c\u5168\u90e8\u56fe\u7247\u201d\u662f\u7cfb\u7edf\u4fdd\u7559\u5206\u7ec4\u540d' });
        }

        if (!Array.isArray(photoIds) || photoIds.length === 0) {
            return res.status(400).json({ error: '\u8bf7\u9009\u62e9\u8981\u52a0\u5165\u5206\u7ec4\u7684\u7167\u7247' });
        }

        const existingFiles = new Set(await listPhotoFiles());
        const hasUnknownId = photoIds.some((photoId) => !existingFiles.has(photoId));
        if (hasUnknownId) {
            return res.status(400).json({ error: '\u5305\u542b\u65e0\u6548\u56fe\u7247' });
        }

        const photoData = loadPhotoData();
        const existingGroupNames = getExistingGroupNames(photoData);
        const isNewGroup = !existingGroupNames.includes(groupName);
        photoIds.forEach((photoId) => {
            const entry = normalizePhotoEntry(photoData[photoId]);
            photoData[photoId] = {
                ...entry,
                groupName
            };
        });

        let groupData = loadGroupData();
        if (isNewGroup && photoIds[0]) {
            groupData[groupName] = { coverPhotoId: String(photoIds[0]).trim() };
        }
        groupData = syncGroupDataWithPhotos(groupData, photoData);

        savePhotoData(photoData);
        saveGroupData(groupData);
        res.json({ success: true, groupName, photoIds, coverPhotoId: groupData[groupName]?.coverPhotoId || '' });
    });

    router.patch('/:name', (req, res) => {
        const oldName = normalizeGroupName(req.params.name);
        const nextName = normalizeGroupName(req.body?.name);

        if (!oldName || oldName === RESERVED_GROUP_NAME) {
            return res.status(400).json({ error: '\u8be5\u5206\u7ec4\u4e0d\u652f\u6301\u91cd\u547d\u540d' });
        }

        if (!nextName) {
            return res.status(400).json({ error: '\u65b0\u7684\u5206\u7ec4\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a' });
        }

        if (nextName === RESERVED_GROUP_NAME) {
            return res.status(400).json({ error: '\u201c\u5168\u90e8\u56fe\u7247\u201d\u662f\u7cfb\u7edf\u4fdd\u7559\u5206\u7ec4\u540d' });
        }

        if (nextName === oldName) {
            return res.status(400).json({ error: '\u5206\u7ec4\u540d\u79f0\u6ca1\u6709\u53d8\u5316' });
        }

        const photoData = loadPhotoData();
        const existingGroupNames = getExistingGroupNames(photoData);
        if (!existingGroupNames.includes(oldName)) {
            return res.status(404).json({ error: '\u5206\u7ec4\u4e0d\u5b58\u5728' });
        }

        if (existingGroupNames.includes(nextName)) {
            return res.status(400).json({ error: '\u5df2\u5b58\u5728\u540c\u540d\u5206\u7ec4\uff0c\u8bf7\u6362\u4e00\u4e2a\u540d\u5b57' });
        }

        Object.keys(photoData).forEach((photoId) => {
            const entry = normalizePhotoEntry(photoData[photoId]);
            if (entry.groupName !== oldName) return;
            photoData[photoId] = {
                ...entry,
                groupName: nextName
            };
        });

        let groupData = loadGroupData();
        if (groupData[oldName]) {
            groupData[nextName] = groupData[oldName];
            delete groupData[oldName];
        }
        groupData = syncGroupDataWithPhotos(groupData, photoData);

        savePhotoData(photoData);
        saveGroupData(groupData);
        res.json({ success: true, oldName, groupName: nextName, coverPhotoId: groupData[nextName]?.coverPhotoId || '' });
    });

    router.patch('/:name/cover', (req, res) => {
        const groupName = normalizeGroupName(req.params.name);
        const photoId = typeof req.body?.photoId === 'string' ? req.body.photoId.trim() : '';

        if (!groupName || groupName === RESERVED_GROUP_NAME) {
            return res.status(400).json({ error: '\u8be5\u5206\u7ec4\u4e0d\u652f\u6301\u8bbe\u7f6e\u5c01\u9762' });
        }

        if (!photoId) {
            return res.status(400).json({ error: '\u8bf7\u9009\u62e9\u4e00\u5f20\u7167\u7247\u4f5c\u4e3a\u5c01\u9762' });
        }

        const photoData = loadPhotoData();
        const entry = normalizePhotoEntry(photoData[photoId]);
        if (!entry.groupName) {
            return res.status(404).json({ error: '\u56fe\u7247\u4e0d\u5b58\u5728\u6216\u672a\u52a0\u5165\u5206\u7ec4' });
        }

        if (entry.groupName !== groupName) {
            return res.status(400).json({ error: '\u53ea\u80fd\u5c06\u5f53\u524d\u5206\u7ec4\u91cc\u7684\u56fe\u7247\u8bbe\u4e3a\u5c01\u9762' });
        }

        let groupData = loadGroupData();
        groupData[groupName] = { coverPhotoId: photoId };
        groupData = syncGroupDataWithPhotos(groupData, photoData);
        saveGroupData(groupData);
        res.json({ success: true, groupName, coverPhotoId: groupData[groupName]?.coverPhotoId || photoId });
    });

    router.delete('/:name', (req, res) => {
        const groupName = normalizeGroupName(req.params.name);
        const password = typeof req.body?.password === 'string'
            ? req.body.password
            : (req.get('x-admin-password') || '');

        if (!groupName || groupName === RESERVED_GROUP_NAME) {
            return res.status(400).json({ error: '\u8be5\u5206\u7ec4\u4e0d\u652f\u6301\u5220\u9664' });
        }

        if (!password || password !== DELETE_PASSWORD) {
            return res.status(403).json({ error: '\u5bc6\u7801\u9519\u8bef' });
        }

        const photoData = loadPhotoData();
        const existingGroupNames = getExistingGroupNames(photoData);
        if (!existingGroupNames.includes(groupName)) {
            return res.status(404).json({ error: '\u5206\u7ec4\u4e0d\u5b58\u5728' });
        }

        let clearedCount = 0;
        Object.keys(photoData).forEach((photoId) => {
            const entry = normalizePhotoEntry(photoData[photoId]);
            if (entry.groupName !== groupName) return;
            photoData[photoId] = {
                ...entry,
                groupName: ''
            };
            clearedCount += 1;
        });

        let groupData = loadGroupData();
        delete groupData[groupName];
        groupData = syncGroupDataWithPhotos(groupData, photoData);

        savePhotoData(photoData);
        saveGroupData(groupData);
        res.json({ success: true, groupName, clearedCount });
    });

    return router;
}

module.exports = createGroupsRouter;
