# 模块职责

## 根目录

| 文件 | 职责 |
| --- | --- |
| `server.js` | Express 应用入口，静态资源托管和 API 路由挂载。 |
| `index.html` | 页面结构、主要交互区域和前端模块入口。 |
| `style.css` | 全站视觉系统、布局、响应式、主题和状态样式。 |
| `script.js` | 历史占位脚本，当前核心逻辑在 `js/`。 |
| `package.json` | Node 依赖和启动命令。 |
| `photo-data.json` | 照片元数据。 |
| `group-data.json` | 分组封面等扩展数据。 |
| `story-data.json` | 故事流数据。 |

## 前端模块

| 模块 | 职责 |
| --- | --- |
| `js/main.js` | 应用启动编排。 |
| `js/dom.js` | DOM 节点引用集中管理。 |
| `js/state.js` | 全局状态、照片/故事更新辅助函数。 |
| `js/api.js` | 所有 HTTP 请求封装。 |
| `js/system.js` | 网页系统状态面板，展示照片、缩略图、数据问题和重复检测结果。 |
| `js/gallery.js` | 相册主视图、筛选、排序、分组、批量操作、首页记忆模块、时间线。 |
| `js/lightbox.js` | 大图查看、切换、编辑、滤镜、设置分组封面。 |
| `js/upload.js` | 上传入口、拖拽、预览、前端压缩、上传进度。 |
| `js/story.js` | 故事列表、故事时间线、故事内容编辑、节点拖拽布局。 |
| `js/comments.js` | 评论和表情回应。 |
| `js/delete.js` | 删除密码弹窗和删除流程。 |
| `js/theme.js` | 明暗模式、背景渐变和主题包。 |
| `js/profile.js` | 昵称、本地头像字符和用户徽章。 |
| `js/feedback.js` | 状态提示和轻量反馈。 |
| `js/utils.js` | 标签、日期、HTML 转义和图片压缩工具。 |

## 后端模块

| 模块 | 职责 |
| --- | --- |
| `server/config.js` | 运行配置、目录路径、数据文件路径和目录初始化。 |
| `server/routes/photos.js` | 照片 API：列表、详情、上传、更新、排序、删除、评论、表情。 |
| `server/routes/groups.js` | 分组 API：创建、重命名、封面、删除。 |
| `server/routes/stories.js` | 故事 API：故事 CRUD、条目添加/删除、布局保存。 |
| `server/routes/system.js` | 系统状态 API：数据健康检查、重复检测摘要、打开上传目录。 |
| `server/middleware/auth.js` | `/api` 写入接口管理密码校验。 |
| `server/middleware/writeQueue.js` | `/api` 请求单进程串行队列，降低 JSON 并发覆盖风险。 |
| `server/data/photoStore.js` | 照片元数据读写、规范化、排序、缩略图路径。 |
| `server/data/groupStore.js` | 分组数据读写、封面修正、照片同步。 |
| `server/data/storyStore.js` | 故事数据读写、ID、规范化、条目排序。 |
| `server/services/thumbnailService.js` | 缩略图生成、补齐和持久化。 |

## 脚本模块

| 脚本 | 职责 |
| --- | --- |
| `scripts/healthcheck.js` | 检查已运行服务的健康状态。 |
| `scripts/smoke-test.js` | 使用临时数据目录执行服务冒烟验证。 |
| `scripts/audit-data.js` | 检查图片文件与 JSON 元数据一致性。 |
| `scripts/backup-data.js` | 备份上传目录和核心 JSON 数据。 |

## 模块边界

- 前端只通过 `js/api.js` 访问后端接口。
- 后端路由不应直接把未规范化的数据写入 JSON。
- 数据文件结构调整必须先更新 `server/data/*Store.js` 的 normalize 函数。
- 缩略图逻辑集中在 `thumbnailService`，不要在多个路由里复制生成逻辑。
