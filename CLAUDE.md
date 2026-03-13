# 项目：家庭共享相册

轻量家庭相册网站，Express + 原生 JS，无框架。支持图片上传、浏览、评论、表情回应和图片编辑。

## 技术栈
- 前端：原生 HTML/CSS/JS（无框架）
- 后端：Node.js + Express + multer（文件上传）
- 存储：本地文件系统（uploads/）+ JSON 文件（photo-data.json）

## 文件结构
- `index.html` — 页面结构
- `style.css` — 所有样式（含响应式，约 25KB）
- `script.js` — 前端逻辑（约 31KB）
- `server.js` — Express 后端，端口 3000
- `uploads/` — 图片存储目录
- `photo-data.json` — 点赞/评论/表情数据持久化

## 关键配置
- 删除密码：`process.env.DELETE_PASSWORD || '123456'`
- 图片压缩：maxSize=2560px，quality=0.92
- 上传限制：10MB，仅图片，一次最多10张
- 部署平台：Railway（支持 RAILWAY_VOLUME_MOUNT_PATH，Volume 挂载 `/data`）

## 已实现功能
- 图片上传（多选、压缩、进度条）
- 4列网格展示，图片 1:1 比例，懒加载（IntersectionObserver）
- 灯箱查看（左右切换 + 键盘方向键）
- 图片滤镜（黑白/复古/鲜艳/明亮/冷峻/赛博）
- 图片编辑（亮度/对比度/饱和度/模糊滑块）
- 表情回应（❤️😂😮😢👍），localStorage 防重复
- 评论系统（发表/删除，昵称绑定）
- 昵称系统（首次进入必填，localStorage 存储）
- 批量删除（多选模式，密码验证）
- 深色/浅色主题切换 + 6个预设渐变 + 自定义颜色
- Header 动态文字（每3.5秒切换）+ 浮动表情动画
- 删除密码保护（默认 123456，env 可改）

## API 路由（server.js）
```
GET    /api/photos              — 获取所有图片列表（含统计）
GET    /api/photos/:id          — 获取单张详情（含评论）
POST   /api/upload              — 上传图片（multer，最多10张）
DELETE /api/photos/:id          — 删除图片（需密码）
POST   /api/photos/:id/like     — 点赞
POST   /api/photos/:id/react    — 表情回应
POST   /api/photos/:id/comment  — 发表评论
DELETE /api/photos/:photoId/comment/:commentId — 删除评论
```

## JS 关键变量/函数（script.js）
```
photos[]              — 全局图片数组
currentPhotoIndex     — 当前灯箱图片索引
batchMode             — 是否处于批量选择模式
selectedIds           — Set，批量选中的图片 id

loadPhotos()          — 从 /api/photos 加载并渲染
renderGallery()       — 渲染网格，支持批量模式
openLightbox(index)   — 打开灯箱，加载详情
updateNavBtns()       — 更新灯箱左右按钮禁用状态
compressImage(file)   — canvas 压缩，2560px/0.92质量
enterBatchMode()      — 进入批量选择
exitBatchMode()       — 退出批量选择
```

## CSS 关键结构（style.css）
```
:root / [data-theme="dark"]  — CSS 变量
header / .header-emoji-row   — 顶部标题区
.upload-section              — 上传按钮 + 多选按钮
.upload-progress-wrap        — 上传进度条
.batch-bar                   — 批量删除操作栏
.gallery                     — 4列网格（移动端也4列，gap:8px）
.photo-card / .photo-card img — 卡片，aspect-ratio:1/1
.lightbox / .lightbox-nav    — 灯箱 + 左右导航按钮
.filter-bar / .edit-bar      — 滤镜/编辑工具栏
.theme-panel                 — 右上角主题控制面板
.nickname-modal / .pwd-modal — 昵称/密码弹窗
.user-badge                  — 右上角用户信息
@media (max-width: 768px)    — 响应式（文件末尾，单一块）
```

## 已知注意事项
- 回复用中文
- 修改时注意保持现有功能不被破坏
- `@media (max-width: 768px)` 只有一个块，在 style.css 文件末尾，不要重复创建
- `pwdConfirmBtn` 的 addEventListener 只有一个（在事件绑定区），通过 `modal._batchMode` 区分单张/批量删除
- `upload-section` 的 `margin-bottom` 是 16px（不是 40px），因为下面有进度条占位
- `image-rendering: crisp-edges` 已加在 `.photo-card img` 上
- CSS 变量 `--accent` 在深色模式下是 `#8899ff`

## 运行
```bash
npm install
npm start  # 访问 http://localhost:3000
```
