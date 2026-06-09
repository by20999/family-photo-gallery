# 数据模型

项目以图片文件 + JSON 元数据为持久化核心。

## 文件位置

本地默认：

```text
uploads/
uploads/thumbnails/
photo-data.json
group-data.json
story-data.json
```

设置 `RAILWAY_VOLUME_MOUNT_PATH` 后：

```text
<volume>/
<volume>/thumbnails/
<volume>/photo-data.json
<volume>/group-data.json
<volume>/story-data.json
```

## `photo-data.json`

顶层是以照片文件名为 key 的对象。

```json
{
  "family-trip.jpg": {
    "likes": 0,
    "comments": [],
    "reactions": {},
    "caption": "海边合照",
    "favorited": false,
    "tags": ["旅行", "家庭"],
    "order": 0,
    "groupName": "暑假",
    "thumbnail": "family-trip.jpg",
    "eventDate": "2026-06-09",
    "eventName": "家庭旅行",
    "contentHash": "sha256...",
    "fileSize": 123456
  }
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `likes` | number | 历史点赞计数。 |
| `comments` | array | 评论列表。 |
| `reactions` | object | 表情回应计数。 |
| `caption` | string | 照片描述。 |
| `favorited` | boolean | 是否收藏。 |
| `tags` | string[] | 标签。 |
| `order` | number/null | 手动排序值。 |
| `groupName` | string | 所属分组名。 |
| `thumbnail` | string | 缩略图文件名。 |
| `eventDate` | string | 用户整理时填写的事件日期，格式为 `YYYY-MM-DD`。 |
| `eventName` | string | 用户整理时填写的事件名称。 |
| `contentHash` | string | 上传时计算的图片内容 hash，用于重复检测。 |
| `fileSize` | number | 上传文件大小，单位字节。 |

评论结构：

```json
{
  "id": "timestamp-random",
  "text": "评论内容",
  "author": "昵称",
  "time": "2026-06-09T00:00:00.000Z"
}
```

## `group-data.json`

顶层是以分组名为 key 的对象。

```json
{
  "春节": {
    "coverPhotoId": "new-year.jpg"
  }
}
```

分组成员关系不存储在 `group-data.json`，而是存储在每张照片的 `groupName` 字段中。`group-data.json` 只保存分组扩展信息。

## `story-data.json`

```json
{
  "stories": [
    {
      "id": "story-xxx",
      "name": "一次旅行",
      "description": "短描述",
      "content": "长文本内容",
      "createdAt": "2026-06-09T00:00:00.000Z",
      "updatedAt": "2026-06-09T00:00:00.000Z",
      "items": [
        {
          "id": "story-item-xxx",
          "photoId": "family-trip.jpg",
          "position": 0,
          "curveOffset": 0.18,
          "note": "",
          "sourceType": "photo",
          "sourceGroupName": "",
          "createdAt": "2026-06-09T00:00:00.000Z"
        }
      ]
    }
  ]
}
```

故事条目字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 故事条目 ID。 |
| `photoId` | string | 对应照片文件名。 |
| `position` | number | 故事内排序位置。 |
| `curveOffset` | number | 时间线曲线偏移，范围 `-1` 到 `1`。 |
| `note` | string | 条目备注，当前预留。 |
| `sourceType` | string | `photo` 或 `group`。 |
| `sourceGroupName` | string | 来源分组名。 |
| `createdAt` | string | 创建时间。 |

## 数据一致性规则

- 照片文件名是照片 ID。
- 删除照片时必须同步删除 `photo-data.json` 中对应记录。
- 重命名照片时必须同步缩略图、分组封面和元数据 key。
- 分组列表由照片元数据反推，空分组不会长期保留。
- 故事条目引用不存在的照片时，接口响应会过滤掉该条目对应的照片展示数据。
- 修改数据模型必须先更新 normalize 函数，再更新文档。
