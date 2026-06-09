const fs = require('fs');
const path = require('path');
const { projectRoot, uploadDir, thumbsDir, dataFile, groupDataFile, storyDataFile } = require('../server/config');
const { IMAGE_FILE_PATTERN } = require('../server/data/photoStore');

function readJson(filePath, fallback) {
    try {
        const raw = fs.readFileSync(filePath, 'utf8').trim();
        return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
        return { __error: error.message };
    }
}

function listFiles(dir, pattern = null) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && (!pattern || pattern.test(entry.name)))
        .map((entry) => entry.name);
}

const photos = listFiles(uploadDir, IMAGE_FILE_PATTERN);
const thumbnails = listFiles(thumbsDir, /\.jpe?g$/i);
const photoData = readJson(dataFile, {});
const groupData = readJson(groupDataFile, {});
const storyData = readJson(storyDataFile, { stories: [] });
const photoIds = Object.keys(photoData).filter((key) => !key.startsWith('__'));
const storyRefs = Array.isArray(storyData.stories)
    ? storyData.stories.flatMap((story) => (story.items || []).map((item) => ({
        storyId: story.id,
        itemId: item.id,
        photoId: item.photoId
    })))
    : [];

const report = {
    projectRoot,
    uploadDir,
    thumbsDir,
    counts: {
        photos: photos.length,
        thumbnails: thumbnails.length,
        photoDataEntries: photoIds.length,
        groupEntries: Object.keys(groupData).filter((key) => !key.startsWith('__')).length,
        stories: Array.isArray(storyData.stories) ? storyData.stories.length : 0,
        storyRefs: storyRefs.length
    },
    jsonErrors: {
        photoData: photoData.__error || null,
        groupData: groupData.__error || null,
        storyData: storyData.__error || null
    },
    missingFilesForMetadata: photoIds.filter((photoId) => !photos.includes(photoId)),
    missingMetadataForFiles: photos.filter((photoId) => !Object.prototype.hasOwnProperty.call(photoData, photoId)),
    brokenStoryRefs: storyRefs.filter((ref) => !photos.includes(ref.photoId)),
    orphanThumbnails: thumbnails.filter((thumbnail) => {
        const base = path.parse(thumbnail).name.toLowerCase();
        return !photos.some((photo) => path.parse(photo).name.toLowerCase() === base);
    })
};

console.log(JSON.stringify(report, null, 2));

const hasProblems = Object.values(report.jsonErrors).some(Boolean)
    || report.missingFilesForMetadata.length > 0
    || report.missingMetadataForFiles.length > 0
    || report.brokenStoryRefs.length > 0;

if (hasProblems) {
    process.exitCode = 1;
}
