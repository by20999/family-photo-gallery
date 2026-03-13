# 网站项目速查

项目路径：`d:\code\网站项目`
详细文档：见 [website-project.md](website-project.md)

## 文件结构
- `index.html` — 页面结构
- `style.css` — 所有样式（含响应式）
- `script.js` — 前端逻辑
- `server.js` — Express 后端，端口 3000
- `uploads/` — 图片存储目录
- `photo-data.json` — 点赞/评论/表情数据持久化

## 关键配置
- 删除密码：`process.env.DELETE_PASSWORD || '123456'`
- 图片压缩：maxSize=2560px，quality=0.92
- 上传限制：10MB，仅图片
- 部署平台：Railway（支持 RAILWAY_VOLUME_MOUNT_PATH）
