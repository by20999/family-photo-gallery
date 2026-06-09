const fs = require('fs');
const path = require('path');
const { projectRoot, uploadDir, dataFile, groupDataFile, storyDataFile } = require('../server/config');

function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function copyRecursive(source, target) {
    if (!fs.existsSync(source)) return;
    const stat = fs.statSync(source);
    if (stat.isDirectory()) {
        fs.mkdirSync(target, { recursive: true });
        for (const entry of fs.readdirSync(source)) {
            copyRecursive(path.join(source, entry), path.join(target, entry));
        }
        return;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
}

const backupRoot = path.join(projectRoot, 'backups', `backup-${timestamp()}`);
fs.mkdirSync(backupRoot, { recursive: true });

[
    dataFile,
    groupDataFile,
    storyDataFile
].forEach((filePath) => {
    if (fs.existsSync(filePath)) {
        copyRecursive(filePath, path.join(backupRoot, path.basename(filePath)));
    }
});

copyRecursive(uploadDir, path.join(backupRoot, 'uploads'));

console.log(`Backup created: ${backupRoot}`);
