# CODEX 项目接手文档

这是一份给 Codex 在新对话中快速接手项目使用的上下文文档。你可以在新对话里直接说：

- “先看 `CODEX.md` 再继续改这个项目”
- “按 `CODEX.md` 的上下文继续做新功能”

这样通常就不需要我每次再重新通读整个项目。

## 项目一句话概述

这是一个家庭共享相册项目，技术栈是 `Node.js + Express + 原生 HTML/CSS/JS`，核心目标是让家庭成员上传、浏览、评论、整理和回看照片。

## 当前产品定位

不是通用图库，而是偏“家庭回忆册”：
- 要温馨
- 要简单
- 要适合手机和桌面一起用
- 要重视照片故事感、回忆感和整理感

## 当前核心功能

### 浏览与互动
- 4 列相册网格
- 灯箱查看
- 键盘左右切图
- 评论系统
- 表情回应
- 昵称系统

### 图片处理
- 上传前压缩
- 图片滤镜
- 图片编辑（亮度 / 对比度 / 饱和度 / 模糊）

### 外观与主题
- 深色 / 浅色模式
- 渐变背景预设
- 自定义渐变
- 主题包：`奶油相册`、`胶片相册`、`夏日相册`
- 节日自动推荐主题
- Header 家庭氛围文案

### 内容组织
- 上传时填写描述 `caption`
- 上传时填写标签 `tags`
- 搜索：文件名 / 描述 / 标签
- 分组：平铺 / 月份 / 标签
- 平铺模式拖拽排序

### 管理能力
- 批量删除
- 删除密码保护
- 拖拽排序持久化保存

## 当前重要交互规则

- 只在 `平铺模式` 允许拖拽排序
- 搜索中禁用拖拽
- 批量模式禁用拖拽
- 按月份 / 标签分组时禁用拖拽
- 拖拽后立即保存到后端
- 新上传照片默认排在最前

## 当前数据结构重点

`photo-data.json` 里的单张图片数据包含：

```json
{
  "likes": 0,
  "comments": [],
  "reactions": {},
  "caption": "春天一起去公园",
  "tags": ["春天", "散步"],
  "order": 0,
  "thumbnail": "1711111111111-abc123def.jpg"
}
```

说明：
- `caption`：照片描述
- `tags`：标签数组
- `order`：人工排序顺序，数值越小越靠前

## 后端关键接口

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

## 文件职责速览

- `index.html`：页面结构和各功能区 DOM
- `style.css`：所有样式
- `js/main.js`：前端模块入口
- `js/gallery.js` / `js/upload.js` / `js/lightbox.js` / `js/theme.js` / `js/comments.js`：前端分模块逻辑
- `server.js`：后端启动入口
- `server/routes/*.js` / `server/data/photoStore.js` / `server/services/thumbnailService.js`：后端路由、存储和缩略图逻辑
- `CLAUDE.md`：项目规则、注意事项、约定
- `README.md`：面向用户 / 维护者的项目说明
- `部署教程.md`：部署和环境变量说明

## 修改时必须注意

- 回复用中文
- 不要随意破坏现有功能
- `style.css` 中只保留一个 `@media (max-width: 768px)`，在文件末尾
- `pwdConfirmBtn` 只保留一个事件绑定，通过 `modal._batchMode` 区分单张 / 批量删除
- `upload-section` 的 `margin-bottom` 是 `16px`
- 主题、搜索、分组、拖拽这几块现在已经互相耦合，改动前先考虑状态冲突
- 如果改动拖拽排序，优先保持当前限制规则，不要默认开放到所有分组模式

## 如果新对话要继续开发，推荐起手式

建议我先做这些：
1. 读 `CODEX.md`
2. 如有必要补读 `CLAUDE.md`
3. 只再查看与你当前需求直接相关的文件

## 当前适合继续做的方向

- 标签点击即筛选
- 单张图片后续编辑描述 / 标签
- 更精致的拖拽占位与过渡动画
- 手机端手势优化
- 时间线视图
- 收藏功能
- 相册分组 / 合集系统

## 用户可直接对 Codex 说的话

- “先看 `CODEX.md`，然后继续改拖拽排序细节”
- “按 `CODEX.md` 的上下文，帮我继续做标签筛选”
- “先看 `CODEX.md` 和 `CLAUDE.md`，再改首页样式”
