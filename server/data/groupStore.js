const fs = require('fs');
const { groupDataFile } = require('../config');
const { normalizePhotoEntry } = require('./photoStore');

function normalizeGroupEntry(entry = {}) {
    return {
        coverPhotoId: typeof entry.coverPhotoId === 'string' ? entry.coverPhotoId.trim() : ''
    };
}

function loadGroupData() {
    if (!fs.existsSync(groupDataFile)) return {};
    try {
        const raw = fs.readFileSync(groupDataFile, 'utf8').trim();
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return Object.fromEntries(Object.entries(parsed).map(([groupName, entry]) => [groupName, normalizeGroupEntry(entry)]));
    } catch {
        return {};
    }
}

function saveGroupData(data) {
    const normalized = Object.fromEntries(Object.entries(data).map(([groupName, entry]) => [groupName, normalizeGroupEntry(entry)]));
    const tempFile = `${groupDataFile}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(normalized, null, 2));
    fs.renameSync(tempFile, groupDataFile);
}

function getOrderedGroupPhotoIds(photoData, groupName) {
    return Object.entries(photoData)
        .filter(([, entry]) => normalizePhotoEntry(entry).groupName === groupName)
        .map(([photoId, entry]) => ({ photoId, order: normalizePhotoEntry(entry).order }))
        .sort((a, b) => {
            const aOrder = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
            const bOrder = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return a.photoId.localeCompare(b.photoId, 'en');
        })
        .map((item) => item.photoId);
}

function syncGroupDataWithPhotos(groupData, photoData) {
    const nextGroupData = {};
    const groupNames = [...new Set(
        Object.values(photoData)
            .map((entry) => normalizePhotoEntry(entry).groupName)
            .filter(Boolean)
    )];

    groupNames.forEach((groupName) => {
        const orderedPhotoIds = getOrderedGroupPhotoIds(photoData, groupName);
        if (orderedPhotoIds.length === 0) return;
        const entry = normalizeGroupEntry(groupData[groupName]);
        nextGroupData[groupName] = {
            coverPhotoId: orderedPhotoIds.includes(entry.coverPhotoId) ? entry.coverPhotoId : orderedPhotoIds[0]
        };
    });

    return nextGroupData;
}

module.exports = {
    normalizeGroupEntry,
    loadGroupData,
    saveGroupData,
    getOrderedGroupPhotoIds,
    syncGroupDataWithPhotos
};
