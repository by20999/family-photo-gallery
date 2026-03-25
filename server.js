const express = require('express');
const { projectRoot, uploadDir, thumbsDir, PORT, UPLOAD_CACHE_MAX_AGE } = require('./server/config');
const createPhotosRouter = require('./server/routes/photos');
const createGroupsRouter = require('./server/routes/groups');

const app = express();

app.use(express.static(projectRoot));
app.use('/uploads', express.static(uploadDir, {
    etag: true,
    fallthrough: false,
    immutable: true,
    maxAge: UPLOAD_CACHE_MAX_AGE,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    }
}));
app.use('/thumbnails', express.static(thumbsDir, {
    etag: true,
    fallthrough: false,
    immutable: true,
    maxAge: UPLOAD_CACHE_MAX_AGE,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    }
}));
app.use(express.json());

app.use('/api', createPhotosRouter());
app.use('/api/groups', createGroupsRouter());

if (require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✨ 相册服务器运行在 http://localhost:${PORT}`);
        console.log(`📁 图片保存在: ${uploadDir}`);
        console.log(`🖼️ 缩略图保存在: ${thumbsDir}`);
    });
}

module.exports = app;