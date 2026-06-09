# `scripts/` 运维与验证脚本说明

本目录保存项目本地验证、数据体检和备份脚本。脚本应保持轻量、可读、无外部服务依赖，方便在本地开发机或后续服务器上直接执行。

## 脚本清单

| 文件 | npm 命令 | 作用 |
| --- | --- | --- |
| `healthcheck.js` | `npm run healthcheck` | 检查已运行服务的 `/healthz`、首页和核心只读 API。 |
| `start-local.ps1` | `start-local.bat` | Windows 本地启动面板，可启动网站、检查数据、打开 `uploads/`、查看管理密码。 |
| `smoke-test.js` | `npm run test:smoke` | 使用临时数据目录启动服务，验证首页、API、静态暴露边界和写入鉴权。 |
| `audit-data.js` | `npm run audit:data` | 检查图片文件、缩略图、JSON 元数据和故事引用是否一致。 |
| `backup-data.js` | `npm run backup:data` | 备份 `uploads/` 与核心 JSON 数据到本地 `backups/`。 |

## 维护约束

- 脚本不能删除真实用户数据，除非命令名和文档明确说明且用户确认。
- 测试类脚本优先使用临时目录，避免污染当前工作区。
- 新增脚本后必须同步更新 `package.json`、`README.md` 和 `docs/deployment-operations.md`。
- 输出应简洁明确，失败时返回非 0 退出码。
