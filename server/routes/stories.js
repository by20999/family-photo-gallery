const express = require('express');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { uploadDir } = require('../config');
const {
    loadPhotoData,
    normalizePhotoEntry,
    listPhotoFiles,
    getThumbnailSrc
} = require('../data/photoStore');
const { loadGroupData, syncGroupDataWithPhotos, saveGroupData } = require('../data/groupStore');
const { ensureAndPersistThumbnails } = require('../services/thumbnailService');
const { createId, clampCurveOffset, loadStoryData, saveStoryData, reorderStoryItems } = require('../data/storyStore');

function normalizeStoryName(value) {
    return typeof value === 'string' ? value.trim().slice(0, 40) : '';
}

function normalizeStoryDescription(value) {
    return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function normalizeStoryContent(value) {
    return typeof value === 'string' ? value.slice(0, 12000) : '';
}

function buildCurveOffset(index) {
    const preset = [0.18, -0.22, 0.3, -0.12, 0.24, -0.28, 0.08, -0.18];
    return preset[index % preset.length];
}

function normalizeLayoutEntry(entry = {}) {
    return {
        id: typeof entry.id === 'string' ? entry.id.trim() : '',
        position: Number.isFinite(Number(entry.position)) ? Number(entry.position) : null,
        curveOffset: clampCurveOffset(entry.curveOffset)
    };
}

async function buildPhotoLookup() {
    const files = await listPhotoFiles();
    const photoData = loadPhotoData();
    const rawGroupData = loadGroupData();
    const groupData = syncGroupDataWithPhotos(rawGroupData, photoData);
    const groupDataChanged = JSON.stringify(rawGroupData) !== JSON.stringify(groupData);

    await ensureAndPersistThumbnails(files, photoData);
    if (groupDataChanged) {
        saveGroupData(groupData);
    }

    const statsEntries = await Promise.all(
        files.map(async (file) => [file, await fsp.stat(path.join(uploadDir, file))])
    );

    return new Map(
        statsEntries.map(([photoId, stats]) => {
            const entry = normalizePhotoEntry(photoData[photoId]);
            return [photoId, {
                id: photoId,
                src: `/uploads/${photoId}`,
                thumbSrc: getThumbnailSrc(photoId, entry) || `/uploads/${photoId}`,
                name: path.parse(photoId).name,
                uploadTime: stats.mtimeMs,
                caption: entry.caption,
                favorited: entry.favorited,
                tags: entry.tags,
                groupName: entry.groupName,
                groupCoverPhotoId: entry.groupName ? (groupData[entry.groupName]?.coverPhotoId || '') : ''
            }];
        })
    );
}

function buildStoryResponse(story, photoLookup) {
    const items = story.items
        .map((item) => {
            const photo = photoLookup.get(item.photoId);
            if (!photo) return null;
            return {
                ...item,
                photo
            };
        })
        .filter(Boolean);

    return {
        ...story,
        itemCount: items.length,
        coverPhoto: items[0]?.photo || null,
        items
    };
}

function applyStoryLayout(story, rawLayoutItems) {
    const layoutItems = Array.isArray(rawLayoutItems) ? rawLayoutItems.map((entry) => normalizeLayoutEntry(entry)) : [];
    if (layoutItems.length === 0) {
        throw new Error('请提供要保存的故事布局');
    }

    const storyItemIds = story.items.map((item) => item.id);
    if (layoutItems.length !== storyItemIds.length) {
        throw new Error('故事布局数据不完整');
    }

    const itemMetaMap = new Map(story.items.map((item) => [item.id, item]));
    const layoutIdSet = new Set(layoutItems.map((item) => item.id));
    const hasUnknownItem = layoutItems.some((item) => !item.id || !itemMetaMap.has(item.id) || item.position === null);
    const hasDuplicate = layoutIdSet.size !== layoutItems.length;
    const missingItem = storyItemIds.some((itemId) => !layoutIdSet.has(itemId));

    if (hasUnknownItem || hasDuplicate || missingItem) {
        throw new Error('故事布局数据无效');
    }

    story.items = reorderStoryItems(layoutItems.map((item) => ({
        ...itemMetaMap.get(item.id),
        position: item.position,
        curveOffset: item.curveOffset
    })));
}

function createStoriesRouter() {
    const router = express.Router();

    router.get('/', async (req, res) => {
        try {
            const store = loadStoryData();
            const photoLookup = await buildPhotoLookup();
            const stories = store.stories.map((story) => buildStoryResponse(story, photoLookup));
            res.json({ stories });
        } catch (error) {
            console.error('读取故事失败:', error);
            res.status(500).json({ error: '读取故事失败' });
        }
    });

    router.post('/', (req, res) => {
        const store = loadStoryData();
        const storyName = normalizeStoryName(req.body?.name) || `未命名故事 ${store.stories.length + 1}`;
        const now = new Date().toISOString();
        const story = {
            id: createId('story'),
            name: storyName,
            description: '',
            content: '',
            createdAt: now,
            updatedAt: now,
            items: []
        };

        store.stories.unshift(story);
        saveStoryData(store);
        res.status(201).json({ success: true, story });
    });

    router.patch('/:id', (req, res) => {
        const storyId = String(req.params.id || '').trim();
        const store = loadStoryData();
        const story = store.stories.find((item) => item.id === storyId);

        if (!story) {
            return res.status(404).json({ error: '故事不存在' });
        }

        const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, 'name');
        const hasDescription = Object.prototype.hasOwnProperty.call(req.body || {}, 'description');
        const hasContent = Object.prototype.hasOwnProperty.call(req.body || {}, 'content');

        if (!hasName && !hasDescription && !hasContent) {
            return res.status(400).json({ error: '没有可更新的内容' });
        }

        if (hasName) {
            const name = normalizeStoryName(req.body.name);
            if (!name) {
                return res.status(400).json({ error: '故事名称不能为空' });
            }
            story.name = name;
        }

        if (hasDescription) {
            story.description = normalizeStoryDescription(req.body.description);
        }

        if (hasContent) {
            story.content = normalizeStoryContent(req.body.content);
        }

        story.updatedAt = new Date().toISOString();
        saveStoryData(store);
        res.json({ success: true, story });
    });

    router.delete('/:id', (req, res) => {
        const storyId = String(req.params.id || '').trim();
        const store = loadStoryData();
        const nextStories = store.stories.filter((story) => story.id !== storyId);

        if (nextStories.length === store.stories.length) {
            return res.status(404).json({ error: '故事不存在' });
        }

        store.stories = nextStories;
        saveStoryData(store);
        res.json({ success: true, storyId });
    });

    router.post('/:id/items', async (req, res) => {
        const storyId = String(req.params.id || '').trim();
        const rawPhotoIds = Array.isArray(req.body?.photoIds) ? req.body.photoIds : [];
        const photoIds = [...new Set(rawPhotoIds.map((photoId) => String(photoId || '').trim()).filter(Boolean))];
        const sourceType = req.body?.sourceType === 'group' ? 'group' : 'photo';
        const sourceGroupName = sourceType === 'group' && typeof req.body?.sourceGroupName === 'string'
            ? req.body.sourceGroupName.trim().slice(0, 40)
            : '';

        if (photoIds.length === 0) {
            return res.status(400).json({ error: '请选择要加入故事的图片' });
        }

        const existingFiles = new Set(await listPhotoFiles());
        const hasUnknownPhoto = photoIds.some((photoId) => !existingFiles.has(photoId));
        if (hasUnknownPhoto) {
            return res.status(400).json({ error: '包含不存在的图片' });
        }

        const store = loadStoryData();
        const story = store.stories.find((item) => item.id === storyId);
        if (!story) {
            return res.status(404).json({ error: '故事不存在' });
        }

        const existingPhotoIds = new Set(story.items.map((item) => item.photoId));
        const nextItems = photoIds
            .filter((photoId) => !existingPhotoIds.has(photoId))
            .map((photoId, index) => ({
                id: createId('story-item'),
                photoId,
                position: story.items.length + index,
                curveOffset: buildCurveOffset(story.items.length + index),
                note: '',
                sourceType,
                sourceGroupName,
                createdAt: new Date().toISOString()
            }));

        story.items = reorderStoryItems([...story.items, ...nextItems]);
        story.updatedAt = new Date().toISOString();
        saveStoryData(store);

        const photoLookup = await buildPhotoLookup();
        res.json({
            success: true,
            addedCount: nextItems.length,
            skippedCount: photoIds.length - nextItems.length,
            story: buildStoryResponse(story, photoLookup)
        });
    });

    router.patch('/:id/items/layout', async (req, res) => {
        const storyId = String(req.params.id || '').trim();
        const store = loadStoryData();
        const story = store.stories.find((item) => item.id === storyId);

        if (!story) {
            return res.status(404).json({ error: '故事不存在' });
        }

        try {
            applyStoryLayout(story, req.body?.items);
        } catch (error) {
            return res.status(400).json({ error: error.message || '故事布局保存失败' });
        }

        story.updatedAt = new Date().toISOString();
        saveStoryData(store);

        const photoLookup = await buildPhotoLookup();
        res.json({ success: true, story: buildStoryResponse(story, photoLookup) });
    });

    router.delete('/:id/items/:itemId', async (req, res) => {
        const storyId = String(req.params.id || '').trim();
        const itemId = String(req.params.itemId || '').trim();
        const store = loadStoryData();
        const story = store.stories.find((item) => item.id === storyId);

        if (!story) {
            return res.status(404).json({ error: '故事不存在' });
        }

        const nextItems = story.items.filter((item) => item.id !== itemId);
        if (nextItems.length === story.items.length) {
            return res.status(404).json({ error: '故事条目不存在' });
        }

        story.items = reorderStoryItems(nextItems);
        story.updatedAt = new Date().toISOString();
        saveStoryData(store);

        const photoLookup = await buildPhotoLookup();
        res.json({ success: true, story: buildStoryResponse(story, photoLookup) });
    });

    return router;
}

module.exports = createStoriesRouter;
