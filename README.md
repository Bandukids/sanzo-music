# Sanzo Music (三生幻域智能音乐工坊)

Sanzo Music 是一个集成了大语言模型（LLM）、本地 GPU 算力以及云端 WebAPI 分流的高可用智能音乐与专辑封面生成工坊。支持根据用户输入的情绪或故事描述，一键撰写歌词、润色参数，并渲染音频和精美的专辑配图。

---

## 🌟 核心特性

1. **大模型智能润色**：集成 LLM（DeepSeek / 本地大模型），可将用户的极简情绪描述自动扩写为包含情绪起伏的排版歌词、风格标签、推荐 BPM 以及和弦走向。
2. **本地与云端双轨分流 (高可用并发控制)**：
   * **本地优先**：默认使用本机 GPU 算力（通过 Python 驱动本地 ComfyUI 渲染管线），节约云端 API 额度。
   * **云端溢出分流**：当检测到本地有并发任务处于排队或执行状态时，系统自动无缝将后续任务分流至 **RunningHub** 运行。
   * **云端多平台灾备**：云端分流时优先调度国内站 `RunningHub.cn`，若额度耗尽或发生故障，自动向下 fallback 调用国际站 `RunningHub.ai`。
3. **灵活的用户认证系统**：
   * 支持免登录**“游客浏览模式”**，游客可以随意参观、试听和切换宝藏库中已有的精彩音乐。
   * 当游客尝试触发“一键润色”、“快速生成”或“声音工坊生成”等算力敏感型操作时，系统会弹出磨砂玻璃科技风的登录/注册卡片，引导用户快速登录。
4. **后台管理中心 (仅管理员可见)**：
   * 管理员可通过专用凭证登录（默认管理员账户：`admin` / 密码：`admin_sanzo_2026`）。
   * **用户账号管理**：展示所有注册用户，支持删除普通账号（带超级管理员安全防删自锁）。
   * **音乐生成数据库**：对所有用户生成的歌曲进行物理归档（包括封面、创作者、生成时间和具体的算力源分类归档），支持记录删除。
5. **体验优化**：
   * 屏蔽了 Vite 对于数据库文件 (`tracks.json`, `users.json`) 以及媒体文件夹 (`output_music/`) 的热更新（HMR）监听，生成结束后**绝不会引起网页刷新重载**，实现无感生成与就地播放。

---

## 📁 目录结构

* `server.ts` - 基于 Express 的 Node.js 后端服务器，提供用户系统接口、分流决策控制器及 ComfyUI websocket 任务管道。
* `src/` - React 前端核心代码（基于 Vite + TypeScript + TailwindCSS 搭建）。
* `generate_music_api.py` - 本地 Python 驱动脚本，负责向 ComfyUI 发送节点数据并渲染音频。
* `generate_text2img_api.py` - 本地 Python 驱动脚本，负责调用 ComfyUI 渲染专辑封面图片。
* `users.json` / `tracks.json` - 本地持久化 JSON 数据库，用来物理存储用户表与歌曲生成历史表。
* `output_music/` - 本地 ComfyUI 渲染生成的音频和封面文件的输出存放目录。

---

## 🚀 快速启动指南

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
在项目根目录下创建 `.env` 文件，并根据您的实际配置填入参数：
```ini
# 服务端口
PORT=3001

# 本地并发限制 (超过该值则自动向云端分流)
MAX_LOCAL_CONCURRENCY=1

# 云端 RunningHub 配置 (CN 优先，AI 为灾备备用)
RUNNINGHUB_BASE_URL=https://www.runninghub.cn
RUNNINGHUB_CN_API_KEY=你的中文站API_KEY
RUNNINGHUB_CN_APP_ID=音乐生成APP_ID
RUNNINGHUB_CN_COVER_APP_ID=画图APP_ID

RUNNINGHUB_AI_API_KEY=你的国际站API_KEY
RUNNINGHUB_AI_APP_ID=音乐生成APP_ID
RUNNINGHUB_AI_COVER_APP_ID=画图APP_ID
```

### 3. 运行服务
* **开发环境**：
  ```bash
  npm run dev      # 启动前端页面 (localhost:3000)
  npm run server   # 启动后端 API 服务 (localhost:3001)
  ```

* **Systemd 后台服务管理（已在宿主机部署）**：
  系统已配置了 Systemd 用户级服务，您可以使用以下简易别名在任意目录下管理服务：
  * `startsanzo` - 一键启动服务
  * `stopsanzo` - 一键关闭服务
  * `restartsanzo` - 一键重启服务
  * `logssanzo` - 实时滚动查看服务控制台运行日志

---

## 🐙 Git 代码版本管理教程

为了方便您后续维护和迭代代码，推荐使用 `Git` 进行代码版本控制：

### 1. 初始化本地仓库 (首次使用)
在项目根目录 `/home1/wuzi/Sanzo Music` 下运行：
```bash
# 初始化 git 仓库
git init

# 配置您的提交用户名和邮箱 (建议全局配置)
git config --global user.name "你的名字"
git config --global user.email "你的邮箱@example.com"
```
*(项目已为您建立好了 `.gitignore` 文件，`node_modules/`、`.env` 密钥文件及生成的音视频媒体文件均不会被提交到 git 中。)*

### 2. 日常开发提交流程
当您修改了代码后，可以运行以下命令提交到本地仓库中：
```bash
# 1. 查看有哪些文件发生了修改
git status

# 2. 将修改过的文件添加到暂存区 ( . 代表当前目录下所有改动)
git add .

# 3. 提交修改并写下改动说明 (Commit Message)
git commit -m "feat: 新增用户系统与歌曲管理数据库"
```

### 3. 推送到远程仓库 (例如 GitHub / Gitee)
如果您在 GitHub 上创建了空的远程仓库：
```bash
# 关联远程仓库地址 (仅需在首次推送时关联一次)
git remote add origin https://github.com/你的用户名/你的仓库名.git

# 推送代码到远程主分支
git branch -M main
git push -u origin main
```
以后每次执行完 `git commit` 后，只需在终端输入：
```bash
git push
```
即可将代码同步到云端仓库。
