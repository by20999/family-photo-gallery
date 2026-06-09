# 家庭共享相册

`family-photo-gallery` 是一个面向家庭、朋友或小团队的轻量相册网站。项目使用原生前端和 Express 后端实现照片上传、浏览、分组、评论、表情回应、收藏、故事流和缩略图生成。

## 快速开始

Windows 本地推荐直接双击：

```text
start-local.bat
```

脚本会自动检查依赖、安装 `node_modules`、选择可用端口、打开浏览器并启动服务。默认访问地址通常是：

```text
http://localhost:3000
```

如需手动运行：

```bash
npm install
npm start
```

停止服务：回到启动窗口按 `Ctrl+C`。

默认本地管理密码为：

```text
by-2099
```

上传、删除、编辑、创建故事等写入操作会要求输入管理密码。

## 核心能力

- 照片上传：支持多图上传、拖拽上传、本地预览和前端压缩。
- 相册浏览：支持网格、时间线、灯箱、键盘切换、移动端手势和懒加载。
- 照片整理：支持描述模板、事件日期、事件名称、标签、分组、收藏、搜索、排序和批量操作。
- 数据健康：网页内可查看照片数、缩略图数、丢图检查和重复照片组。
- 重复检测：上传时按图片内容 hash 跳过重复照片。
- 家庭互动：支持昵称、评论、表情回应和照片故事说明。
- 故事流：支持创建故事、加入照片或分组、拖拽布局、保存长文本内容。
- 主题外观：支持明暗模式、渐变背景和主题包。
- 本地持久化：图片保存在文件目录，元数据保存在 JSON 文件。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | HTML、CSS、原生 JavaScript ES Modules |
| 后端 | Node.js、Express |
| 上传 | multer |
| 缩略图 | sharp |
| 存储 | 文件系统、JSON |

## 目录导览

| 路径 | 作用 |
| --- | --- |
| `index.html` | 单页应用 HTML 结构。 |
| `style.css` | 全局样式、响应式布局、主题和组件视觉。 |
| `js/` | 前端业务模块。 |
| `server.js` | Express 应用入口。 |
| `server/` | 后端配置、路由、数据读写和服务。 |
| `uploads/` | 原图和本地缩略图目录。 |
| `photo-data.json` | 照片元数据。 |
| `group-data.json` | 分组扩展数据。 |
| `story-data.json` | 故事流数据。 |
| `docs/` | 项目专题文档。 |
| `memory/` | 项目日志和长期记忆区。 |
| `AGENTS.md` | AI Agent 和自动化协作规范。 |

## 重要命令

```bash
npm start
npm run healthcheck
npm run test:smoke
npm run audit:data
npm run backup:data
```

- `npm start`：启动相册服务。
- `start-local.bat`：Windows 本地启动面板，可启动网站、检查数据、打开 `uploads/`、查看管理密码。
- `npm run healthcheck`：检查已运行服务的 `/healthz`、首页和核心只读 API。
- `npm run test:smoke`：临时启动服务并验证首页、API 和敏感文件不可被静态访问。
- `npm run audit:data`：检查图片文件、缩略图、JSON 元数据和故事引用是否一致。
- `npm run backup:data`：备份 `uploads/` 与核心 JSON 数据到本地 `backups/` 目录。

新增测试前请先阅读 [测试策略](./docs/testing-strategy.md)。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | HTTP 服务端口。 |
| `DELETE_PASSWORD` | `by-2099` | 写入接口管理密码。生产环境必须覆盖，且 `NODE_ENV=production` 时不能使用默认值。 |
| `RAILWAY_VOLUME_MOUNT_PATH` | 空 | Railway 等平台的持久化 Volume 根目录。 |

所有 `/api` 下的写入请求（`POST`、`PUT`、`PATCH`、`DELETE`）都需要管理密码。前端会在首次写入操作时提示输入，并在当前浏览器会话中临时缓存。

## 推荐阅读顺序

1. [项目总览](./docs/project-overview.md)
2. [架构说明](./docs/architecture.md)
3. [模块职责](./docs/module-map.md)
4. [开发约束](./docs/development-constraints.md)
5. [API 文档](./docs/api.md)
6. [数据模型](./docs/data-model.md)
7. [项目计划](./docs/project-plan.md)

## 当前状态

项目处于个人/小团队可用阶段：核心功能较完整，已具备基础写入鉴权、单进程 API 队列、健康检查、冒烟测试、数据体检和本地备份脚本。旧相册数据已按确认清空，当前可作为干净的新相册基线继续开发；上线前仍建议清理剩余历史乱码文本，并补充更系统的测试与运维能力。详见 [项目改进](./docs/improvements.md) 与 [后续方向](./docs/roadmap.md)。
