# `uploads/thumbnails/` 缩略图目录

本目录保存本地环境生成的缩略图。

## 说明

- 缩略图由 `server/services/thumbnailService.js` 使用 sharp 生成。
- 默认尺寸为 640px。
- 缩略图文件名记录在 `photo-data.json` 的 `thumbnail` 字段中。
- 删除原图时应同步删除对应缩略图。

## 注意事项

- 不要手动重命名缩略图，除非同步更新 `photo-data.json`。
- 如果缩略图缺失，服务读取照片时会尝试补齐。
- 使用 `RAILWAY_VOLUME_MOUNT_PATH` 时，缩略图目录通常在 Volume 下的 `thumbnails/`。
