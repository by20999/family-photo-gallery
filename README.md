# 家庭共享相册

一个轻量的家庭相册网站，支持上传、浏览、评论、表情回应和图片编辑。

## 功能

- 上传图片（多选，自动压缩到 1920px 以内）
- 相册网格展示，一行四张，懒加载
- 点击图片全屏预览
- 图片滤镜（黑白、复古、鲜艳等）
- 图片调整（亮度、对比度、饱和度、模糊）
- 表情回应（❤️ 😂 😮 😢 👍）
- 评论系统，只能删除自己的评论
- 昵称系统，首次访问设置昵称，左上角显示
- 深色/浅色模式切换
- 自定义背景渐变色
- 删除图片需要密码保护

## 本地运行

```bash
npm install
npm start
```

访问 http://localhost:3000

## 部署到 Railway（推荐）

1. 将代码推送到 GitHub：
   ```bash
   git add .
   git commit -m "your message"
   git push origin main
   ```

2. 打开 [railway.app](https://railway.app)，新建项目，选择 "Deploy from GitHub repo"，连接你的仓库

3. 添加 Volume（持久化存储，否则重启后图片丢失）：
   - 进入项目 → Add Service → Volume
   - Mount Path 填写 `/data`
   - 在服务的 Variables 里添加：`RAILWAY_VOLUME_MOUNT_PATH` = `/data`

4. 设置环境变量（Variables 页面）：
   - `DELETE_PASSWORD` = 你的删除密码（默认 `by-2099`）
   - `PORT` = `3000`（Railway 会自动注入，可不填）

5. 部署完成后 Railway 会分配一个 `.railway.app` 域名，也可以绑定自定义域名

## 更新部署

每次修改代码后，推送到 GitHub 即可自动触发重新部署：

```bash
git add index.html script.js style.css server.js
git commit -m "描述你的修改"
git push origin main
```

## 局域网分享

不想部署到云端的话，启动本地服务器后：

- Windows：命令行运行 `ipconfig`，找到 IPv4 地址
- 让家人访问 `http://你的IP:3000`，例如 `http://192.168.1.100:3000`

## 注意事项

- 图片和数据保存在 `uploads/` 和 `photo-data.json`（本地）或 Volume 挂载目录（Railway）
- 单张图片最大 10MB，一次最多上传 10 张
- 昵称存在浏览器 localStorage，换设备需要重新设置
- 删除密码通过环境变量 `DELETE_PASSWORD` 配置

