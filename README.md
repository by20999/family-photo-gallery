# 家庭共享相册

一个轻量但功能完整的家庭共享相册网站，基于 `Node.js + Express + 原生 HTML/CSS/JS`。适合家庭成员一起上传照片、浏览回忆、留言互动，并通过主题、标签、搜索和排序把照片整理得更有温度。

## 当前亮点

- 多图上传，前端自动压缩
- 4 列相册网格，懒加载
- 灯箱查看、左右切换、键盘操作
- 图片滤镜与基础编辑
- 评论系统、表情回应、昵称系统
- 深色 / 浅色模式
- 主题包：`奶油相册`、`胶片相册`、`夏日相册`
- 节日自动推荐主题
- 上传时支持填写照片描述和标签
- 支持按描述 / 标签 / 文件名搜索
- 支持分组查看：平铺 / 按月份 / 按标签
- 平铺模式下支持鼠标拖拽排序，刷新后顺序保留
- 批量删除与密码保护

## 技术栈

- 前端：原生 `HTML / CSS / JavaScript`
- 后端：`Node.js + Express`
- 上传：`multer`
- 数据存储：
  - 原图：`uploads/`
  - 缩略图：`uploads/thumbnails/`（本地）或 `thumbnails/`（Railway Volume）
  - 元数据：`photo-data.json`

## 主要文件

- `index.html`：页面结构
- `style.css`：所有样式与响应式
- `js/main.js`：前端模块入口
- `js/gallery.js` / `js/upload.js` / `js/lightbox.js` / `js/theme.js` / `js/comments.js`：前端模块
- `server.js`：后端启动入口
- `server/routes/` / `server/data/` / `server/services/`：后端路由、存储与缩略图逻辑
- `uploads/`：原图目录
- `uploads/thumbnails/` 或 `thumbnails/`：缩略图目录
- `photo-data.json`：点赞、评论、标签、描述、排序、缩略图文件名等数据
- `CLAUDE.md`：项目约定与修改注意事项
- `CODEX.md`：给 Codex 快速接手项目用的上下文文档

## 已实现功能

### 照片管理
- 多图上传
- 上传进度条
- 上传前压缩（最大边 2560px，质量 0.92）
- 上传时填写描述和标签
- 平铺模式拖拽排序
- 批量删除
- 单张删除密码保护

### 浏览体验
- 4 列网格展示
- 图片 1:1 比例裁切
- 懒加载
- 灯箱查看
- 左右切换
- 键盘方向键切换
- 照片故事区显示日期、描述、标签

### 图片互动
- 表情回应：`❤️ 😂 😮 😢 👍`
- 评论系统
- 只能删除自己的评论
- 昵称系统（首次进入必填）

### 主题与外观
- 深色 / 浅色模式
- 预设背景渐变
- 自定义渐变背景
- 家庭氛围标题区
- 节日主题推荐
- 主题包切换

### 查找与整理
- 搜索文件名、描述、标签
- 分组查看：平铺 / 月份 / 标签
- 只有平铺模式允许拖拽排序
- 搜索中禁用拖拽
- 批量模式禁用拖拽

## API

```text
GET    /api/photos
GET    /api/photos/:id
POST   /api/upload
POST   /api/photos/reorder
DELETE /api/photos/:id
POST   /api/photos/:id/like
POST   /api/photos/:id/react
POST   /api/photos/:id/comment
DELETE /api/photos/:photoId/comment/:commentId
```

## 本地运行

```bash
npm install
npm start
```

默认访问：`http://localhost:3000`

## 重要配置

- 删除密码：`DELETE_PASSWORD`，默认值 `by-2099`
- 端口：`PORT`，默认 `3000`
- Railway 持久化目录：`RAILWAY_VOLUME_MOUNT_PATH`
- 上传限制：单张 10MB，一次最多 10 张

## 拖拽排序规则

- 只在“平铺模式”允许拖拽
- 搜索结果中禁用拖拽
- 批量模式禁用拖拽
- 拖拽后立即保存到后端
- 新上传照片默认排在最前
- 排序通过 `photo-data.json` 中的 `order` 字段持久化

## 部署

详细步骤见 [部署教程.md](./部署教程.md)

Railway 部署时建议：
- 添加 Volume 挂载 `/data`
- 设置 `RAILWAY_VOLUME_MOUNT_PATH=/data`
- 设置 `DELETE_PASSWORD`

## 注意事项

- `photo-data.json` 现在不仅保存点赞和评论，也保存：`caption`、`tags`、`order`、`thumbnail`
- 如果你在新对话里直接让我继续开发，优先让我看 `CODEX.md`
- 如果要修改项目约定和注意事项，优先更新 `CLAUDE.md`
