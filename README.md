# SANZO AI Music

SANZO 是一个音乐创作、语音生成和歌曲再创作网站。当前版本使用浏览器 JavaScript、Node.js、Cloudflare Workers、D1 和 R2；通过 DeepSeek 辅助创作，通过 RunningHub 调用音频与封面工作流。

## 已接入的功能

- **Songs**：ACE-Step-V15-XL、MiniMax Music 和 YUE2；AI 写词、风格润色、歌词翻译、自动曲名、人声与纯音乐设置，以及 BPM、调式和拍号高级选项。
- **ABC**：YUE2 生成 ABC 乐谱和歌曲；导入 ABC、本地简单合成、五线谱和简谱预览、乐谱下载。
- **Speech**：Qwen 音色设计与音色克隆、Index TTS 情绪表达；预设音色和个人语音素材管理。
- **Studio Cover**：解析原曲歌词与 ABC，修改歌词、语言和风格后翻唱，复用已解析的旋律；自动曲名、自动封面、底部播放器、双击播放、拖入统一回收站及 MP3 下载。
- **Studio SeedVC**：Speech 语音和 Songs 歌曲零样本变声；选择预设或个人音色，歌曲保留原音高和伴奏，输出 MP3。
- **作品与素材**：歌曲、语音和 ABC 工作区，统一管理上传和生成的音乐、语音及 ABC，跨页面同步回收站、恢复与一键清空；专辑管理、单曲发布；封面自动生成、重做、上传和下载。

Sounds / Woosh 和模型训练目前暂未开放。Studio 的 Cover、Speech 和 Songs 均已接入对应工作流。

## 命令行 CLI

网站功能也可通过 `sanzo` 命令使用，支持自托管账号登录、托管站点 Cookie、歌曲与 ABC 生成、语音设计与克隆、Studio、任务等待与下载、素材与回收站、工作区、专辑、封面、发布和管理员诊断。CLI 无第三方运行时依赖，需要 Node.js 24 或更高版本。

```sh
# 从 GitHub 安装固定版本
npm install -g 'git+https://github.com/Bandukids/sanzo-music.git#sanzo-cli-v0.1.0'
sanzo config set-url http://127.0.0.1:4173
sanzo auth login --email you@example.com
sanzo songs create --styles 'warm piano pop' --lyrics @lyrics.txt --wait
sanzo --help
```

已有源码时可运行 `npm run cli -- --help`，或 `npm install -g ./cli`。也可安装 [GitHub Release](https://github.com/Bandukids/sanzo-music/releases/tag/sanzo-cli-v0.1.0) 中的独立 `.tgz`。完整命令、自动化用法及功能范围见 [CLI 文档](cli/README.md)。

## 本地运行

在 Mac / Docker / NAS 上运行受邀制站点，请先阅读 [独立部署说明](docs/self-hosting.md)。Node 服务已改为真实账号、原生 SQLite 和媒体目录，不再自动登录共享开发账号。首次运行需执行 `npm run setup:selfhost -- --email 管理员邮箱 --media 媒体绝对路径`。

需要 Node.js 24 和 npm。

```sh
npm ci
```

将 `.env.example` 复制为 `.env.local`，填写自己的 DeepSeek 和 RunningHub API 密钥。至少配置一个 RunningHub 渠道才能提交对应音频 / 图片任务；云服务费用和可用性由所用服务决定。

```sh
npm run dev
```

打开终端打印的本地地址，使用一次性邀请设置密码后登录。服务默认仅监听 `127.0.0.1`，原生 SQLite 默认保存在被 Git 忽略的 `.sanzo-data/`，媒体位置由 `MEDIA_ROOT` 指定。旧 `.sites-runtime/` 开发数据保留，不会读取原网站线上用户数据。

```sh
npm test
npm run build
npm run preview
```

## 项目结构

| 目录 | 用途 |
| --- | --- |
| `dist/` | 前端页面、脚本、样式和公共资源源码 |
| `server/` | AI、生成任务、封面、素材与存储服务 |
| `worker/index.js` | 生产 Worker 入口 |
| `db/`、`drizzle/` | 数据库定义与迁移 |
| `tests/` | 单元和模拟 API 集成测试 |
| `docs/` | Studio 工作流与接入说明 |

## 部署与身份

构建产物位于 `dist/client` 和 `dist/server`。生产服务需要 D1 绑定 `DB`、R2 绑定 `BUCKET` 和前端静态资源绑定 `ASSETS`；API 密钥只配置在服务端。

当前生产鉴权依赖 Sites 提供的可信登录身份。部署到其他平台时，应先接入等效的身份验证，不能直接信任外部请求传入的身份头。本仓库没有独立的默认管理员密码或密码注册功能。

`.openai/hosting.json` 仅保留通用存储绑定，未包含原网站的项目标识。新建 Sites 项目后需填入自己的 project_id，再按对应托管流程发布；已有数据库应保留迁移历史。

## 工作流与补充说明

- [RunningHub 接入与任务调度](RUNNINGHUB.md)
- [单曲与专辑封面](COVERS.md)
- [Studio 翻唱](docs/studio-cover.md)
- [Studio 语音与歌曲变声](docs/studio-seedvc.md)
- [统一素材管理与回收站](docs/material-management.md)
- [歌词解析与结构整理](docs/cover-lyrics.md)
- [界面性能说明](PERFORMANCE.md)

接口映射使用项目内记录的工作流节点和应用 ID；第三方应用更新后，应核对参数及输出节点。测试覆盖模拟接口、存储和界面行为，不代表所有云工作流每次都经过真实计费验证。

API 密钥、本地数据库、上传的私人素材、测试结果和部署打包产物均不包含在仓库中。旧版 React / ComfyUI 实现仍可通过 Git 历史查看。

第三方 abcjs 的许可保留在 [abcjs-LICENSE.md](dist/vendor/abcjs-LICENSE.md)。
