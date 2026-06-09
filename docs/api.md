# API 文档

所有接口默认挂载在同一个 Express 服务中，前端使用相对路径访问。

## 鉴权规则

- `GET` 请求默认公开，用于浏览相册、故事和静态资源。
- `/api` 下的写入请求（`POST`、`PUT`、`PATCH`、`DELETE`）必须提供管理密码。
- 推荐通过请求头传递：

```http
X-Admin-Password: <DELETE_PASSWORD>
```

- 历史删除接口仍兼容请求体中的 `password` 字段，但新代码应优先使用请求头。
- 管理密码来自环境变量 `DELETE_PASSWORD`。默认值仅适合本地开发，生产环境必须覆盖。

## 健康检查

### `GET /healthz`

返回服务存活状态。

```json
{
  "ok": true,
  "service": "family-photo-gallery"
}
```

### `GET /api/system/health`

返回网页“系统状态”面板使用的数据，包含照片数量、缩略图数量、元数据数量、丢图检查、孤儿缩略图检查和重复照片组数量。

主要响应字段：

- `counts.photos`
- `counts.thumbnails`
- `counts.metadata`
- `counts.duplicateGroups`
- `issues.missingFilesForMetadata`
- `issues.missingMetadataForFiles`
- `issues.orphanThumbnails`
- `duplicates`

### `POST /api/system/open-uploads`

本地辅助接口，用系统文件管理器打开 `uploads/` 目录。该接口属于写入类辅助操作，需要管理密码。

## 照片

### `GET /api/photos`

返回所有照片列表，按手动顺序和上传时间排序。

响应字段包括：

- `id`
- `src`
- `thumbSrc`
- `name`
- `uploadTime`
- `likes`
- `commentsCount`
- `reactions`
- `caption`
- `favorited`
- `tags`
- `order`
- `groupName`
- `groupCoverPhotoId`
- `eventDate`
- `eventName`
- `duplicateKey`

### `GET /api/photos/:id`

返回单张照片详情，包含完整评论列表、事件信息和重复检测 key。

### `POST /api/upload`

上传照片。

请求类型：`multipart/form-data`

字段：

- `photos`：图片文件数组，最多 10 张。
- `caption`：可选描述。
- `tags`：可选标签。
- `groupName`：可选分组。
- `eventDate`：可选事件日期，格式为 `YYYY-MM-DD`。
- `eventName`：可选事件名称，例如“春节”“生日”“旅行”。

限制：

- 单张文件最大 10MB。
- 后端只接受图片 MIME 类型。
- 后端会计算图片内容 hash；如果检测到重复图片，会跳过重复文件并在响应 `duplicates` 中返回说明。

### `PATCH /api/photos/:id`

更新照片信息或重命名。

请求 JSON：

```json
{
  "caption": "照片描述",
  "tags": ["旅行", "家庭"],
  "renameTo": "新的文件名",
  "eventDate": "2026-06-09",
  "eventName": "家庭旅行"
}
```

字段均可选，但至少提供一个。

### `PATCH /api/photos/:id/favorite`

更新收藏状态。

```json
{
  "favorited": true
}
```

### `PATCH /api/photos/batch/caption`

批量更新描述。该接口保留兼容；新代码建议优先使用 `/api/photos/batch/details`。

```json
{
  "photoIds": ["a.jpg", "b.jpg"],
  "caption": "统一描述"
}
```

### `PATCH /api/photos/batch/details`

批量整理照片信息，可一次性设置描述、标签、事件日期和事件名称。

```json
{
  "photoIds": ["a.jpg", "b.jpg"],
  "caption": "统一描述",
  "tags": ["家庭", "旅行"],
  "eventDate": "2026-06-09",
  "eventName": "家庭旅行"
}
```

字段均可选，但至少提供一个整理字段。留空字符串会清除对应字段。

### `POST /api/photos/reorder`

保存手动排序。

```json
{
  "orderedIds": ["a.jpg", "b.jpg"]
}
```

要求 `orderedIds` 覆盖所有现有照片，不能重复。

### `DELETE /api/photos/:id`

删除照片及缩略图。

```json
{
  "password": "删除密码"
}
```

也可使用 `X-Admin-Password` 请求头传递管理密码。

### `POST /api/photos/:id/like`

历史点赞接口。当前前端主要使用表情回应。

### `POST /api/photos/:id/react`

添加表情回应。

```json
{
  "emoji": "❤️"
}
```

### `POST /api/photos/:id/comment`

添加评论。

```json
{
  "text": "评论内容",
  "author": "昵称"
}
```

### `DELETE /api/photos/:photoId/comment/:commentId`

删除评论。目前没有额外密码校验。

## 分组

### `POST /api/groups`

创建分组或把照片加入分组。

```json
{
  "name": "春节",
  "photoIds": ["a.jpg", "b.jpg"]
}
```

### `PATCH /api/groups/:name`

重命名分组。

```json
{
  "name": "新的分组名"
}
```

### `PATCH /api/groups/:name/cover`

设置分组封面。

```json
{
  "photoId": "a.jpg"
}
```

### `DELETE /api/groups/:name`

删除分组关系，不删除照片文件。

```json
{
  "password": "删除密码"
}
```

也可使用 `X-Admin-Password` 请求头传递管理密码。

## 故事

### `GET /api/stories`

返回故事列表。每个故事条目会附带对应照片信息。

### `POST /api/stories`

创建故事。

```json
{
  "name": "一次旅行"
}
```

### `PATCH /api/stories/:id`

更新故事名称、描述或正文。

```json
{
  "name": "新的故事名",
  "description": "短描述",
  "content": "长文本内容"
}
```

### `DELETE /api/stories/:id`

删除故事，不删除照片。

### `POST /api/stories/:id/items`

向故事中添加照片。

```json
{
  "photoIds": ["a.jpg", "b.jpg"],
  "sourceType": "group",
  "sourceGroupName": "春节"
}
```

`sourceType` 可为 `photo` 或 `group`。

### `PATCH /api/stories/:id/items/layout`

保存故事条目顺序和曲线偏移。

```json
{
  "items": [
    {
      "id": "story-item-xxx",
      "position": 0,
      "curveOffset": 0.18
    }
  ]
}
```

### `DELETE /api/stories/:id/items/:itemId`

从故事中移除一个条目，不删除照片。

## 错误格式

接口失败时通常返回：

```json
{
  "error": "错误说明"
}
```
