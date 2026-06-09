# `server/services/` 服务层说明

本目录保存可被多个路由复用的后端服务。

## 当前服务

| 文件 | 作用 |
| --- | --- |
| `thumbnailService.js` | 使用 sharp 为照片生成 640px 缩略图，并把缩略图文件名写回照片元数据。 |

## 缩略图策略

- 缩略图最大尺寸：`640px`。
- 输出质量：`82`。
- 并发数：`4`。
- 默认本地路径：`uploads/thumbnails/`。
- Railway Volume 路径：`<RAILWAY_VOLUME_MOUNT_PATH>/thumbnails/`。

## 修改约束

- 不要在路由中复制缩略图生成逻辑。
- 修改缩略图命名规则时，需要同步 `photoStore.js` 和 `docs/data-model.md`。
- 大批量重建缩略图前应先备份数据。
