# 项目：家庭共享相册

轻量家庭相册网站，`Express + 原生 JS`，无前端框架。支持图片上传、浏览、评论、表情回应、图片编辑、主题切换、标签搜索、分组查看和拖拽排序。

## 技术栈
- 前端：原生 HTML / CSS / JS
- 后端：Node.js + Express + multer
- 存储：本地文件系统（原图 `uploads/`、缩略图 `uploads/thumbnails/` 或 `thumbnails/`）+ JSON 文件（`photo-data.json`）

## 文件结构
- `index.html` — 页面结构
- `style.css` — 所有样式（含响应式）
- `js/main.js` — 前端模块入口
- `js/gallery.js` / `js/upload.js` / `js/lightbox.js` / `js/theme.js` / `js/comments.js` — 前端分模块逻辑
- `server.js` — Express 启动入口，端口 3000
- `server/routes/` / `server/data/` / `server/services/` — 后端路由、存储与缩略图逻辑
- `uploads/` — 原图目录
- `uploads/thumbnails/` 或 `thumbnails/` — 缩略图目录
- `photo-data.json` — 点赞 / 评论 / 表情 / 描述 / 标签 / 排序 / 缩略图数据
- `README.md` — 用户向项目说明
- `CODEX.md` — 给 Codex 新对话快速接手的上下文文档

## 关键配置
- 删除密码：`process.env.DELETE_PASSWORD || 'by-2099'`
- 图片压缩：`maxSize=2560px`，`quality=0.92`
- 上传限制：10MB，仅图片，一次最多 10 张
- 部署平台：Railway（支持 `RAILWAY_VOLUME_MOUNT_PATH`，Volume 挂载 `/data`）

## 已实现功能
- 图片上传（多选、压缩、进度条）
- 上传时可填写描述和标签
- 4 列网格展示，图片 1:1 比例，懒加载
- 灯箱查看（左右切换 + 键盘方向键）
- 图片滤镜（黑白 / 复古 / 鲜艳 / 明亮 / 冷峻 / 赛博）
- 图片编辑（亮度 / 对比度 / 饱和度 / 模糊）
- 表情回应（❤️😂😮😢👍），localStorage 防重复
- 评论系统（发表 / 删除，昵称绑定）
- 昵称系统（首次进入必填，localStorage 存储）
- 批量删除（多选模式，密码验证）
- 深色 / 浅色主题切换
- 背景渐变预设 + 自定义渐变
- 主题包：奶油相册 / 胶片相册 / 夏日相册
- 跟随节日自动推荐主题
- Header 家庭氛围文案 + 动态副标题
- 搜索：按文件名 / 描述 / 标签搜索
- 分组：平铺 / 按月份 / 按标签
- 平铺模式拖拽排序，拖后立即保存到后端
- 删除密码保护（默认 `by-2099`，可通过 env 修改）

## API 路由（server.js）
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

## 关键前端状态 / 函数（现拆分在 js/ 模块）
```text
photos[]              — 全量图片数组（当前全局顺序）
visiblePhotos[]       — 当前可见图片数组（搜索 / 分组后）
currentPhotoIndex     — 当前灯箱图片索引
batchMode             — 是否处于批量选择模式
selectedIds           — Set，批量选中的图片 id
searchKeyword         — 当前搜索关键词
groupMode             — none / month / tag
reorderSaving         — 是否正在保存拖拽排序

autoThemeBtn          — 节日自动推荐主题按钮
captionInput          — 上传描述输入框
tagsInput             — 上传标签输入框

loadPhotos()          — 从 /api/photos 加载并渲染
renderGallery()       — 渲染网格、搜索、分组、拖拽状态
openLightbox(index)   — 打开灯箱并加载详情
compressImage(file)   — canvas 压缩，2560px / 0.92 质量
canDragReorder()      — 判断当前是否允许拖拽排序
persistPhotoOrder()   — 将拖拽后的顺序提交到后端
enterBatchMode()      — 进入批量选择
exitBatchMode()       — 退出批量选择
```

## 关键样式结构（style.css）
```text
:root / [data-theme="dark"]  — CSS 变量
header / .header-kicker       — 顶部标题区
.theme-panel                  — 右上角主题控制面板
.theme-package-list           — 主题包按钮区
.upload-section               — 上传按钮 + 多选 + 分组按钮
.upload-meta-panel            — 描述 / 标签输入区
.album-toolbar                — 搜索区
.batch-bar                    — 批量删除操作栏
.gallery                      — 4列网格
.gallery.drag-enabled         — 拖拽启用状态
.photo-card                   — 相册卡片
.photo-card.dragging          — 正在拖动状态
.photo-card.drag-over         — 拖拽悬停状态
.photo-story                  — 灯箱中的故事区
.lightbox / .lightbox-nav     — 灯箱 + 左右导航按钮
.filter-bar / .edit-bar       — 滤镜 / 编辑工具栏
.nickname-modal / .pwd-modal  — 昵称 / 密码弹窗
.user-badge                   — 左上角用户信息
@media (max-width: 768px)     — 响应式（文件末尾，单一块）
```

## 当前交互规则
- 只在 `groupMode === 'none'` 时允许拖拽排序
- 搜索中禁用拖拽
- 批量模式禁用拖拽
- 拖拽后立即调用 `/api/photos/reorder` 保存顺序
- 新上传图片默认排在最前
- 按月份 / 标签查看时仅做浏览，不做拖拽排序

## 数据结构补充
`photo-data.json` 中每张图当前可能包含：
```json
{
  "likes": 0,
  "comments": [],
  "reactions": {},
  "caption": "家庭聚餐",
  "tags": ["家宴", "周末"],
  "order": 0,
  "thumbnail": "1711111111111-abc123def.jpg"
}
```

## 已知注意事项
- 回复用中文
- 修改时注意保持现有功能不被破坏
- `@media (max-width: 768px)` 只有一个块，在 `style.css` 文件末尾，不要重复创建
- `pwdConfirmBtn` 的 `addEventListener` 只有一个，通过 `modal._batchMode` 区分单张 / 批量删除
- `upload-section` 的 `margin-bottom` 是 `16px`
- 深色模式下 CSS 变量 `--accent` 基础值仍保持 `#8899ff` 语义，不要随意改色逻辑
- 拖拽排序相关规则不要随意放宽，除非用户明确要求
- `photo-data.json` 初始可以不存在，服务端会按需创建 / 写入

## 运行
```bash
npm install
npm start  # 访问 http://localhost:3000
```
