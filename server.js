const express = require('express');
const path = require('path');
const { projectRoot, uploadDir, thumbsDir, PORT, UPLOAD_CACHE_MAX_AGE } = require('./server/config');
const createPhotosRouter = require('./server/routes/photos');
const createGroupsRouter = require('./server/routes/groups');
const createStoriesRouter = require('./server/routes/stories');
const createSystemRouter = require('./server/routes/system');
const { requireAdminForWrite } = require('./server/middleware/auth');
const { queueWriteRequest } = require('./server/middleware/writeQueue');

const app = express();

app.disable('x-powered-by');
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
});

app.get(['/', '/index.html'], (req, res) => {
    res.sendFile(path.join(projectRoot, 'index.html'));
});
app.get('/style.css', (req, res) => {
    res.sendFile(path.join(projectRoot, 'style.css'));
});
app.get('/healthz', (req, res) => {
    res.json({ ok: true, service: 'family-photo-gallery' });
});
app.use('/js', express.static(path.join(projectRoot, 'js'), {
    etag: true,
    maxAge: 0
}));
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
app.use(express.json({ limit: '256kb' }));

app.use('/api', requireAdminForWrite);
app.use('/api', queueWriteRequest);
app.use('/api', createPhotosRouter());
app.use('/api/groups', createGroupsRouter());
app.use('/api/stories', createStoriesRouter());
app.use('/api/system', createSystemRouter());

if (require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✨ 相册服务器运行在 http://localhost:${PORT}`);
        console.log(`📁 图片保存在: ${uploadDir}`);
        console.log(`🖼️ 缩略图保存在: ${thumbsDir}`);
    });
}

module.exports = app;
