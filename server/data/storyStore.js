const fs = require('fs');
const { storyDataFile } = require('../config');

function createId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampCurveOffset(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(-1, Math.min(1, numeric));
}

function normalizeDateString(value, fallback) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function reorderStoryItems(items) {
    return [...items]
        .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt, 'en'))
        .map((item, index) => ({
            ...item,
            position: index
        }));
}

function normalizeStoryItem(entry = {}, index = 0) {
    const createdAt = normalizeDateString(entry.createdAt, new Date().toISOString());
    return {
        id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : createId('story-item'),
        photoId: typeof entry.photoId === 'string' ? entry.photoId.trim() : '',
        position: Number.isFinite(Number(entry.position)) ? Number(entry.position) : index,
        curveOffset: clampCurveOffset(entry.curveOffset),
        note: typeof entry.note === 'string' ? entry.note.slice(0, 160) : '',
        sourceType: entry.sourceType === 'group' ? 'group' : 'photo',
        sourceGroupName: typeof entry.sourceGroupName === 'string' ? entry.sourceGroupName.trim().slice(0, 40) : '',
        createdAt
    };
}

function normalizeStoryEntry(entry = {}, index = 0) {
    const fallbackCreatedAt = new Date().toISOString();
    const createdAt = normalizeDateString(entry.createdAt, fallbackCreatedAt);
    const updatedAt = normalizeDateString(entry.updatedAt, createdAt);
    const rawItems = Array.isArray(entry.items) ? entry.items : [];
    const seenPhotoIds = new Set();
    const items = reorderStoryItems(
        rawItems
            .map((item, itemIndex) => normalizeStoryItem(item, itemIndex))
            .filter((item) => {
                if (!item.photoId || seenPhotoIds.has(item.photoId)) return false;
                seenPhotoIds.add(item.photoId);
                return true;
            })
    );

    return {
        id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : createId('story'),
        name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim().slice(0, 40) : `未命名故事 ${index + 1}`,
        description: typeof entry.description === 'string' ? entry.description.trim().slice(0, 120) : '',
        content: typeof entry.content === 'string' ? entry.content.slice(0, 12000) : '',
        createdAt,
        updatedAt,
        items
    };
}

function normalizeStoryStore(data = {}) {
    const rawStories = Array.isArray(data.stories) ? data.stories : [];
    return {
        stories: rawStories.map((story, index) => normalizeStoryEntry(story, index))
    };
}

function loadStoryData() {
    if (!fs.existsSync(storyDataFile)) {
        return { stories: [] };
    }

    try {
        const raw = fs.readFileSync(storyDataFile, 'utf8').trim();
        if (!raw) return { stories: [] };
        return normalizeStoryStore(JSON.parse(raw));
    } catch {
        return { stories: [] };
    }
}

function saveStoryData(data) {
    const normalized = normalizeStoryStore(data);
    const tempFile = `${storyDataFile}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(normalized, null, 2));
    fs.renameSync(tempFile, storyDataFile);
}

module.exports = {
    createId,
    clampCurveOffset,
    reorderStoryItems,
    normalizeStoryItem,
    normalizeStoryEntry,
    normalizeStoryStore,
    loadStoryData,
    saveStoryData
};
