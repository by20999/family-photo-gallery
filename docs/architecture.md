# 架构说明

## 总体结构

```text
Browser
  |
  | static HTML/CSS/JS
  v
Express server
  |
  | /api/photos   /api/groups   /api/stories   /api/system
  v
File system
  |
  | uploads/  uploads/thumbnails/  *.json
```

## 前端架构

前端是一个无构建步骤的原生 ES Module 单页应用：

- `index.html` 提供页面结构和模块入口。
- `style.css` 提供全站视觉、响应式、状态和主题样式。
- `js/main.js` 负责初始化各业务模块。
- `js/state.js` 保存运行时状态。
- `js/api.js` 隔离网络请求。
- 其他 `js/*.js` 按功能拆分。

前端没有 React/Vue 等框架，也没有打包工具。新增代码应优先保持这种简单模型。

## 后端架构

后端由 `server.js` 启动 Express 应用：

- 静态托管项目根目录。
- 静态托管 `/uploads` 和 `/thumbnails`。
- 挂载照片、分组、故事 API。
- 挂载系统状态 API，用于数据健康检查和本地辅助操作。
- 通过 `server/config.js` 管理路径和环境变量。

后端模块分层：

- `server/routes/`：HTTP 接口、请求校验和响应组装。
- `server/data/`：JSON 数据读写、字段规范化、存储同步。
- `server/services/`：跨路由服务，目前主要是缩略图生成。

## 数据流

### 照片上传

1. 前端 `js/upload.js` 选择或拖拽图片。
2. 前端压缩图片并构造 `FormData`。
3. `js/api.js` 通过 `POST /api/upload` 上传。
4. `server/routes/photos.js` 使用 multer 保存到 `uploads/`。
5. 后端计算图片内容 hash，跳过已存在的重复照片。
6. 后端写入 `photo-data.json` 和 `group-data.json`。
7. `thumbnailService` 生成缩略图。
8. 前端刷新相册状态并渲染。

### 照片浏览

1. 前端调用 `GET /api/photos`。
2. 后端读取上传目录和 `photo-data.json`。
3. 后端补齐缩略图、同步分组、补齐排序值。
4. 前端保存到 `state.photos`。
5. `gallery.js` 根据视图、搜索、分组、标签、排序渲染。

### 系统状态

1. 前端 `js/system.js` 调用 `GET /api/system/health`。
2. 后端读取 `uploads/`、`uploads/thumbnails/` 和 `photo-data.json`。
3. 后端返回照片数、缩略图数、元数据数、丢图问题、孤儿缩略图和重复照片组。
4. 前端在“系统状态”面板中展示结果，并可通过 `POST /api/system/open-uploads` 打开本地上传目录。

### 故事流

1. 前端 `story.js` 调用 `/api/stories`。
2. 后端读取 `story-data.json`。
3. 后端把故事条目中的 `photoId` 解析成照片信息。
4. 前端渲染故事卡片和曲线路径。
5. 拖拽布局后通过 `PATCH /api/stories/:id/items/layout` 持久化。

## 持久化策略

- 图片原文件：`uploads/`。
- 本地缩略图：`uploads/thumbnails/`。
- Railway Volume 缩略图：`<RAILWAY_VOLUME_MOUNT_PATH>/thumbnails/`。
- 元数据：`photo-data.json`、`group-data.json`、`story-data.json`。

JSON 写入采用临时文件 + rename 的方式降低半写入风险。

## 扩展方向

后续如需企业级能力，建议按顺序推进：

1. 自动化测试。
2. 数据备份和恢复脚本。
3. 基础认证。
4. 存储抽象层。
5. 数据库迁移。
6. 对象存储。
7. CI/CD 和可观测性。
