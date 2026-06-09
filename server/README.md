# `server/` 后端模块说明

本目录保存 Express 后端的配置、路由、数据读写和服务逻辑。

## 目录结构

| 路径 | 作用 |
| --- | --- |
| `config.js` | 环境变量、路径、数据文件、目录初始化。 |
| `routes/` | HTTP API 路由。 |
| `middleware/` | API 鉴权和请求队列等 Express 中间件。 |
| `data/` | JSON 数据读写和规范化。 |
| `services/` | 复用服务，目前主要是缩略图生成。 |

## 启动入口

真正的应用入口在根目录 `server.js`。它会：

- 创建 Express app。
- 托管项目静态文件。
- 托管 `/uploads` 和 `/thumbnails`。
- 解析 JSON 请求体。
- 挂载照片、分组、故事和系统状态路由。

## 配置

`config.js` 导出：

- `projectRoot`
- `PORT`
- `DELETE_PASSWORD`
- `uploadDir`
- `thumbsDir`
- `dataDir`
- `dataFile`
- `groupDataFile`
- `storyDataFile`
- `UPLOAD_CACHE_MAX_AGE`

设置 `RAILWAY_VOLUME_MOUNT_PATH` 后，上传目录和数据文件会转移到该持久化目录。

## 修改约束

- 路由层不直接维护复杂数据格式，新增字段要先更新 `data/` normalize 函数。
- 写 JSON 文件时继续使用临时文件 + rename。
- 文件删除和重命名必须考虑失败回滚。
- 新增 API 时同步更新 `docs/api.md`。
- 新增数据字段时同步更新 `docs/data-model.md`。
