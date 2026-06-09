# 部署与运维

## 本地运行

Windows 本地推荐：

```text
start-local.bat
```

脚本行为：

- 自动进入项目根目录。
- 如果没有 `node_modules/`，自动执行 `npm install`。
- 显示本地启动面板，可选择启动网站、检查数据、打开 `uploads/`、查看管理密码。
- 默认使用 `PORT=3000`，端口占用时自动尝试后续端口。
- 默认使用 `DELETE_PASSWORD=by-2099`，仅适合本地开发。
- 选择启动网站后自动打开浏览器。
- 在当前窗口显示服务日志，按 `Ctrl+C` 停止。

也可以使用 PowerShell 传参：

```powershell
.\scripts\start-local.ps1 -Port 3100 -AdminPassword "your-local-password"
```

手动运行：

```bash
npm install
npm start
```

访问：

```text
http://localhost:3000
```

服务启动后可以执行：

```bash
npm run healthcheck
```

健康检查会访问 `/healthz`、首页、`/api/photos` 和 `/api/stories`。

网页右上区域的“系统状态”按钮会访问 `/api/system/health`，用于查看照片数量、缩略图数量、元数据数量、丢图情况、孤儿缩略图和重复照片组。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `PORT` | 否 | 服务端口，默认 `3000`。 |
| `DELETE_PASSWORD` | 生产必填 | `/api` 写入接口管理密码。 |
| `RAILWAY_VOLUME_MOUNT_PATH` | 视部署环境而定 | 持久化 Volume 路径。 |

当 `NODE_ENV=production` 时，服务会拒绝使用默认 `DELETE_PASSWORD=by-2099` 启动。

## Railway 部署建议

1. 创建 Node.js 服务。
2. 添加持久化 Volume。
3. 设置 `RAILWAY_VOLUME_MOUNT_PATH` 指向 Volume 挂载目录，例如 `/data`。
4. 设置强密码 `DELETE_PASSWORD`。
5. 启动命令使用：

```bash
npm start
```

## 数据备份

最少需要备份：

- `uploads/`
- `photo-data.json`
- `group-data.json`
- `story-data.json`

如果使用 Volume，则备份 Volume 下的同名内容。

当前已有本地备份脚本：

```bash
npm run backup:data
```

脚本会把核心 JSON 文件和 `uploads/` 复制到 `backups/backup-<时间戳>/`。`backups/` 默认被 `.gitignore` 忽略，不应提交到仓库。

## 数据体检

上线前执行：

```bash
npm run audit:data
```

它会检查：

- `photo-data.json` 中的照片是否都有对应原图。
- 原图是否都有元数据。
- 故事条目引用的照片是否存在。
- 是否存在无法解析的 JSON 文件。

当前工作区旧照片元数据已按确认清空，`npm run audit:data` 应保持通过。后续上传新照片后，如该命令失败，应先查看网页“系统状态”面板或命令输出，再决定是否恢复文件或清理元数据。

## 冒烟验证

```bash
npm run test:smoke
```

脚本会临时启动服务并验证：

- 首页和核心 API 可访问。
- `/package.json`、`/photo-data.json` 等敏感文件不会被静态暴露。
- 非法照片 ID 会被拒绝。

## 恢复原则

1. 停止服务。
2. 恢复图片目录。
3. 恢复 JSON 数据文件。
4. 启动服务。
5. 打开 `/api/photos` 和 `/api/stories` 检查数据。

## 运维检查

- 上传目录是否可写。
- 缩略图目录是否可写。
- JSON 文件是否可读写。
- 磁盘空间是否充足。
- `DELETE_PASSWORD` 是否已覆盖默认值。
- `npm run audit:data` 是否通过。
- `npm run test:smoke` 是否通过。

## 已知限制

- 不建议多实例同时写入同一组 JSON 文件。
- 不建议把临时文件系统当作生产存储。
- 没有内置定时备份。
- 没有日志聚合和错误监控。
