const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3000;
const DELETE_PASSWORD = process.env.DELETE_PASSWORD || 'by-2099';
const storageRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH || null;
const uploadDir = storageRoot ? storageRoot : path.join(projectRoot, 'uploads');
const dataDir = storageRoot ? storageRoot : projectRoot;
const thumbsDir = storageRoot ? path.join(storageRoot, 'thumbnails') : path.join(uploadDir, 'thumbnails');
const dataFile = path.join(dataDir, 'photo-data.json');
const groupDataFile = path.join(dataDir, 'group-data.json');
const UPLOAD_CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 30;

[uploadDir, thumbsDir, dataDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

module.exports = {
    projectRoot,
    PORT,
    DELETE_PASSWORD,
    uploadDir,
    thumbsDir,
    dataDir,
    dataFile,
    groupDataFile,
    UPLOAD_CACHE_MAX_AGE
};
