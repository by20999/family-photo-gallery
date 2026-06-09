# 测试策略

当前项目已有基础冒烟测试脚本 `npm run test:smoke`，但还缺少系统化测试。建议继续从低成本、高收益的测试开始补齐。

## 第一阶段：后端数据层

覆盖：

- `normalizePhotoEntry`
- `normalizeTags`
- `sortPhotos`
- `normalizeGroupEntry`
- `syncGroupDataWithPhotos`
- `normalizeStoryStore`
- `reorderStoryItems`

目标：确保脏数据、空数据、旧数据不会破坏运行。

## 第二阶段：API smoke test

覆盖：

- `GET /healthz`
- `GET /api/photos`
- `GET /api/stories`
- `POST /api/stories`
- `PATCH /api/stories/:id`
- `DELETE /api/stories/:id`

目标：确保服务能启动，核心接口返回正确 JSON。

当前已有 `npm run test:smoke` 覆盖服务启动、只读 API、敏感文件不暴露和非法照片 ID 拒绝。后续可继续扩展写入接口用例。

当前 `npm run test:smoke` 还会在临时数据目录中验证：

- 未带管理密码的写入请求返回 403。
- 带管理密码创建故事返回 201。
- 上传一张测试图片成功。
- 批量整理接口可更新描述、标签、事件日期和事件名称。
- 重复上传同一张测试图片返回 409。
- `/api/system/health` 可返回系统状态。

## 第三阶段：文件操作集成测试

覆盖：

- 上传图片。
- 生成缩略图。
- 重命名图片。
- 删除图片。
- 分组封面同步。

目标：验证文件系统和 JSON 元数据一致。

## 第四阶段：前端冒烟测试

可使用 Playwright 覆盖：

- 首页打开无控制台错误。
- 上传区域存在。
- 相册列表可渲染。
- 灯箱可打开和关闭。
- 故事流区域可创建故事。

## 建议命令

当前已有：

```json
{
  "scripts": {
    "test:smoke": "node scripts/smoke-test.js"
  }
}
```

未来可继续新增：

```json
{
  "scripts": {
    "test": "node --test",
    "test:e2e": "playwright test"
  }
}
```

新增前需同步更新 `README.md`。
