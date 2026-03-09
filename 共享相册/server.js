const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 创建上传目录 - 支持 Railway Volume
const uploadDir = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? process.env.RAILWAY_VOLUME_MOUNT_PATH
    : path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 数据文件路径
const dataFile = path.join(__dirname, 'photo-data.json');

// 读取照片数据（点赞和评论）
function loadPhotoData() {
    if (fs.existsSync(dataFile)) {
        return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    }
    return {};
}

// 保存照片数据
function savePhotoData(data) {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

// 配置文件上传
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.random().toString(36).substr(2, 9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB 限制
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('只允许上传图片文件'));
        }
    }
});

// 静态文件服务
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));
app.use(express.json());

// 获取所有图片
app.get('/api/photos', (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: '读取图片失败' });
        }

        const photoData = loadPhotoData();

        const photos = files
            .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
            .map(file => {
                const stats = fs.statSync(path.join(uploadDir, file));
                const data = photoData[file] || { likes: 0, comments: [] };
                return {
                    id: file,
                    src: `/uploads/${file}`,
                    name: file,
                    uploadTime: stats.mtime,
                    likes: data.likes || 0,
                    comments: data.comments || []
                };
            })
            .sort((a, b) => b.uploadTime - a.uploadTime);

        res.json(photos);
    });
});

// 上传图片
app.post('/api/upload', upload.array('photos', 10), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: '没有上传文件' });
    }

    const photos = req.files.map(file => ({
        id: file.filename,
        src: `/uploads/${file.filename}`,
        name: file.originalname
    }));

    res.json({ success: true, photos });
});

// 删除图片
app.delete('/api/photos/:id', (req, res) => {
    const photoId = req.params.id;
    const filePath = path.join(uploadDir, photoId);

    fs.unlink(filePath, (err) => {
        if (err) {
            return res.status(500).json({ error: '删除失败' });
        }

        // 同时删除该图片的点赞和评论数据
        const photoData = loadPhotoData();
        delete photoData[photoId];
        savePhotoData(photoData);

        res.json({ success: true });
    });
});

// 点赞图片
app.post('/api/photos/:id/like', (req, res) => {
    const photoId = req.params.id;
    const photoData = loadPhotoData();

    if (!photoData[photoId]) {
        photoData[photoId] = { likes: 0, comments: [] };
    }

    photoData[photoId].likes = (photoData[photoId].likes || 0) + 1;
    savePhotoData(photoData);

    res.json({ success: true, likes: photoData[photoId].likes });
});

// 添加评论
app.post('/api/photos/:id/comment', (req, res) => {
    const photoId = req.params.id;
    const { text, author } = req.body;

    if (!text || !text.trim()) {
        return res.status(400).json({ error: '评论内容不能为空' });
    }

    const photoData = loadPhotoData();

    if (!photoData[photoId]) {
        photoData[photoId] = { likes: 0, comments: [] };
    }

    const comment = {
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        text: text.trim(),
        author: author || '匿名',
        time: new Date().toISOString()
    };

    photoData[photoId].comments.push(comment);
    savePhotoData(photoData);

    res.json({ success: true, comment });
});

// 删除评论
app.delete('/api/photos/:photoId/comment/:commentId', (req, res) => {
    const { photoId, commentId } = req.params;
    const photoData = loadPhotoData();

    if (!photoData[photoId]) {
        return res.status(404).json({ error: '图片不存在' });
    }

    photoData[photoId].comments = photoData[photoId].comments.filter(
        c => c.id !== commentId
    );
    savePhotoData(photoData);

    res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✨ 相册服务器运行在 http://localhost:${PORT}`);
    console.log(`📁 图片保存在: ${uploadDir}`);
});
