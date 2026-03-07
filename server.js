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

        const photos = files
            .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
            .map(file => {
                const stats = fs.statSync(path.join(uploadDir, file));
                return {
                    id: file,
                    src: `/uploads/${file}`,
                    name: file,
                    uploadTime: stats.mtime
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
        res.json({ success: true });
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✨ 相册服务器运行在 http://localhost:${PORT}`);
    console.log(`📁 图片保存在: ${uploadDir}`);
});
