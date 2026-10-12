# SANZO AI Music

SANZO 是一个音乐创作、语音生成和歌曲再创作网站。当前版本使用浏览器 JavaScript、Node.js、Cloudflare Workers、D1 和 R2；通过 DeepSeek 辅助创作，通过 RunningHub 调用音频与封面工作流。

## 已接入的功能

- **Songs**：ACE-Step-V15-XL、MiniMax Music 和 YUE2；AI 写词、风格润色、歌词翻译、自动曲名、人声与纯音乐设置，以及 BPM、调式和拍号高级选项。
- **ABC**：YUE2 生成 ABC 乐谱和歌曲；导入 ABC、本地简单合成、五线谱和简谱预览、乐谱下载。
- **Speech**：Qwen 音色设计与音色克隆、Index TTS 情绪表达；预设音色和个人语音素材管理。
- **Studio Cover**：解析原曲歌词与 ABC，修改歌词、语言和风格后翻唱，复用已解析的旋律；自动曲名、自动封面、播放及 MP3 下载。
- **Studio Speech**：SeedVC 零样本语音变声。
- **作品与素材**：歌曲、语音和 ABC 工作区，上传素材、统一回收站、专辑管理、单曲发布；封面自动生成、重做、上传和下载。

Sounds / Woosh 和模型训练目前暂未开放。部分 Studio 歌曲变声入口仍为原型，以页面提示为准。

## 本地运行

需要 Node.js 22 或更新版本，以及 npm。

```sh
npm ci
```

将 `.env.example` 复制为 `.env.local`，填写自己的 DeepSeek 和 RunningHub API 密钥。至少配置一个 RunningHub 渠道才能提交对应音频 / 图片任务；云服务费用和可用性由所用服务决定。

```sh
npm run dev
```

打开终端打印的本地地址。开发服务仅监听 `127.0.0.1`，本地 D1 / R2 数据保存在被 Git 忽略的 `.sites-runtime/`，不会读取线上用户数据。

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
- [歌词解析与结构整理](docs/cover-lyrics.md)
- [界面性能说明](PERFORMANCE.md)

接口映射使用项目内记录的工作流节点和应用 ID；第三方应用更新后，应核对参数及输出节点。测试覆盖模拟接口、存储和界面行为，不代表所有云工作流每次都经过真实计费验证。

API 密钥、本地数据库、上传的私人素材、测试结果和部署打包产物均不包含在仓库中。旧版 React / ComfyUI 实现仍可通过 Git 历史查看。

第三方 abcjs 的许可保留在 [abcjs-LICENSE.md](dist/vendor/abcjs-LICENSE.md)。
